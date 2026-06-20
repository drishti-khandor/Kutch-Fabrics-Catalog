import { NextRequest } from "next/server";

const EXCLUDED_HEADERS = new Set(["host", "connection", "content-length"]);

function backendUrl() {
  return process.env.BACKEND_URL || "http://backend:8000";
}

export async function GET(req: NextRequest) {
  const dest = `${backendUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;

  try {
    const resp = await fetch(dest);
    const body = await resp.arrayBuffer();
    const respHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (!EXCLUDED_HEADERS.has(key.toLowerCase())) respHeaders.set(key, value);
    });
    return new Response(body, { status: resp.status, headers: respHeaders });
  } catch (err) {
    console.error(`[images-proxy] fetch to ${dest} failed:`, err);
    return new Response("Backend unreachable", { status: 502 });
  }
}
