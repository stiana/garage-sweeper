import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  type LidarProfile,
  type NoiseProfile,
  type RobotGeometry,
  Simulation,
  SimulationSource,
  TwistController,
  type TwistSetpoint,
  World,
  type WorldDefinition,
} from "@garage/sim-core";
import robot from "../../../../config/robot.json";
import ideal from "../../../../config/noise/ideal.json";
import realistic from "../../../../config/noise/realistic.json";
import harsh from "../../../../config/noise/harsh.json";
import rplidarA1 from "../../../../config/lidars/rplidar-a1.json";
import rplidarS2e from "../../../../config/lidars/rplidar-s2e.json";
import ld19 from "../../../../config/lidars/ld19.json";
import doubleGarage from "../../../../config/worlds/double-garage.json";
import { PlcBridge } from "./PlcBridge";
import { RobotServer } from "./RobotServer";

const { values } = parseArgs({
  options: {
    plc: { type: "boolean", default: false },
    "ams-net-id": { type: "string", default: "localhost" },
    "ads-port": { type: "string", default: "851" },
    "router-address": { type: "string" },
    "local-ams-net-id": { type: "string" },
    port: { type: "string", default: "8080" },
    seed: { type: "string", default: "42" },
  },
});

const noiseProfiles: Record<string, NoiseProfile> = { ideal, realistic, harsh };
const lidarProfiles: Record<string, LidarProfile> = { "rplidar-a1": rplidarA1, "rplidar-s2e": rplidarS2e, ld19 };
// With the PLC, the NC axes already model the motors, so the simulator takes their speed as it is.
const geometry: RobotGeometry = values.plc ? { ...robot, motorTimeConstantInS: 0 } : robot;
const world = new World(doubleGarage as unknown as WorldDefinition);
const simulation = new Simulation({
  world,
  geometry,
  noise: noiseProfiles.realistic!,
  lidarProfile: lidarProfiles["rplidar-s2e"]!,
  seed: Number(values.seed),
});

const STOPPED: TwistSetpoint = { forwardSpeedInMPerS: 0, yawRateInRadPerS: 0 };
/** Manual driving stops by itself if the GUI goes quiet, for example when the browser tab closes. */
const DRIVE_TIMEOUT_IN_MS = 300;
let manualTwist = STOPPED;
let manualTwistAtInMs = 0;
const plc = values.plc
  ? new PlcBridge({
      targetAmsNetId: values["ams-net-id"]!,
      targetAdsPort: Number(values["ads-port"]),
      routerAddress: values["router-address"],
      localAmsNetId: values["local-ams-net-id"],
    }, geometry.wheelRadiusInM)
  : null;
const controller = plc ?? new TwistController(geometry, () =>
  performance.now() - manualTwistAtInMs < DRIVE_TIMEOUT_IN_MS ? manualTwist : STOPPED,
);
const source = new SimulationSource(simulation, controller);
if (plc) {
  source.extraEstimates = () => plc.estimates;
  // The PLC starts its estimate at (0, 0, 0). Put it where the robot really starts.
  plc.onConnected = () => void plc.setPose(simulation.truePose);
}

const here = dirname(fileURLToPath(import.meta.url));
new RobotServer({
  port: Number(values.port),
  guiHtmlPath: resolve(here, "../../robot-gui/dist/index.html"),
  world,
  simulation,
  source,
  noiseProfiles,
  lidarProfiles,
  plc,
  setManualTwist: (twist) => {
    manualTwist = twist;
    manualTwistAtInMs = performance.now();
  },
}).listen();

if (plc) {
  console.log(`Kobler til PLC ${values["ams-net-id"]}:${values["ads-port"]} via ADS ...`);
  void plc.start();
} else {
  console.log("Kjører uten PLC. Start med --plc for å koble til TwinCAT.");
}

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  source.update((now - last) / 1000);
  last = now;
}, 5);
