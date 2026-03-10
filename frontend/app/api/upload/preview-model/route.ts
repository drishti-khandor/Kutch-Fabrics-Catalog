/**
 * Proxy for /api/upload/preview-model
 *
 * Gemini image generation typically takes 30–120 s.  The next.config.js
 * rewrite proxy times out before that, killing the connection.  This route
 * handler runs without an enforced timeout on self-hosted Next.js.
 */
const BACKEND = process.env.BACKEND_URL || "http://backend:8000";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body = await request.arrayBuffer();

    const upstream = await fetch(`${BACKEND}/api/upload/preview-model`, {
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
    console.error("[preview-model proxy]", err);
    return new Response(err?.message ?? "Upstream error", { status: 502 });
  }
}
