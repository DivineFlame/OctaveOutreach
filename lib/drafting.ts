import { CHANNEL_META, channelGate, draftTypeLabel, whatsappDigits } from "./channels";
import { generateJson } from "./llm";
import { z } from "zod";
import {
  CHANNELS,
  DRAFT_TYPES,
  type Campaign,
  type Channel,
  type Collateral,
  type DraftStatus,
  type DraftType,
  type Lead,
  type WorkspaceSettings,
} from "./types";

export interface DraftPlan {
  channel: Channel;
  type: DraftType;
  subject: string;
  body: string;
  attachments: string[];
  sequenceStep: number;
  status: DraftStatus;
}

export interface DraftContext {
  lead: Lead;
  campaign: Campaign;
  settings: WorkspaceSettings;
}

/**
 * Platform limits and practical lengths. LinkedIn rejects connection notes over
 * 300 characters and X replies over 280, so these are enforced, not advisory.
 */
const TYPE_LIMITS: Partial<Record<DraftType, number>> = {
  connection_note: 300,
  public_comment: 220,
  public_reply: 270,
  direct_message: 900,
  whatsapp_intro: 700,
  product_summary: 900,
  instagram_dm: 900,
  page_message: 900,
};

/** Trim to a limit at a sentence break where possible, otherwise a word break. */
export function trimTo(text: string, limit: number) {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const window = clean.slice(0, limit);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
  if (sentenceEnd > limit * 0.5) return window.slice(0, sentenceEnd + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return `${window.slice(0, wordEnd > 0 ? wordEnd : limit).trim()}…`;
}

const GENERIC_COMMENT_PATTERNS = [
  /check\s*(your\s*)?dm/i,
  /sent\s*you\s*a\s*(dm|message)/i,
  /^\s*(nice|great|lovely|amazing|awesome|beautiful|good)\s*(post|work|product|brand)?\s*[!.]*\s*$/i,
  /^\s*interested\s*[!.]*\s*$/i,
  /dm\s*for\s*(details|price|collab)/i,
  /follow\s*(us|back)/i,
];

/**
 * The spec forbids generic comments such as "Check DM" repeated across accounts.
 * Anything matching, too short, or naming nothing specific about the prospect is
 * rejected and the deterministic template is used instead.
 */
export function looksGeneric(body: string, lead?: Pick<Lead, "company" | "industry" | "notes">) {
  const text = body.trim();
  if (text.length < 40) return true;
  if (GENERIC_COMMENT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (!lead) return false;
  const specifics = [lead.company, lead.industry, ...lead.notes.split(/[\s,.;]+/)]
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 4);
  if (!specifics.length) return false;
  const lower = text.toLowerCase();
  return !specifics.some((token) => lower.includes(token));
}

const DEFAULT_COLLATERAL_NAMES: Record<Collateral["kind"], string> = {
  brochure: "Company brochure",
  catalogue: "B2B product catalogue",
  coa: "Certificate of Analysis",
  msds: "MSDS / safety data sheet",
  spec: "Technical specification sheet",
  price_list: "Indicative price list",
  other: "Supporting document",
};

const COLLATERAL_BY_TYPE: Partial<Record<DraftType, Collateral["kind"][]>> = {
  connection_note: [],
  post_acceptance: ["catalogue"],
  intro_email: ["brochure", "catalogue"],
  follow_up_email: ["catalogue", "spec"],
  quotation: ["price_list", "spec"],
  rfq_response: ["coa", "msds", "spec"],
  whatsapp_intro: ["catalogue"],
  product_summary: ["catalogue", "spec"],
  instagram_dm: ["catalogue"],
  public_comment: [],
  page_message: ["brochure", "catalogue"],
  enquiry_reply: ["brochure", "spec"],
  public_reply: [],
  direct_message: ["catalogue"],
  video_topic: [],
  video_script: [],
};

/**
 * Which brochure or document this draft should recommend. Prefers the workspace's
 * own collateral list and falls back to generic names so the draft still tells
 * the operator what to attach.
 */
export function recommendCollateral(type: DraftType, settings: WorkspaceSettings): string[] {
  const kinds = COLLATERAL_BY_TYPE[type] ?? [];
  if (!kinds.length) return [];
  const names: string[] = [];
  for (const kind of kinds) {
    const owned = settings.collateral.filter((item) => item.kind === kind).map((item) => item.name);
    if (owned.length) names.push(...owned);
    else names.push(DEFAULT_COLLATERAL_NAMES[kind]);
  }
  return [...new Set(names)].slice(0, 4);
}

function firstName(lead: Lead) {
  const name = lead.contactName.trim();
  if (!name) return "";
  return name.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, "");
}

function greeting(lead: Lead) {
  const first = firstName(lead);
  if (first) return first;
  if (lead.role) return lead.role;
  return "there";
}

function lower(value: string) {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function joinList(values: string[], conjunction = "and") {
  const items = values.filter(Boolean);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

function products(campaign: Campaign, count = 3) {
  const list = campaign.analysis?.products?.slice(0, count).map(lower) ?? [];
  return list.length ? joinList(list) : "our product range";
}

function segment(campaign: Campaign) {
  return lower(campaign.analysis?.buyerSegments?.[0] ?? "manufacturers and brand owners");
}

function valueProp(campaign: Campaign, index = 0) {
  return campaign.analysis?.valuePropositions?.[index] ?? "";
}

function us(settings: WorkspaceSettings, campaign: Campaign) {
  return settings.companyName.trim() || campaign.name.trim() || "our team";
}

/** The specific, researched detail that makes a message non-generic. */
function observation(lead: Lead) {
  const note = lead.notes.trim();
  if (note) {
    const sentence = note.split(/(?<=[.!?])\s/)[0].trim();
    return sentence.replace(/\.$/, "");
  }
  if (lead.industry) return `${lead.company}’s work in ${lower(lead.industry)}`;
  return lead.company;
}

function signature(settings: WorkspaceSettings, campaign: Campaign) {
  if (settings.signature.trim()) return settings.signature.trim();
  return [
    settings.senderName || "—",
    [settings.senderTitle, us(settings, campaign)].filter(Boolean).join(", "),
    settings.senderEmail,
    settings.senderPhone,
    settings.companyWebsite,
  ]
    .filter(Boolean)
    .join("\n");
}

function toneOpener(settings: WorkspaceSettings) {
  switch (settings.tone) {
    case "concise":
      return "Keeping this short:";
    case "technical":
      return "Sharing this with the technical detail up front:";
    default:
      return "";
  }
}

function templateBody(type: DraftType, ctx: DraftContext): { subject: string; body: string } {
  const { lead, campaign, settings } = ctx;
  const brand = us(settings, campaign);
  const productLine = products(campaign);
  const collateral = joinList(recommendCollateral(type, settings));
  const sign = signature(settings, campaign);
  const to = lead.contactName.trim() || (lead.role ? `${lead.role} team` : `${lead.company} team`);
  const opener = toneOpener(settings);

  switch (type) {
    case "connection_note":
      return {
        subject: "",
        body: `Hi ${greeting(lead)} — I work with ${brand}, supplying ${productLine}. Given your role at ${lead.company}, I thought it would be useful to connect.`,
      };

    case "post_acceptance":
      return {
        subject: "",
        body: `Thanks for connecting, ${greeting(lead)}.\n\n${brand} supplies ${productLine} to ${segment(campaign)}, with specifications, COA and MSDS available on request and samples for evaluation.\n\nIf ${lead.company} is reviewing suppliers for any of these materials, I can share our catalogue and current lead times. Would that be useful?`,
      };

    case "intro_email":
      return {
        subject: `${productLine.replace(/^./, (c) => c.toUpperCase())} for ${lead.company}`,
        body: [
          `Dear ${to},`,
          "",
          opener ? `${opener} I came across ${observation(lead)}.` : `I came across ${observation(lead)}.`,
          "",
          `${brand} supplies ${productLine} to ${segment(campaign)}. ${valueProp(campaign) || "We work to written specifications and support every consignment with documentation."}`,
          "",
          collateral ? `Happy to send our ${collateral} so your team can review grades, packaging and documentation.` : "",
          "",
          `If it is useful, tell me the material, approximate volume and delivery location and I will send an indicative quotation along with sample availability.`,
          "",
          sign,
        ]
          .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
          .join("\n"),
      };

    case "follow_up_email":
      return {
        subject: `Following up — ${productLine} for ${lead.company}`,
        body: [
          `Dear ${to},`,
          "",
          `Following up on my note about ${productLine}. I appreciate sourcing decisions run on their own cycle, so this is only to keep the option open.`,
          "",
          collateral ? `I have attached our ${collateral} in case it helps your evaluation.` : "",
          "",
          `If a quotation would be useful, the material, MOQ, packaging preference and destination are all I need.`,
          "",
          sign,
        ]
          .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
          .join("\n"),
      };

    case "quotation":
      return {
        subject: `Quotation — ${productLine} for ${lead.company}`,
        body: [
          `Dear ${to},`,
          "",
          `Thank you for the enquiry. Our indicative offer follows — please confirm the grade and volume and I will issue a firm quotation.`,
          "",
          "Material:",
          "Grade / specification:",
          "Quantity and packaging:",
          "Price basis (Ex-works / FOB / CIF):",
          "Lead time:",
          "Payment terms:",
          "Validity:",
          "",
          collateral ? `Attached: ${collateral}.` : "",
          "",
          `Samples can be despatched against a written request. Prices are subject to confirmation at the time of order.`,
          "",
          sign,
        ]
          .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
          .join("\n"),
      };

    case "rfq_response":
      return {
        subject: `Response to your RFQ — ${lead.company}`,
        body: [
          `Dear ${to},`,
          "",
          `Thank you for including ${brand} in your enquiry. Please find our response below, along with the supporting documentation your team asked for.`,
          "",
          "Item and specification offered:",
          "Conformance to your specification:",
          "Quantity, packaging and lead time:",
          "Price and commercial terms:",
          "Documentation enclosed:",
          "",
          collateral ? `Attached: ${collateral}.` : "",
          "",
          `If any line item needs an alternative grade or a revised packaging plan, I can send a corrected offer the same day.`,
          "",
          sign,
        ]
          .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
          .join("\n"),
      };

    case "whatsapp_intro":
      return {
        subject: "",
        body: `Hello ${greeting(lead)}, this is ${settings.senderName || brand} from ${brand}. ${lead.consentBasis ? `Reaching out following ${lower(lead.consentBasis)}.` : "Reaching out on the business number published on your page."} We supply ${productLine}. May I send our product list and specifications here?`,
      };

    case "product_summary":
      return {
        subject: "",
        body: [
          `${brand} — product summary`,
          "",
          ...(campaign.analysis?.products?.slice(0, 5).map((product) => `• ${product}`) ?? [`• ${productLine}`]),
          "",
          `Documentation: specification sheet, COA and MSDS on request.`,
          `Samples: available against a written request.`,
          "",
          collateral ? `I can send the ${collateral} here or by email — whichever is easier.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };

    case "instagram_dm":
      return {
        subject: "",
        body: `Hi${firstName(lead) ? ` ${firstName(lead)}` : ""}, I came across ${observation(lead)} and particularly liked your focus on ${lower(lead.industry || segment(campaign))}. ${brand} supplies ${productLine} with supporting specifications and samples. May I share our B2B catalogue?`,
      };

    case "public_comment":
      return {
        subject: "",
        body: `${observation(lead).replace(/^./, (c) => c.toUpperCase())} — genuinely well put together. The emphasis on ${lower(lead.industry || segment(campaign))} is the part most brands skip.`,
      };

    case "page_message":
      return {
        subject: "",
        body: `Hello ${lead.company} team, I came across ${observation(lead)}. ${brand} supplies ${productLine} to ${segment(campaign)}, with specifications and samples available. Could you point me to the person who handles purchase, so I can share the right information?`,
      };

    case "enquiry_reply":
      return {
        subject: "",
        body: `Thanks for the enquiry. ${brand} supplies ${productLine}${lead.location ? `, including deliveries into ${lead.location}` : ""}. ${collateral ? `I can send our ${collateral} along with pricing.` : "I can send specifications along with pricing."} Would you prefer the details here or by email?`,
      };

    case "public_reply":
      return {
        subject: "",
        body: `${observation(lead).replace(/^./, (c) => c.toUpperCase())} — this matches what we see on the supply side too. ${valueProp(campaign, 1) || `The gap is usually documentation rather than the material itself.`}`,
      };

    case "direct_message":
      return {
        subject: "",
        body: `Hi ${greeting(lead)} — enjoyed your posts on ${lower(lead.industry || segment(campaign))}. I work with ${brand} on ${productLine}. No pitch intended; happy to share what we see across buyers if it is ever useful.`,
      };

    case "video_topic":
      return {
        subject: `How to qualify a ${lower(productLine.split(",")[0])} supplier`,
        body: [
          "Topic ideas for the channel:",
          "",
          `1. How to qualify a ${lower(productLine.split(",")[0])} supplier — the five checks buyers skip`,
          "2. Refined vs cold-pressed: what changes for your formulation",
          "3. COA and MSDS explained in plain language",
          `4. Choosing ${productLine} for skincare and wellness formulations`,
          "5. Private-label manufacturing: what the brief needs to contain",
          "6. MOQ, packaging and samples — how B2B orders actually work",
          "7. Product demonstration: handling, storage and shelf life",
          "",
          `Call to action: “If you are evaluating suppliers, the specification sheet and sample request form are linked in the description.”`,
          "",
          `Description hook: ${campaign.analysis?.summary ?? `${brand} supplies ${productLine}.`}`,
        ].join("\n"),
      };

    case "video_script":
      return {
        subject: `Script — how to qualify a ${lower(productLine.split(",")[0])} supplier`,
        body: [
          "Hook (0:00–0:15)",
          `Most buyers compare price first. That is the reason the second order goes wrong.`,
          "",
          "Problem (0:15–1:00)",
          `What actually varies between suppliers of ${productLine}: grade consistency, documentation, and lead-time reliability.`,
          "",
          "The five checks (1:00–4:00)",
          "1. Specification in writing, not a datasheet screenshot",
          "2. COA per batch, traceable to the lot you received",
          "3. MSDS matching the shipped grade",
          "4. Sample from production stock, not a curated sample",
          "5. Written lead time and packaging plan",
          "",
          "Demonstration (4:00–5:30)",
          "Show the documentation set against a physical sample.",
          "",
          "Close and CTA (5:30–6:00)",
          `${brand} supplies ${productLine}. Specification sheet and sample request are linked below. Comment with the material you are evaluating and I will point you to the right document.`,
        ].join("\n"),
      };

    // Pre-003 draft types, retained so regeneration on legacy rows still works.
    default:
      return {
        subject: draftTypeLabel(type),
        body: `${brand} supplies ${productLine}. ${campaign.analysis?.pitch ?? ""}`.trim(),
      };
  }
}

/**
 * Whether a lead may be drafted for a channel, and at what starting status.
 * WhatsApp is the only channel that produces a held draft: the spec allows
 * preparing the message while consent is pending, but never for a personal or
 * unverified number.
 */
function draftingGate(lead: Lead, channel: Channel): { skip: boolean; status: DraftStatus } {
  if (lead.doNotContact || lead.consentStatus === "opted_out") return { skip: true, status: "held" };
  if (channel === "whatsapp") {
    if (!whatsappDigits(lead.phone) || lead.whatsappNumberType === "personal_unverified") {
      return { skip: true, status: "held" };
    }
    const gate = channelGate(lead, channel);
    return { skip: false, status: gate.allowed ? "needs_review" : "waiting_consent" };
  }
  return channelGate(lead, channel).allowed ? { skip: false, status: "needs_review" } : { skip: true, status: "held" };
}

const rewriteSchema = z.object({
  drafts: z
    .array(
      z.object({
        channel: z.enum(CHANNELS),
        type: z.enum(DRAFT_TYPES),
        subject: z.string(),
        body: z.string(),
      }),
    )
    .max(20),
});

const REWRITE_INSTRUCTIONS = `You write B2B outreach copy for a supplier's sales team.

Rules:
- Use only the facts supplied. Never invent certifications, client names, prices, volumes, awards or claims.
- Personalise every message with the specific research detail provided. Never write filler such as "Check DM", "Nice post" or "Interested".
- One clear ask per message. No emoji. No exclamation marks in email.
- Keep the structure and intent of the supplied template; improve the wording, specificity and flow.
- Respect the character limit given for each item.
- Emails keep the salutation, body and signature block. Leave the signature exactly as supplied.
- Return one entry per requested item, with the same channel and type values.`;

async function rewriteWithModel(plans: DraftPlan[], ctx: DraftContext): Promise<DraftPlan[]> {
  const { lead, campaign, settings } = ctx;
  const input = JSON.stringify(
    {
      sender: {
        company: us(settings, campaign),
        website: settings.companyWebsite,
        contact: settings.senderName,
        title: settings.senderTitle,
        tone: settings.tone,
      },
      offering: {
        summary: campaign.analysis?.summary ?? "",
        products: campaign.analysis?.products ?? [],
        buyerSegments: campaign.analysis?.buyerSegments ?? [],
        valuePropositions: campaign.analysis?.valuePropositions ?? [],
      },
      prospect: {
        company: lead.company,
        contactName: lead.contactName,
        role: lead.role,
        industry: lead.industry,
        location: lead.location,
        researchNotes: lead.notes,
      },
      items: plans.map((plan) => ({
        channel: plan.channel,
        type: plan.type,
        purpose: `${CHANNEL_META[plan.channel].label} — ${draftTypeLabel(plan.type)}`,
        characterLimit: TYPE_LIMITS[plan.type] ?? 2500,
        recommendedAttachments: plan.attachments,
        template: { subject: plan.subject, body: plan.body },
      })),
    },
    null,
    2,
  );

  const result = await generateJson({
    schema: rewriteSchema,
    instructions: REWRITE_INSTRUCTIONS,
    input,
    maxTokens: 8_000,
  });
  if (!result) return plans;

  const byKey = new Map(result.drafts.map((draft) => [`${draft.channel}:${draft.type}`, draft]));
  return plans.map((plan) => {
    const improved = byKey.get(`${plan.channel}:${plan.type}`);
    if (!improved?.body?.trim()) return plan;
    // Personalisation is mandatory for public comments and replies.
    if ((plan.type === "public_comment" || plan.type === "public_reply") && looksGeneric(improved.body, ctx.lead)) {
      return plan;
    }
    return {
      ...plan,
      subject: improved.subject?.trim() || plan.subject,
      body: improved.body.trim(),
    };
  });
}

function finalise(plan: DraftPlan): DraftPlan {
  const limit = TYPE_LIMITS[plan.type];
  return {
    ...plan,
    subject: plan.subject.trim().slice(0, 300),
    body: limit ? trimTo(plan.body, limit) : plan.body.trim().slice(0, 10_000),
  };
}

/**
 * Build the drafts for one lead across the requested channels. The templates are
 * deterministic; when a model key is configured the copy is rewritten and any
 * result that fails the personalisation guard falls back to its template. The
 * function never throws for lack of a model.
 */
export async function planDrafts(input: {
  lead: Lead;
  campaign: Campaign;
  settings: WorkspaceSettings;
  channels: Channel[];
  types?: DraftType[];
}): Promise<DraftPlan[]> {
  const ctx: DraftContext = { lead: input.lead, campaign: input.campaign, settings: input.settings };
  const plans: DraftPlan[] = [];

  for (const channel of input.channels) {
    const gate = draftingGate(input.lead, channel);
    if (gate.skip) continue;
    const wanted = CHANNEL_META[channel].draftTypes.filter(
      (type) => !input.types?.length || input.types.includes(type),
    );
    for (const type of wanted) {
      const { subject, body } = templateBody(type, ctx);
      plans.push({
        channel,
        type,
        subject,
        body,
        attachments: recommendCollateral(type, input.settings),
        sequenceStep: type === "follow_up_email" ? 2 : 1,
        status: gate.status,
      });
    }
  }

  if (!plans.length) return [];

  try {
    const rewritten = await rewriteWithModel(plans, ctx);
    return rewritten.map(finalise);
  } catch {
    // A model failure must never block the operator — ship the templates.
    return plans.map(finalise);
  }
}

/**
 * Channel-level content that is not tied to a lead. YouTube is publishing rather
 * than outreach, so its drafts hang off the campaign with `leadId = null`.
 */
export function planContentDrafts(campaign: Campaign, settings: WorkspaceSettings): DraftPlan[] {
  if (!campaign.channels.includes("youtube")) return [];
  const placeholder: Lead = {
    id: "",
    campaignId: campaign.id,
    company: settings.companyName || campaign.name,
    contactName: "",
    role: "",
    companyDomain: "",
    industry: "",
    location: campaign.market,
    email: "",
    phone: "",
    channel: "youtube",
    profileUrl: "",
    profiles: {},
    sourceUrl: "",
    status: "new",
    priority: "B",
    verificationStatus: "unverified",
    verificationSource: "",
    consentStatus: "unknown",
    consentBasis: "",
    consentRecordedAt: null,
    whatsappNumberType: "unknown",
    emailStage: "none",
    doNotContact: false,
    doNotContactReason: "",
    notes: "",
    lastContactedAt: null,
    repliedAt: null,
    discoveredAt: "",
    createdAt: "",
    updatedAt: "",
  };
  const ctx: DraftContext = { lead: placeholder, campaign, settings };
  return CHANNEL_META.youtube.draftTypes.map((type) => {
    const { subject, body } = templateBody(type, ctx);
    return finalise({
      channel: "youtube",
      type,
      subject,
      body,
      attachments: [],
      sequenceStep: 1,
      status: "needs_review",
    });
  });
}
