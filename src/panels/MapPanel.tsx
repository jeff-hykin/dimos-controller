// 2D map: the costmap (nav_msgs/OccupancyGrid), the robot pose and the planned
// path, all raw dimos messages off zenoh-web decoded with @dimos/msgs. Canvas
// updates bypass React; the badge rides the slower UI tick.

import { useEffect, useRef, useState } from "react";
import { Badge, PanelFrame } from "../layout/PanelFrame.tsx";
import { RateMeter, useTick } from "../rate.ts";
import type { Link } from "../zenoh.ts";
import styles from "./MapPanel.module.css";
import {
  drawPath,
  drawPose,
  fitTransform,
  gridBlit,
  type GridPlacement,
  gridToImageData,
  type PathPoint,
  type Pose2d,
} from "./mapRenderer.ts";
import { gridFromMsg, type OccupancyGridMsg, pathFromMsg, poseFromMsg } from "./messages.ts";

// Costmaps tick at ~1-5 Hz; staleness only trips on real silence.
export const MAP_STALE_MS = 5000;

export interface MapTopics {
  costmap: string;
  pose: string;
  path: string;
}

/**
 * Subscribe the three streams and draw into `canvas`: the grid bitmap is
 * rebuilt only on a new grid, pose and path redraw over it. Returns the cleanup.
 */
export function startMapSink(
  link: Link,
  topics: MapTopics,
  canvas: HTMLCanvasElement,
  meter: RateMeter,
): () => void {
  const ctx = canvas.getContext("2d");
  const gridCanvas = document.createElement("canvas");
  const gridCtx = gridCanvas.getContext("2d");
  let imageData: ImageData | undefined;
  let place: GridPlacement | null = null;
  let pose: Pose2d | null = null;
  let path: PathPoint[] = [];

  const draw = (): void => {
    if (document.hidden || ctx === null || place === null) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const t = fitTransform(place, w, h);
    ctx.imageSmoothingEnabled = false; // crisp cells when zoomed in
    const { ax, ay, rot, dw, dh } = gridBlit(t, place);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(rot);
    ctx.drawImage(gridCanvas, 0, -dh, dw, dh);
    ctx.restore();
    if (path.length > 1) drawPath(ctx, t, path, dpr);
    if (pose !== null) drawPose(ctx, t, pose, dpr);
  };

  const decode = (bytes: Uint8Array): unknown => {
    try {
      return link.msgs.decode(bytes);
    } catch {
      return null;
    }
  };
  const subs = [
    link.zenoh.subscribe(topics.costmap, { delivery: "latest", maxHz: 5 }, (msg) => {
      const grid = gridFromMsg(decode(msg.bytes) as OccupancyGridMsg);
      if (grid === null) return;
      meter.mark();
      if (gridCanvas.width !== grid.w || gridCanvas.height !== grid.h) {
        // Assigning a canvas dimension resets its backing store, so only on real changes.
        gridCanvas.width = grid.w;
        gridCanvas.height = grid.h;
      }
      imageData = gridToImageData(grid.cells, grid.w, grid.h, imageData);
      gridCtx?.putImageData(imageData, 0, 0);
      place = { w: grid.w, h: grid.h, res: grid.res, origin: grid.origin };
      draw();
    }),
    link.zenoh.subscribe(topics.pose, { delivery: "latest", maxHz: 15 }, (msg) => {
      pose = poseFromMsg(decode(msg.bytes) as Parameters<typeof poseFromMsg>[0]) ?? pose;
      draw();
    }),
    link.zenoh.subscribe(topics.path, { delivery: "latest", maxHz: 5 }, (msg) => {
      path = pathFromMsg(decode(msg.bytes) as Parameters<typeof pathFromMsg>[0]);
      draw();
    }),
  ];
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", draw);
  return () => {
    for (const sub of subs) sub.close();
    observer.disconnect();
    document.removeEventListener("visibilitychange", draw);
  };
}

export function MapPanel({ link, topics }: { link: Link; topics: MapTopics }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [meter] = useState(() => new RateMeter());
  useTick();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    return startMapSink(link, topics, canvas, meter);
  }, [link, topics, meter]);

  return (
    <PanelFrame
      id="map"
      title="Costmap"
      badge={<Badge meter={meter} staleMs={MAP_STALE_MS} unit="Hz" testId="map-badge" />}
    >
      <canvas ref={canvasRef} className={styles.canvas} data-testid="map-canvas" role="img" />
      {meter.frames === 0 && <span className={styles.waiting}>waiting for {topics.costmap}...
      </span>}
    </PanelFrame>
  );
}
