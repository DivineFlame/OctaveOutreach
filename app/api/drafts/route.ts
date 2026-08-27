import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { draftPatchSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const input = draftPatchSchema.parse(await request.json());
  const sql = getSql();
  const [existing] = await sql`SELECT * FROM drafts WHERE id = ${input.id}`;
  if (!existing) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  const body = input.body ?? existing.body;
  const subject = input.subject ?? existing.subject;
  const status = input.status ?? existing.status;
  const [draft] = await sql`UPDATE drafts SET body = ${body}, subject = ${subject}, status = ${status}, updated_at = NOW()
    WHERE id = ${input.id} RETURNING *`;
  await sql`INSERT INTO activity_log (entity_type, entity_id, action, metadata)
    VALUES ('draft', ${input.id}, 'updated', ${sql.json(jsonParam({ status }))})`;
  return NextResponse.json({ draft });
}
