export interface RobotGeometry {
  wheelRadiusInM: number;
  trackWidthInM: number;
  bodyRadiusInM: number;
  maxWheelSpeedInRadPerS: number;
  motorTimeConstantInS: number;
  lidarMountXInM: number;
  lidarMountYInM: number;
}

export interface NoiseProfile {
  name: string;
  odometry: {
    wheelRadiusErrorLeft: number;
    wheelRadiusErrorRight: number;
    trackWidthError: number;
    slipSigma: number;
  };
  gyro: {
    biasInDegPerS: number;
    biasRandomWalkInDegPerSPerSqrtS: number;
    whiteNoiseInDegPerS: number;
    scaleError: number;
  };
  accelerometer: { whiteNoiseInMPerS2: number };
  lidar: {
    rangeSigmaInM: number;
    rangeSigmaRelative: number;
    dropoutProbability: number;
    spuriousProbability: number;
  };
}

export interface LidarProfile {
  id: string;
  name: string;
  points: number;
  rateInHz: number;
  minRangeInM: number;
  maxRangeInM: number;
  angleMinInRad: number;
  angleMaxInRad: number;
}
