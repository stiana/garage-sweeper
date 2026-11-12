{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK RobotComposition
VAR
	simulatorLink : SimulatorLink;
	leftSimulatedAxis : DriveAxis_Simulated(simulatorLink := simulatorLink, wheelSide := WheelSide.LEFT);
	rightSimulatedAxis : DriveAxis_Simulated(simulatorLink := simulatorLink, wheelSide := WheelSide.RIGHT);
	simulatedGyro : Gyro_Simulated(simulatorLink := simulatorLink);
	simulatedAccelerometer : Accelerometer_Simulated(simulatorLink := simulatorLink);
	simulatedLidar : Lidar_Simulated(simulatorLink := simulatorLink);
	simulatedLidarPower : DigitalOut_SimulatedLidarPower;

	gyro : I_Gyro;
	accelerometer : I_Accelerometer;
	lidarPower : I_DigitalOut;
	lidar : Lidar_Watchdog;
	drive : DiffDrive;
	odometry : WheelOdometry;
	mission : SweepMission;

	scan : LaserScan;
	isInitialized : BOOL;
END_VAR
METHOD Execute
// @impl
IF NOT isInitialized THEN
	Initialize();
END_IF

IF Parameters.platform = Platform.SIMULATION THEN
	simulatorLink.Execute();
END_IF

lidar.Execute();
IF lidar.TryGetScan(scan) THEN
	// Kommer i M3 og M4: kartoppdatering og scan matching.
	;
END_IF

odometry.Execute();
mission.Execute();

IF mission.ShouldDrive THEN
	drive.Enable();
	drive.SetTwist(mission.DesiredTwist);
ELSE
	drive.Disable();
END_IF

PublishStatus();
END_METHOD
METHOD PRIVATE Initialize
VAR
	start : Pose2D;
END_VAR
// @impl
CASE Parameters.platform OF
	Platform.SIMULATION:
		drive.Connect(leftSimulatedAxis, rightSimulatedAxis);
		gyro := simulatedGyro;
		accelerometer := simulatedAccelerometer;
		lidar.Wrap(simulatedLidar);
		lidarPower := simulatedLidarPower;
	Platform.HARDWARE:
		// Kommer i M7: DriveAxis_Nc, Gyro_EP3751 og valgt LIDAR-adapter.
		RETURN;
END_CASE

lidarPower.SwitchOn();
lidar.Start();
odometry.Connect(drive);
odometry.Reset(start);
isInitialized := TRUE;
END_METHOD
METHOD PRIVATE PublishStatus
// @impl
RobotHmi.status.estimatedPose := odometry.Pose;
RobotHmi.status.isSimulatorConnected := simulatorLink.IsConnected;
RobotHmi.status.isLidarOk := NOT lidar.Error.isActive;
SimulatorIo.command.estimatedPose := odometry.Pose;
END_METHOD
