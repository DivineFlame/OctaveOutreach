import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";
import { toActivity, toCampaign, toDraft, toFollowUp, toLead } from "@/lib/mappers";
import { providerLabel } from "@/lib/llm";
import { DEFAULT_SETTINGS, type WorkspaceData } from "@/lib/types";
import { authenticateRequest, forbidden, hasRole, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();
  const sql = getSql();
  const [campaignRows, leadRows, draftRows, followUpRows, activityRows, settingRows] = await Promise.all([
    sql`SELECT * FROM campaigns WHERE workspace_id = ${auth.workspaceId} ORDER BY updated_at DESC LIMIT 250`,
    sql`SELECT * FROM leads WHERE workspace_id = ${auth.workspaceId} ORDER BY updated_at DESC LIMIT 2000`,
    sql`SELECT * FROM drafts WHERE workspace_id = ${auth.workspaceId} ORDER BY updated_at DESC LIMIT 2000`,
    sql`SELECT * FROM follow_ups WHERE workspace_id = ${auth.workspaceId} AND status = 'pending' ORDER BY due_on ASC LIMIT 500`,
    sql`SELECT a.id, a.entity_type, a.entity_id, a.action, a.metadata, a.created_at,
          COALESCE(u.display_name, u.username, '') AS actor
        FROM activity_log a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.workspace_id = ${auth.workspaceId}
        ORDER BY a.created_at DESC LIMIT 120`,
    sql`SELECT payload FROM workspace_settings WHERE workspace_id = ${auth.workspaceId} AND id = 'default'`,
  ]);

  // Merge over the defaults so payloads written before a settings field existed
  // still load instead of failing validation.
  const stored = (settingRows[0]?.payload ?? {}) as Record<string, unknown>;
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });

  const data: WorkspaceData = {
    campaigns: campaignRows.map(toCampaign),
    leads: leadRows.map(toLead),
    drafts: draftRows.map(toDraft),
    followUps: followUpRows.map(toFollowUp),
    activity: activityRows.map(toActivity),
    settings: parsed.success ? parsed.data : DEFAULT_SETTINGS,
  };
  return NextResponse.json({
    ...data,
    session: { username: auth.username, displayName: auth.displayName, role: auth.role, workspaceName: auth.workspaceName },
    provider: providerLabel(),
  });
}

export async function PUT(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) return unauthorized();
  if (!hasRole(auth, ["owner", "admin"])) return forbidden();
  const settings = settingsSchema.parse(await request.json());
  const sql = getSql();
  await sql`INSERT INTO workspace_settings (workspace_id, id, payload, updated_at) VALUES (${auth.workspaceId}, 'default', ${sql.json(jsonParam(settings))}, NOW())
    ON CONFLICT (workspace_id, id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`;
  await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action) VALUES (${auth.workspaceId}, ${auth.userId}, 'settings', 'default', 'updated')`;
  return NextResponse.json({ settings });
}
