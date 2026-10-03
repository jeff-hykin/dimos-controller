// Every action the Controller has, as an endpoint (http.ts). Robot streams stay direct (the page's zenoh-web link);
// commands go through here so the agent and the page drive the same way. Deno has no WebRTC, so the page that is
// connected to the robot publishes the Twists this backend decides on (event `drive` → its zenoh-web publisher, whose
// deadman stops the robot if the page dies); `dryRun` answers with what would be sent and publishes nothing.
import { HttpError, publishEvent, type Route } from "./http.ts"

export const DESCRIPTION =
    "Controller: drive a dimos robot (velocity commands, stop, arm/disarm teleop) and watch its camera, costmap, pose and planned path"

/** dimos puts a typed channel on `dimos/<topic>/<msg_name>`. */
export const TOPICS = {
    camera: "dimos/color_image/sensor_msgs.Image",
    pose: "dimos/odom/geometry_msgs.PoseStamped",
    costmap: "dimos/global_costmap/nav_msgs.OccupancyGrid",
    path: "dimos/path/nav_msgs.Path",
    teleop: "dimos/tele_cmd_vel/geometry_msgs.Twist",
} as const

const MAX_DURATION_MS = 3000
const PAGE_STALE_MS = 3000
const PANELS = ["video", "map", "teleop"] as const
type Panel = typeof PANELS[number]
type Layers = { camera: boolean; costmap: boolean; pose: boolean; path: boolean }
type Twist = { vx: number; vy: number; wz: number }
type PageReport = {
    zenoh?: string
    streams?: Record<string, { hz: number; ageMs: number | null; size?: string }>
    pose?: { x: number; y: number; yaw: number } | null
}

const controller = {
    armedBy: null as "keyboard" | "agent" | null,
    limits: { linear: 0.5, angular: 1.0, boost: 2 },
    layers: { camera: true, costmap: true, pose: true, path: true } as Layers,
    maximized: null as Panel | null,
    command: null as (Twist & { until: number; source: string; page: string }) | null,
    lastDryRun: null as (Twist & { durationMs: number; at: string }) | null,
}
/** pages open on the Controller: what each last reported (its zenoh-web link, stream rates, robot pose) */
const pages = new Map<string, { report: PageReport; seen: number }>()

function connectedPages(now = Date.now()) {
    return [...pages.entries()]
        .filter(([, page]) => now - page.seen < PAGE_STALE_MS && page.report.zenoh === "connected")
        .sort((a, b) => b[1].seen - a[1].seen)
        .map(([id]) => id)
}

function latestReport(): PageReport | null {
    const newest = [...pages.values()].sort((a, b) => b.seen - a.seen)[0]
    return newest && Date.now() - newest.seen < PAGE_STALE_MS ? newest.report : null
}

function changed() {
    publishEvent({ type: "state", state: state() })
}

function state() {
    const now = Date.now()
    const report = latestReport()
    const active = controller.command && controller.command.until > now ? controller.command : null
    return {
        robotLink: report?.zenoh ?? "no page open",
        connectedPages: connectedPages(now).length,
        streams: report?.streams ?? {},
        pose: report?.pose ?? null,
        armed: controller.armedBy !== null,
        armedBy: controller.armedBy,
        driving: active
            ? { vx: active.vx, vy: active.vy, wz: active.wz, source: active.source, remainingMs: active.until - now }
            : null,
        lastDryRun: controller.lastDryRun,
        limits: controller.limits,
        maxSpeed: {
            linear: controller.limits.linear * controller.limits.boost,
            angular: controller.limits.angular * controller.limits.boost,
        },
        layers: controller.layers,
        maximized: controller.maximized,
        topics: TOPICS,
    }
}

function number(value: unknown, name: string, fallback?: number): number {
    if (value === undefined && fallback !== undefined) {
        return fallback
    }
    const parsed = typeof value === "string" && value.trim() ? Number(value) : value
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
        throw new HttpError(400, `${name} must be a number`)
    }
    return parsed
}

function bool(value: unknown, name: string): boolean {
    if (value === true || value === "true") {
        return true
    }
    if (value === false || value === "false") {
        return false
    }
    throw new HttpError(400, `${name} must be true or false`)
}

function stop(reason: string) {
    const page = controller.command?.page
    controller.command = null
    publishEvent({ type: "stop", reason, page })
}

// GET api/view: the page draws its map and grabs a camera frame, and answers (POST api/captures/{request}).
const captures = new Map<string, (answer: unknown) => void>()
let captureCount = 0

async function captureView(timeoutMs = 5000) {
    const newest = [...pages.entries()].sort((a, b) => b[1].seen - a[1].seen)[0]
    if (!newest || Date.now() - newest[1].seen >= PAGE_STALE_MS) {
        throw new HttpError(503, "no Controller page is open to capture the view; open the app (open_app) and retry")
    }
    const request = `c${++captureCount}`
    const answer = new Promise<unknown>((resolve) => captures.set(request, resolve))
    publishEvent({ type: "capture", request, page: newest[0] })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)))
    const result = await Promise.race([answer, timeout])
    clearTimeout(timer)
    captures.delete(request)
    if (!result) {
        throw new HttpError(504, "the Controller page didn't answer the capture in time")
    }
    return { ...(result as object), pose: newest[1].report.pose ?? null, layers: controller.layers }
}

/** The page → backend replies that aren't actions (so not routes): status reports and capture answers. */
export async function pageMessage(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname.replace(/^\/+/, "")
    const report = path.match(/^api\/pages\/([\w-]+)\/report$/)
    if (report && request.method === "POST") {
        const body = await request.json().catch(() => null)
        if (!body || typeof body !== "object") {
            return Response.json({ error: "the report must be a JSON object" }, { status: 400 })
        }
        const before = connectedPages().length
        pages.set(report[1], { report: body as PageReport, seen: Date.now() })
        for (const [id, page] of pages) {
            if (Date.now() - page.seen > 60_000) {
                pages.delete(id)
            }
        }
        if (connectedPages().length !== before) {
            changed()
        }
        return Response.json({ ok: true })
    }
    const capture = path.match(/^api\/captures\/([\w-]+)$/)
    if (capture && request.method === "POST") {
        const resolve = captures.get(capture[1])
        captures.delete(capture[1])
        resolve?.(await request.json().catch(() => null))
        return Response.json({ ok: Boolean(resolve) }, { status: resolve ? 200 : 404 })
    }
    return null
}

export const routes: Route[] = [
    {
        method: "GET",
        path: "api/state",
        description:
            "The robot link (the open page's zenoh-web connection), stream rates (camera, costmap, pose, path), the robot's pose, whether teleop is armed, the active drive command, speed limits, map layers and the maximized panel",
        role: "context",
        handler: state,
    },
    {
        method: "GET",
        path: "api/view",
        description:
            "What the user sees: the costmap panel (map, robot pose, planned path) and the latest camera frame, as images, plus the robot pose (needs the app open in Desktop)",
        role: "view",
        handler: () => captureView(),
    },
    {
        method: "POST",
        path: "api/drive",
        description:
            "Drive the robot: body velocities vx (forward, m/s), vy (left, m/s), wz (turn left, rad/s) for durationMs (default 500, at most 3000), then it stops. Needs teleop armed (POST api/teleop/arm) and an open Controller page connected to the robot. dryRun=true moves nothing and answers with the Twist that would be sent",
        params: {
            vx: { type: "number", description: "m/s forward (+) / back (-)" },
            vy: { type: "number", description: "m/s left (+) / right (-)" },
            wz: { type: "number", description: "rad/s turn left (+) / right (-)" },
            durationMs: { type: "number", description: "how long, ms (default 500, max 3000)" },
            dryRun: { type: "boolean", description: "true: validate and report, publish nothing" },
            source: { type: "string", description: "agent (default) or keyboard (the page's pad)" },
        },
        handler: ({ vx, vy, wz, durationMs, dryRun, source }, request) => {
            const twist = { vx: number(vx, "vx", 0), vy: number(vy, "vy", 0), wz: number(wz, "wz", 0) }
            const duration = number(durationMs, "durationMs", 500)
            if (duration <= 0 || duration > MAX_DURATION_MS) {
                throw new HttpError(400, `durationMs must be between 1 and ${MAX_DURATION_MS}`)
            }
            const { linear, angular, boost } = controller.limits
            if (Math.abs(twist.vx) > linear * boost || Math.abs(twist.vy) > linear * boost) {
                throw new HttpError(400, `|vx| and |vy| must be at most ${linear * boost} m/s (api/teleop/limits)`)
            }
            if (Math.abs(twist.wz) > angular * boost) {
                throw new HttpError(400, `|wz| must be at most ${angular * boost} rad/s (api/teleop/limits)`)
            }
            const dry = dryRun === undefined ? false : bool(dryRun, "dryRun")
            if (dry) {
                controller.lastDryRun = { ...twist, durationMs: duration, at: new Date().toISOString() }
                publishEvent({ type: "dry-run", ...twist, durationMs: duration })
                changed()
                return {
                    dryRun: true,
                    topic: TOPICS.teleop,
                    twist,
                    durationMs: duration,
                    armed: controller.armedBy !== null,
                }
            }
            if (!controller.armedBy) {
                throw new HttpError(409, "teleop is disarmed: POST api/teleop/arm {armed: true} first")
            }
            const connected = connectedPages()
            if (!connected.length) {
                throw new HttpError(
                    503,
                    "no Controller page is connected to the robot (open the app; its zenoh-web link sends the commands)",
                )
            }
            // the page that asked (keyboard teleop) sends it; else the most recently active connected page
            const asker = request.headers.get("x-page-id")
            const page = asker && connected.includes(asker) ? asker : connected[0]
            controller.command = { ...twist, until: Date.now() + duration, source: String(source ?? "agent"), page }
            publishEvent({ type: "drive", page, ...twist, durationMs: duration })
            changed()
            return { dryRun: false, topic: TOPICS.teleop, twist, durationMs: duration, page }
        },
    },
    {
        method: "POST",
        path: "api/stop",
        description: "Stop the robot now (a zero Twist) and drop any drive command",
        handler: () => {
            stop("stop requested")
            changed()
            return { stopped: true }
        },
    },
    {
        method: "POST",
        path: "api/teleop/arm",
        description:
            "Arm or disarm driving (the teleop pad's mode). Disarming stops the robot. Drive commands are refused while disarmed",
        params: {
            armed: { type: "boolean", required: true },
            source: { type: "string", description: "agent (default) or keyboard (the page's pad)" },
        },
        handler: ({ armed, source }) => {
            const on = bool(armed, "armed")
            controller.armedBy = on ? (source === "keyboard" ? "keyboard" : "agent") : null
            if (!on) {
                stop("disarmed")
            }
            changed()
            return { armed: on, armedBy: controller.armedBy }
        },
    },
    {
        method: "POST",
        path: "api/teleop/limits",
        description:
            "Teleop speeds: linear (m/s) and angular (rad/s) for a keypress, and boost (the Shift multiplier, also the cap on drive commands)",
        params: {
            linear: { type: "number", description: "m/s (0 to 2)" },
            angular: { type: "number", description: "rad/s (0 to 4)" },
            boost: { type: "number", description: "multiplier (1 to 4)" },
        },
        handler: ({ linear, angular, boost }) => {
            const next = {
                linear: number(linear, "linear", controller.limits.linear),
                angular: number(angular, "angular", controller.limits.angular),
                boost: number(boost, "boost", controller.limits.boost),
            }
            if (next.linear < 0 || next.linear > 2 || next.angular < 0 || next.angular > 4) {
                throw new HttpError(400, "linear must be 0 to 2 m/s and angular 0 to 4 rad/s")
            }
            if (next.boost < 1 || next.boost > 4) {
                throw new HttpError(400, "boost must be 1 to 4")
            }
            controller.limits = next
            changed()
            return next
        },
    },
    {
        method: "POST",
        path: "api/layers",
        description:
            "Show or hide what the panels draw: camera (the video stream; off unsubscribes it), costmap, pose (robot arrow), path (planned path)",
        params: {
            camera: { type: "boolean" },
            costmap: { type: "boolean" },
            pose: { type: "boolean" },
            path: { type: "boolean" },
        },
        handler: (args) => {
            const next = { ...controller.layers }
            const keys = Object.keys(next) as (keyof Layers)[]
            const given = keys.filter((key) => args[key] !== undefined)
            if (!given.length) {
                throw new HttpError(400, `give at least one of ${keys.join(", ")}`)
            }
            for (const key of given) {
                next[key] = bool(args[key], key)
            }
            controller.layers = next
            changed()
            return next
        },
    },
    {
        method: "POST",
        path: "api/layout",
        description: "Maximize one panel (video, map or teleop) over the others, or none to restore the grid",
        params: { maximized: { type: "string", description: "video | map | teleop | none" } },
        handler: ({ maximized }) => {
            const value = maximized === undefined || maximized === null || maximized === "none"
                ? null
                : String(maximized)
            if (value !== null && !PANELS.includes(value as Panel)) {
                throw new HttpError(400, `maximized must be one of ${PANELS.join(", ")} or none`)
            }
            controller.maximized = value as Panel | null
            changed()
            return { maximized: controller.maximized }
        },
    },
]

/** For tests: forget pages and commands. */
export function resetForTests() {
    pages.clear()
    controller.armedBy = null
    controller.command = null
    controller.lastDryRun = null
}
