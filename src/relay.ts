// Where the relay is. Upstream the cockpit is served by the relay itself, so
// same origin is enough; as a Desktop app it is served by Desktop and the
// relay lives elsewhere. Resolution order:
//   1. ?relay=<url> on the page,
//   2. Desktop's GET /api/relay -> { url, up },
//   3. same origin, when the page's own /api/info answers (served by a relay),
//   4. the relay's default address.

export const DEFAULT_RELAY_URL = "http://127.0.0.1:7780";

const PROBE_TIMEOUT_MS = 1500;

export interface RelayTarget {
  /** HTTP relay base for connect({ url }); undefined means same origin. */
  url: string | undefined;
  source: "query" | "desktop" | "same-origin" | "default";
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The /api/info URL for a relay base (same rule as the SDK's resolveInfoUrl). */
export function infoUrl(pageUrl: string, relayUrl: string | undefined): string {
  if (relayUrl === undefined) return new URL("/api/info", pageUrl).toString();
  return new URL("api/info", relayUrl.endsWith("/") ? relayUrl : `${relayUrl}/`).toString();
}

/** Human-readable relay address, for the status bar and the empty state. */
export function relayLabel(pageUrl: string, target: RelayTarget): string {
  return target.url ?? new URL(pageUrl).origin;
}

async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  try {
    const resp = await fetchFn(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!resp.ok) return undefined;
    return await resp.json();
  } catch {
    // Unreachable, timed out, or not JSON (an SPA fallback serving index.html).
    return undefined;
  }
}

function isRelayInfo(data: unknown): boolean {
  return typeof data === "object" && data !== null &&
    typeof (data as Record<string, unknown>).wtUrl === "string";
}

export async function resolveRelay(
  pageUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<RelayTarget> {
  const fromQuery = new URL(pageUrl).searchParams.get("relay");
  if (fromQuery) return { url: fromQuery, source: "query" };

  const desktop = await getJson(fetchFn, new URL("/api/relay", pageUrl).toString());
  if (typeof desktop === "object" && desktop !== null) {
    const url = (desktop as Record<string, unknown>).url;
    if (typeof url === "string" && url !== "") return { url, source: "desktop" };
  }

  if (isRelayInfo(await getJson(fetchFn, infoUrl(pageUrl, undefined)))) {
    return { url: undefined, source: "same-origin" };
  }
  return { url: DEFAULT_RELAY_URL, source: "default" };
}

/** Whether the relay answers /api/info right now. */
export async function relayReachable(
  pageUrl: string,
  target: RelayTarget,
  fetchFn: FetchLike = fetch,
): Promise<boolean> {
  return isRelayInfo(await getJson(fetchFn, infoUrl(pageUrl, target.url)));
}
