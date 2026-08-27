import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const username = process.env.APP_USERNAME ?? "admin";
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const separator = decoded.indexOf(":");
      if (decoded.slice(0, separator) === username && decoded.slice(separator + 1) === password) return NextResponse.next();
    } catch { /* prompt again */ }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Outreach Agent", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
