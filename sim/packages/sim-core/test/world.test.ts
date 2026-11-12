import { describe, expect, it } from "vitest";
import { Vec2, World } from "@garage/sim-core";
import { emptyBoxWorld } from "./fixtures";

describe("World", () => {
  it("measures the distance from the centre to a wall", () => {
    const world = new World(emptyBoxWorld);
    const hit = world.raycast(new Vec2(2, 2), 0, 10);
    expect(hit?.distanceInM).toBeCloseTo(2, 6);
  });

  it("hits a circle placed in front of the ray", () => {
    const world = new World(emptyBoxWorld);
    world.add({ id: "bin", kind: "bin", label: "Dunk", shape: { type: "circle", radiusInM: 0.25 }, x: 3, y: 2, thetaInRad: 0 });
    expect(world.raycast(new Vec2(2, 2), 0, 10)?.distanceInM).toBeCloseTo(0.75, 6);
  });

  it("sees an object again after it is moved", () => {
    const world = new World(emptyBoxWorld);
    world.add({ id: "box", kind: "shelf", label: "Kasse", shape: { type: "rect", widthInM: 0.4, lengthInM: 0.4 }, x: 3, y: 2, thetaInRad: 0 });
    expect(world.raycast(new Vec2(2, 2), 0, 10)?.distanceInM).toBeCloseTo(0.8, 6);
    world.update("box", { y: 3 });
    expect(world.raycast(new Vec2(2, 2), 0, 10)?.distanceInM).toBeCloseTo(2, 6);
  });

  it("reports lower friction inside an oil spill", () => {
    const world = new World(emptyBoxWorld);
    world.add({ id: "oil", kind: "oil", label: "Olje", shape: { type: "circle", radiusInM: 0.5 }, x: 1, y: 1, thetaInRad: 0, friction: 0.3 });
    expect(world.frictionAt(new Vec2(1, 1))).toBe(0.3);
    expect(world.frictionAt(new Vec2(3, 3))).toBe(1);
  });
});
