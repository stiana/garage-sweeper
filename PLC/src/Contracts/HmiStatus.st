TYPE HmiStatus :
STRUCT
	acknowledgedSequence : UDINT;
	missionState : MissionState;
	lastRejection : STRING(80);
	estimatedPose : Pose2D;
	isSimulatorConnected : BOOL;
	isLidarOk : BOOL;
	hasMap : BOOL;
END_STRUCT
END_TYPE
