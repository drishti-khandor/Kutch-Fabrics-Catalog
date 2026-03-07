/**
 * Proxy for /api/upload/analyse
 *
 * This route handler replaces the next.config.js rewrite for this path so
 * that the Gemini text-analysis call (which can take 30–60 s with Pro models)
 * isn't killed by the rewrite-proxy's built-in socket timeout.
 */
const BACKEND = "http://backend:8000";

export async function POST(request: Request) {
  try {
    // Forward the raw multipart body unchanged so no size limit is imposed
    const contentType = request.headers.get("content-type") ?? "";
    const body = await request.arrayBuffer();

    const upstream = await fetch(`${BACKEND}/api/upload/analyse`, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      return new Response(text, {
        status: upstream.status,
        headers: { "content-type": "text/plain" },
      });
    }

    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[analyse proxy]", err);
    return new Response(err?.message ?? "Upstream error", { status: 502 });
  }
}
