{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DiffDrive IMPLEMENTS I_DifferentialDrive
VAR
	leftAxis : I_DriveAxis;
	rightAxis : I_DriveAxis;
	kinematics : DiffDriveKinematics;
END_VAR
METHOD Connect
VAR_INPUT
	left : I_DriveAxis;
	right : I_DriveAxis;
END_VAR
// @impl
leftAxis := left;
rightAxis := right;
END_METHOD
METHOD Execute
// @impl
IF leftAxis = 0 OR rightAxis = 0 THEN
	RETURN;
END_IF
leftAxis.Execute();
rightAxis.Execute();
END_METHOD
METHOD Enable
// @impl
IF leftAxis = 0 OR rightAxis = 0 THEN
	RETURN;
END_IF
leftAxis.Enable();
rightAxis.Enable();
END_METHOD
METHOD Disable
// @impl
IF leftAxis = 0 OR rightAxis = 0 THEN
	RETURN;
END_IF
leftAxis.Disable();
rightAxis.Disable();
END_METHOD
METHOD SetTwist
VAR_INPUT
	desiredTwist : Twist;
END_VAR
VAR
	speeds : WheelSpeeds;
END_VAR
// @impl
IF leftAxis = 0 OR rightAxis = 0 THEN
	RETURN;
END_IF
speeds := kinematics.ToWheelSpeeds(desiredTwist);
leftAxis.SetVelocity(speeds.leftInMPerS);
rightAxis.SetVelocity(speeds.rightInMPerS);
END_METHOD
PROPERTY LeftWheelPositionInM : LREAL
GET
IF leftAxis <> 0 THEN
	LeftWheelPositionInM := leftAxis.PositionInM;
END_IF
END_GET
END_PROPERTY
PROPERTY RightWheelPositionInM : LREAL
GET
IF rightAxis <> 0 THEN
	RightWheelPositionInM := rightAxis.PositionInM;
END_IF
END_GET
END_PROPERTY
PROPERTY IsReady : BOOL
GET
IsReady := leftAxis <> 0 AND_THEN rightAxis <> 0 AND_THEN leftAxis.IsReady AND_THEN rightAxis.IsReady;
END_GET
END_PROPERTY
