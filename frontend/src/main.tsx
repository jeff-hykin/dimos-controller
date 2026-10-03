// Theme first (light/dark follows Desktop), then stylesheets so the module styles imported by App
// win ties with the page-wide defaults (bundle order follows import order).
import "./dim-theme.js"
import "./theme.css"
import "./index.css"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { openLink } from "./zenoh.ts"

// ?bridge=<url> points at another zenoh-web bridge; Desktop's is same-origin at /zenoh-web (we're at /apps/<name>/).
const bridge = new URL(location.href).searchParams.get("bridge") ??
    new URL("../../zenoh-web", location.href).href
const root = createRoot(document.getElementById("root")!)

root.render(<App link={null} bridge={bridge} />)
// After the first connect the client's own reconnect loop takes over.
openLink(bridge).then((link) => root.render(<App link={link} bridge={bridge} />))
