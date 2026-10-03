// Shared panel chrome: frame, title bar, badge slot, and client-side maximize
// (CSS overlay + Esc restore).

import { type ReactNode, useEffect } from "react"
import { act, type Panel } from "../controller.ts"
import { DIM_ICON_PATHS } from "../dim-icons.js"
import type { RateMeter } from "../rate.ts"
import styles from "./PanelFrame.module.css"

/** Hz/staleness readout for a panel's primary stream, sampled on the parent's UI tick. */
export function Badge({ meter, staleMs, unit, testId }: {
    meter: RateMeter
    staleMs: number
    unit: string
    testId: string
}) {
    const stats = meter.snapshot()
    let text: string
    let stale = false
    if (stats.frames === 0) {
        text = "waiting"
    } else if (stats.ageMs !== null && stats.ageMs > staleMs) {
        text = `stale ${(stats.ageMs / 1000).toFixed(1)} s`
        stale = true
    } else {
        text = `${stats.hz.toFixed(1)} ${unit}`
    }
    const state = stats.frames === 0 ? "waiting" : stale ? "stale" : "live"
    const tone = state === "live" ? "ok" : state === "stale" ? "warn" : ""
    return (
        <span
            className={`dim-badge ${tone} ${styles.badge}`}
            data-testid={testId}
            data-state={state}
            role="status"
        >
            <span className="dot" />
            {text}
        </span>
    )
}

/** `maximized` is the backend's layout (api/layout): the button and Esc change it there, so the agent can too. */
export function PanelFrame({ id, title, badge, maximized, children }: {
    id: Panel
    title: string
    badge?: ReactNode
    maximized: boolean
    children: ReactNode
}) {
    const setMaximized = (on: boolean) => void act("POST", "api/layout", { maximized: on ? id : "none" })
    useEffect(() => {
        if (!maximized) return
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") setMaximized(false)
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    }, [maximized])
    return (
        <section
            className={`dim-panel ${maximized ? styles.frameMax : styles.frame}`}
            data-testid={`panel-${id}`}
            data-maximized={maximized || undefined}
        >
            <div className={styles.head}>
                <span className={`dim-label ${styles.title}`}>{title}</span>
                <span className={styles.controls}>
                    {badge}
                    <button
                        type="button"
                        className={`dim-btn icon ghost ${styles.maxButton}`}
                        aria-label={maximized ? "restore" : "maximize"}
                        data-testid={`panel-${id}-max`}
                        onClick={() => setMaximized(!maximized)}
                    >
                        <svg className="dim-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d={DIM_ICON_PATHS[maximized ? "fullscreen-exit" : "fullscreen"]} />
                        </svg>
                    </button>
                </span>
            </div>
            <div className={styles.body}>{children}</div>
        </section>
    )
}

/** A small on/off toggle for a panel header (map layers, camera). */
export function LayerToggle({ label, on, layer }: { label: string; on: boolean; layer: string }) {
    return (
        <button
            type="button"
            className={`dim-btn sm ${on ? "" : "ghost"} ${styles.toggle}`}
            aria-pressed={on}
            data-testid={`layer-${layer}`}
            title={`${on ? "hide" : "show"} ${label}`}
            onClick={() => void act("POST", "api/layers", { [layer]: !on })}
        >
            {label}
        </button>
    )
}
