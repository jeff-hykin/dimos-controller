import { useEffect, useMemo, useRef, useState } from "react"
import { call } from "./api.ts"
import { type ControllerState, followDriveCommands, PAGE_ID, startReporting } from "./controller.ts"
import { MapPanel, type MapTopics } from "./panels/MapPanel.tsx"
import { TeleopSender } from "./panels/teleop.ts"
import { TeleopPanel } from "./panels/TeleopPanel.tsx"
import { VideoPanel } from "./panels/VideoPanel.tsx"
import { StatusBar } from "./ui/StatusBar.tsx"
import { type ConnectionState, type Link, TOPICS } from "./zenoh.ts"
import styles from "./App.module.css"

const MAP_TOPICS: MapTopics = { costmap: TOPICS.costmap, pose: TOPICS.odom, path: TOPICS.path }

/** The page's answer to GET api/view: the map canvas and a camera frame, as PNGs. */
function capture() {
    const png = (canvas: HTMLCanvasElement | null) =>
        canvas && canvas.width > 0 ? { mimeType: "image/png", data: canvas.toDataURL("image/png").split(",")[1] } : null
    const video = document.querySelector<HTMLVideoElement>("[data-testid=video]")
    let camera = null
    if (video && video.videoWidth > 0) {
        const canvas = document.createElement("canvas")
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        canvas.getContext("2d")?.drawImage(video, 0, 0)
        camera = png(canvas)
    }
    return { map: png(document.querySelector<HTMLCanvasElement>("[data-testid=map-canvas]")), camera }
}

export function App({ link, bridge }: { link: Link | null; bridge: string }) {
    const [state, setState] = useState<ConnectionState>(link?.zenoh.state ?? "connecting")
    const [controller, setController] = useState<ControllerState | null>(null)
    const [dryRun, setDryRun] = useState<{ vx: number; vy: number; wz: number } | null>(null)
    const sender = useMemo(() => (link ? new TeleopSender(link, TOPICS.teleop) : null), [link])
    const senderRef = useRef(sender)
    senderRef.current = sender
    const zenohState = useRef<ConnectionState | "no link">("no link")

    useEffect(() => {
        if (link === null) {
            return
        }
        setState(link.zenoh.state)
        zenohState.current = link.zenoh.state
        return link.zenoh.onState((next) => {
            setState(next)
            zenohState.current = next
        })
    }, [link])
    const [ready, setReady] = useState(false)
    useEffect(() => {
        if (!sender) {
            return
        }
        sender.onChange = () => setReady(sender.ready)
        return () => sender.close()
    }, [sender])

    // backend state, this page's reports, and the drive commands the backend hands this page
    useEffect(() => {
        call<ControllerState>("GET", "api/state").then(setController, () => {})
        const stopReporting = startReporting(() => zenohState.current)
        let dryRunTimer: ReturnType<typeof setTimeout> | undefined
        const unfollow = followDriveCommands(() => senderRef.current, (event) => {
            if (event.type === "state") {
                setController(event.state as ControllerState)
            } else if (event.type === "dry-run") {
                setDryRun({ vx: Number(event.vx), vy: Number(event.vy), wz: Number(event.wz) })
                clearTimeout(dryRunTimer)
                dryRunTimer = setTimeout(() => setDryRun(null), Math.max(1500, Number(event.durationMs)))
            } else if (event.type === "capture" && event.page === PAGE_ID) {
                call("POST", `api/captures/${event.request}`, capture()).catch(() => {})
            }
        })
        return () => {
            stopReporting()
            unfollow()
        }
    }, [])

    const maximized = controller?.maximized ?? null
    return (
        <div className={styles.app}>
            <StatusBar state={link === null ? "connecting" : state} bridge={bridge} />
            <main className={styles.main}>
                {controller === null
                    ? <p className={styles.notice}>Waiting for the Controller's backend...</p>
                    : (
                        <div className={styles.grid}>
                            <div className={styles.video}>
                                <VideoPanel
                                    link={link}
                                    topic={TOPICS.image}
                                    title="Camera"
                                    on={controller.layers.camera}
                                    maximized={maximized === "video"}
                                />
                            </div>
                            <div className={styles.map}>
                                <MapPanel
                                    link={link}
                                    topics={MAP_TOPICS}
                                    layers={controller.layers}
                                    maximized={maximized === "map"}
                                />
                            </div>
                            <div className={styles.teleop}>
                                <TeleopPanel
                                    topic={TOPICS.teleop}
                                    controller={controller}
                                    ready={ready}
                                    dryRun={dryRun}
                                    maximized={maximized === "teleop"}
                                />
                            </div>
                        </div>
                    )}
            </main>
        </div>
    )
}
