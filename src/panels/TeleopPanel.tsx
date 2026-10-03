// Keyboard teleop panel. Click to focus = arm; armed only while the pad has
// focus, so typing anywhere else can never drive the robot. Velocities repeat
// at 10 Hz while keys are held; release, blur or a hidden tab sends a stop,
// and the bridge's deadman covers the page dying outright.

import { useEffect, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { PanelFrame } from "../layout/PanelFrame.tsx";
import type { Link } from "../zenoh.ts";
import { HANDLED_CODES, TeleopSender, type Velocity, velocityFor } from "./teleop.ts";
import styles from "./TeleopPanel.module.css";

const REPEAT_MS = 100;

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
];

const ZERO: Velocity = { vx: 0, vy: 0, wz: 0, boosted: false };

export function TeleopPanel({ link, topic }: { link: Link; topic: string }) {
  const [sender] = useState(() => new TeleopSender(link, topic));
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set());
  const velocity = armed ? velocityFor(pressed) : ZERO;
  const moving = velocity.vx !== 0 || velocity.vy !== 0 || velocity.wz !== 0;

  useEffect(() => {
    sender.onChange = () => setReady(sender.ready);
    return () => sender.close();
  }, [sender]);

  // Repeat while moving; one stop when motion ends.
  useEffect(() => {
    if (!moving) {
      sender.stop();
      return;
    }
    sender.send(velocity);
    const id = setInterval(() => sender.send(velocity), REPEAT_MS);
    return () => clearInterval(id);
  }, [sender, moving, velocity.vx, velocity.vy, velocity.wz]);

  const disarm = () => {
    setArmed(false);
    setPressed(new Set());
    sender.stop();
  };
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") disarm();
    };
    globalThis.addEventListener("blur", disarm);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.removeEventListener("blur", disarm);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });

  const arm = () => {
    setArmed(true);
    void sender.arm();
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Focus moves within the panel do not disarm; leaving the subtree does.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    disarm();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!HANDLED_CODES.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Escape") {
      e.currentTarget.blur(); // disarms; the next click re-arms
    } else if (e.code === "Space") {
      setPressed(new Set());
      sender.stop();
    } else {
      setPressed((keys) => new Set(keys).add(e.code));
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!HANDLED_CODES.has(e.code)) return;
    e.preventDefault();
    setPressed((keys) => {
      const next = new Set(keys);
      next.delete(e.code);
      return next;
    });
  };

  const state = !armed ? "disarmed" : ready ? "armed" : "arming";
  let banner;
  if (state === "arming") {
    banner = <span className={styles.hint}>arming (deadman)...</span>;
  } else if (state === "armed") {
    banner = <span>armed - WASD drive, QE strafe, Shift boost, Space stop</span>;
  } else {
    banner = <span className={styles.hint}>click to arm</span>;
  }

  return (
    <PanelFrame id="teleop" title={`Teleop · ${topic.split("/")[1]}`}>
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
        <div className={`dim-alert ${state === "armed" ? "warn" : ""} ${styles.banner}`}>
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
          <span>vx {velocity.vx.toFixed(2)}</span>
          <span>vy {velocity.vy.toFixed(2)}</span>
          <span>wz {velocity.wz.toFixed(2)}</span>
          {velocity.boosted && <span className={styles.boost}>boost</span>}
        </div>
      </div>
    </PanelFrame>
  );
}
