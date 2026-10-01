# dimos-controller

A [dimOS Desktop](https://github.com/jeff-hykin/dimos-desktop) app (React) for a running
[dimos](https://github.com/dimensionalOS/dimos) stack: the robot's camera, its costmap with pose and planned
path, and keyboard teleop.

## dimOS Desktop

```sh
dimos-desktop install https://github.com/jeff-hykin/dimos-controller --ref dimos-desktop2
```

Desktop runs `nix build .#dimosApp`: the vite build (npm deps from `package-lock.json`), which it serves at
`/apps/dimos-controller/`. `dist/` is not committed.

## How it talks to dimos

Everything goes through Desktop's [zenoh-web](https://github.com/jeff-hykin/zenoh-web) bridge at `/zenoh-web`
(`?bridge=<url>` picks another). The client and [`@dimos/msgs`](https://jsr.io/@dimos/msgs) load from esm.sh at
runtime (`src/zenoh.ts`). dimos keys are `dimos/<topic>/<msg_name>`:

| panel  | key                                           | how                                              |
| ------ | --------------------------------------------- | ------------------------------------------------ |
| camera | `dimos/color_image/sensor_msgs.Image`         | the bridge's `dimos-image` codec: an H.264 track |
| map    | `dimos/global_costmap/nav_msgs.OccupancyGrid` | raw, decoded in the page                         |
|        | `dimos/odom/geometry_msgs.PoseStamped`        | raw (robot pose)                                 |
|        | `dimos/path/nav_msgs.Path`                    | raw (planned path)                               |
| teleop | `dimos/tele_cmd_vel/geometry_msgs.Twist`      | published at REAL_TIME with a zero-Twist deadman |

Teleop arms on click (only while the pad has focus) and repeats at 10 Hz while keys are held; release, blur or
a hidden tab sends a stop, and if the page stops heartbeating for 2 s the bridge publishes the stop itself.

```bash
deno task dev     # vite on :5173, /zenoh-web proxied to a Desktop on :7077
deno task build   # writes dist/
deno task test
deno task check
```
