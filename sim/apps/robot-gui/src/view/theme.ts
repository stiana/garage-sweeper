export interface CanvasTheme {
  floor: string;
  grid: string;
  wall: string;
  object: string;
  objectFill: string;
  oil: string;
  ink: string;
  muted: string;
  accent: string;
  truth: string;
  wheels: string;
  gyro: string;
  plc: string;
  scan: string;
  hit: string;
  annotation: string;
  noGo: string;
  dock: string;
  font: string;
  mono: string;
}

/** Reads the page's colour tokens so the canvas follows light and dark themes. */
export function readCanvasTheme(): CanvasTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    floor: token("--floor"),
    grid: token("--grid"),
    wall: token("--wall"),
    object: token("--object-line"),
    objectFill: token("--object-fill"),
    oil: token("--oil"),
    ink: token("--ink"),
    muted: token("--muted"),
    accent: token("--accent"),
    truth: token("--truth"),
    wheels: token("--wheels"),
    gyro: token("--gyro"),
    plc: token("--plc"),
    scan: token("--scan"),
    hit: token("--hit"),
    annotation: token("--annotation"),
    noGo: token("--no-go"),
    dock: token("--dock"),
    font: token("--font-body"),
    mono: token("--font-data"),
  };
}
