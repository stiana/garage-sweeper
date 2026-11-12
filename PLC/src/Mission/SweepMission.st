{attribute 'linkalways'}
{attribute 'no_explicit_call' := 'Use the methods of this class'}
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK SweepMission
VAR
	_state : MissionState := MissionState.IDLE;
	stateBeforePause : MissionState;
	lastSequence : UDINT;
	_desiredTwist : Twist;
	_hasMap : BOOL;
END_VAR
METHOD Execute
// @impl
IF RobotHmi.command.sequence <> lastSequence THEN
	lastSequence := RobotHmi.command.sequence;
	Handle(RobotHmi.command.code);
	RobotHmi.status.acknowledgedSequence := lastSequence;
END_IF

CASE _state OF
	MissionState.MANUAL:
		_desiredTwist := RobotHmi.command.manualTwist;
	MissionState.MAPPING, MissionState.SWEEPING, MissionState.RETURNING_TO_DOCK:
		// Kommer i M5 og M6: kartlegging, feiing og retur til lader.
		_desiredTwist := Stopped();
ELSE
	_desiredTwist := Stopped();
END_CASE

RobotHmi.status.missionState := _state;
RobotHmi.status.hasMap := _hasMap;
END_METHOD
METHOD PRIVATE Handle
VAR_INPUT
	code : HmiCommandCode;
END_VAR
// @impl
RobotHmi.status.lastRejection := '';

IF code = HmiCommandCode.EMERGENCY_STOP THEN
	_state := MissionState.EMERGENCY_STOPPED;
	RETURN;
END_IF
IF _state = MissionState.EMERGENCY_STOPPED AND code <> HmiCommandCode.RESET THEN
	Reject('Nødstopp er aktiv. Tilbakestill først.');
	RETURN;
END_IF

CASE code OF
	HmiCommandCode.RESET:
		_state := MissionState.IDLE;
	HmiCommandCode.MANUAL_DRIVE:
		IF IsBusy() THEN
			Reject('Stopp oppdraget før du kjører manuelt.');
		ELSE
			_state := MissionState.MANUAL;
		END_IF
	HmiCommandCode.START_MAPPING:
		_state := MissionState.MAPPING;
	HmiCommandCode.START_SWEEPING:
		IF _hasMap THEN
			_state := MissionState.SWEEPING;
		ELSE
			Reject('Kartet mangler. Kjør kartlegging først.');
		END_IF
	HmiCommandCode.PAUSE:
		IF IsBusy() THEN
			stateBeforePause := _state;
			_state := MissionState.PAUSED;
		ELSE
			Reject('Det er ikke noe oppdrag å pause.');
		END_IF
	HmiCommandCode.RESUME:
		IF _state = MissionState.PAUSED THEN
			_state := stateBeforePause;
		ELSE
			Reject('Det er ikke noe pauset oppdrag.');
		END_IF
	HmiCommandCode.STOP:
		_state := MissionState.IDLE;
	HmiCommandCode.GO_TO_DOCK:
		_state := MissionState.RETURNING_TO_DOCK;
END_CASE
END_METHOD
METHOD PRIVATE IsBusy : BOOL
// @impl
IsBusy := _state = MissionState.MAPPING OR _state = MissionState.SWEEPING OR _state = MissionState.RETURNING_TO_DOCK;
END_METHOD
METHOD PRIVATE Reject
VAR_INPUT
	reason : STRING(80);
END_VAR
// @impl
RobotHmi.status.lastRejection := reason;
END_METHOD
METHOD PRIVATE Stopped : Twist
// @impl
Stopped.forwardSpeedInMPerS := 0;
Stopped.yawRateInRadPerS := 0;
END_METHOD
PROPERTY State : MissionState
GET
State := _state;
END_GET
END_PROPERTY
PROPERTY DesiredTwist : Twist
GET
DesiredTwist := _desiredTwist;
END_GET
END_PROPERTY
PROPERTY ShouldDrive : BOOL
GET
ShouldDrive := _state = MissionState.MANUAL OR IsBusy();
END_GET
END_PROPERTY
