// Shared panel chrome: frame, title bar, badge slot, and client-side maximize
// (CSS overlay + Esc restore).

import { type ReactNode, useEffect, useState } from "react";
import { DIM_ICON_PATHS } from "../dim-icons.js";
import type { RateMeter } from "../rate.ts";
import styles from "./PanelFrame.module.css";

/** Hz/staleness readout for a panel's primary stream, sampled on the parent's UI tick. */
export function Badge({ meter, staleMs, unit, testId }: {
  meter: RateMeter;
  staleMs: number;
  unit: string;
  testId: string;
}) {
  const stats = meter.snapshot();
  let text: string;
  let stale = false;
  if (stats.frames === 0) {
    text = "waiting";
  } else if (stats.ageMs !== null && stats.ageMs > staleMs) {
    text = `stale ${(stats.ageMs / 1000).toFixed(1)} s`;
    stale = true;
  } else {
    text = `${stats.hz.toFixed(1)} ${unit}`;
  }
  const state = stats.frames === 0 ? "waiting" : stale ? "stale" : "live";
  const tone = state === "live" ? "ok" : state === "stale" ? "warn" : "";
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
  );
}

export function PanelFrame({ id, title, badge, children }: {
  id: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMaximized(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);
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
            onClick={() => setMaximized((v) => !v)}
          >
            <svg className="dim-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d={DIM_ICON_PATHS[maximized ? "fullscreen-exit" : "fullscreen"]} />
            </svg>
          </button>
        </span>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
