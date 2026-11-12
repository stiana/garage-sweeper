{attribute 'qualified_only'}
{attribute 'strict'}
TYPE MissionState :
(
	IDLE := 0,
	MANUAL,
	MAPPING,
	SWEEPING,
	PAUSED,
	RETURNING_TO_DOCK,
	DOCKED,
	EMERGENCY_STOPPED
) INT;
END_TYPE
