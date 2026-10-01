import { describe, expect, it } from "vitest";
import { gridFromMsg, pathFromMsg, poseFromMsg, yawOf } from "./messages.ts";

const quatYaw = (yaw: number) => ({ x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) });
const pose = (x: number, y: number, yaw = 0) => ({
  position: { x, y, z: 0 },
  orientation: quatYaw(yaw),
});

describe("yawOf", () => {
  it("reads the heading about +z", () => {
    expect(yawOf(quatYaw(0))).toBeCloseTo(0);
    expect(yawOf(quatYaw(1.2))).toBeCloseTo(1.2);
    expect(yawOf(quatYaw(-2.5))).toBeCloseTo(-2.5);
  });
});

describe("gridFromMsg", () => {
  it("maps int8 cells to the palette's uint8 (unknown -1 -> 255) and keeps the placement", () => {
    const grid = gridFromMsg({
      info: { resolution: 0.05, width: 2, height: 2, origin: pose(-1, 2, 0.5) },
      data: Int8Array.from([-1, 0, 50, 100]),
    });
    expect(grid).not.toBeNull();
    expect([...grid!.cells]).toEqual([255, 0, 50, 100]);
    expect(grid!.w).toBe(2);
    expect(grid!.res).toBe(0.05);
    expect(grid!.origin[0]).toBe(-1);
    expect(grid!.origin[1]).toBe(2);
    expect(grid!.origin[2]).toBeCloseTo(0.5);
  });

  it("refuses a grid whose data does not match its size", () => {
    expect(gridFromMsg({
      info: { resolution: 0.05, width: 3, height: 2, origin: pose(0, 0) },
      data: [0, 0],
    })).toBeNull();
  });
});

describe("poseFromMsg / pathFromMsg", () => {
  it("reads a PoseStamped", () => {
    const p = poseFromMsg({ pose: pose(1, 2, 0.3) });
    expect(p!.x).toBe(1);
    expect(p!.y).toBe(2);
    expect(p!.yaw).toBeCloseTo(0.3);
    expect(poseFromMsg({})).toBeNull();
  });

  it("reads a Path's xy, skipping non-finite points", () => {
    expect(
      pathFromMsg({ poses: [{ pose: pose(0, 1) }, { pose: pose(NaN, 1) }, { pose: pose(2, 3) }] }),
    )
      .toEqual([[0, 1], [2, 3]]);
    expect(pathFromMsg({})).toEqual([]);
  });
});
