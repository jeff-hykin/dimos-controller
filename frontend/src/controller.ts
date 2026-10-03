// This page's side of the backend (backend/routes.ts): the controller state it shows, the reports that tell the backend
// this page is connected to the robot, and carrying out the drive commands the backend hands it (Deno has no WebRTC,
// so the page's zenoh-web publisher is the one that reaches the robot).
import { call, events } from "./api.ts"
import type { TeleopSender } from "./panels/teleop.ts"
import { RateMeter } from "./rate.ts"
import type { ConnectionState } from "./zenoh.ts"

export type Panel = "video" | "map" | "teleop"
export type Layers = { camera: boolean; costmap: boolean; pose: boolean; path: boolean }
export type Twist = { vx: number; vy: number; wz: number }
export type ControllerState = {
    robotLink: string
    connectedPages: number
    armed: boolean
    armedBy: "keyboard" | "agent" | null
    driving: (Twist & { source: string; remainingMs: number }) | null
    lastDryRun: (Twist & { durationMs: number; at: string }) | null
    limits: { linear: number; angular: number; boost: number }
    layers: Layers
    maximized: Panel | null
}

export const PAGE_ID = crypto.randomUUID()
/** Sent with this page's own commands, so the backend has this page publish them. */
export const PAGE_HEADERS = { "x-page-id": PAGE_ID }

/** What the panels measure, for the backend's state (and the agent). */
export const telemetry = {
    meters: { camera: new RateMeter(), costmap: new RateMeter() } as Record<string, RateMeter>,
    cameraSize: null as string | null,
    pose: null as { x: number; y: number; yaw: number } | null,
}

/** Reports this page's link and stream rates every second; returns a stop. */
export function startReporting(zenohState: () => ConnectionState | "no link"): () => void {
    const report = () => {
        const streams = Object.fromEntries(
            Object.entries(telemetry.meters).map(([name, meter]) => {
                const { hz, ageMs } = meter.snapshot()
                return [name, {
                    hz,
                    ageMs,
                    ...(name === "camera" && telemetry.cameraSize ? { size: telemetry.cameraSize } : {}),
                }]
            }),
        )
        call("POST", `api/pages/${PAGE_ID}/report`, { zenoh: zenohState(), streams, pose: telemetry.pose }).catch(
            () => {},
        )
    }
    report()
    const id = setInterval(report, 1000)
    return () => clearInterval(id)
}

const REPEAT_MS = 100

/**
 * Carries out `drive` / `stop` events meant for this page: arms the zenoh-web publisher (with its zero-Twist deadman),
 * repeats the Twist at 10 Hz for the command's duration, then stops. Returns an unsubscribe.
 */
export function followDriveCommands(
    sender: () => TeleopSender | null,
    onEvent: (event: { type?: string; [key: string]: unknown }) => void,
): () => void {
    let repeat: ReturnType<typeof setInterval> | undefined
    let end: ReturnType<typeof setTimeout> | undefined
    const clearTimers = () => {
        clearInterval(repeat)
        clearTimeout(end)
    }
    const halt = () => {
        clearTimers()
        sender()?.stop()
    }
    const unsubscribe = events((event) => {
        onEvent(event)
        if (event.type === "stop") {
            halt()
        } else if (event.type === "drive" && event.page === PAGE_ID) {
            const target = sender()
            if (!target) {
                return
            }
            clearTimers() // a new command replaces the last without a stop in between
            const twist = { vx: Number(event.vx), vy: Number(event.vy), wz: Number(event.wz) }
            void target.arm().then(() => target.send(twist))
            repeat = setInterval(() => target.send(twist), REPEAT_MS)
            end = setTimeout(halt, Number(event.durationMs))
        }
    })
    return () => {
        halt()
        unsubscribe()
    }
}

/** Calls an endpoint; returns the error message instead of throwing. */
export async function act(method: string, path: string, body?: unknown): Promise<string | null> {
    try {
        await call(method, path, body, PAGE_HEADERS)
        return null
    } catch (error) {
        return (error as Error).message
    }
}
