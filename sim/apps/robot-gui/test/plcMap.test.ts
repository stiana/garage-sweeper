import { describe, expect, it } from "vitest";
import { toPlcMapMessage } from "../../robot-server/src/PlcBridge";
import { decodeCells, plcMapPixels } from "../src/view/PlcMapImage";

const INFO = {
  revision: 3,
  cellSizeInM: 0.05,
  originXInM: -1,
  originYInM: -2,
  widthInCells: 3,
  heightInCells: 2,
  logOddsPerUnit: 0.1,
};
const COLORS = { occupied: [10, 20, 30] as [number, number, number], free: [0, 200, 100] as [number, number, number] };

/** Bytes as the PLC holds ARRAY[0..2, 0..1] OF SINT: index x * 2 + y. */
function plcBytes(cells: Record<string, number>): Uint8Array {
  const bytes = new Uint8Array(INFO.widthInCells * INFO.heightInCells);
  for (const [key, value] of Object.entries(cells)) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    bytes[x * INFO.heightInCells + y] = value & 0xff;
  }
  return bytes;
}

describe("PLC map", () => {
  it("keeps signed log-odds through the server and back", () => {
    const message = toPlcMapMessage(INFO, plcBytes({ "0,0": 35, "2,1": -35, "1,0": -4 }));
    const cells = decodeCells(message.cellsBase64);
    expect(Array.from(cells)).toEqual([35, 0, -4, 0, 0, -35]);
    expect(message).toMatchObject({ type: "plcMap", revision: 3, widthInCells: 3, heightInCells: 2 });
  });

  it("refuses cells that do not match the size the PLC reports", () => {
    expect(() => toPlcMapMessage(INFO, new Uint8Array(5))).toThrow(/mapCells/);
  });

  it("draws the top of the map (highest y) on the first image row", () => {
    const message = toPlcMapMessage(INFO, plcBytes({ "0,1": 35, "2,0": -35 }));
    const pixels = plcMapPixels(message, COLORS);
    const at = (column: number, row: number) => Array.from(pixels.slice((row * 3 + column) * 4, (row * 3 + column) * 4 + 4));
    // Cell [0, 1] is top left and almost surely occupied.
    expect(at(0, 0).slice(0, 3)).toEqual(COLORS.occupied);
    expect(at(0, 0)[3]).toBeGreaterThan(230);
    // Cell [2, 0] is bottom right and free: a faint tint.
    expect(at(2, 1).slice(0, 3)).toEqual(COLORS.free);
    expect(at(2, 1)[3]).toBeGreaterThan(50);
    expect(at(2, 1)[3]).toBeLessThan(150);
    // Unknown cells stay clear.
    expect(at(1, 0)[3]).toBe(0);
  });
});
