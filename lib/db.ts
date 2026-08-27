import postgres from "postgres";

declare global {
  var __outreachSql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (global.__outreachSql) return global.__outreachSql;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = postgres(databaseUrl, {
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
  });
  global.__outreachSql = client;
  return client;
}

export function jsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

export function jsonParam(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}
