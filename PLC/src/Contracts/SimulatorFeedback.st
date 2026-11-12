TYPE SimulatorFeedback :
STRUCT
	version : UDINT;
	sequence : UDINT;
	timeInNs : ULINT;
	leftWheelAngleInRad : LREAL;
	rightWheelAngleInRad : LREAL;
	leftWheelVelocityInRadPerS : LREAL;
	rightWheelVelocityInRadPerS : LREAL;
	angularRateInRadPerS : Vector3;
	accelerationInMPerS2 : Vector3;
	truePose : Pose2D;
	collided : BOOL;
END_STRUCT
END_TYPE
