import type { LidarProfile, NoiseProfile, RobotGeometry, WorldDefinition } from "@garage/sim-core";
import robot from "../../../../config/robot.json";
import ideal from "../../../../config/noise/ideal.json";
import realistic from "../../../../config/noise/realistic.json";
import s2e from "../../../../config/lidars/rplidar-s2e.json";
import emptyBox from "../../../../config/worlds/empty-box.json";

export const geometry: RobotGeometry = robot;
export const idealNoise: NoiseProfile = ideal;
export const realisticNoise: NoiseProfile = realistic;
export const lidarS2e: LidarProfile = s2e;
export const emptyBoxWorld = emptyBox as unknown as WorldDefinition;
