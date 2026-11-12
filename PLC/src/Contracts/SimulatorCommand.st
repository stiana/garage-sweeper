TYPE SimulatorCommand :
STRUCT
	version : UDINT;
	cycle : UDINT;
	plcTimeInNs : ULINT;
	leftWheelSetpointInRadPerS : LREAL;
	rightWheelSetpointInRadPerS : LREAL;
	isLeftDriveEnabled : BOOL;
	isRightDriveEnabled : BOOL;
	isLidarPowered : BOOL;
	estimatedPose : Pose2D;
END_STRUCT
END_TYPE
