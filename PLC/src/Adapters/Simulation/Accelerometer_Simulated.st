{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK Accelerometer_Simulated IMPLEMENTS I_Accelerometer
VAR
	link : REFERENCE TO SimulatorLink;
END_VAR
METHOD FB_init : BOOL
VAR_INPUT
	bInitRetains : BOOL;
	bInCopyCode : BOOL;
	simulatorLink : REFERENCE TO SimulatorLink;
END_VAR
// @impl
link REF= simulatorLink;
END_METHOD
PROPERTY AccelerationInMPerS2 : Vector3
GET
AccelerationInMPerS2 := SimulatorIo.feedback.accelerationInMPerS2;
END_GET
END_PROPERTY
PROPERTY TimestampInNs : ULINT
GET
TimestampInNs := SimulatorIo.feedback.timeInNs;
END_GET
END_PROPERTY
PROPERTY IsValid : BOOL
GET
IsValid := __ISVALIDREF(link) AND_THEN link.IsConnected;
END_GET
END_PROPERTY
