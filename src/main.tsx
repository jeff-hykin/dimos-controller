// Stylesheets first so the module styles imported by App win ties with the
// page-wide defaults (bundle order follows import order).
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";
import { createRoot } from "react-dom/client";
import { connect } from "@dimos/sdk";
import { App } from "./App.tsx";
import { relayLabel, relayReachable, resolveRelay } from "./relay.ts";
import { cockpitDecoders, installAutoSubscriptions } from "./subscriptions.ts";
import { readToken } from "./token.ts";
import { NoRelay } from "./ui/NoRelay.tsx";

// How often to look again while no relay answers.
const RELAY_RETRY_MS = 2000;

const root = createRoot(document.getElementById("root")!);

// Resolve the relay (it moves when Desktop starts another blueprint), show a
// friendly empty state until it answers, then connect once. After that the
// SDK's own reconnect loop takes over.
async function start(): Promise<void> {
  for (;;) {
    const target = await resolveRelay(location.href);
    const relay = relayLabel(location.href, target);
    if (await relayReachable(location.href, target)) {
      const session = connect({
        url: target.url,
        decoders: cockpitDecoders,
        token: readToken() ?? undefined,
      });
      installAutoSubscriptions(session);
      root.render(<App session={session} relay={relay} />);
      return;
    }
    root.render(<NoRelay relay={relay} />);
    await new Promise((resolve) => setTimeout(resolve, RELAY_RETRY_MS));
  }
}

// Capability checks before anything mounts: WebTransport needs a secure
// context, and Safari has no WebTransport as of mid-2026.
if (!globalThis.isSecureContext) {
  root.render(
    <p style={{ padding: "1rem" }}>
      Not a secure context: WebTransport needs https:// or http://localhost.
    </p>,
  );
} else if (!("WebTransport" in globalThis)) {
  root.render(
    <p style={{ padding: "1rem" }}>
      This browser has no WebTransport support. Use Chromium or Firefox.
    </p>,
  );
} else {
  void start();
}
