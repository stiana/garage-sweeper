{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK RobotComposition
VAR
	simulator : SimulatorLink;
	leftAxis : DriveAxis_Nc(ncAxis := Axes.leftWheel);
	rightAxis : DriveAxis_Nc(ncAxis := Axes.rightWheel);
	simulatedGyro : Gyro_Simulated(simulator := simulator);
	simulatedAccelerometer : Accelerometer_Simulated(simulator := simulator);
	simulatedLidar : Lidar_Simulated(simulator := simulator);
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

IF Parameters.platform = PlatformKind.SIMULATION THEN
	simulator.Execute();
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
drive.Execute();

IF Parameters.platform = PlatformKind.SIMULATION THEN
	SendWheelsToSimulator();
END_IF

PublishStatus();
END_METHOD
METHOD PRIVATE Initialize
VAR
	start : Pose2D;
END_VAR
// @impl
CASE Parameters.platform OF
	PlatformKind.SIMULATION:
		gyro := simulatedGyro;
		accelerometer := simulatedAccelerometer;
		lidar.Wrap(simulatedLidar);
		lidarPower := simulatedLidarPower;
	PlatformKind.HARDWARE:
		// Kommer i M7: Gyro_EP3751 og valgt LIDAR-adapter. Hjulene bruker de samme NC-aksene.
		RETURN;
END_CASE

drive.Connect(leftAxis, rightAxis);

lidarPower.SwitchOn();
lidar.Start();
odometry.Connect(drive);
odometry.Reset(start);
isInitialized := TRUE;
END_METHOD
METHOD PRIVATE SendWheelsToSimulator
// @impl
// I simuleringen er NC-aksene motor og enkoder. Simulatoren får vite hvor fort hjulene faktisk går,
// og flytter roboten etter det, med sluring og kollisjoner.
SimulatorIo.command.leftWheelVelocityInMPerS := leftAxis.VelocityInMPerS;
SimulatorIo.command.rightWheelVelocityInMPerS := rightAxis.VelocityInMPerS;
SimulatorIo.command.isLeftDriveEnabled := leftAxis.IsReady;
SimulatorIo.command.isRightDriveEnabled := rightAxis.IsReady;
END_METHOD
METHOD PRIVATE PublishStatus
VAR
	lidarError : HardwareError;
END_VAR
// @impl
lidarError := lidar.Error;
RobotHmi.status.estimatedPose := odometry.Pose;
RobotHmi.status.isSimulatorConnected := simulator.IsConnected;
RobotHmi.status.isLidarOk := NOT lidarError.isActive;
SimulatorIo.command.estimatedPose := odometry.Pose;
END_METHOD
