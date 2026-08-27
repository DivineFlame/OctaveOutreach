import { beforeAll, describe, expect, it } from "vitest";
import { CHANNEL_META } from "../lib/channels";
import { looksGeneric, planContentDrafts, planDrafts, recommendCollateral, trimTo } from "../lib/drafting";
import { makeCampaign, makeLead, makeSettings } from "./fixtures";

// Every assertion below is about the deterministic template path, so pin the
// provider off rather than depending on whether the machine has an API key.
beforeAll(() => {
  process.env.LLM_PROVIDER = "none";
});

describe("trimTo", () => {
  it("leaves text inside the limit untouched", () => {
    expect(trimTo("  Short note.  ", 300)).toBe("Short note.");
  });

  it("cuts at the last sentence break when one is far enough in", () => {
    const text = "The first sentence is long enough to pass the halfway mark. Second sentence runs well past the limit.";
    const result = trimTo(text, 70);
    expect(result).toBe("The first sentence is long enough to pass the halfway mark.");
    expect(result.length).toBeLessThanOrEqual(70);
  });

  it("falls back to a word break with an ellipsis when there is no sentence break", () => {
    const text = "a".repeat(20) + " " + "b".repeat(20) + " " + "c".repeat(40);
    const result = trimTo(text, 50);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toContain("ccc");
    expect(result.length).toBeLessThanOrEqual(51);
  });

  it("keeps LinkedIn connection notes inside the 300-character platform limit", async () => {
    const lead = makeLead({ company: "C".repeat(120), role: "R".repeat(120) });
    const drafts = await planDrafts({
      lead,
      campaign: makeCampaign(),
      settings: makeSettings(),
      channels: ["linkedin"],
      types: ["connection_note"],
    });
    expect(drafts[0].body.length).toBeLessThanOrEqual(300);
  });
});

describe("looksGeneric", () => {
  it("rejects the exact filler the spec calls out", () => {
    expect(looksGeneric("Check DM")).toBe(true);
    expect(looksGeneric("Sent you a DM about this, please reply when you can.")).toBe(true);
    expect(looksGeneric("Nice post!")).toBe(true);
    expect(looksGeneric("Interested")).toBe(true);
    expect(looksGeneric("DM for price and we can discuss further about the order")).toBe(true);
    expect(looksGeneric("Follow us for more updates on natural formulations and oils")).toBe(true);
  });

  it("rejects anything too short to be personalised", () => {
    expect(looksGeneric("Great range of oils.")).toBe(true);
  });

  it("rejects copy that names nothing specific about the prospect", () => {
    const lead = makeLead({ company: "Botanica Labs", industry: "haircare", notes: "" });
    expect(
      looksGeneric(
        "We supply bulk oils to manufacturers across the region and can share documentation on request.",
        lead,
      ),
    ).toBe(true);
  });

  it("accepts copy that references a researched detail", () => {
    const lead = makeLead({ company: "Botanica Labs", industry: "haircare", notes: "" });
    expect(
      looksGeneric(
        "Your Botanica Labs haircare range caught my eye — we supply cold-pressed carrier oils in bulk with COA.",
        lead,
      ),
    ).toBe(false);
  });
});

describe("recommendCollateral", () => {
  it("recommends nothing for a LinkedIn connection note", () => {
    expect(recommendCollateral("connection_note", makeSettings())).toEqual([]);
  });

  it("names the workspace's own documents when it has them", () => {
    const settings = makeSettings({
      collateral: [
        { name: "Nuve B2B catalogue 2026", kind: "catalogue", url: "https://nuveoils.com/catalogue.pdf" },
        { name: "Nuve corporate brochure", kind: "brochure", url: "" },
      ],
    });
    expect(recommendCollateral("intro_email", settings)).toEqual([
      "Nuve corporate brochure",
      "Nuve B2B catalogue 2026",
    ]);
  });

  it("falls back to generic names so the operator still knows what to attach", () => {
    expect(recommendCollateral("rfq_response", makeSettings({ collateral: [] }))).toEqual([
      "Certificate of Analysis",
      "MSDS / safety data sheet",
      "Technical specification sheet",
    ]);
  });
});

describe("planDrafts", () => {
  const campaign = makeCampaign();
  const settings = makeSettings();

  it("produces every draft type the requested channels declare", async () => {
    const drafts = await planDrafts({
      lead: makeLead(),
      campaign,
      settings,
      channels: ["linkedin", "email"],
    });
    expect(drafts.map((draft) => draft.type)).toEqual([
      ...CHANNEL_META.linkedin.draftTypes,
      ...CHANNEL_META.email.draftTypes,
    ]);
    expect(drafts.every((draft) => draft.status === "needs_review")).toBe(true);
    expect(drafts.every((draft) => draft.body.trim().length > 0)).toBe(true);
  });

  it("personalises the copy with the lead and campaign facts", async () => {
    const [connection] = await planDrafts({
      lead: makeLead(),
      campaign,
      settings,
      channels: ["linkedin"],
      types: ["connection_note"],
    });
    expect(connection.body).toContain("Vipin");
    expect(connection.body).toContain("Dabur India");
    expect(connection.body).toContain("Nuve Oils");
  });

  it("gives emails a subject and the follow-up a second sequence step", async () => {
    const drafts = await planDrafts({ lead: makeLead(), campaign, settings, channels: ["email"] });
    const intro = drafts.find((draft) => draft.type === "intro_email");
    const followUp = drafts.find((draft) => draft.type === "follow_up_email");
    expect(intro?.subject).toBeTruthy();
    expect(intro?.sequenceStep).toBe(1);
    expect(followUp?.sequenceStep).toBe(2);
    expect(intro?.attachments.length).toBeGreaterThan(0);
  });

  it("drafts nothing at all for a Do Not Contact lead", async () => {
    const drafts = await planDrafts({
      lead: makeLead({ doNotContact: true, doNotContactReason: "Asked to be removed" }),
      campaign,
      settings,
      channels: ["linkedin", "email", "whatsapp", "instagram"],
    });
    expect(drafts).toEqual([]);
  });

  it("skips channels the lead is not reachable on instead of failing", async () => {
    const drafts = await planDrafts({
      lead: makeLead({ email: "", profileUrl: "", profiles: {} }),
      campaign,
      settings,
      channels: ["linkedin", "email", "instagram"],
    });
    // LinkedIn still works via people search; email and Instagram are gated out.
    expect([...new Set(drafts.map((draft) => draft.channel))]).toEqual(["linkedin"]);
  });

  it("never drafts WhatsApp to a personal number", async () => {
    const drafts = await planDrafts({
      lead: makeLead({ whatsappNumberType: "personal_unverified" }),
      campaign,
      settings,
      channels: ["whatsapp"],
    });
    expect(drafts).toEqual([]);
  });

  it("parks a classified WhatsApp number with no consent basis as waiting_consent", async () => {
    const drafts = await planDrafts({
      lead: makeLead({ whatsappNumberType: "business_public", consentStatus: "unknown" }),
      campaign,
      settings,
      channels: ["whatsapp"],
    });
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((draft) => draft.status === "waiting_consent")).toBe(true);
  });

  it("marks a consented business number ready for review", async () => {
    const drafts = await planDrafts({
      lead: makeLead({
        whatsappNumberType: "business_public",
        consentStatus: "consented",
        consentBasis: "Published WhatsApp Business number",
      }),
      campaign,
      settings,
      channels: ["whatsapp"],
    });
    expect(drafts.every((draft) => draft.status === "needs_review")).toBe(true);
  });
});

describe("planContentDrafts", () => {
  it("returns nothing unless the campaign includes YouTube", () => {
    expect(planContentDrafts(makeCampaign({ channels: ["linkedin"] }), makeSettings())).toEqual([]);
  });

  it("plans lead-independent YouTube content", () => {
    const drafts = planContentDrafts(makeCampaign({ channels: ["youtube"] }), makeSettings());
    expect(drafts.map((draft) => draft.type)).toEqual(CHANNEL_META.youtube.draftTypes);
    expect(drafts.every((draft) => draft.channel === "youtube")).toBe(true);
    expect(drafts.every((draft) => draft.attachments.length === 0)).toBe(true);
  });
});
