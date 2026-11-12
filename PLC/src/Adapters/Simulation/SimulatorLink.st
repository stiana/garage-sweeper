{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK SimulatorLink
VAR
	cycle : UDINT;
	lastSequence : UDINT;
	silentCycles : UDINT;
	_isConnected : BOOL;
END_VAR
METHOD Execute
// @impl
cycle := cycle + 1;
SimulatorIo.command.version := Constants.SIMULATOR_PROTOCOL_VERSION;
SimulatorIo.command.cycle := cycle;
SimulatorIo.command.plcTimeInNs := F_GetSystemTime() * 100;

IF SimulatorIo.feedback.sequence <> lastSequence THEN
	lastSequence := SimulatorIo.feedback.sequence;
	silentCycles := 0;
ELSIF silentCycles < Constants.SIMULATOR_TIMEOUT_IN_CYCLES THEN
	silentCycles := silentCycles + 1;
END_IF

_isConnected := SimulatorIo.feedback.version = Constants.SIMULATOR_PROTOCOL_VERSION
	AND silentCycles < Constants.SIMULATOR_TIMEOUT_IN_CYCLES;
END_METHOD
PROPERTY IsConnected : BOOL
GET
IsConnected := _isConnected;
END_GET
END_PROPERTY
