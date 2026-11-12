import type { LidarProfile, NoiseProfile, RobotGeometry, WorldDefinition } from "@garage/sim-core";
import robot from "../../../../config/robot.json";
import ideal from "../../../../config/noise/ideal.json";
import realistic from "../../../../config/noise/realistic.json";
import harsh from "../../../../config/noise/harsh.json";
import rplidarA1 from "../../../../config/lidars/rplidar-a1.json";
import rplidarS2e from "../../../../config/lidars/rplidar-s2e.json";
import ld19 from "../../../../config/lidars/ld19.json";
import doubleGarage from "../../../../config/worlds/double-garage.json";
import emptyBox from "../../../../config/worlds/empty-box.json";

export const robotGeometry: RobotGeometry = robot;

export const noiseProfiles: Record<string, NoiseProfile> = { ideal, realistic, harsh };

export const lidarProfiles: Record<string, LidarProfile> = {
  "rplidar-a1": rplidarA1,
  "rplidar-s2e": rplidarS2e,
  ld19,
};

export const worlds: Record<string, WorldDefinition> = {
  "double-garage": doubleGarage as unknown as WorldDefinition,
  "empty-box": emptyBox as unknown as WorldDefinition,
};
