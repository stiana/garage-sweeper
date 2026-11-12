{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK Gyro_Simulated IMPLEMENTS I_Gyro
VAR
	link : REFERENCE TO SimulatorLink;
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
METHOD StartBiasCalibration
// @impl
// The simulated gyro has no calibration of its own. Bias is estimated in HeadingFusion.
END_METHOD
PROPERTY YawRateInRadPerS : LREAL
GET
YawRateInRadPerS := SimulatorIo.feedback.angularRateInRadPerS.z;
END_GET
END_PROPERTY
PROPERTY AngularRateInRadPerS : Vector3
GET
AngularRateInRadPerS := SimulatorIo.feedback.angularRateInRadPerS;
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
