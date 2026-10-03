# dimos-controller

A [dimOS Desktop](https://github.com/jeff-hykin/dimos-desktop) app (React) for a running
[dimos](https://github.com/dimensionalOS/dimos) stack: the robot's camera, its costmap with pose and planned path, and
keyboard teleop.

## dimOS Desktop

```sh
dimos-desktop install https://github.com/jeff-hykin/dimos-controller
```

Desktop runs `nix build .#dimosApp`: `bin/dimos-app-server`, a Deno backend (`backend/`) serving the vite build
(`frontend/`).

## Endpoints

Every action is an HTTP endpoint (`backend/routes.ts`, listed in `dimos.yaml`'s `agent:`), so Desktop's agent drives the
robot the same way the page does: `GET api/state`, `GET api/view`, `POST api/drive` (`dryRun: true` sends nothing),
`POST api/stop`, `POST api/teleop/arm`, `POST api/teleop/limits`, `POST api/layers`, `POST api/layout`.

Robot streams stay direct: the page subscribes over Desktop's zenoh-web bridge. Deno has no WebRTC, so the open page
that is connected to the robot also publishes the Twists the backend decides on (a `drive` event on `api/events/ws`),
through a zenoh-web publisher whose deadman stops the robot if the page dies. With no page connected, `api/drive`
answers 503.

## How it talks to dimos

Everything goes through Desktop's [zenoh-web](https://github.com/jeff-hykin/zenoh-web) bridge at `/zenoh-web`
(`?bridge=<url>` picks another). The client and [`@dimos/msgs`](https://jsr.io/@dimos/msgs) load from esm.sh at runtime
(`src/zenoh.ts`). dimos keys are `dimos/<topic>/<msg_name>`:

| panel  | key                                           | how                                              |
| ------ | --------------------------------------------- | ------------------------------------------------ |
| camera | `dimos/color_image/sensor_msgs.Image`         | the bridge's `dimos-image` codec: an H.264 track |
| map    | `dimos/global_costmap/nav_msgs.OccupancyGrid` | raw, decoded in the page                         |
|        | `dimos/odom/geometry_msgs.PoseStamped`        | raw (robot pose)                                 |
|        | `dimos/path/nav_msgs.Path`                    | raw (planned path)                               |
| teleop | `dimos/tele_cmd_vel/geometry_msgs.Twist`      | published at REAL_TIME with a zero-Twist deadman |

Teleop arms on click (only while the pad has focus) and repeats at 10 Hz while keys are held; release, blur or a hidden
tab sends a stop, and if the page stops heartbeating for 2 s the bridge publishes the stop itself.

```bash
deno task dev                  # backend on :8787
cd frontend && npm run dev     # vite on :5173: /api → :8787, /zenoh-web → a Desktop on :7077
deno task test && deno task check && (cd frontend && npm run typecheck && npm test)
nix build .#dimosApp
```
