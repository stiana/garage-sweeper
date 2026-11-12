TYPE HmiCommand :
STRUCT
	sequence : UDINT;
	code : HmiCommandCode;
	manualTwist : Twist;
END_STRUCT
END_TYPE
