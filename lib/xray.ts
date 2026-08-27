import type { Channel } from "./types";

export interface XraySeed {
  /** Geography filter, e.g. "India" or "Maharashtra". */
  market: string;
  /** Job titles to look for — LinkedIn and email searches only. */
  roles: string[];
  /** Products, materials or buyer segments. */
  keywords: string[];
  /** Optional company-name filter. */
  companies?: string[];
}

export interface XrayQuery {
  label: string;
  query: string;
}

/** Wrap in quotes when the term contains a space, so Google treats it as a phrase. */
function term(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed;
}

/** `(a OR b OR c)` — or a bare term when there is only one, or "" when empty. */
function orGroup(values: string[], limit = 6) {
  const terms = values.map(term).filter(Boolean).slice(0, limit);
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" OR ")})`;
}

function compose(...parts: string[]) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export const DEFAULT_ROLES = [
  "procurement manager",
  "purchase manager",
  "sourcing manager",
  "supply chain head",
  "founder",
  "R&D manager",
];

/**
 * Google X-Ray strings for a channel. These are the search mechanism the spec
 * calls for: the operator runs them on Google, then adds the profiles they find
 * as leads. Nothing is scraped automatically.
 */
export function buildXrayStrings(channel: Channel, seed: XraySeed): XrayQuery[] {
  const geo = term(seed.market);
  const roles = orGroup(seed.roles.length ? seed.roles : DEFAULT_ROLES);
  const keywords = orGroup(seed.keywords);
  const companies = orGroup(seed.companies ?? []);

  switch (channel) {
    case "linkedin":
      return [
        { label: "Decision-makers by role", query: compose("site:linkedin.com/in", roles, keywords, geo) },
        { label: "Company pages", query: compose("site:linkedin.com/company", keywords, geo) },
        {
          label: "Named accounts",
          query: compose("site:linkedin.com/in", companies || keywords, roles),
        },
        {
          label: "Formulation & R&D",
          query: compose("site:linkedin.com/in", orGroup(["formulation", "R&D", "product development", "quality"]), keywords, geo),
        },
      ];
    case "email":
      return [
        {
          label: "Published purchase contacts",
          query: compose(keywords, geo, orGroup(["purchase", "procurement", "sourcing"]), '"@"', "-site:linkedin.com"),
        },
        { label: "Contact pages", query: compose(keywords, geo, orGroup(["contact us", "get in touch"]), '"email"') },
        {
          label: "RFQ and tender pages",
          query: compose(keywords, geo, orGroup(["RFQ", "request for quotation", "vendor registration"])),
        },
      ];
    case "whatsapp":
      return [
        {
          label: "Published business numbers",
          query: compose(orGroup(["wa.me", "whatsapp business", "whatsapp us"]), keywords, geo),
        },
        {
          label: "Business directories",
          query: compose(keywords, geo, '"whatsapp"', orGroup(["manufacturer", "distributor", "supplier"])),
        },
      ];
    case "instagram":
      return [
        { label: "Brand accounts", query: compose("site:instagram.com", keywords, geo) },
        {
          label: "Founder-led brands",
          query: compose("site:instagram.com", keywords, orGroup(["founder", "handmade", "small batch", "artisan"])),
        },
        {
          label: "Bio-link enquiry pages",
          query: compose("site:instagram.com", keywords, orGroup(["wholesale", "bulk", "B2B", "stockist"])),
        },
      ];
    case "facebook":
      return [
        { label: "Business Pages", query: compose("site:facebook.com", keywords, geo, "-site:facebook.com/groups") },
        {
          label: "Owner-managed SMEs",
          query: compose("site:facebook.com", keywords, orGroup(["manufacturer", "unit", "factory", "clinic", "salon"]), geo),
        },
      ];
    case "x":
      return [
        {
          label: "Founders & operators",
          query: compose("(site:x.com OR site:twitter.com)", keywords, orGroup(["founder", "CEO", "building"])),
        },
        {
          label: "Industry commentators",
          query: compose("(site:x.com OR site:twitter.com)", keywords, orGroup(["formulation", "supply chain", "sourcing"])),
        },
      ];
    case "youtube":
      return [
        { label: "Competing & adjacent channels", query: compose("site:youtube.com", keywords, geo) },
        {
          label: "Buyer questions to answer",
          query: compose("site:youtube.com", keywords, orGroup(["how to choose", "supplier", "COA", "MSDS", "MOQ"])),
        },
      ];
    default:
      return [];
  }
}

export function googleUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
