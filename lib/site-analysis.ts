import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import { generateJson } from "./llm";
import { buildXrayStrings } from "./xray";
import type { CampaignAnalysis } from "./types";

const MAX_PAGE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("ff");
}

async function assertPublicUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) websites are supported");
  if (url.username || url.password) throw new Error("Website URLs cannot contain credentials");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("Local addresses are not supported");
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new Error("The website must resolve to a public address");
  return url;
}

async function fetchPublicPage(rawUrl: string) {
  let current = await assertPublicUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "OctaveOutreachAgent/1.0 (+website-analysis)" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === MAX_REDIRECTS) throw new Error("The website redirected too many times");
        current = await assertPublicUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("Website did not return an HTML page");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Website response was empty");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PAGE_BYTES) throw new Error("Website page is too large to analyse safely");
        chunks.push(value);
      }
      return { html: new TextDecoder().decode(Buffer.concat(chunks)), finalUrl: current.toString() };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Unable to fetch website");
}

function decodeEntities(value: string) {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function extractPage(html: string) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const descriptionMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  const description = decodeEntities(descriptionMatch?.[1]?.trim() ?? "");
  const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return { title, description, text: text.slice(0, 18_000) };
}

function fallbackAnalysis(website: string, title: string, description: string): CampaignAnalysis {
  const company = title.split(/[|–—-]/)[0]?.trim() || new URL(website).hostname.replace(/^www\./, "");
  const context = description || `Products and services presented by ${company}.`;
  return {
    summary: context,
    products: ["Core product portfolio", "Custom or bulk solutions", "Supporting services"],
    buyerSegments: ["Procurement and sourcing teams", "Founders and business owners", "Operations and product leaders"],
    valuePropositions: ["Direct, specification-led business conversation", "Flexible commercial engagement", "Documented and reviewable outreach"],
    pitch: `${company} helps business buyers evaluate relevant products and services through a clear, consultative process. We would be glad to understand your current requirements and share the most relevant capabilities, documentation and next steps.`,
    xrayStrings: buildXrayStrings("linkedin", { market: "", roles: [], keywords: [company] }).map((entry) => entry.query),
  };
}

const analysisSchema = z.object({
  summary: z.string(),
  products: z.array(z.string()).min(1).max(10),
  buyerSegments: z.array(z.string()).min(1).max(8),
  valuePropositions: z.array(z.string()).min(1).max(8),
  pitch: z.string(),
  xrayStrings: z.array(z.string()).min(3).max(10),
});

const ANALYSIS_INSTRUCTIONS = `You are a precise B2B sales strategist. Analyse only the supplied website text.
Do not invent certifications, clients, contact details, prices or claims.
Keep outputs commercially useful and concise.
For xrayStrings, return Google X-Ray search strings that would surface procurement managers, purchase managers, sourcing leads, founders and R&D contacts at companies likely to buy these products — use site: operators and quoted phrases.`;

/**
 * Fetch and analyse a prospect's own website. Falls back to a deterministic
 * summary when no model key is configured, so campaign creation always succeeds.
 */
export async function analyseWebsite(website: string): Promise<CampaignAnalysis> {
  const { html, finalUrl } = await fetchPublicPage(website);
  const page = extractPage(html);
  const analysis = await generateJson({
    schema: analysisSchema,
    instructions: ANALYSIS_INSTRUCTIONS,
    input: `Website: ${finalUrl}\nTitle: ${page.title}\nDescription: ${page.description}\nVisible text:\n${page.text}`,
    maxTokens: 4_000,
  });
  return analysis ?? fallbackAnalysis(finalUrl, page.title, page.description);
}
