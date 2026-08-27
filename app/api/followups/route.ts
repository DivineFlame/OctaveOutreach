import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { followUpCreateSchema, followUpPatchSchema } from "@/lib/validation";
import { toFollowUp } from "@/lib/mappers";
import { authenticateRequest, forbidden, hasRole, unauthorized } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher", "reviewer", "sender"])) return forbidden();
    const input = followUpCreateSchema.parse(await request.json());
    const sql = getSql();

    const [lead] = await sql`SELECT id, campaign_id FROM leads WHERE id = ${input.leadId} AND workspace_id = ${auth.workspaceId}`;
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const [row] = await sql`INSERT INTO follow_ups (id, workspace_id, campaign_id, lead_id, draft_id, channel, due_on, note, created_by)
      VALUES (${crypto.randomUUID()}, ${auth.workspaceId}, ${lead.campaign_id}, ${input.leadId},
        ${input.draftId ?? null}, ${input.channel}, ${input.dueOn}, ${input.note}, ${auth.userId})
      RETURNING *`;
    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'lead', ${input.leadId}, 'follow_up_scheduled',
        ${sql.json(jsonParam({ channel: input.channel, dueOn: input.dueOn }))})`;
    return NextResponse.json({ followUp: toFollowUp(row) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to schedule follow-up";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher", "reviewer", "sender"])) return forbidden();
    const input = followUpPatchSchema.parse(await request.json());
    const sql = getSql();
    const [row] = await sql`UPDATE follow_ups SET status = ${input.status},
        completed_at = ${input.status === "pending" ? null : new Date()}
      WHERE id = ${input.id} AND workspace_id = ${auth.workspaceId} RETURNING *`;
    if (!row) return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    return NextResponse.json({ followUp: toFollowUp(row) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update follow-up";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
