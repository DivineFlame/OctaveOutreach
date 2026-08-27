import { NextResponse } from "next/server";
import { authenticateRequest, hashSessionToken, secureCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { getSql } from "@/lib/db";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (token) await getSql()`UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ${hashSessionToken(decodeURIComponent(token))}`;
  if (auth) await getSql()`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action) VALUES (${auth.workspaceId}, ${auth.userId}, 'session', ${auth.sessionId}, 'logout')`;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", secureCookieOptions(new Date(0)));
  return response;
}
