// Decoded dimos messages (as @dimos/msgs returns them) to what the map draws.

import type { GridPlacement, PathPoint, Pose2d } from "./mapRenderer.ts"

interface Vec3 {
    x: number
    y: number
    z: number
}
interface Quat extends Vec3 {
    w: number
}
interface Pose {
    position: Vec3
    orientation: Quat
}

export interface OccupancyGridMsg {
    info: { resolution: number; width: number; height: number; origin: Pose }
    data: ArrayLike<number>
}

export interface Grid extends GridPlacement {
    cells: Uint8Array
}

/** Heading about +z, from a quaternion. */
export function yawOf(q: Quat): number {
    return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
}

/** OccupancyGrid cells are int8 (-1 unknown, 0..100 cost); the palette wants uint8 with 255 = unknown. */
export function gridFromMsg(msg: OccupancyGridMsg): Grid | null {
    const { width: w, height: h, resolution: res, origin } = msg.info ?? {}
    if (!(w > 0) || !(h > 0) || !(res > 0) || msg.data?.length !== w * h) return null
    const cells = new Uint8Array(w * h)
    for (let i = 0; i < cells.length; i++) {
        const value = msg.data[i]
        cells[i] = value < 0 ? 255 : value
    }
    return {
        cells,
        w,
        h,
        res,
        origin: [origin.position.x, origin.position.y, yawOf(origin.orientation)],
    }
}

export function poseFromMsg(msg: { pose?: Pose }): Pose2d | null {
    const pose = msg?.pose
    if (!pose?.position || !pose.orientation) return null
    return { x: pose.position.x, y: pose.position.y, yaw: yawOf(pose.orientation) }
}

export function pathFromMsg(msg: { poses?: { pose?: Pose }[] }): PathPoint[] {
    const points: PathPoint[] = []
    for (const stamped of msg?.poses ?? []) {
        const p = stamped?.pose?.position
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) points.push([p.x, p.y])
    }
    return points
}
