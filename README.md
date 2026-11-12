# Garasjefeier

En garasjefeiende robot styrt av TwinCAT 3 (4026), uten ROS. Repoet har TwinCAT-solutionen, PLC-kildene, simulatoren og GUI-en i Node.js/TypeScript, og felles konfigurasjon.

## Simulator og GUI

```bash
cd sim
npm install
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

Åpne http://localhost:8080. Med `--plc` leser serveren `SimulatorIo.command` og `RobotHmi.status` fra PLC-en via ADS og skriver tilbake sensordata. Mot en annen maskin: `--ams-net-id 5.x.y.z.1.1 --router-address <ip>`.

## PLC

Kildene ligger som lesbar tekst i `plc/src/**/*.st`. `plc/tools/st2tc.py` gjør dem om til TwinCAT-filer i `plc/generated/`:

```bash
python plc/tools/st2tc.py
```

I XAE: legg til et PLC-prosjekt kalt `RobotPlc` i solutionen, og velg *Add > Existing Item* for filene i `plc/generated/`. Sett PLC-tasken til 10 ms.

## Struktur

```text
config/                     delt mellom PLC og simulator
  robot.json                geometri (foreløpige anslag)
  worlds/                   garasjer
  noise/                    støyprofiler (startverdier, ikke målt)
  lidars/                   LIDAR-profiler (anslag, juster etter datablad)
garage-sweeper.sln          TwinCAT-solution
plc/src/                    PLC-kilder (.st), plc/generated/ er laget av plc/tools/st2tc.py
sim/
  packages/sim-core/        verden, robotfysikk, sensorer, støy. Ingen DOM eller nettverk.
  packages/gui-protocol/    meldinger mellom GUI og server
  apps/robot-gui/           nettleser-GUI (canvas)
  apps/robot-server/        simuleringsløkke, ADS mot PLC og WebSocket til GUI-en
```

Tallene i `config/` er startpunkter og skal kalibreres mot ekte målinger.

## Neste steg

1. Stian: `DiffDriveKinematics` og `WheelOdometry` i PLC-en (roboten står stille til `ToWheelSpeeds` er ferdig).
2. GUI-en: servermodus med driftsknapper (start kartlegging, feiing, gå til lader).
