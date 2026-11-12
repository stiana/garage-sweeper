{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK WheelOdometry IMPLEMENTS I_PoseSource
VAR
	drive : I_DifferentialDrive;
	kinematics : DiffDriveKinematics;
	_pose : Pose2D;
END_VAR
METHOD Connect
VAR_INPUT
	differentialDrive : I_DifferentialDrive;
END_VAR
// @impl
drive := differentialDrive;
END_METHOD
METHOD Reset
VAR_INPUT
	pose : Pose2D;
END_VAR
// @impl
_pose := pose;
// OPPGAVE M1 (Stian): Husk også hjulvinklene akkurat nå, så første Execute ikke tror roboten har hoppet.
END_METHOD
METHOD Execute
// @impl
// OPPGAVE M1 (Stian): Oppdater _pose fra hjulene, én gang per syklus.
// 1. Les drive.LeftWheelPositionInRad og drive.RightWheelPositionInRad.
// 2. Finn hvor mye hvert hjul har rotert siden forrige syklus, og ta vare på verdiene til neste gang.
// 3. Bruk kinematics.ToBodyMotion til å få strekning og kursendring.
// 4. Flytt _pose: bruk kursen midt i steget (theta + endring / 2) for x og y, og normaliser theta til (-pi, pi].
// I simulatoren skal den da følge den orange roboten nøyaktig.
END_METHOD
PROPERTY Pose : Pose2D
GET
Pose := _pose;
END_GET
END_PROPERTY
