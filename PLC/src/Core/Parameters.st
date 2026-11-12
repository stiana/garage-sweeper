{attribute 'qualified_only'}
VAR_GLOBAL PERSISTENT
	platform : PlatformKind := PlatformKind.SIMULATION;
	// Hjulradien ligger i NC-skaleringen av aksene, som går i meter langs hjulbanen.
	trackWidthInM : LREAL := 0.40;
	maxWheelSpeedInMPerS : LREAL := 0.6;
END_VAR
