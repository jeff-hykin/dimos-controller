// The link to the running dimos stack: Desktop's zenoh-web bridge, proxied at
// /zenoh-web on the page's own origin. The bridge client and the dimos message
// codec load from esm.sh at runtime (the same pinned URLs every dimOS app
// uses), so the build carries no copy of either.

export const ZENOH_WEB_CLIENT_URL =
  "https://esm.sh/gh/jeff-hykin/zenoh-web@63b72dd/client/zenoh_web.ts";
export const DIMOS_MSGS_URL = "https://esm.sh/jsr/@dimos/msgs@0.1.4";

/** dimos puts a typed channel on `dimos/<topic>/<msg_name>`. */
export const TOPICS = {
  image: "dimos/color_image/sensor_msgs.Image",
  odom: "dimos/odom/geometry_msgs.PoseStamped",
  costmap: "dimos/global_costmap/nav_msgs.OccupancyGrid",
  path: "dimos/path/nav_msgs.Path",
  teleop: "dimos/tele_cmd_vel/geometry_msgs.Twist",
} as const;

export type ConnectionState = "connecting" | "connected" | "degraded" | "lost";

export interface Message {
  key: string;
  bytes: Uint8Array;
  timestamp: number;
  mediaStream?: MediaStream;
  video?: { width: number; height: number; quality: number };
}

export interface SubscribeOptions {
  delivery?: "latest" | "reliable";
  maxHz?: number;
  codec?: string;
}

export interface Subscription {
  close(): void;
}

export interface Publisher {
  readonly state: "connecting" | "open" | "tripped" | "rejected" | "closed";
  put(bytes: Uint8Array): void;
  ready(): Promise<void>;
  setDeadman(bytes: Uint8Array): Promise<void>;
  onTripped(listener: (reason: string) => void): () => void;
  close(): void;
}

/** The slice of the zenoh-web client this app uses (see zenoh-web's SPEC.md). */
export interface ZenohWeb {
  state: ConnectionState;
  subscribe(
    key: string,
    options: SubscribeOptions,
    onMessage: (msg: Message) => void,
  ): Subscription;
  publisher(
    key: string,
    options: { delivery?: "latest" | "reliable"; priority?: number; latencyLimit?: number },
  ): Publisher;
  onState(listener: (state: ConnectionState) => void): () => void;
}

/** @dimos/msgs: decode() reads any dimos message (it carries its type hash). */
export interface DimosMsgs {
  decode(bytes: Uint8Array): unknown;
  geometry_msgs: {
    Twist: new (init: object) => { encode(): Uint8Array };
    Vector3: new (init: object) => object;
  };
}

export interface Link {
  zenoh: ZenohWeb;
  msgs: DimosMsgs;
}

/** zenoh's REAL_TIME priority (zenoh-web's Priority.REAL_TIME). */
export const PRIORITY_REAL_TIME = 1;

/** Connect to the bridge, retrying every 3 s until it answers. */
export async function openLink(bridgeUrl: string): Promise<Link> {
  const [client, msgs] = await Promise.all([
    import(/* @vite-ignore */ ZENOH_WEB_CLIENT_URL),
    import(/* @vite-ignore */ DIMOS_MSGS_URL),
  ]);
  for (;;) {
    try {
      // A missed heartbeat for 2 s (8 beats at 4 Hz) trips the teleop deadman.
      const zenoh = await client.connect(bridgeUrl, { heartbeatHz: 4, heartbeatMisses: 8 });
      return { zenoh: zenoh as ZenohWeb, msgs: msgs as DimosMsgs };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
