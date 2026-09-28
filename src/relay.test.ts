import { describe, expect, it } from "vitest";
import { DEFAULT_RELAY_URL, infoUrl, relayLabel, relayReachable, resolveRelay } from "./relay.ts";

const PAGE = "http://127.0.0.1:7070/app/dimos-controller/";
const INFO = { v: 1, wtUrl: "https://127.0.0.1:7779/wt", certHash: "abc=" };

/** A fetch answering JSON bodies by URL; anything else is a network error. */
function fakeFetch(routes: Record<string, unknown>, seen: string[] = []) {
  return (url: string): Promise<Response> => {
    seen.push(url);
    if (!(url in routes)) return Promise.reject(new TypeError("Failed to fetch"));
    const body = routes[url];
    if (body instanceof Response) return Promise.resolve(body);
    return Promise.resolve(Response.json(body));
  };
}

describe("resolveRelay", () => {
  it("takes ?relay= first, without asking anyone", async () => {
    const seen: string[] = [];
    const target = await resolveRelay(`${PAGE}?relay=http://10.0.0.5:7780`, fakeFetch({}, seen));
    expect(target).toEqual({ url: "http://10.0.0.5:7780", source: "query" });
    expect(seen).toEqual([]);
  });

  it("asks Desktop's /api/relay next, even when that relay is down", async () => {
    const fetchFn = fakeFetch({
      "http://127.0.0.1:7070/api/relay": { url: "http://127.0.0.1:7781", up: false },
    });
    expect(await resolveRelay(PAGE, fetchFn)).toEqual({
      url: "http://127.0.0.1:7781",
      source: "desktop",
    });
  });

  it("uses same origin when the page is served by a relay", async () => {
    const fetchFn = fakeFetch({
      "http://127.0.0.1:7070/api/relay": new Response("not found", { status: 404 }),
      "http://127.0.0.1:7070/api/info": INFO,
    });
    expect(await resolveRelay(PAGE, fetchFn)).toEqual({ url: undefined, source: "same-origin" });
  });

  it("does not mistake an HTML fallback page for a relay", async () => {
    const html = () =>
      new Response("<!DOCTYPE html>", { headers: { "content-type": "text/html" } });
    const fetchFn = fakeFetch({
      "http://127.0.0.1:7070/api/relay": html(),
      "http://127.0.0.1:7070/api/info": html(),
    });
    expect(await resolveRelay(PAGE, fetchFn)).toEqual({
      url: DEFAULT_RELAY_URL,
      source: "default",
    });
  });

  it("falls back to the default relay address", async () => {
    expect(await resolveRelay(PAGE, fakeFetch({}))).toEqual({
      url: DEFAULT_RELAY_URL,
      source: "default",
    });
  });
});

describe("relayReachable", () => {
  it("is true only when /api/info answers with relay info", async () => {
    const target = { url: "http://127.0.0.1:7780", source: "default" } as const;
    const up = fakeFetch({ "http://127.0.0.1:7780/api/info": INFO });
    expect(await relayReachable(PAGE, target, up)).toBe(true);
    expect(await relayReachable(PAGE, target, fakeFetch({}))).toBe(false);
  });
});

describe("infoUrl / relayLabel", () => {
  it("keeps a path prefix on the relay base", () => {
    expect(infoUrl(PAGE, "https://x/relay")).toBe("https://x/relay/api/info");
    expect(infoUrl(PAGE, undefined)).toBe("http://127.0.0.1:7070/api/info");
  });

  it("labels same origin with the page's origin", () => {
    expect(relayLabel(PAGE, { url: undefined, source: "same-origin" })).toBe(
      "http://127.0.0.1:7070",
    );
  });
});
