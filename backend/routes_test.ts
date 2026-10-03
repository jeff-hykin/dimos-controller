// No robot here: drive commands are tested with dryRun, or against a fake page report (nothing publishes to zenoh).
import { assert, assertEquals } from "@std/assert"
import { handle } from "./http.ts"
import { DESCRIPTION, pageMessage, resetForTests, routes } from "./routes.ts"

const request = (method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    new Request(`http://app/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
const call = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
    const req = request(method, path, body, headers)
    const response = (await pageMessage(req.clone())) ?? (await handle(req, routes, DESCRIPTION))
    return { status: response!.status, json: await response!.json() }
}
const ok = async (method: string, path: string, body?: unknown, headers?: Record<string, string>) => {
    const result = await call(method, path, body, headers)
    assertEquals(result.status, 200, JSON.stringify(result.json))
    return result.json
}
const fails = async (method: string, path: string, body: unknown, status: number) => {
    const result = await call(method, path, body)
    assertEquals(result.status, status, JSON.stringify(result.json))
    assert(result.json.error, "an error says why")
    return result.json.error as string
}
const fakePage = (id: string, zenoh = "connected") =>
    ok("POST", `api/pages/${id}/report`, {
        zenoh,
        streams: { costmap: { hz: 2, ageMs: 100 } },
        pose: { x: 1, y: 2, yaw: 0 },
    })

Deno.test("state: no page, then a page's report", async () => {
    resetForTests()
    assertEquals((await ok("GET", "api/state")).robotLink, "no page open")
    await fakePage("p1")
    const state = await ok("GET", "api/state")
    assertEquals([state.robotLink, state.connectedPages, state.pose], ["connected", 1, { x: 1, y: 2, yaw: 0 }])
    assertEquals((await call("POST", "api/pages/p1/report", "nope")).status, 400)
    assertEquals((await call("GET", "api/nope")).status, 404)
})

Deno.test("drive: dryRun reports the Twist and needs nothing; limits and durations are checked", async () => {
    resetForTests()
    const dry = await ok("POST", "api/drive", { vx: 0.3, wz: -0.5, durationMs: 800, dryRun: true })
    assertEquals(dry, {
        dryRun: true,
        topic: "dimos/tele_cmd_vel/geometry_msgs.Twist",
        twist: { vx: 0.3, vy: 0, wz: -0.5 },
        durationMs: 800,
        armed: false,
    })
    assertEquals((await ok("GET", "api/state")).lastDryRun.vx, 0.3)
    await fails("POST", "api/drive", { vx: 5, dryRun: true }, 400)
    await fails("POST", "api/drive", { wz: 9, dryRun: true }, 400)
    await fails("POST", "api/drive", { vx: 0.1, durationMs: 10_000, dryRun: true }, 400)
    await fails("POST", "api/drive", { vx: "fast", dryRun: true }, 400)
    await fails("POST", "api/drive", { vx: 0.1, dryRun: "maybe" }, 400)
})

Deno.test("drive for real: refused while disarmed or with no connected page; else handed to the page", async () => {
    resetForTests()
    await fails("POST", "api/drive", { vx: 0.2 }, 409)
    await ok("POST", "api/teleop/arm", { armed: true })
    await fails("POST", "api/drive", { vx: 0.2 }, 503)
    await fakePage("p1", "lost")
    await fails("POST", "api/drive", { vx: 0.2 }, 503)
    await fakePage("p1")
    await new Promise((resolve) => setTimeout(resolve, 5))
    await fakePage("p2")
    assertEquals((await ok("POST", "api/drive", { vx: 0.2, durationMs: 1000 })).page, "p2", "newest page")
    const keyboard = await ok("POST", "api/drive", { vx: 0.2, source: "keyboard" }, { "x-page-id": "p1" })
    assertEquals(keyboard.page, "p1", "the asking page")
    assertEquals((await ok("GET", "api/state")).driving.source, "keyboard")
    await ok("POST", "api/stop")
    assertEquals((await ok("GET", "api/state")).driving, null)
})

Deno.test("arm / disarm (disarming stops)", async () => {
    resetForTests()
    assertEquals(await ok("POST", "api/teleop/arm", { armed: true, source: "keyboard" }), {
        armed: true,
        armedBy: "keyboard",
    })
    await fakePage("p1")
    await ok("POST", "api/drive", { vx: 0.1 })
    await ok("POST", "api/teleop/arm", { armed: false })
    const state = await ok("GET", "api/state")
    assertEquals([state.armed, state.driving], [false, null])
    await fails("POST", "api/teleop/arm", {}, 400)
    await fails("POST", "api/teleop/arm", { armed: "yes" }, 400)
})

Deno.test("limits, layers, layout", async () => {
    assertEquals(await ok("POST", "api/teleop/limits", { linear: 0.8 }), { linear: 0.8, angular: 1, boost: 2 })
    await fails("POST", "api/teleop/limits", { linear: 10 }, 400)
    await fails("POST", "api/teleop/limits", { boost: 0 }, 400)
    await ok("POST", "api/teleop/limits", { linear: 0.5 })
    assertEquals((await ok("POST", "api/layers", { camera: false, path: false })).camera, false)
    await fails("POST", "api/layers", {}, 400)
    await fails("POST", "api/layers", { costmap: 3 }, 400)
    await ok("POST", "api/layers", { camera: true, path: true })
    assertEquals(await ok("POST", "api/layout", { maximized: "map" }), { maximized: "map" })
    assertEquals(await ok("POST", "api/layout", { maximized: "none" }), { maximized: null })
    await fails("POST", "api/layout", { maximized: "sky" }, 400)
})

Deno.test("view: the newest page answers the capture; with no page it says so", async () => {
    resetForTests()
    await fails("GET", "api/view", undefined, 503)
    await fakePage("p1")
    const pending = call("GET", "api/view")
    await new Promise((resolve) => setTimeout(resolve, 10))
    await ok("POST", "api/captures/c1", { map: { mimeType: "image/png", data: "iVBOR" } })
    const view = await pending
    assertEquals([view.status, view.json.map.data, view.json.pose.x], [200, "iVBOR", 1])
    assertEquals((await call("POST", "api/captures/c99", {})).status, 404)
})

Deno.test("agent.json lists every route", async () => {
    const { json } = await call("GET", "agent.json")
    assertEquals(json.endpoints.length, routes.length)
})
