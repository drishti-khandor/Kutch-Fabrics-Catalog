import { NextRequest, NextResponse } from "next/server";

// Paths handled by this Next.js app's own route handlers — never proxy these
// to the backend, even though they live under /api/*.
const LOCAL_API_ROUTES = [
  "/api/upload/analyse",
  "/api/upload/analyse-batch",
  "/api/upload/preview-model",
];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (LOCAL_API_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Read at request time (not build time) so it always reflects the
  // container's actual runtime env var, not whatever was set during `next build`.
  const backendUrl = process.env.BACKEND_URL || "http://backend:8000";
  const dest = new URL(pathname + search, backendUrl);
  return NextResponse.rewrite(dest);
}

export const config = {
  matcher: ["/api/:path*", "/images/:path*"],
};
