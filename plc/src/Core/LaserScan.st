TYPE LaserScan :
STRUCT
	sequence : UDINT;
	startTimestampInNs : ULINT;
	scanDurationInS : REAL;
	angleMinInRad : REAL;
	angleIncrementInRad : REAL;
	count : UINT;
	rangesInM : ARRAY[0..Constants.MAX_SCAN_POINTS - 1] OF REAL;
END_STRUCT
END_TYPE
