import type { PlacedShape } from "@garage/sim-core";

export type PaletteItem = Omit<PlacedShape, "id" | "x" | "y" | "thetaInRad">;

export const palette: Record<string, PaletteItem> = {
  car: { kind: "car", label: "Bil", shape: { type: "rect", lengthInM: 4.6, widthInM: 1.85 }, reflectivity: 0.25 },
  shelf: { kind: "shelf", label: "Hylle", shape: { type: "rect", lengthInM: 2.0, widthInM: 0.5 }, reflectivity: 0.7 },
  bin: { kind: "bin", label: "Dunk", shape: { type: "circle", radiusInM: 0.3 }, reflectivity: 0.4 },
  bike: { kind: "bike", label: "Sykkel", shape: { type: "rect", lengthInM: 1.7, widthInM: 0.25 }, reflectivity: 0.5 },
  box: { kind: "box", label: "Kasse", shape: { type: "rect", lengthInM: 0.6, widthInM: 0.4 }, reflectivity: 0.6 },
  oil: { kind: "oil", label: "Oljeflekk", shape: { type: "circle", radiusInM: 0.4 }, friction: 0.3 },
};
