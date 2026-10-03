import type { ConnectionState } from "../zenoh.ts";
import styles from "./StatusBar.module.css";

const TONE: Record<ConnectionState, string> = {
  connecting: "warn",
  connected: "ok",
  degraded: "warn",
  lost: "danger",
};

const PHASE: Record<ConnectionState, string> = {
  connecting: "connecting",
  connected: "connected",
  degraded: "reconnecting",
  lost: "failed",
};

export function StatusBar({ state, bridge }: { state: ConnectionState; bridge: string }) {
  return (
    <header className={styles.bar}>
      <span className={styles.brand}>
        dimOS <span className={styles.brandSub}>Controller</span>
      </span>
      <span className={styles.spacer} />
      <span
        className={`dim-badge ${TONE[state]} ${styles.pill}`}
        data-testid="status"
        data-phase={PHASE[state]}
      >
        <span className="dot" />
        {state === "degraded" ? "reconnecting" : state}
      </span>
      <span className={styles.relay} data-testid="bridge" title="zenoh-web bridge">{bridge}</span>
    </header>
  );
}
