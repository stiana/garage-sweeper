INTERFACE I_DifferentialDrive
METHOD Enable
METHOD Disable
METHOD SetTwist
VAR_INPUT
	twist : Twist;
END_VAR
PROPERTY LeftWheelPositionInRad : LREAL
GET
PROPERTY RightWheelPositionInRad : LREAL
GET
PROPERTY IsReady : BOOL
GET
