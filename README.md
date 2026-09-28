# dimos-controller

The [dimos](https://github.com/dimensionalOS/dimos) Cockpit (React + three.js robot viewer and teleop UI) packaged as a
[Desktop](https://github.com/dimensionalOS/dimos-desktop) app. Desktop serves it at `/app/dimos-controller/`; the app finds
the relay through `?relay=<url>`, then Desktop's `GET /api/relay`, then its own origin, then `http://127.0.0.1:7780`
(see `src/relay.ts`).

```bash
deno task dev     # vite on :5173, /api proxied to a relay on :7780
deno task build   # writes dist/
deno task test
deno task check
```

`dist/` is committed on purpose: Desktop installs apps by cloning them and never builds. Rebuild and commit it with every
source change (CI fails if it is stale). `vendor/` holds the dimos web SDK and wire protocol; `vendor/README.md` names the
dimos commit they came from.
