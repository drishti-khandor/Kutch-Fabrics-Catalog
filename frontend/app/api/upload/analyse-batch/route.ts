import { NextRequest } from "next/server";

// Batch Gemini analysis can take 60+ seconds for many images
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();

  const BACKEND = process.env.BACKEND_URL || "http://backend:8000";
  const res = await fetch(`${BACKEND}/api/upload/analyse-batch`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "multipart/form-data",
    },
    body,
    // Node fetch signal for long-running requests
    signal: AbortSignal.timeout(300_000),
  });

  const data = await res.arrayBuffer();
  return new Response(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
