import { NextResponse } from "next/server";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { getSql, jsonParam } from "@/lib/db";
import { leadInputSchema } from "@/lib/validation";
import { CHANNELS, type Channel } from "@/lib/types";
import { authenticateRequest, forbidden, hasRole, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5_000_000;
const MAX_ROWS = 2000;

/**
 * Spreadsheet headers vary per source, so map the ones we see in practice onto
 * lead fields. Anything unrecognised is ignored rather than failing the import.
 */
const HEADER_MAP: Record<string, string> = {
  company: "company",
  "company name": "company",
  organisation: "company",
  organization: "company",
  account: "company",
  brand: "company",
  contact: "contactName",
  "contact name": "contactName",
  name: "contactName",
  "full name": "contactName",
  "contact person": "contactName",
  role: "role",
  title: "role",
  designation: "role",
  "job title": "role",
  domain: "companyDomain",
  website: "companyDomain",
  "company domain": "companyDomain",
  "company website": "companyDomain",
  industry: "industry",
  category: "industry",
  segment: "industry",
  location: "location",
  city: "location",
  country: "location",
  region: "location",
  state: "location",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  "contact number": "phone",
  whatsapp: "phone",
  "whatsapp number": "phone",
  channel: "channel",
  "primary channel": "channel",
  linkedin: "profiles.linkedin",
  "linkedin url": "profiles.linkedin",
  "linkedin profile": "profiles.linkedin",
  instagram: "profiles.instagram",
  "instagram handle": "profiles.instagram",
  facebook: "profiles.facebook",
  "facebook page": "profiles.facebook",
  x: "profiles.x",
  twitter: "profiles.x",
  "x handle": "profiles.x",
  youtube: "profiles.youtube",
  "youtube channel": "profiles.youtube",
  profile: "profileUrl",
  "profile url": "profileUrl",
  source: "sourceUrl",
  "source url": "sourceUrl",
  priority: "priority",
  notes: "notes",
  note: "notes",
  remarks: "notes",
  research: "notes",
  "research notes": "notes",
  "number type": "whatsappNumberType",
  "whatsapp type": "whatsappNumberType",
  consent: "consentStatus",
  "consent status": "consentStatus",
  "consent basis": "consentBasis",
};

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.hyperlink === "string") return record.hyperlink.trim();
    if (typeof record.result === "string" || typeof record.result === "number") return String(record.result).trim();
    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => cellText((part as Record<string, unknown>).text)).join("").trim();
    }
  }
  return "";
}

async function readRows(file: File): Promise<Record<string, string>[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.includes("csv")) {
    return parseCsv(buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
      to: MAX_ROWS,
    }) as Record<string, string>[];
  }
  const workbook = new ExcelJS.Workbook();
  // exceljs types the parameter as the pre-generic Node Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, column) => {
    headers[column] = cellText(cell.value);
  });
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1 || rows.length >= MAX_ROWS) return;
    const record: Record<string, string> = {};
    let filled = false;
    row.eachCell((cell, column) => {
      const header = headers[column];
      if (!header) return;
      const value = cellText(cell.value);
      if (value) filled = true;
      record[header] = value;
    });
    if (filled) rows.push(record);
  });
  return rows;
}

/** Turn one spreadsheet row into the shape `leadInputSchema` expects. */
function normaliseRow(row: Record<string, string>, campaignId: string, defaultChannel: Channel) {
  const out: Record<string, unknown> = { campaignId, channel: defaultChannel };
  const profiles: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = HEADER_MAP[rawKey.trim().toLowerCase()];
    const value = typeof rawValue === "string" ? rawValue.trim() : cellText(rawValue);
    if (!key || !value) continue;
    if (key.startsWith("profiles.")) {
      profiles[key.slice("profiles.".length)] = value;
      continue;
    }
    if (key === "channel") {
      const channel = value.toLowerCase().replace("twitter", "x");
      if ((CHANNELS as readonly string[]).includes(channel)) out.channel = channel;
      continue;
    }
    if (key === "priority") {
      const priority = value.toUpperCase();
      if (["A", "B", "C"].includes(priority)) out.priority = priority;
      continue;
    }
    if (key === "consentStatus") {
      const consent = value.toLowerCase().replaceAll(" ", "_");
      if (["unknown", "legitimate_interest", "consented", "opted_out"].includes(consent)) out.consentStatus = consent;
      continue;
    }
    if (key === "whatsappNumberType") {
      const type = value.toLowerCase().replaceAll(" ", "_");
      if (["unknown", "company_public", "business_public", "professional_direct", "personal_unverified"].includes(type)) {
        out.whatsappNumberType = type;
      }
      continue;
    }
    out[key] = value;
  }
  if (Object.keys(profiles).length) out.profiles = profiles;
  // A single profile column with no channel column still needs a home.
  if (!out.profiles && typeof out.profileUrl === "string" && out.profileUrl) {
    out.profiles = { [out.channel as string]: out.profileUrl };
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher"])) return forbidden();

    const form = await request.formData();
    const file = form.get("file");
    const campaignId = String(form.get("campaignId") ?? "");
    const rawChannel = String(form.get("defaultChannel") ?? "linkedin");
    const defaultChannel = ((CHANNELS as readonly string[]).includes(rawChannel) ? rawChannel : "linkedin") as Channel;
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a CSV or XLSX file" }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is larger than 5 MB" }, { status: 400 });
    if (!campaignId) return NextResponse.json({ error: "Choose a campaign first" }, { status: 400 });

    const sql = getSql();
    const [campaign] = await sql`SELECT id FROM campaigns WHERE id = ${campaignId} AND workspace_id = ${auth.workspaceId}`;
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const rows = await readRows(file);
    if (!rows.length) return NextResponse.json({ error: "No rows found in the file" }, { status: 400 });

    const existing = await sql`SELECT LOWER(email) AS email, LOWER(company) AS company, LOWER(contact_name) AS contact_name
      FROM leads WHERE workspace_id = ${auth.workspaceId} AND campaign_id = ${campaignId}`;
    const seen = new Set<string>();
    for (const row of existing) {
      if (row.email) seen.add(`e:${row.email}`);
      seen.add(`c:${row.company}|${row.contact_name}`);
    }

    let created = 0;
    let duplicates = 0;
    const errors: { row: number; message: string }[] = [];

    for (const [index, row] of rows.entries()) {
      const parsed = leadInputSchema.safeParse(normaliseRow(row, campaignId, defaultChannel));
      if (!parsed.success) {
        if (errors.length < 20) {
          errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        }
        continue;
      }
      const lead = parsed.data;
      const key = lead.email ? `e:${lead.email.toLowerCase()}` : `c:${lead.company.toLowerCase()}|${lead.contactName.toLowerCase()}`;
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      const emailStage = lead.email ? (lead.verificationStatus === "verified" ? "verified" : "found") : "none";
      await sql`INSERT INTO leads (
          id, workspace_id, campaign_id, company, contact_name, role, company_domain, industry, location,
          email, phone, channel, profile_url, profiles, source_url, status, priority,
          verification_status, verification_source, consent_status, consent_basis,
          whatsapp_number_type, email_stage, do_not_contact, do_not_contact_reason, notes
        ) VALUES (
          ${crypto.randomUUID()}, ${auth.workspaceId}, ${campaignId}, ${lead.company}, ${lead.contactName}, ${lead.role},
          ${lead.companyDomain}, ${lead.industry}, ${lead.location}, ${lead.email}, ${lead.phone},
          ${lead.channel}, ${lead.profileUrl}, ${sql.json(jsonParam(lead.profiles))}, ${lead.sourceUrl},
          'new', ${lead.priority}, ${lead.verificationStatus}, ${lead.verificationSource},
          ${lead.consentStatus}, ${lead.consentBasis}, ${lead.whatsappNumberType}, ${emailStage},
          ${lead.doNotContact}, ${lead.doNotContactReason}, ${lead.notes}
        )`;
      created += 1;
    }

    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'campaign', ${campaignId}, 'leads_imported',
        ${sql.json(jsonParam({ file: file.name, created, duplicates, invalid: errors.length }))})`;

    return NextResponse.json({ created, duplicates, invalid: errors.length, errors, total: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import leads";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
