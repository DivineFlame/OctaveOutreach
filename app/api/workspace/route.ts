import { NextResponse } from "next/server";
import { getSql, jsonParam, jsonValue } from "@/lib/db";
import { settingsSchema } from "@/lib/validation";
import type { Campaign, Draft, Lead, WorkspaceData, WorkspaceSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

const defaultSettings: WorkspaceSettings = {
  companyName: "Octave",
  companyWebsite: "",
  senderName: "",
  senderTitle: "Business Development",
  defaultMarket: "India",
  tone: "consultative",
  dailyDraftLimit: 15,
  followUpDays: 7,
  approvalRequired: true,
  publicDataOnly: true,
  signature: "Regards",
};

export async function GET() {
  const sql = getSql();
  const [campaignRows, leadRows, draftRows, settingRows] = await Promise.all([
    sql`SELECT * FROM campaigns ORDER BY updated_at DESC`,
    sql`SELECT * FROM leads ORDER BY updated_at DESC`,
    sql`SELECT * FROM drafts ORDER BY updated_at DESC`,
    sql`SELECT payload FROM workspace_settings WHERE id = 'default'`,
  ]);
  const campaigns = campaignRows.map((row): Campaign => ({
    id: row.id, name: row.name, website: row.website, market: row.market, leadGoal: row.lead_goal,
    channels: jsonValue(row.channels, []), status: row.status, analysis: jsonValue(row.analysis, null),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  }));
  const leads = leadRows.map((row): Lead => ({
    id: row.id, campaignId: row.campaign_id, company: row.company, contactName: row.contact_name,
    role: row.role, channel: row.channel, profileUrl: row.profile_url, sourceUrl: row.source_url,
    status: row.status, priority: row.priority, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  }));
  const drafts = draftRows.map((row): Draft => ({
    id: row.id, campaignId: row.campaign_id, leadId: row.lead_id, channel: row.channel, type: row.type,
    subject: row.subject, body: row.body, status: row.status, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  }));
  const settings = settingsSchema.parse(settingRows[0]?.payload ?? defaultSettings);
  return NextResponse.json({ campaigns, leads, drafts, settings } satisfies WorkspaceData);
}

export async function PUT(request: Request) {
  const settings = settingsSchema.parse(await request.json());
  const sql = getSql();
  await sql`INSERT INTO workspace_settings (id, payload, updated_at) VALUES ('default', ${sql.json(jsonParam(settings))}, NOW())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`;
  await sql`INSERT INTO activity_log (entity_type, entity_id, action) VALUES ('settings', 'default', 'updated')`;
  return NextResponse.json({ settings });
}
