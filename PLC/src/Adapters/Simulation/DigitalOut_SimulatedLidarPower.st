{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DigitalOut_SimulatedLidarPower IMPLEMENTS I_DigitalOut
METHOD SwitchOn
// @impl
SimulatorIo.command.isLidarPowered := TRUE;
END_METHOD
METHOD SwitchOff
// @impl
SimulatorIo.command.isLidarPowered := FALSE;
END_METHOD
PROPERTY IsOn : BOOL
GET
IsOn := SimulatorIo.command.isLidarPowered;
END_GET
END_PROPERTY
