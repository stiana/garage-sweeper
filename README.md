# Garasjefeier

En garasjefeiende robot styrt av TwinCAT 3 (4026), uten ROS. Repoet har TwinCAT-solutionen, PLC-kildene, simulatoren og GUI-en i Node.js/TypeScript, og felles konfigurasjon.

## Simulator og GUI

```bash
cd sim
npm install       # trenger npm 10 eller nyere (følger med Node 22/24)
npm test          # enhetstester for simulatorkjernen (Vitest)
npm run build     # lager apps/robot-gui/dist/index.html
```

Åpne `sim/apps/robot-gui/dist/index.html` i en nettleser. Under utvikling kan `npm run watch --workspace apps/robot-gui` bygge på nytt ved hver endring.

- **Kjør** med WASD eller piltastene, og stopp med mellomrom. Senere styrer PLC-en via ADS i stedet.
- **Garasjen**: legg til, flytt (dra), roter (Q/E) og endre objekter. Velg verden, kopier den som JSON og last den inn igjen.
- **Tegnede vegger og forbudssoner** hører til robotens kart, ikke til den simulerte garasjen.
- **Støy og sensorer**: velg støyprofil (ideell, realistisk, tøff), LIDAR-type og seed. Treffkartet viser hvordan drift smører ut veggene.
- **Feil**: kutt LIDAR, frys gyro, løft, velt og flytt roboten.

## Robot-server (simulator i Node, med eller uten PLC)

```bash
cd sim
npm install
npm run build                                   # GUI-en
npm run build --workspace apps/robot-server
node apps/robot-server/dist/server.js           # uten PLC, kjør med tastaturet
node apps/robot-server/dist/server.js --plc     # mot lokal TwinCAT, port 851
```

Åpne http://localhost:8080. GUI-en er den samme som den frittstående, men roboten kjører i serveren, og flere nettlesere kan følge med samtidig. Endringer i garasjen sendes til serveren. Panelet *Oppdrag* har driftsknappene (start kartlegging, start feiing, gå til lader, pause, stopp og nødstopp). De er bare aktive når serveren har kontakt med PLC-en, og PLC-ens svar vises under knappene. Med `--plc` leser serveren `SimulatorIo.command` og `RobotHmi.status` fra PLC-en via ADS og skriver tilbake sensordata. Mot en annen maskin: `--ams-net-id 5.x.y.z.1.1 --router-address <ip>`.

**Testløype:** knappen *Kjør testløype* (under feilene) setter estimatene til sann posisjon, står stille i 10 s og kjører så tre runder i en firkant på 1 × 1 m med venstresving fra der roboten står. Kjøringen går gjennom PLC-en når den er koblet til. Etterpå vises sluttfeilen for hvert estimat, og hele forløpet lagres som CSV i `runs/` under mappen serveren ble startet fra. Ruta kjøres uten tilbakekobling, så hjørnene blir ikke eksakte, men alle kjøringer blir like. Da kan du sammenligne algoritmer og støyprofiler.

**Gyrokalibrering:** knappen *Kalibrer gyro* står stille i 10 s og snurrer så 10 runder mot klokka og 10 med klokka på stedet. Etterpå viser den for hvert estimat hvor mye den målte vinkelen må skaleres for å treffe den sanne, for begge retninger og i snitt. For PLC-estimatet ganger du `Parameters.gyroScale` med snittfaktoren (estimatet bruker gyroen når `Parameters.useGyroForHeading` er TRUE). Ulik faktor i de to retningene tyder på noe annet enn skalafeil.

## PLC

PLC-prosjektet heter `PLC` og ligger i `PLC/`. Koden er ordnet etter lag: `Core`, `Contracts`, `Hal`, `Platform`, `Localization`, `Mission`, `Adapters` og `App`. Rediger i XAE som vanlig. Endringer fra Claude kommer som pull requests mot de samme `.TcPOU`-filene. PLC-tasken går på 10 ms.

### NC-akser for hjulene

Hjulene kjøres som NC-akser, både i simulering og på ekte maskinvare. Det er bare NC-konfigurasjonen som skiller dem.

1. Lag to akser under *Motion > NC-Task > Axes*: `LeftWheel` og `RightWheel`. Bruk akstypen *Simulation* inntil motorene er på plass.
2. Velg enheten **m** og skaler aksene slik at posisjonen er meter langs hjulbanen, altså `2 * pi * hjulradius` per motoromdreining (pluss eventuell girutveksling). Hjulradien finnes da bare i NC.
3. Sett maks fart til omtrent 0,6 m/s. Akselerasjonen kan være 1–2 m/s².
4. Koble aksene til PLC-en (*Settings > Link To PLC*): `Axes.leftWheel` og `Axes.rightWheel`.
5. Positiv retning skal være fremover på begge hjulene. På ekte maskinvare snur du derfor retningen på den ene aksen i NC, siden motorene sitter speilvendt.

Sporvidden, altså avstanden mellom hjulene, ligger i `Parameters.trackWidthInM` (PERSISTENT). Simulatoren har sin egen «sanne» geometri i `config/robot.json`. At den kan avvike fra det PLC-en tror, er med vilje, for det er nettopp det kalibrering handler om.

### Git: skjul TmcHash-støy

`garage-sweeper.tsproj` får ny `TmcHash` hver gang PLC-dataene endrer seg, selv om ingenting du bryr deg om er endret. `.gitattributes` sender derfor `.tsproj` gjennom et filter (`tools/git/tmchash-clean.sed`) som nuller ut hashen før git sammenligner. Kjør dette én gang i hver klone (Git for Windows har `sed` med seg):

```
git config filter.tmchash.clean "sed -f tools/git/tmchash-clean.sed"
git config filter.tmchash.smudge cat
git add --renormalize garage-sweeper.tsproj
```

Etterpå viser `git status` bare `.tsproj` når noe annet enn hashen er endret. Uten konfigen ignorerer git filteret, og alt virker som før.

## Struktur

```text
config/                     delt mellom PLC og simulator
  robot.json                geometri (foreløpige anslag)
  worlds/                   garasjer
  noise/                    støyprofiler (startverdier, ikke målt)
  lidars/                   LIDAR-profiler (anslag, juster etter datablad)
garage-sweeper.sln          TwinCAT-solution
PLC/                        TwinCAT PLC-prosjekt, mappe per lag
sim/
  packages/sim-core/        verden, robotfysikk, sensorer, støy. Ingen DOM eller nettverk.
  packages/gui-protocol/    meldinger mellom GUI og server
  apps/robot-gui/           nettleser-GUI (canvas)
  apps/robot-server/        simuleringsløkke, ADS mot PLC og WebSocket til GUI-en
```

Tallene i `config/` er startpunkter og skal kalibreres mot ekte målinger.

## Neste steg

1. Stian: `DiffDriveKinematics` og `WheelOdometry` i PLC-en (roboten står stille til `ToWheelSpeeds` er ferdig).
2. Prøve ADS-koblingen mot TwinCAT på din maskin.
