{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DiffDriveKinematics
METHOD ToWheelSpeeds : WheelSpeeds
VAR_INPUT
	twist : Twist;
END_VAR
// @impl
// OPPGAVE M1 (Stian): Gjør robotens fart (twist) om til hjulhastigheter i rad/s.
// Bruk Parameters.wheelRadiusInM og Parameters.trackWidthInM.
// Tips: hvert hjul ligger trackWidth / 2 fra midten. Når roboten roterer med yawRate,
// får hjulet på utsiden ekstra fart lik yawRate * trackWidth / 2.
ToWheelSpeeds.leftInRadPerS := 0;
ToWheelSpeeds.rightInRadPerS := 0;
END_METHOD
METHOD ToBodyMotion : BodyMotion
VAR_INPUT
	leftDeltaInRad : LREAL;
	rightDeltaInRad : LREAL;
END_VAR
// @impl
// OPPGAVE M1 (Stian): Gjør hjulrotasjon siden forrige syklus om til strekning og kursendring.
// Den motsatte veien av ToWheelSpeeds: snittet av hjulene gir strekning,
// forskjellen delt på sporvidden gir kursendring.
ToBodyMotion.distanceInM := 0;
ToBodyMotion.headingChangeInRad := 0;
END_METHOD
