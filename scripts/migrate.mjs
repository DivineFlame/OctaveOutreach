import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
});

let migrationLock = false;
try {
  await sql`SELECT pg_advisory_lock(68421824031001)`;
  migrationLock = true;
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const [existing] = await sql`SELECT name FROM schema_migrations WHERE name = ${file}`;
    if (existing) continue;
    const contents = await fs.readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    process.stdout.write(`Applied ${file}\n`);
  }
} finally {
  if (migrationLock) await sql`SELECT pg_advisory_unlock(68421824031001)`;
  await sql.end();
}
