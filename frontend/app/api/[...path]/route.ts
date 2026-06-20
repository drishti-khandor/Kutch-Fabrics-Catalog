import { NextRequest } from "next/server";

const EXCLUDED_HEADERS = new Set(["host", "connection", "content-length"]);

function backendUrl() {
  return process.env.BACKEND_URL || "http://backend:8000";
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

  try {
    const resp = await fetch(dest, init);
    const body = await resp.arrayBuffer();
    const respHeaders = new Headers();
    resp.headers.forEach((value, key) => {
      if (!EXCLUDED_HEADERS.has(key.toLowerCase())) respHeaders.set(key, value);
    });
    return new Response(body, { status: resp.status, headers: respHeaders });
  } catch (err) {
    console.error(`[api-proxy] fetch to ${dest} failed:`, err);
    return new Response(
      JSON.stringify({ detail: `Backend unreachable at ${backendUrl()}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
