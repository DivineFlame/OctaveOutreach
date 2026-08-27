import type { Channel, DraftType, Lead } from "./types";

export interface ChannelMeta {
  id: Channel;
  /** Spec priority: 1 LinkedIn … 7 YouTube. */
  priority: number;
  label: string;
  short: string;
  bestFor: string;
  /** Draft types this channel can produce, in generation order. */
  draftTypes: DraftType[];
  /** True when the spec requires an explicit opt-in before drafting. */
  requiresConsent: boolean;
  /** Shown in the UI next to the channel so the operator knows the rule. */
  policy: string;
}

export const CHANNEL_META: Record<Channel, ChannelMeta> = {
  linkedin: {
    id: "linkedin",
    priority: 1,
    label: "LinkedIn",
    short: "in",
    bestFor: "Procurement managers, founders and B2B decision-makers",
    draftTypes: ["connection_note", "post_acceptance"],
    requiresConsent: false,
    policy:
      "Connect and Send stay manual. The LinkedIn User Agreement prohibits unauthorised bots that add contacts or send messages.",
  },
  email: {
    id: "email",
    priority: 2,
    label: "Email",
    short: "@",
    bestFor: "Brochures, specifications, quotations and formal follow-ups",
    draftTypes: ["intro_email", "follow_up_email", "quotation", "rfq_response"],
    requiresConsent: false,
    policy:
      "Approved emails open a pre-filled compose window so you can save them to Gmail/Outlook drafts and send manually.",
  },
  whatsapp: {
    id: "whatsapp",
    priority: 3,
    label: "WhatsApp",
    short: "WA",
    bestFor: "Opted-in business contacts and warm follow-ups",
    draftTypes: ["whatsapp_intro", "product_summary"],
    requiresConsent: true,
    policy:
      "Only published business numbers or contacts who asked to hear from you. Personal and unverified numbers are never drafted.",
  },
  instagram: {
    id: "instagram",
    priority: 4,
    label: "Instagram",
    short: "IG",
    bestFor: "D2C beauty, wellness, skincare and lifestyle brands",
    draftTypes: ["instagram_dm", "public_comment"],
    requiresConsent: false,
    policy:
      "Every DM and comment must reference something specific and public about the brand. Generic “Check DM” comments are rejected.",
  },
  facebook: {
    id: "facebook",
    priority: 5,
    label: "Facebook",
    short: "f",
    bestFor: "SMEs, regional manufacturers and owner-managed businesses",
    draftTypes: ["page_message", "enquiry_reply"],
    requiresConsent: false,
    policy: "Published business Pages only — never personal-profile mass messaging.",
  },
  x: {
    id: "x",
    priority: 6,
    label: "X",
    short: "X",
    bestFor: "Founders, industry experts and public relationship building",
    draftTypes: ["public_reply", "direct_message"],
    requiresConsent: false,
    policy: "Relationship building first. Posting and messaging remain manual.",
  },
  youtube: {
    id: "youtube",
    priority: 7,
    label: "YouTube",
    short: "YT",
    bestFor: "Credibility, product education and inbound lead generation",
    draftTypes: ["video_topic", "video_script"],
    requiresConsent: false,
    policy: "Publishing only. The agent never auto-comments or mass-messages viewers.",
  },
};

/** Channels ordered by the spec's priority list. */
export const CHANNELS_BY_PRIORITY: ChannelMeta[] = Object.values(CHANNEL_META).sort(
  (a, b) => a.priority - b.priority,
);

const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  connection_note: "Connection note",
  post_acceptance: "Post-acceptance message",
  intro_email: "Introduction",
  follow_up_email: "Follow-up",
  quotation: "Quotation",
  rfq_response: "RFQ response",
  whatsapp_intro: "Introduction",
  product_summary: "Product summary",
  instagram_dm: "DM",
  public_comment: "Public comment",
  page_message: "Page message",
  enquiry_reply: "Enquiry reply",
  public_reply: "Public reply",
  direct_message: "Direct message",
  video_topic: "Video topic",
  video_script: "Video script",
  connection: "Connection note",
  message: "Message",
  email: "Introduction",
  post: "Post",
  video: "Video outline",
};

export function draftTypeLabel(type: DraftType | string) {
  return DRAFT_TYPE_LABELS[type as DraftType] ?? String(type).replaceAll("_", " ");
}

export function channelLabel(channel: Channel | string) {
  return CHANNEL_META[channel as Channel]?.label ?? String(channel);
}

/** Digits-only phone number, suitable for a wa.me link. */
export function whatsappDigits(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

function handleToUrl(value: string, base: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${base}${trimmed.replace(/^@/, "").replace(/^\/+/, "")}`;
}

/** The profile/page URL stored for a channel, falling back to the legacy field. */
export function profileFor(lead: Pick<Lead, "profiles" | "profileUrl" | "channel">, channel: Channel) {
  const stored = lead.profiles?.[channel]?.trim();
  if (stored) return stored;
  if (lead.channel === channel) return lead.profileUrl?.trim() ?? "";
  return "";
}

export type MailClient = "gmail" | "outlook" | "default";

/**
 * The URL the "Open platform" action navigates to. Returns an empty string when
 * the lead has no usable destination for that channel — the caller should then
 * fall back to the X-Ray search builder.
 */
export function openPlatformUrl(
  lead: Lead,
  channel: Channel,
  draft?: { subject?: string; body?: string },
  mailClient: MailClient = "gmail",
): string {
  const profile = profileFor(lead, channel);
  switch (channel) {
    case "linkedin":
      return profile || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        [lead.contactName, lead.company].filter(Boolean).join(" "),
      )}`;
    case "email": {
      if (!lead.email) return "";
      const subject = encodeURIComponent(draft?.subject ?? "");
      const body = encodeURIComponent(draft?.body ?? "");
      if (mailClient === "outlook") {
        return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(lead.email)}&subject=${subject}&body=${body}`;
      }
      if (mailClient === "default") {
        return `mailto:${encodeURIComponent(lead.email)}?subject=${subject}&body=${body}`;
      }
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${subject}&body=${body}`;
    }
    case "whatsapp": {
      const digits = whatsappDigits(lead.phone);
      if (!digits) return "";
      const text = draft?.body ? `?text=${encodeURIComponent(draft.body)}` : "";
      return `https://wa.me/${digits}${text}`;
    }
    case "instagram":
      return handleToUrl(profile, "https://www.instagram.com/");
    case "facebook":
      return handleToUrl(profile, "https://www.facebook.com/");
    case "x":
      return handleToUrl(profile, "https://x.com/");
    case "youtube":
      return profile || "https://studio.youtube.com";
    default:
      return "";
  }
}

/** Machine-readable reason a gate is blocked, so callers can branch on it without string-matching `reason`. */
export type ChannelGateCode =
  | "ok"
  | "do_not_contact"
  | "opted_out"
  | "no_email"
  | "no_whatsapp_number"
  | "whatsapp_personal_unverified"
  | "whatsapp_unclassified"
  | "whatsapp_consent_unknown"
  | "no_profile";

export interface ChannelGate {
  allowed: boolean;
  /** Why the channel is blocked, or the consent basis when it is allowed. */
  reason: string;
  code: ChannelGateCode;
}

/**
 * Channels that cannot be opened without a stored page or handle. LinkedIn falls
 * back to a people search, email uses the address, WhatsApp uses the number and
 * YouTube is publishing rather than outreach — so none of those are gated here.
 */
const PROFILE_REQUIRED: Channel[] = ["instagram", "facebook", "x"];

/**
 * Whether a lead may be drafted for a channel. Enforces Do Not Contact, opt-outs
 * and the WhatsApp rule that personal or unverified numbers are never messaged.
 */
export function channelGate(lead: Lead, channel: Channel): ChannelGate {
  if (lead.doNotContact) {
    return { allowed: false, reason: lead.doNotContactReason || "Marked Do Not Contact", code: "do_not_contact" };
  }
  if (lead.consentStatus === "opted_out") {
    return { allowed: false, reason: "Contact has opted out", code: "opted_out" };
  }
  if (channel === "email" && !lead.email) {
    return { allowed: false, reason: "No email address on file", code: "no_email" };
  }
  if (channel === "whatsapp") {
    if (!whatsappDigits(lead.phone)) {
      return { allowed: false, reason: "No WhatsApp number on file", code: "no_whatsapp_number" };
    }
    if (lead.whatsappNumberType === "personal_unverified") {
      return {
        allowed: false,
        reason: "Personal or unverified number — cold messaging is not permitted",
        code: "whatsapp_personal_unverified",
      };
    }
    if (lead.whatsappNumberType === "unknown") {
      return {
        allowed: false,
        reason: "Classify the number as a published business or professional number first",
        code: "whatsapp_unclassified",
      };
    }
    if (lead.consentStatus === "unknown") {
      return {
        allowed: false,
        reason: "Record how this contact opted in (published number, enquiry, reply or event)",
        code: "whatsapp_consent_unknown",
      };
    }
    return {
      allowed: true,
      reason: lead.consentBasis || `Consent: ${lead.consentStatus.replaceAll("_", " ")}`,
      code: "ok",
    };
  }
  if (!PROFILE_REQUIRED.includes(channel) || profileFor(lead, channel)) {
    return { allowed: true, reason: "Public business information", code: "ok" };
  }
  return { allowed: false, reason: `No ${channelLabel(channel)} profile stored`, code: "no_profile" };
}
