import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type LidarProfile,
  type NoiseProfile,
  Pose2D,
  type Simulation,
  type SimulationSource,
  type World,
  normalizeAngle,
} from "@garage/sim-core";
import type { ClientMessage, MissionStateName, ServerMessage, StateMessage, TestRouteResult, TwistJson } from "@garage/gui-protocol";
import type { PlcBridge } from "./PlcBridge";
import { GyroCalibration } from "./GyroCalibration";
import { TestRoute, spinRoute } from "./TestRoute";

export interface RobotServerOptions {
  port: number;
  guiHtmlPath: string;
  world: World;
  simulation: Simulation;
  source: SimulationSource;
  noiseProfiles: Record<string, NoiseProfile>;
  lidarProfiles: Record<string, LidarProfile>;
  plc: PlcBridge | null;
  /** Standalone mode: where manual driving from the GUI goes when there is no PLC. */
  setManualTwist: (twist: TwistJson) => void;
}

const STATE_INTERVAL_IN_MS = 33;
const TEST_ROUTE_INTERVAL_IN_MS = 20;
const TEST_ROUTE_SAMPLE_IN_S = 0.25;
const STOPPED: TwistJson = { forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 };

interface TestRouteRun {
  kind: "testRoute" | "gyroCalibration";
  route: TestRoute;
  /** Only for the gyro calibration. */
  calibration: GyroCalibration | null;
  startInS: number;
  nextSampleInS: number;
  collisionsAtStart: number;
  lastPose: Pose2D;
  distanceInM: number;
  estimateIds: { id: string; label: string }[];
  rows: string[];
}

/** Serves the GUI over HTTP and keeps every open GUI in sync over WebSocket. */
export class RobotServer {
  private readonly http: Server;
  private readonly sockets = new Set<WebSocket>();
  private noiseId = "realistic";
  private lidarId = "rplidar-s2e";
  private lastScanSequence = 0;
  private testRoute: TestRouteRun | null = null;

  constructor(private readonly options: RobotServerOptions) {
    this.http = createServer(async (request, response) => {
      if (request.url !== "/" && request.url !== "/index.html") {
        response.writeHead(404).end("Ikke funnet");
        return;
      }
      try {
        const html = await readFile(options.guiHtmlPath, "utf8");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html.replace("<body>", "<body>\n<script>window.ROBOT_SERVER = true;</script>"));
      } catch {
        response.writeHead(500).end("Fant ikke GUI-en. Kjør npm run build i sim/ først.");
      }
    });
    if (options.plc) options.plc.onMap = (map) => this.broadcast(map);
    const wss = new WebSocketServer({ server: this.http, path: "/ws" });
    wss.on("connection", (socket) => this.connect(socket));
  }

  listen(): void {
    this.http.listen(this.options.port, () => {
      console.log(`GUI: http://localhost:${this.options.port}`);
    });
    setInterval(() => this.broadcastState(), STATE_INTERVAL_IN_MS);
    setInterval(() => void this.driveTestRoute(), TEST_ROUTE_INTERVAL_IN_MS);
  }

  private connect(socket: WebSocket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("message", (data) => {
      try {
        this.handle(JSON.parse(String(data)) as ClientMessage, socket);
      } catch (error) {
        console.warn(`Ugyldig melding fra GUI: ${(error as Error).message}`);
      }
    });
    this.send(socket, {
      type: "hello",
      mode: this.options.plc ? "plc" : "standalone",
      world: this.options.world.toDefinition(),
      noiseId: this.noiseId,
      lidarId: this.lidarId,
      seed: this.options.simulation.seed,
    });
    const map = this.options.plc?.map;
    if (map) this.send(socket, map);
  }

  private handle(message: ClientMessage, from: WebSocket): void {
    const { simulation, source, plc } = this.options;
    switch (message.type) {
      case "world":
        this.options.world.replace(message.world);
        for (const socket of this.sockets) if (socket !== from) this.send(socket, { type: "world", world: message.world });
        break;
      case "faults":
        simulation.faults.isLidarSignalLost = message.isLidarSignalLost;
        simulation.faults.isGyroFrozen = message.isGyroFrozen;
        break;
      case "condition":
        simulation.setCondition(message.condition);
        break;
      case "kidnap":
        simulation.kidnap(new Pose2D(message.pose.x, message.pose.y, message.pose.thetaInRad));
        break;
      case "noise": {
        const profile = this.options.noiseProfiles[message.id];
        if (profile) {
          this.noiseId = message.id;
          simulation.setNoise(profile);
        }
        break;
      }
      case "lidar": {
        const profile = this.options.lidarProfiles[message.id];
        if (profile) {
          this.lidarId = message.id;
          simulation.setLidarProfile(profile);
        }
        break;
      }
      case "restart":
        source.restart(message.seed);
        void plc?.setPose(simulation.truePose);
        break;
      case "realign":
        source.realign();
        void plc?.setPose(simulation.truePose);
        break;
      case "drive":
        if (!this.testRoute) this.drive(message.twist);
        break;
      case "hmi":
        void plc?.sendHmi(message.code);
        break;
      case "testRoute":
      case "gyroCalibration":
        // One drive at a time: either button stops whichever is running.
        if (this.testRoute) this.cancelTestRoute();
        else this.startTestRoute(message.type);
        break;
    }
  }

  private drive(twist: TwistJson): void {
    const { plc } = this.options;
    if (!plc) this.options.setManualTwist(twist);
    else if (!canDriveByHand(plc.status?.missionState) && isMoving(twist)) void plc.sendHmi("MANUAL_DRIVE", twist);
    else void plc.sendManualTwist(twist);
  }

  // ---- Test route ---------------------------------------------------------

  private startTestRoute(kind: TestRouteRun["kind"]): void {
    const { source, simulation, plc } = this.options;
    source.realign();
    void plc?.setPose(simulation.truePose);
    if (kind === "testRoute") plc?.startLinkLog();
    const route = kind === "testRoute" ? new TestRoute() : new TestRoute(spinRoute());
    const estimateIds = source.view.estimates.map((e) => ({ id: e.id, label: e.label }));
    const header = ["timeInS", "trueX", "trueY", "trueThetaInRad"];
    for (const { id } of estimateIds) header.push(`${id}X`, `${id}Y`, `${id}ThetaInRad`, `${id}ErrorInM`, `${id}HeadingErrorInDeg`);
    this.testRoute = {
      kind,
      route,
      calibration: kind === "gyroCalibration" ? new GyroCalibration() : null,
      startInS: source.view.timeInS,
      nextSampleInS: 0,
      collisionsAtStart: source.collisionCount,
      lastPose: simulation.truePose,
      distanceInM: 0,
      estimateIds,
      rows: [header.join(",")],
    };
    this.broadcast({ type: kind, state: "started", durationInS: route.durationInS });
    const name = kind === "testRoute" ? "Testløype" : "Gyrokalibrering";
    console.log(`${name} startet (${route.durationInS.toFixed(0)} s, støy: ${this.noiseId}).`);
  }

  private cancelTestRoute(): void {
    const kind = this.testRoute?.kind ?? "testRoute";
    this.testRoute = null;
    this.options.plc?.takeLinkLog();
    this.drive(STOPPED);
    this.broadcast({ type: kind, state: "cancelled" });
  }

  private async driveTestRoute(): Promise<void> {
    const run = this.testRoute;
    if (!run) return;
    const { source, simulation } = this.options;
    const elapsedInS = source.view.timeInS - run.startInS;
    if (elapsedInS < 0) {
      // The simulation was restarted under the route.
      this.cancelTestRoute();
      return;
    }
    const truth = simulation.truePose;
    run.distanceInM += truth.distanceTo(run.lastPose);
    run.lastPose = truth;
    run.calibration?.sample(
      elapsedInS,
      truth.thetaInRad,
      source.view.estimates.map((e) => ({ id: e.id, label: e.label, thetaInRad: e.pose.thetaInRad })),
    );
    if (elapsedInS >= run.nextSampleInS) {
      run.nextSampleInS += TEST_ROUTE_SAMPLE_IN_S;
      run.rows.push(this.sampleRow(run, elapsedInS).join(","));
    }
    const twist = run.route.twistAt(elapsedInS);
    if (twist) {
      this.drive(twist);
      return;
    }
    this.testRoute = null;
    this.drive(STOPPED);
    if (run.calibration) this.finishGyroCalibration(run.calibration);
    else await this.finishTestRoute(run, elapsedInS);
  }

  private sampleRow(run: TestRouteRun, elapsedInS: number): string[] {
    const truth = this.options.simulation.truePose;
    const row = [elapsedInS.toFixed(2), fixed(truth.x), fixed(truth.y), fixed(truth.thetaInRad)];
    for (const result of this.errors(run)) {
      const pose = this.options.source.view.estimates.find((e) => e.id === result.id)?.pose;
      row.push(fixed(pose?.x), fixed(pose?.y), fixed(pose?.thetaInRad), fixed(result.positionErrorInM), fixed(result.headingErrorInDeg));
    }
    return row;
  }

  private errors(run: TestRouteRun): TestRouteResult[] {
    const truth = this.options.simulation.truePose;
    const estimates = this.options.source.view.estimates;
    return run.estimateIds.map(({ id, label }) => {
      const pose = estimates.find((e) => e.id === id)?.pose;
      return {
        id,
        label,
        positionErrorInM: pose ? pose.distanceTo(truth) : NaN,
        headingErrorInDeg: pose ? Math.abs(normalizeAngle(pose.thetaInRad - truth.thetaInRad)) * 180 / Math.PI : NaN,
      };
    });
  }

  private finishGyroCalibration(calibration: GyroCalibration): void {
    const results = calibration.results();
    console.log("Gyrokalibrering ferdig. Gang skalaen med:");
    for (const r of results) {
      console.log(`  ${r.label}: ${r.factor.toFixed(4)} (mot klokka ${r.counterClockwiseFactor.toFixed(4)}, med klokka ${r.clockwiseFactor.toFixed(4)})`);
    }
    this.broadcast({ type: "gyroCalibration", state: "done", results });
  }

  private async finishTestRoute(run: TestRouteRun, elapsedInS: number): Promise<void> {
    run.rows.push(this.sampleRow(run, elapsedInS).join(","));
    const results = this.errors(run);
    const collisions = this.options.source.collisionCount - run.collisionsAtStart;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = resolve("runs", `testlop-${this.noiseId}-${stamp}.csv`);
    const linkLog = this.options.plc?.takeLinkLog();
    try {
      await mkdir(resolve("runs"), { recursive: true });
      await writeFile(file, run.rows.join("\n") + "\n");
      // Every simulator step of the PLC link, for finding out how the wheels follow NC.
      if (linkLog) await writeFile(file.replace(/\.csv$/, "-link.csv"), linkLog.join("\n") + "\n");
    } catch (error) {
      console.warn(`Kunne ikke lagre testløypa: ${(error as Error).message}`);
    }
    console.log(`Testløype ferdig (${run.distanceInM.toFixed(1)} m, ${collisions} kollisjoner). Lagret i ${file}`);
    for (const r of results) console.log(`  ${r.label}: ${r.positionErrorInM.toFixed(3)} m, ${r.headingErrorInDeg.toFixed(1)} grader`);
    this.broadcast({ type: "testRoute", state: "done", results, distanceInM: run.distanceInM, collisions, file });
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.sockets) this.send(socket, message);
  }

  private broadcastState(): void {
    if (this.sockets.size === 0) return;
    const { source, simulation, plc } = this.options;
    const view = source.view;
    const feedback = view.feedback;
    const scan = view.lastScan && view.lastScan.scan.sequence !== this.lastScanSequence ? view.lastScan : null;
    if (scan) this.lastScanSequence = scan.scan.sequence;
    const message: StateMessage = {
      type: "state",
      timeInS: view.timeInS,
      truePose: pose(simulation.truePose),
      estimates: view.estimates.map((e) => ({ id: e.id, label: e.label, pose: pose(e.pose) })),
      scan: scan && {
        sequence: scan.scan.sequence,
        angleMinInRad: scan.scan.angleMinInRad,
        angleIncrementInRad: scan.scan.angleIncrementInRad,
        rangesInM: Array.from(scan.scan.rangesInM, (r) => Math.round(r * 1000) / 1000),
        truePose: pose(scan.truePose),
        estimatedPose: pose(scan.estimatedPose),
      },
      yawRateInRadPerS: feedback?.angularRateInRadPerS.z ?? 0,
      accelerationInMPerS2: feedback
        ? [feedback.accelerationInMPerS2.x, feedback.accelerationInMPerS2.y, feedback.accelerationInMPerS2.z]
        : [0, 0, 0],
      collided: feedback?.collided ?? false,
      scanCount: source.scanCount,
      collisionCount: source.collisionCount,
      faults: { ...simulation.faults },
      condition: simulation.condition,
      plc: plc ? { isConnected: plc.isConnected, status: plc.status } : null,
    };
    const text = JSON.stringify(message);
    for (const socket of this.sockets) socket.send(text);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }
}

function pose(p: Pose2D) {
  return { x: p.x, y: p.y, thetaInRad: p.thetaInRad };
}

function fixed(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? "" : value.toFixed(4);
}

/** States where the arrow keys steer the robot without first switching the PLC to manual. */
function canDriveByHand(state: MissionStateName | undefined): boolean {
  // Until the robot explores by itself (M5), you drive it while it maps.
  return state === "MANUAL" || state === "MAPPING";
}

function isMoving(twist: TwistJson): boolean {
  return twist.forwardSpeedInMPerS !== 0 || twist.yawRateInRadPerS !== 0;
}
