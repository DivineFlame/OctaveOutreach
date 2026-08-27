import { DEFAULT_SETTINGS, type Campaign, type Lead, type WorkspaceSettings } from "../lib/types";

/** A lead with every field filled in as a compliant, drafting-ready contact. */
export function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    campaignId: "camp-1",
    company: "Dabur India",
    contactName: "Vipin Kumar",
    role: "Procurement Manager",
    companyDomain: "dabur.com",
    industry: "Ayurvedic personal care",
    location: "Ghaziabad, India",
    email: "vipin.kumar@dabur.com",
    phone: "+91 98100 12345",
    channel: "linkedin",
    profileUrl: "https://www.linkedin.com/in/vipin-kumar",
    profiles: {},
    sourceUrl: "https://www.dabur.com/contact",
    status: "new",
    priority: "A",
    verificationStatus: "verified",
    verificationSource: "Company contact page",
    consentStatus: "unknown",
    consentBasis: "",
    consentRecordedAt: null,
    whatsappNumberType: "unknown",
    emailStage: "none",
    doNotContact: false,
    doNotContactReason: "",
    notes: "Sources cold-pressed carrier oils for a botanical haircare range.",
    lastContactedAt: null,
    repliedAt: null,
    discoveredAt: "2026-01-05T00:00:00.000Z",
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

export function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    name: "India personal care",
    website: "https://nuveoils.com",
    market: "India",
    leadGoal: 50,
    channels: ["linkedin", "email"],
    status: "ready",
    analysis: {
      summary: "Bulk supplier of cold-pressed carrier oils, essential oils and Ayurvedic oils.",
      products: ["cold-pressed carrier oils", "essential oils", "Ayurvedic oils"],
      buyerSegments: ["personal care manufacturers", "skincare brands"],
      valuePropositions: ["COA and MSDS with every batch", "Sample-first onboarding"],
      pitch: "Bulk oils with supporting specifications and samples.",
      xrayStrings: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeSettings(overrides: Partial<WorkspaceSettings> = {}): WorkspaceSettings {
  return {
    ...DEFAULT_SETTINGS,
    companyName: "Nuve Oils",
    companyWebsite: "https://nuveoils.com",
    senderName: "Anita Rao",
    senderTitle: "Business Development",
    senderEmail: "anita@nuveoils.com",
    senderPhone: "+91 98200 00000",
    ...overrides,
  };
}
