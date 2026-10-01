// Shared panel chrome: frame, title bar, badge slot, and client-side maximize
// (CSS overlay + Esc restore).

import { type ReactNode, useEffect, useState } from "react";
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
  return (
    <span
      className={stale ? styles.badgeStale : styles.badge}
      data-testid={testId}
      data-state={state}
      role="status"
    >
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
      className={maximized ? styles.frameMax : styles.frame}
      data-testid={`panel-${id}`}
      data-maximized={maximized || undefined}
    >
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.controls}>
          {badge}
          <button
            type="button"
            className={styles.maxButton}
            aria-label={maximized ? "restore" : "maximize"}
            data-testid={`panel-${id}-max`}
            onClick={() => setMaximized((v) => !v)}
          >
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {maximized
                ? <path d="M4.5 1v3.5H1M7.5 1v3.5H11M4.5 11V7.5H1M7.5 11V7.5H11" />
                : <path d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5" />}
            </svg>
          </button>
        </span>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
