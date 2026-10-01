// Live camera: the bridge's dimos-image codec turns the dimos Image stream into
// an H.264 track, so the panel is just a <video> on the subscription's MediaStream.

import { useEffect, useRef, useState } from "react";
import { Badge, PanelFrame } from "../layout/PanelFrame.tsx";
import { RateMeter, useTick } from "../rate.ts";
import type { Link } from "../zenoh.ts";
import styles from "./VideoPanel.module.css";

// A frame this far behind is flagged stale (only trips on silence or stalls).
export const VIDEO_STALE_MS = 2000;

export function VideoPanel({ link, topic, title }: { link: Link; topic: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [meter] = useState(() => new RateMeter());
  const [size, setSize] = useState<string | null>(null);
  useTick();

  useEffect(() => {
    const sub = link.zenoh.subscribe(
      topic,
      { delivery: "latest", maxHz: 20, codec: "dimos-image" },
      (msg) => {
        meter.mark();
        const video = videoRef.current;
        if (video !== null && msg.mediaStream && video.srcObject !== msg.mediaStream) {
          video.srcObject = msg.mediaStream;
          video.play().catch(() => {});
        }
        if (msg.video) setSize(`${msg.video.width}×${msg.video.height}`);
      },
    );
    return () => sub.close();
  }, [link, topic, meter]);

  return (
    <PanelFrame
      id="video"
      title={size === null ? title : `${title} · ${size}`}
      badge={<Badge meter={meter} staleMs={VIDEO_STALE_MS} unit="fps" testId="video-badge" />}
    >
      <video
        ref={videoRef}
        className={styles.canvas}
        data-testid="video"
        muted
        playsInline
        autoPlay
      />
      {meter.frames === 0 && <span className={styles.waiting}>waiting for {topic}...</span>}
    </PanelFrame>
  );
}
