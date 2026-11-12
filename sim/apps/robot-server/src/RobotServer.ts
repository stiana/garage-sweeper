import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { WebSocketServer, type WebSocket } from "ws";
import {
  type LidarProfile,
  type NoiseProfile,
  Pose2D,
  type Simulation,
  type SimulationSource,
  type World,
} from "@garage/sim-core";
import type { ClientMessage, ServerMessage, StateMessage, TwistJson } from "@garage/gui-protocol";
import type { PlcBridge } from "./PlcBridge";

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

/** Serves the GUI over HTTP and keeps every open GUI in sync over WebSocket. */
export class RobotServer {
  private readonly http: Server;
  private readonly sockets = new Set<WebSocket>();
  private noiseId = "realistic";
  private lidarId = "rplidar-s2e";
  private lastScanSequence = 0;

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
    const wss = new WebSocketServer({ server: this.http, path: "/ws" });
    wss.on("connection", (socket) => this.connect(socket));
  }

  listen(): void {
    this.http.listen(this.options.port, () => {
      console.log(`GUI: http://localhost:${this.options.port}`);
    });
    setInterval(() => this.broadcastState(), STATE_INTERVAL_IN_MS);
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
        if (!plc) this.options.setManualTwist(message.twist);
        else if (plc.status?.missionState !== "MANUAL" && isMoving(message.twist)) void plc.sendHmi("MANUAL_DRIVE", message.twist);
        else void plc.sendManualTwist(message.twist);
        break;
      case "hmi":
        void plc?.sendHmi(message.code);
        break;
    }
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

function isMoving(twist: TwistJson): boolean {
  return twist.forwardSpeedInMPerS !== 0 || twist.yawRateInRadPerS !== 0;
}
