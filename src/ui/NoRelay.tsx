import styles from "./NoRelay.module.css";

/** Shown instead of the cockpit while no relay answers at `relay`. */
export function NoRelay({ relay }: { relay: string }) {
  return (
    <div className={styles.empty} data-testid="no-relay">
      <div className={styles.mark} aria-hidden="true" />
      <h1 className={styles.title}>No robot running</h1>
      <p className={styles.hint}>Start a blueprint with a relay from Desktop.</p>
      <p className={styles.relay}>
        Waiting for a relay at <code>{relay}</code>
      </p>
    </div>
  );
}
