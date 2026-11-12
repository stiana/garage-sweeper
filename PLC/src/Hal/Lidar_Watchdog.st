{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK Lidar_Watchdog IMPLEMENTS I_Lidar
VAR
	timeoutError : HardwareError := (isActive := TRUE, id := Constants.LIDAR_TIMEOUT_ERROR_ID, text := 'Ingen LIDAR-skann innenfor fristen');
	inner : I_Lidar;
	timeoutTimer : TON;
	isTimedOut : BOOL;
END_VAR
METHOD Wrap
VAR_INPUT
	lidar : I_Lidar;
END_VAR
// @impl
inner := lidar;
END_METHOD
METHOD Execute
// @impl
IF inner = 0 THEN
	RETURN;
END_IF
timeoutTimer(IN := inner.IsRunning, PT := Constants.LIDAR_TIMEOUT_IN_MS);
IF timeoutTimer.Q THEN
	isTimedOut := TRUE;
END_IF
END_METHOD
METHOD Start
// @impl
IF inner <> 0 THEN
	inner.Start();
END_IF
timeoutTimer(IN := FALSE);
isTimedOut := FALSE;
END_METHOD
METHOD Stop
// @impl
IF inner <> 0 THEN
	inner.Stop();
END_IF
timeoutTimer(IN := FALSE);
isTimedOut := FALSE;
END_METHOD
METHOD TryGetScan : BOOL
VAR_INPUT
	scan : REFERENCE TO LaserScan;
END_VAR
// @impl
IF inner = 0 OR_ELSE NOT inner.TryGetScan(scan) THEN
	RETURN;
END_IF
timeoutTimer(IN := FALSE);
isTimedOut := FALSE;
TryGetScan := TRUE;
END_METHOD
PROPERTY IsRunning : BOOL
GET
IsRunning := inner <> 0 AND_THEN inner.IsRunning;
END_GET
END_PROPERTY
PROPERTY Error : HardwareError
GET
IF isTimedOut THEN
	Error := timeoutError;
ELSIF inner <> 0 THEN
	Error := inner.Error;
END_IF
END_GET
END_PROPERTY
