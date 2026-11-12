{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DriveAxis_Nc IMPLEMENTS I_DriveAxis
VAR
	axis : REFERENCE TO AXIS_REF;
	power : MC_Power;
	moveVelocity : MC_MoveVelocity;
	halt : MC_Halt;
	reset : MC_Reset;
	isEnabled : BOOL;
	targetInMPerS : LREAL;
	commandedInMPerS : LREAL;
	isHalting : BOOL;
	notLinkedError : HardwareError := (isActive := TRUE, id := Constants.AXIS_NOT_LINKED_ERROR_ID, text := 'Aksen er ikke koblet til PLC-en');
END_VAR
VAR CONSTANT
	VELOCITY_DEADBAND_IN_M_PER_S : LREAL := 0.0005;
END_VAR
METHOD FB_init : BOOL
VAR_INPUT
	bInitRetains : BOOL;
	bInCopyCode : BOOL;
	ncAxis : REFERENCE TO AXIS_REF;
END_VAR
// @impl
axis REF= ncAxis;
END_METHOD
METHOD Execute
// @impl
IF NOT __ISVALIDREF(axis) THEN
	RETURN;
END_IF
axis.ReadStatus();
power(Axis := axis, Enable := isEnabled, Enable_Positive := isEnabled, Enable_Negative := isEnabled, Override := 100);
reset(Axis := axis, Execute := FALSE);

IF NOT isEnabled OR NOT power.Status THEN
	commandedInMPerS := 0;
	isHalting := FALSE;
	moveVelocity(Axis := axis, Execute := FALSE);
	halt(Axis := axis, Execute := FALSE);
	RETURN;
END_IF

IF ABS(targetInMPerS) < VELOCITY_DEADBAND_IN_M_PER_S THEN
	IF NOT isHalting THEN
		isHalting := TRUE;
		commandedInMPerS := 0;
		moveVelocity(Axis := axis, Execute := FALSE);
		halt(Axis := axis, Execute := FALSE);
	END_IF
	halt(Axis := axis, Execute := TRUE);
ELSIF isHalting OR ABS(targetInMPerS - commandedInMPerS) > VELOCITY_DEADBAND_IN_M_PER_S THEN
	// MC_MoveVelocity starts on a rising edge, so a new speed needs Execute low, then high.
	isHalting := FALSE;
	commandedInMPerS := targetInMPerS;
	halt(Axis := axis, Execute := FALSE);
	moveVelocity(Axis := axis, Execute := FALSE);
	moveVelocity(
		Axis := axis,
		Execute := TRUE,
		Velocity := ABS(targetInMPerS),
		Direction := SEL(targetInMPerS > 0, MC_Negative_Direction, MC_Positive_Direction));
ELSE
	moveVelocity(Axis := axis, Execute := TRUE);
END_IF
END_METHOD
METHOD Enable
// @impl
isEnabled := TRUE;
END_METHOD
METHOD Disable
// @impl
isEnabled := FALSE;
targetInMPerS := 0;
END_METHOD
METHOD SetVelocity
VAR_INPUT
	velocityInMPerS : LREAL;
END_VAR
// @impl
targetInMPerS := LIMIT(-Parameters.maxWheelSpeedInMPerS, velocityInMPerS, Parameters.maxWheelSpeedInMPerS);
END_METHOD
METHOD TryReset : BOOL
// @impl
IF NOT __ISVALIDREF(axis) THEN
	RETURN;
END_IF
reset(Axis := axis, Execute := TRUE);
TryReset := NOT axis.Status.Error;
END_METHOD
PROPERTY PositionInM : LREAL
GET
IF __ISVALIDREF(axis) THEN
	PositionInM := axis.NcToPlc.ActPos;
END_IF
END_GET
END_PROPERTY
PROPERTY VelocityInMPerS : LREAL
GET
IF __ISVALIDREF(axis) THEN
	VelocityInMPerS := axis.NcToPlc.ActVelo;
END_IF
END_GET
END_PROPERTY
PROPERTY IsReady : BOOL
GET
IsReady := __ISVALIDREF(axis) AND_THEN power.Status AND NOT axis.Status.Error;
END_GET
END_PROPERTY
PROPERTY Error : HardwareError
GET
VAR
	axisError : HardwareError;
END_VAR
IF NOT __ISVALIDREF(axis) THEN
	Error := notLinkedError;
ELSIF axis.Status.Error THEN
	axisError.isActive := TRUE;
	axisError.id := axis.Status.ErrorID;
	axisError.text := 'NC-aksen melder feil, se feilkoden';
	Error := axisError;
END_IF
END_GET
END_PROPERTY
