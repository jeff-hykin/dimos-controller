import { describe, expect, it, vi } from "vitest"
import type { Link, Publisher } from "../zenoh.ts"
import { DEFAULT_LIMITS, TeleopSender, velocityFor } from "./teleop.ts"

describe("velocityFor", () => {
    it("maps WASD/QE to vx, wz, vy", () => {
        expect(velocityFor(new Set(["KeyW"]))).toEqual({ vx: 0.5, vy: 0, wz: 0, boosted: false })
        expect(velocityFor(new Set(["KeyS", "KeyD"]))).toEqual({
            vx: -0.5,
            vy: 0,
            wz: -1,
            boosted: false,
        })
        expect(velocityFor(new Set(["KeyQ"]))).toEqual({ vx: 0, vy: 0.5, wz: 0, boosted: false })
    })

    it("cancels opposite keys and boosts with Shift", () => {
        expect(velocityFor(new Set(["KeyW", "KeyS"])).vx).toBe(0)
        const v = velocityFor(new Set(["KeyW", "ShiftLeft"]), { ...DEFAULT_LIMITS, boost: 3 })
        expect(v).toEqual({ vx: 1.5, vy: 0, wz: 0, boosted: true })
    })
})

function fakeLink() {
    const puts: unknown[] = []
    let deadman: unknown = null
    const publisher: Publisher = {
        state: "connecting",
        put: (bytes) => puts.push(bytes),
        ready: () => {
            ;(publisher as { state: string }).state = "open"
            return Promise.resolve()
        },
        setDeadman: (bytes) => {
            deadman = bytes
            return Promise.resolve()
        },
        onTripped: () => () => {},
        close: vi.fn(),
    }
    class Vector3 {
        constructor(init: object) {
            Object.assign(this, init)
        }
    }
    class Twist {
        init: object
        constructor(init: object) {
            this.init = init
        }
        encode() {
            return this.init as unknown as Uint8Array
        }
    }
    const link = {
        zenoh: { publisher: vi.fn(() => publisher) },
        msgs: { geometry_msgs: { Twist, Vector3 } },
    } as unknown as Link
    return { link, puts, publisher, deadman: () => deadman }
}

describe("TeleopSender", () => {
    it("sends nothing until armed, then arms a zero-Twist deadman", async () => {
        const { link, puts, deadman } = fakeLink()
        const sender = new TeleopSender(link, "dimos/tele_cmd_vel/geometry_msgs.Twist")
        sender.send({ vx: 1, vy: 0, wz: 0 })
        expect(puts).toHaveLength(0)
        await sender.arm()
        expect(deadman()).toEqual({ linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } })
        sender.send({ vx: 1, vy: 0, wz: 0.5 })
        expect(puts).toEqual([{ linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.5 } }])
    })

    it("re-arming an open publisher does not make another", async () => {
        const { link } = fakeLink()
        const sender = new TeleopSender(link, "k")
        await sender.arm()
        await sender.arm()
        expect(link.zenoh.publisher).toHaveBeenCalledTimes(1)
    })

    it("close() stops then closes", async () => {
        const { link, puts, publisher } = fakeLink()
        const sender = new TeleopSender(link, "k")
        await sender.arm()
        sender.close()
        expect(puts.at(-1)).toEqual({ linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } })
        expect(publisher.close).toHaveBeenCalled()
    })
})
