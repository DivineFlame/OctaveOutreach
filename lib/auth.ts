import crypto from "node:crypto";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { getSql } from "./db";

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE = "octave_session";
export const SESSION_HOURS = 12;

export type WorkspaceRole = "owner" | "admin" | "researcher" | "reviewer" | "sender";
export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export async function verifyPassword(value: string, encoded: string) {
  try {
    const [algorithm, saltValue, hashValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const derived = await scrypt(value, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
    const actual = Buffer.from(derived);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function createSessionToken() { return crypto.randomBytes(32).toString("base64url"); }
export function hashSessionToken(token: string) { return crypto.createHash("sha256").update(token).digest("hex"); }
export function hashLoginKey(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const entry of cookie.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function authenticateRequest(request: Request): Promise<AuthContext | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const [row] = await sql`SELECT s.id AS session_id, u.id AS user_id, u.username, u.display_name,
      w.id AS workspace_id, w.name AS workspace_name, wm.role, s.last_seen_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.status = 'active'
    JOIN workspaces w ON w.id = s.workspace_id
    JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL AND s.expires_at > NOW()`;
  if (!row) return null;
  if (Date.now() - row.last_seen_at.getTime() > 5 * 60_000) await sql`UPDATE sessions SET last_seen_at = NOW() WHERE id = ${row.session_id}`;
  return { sessionId: row.session_id, userId: row.user_id, username: row.username, displayName: row.display_name, workspaceId: row.workspace_id, workspaceName: row.workspace_name, role: row.role };
}

export function unauthorized() { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }
export function forbidden() { return NextResponse.json({ error: "You do not have permission for this action" }, { status: 403 }); }
export function hasRole(auth: AuthContext, allowed: WorkspaceRole[]) { return allowed.includes(auth.role); }

export function secureCookieOptions(expires?: Date) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires };
}

export function requestIp(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim().slice(0, 128);
}
