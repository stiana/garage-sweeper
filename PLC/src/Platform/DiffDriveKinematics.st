{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK DiffDriveKinematics
METHOD ToWheelSpeeds : WheelSpeeds
VAR_INPUT
	desiredTwist : Twist;
END_VAR
VAR
	speeds : WheelSpeeds;
END_VAR
// @impl
// OPPGAVE M1 (Stian): Gjør robotens fart (twist) om til fart for hvert hjul, i m/s langs hjulbanen.
// Bruk Parameters.trackWidthInM. Hjulradien trengs ikke, den ligger i NC-skaleringen.
// Tips: hvert hjul ligger trackWidth / 2 fra midten. Når roboten roterer med yawRate,
// får hjulet på utsiden ekstra fart lik yawRate * trackWidth / 2.
speeds.leftInMPerS := 0;
speeds.rightInMPerS := 0;
ToWheelSpeeds := speeds;
END_METHOD
METHOD ToBodyMotion : BodyMotion
VAR_INPUT
	leftDeltaInM : LREAL;
	rightDeltaInM : LREAL;
END_VAR
VAR
	motion : BodyMotion;
END_VAR
// @impl
// OPPGAVE M1 (Stian): Gjør hjulenes strekning siden forrige syklus om til robotens strekning og kursendring.
// Den motsatte veien av ToWheelSpeeds: snittet av hjulene gir strekning,
// forskjellen delt på sporvidden gir kursendring.
motion.distanceInM := 0;
motion.headingChangeInRad := 0;
ToBodyMotion := motion;
END_METHOD
