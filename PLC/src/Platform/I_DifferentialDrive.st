INTERFACE I_DifferentialDrive
METHOD Execute
METHOD Enable
METHOD Disable
METHOD SetTwist
VAR_INPUT
	desiredTwist : Twist;
END_VAR
PROPERTY LeftWheelPositionInM : LREAL
GET
PROPERTY RightWheelPositionInM : LREAL
GET
PROPERTY IsReady : BOOL
GET
