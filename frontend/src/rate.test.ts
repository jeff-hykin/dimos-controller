import { describe, expect, it } from "vitest"
import { RateMeter } from "./rate.ts"

describe("RateMeter", () => {
    it("counts frames over a 2 s window and reports age", () => {
        let now = 0
        const meter = new RateMeter(() => now)
        expect(meter.snapshot()).toEqual({ frames: 0, hz: 0, ageMs: null })
        for (let i = 0; i < 10; i++) {
            now = i * 100
            meter.mark()
        }
        now = 1000
        expect(meter.snapshot()).toEqual({ frames: 10, hz: 5, ageMs: 100 })
        now = 5000
        expect(meter.snapshot()).toEqual({ frames: 10, hz: 0, ageMs: 4100 })
    })
})
