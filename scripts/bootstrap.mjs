import crypto from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scrypt = promisify(crypto.scrypt);
const databaseUrl = process.env.DATABASE_URL;
const username = process.env.APP_USERNAME?.trim().toLowerCase();
const password = process.env.APP_PASSWORD;
const displayName = process.env.APP_DISPLAY_NAME?.trim() || "Workspace Owner";
const workspaceName = process.env.WORKSPACE_NAME?.trim() || "Octave";
const workspaceId = "00000000-0000-4000-8000-000000000001";

if (!databaseUrl) throw new Error("DATABASE_URL is required for bootstrap");
if (!username || !/^[a-z0-9._@+-]{3,120}$/.test(username)) throw new Error("APP_USERNAME must be 3-120 valid login characters");
if (!password || password.length < 12) throw new Error("APP_PASSWORD must contain at least 12 characters");

async function hashPassword(value) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(value, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

async function matchesPassword(value, encoded) {
  const [algorithm, saltValue, hashValue] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = Buffer.from(await scrypt(value, Buffer.from(saltValue, "base64url"), expected.length));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
const sql = postgres(databaseUrl, { max: 1, connect_timeout: 15, ssl: process.env.DATABASE_SSL === "true" ? "require" : false });

try {
  await sql.begin(async (tx) => {
    await tx`UPDATE workspaces SET name = ${workspaceName}, updated_at = NOW() WHERE id = ${workspaceId}`;
    const [existing] = await tx`SELECT id, password_hash FROM users WHERE username = ${username}`;
    const userId = existing?.id ?? crypto.randomUUID();
    if (!existing) {
      const passwordHash = await hashPassword(password);
      await tx`INSERT INTO users (id, username, display_name, password_hash) VALUES (${userId}, ${username}, ${displayName}, ${passwordHash})`;
    } else if (!(await matchesPassword(password, existing.password_hash))) {
      const passwordHash = await hashPassword(password);
      await tx`UPDATE users SET display_name = ${displayName}, password_hash = ${passwordHash}, status = 'active', updated_at = NOW() WHERE id = ${userId}`;
      await tx`UPDATE sessions SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    } else {
      await tx`UPDATE users SET display_name = ${displayName}, status = 'active', updated_at = NOW() WHERE id = ${userId}`;
    }
    await tx`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${workspaceId}, ${userId}, 'owner')
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`;
  });
  process.stdout.write(`Bootstrap owner '${username}' is ready.\n`);
} finally {
  await sql.end();
}
