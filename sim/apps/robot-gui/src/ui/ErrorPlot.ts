import type { ErrorSample } from "../source/SimulationSource";
import type { CanvasTheme } from "../view/theme";

/** Small chart of position error over the last minute, one line per estimate. */
export class ErrorPlot {
  private context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Nettleseren støtter ikke canvas.");
    this.context = context;
  }

  draw(history: readonly ErrorSample[], theme: CanvasTheme): void {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(width * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const c = this.context;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, width, height);

    const left = 34;
    const bottom = height - 16;
    const top = 8;
    const right = width - 6;
    const maxError = niceCeiling(Math.max(0.05, ...history.map((s) => Math.max(s.wheelsErrorInM, s.gyroErrorInM))));

    c.strokeStyle = theme.grid;
    c.lineWidth = 1;
    c.fillStyle = theme.muted;
    c.font = `10px ${theme.mono}`;
    c.textAlign = "right";
    c.textBaseline = "middle";
    for (const fraction of [0, 0.5, 1]) {
      const y = bottom - (bottom - top) * fraction;
      c.beginPath();
      c.moveTo(left, Math.round(y) + 0.5);
      c.lineTo(right, Math.round(y) + 0.5);
      c.stroke();
      c.fillText(`${formatMeters(maxError * fraction)}`, left - 4, y);
    }
    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.fillText("siste 60 s", left, height - 3);

    if (history.length < 2) return;
    const first = history[0]!.timeInS;
    const span = Math.max(60, history[history.length - 1]!.timeInS - first);
    const x = (t: number) => left + ((t - first) / span) * (right - left);
    const y = (e: number) => bottom - (e / maxError) * (bottom - top);
    const line = (pick: (s: ErrorSample) => number, color: string) => {
      c.strokeStyle = color;
      c.lineWidth = 1.75;
      c.beginPath();
      history.forEach((s, i) => (i === 0 ? c.moveTo(x(s.timeInS), y(pick(s))) : c.lineTo(x(s.timeInS), y(pick(s)))));
      c.stroke();
      const last = history[history.length - 1]!;
      c.fillStyle = color;
      c.beginPath();
      c.arc(x(last.timeInS), y(pick(last)), 2.5, 0, Math.PI * 2);
      c.fill();
    };
    line((s) => s.wheelsErrorInM, theme.wheels);
    line((s) => s.gyroErrorInM, theme.gyro);
  }
}

function niceCeiling(value: number): number {
  const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
  return steps.find((s) => s >= value) ?? Math.ceil(value);
}

function formatMeters(value: number): string {
  return value < 1 ? `${Math.round(value * 100)} cm` : `${value.toFixed(1)} m`;
}
