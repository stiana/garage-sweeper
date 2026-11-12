{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DriveAxis_Simulated IMPLEMENTS I_DriveAxis
VAR
	notConnectedError : HardwareError := (isActive := TRUE, id := Constants.SIMULATOR_NOT_CONNECTED_ERROR_ID, text := 'Simulatoren er ikke tilkoblet');
	link : REFERENCE TO SimulatorLink;
	side : WheelSide;
	isEnabled : BOOL;
END_VAR
METHOD FB_init : BOOL
VAR_INPUT
	bInitRetains : BOOL;
	bInCopyCode : BOOL;
	simulator : REFERENCE TO SimulatorLink;
	mountedSide : WheelSide;
END_VAR
// @impl
link REF= simulator;
side := mountedSide;
END_METHOD
METHOD Enable
// @impl
isEnabled := TRUE;
WriteEnabled();
END_METHOD
METHOD Disable
// @impl
isEnabled := FALSE;
SetVelocity(0);
WriteEnabled();
END_METHOD
METHOD SetVelocity
VAR_INPUT
	velocityInRadPerS : LREAL;
END_VAR
VAR
	limited : LREAL;
END_VAR
// @impl
limited := LIMIT(-Parameters.maxWheelSpeedInRadPerS, velocityInRadPerS, Parameters.maxWheelSpeedInRadPerS);
IF NOT isEnabled THEN
	limited := 0;
END_IF
IF side = WheelSide.LEFT THEN
	SimulatorIo.command.leftWheelSetpointInRadPerS := limited;
ELSE
	SimulatorIo.command.rightWheelSetpointInRadPerS := limited;
END_IF
END_METHOD
METHOD TryReset : BOOL
// @impl
TryReset := IsReady;
END_METHOD
METHOD PRIVATE WriteEnabled
// @impl
IF side = WheelSide.LEFT THEN
	SimulatorIo.command.isLeftDriveEnabled := isEnabled;
ELSE
	SimulatorIo.command.isRightDriveEnabled := isEnabled;
END_IF
END_METHOD
PROPERTY PositionInRad : LREAL
GET
IF side = WheelSide.LEFT THEN
	PositionInRad := SimulatorIo.feedback.leftWheelAngleInRad;
ELSE
	PositionInRad := SimulatorIo.feedback.rightWheelAngleInRad;
END_IF
END_GET
END_PROPERTY
PROPERTY VelocityInRadPerS : LREAL
GET
IF side = WheelSide.LEFT THEN
	VelocityInRadPerS := SimulatorIo.feedback.leftWheelVelocityInRadPerS;
ELSE
	VelocityInRadPerS := SimulatorIo.feedback.rightWheelVelocityInRadPerS;
END_IF
END_GET
END_PROPERTY
PROPERTY IsReady : BOOL
GET
IsReady := __ISVALIDREF(link) AND_THEN link.IsConnected AND isEnabled;
END_GET
END_PROPERTY
PROPERTY Error : HardwareError
GET
IF NOT __ISVALIDREF(link) OR_ELSE NOT link.IsConnected THEN
	Error := notConnectedError;
END_IF
END_GET
END_PROPERTY
