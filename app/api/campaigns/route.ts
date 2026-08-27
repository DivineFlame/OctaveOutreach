import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { analyseWebsite, buildDraft } from "@/lib/site-analysis";
import { campaignInputSchema } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = campaignInputSchema.parse(await request.json());
    const analysis = await analyseWebsite(input.website);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const sql = getSql();
    const drafts = input.channels.map((channel) => ({ id: crypto.randomUUID(), channel, ...buildDraft(channel, input.name, analysis) }));
    await sql.begin(async (tx) => {
      await tx`INSERT INTO campaigns (id, name, website, market, lead_goal, channels, status, analysis)
        VALUES (${id}, ${input.name}, ${input.website}, ${input.market}, ${input.leadGoal}, ${tx.json(jsonParam(input.channels))}, 'ready', ${tx.json(jsonParam(analysis))})`;
      for (const draft of drafts) {
        await tx`INSERT INTO drafts (id, campaign_id, channel, type, subject, body, status)
          VALUES (${draft.id}, ${id}, ${draft.channel}, ${draft.type}, ${draft.subject}, ${draft.body}, 'needs_review')`;
      }
      await tx`INSERT INTO activity_log (entity_type, entity_id, action, metadata)
        VALUES ('campaign', ${id}, 'created', ${tx.json(jsonParam({ website: input.website, channels: input.channels }))})`;
    });
    return NextResponse.json({
      campaign: { ...input, id, status: "ready", analysis, createdAt: now, updatedAt: now },
      drafts: drafts.map((draft) => ({ ...draft, campaignId: id, leadId: null, status: "needs_review", createdAt: now, updatedAt: now })),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create campaign";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
