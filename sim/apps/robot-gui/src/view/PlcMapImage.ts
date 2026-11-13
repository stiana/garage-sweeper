import type { PlcMapMessage } from "@garage/gui-protocol";

export interface PlcMapColors {
  /** Colour of occupied cells, as [r, g, b]. */
  occupied: [number, number, number];
  /** Colour of free cells, as [r, g, b]. */
  free: [number, number, number];
}

/**
 * Turns the PLC's occupancy grid into an image: occupied cells darken towards the
 * occupied colour as the PLC grows surer, free cells get a faint tint, unknown stays clear.
 * Row 0 of the image is the top of the map (highest y), as on screen.
 */
export function plcMapPixels(map: PlcMapMessage, colors: PlcMapColors): Uint8ClampedArray {
  const cells = decodeCells(map.cellsBase64);
  const { widthInCells: width, heightInCells: height } = map;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const logOdds = cells[x * height + y]! * map.logOddsPerUnit;
      if (logOdds === 0) continue;
      const probability = 1 / (1 + Math.exp(-logOdds));
      const [color, alpha] = probability > 0.5
        ? [colors.occupied, (probability - 0.5) * 2]
        : [colors.free, (0.5 - probability) * 0.7];
      const i = ((height - 1 - y) * width + x) * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

/** The cells as signed bytes, in the PLC's order (x * heightInCells + y). */
export function decodeCells(base64: string): Int8Array {
  const text = atob(base64);
  const cells = new Int8Array(text.length);
  for (let i = 0; i < text.length; i++) cells[i] = (text.charCodeAt(i) << 24) >> 24;
  return cells;
}

/** Keeps the map as a canvas image and rebuilds it only when the PLC sent a new revision or the theme changed. */
export class PlcMapImage {
  private canvas: HTMLCanvasElement | null = null;
  private revision = -1;
  private colorsKey = "";

  image(map: PlcMapMessage, colors: PlcMapColors): HTMLCanvasElement {
    const key = JSON.stringify(colors);
    if (this.canvas && map.revision === this.revision && key === this.colorsKey) return this.canvas;
    const canvas = this.canvas ?? document.createElement("canvas");
    canvas.width = map.widthInCells;
    canvas.height = map.heightInCells;
    const context = canvas.getContext("2d");
    if (context) {
      context.putImageData(new ImageData(plcMapPixels(map, colors), map.widthInCells, map.heightInCells), 0, 0);
    }
    this.canvas = canvas;
    this.revision = map.revision;
    this.colorsKey = key;
    return canvas;
  }
}

/** Resolves any CSS colour to [r, g, b] by letting a 1x1 canvas paint it. */
export function cssColorToRgb(color: string): [number, number, number] {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return [0, 0, 0];
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}
