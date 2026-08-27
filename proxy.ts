import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/api/health" || path.startsWith("/api/auth/login")) return NextResponse.next();
  if (request.cookies.has("octave_session")) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
