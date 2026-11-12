# Garasjefeier

En garasjefeiende robot styrt av TwinCAT 3 (4026), uten ROS. Repoet har PLC-koden (kommer), simulatoren og GUI-en i Node.js/TypeScript, og felles konfigurasjon.

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

## Struktur

```text
config/                     delt mellom PLC og simulator
  robot.json                geometri (foreløpige anslag)
  worlds/                   garasjer
  noise/                    støyprofiler (startverdier, ikke målt)
  lidars/                   LIDAR-profiler (anslag, juster etter datablad)
sim/
  packages/sim-core/        verden, robotfysikk, sensorer, støy. Ingen DOM eller nettverk.
  apps/robot-gui/           nettleser-GUI (canvas)
```

Tallene i `config/` er startpunkter og skal kalibreres mot ekte målinger.

## Neste steg

1. `apps/robot-server`: simuleringsløkke i Node med ADS mot TwinCAT (`ads-client`) og WebSocket til GUI-en.
2. PLC-siden: `SimulatorIo`, `SimulatorLink` og simadaptere etter planen.
