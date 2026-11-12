{attribute 'qualified_only'}
{attribute 'strict'}
TYPE HmiCommandCode :
(
	NONE := 0,
	MANUAL_DRIVE,
	START_MAPPING,
	START_SWEEPING,
	PAUSE,
	RESUME,
	STOP,
	GO_TO_DOCK,
	EMERGENCY_STOP,
	RESET
) INT;
END_TYPE
