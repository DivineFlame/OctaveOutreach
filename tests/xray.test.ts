import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, buildXrayStrings, googleUrl } from "../lib/xray";
import { CHANNELS } from "../lib/types";

const SEED = {
  market: "United Arab Emirates",
  roles: ["procurement manager", "founder"],
  keywords: ["carrier oils", "essential oils"],
  companies: ["Dabur"],
};

describe("buildXrayStrings", () => {
  it("returns at least one usable query for every channel", () => {
    for (const channel of CHANNELS) {
      const queries = buildXrayStrings(channel, SEED);
      expect(queries.length).toBeGreaterThan(0);
      for (const { label, query } of queries) {
        expect(label).toBeTruthy();
        expect(query).toBeTruthy();
        // compose() collapses whitespace, so no query should carry doubles or edges.
        expect(query).toBe(query.trim());
        expect(query).not.toMatch(/\s\s/);
      }
    }
  });

  it("scopes each channel to its own site operator", () => {
    expect(buildXrayStrings("linkedin", SEED)[0].query).toContain("site:linkedin.com/in");
    expect(buildXrayStrings("instagram", SEED)[0].query).toContain("site:instagram.com");
    expect(buildXrayStrings("youtube", SEED)[0].query).toContain("site:youtube.com");
    expect(buildXrayStrings("x", SEED)[0].query).toContain("(site:x.com OR site:twitter.com)");
    // Facebook Pages only — the spec forbids personal-profile mass messaging.
    expect(buildXrayStrings("facebook", SEED)[0].query).toContain("-site:facebook.com/groups");
  });

  it("quotes multi-word terms and joins alternatives with OR", () => {
    const query = buildXrayStrings("linkedin", SEED)[0].query;
    expect(query).toContain('("procurement manager" OR founder)');
    expect(query).toContain('("carrier oils" OR "essential oils")');
    expect(query).toContain('"United Arab Emirates"');
  });

  it("uses a bare term when only one alternative is supplied", () => {
    const query = buildXrayStrings("linkedin", { ...SEED, market: "India", roles: ["founder"], keywords: ["oils"] })[0]
      .query;
    expect(query).toBe("site:linkedin.com/in founder oils India");
  });

  it("falls back to the default procurement roles when none are given", () => {
    const query = buildXrayStrings("linkedin", { ...SEED, roles: [] })[0].query;
    for (const role of DEFAULT_ROLES) {
      expect(query).toContain(role.includes(" ") ? `"${role}"` : role);
    }
  });

  it("uses the company filter for named accounts and keywords when there is none", () => {
    expect(buildXrayStrings("linkedin", SEED)[2].query).toContain("Dabur");
    const noCompanies = buildXrayStrings("linkedin", { ...SEED, companies: [] })[2].query;
    expect(noCompanies).toContain('("carrier oils" OR "essential oils")');
    expect(noCompanies).not.toContain("Dabur");
  });

  it("targets published business numbers rather than personal ones for WhatsApp", () => {
    const queries = buildXrayStrings("whatsapp", SEED).map((item) => item.query).join(" ");
    expect(queries).toContain("wa.me");
    expect(queries).toContain('"whatsapp business"');
  });
});

describe("googleUrl", () => {
  it("percent-encodes the whole query", () => {
    expect(googleUrl('site:linkedin.com/in "procurement manager" India')).toBe(
      "https://www.google.com/search?q=site%3Alinkedin.com%2Fin%20%22procurement%20manager%22%20India",
    );
  });
});
