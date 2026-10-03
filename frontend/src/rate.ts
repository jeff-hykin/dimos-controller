// Per-stream arrival rate for the panel badges: frames counted by the panel's
// subscription, sampled by React on a slow tick.

import { useEffect, useState } from "react"

export interface RateSnapshot {
    frames: number
    hz: number
    /** ms since the last frame; null before the first */
    ageMs: number | null
}

const WINDOW_MS = 2000

export class RateMeter {
    frames = 0
    #lastAtMs = 0
    #recent: number[] = []

    #now: () => number

    constructor(now: () => number = Date.now) {
        this.#now = now
    }

    mark(): void {
        this.frames += 1
        this.#lastAtMs = this.#now()
        this.#recent.push(this.#lastAtMs)
    }

    snapshot(): RateSnapshot {
        const now = this.#now()
        while (this.#recent.length > 0 && now - this.#recent[0] > WINDOW_MS) this.#recent.shift()
        return {
            frames: this.frames,
            hz: this.#recent.length / (WINDOW_MS / 1000),
            ageMs: this.frames === 0 ? null : now - this.#lastAtMs,
        }
    }
}

/** Re-render every `periodMs`; badges read their meters on this tick. */
export function useTick(periodMs = 500): number {
    const [tick, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), periodMs)
        return () => clearInterval(id)
    }, [periodMs])
    return tick
}
