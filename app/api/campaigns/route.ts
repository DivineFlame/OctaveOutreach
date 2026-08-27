import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { analyseWebsite } from "@/lib/site-analysis";
import { planContentDrafts } from "@/lib/drafting";
import { campaignInputSchema, settingsSchema } from "@/lib/validation";
import { authenticateRequest, forbidden, hasRole, unauthorized } from "@/lib/auth";
import { DEFAULT_SETTINGS, type Campaign } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher"])) return forbidden();
    const input = campaignInputSchema.parse(await request.json());
    const analysis = await analyseWebsite(input.website);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sql = getSql();

    const [settingRow] = await sql`SELECT payload FROM workspace_settings WHERE workspace_id = ${auth.workspaceId} AND id = 'default'`;
    const parsedSettings = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...((settingRow?.payload ?? {}) as Record<string, unknown>) });
    const settings = parsedSettings.success ? parsedSettings.data : DEFAULT_SETTINGS;

    const campaign: Campaign = {
      id,
      name: input.name,
      website: input.website,
      market: input.market,
      leadGoal: input.leadGoal,
      channels: input.channels,
      status: "ready",
      analysis,
      createdAt: now,
      updatedAt: now,
    };

    // Outreach drafts are per-lead. YouTube is publishing, so its content plan is
    // created up front and hangs off the campaign with no lead.
    const contentDrafts = planContentDrafts(campaign, settings).map((plan) => ({ id: crypto.randomUUID(), ...plan }));

    await sql.begin(async (tx) => {
      await tx`INSERT INTO campaigns (id, workspace_id, name, website, market, lead_goal, channels, status, analysis)
        VALUES (${id}, ${auth.workspaceId}, ${input.name}, ${input.website}, ${input.market}, ${input.leadGoal}, ${tx.json(jsonParam(input.channels))}, 'ready', ${tx.json(jsonParam(analysis))})`;
      for (const draft of contentDrafts) {
        await tx`INSERT INTO drafts (id, workspace_id, campaign_id, channel, type, subject, body, status, attachments, sequence_step)
          VALUES (${draft.id}, ${auth.workspaceId}, ${id}, ${draft.channel}, ${draft.type}, ${draft.subject},
            ${draft.body}, ${draft.status}, ${tx.json(jsonParam(draft.attachments))}, ${draft.sequenceStep})`;
      }
      await tx`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
        VALUES (${auth.workspaceId}, ${auth.userId}, 'campaign', ${id}, 'created', ${tx.json(jsonParam({ website: input.website, channels: input.channels }))})`;
    });

    return NextResponse.json(
      {
        campaign,
        drafts: contentDrafts.map((draft) => ({
          ...draft,
          campaignId: id,
          leadId: null,
          approvedAt: null,
          sentAt: null,
          repliedAt: null,
          replyNote: "",
          createdAt: now,
          updatedAt: now,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create campaign";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
