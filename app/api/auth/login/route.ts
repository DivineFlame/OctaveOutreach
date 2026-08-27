import { NextResponse } from "next/server";
import { createSessionToken, hashLoginKey, hashSessionToken, requestIp, secureCookieOptions, SESSION_COOKIE, SESSION_HOURS, verifyPassword } from "@/lib/auth";
import { getSql, jsonParam } from "@/lib/db";
import { loginSchema } from "@/lib/validation";

const DUMMY_HASH = "scrypt$BwcHBwcHBwcHBwcHBwcHBw$5Vja6mOHpm7YQWFCfHSACROk9kngKXocnBJlmae6xAkEAMTetIMGaDAvL9p_FFY0IKMf0aizZMUhkBnOLsI2wg";
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const sql = getSql();
    const keyHash = hashLoginKey(`${requestIp(request)}|${input.username}`);
    const [attempt] = await sql`SELECT failures, window_started_at, blocked_until FROM login_attempts WHERE key_hash = ${keyHash}`;
    if (attempt?.blocked_until && attempt.blocked_until.getTime() > Date.now()) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": "900" } });
    }
    const [user] = await sql`SELECT u.id, u.username, u.display_name, u.password_hash, u.status,
        wm.workspace_id, wm.role, w.name AS workspace_name
      FROM users u
      LEFT JOIN workspace_members wm ON wm.user_id = u.id
      LEFT JOIN workspaces w ON w.id = wm.workspace_id
      WHERE u.username = ${input.username}
      ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`;
    const valid = await verifyPassword(input.password, user?.password_hash ?? DUMMY_HASH);
    if (!valid || !user || user.status !== "active" || !user.workspace_id) {
      const withinWindow = attempt && Date.now() - attempt.window_started_at.getTime() < WINDOW_MINUTES * 60_000;
      const failures = withinWindow ? Number(attempt.failures) + 1 : 1;
      const blockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + WINDOW_MINUTES * 60_000) : null;
      await sql`INSERT INTO login_attempts (key_hash, failures, window_started_at, blocked_until, updated_at)
        VALUES (${keyHash}, ${failures}, NOW(), ${blockedUntil}, NOW()) ON CONFLICT (key_hash) DO UPDATE SET
        failures = ${failures}, window_started_at = ${withinWindow ? attempt.window_started_at : new Date()}, blocked_until = ${blockedUntil}, updated_at = NOW()`;
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = createSessionToken();
    const sessionId = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60_000);
    await sql.begin(async (tx) => {
      await tx`DELETE FROM login_attempts WHERE key_hash = ${keyHash}`;
      await tx`DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '7 days'`;
      await tx`INSERT INTO sessions (id, token_hash, user_id, workspace_id, expires_at) VALUES
        (${sessionId}, ${hashSessionToken(token)}, ${user.id}, ${user.workspace_id}, ${expires})`;
      await tx`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = ${user.id}`;
      await tx`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
        VALUES (${user.workspace_id}, ${user.id}, 'session', ${sessionId}, 'login', ${tx.json(jsonParam({ username: user.username }))})`;
    });
    const response = NextResponse.json({ user: { username: user.username, displayName: user.display_name, role: user.role }, workspace: { id: user.workspace_id, name: user.workspace_name } });
    response.cookies.set(SESSION_COOKIE, token, secureCookieOptions(expires));
    return response;
  } catch (error) {
    const message = error instanceof Error && error.name === "ZodError" ? "Enter a valid username and password" : "Unable to sign in";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
