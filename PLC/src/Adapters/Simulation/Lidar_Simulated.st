{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK Lidar_Simulated IMPLEMENTS I_Lidar
VAR
	notConnectedError : HardwareError := (isActive := TRUE, id := Constants.SIMULATOR_NOT_CONNECTED_ERROR_ID, text := 'Simulatoren er ikke tilkoblet');
	link : REFERENCE TO SimulatorLink;
	_isRunning : BOOL;
	lastSequence : UDINT;
END_VAR
METHOD FB_init : BOOL
VAR_INPUT
	bInitRetains : BOOL;
	bInCopyCode : BOOL;
	simulator : REFERENCE TO SimulatorLink;
END_VAR
// @impl
link REF= simulator;
END_METHOD
METHOD Start
// @impl
_isRunning := TRUE;
lastSequence := SimulatorIo.scan.sequence;
END_METHOD
METHOD Stop
// @impl
_isRunning := FALSE;
END_METHOD
METHOD TryGetScan : BOOL
VAR_INPUT
	scan : REFERENCE TO LaserScan;
END_VAR
// @impl
IF NOT _isRunning OR_ELSE SimulatorIo.scan.sequence = lastSequence THEN
	RETURN;
END_IF
lastSequence := SimulatorIo.scan.sequence;
scan := SimulatorIo.scan;
TryGetScan := TRUE;
END_METHOD
PROPERTY IsRunning : BOOL
GET
IsRunning := _isRunning;
END_GET
END_PROPERTY
PROPERTY Error : HardwareError
GET
IF NOT __ISVALIDREF(link) OR_ELSE NOT link.IsConnected THEN
	Error := notConnectedError;
END_IF
END_GET
END_PROPERTY
