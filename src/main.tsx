// Stylesheets first so the module styles imported by App win ties with the
// page-wide defaults (bundle order follows import order).
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { openLink } from "./zenoh.ts";

// ?bridge=<url> points at another zenoh-web bridge; Desktop's is same-origin.
const bridge = new URL(location.href).searchParams.get("bridge") ?? "/zenoh-web";
const root = createRoot(document.getElementById("root")!);

root.render(<App link={null} bridge={bridge} />);
// After the first connect the client's own reconnect loop takes over.
openLink(bridge).then((link) => root.render(<App link={link} bridge={bridge} />));
