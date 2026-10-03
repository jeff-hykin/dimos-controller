// Keyboard teleop panel. Click to focus = arm (api/teleop/arm); armed by the pad only while it has focus, so typing
// anywhere else can never drive the robot. Held keys become api/drive commands (re-sent every 250 ms with a 600 ms
// lifetime, so a lost page stops on its own); release, blur or a hidden tab sends api/stop, and the bridge's deadman
// covers the page dying outright. The agent's commands (and dry runs) show here too.

import { useEffect, useRef, useState } from "react"
import type { FocusEvent, KeyboardEvent } from "react"
import { act, type ControllerState } from "../controller.ts"
import { PanelFrame } from "../layout/PanelFrame.tsx"
import { HANDLED_CODES, velocityFor } from "./teleop.ts"
import styles from "./TeleopPanel.module.css"

const RESEND_MS = 250
const COMMAND_MS = 600

const KEY_ROWS: { code: string; label: string }[][] = [
    [
        { code: "KeyQ", label: "Q" },
        { code: "KeyW", label: "W" },
        { code: "KeyE", label: "E" },
    ],
    [
        { code: "KeyA", label: "A" },
        { code: "KeyS", label: "S" },
        { code: "KeyD", label: "D" },
    ],
]

export function TeleopPanel({ topic, controller, ready, dryRun, maximized }: {
    topic: string
    controller: ControllerState
    /** this page's zenoh-web publisher is open (deadman set) */
    ready: boolean
    dryRun: { vx: number; vy: number; wz: number } | null
    maximized: boolean
}) {
    const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set())
    const [error, setError] = useState<string | null>(null)
    const padArmed = controller.armedBy === "keyboard"
    const keys = padArmed ? velocityFor(pressed, controller.limits) : { vx: 0, vy: 0, wz: 0, boosted: false }
    const moving = keys.vx !== 0 || keys.vy !== 0 || keys.wz !== 0
    const wasMoving = useRef(false)

    // held keys → drive commands; one stop when they let go
    useEffect(() => {
        const send = () =>
            act("POST", "api/drive", {
                vx: keys.vx,
                vy: keys.vy,
                wz: keys.wz,
                durationMs: COMMAND_MS,
                source: "keyboard",
            })
                .then(setError)
        if (!moving) {
            if (wasMoving.current) {
                void act("POST", "api/stop")
            }
            wasMoving.current = false
            return
        }
        wasMoving.current = true
        send()
        const id = setInterval(send, RESEND_MS)
        return () => clearInterval(id)
    }, [moving, keys.vx, keys.vy, keys.wz])

    const disarm = () => {
        setPressed(new Set())
        if (padArmed) {
            void act("POST", "api/teleop/arm", { armed: false })
        }
    }
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                disarm()
            }
        }
        globalThis.addEventListener("blur", disarm)
        document.addEventListener("visibilitychange", onVisibility)
        return () => {
            globalThis.removeEventListener("blur", disarm)
            document.removeEventListener("visibilitychange", onVisibility)
        }
    })

    const arm = () => {
        if (!padArmed) {
            void act("POST", "api/teleop/arm", { armed: true, source: "keyboard" }).then(setError)
        }
    }
    const onBlur = (e: FocusEvent<HTMLDivElement>) => {
        // Focus moves within the panel do not disarm; leaving the subtree does.
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) {
            return
        }
        disarm()
    }
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!HANDLED_CODES.has(e.code)) {
            return
        }
        e.preventDefault()
        if (e.repeat) {
            return
        }
        if (e.code === "Escape") {
            e.currentTarget.blur() // disarms; the next click re-arms
        } else if (e.code === "Space") {
            setPressed(new Set())
            void act("POST", "api/stop")
        } else {
            setPressed((held) => new Set(held).add(e.code))
        }
    }
    const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!HANDLED_CODES.has(e.code)) {
            return
        }
        e.preventDefault()
        setPressed((held) => {
            const next = new Set(held)
            next.delete(e.code)
            return next
        })
    }

    const driving = controller.driving
    const shown = dryRun ?? driving ?? keys
    const state = !controller.armed ? "disarmed" : ready || !padArmed ? "armed" : "arming"
    let banner
    if (dryRun) {
        banner = <span>dry run: nothing sent</span>
    } else if (state === "arming") {
        banner = <span className={styles.hint}>arming (deadman)...</span>
    } else if (state === "armed" && controller.armedBy === "agent") {
        banner = <span>armed by the agent{driving ? ` - driving (${driving.source})` : ""}</span>
    } else if (state === "armed") {
        banner = <span>armed - WASD drive, QE strafe, Shift boost, Space stop</span>
    } else {
        banner = <span className={styles.hint}>click to arm</span>
    }

    return (
        <PanelFrame id="teleop" title={`Teleop · ${topic.split("/")[1]}`} maximized={maximized}>
            <div
                tabIndex={0}
                role="application"
                aria-label="keyboard teleop"
                className={state === "armed" ? styles.padArmed : styles.pad}
                data-testid="teleop"
                data-state={state}
                onFocus={arm}
                onClick={arm}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
            >
                <div
                    className={`dim-alert ${dryRun ? "info" : state === "armed" ? "warn" : ""} ${styles.banner}`}
                    data-testid="teleop-banner"
                >
                    {banner}
                </div>
                <div className={styles.cluster}>
                    {KEY_ROWS.map((row) => (
                        <div key={row[0].code} className={styles.keyRow}>
                            {row.map(({ code, label }) => (
                                <span
                                    key={code}
                                    className={pressed.has(code) ? styles.keyDown : styles.key}
                                    data-testid={`teleop-key-${label}`}
                                    data-pressed={pressed.has(code) || undefined}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
                <div className={styles.readout} data-testid="teleop-readout">
                    <span>vx {shown.vx.toFixed(2)}</span>
                    <span>vy {shown.vy.toFixed(2)}</span>
                    <span>wz {shown.wz.toFixed(2)}</span>
                    {keys.boosted && <span className={styles.boost}>boost</span>}
                    <span title="speeds per keypress (api/teleop/limits)">
                        · {controller.limits.linear} m/s {controller.limits.angular} rad/s
                    </span>
                </div>
                {error && <div className={`dim-alert danger ${styles.banner}`}>{error}</div>}
            </div>
        </PanelFrame>
    )
}
