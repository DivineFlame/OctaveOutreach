import { describe, expect, it } from "vitest";
import {
  DRAFT_ACTIONS,
  campaignInputSchema,
  draftGenerateSchema,
  draftPatchSchema,
  followUpCreateSchema,
  followUpPatchSchema,
  leadInputSchema,
  leadPatchSchema,
  loginSchema,
  settingsSchema,
} from "../lib/validation";

describe("request validation", () => {
  it("accepts a valid campaign and rejects private protocols or no channels", () => {
    expect(campaignInputSchema.safeParse({ name: "US campaign", website: "https://example.com", market: "United States", leadGoal: 100, channels: ["linkedin", "email"] }).success).toBe(true);
    expect(campaignInputSchema.safeParse({ name: "US campaign", website: "file:///etc/passwd", market: "United States", leadGoal: 100, channels: [] }).success).toBe(false);
  });

  it("requires production-length credentials", () => {
    expect(loginSchema.safeParse({ username: "owner", password: "a-strong-password" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "owner", password: "short" }).success).toBe(false);
  });

  it("bounds operational limits", () => {
    const base = { companyName: "Octave", companyWebsite: "https://example.com", senderName: "Owner", senderTitle: "Director", defaultMarket: "India", tone: "consultative", dailyDraftLimit: 15, followUpDays: 7, approvalRequired: true, publicDataOnly: true, signature: "Regards" };
    expect(settingsSchema.safeParse(base).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, dailyDraftLimit: 1000 }).success).toBe(false);
  });

  it("rejects collateral rows with no name", () => {
    const base = { companyName: "Octave", companyWebsite: "", senderName: "Owner", senderTitle: "Director", defaultMarket: "India", tone: "concise", dailyDraftLimit: 15, followUpDays: 7, approvalRequired: true, publicDataOnly: true, signature: "Regards" };
    expect(settingsSchema.safeParse({ ...base, collateral: [{ name: "Catalogue", kind: "catalogue", url: "" }] }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, collateral: [{ name: "", kind: "catalogue", url: "" }] }).success).toBe(false);
  });
});

describe("lead validation", () => {
  it("defaults every optional field so a one-column import still succeeds", () => {
    const parsed = leadInputSchema.parse({ campaignId: "camp-1", company: "  Makin Oils  " });
    expect(parsed.company).toBe("Makin Oils");
    expect(parsed.channel).toBe("linkedin");
    expect(parsed.priority).toBe("B");
    expect(parsed.consentStatus).toBe("unknown");
    expect(parsed.whatsappNumberType).toBe("unknown");
    expect(parsed.emailStage).toBe("none");
    expect(parsed.doNotContact).toBe(false);
    expect(parsed.profiles).toEqual({});
  });

  it("requires a company and rejects an unknown channel", () => {
    expect(leadInputSchema.safeParse({ campaignId: "camp-1", company: "" }).success).toBe(false);
    expect(leadInputSchema.safeParse({ campaignId: "camp-1", company: "Makin", channel: "telegram" }).success).toBe(false);
  });

  it("treats a blank email as absent but still rejects a malformed one", () => {
    expect(leadInputSchema.parse({ campaignId: "camp-1", company: "Makin", email: "  " }).email).toBe("");
    expect(leadInputSchema.safeParse({ campaignId: "camp-1", company: "Makin", email: "not-an-address" }).success).toBe(false);
    expect(leadInputSchema.safeParse({ campaignId: "camp-1", company: "Makin", email: "buyer@makin.com" }).success).toBe(true);
  });

  it("keeps only known channel keys in the profiles map", () => {
    const parsed = leadInputSchema.parse({
      campaignId: "camp-1",
      company: "Soap Brand",
      profiles: { instagram: " @soapbrand ", pinterest: "https://pinterest.com/x", x: "" },
    });
    expect(parsed.profiles).toEqual({ instagram: "@soapbrand" });
  });

  it("requires a patch to carry at least one change beyond the id", () => {
    expect(leadPatchSchema.safeParse({ id: "lead-1" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ id: "lead-1", doNotContact: true, doNotContactReason: "Asked to be removed" }).success).toBe(true);
  });
});

describe("draft validation", () => {
  it("exposes exactly the eight per-channel actions from the spec", () => {
    expect([...DRAFT_ACTIONS]).toEqual([
      "save",
      "approve",
      "saved_to_drafts",
      "mark_sent",
      "record_reply",
      "qualify",
      "hold",
      "reopen",
    ]);
  });

  it("defaults to save and rejects an unknown action", () => {
    expect(draftPatchSchema.parse({ id: "draft-1" }).action).toBe("save");
    expect(draftPatchSchema.safeParse({ id: "draft-1", action: "send" }).success).toBe(false);
  });

  it("bounds the optional follow-up reminder created alongside a manual send", () => {
    expect(draftPatchSchema.parse({ id: "draft-1", action: "mark_sent", followUpDays: "7" }).followUpDays).toBe(7);
    expect(draftPatchSchema.safeParse({ id: "draft-1", action: "mark_sent", followUpDays: 0 }).success).toBe(false);
    expect(draftPatchSchema.safeParse({ id: "draft-1", action: "mark_sent", followUpDays: 365 }).success).toBe(false);
  });

  it("caps a generation batch and requires at least one lead and channel", () => {
    const base = { campaignId: "camp-1", leadIds: ["lead-1"], channels: ["email"] };
    expect(draftGenerateSchema.parse(base).regenerate).toBe(false);
    expect(draftGenerateSchema.safeParse({ ...base, leadIds: [] }).success).toBe(false);
    expect(draftGenerateSchema.safeParse({ ...base, channels: [] }).success).toBe(false);
    expect(draftGenerateSchema.safeParse({ ...base, leadIds: Array.from({ length: 41 }, (_, i) => `lead-${i}`) }).success).toBe(false);
  });
});

describe("follow-up validation", () => {
  it("accepts only a YYYY-MM-DD due date", () => {
    const base = { leadId: "lead-1", channel: "email" as const };
    expect(followUpCreateSchema.parse({ ...base, dueOn: "2026-09-03" }).note).toBe("");
    expect(followUpCreateSchema.safeParse({ ...base, dueOn: "03/09/2026" }).success).toBe(false);
    expect(followUpCreateSchema.safeParse({ ...base, dueOn: "2026-09-03T10:00:00Z" }).success).toBe(false);
  });

  it("only allows the three reminder states", () => {
    expect(followUpPatchSchema.safeParse({ id: "fu-1", status: "done" }).success).toBe(true);
    expect(followUpPatchSchema.safeParse({ id: "fu-1", status: "snoozed" }).success).toBe(false);
  });
});
