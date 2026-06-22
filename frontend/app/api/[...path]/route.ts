import { NextRequest } from "next/server";

const EXCLUDED_HEADERS = new Set(["host", "connection", "content-length"]);

// Both backend and frontend run on Render's free plan, which spins a
// service down after ~15min idle. The next request hits a cold start that
// can take 20-60s to boot — if it outlasts Render's own gateway timeout,
// Render's edge returns its own HTML error page instead of proxying to our
// app. Retrying with backoff rides through that boot window instead of
// surfacing the failure to the user (e.g. an admin trying to sign in after
// the app sat idle overnight).
const GATEWAY_RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000]; // ~75s total

function backendUrl() {
  return process.env.BACKEND_URL || "http://backend:8000";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function proxy(req: NextRequest) {
  const dest = `${backendUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!EXCLUDED_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const init: RequestInit = { method: req.method, headers };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.body = await req.arrayBuffer();
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const resp = await fetch(dest, init);
      const isColdStartError =
        GATEWAY_RETRY_STATUSES.has(resp.status) &&
        (resp.headers.get("content-type") || "").includes("text/html");

      if (isColdStartError) {
        if (attempt < RETRY_DELAYS_MS.length) {
          console.warn(
            `[api-proxy] ${dest} returned ${resp.status} HTML (likely cold start) — retrying (attempt ${attempt + 1})`
          );
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        // Retries exhausted — return our own message instead of leaking
        // Render's raw HTML error page to the client.
        console.error(`[api-proxy] ${dest} still cold-starting after ${RETRY_DELAYS_MS.length} retries, giving up`);
        return new Response(
          JSON.stringify({ detail: "Server is still starting up. Please wait a moment and try again." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      const body = await resp.arrayBuffer();
      const respHeaders = new Headers();
      resp.headers.forEach((value, key) => {
        if (!EXCLUDED_HEADERS.has(key.toLowerCase())) respHeaders.set(key, value);
      });
      return new Response(body, { status: resp.status, headers: respHeaders });
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        console.warn(`[api-proxy] fetch to ${dest} failed (attempt ${attempt + 1}), retrying:`, err);
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      console.error(`[api-proxy] fetch to ${dest} failed after retries:`, err);
      return new Response(
        JSON.stringify({ detail: `Backend unreachable at ${backendUrl()}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Unreachable: every loop iteration above returns or continues. Kept so
  // TypeScript can prove `proxy` always resolves to a Response.
  throw new Error("unreachable");
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
