TYPE SimulatorCommand :
STRUCT
	version : UDINT;
	cycle : UDINT;
	plcTimeInNs : ULINT;
	// The wheels' actual speed, from the NC axes. The simulator moves the robot with it.
	leftWheelVelocityInMPerS : LREAL;
	rightWheelVelocityInMPerS : LREAL;
	isLeftDriveEnabled : BOOL;
	isRightDriveEnabled : BOOL;
	isLidarPowered : BOOL;
	estimatedPose : Pose2D;
END_STRUCT
END_TYPE
