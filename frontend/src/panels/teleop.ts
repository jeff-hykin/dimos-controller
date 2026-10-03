// Keyboard teleop without React: held keys -> Twist, and a publisher that
// carries a zero-Twist deadman on the bridge.

import { type Link, PRIORITY_REAL_TIME, type Publisher } from "../zenoh.ts"

export const HANDLED_CODES = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyQ",
    "KeyE",
    "ShiftLeft",
    "ShiftRight",
    "Space",
    "Escape",
])

export interface TeleopLimits {
    linear: number
    angular: number
    /** multiplier while Shift is held */
    boost: number
}

export const DEFAULT_LIMITS: TeleopLimits = { linear: 0.5, angular: 1.0, boost: 2 }

export interface Velocity {
    vx: number
    vy: number
    wz: number
    boosted: boolean
}

/** W/S forward-back (linear.x), A/D turn (angular.z), Q/E strafe (linear.y): dimos's cmd_vel convention. */
export function velocityFor(pressed: ReadonlySet<string>, limits = DEFAULT_LIMITS): Velocity {
    const axis = (plus: string, minus: string) => (pressed.has(plus) ? 1 : 0) - (pressed.has(minus) ? 1 : 0)
    const boosted = pressed.has("ShiftLeft") || pressed.has("ShiftRight")
    const gain = boosted ? limits.boost : 1
    return {
        vx: axis("KeyW", "KeyS") * limits.linear * gain,
        vy: axis("KeyQ", "KeyE") * limits.linear * gain,
        wz: axis("KeyA", "KeyD") * limits.angular * gain,
        boosted,
    }
}

export function twistBytes(link: Link, v: { vx: number; vy: number; wz: number }): Uint8Array {
    const { Twist, Vector3 } = link.msgs.geometry_msgs
    return new Twist({
        linear: new Vector3({ x: v.vx, y: v.vy, z: 0 }),
        angular: new Vector3({ x: 0, y: 0, z: v.wz }),
    }).encode()
}

/**
 * One armed publisher at a time. The deadman makes the bridge publish a stop
 * if this page stops heartbeating; once it fires (or the link drops) the
 * publisher is spent, so the next arm() makes a fresh one.
 */
export class TeleopSender {
    #link: Link
    #topic: string
    #publisher: Publisher | null = null
    #stop: Uint8Array
    onChange: () => void = () => {}

    constructor(link: Link, topic: string) {
        this.#link = link
        this.#topic = topic
        this.#stop = twistBytes(link, { vx: 0, vy: 0, wz: 0 })
    }

    get ready(): boolean {
        return this.#publisher?.state === "open"
    }

    async arm(): Promise<void> {
        if (this.#publisher !== null && ["connecting", "open"].includes(this.#publisher.state)) return
        const publisher = this.#link.zenoh.publisher(this.#topic, {
            delivery: "latest",
            priority: PRIORITY_REAL_TIME,
            latencyLimit: 300,
        })
        this.#publisher = publisher
        publisher.onTripped(() => this.onChange())
        try {
            await publisher.ready()
            await publisher.setDeadman(this.#stop)
        } catch (error) {
            console.warn("controller: teleop publisher not armed", error)
        }
        this.onChange()
    }

    send(v: { vx: number; vy: number; wz: number }): void {
        if (!this.ready) return
        try {
            this.#publisher?.put(twistBytes(this.#link, v))
        } catch {
            // tripped or closed: the next arm() replaces it
        }
    }

    stop(): void {
        this.send({ vx: 0, vy: 0, wz: 0 })
    }

    close(): void {
        this.stop()
        this.#publisher?.close()
        this.#publisher = null
    }
}
