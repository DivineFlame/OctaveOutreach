# Octave Outreach Agent

A human-controlled outreach workspace for B2B supply-side sales. It researches prospects from public sources, writes channel-specific drafts, and holds them in one approval inbox. **Nothing is ever sent automatically** — the operator opens the platform, copies the approved draft, and sends it by hand.

The safe model is the same on every channel:

> research → generate draft → approve → open profile/conversation → copy message → send manually → record the outcome

## Channels, in priority order

| # | Channel | Best for | Draft types |
|---|---------|----------|-------------|
| 1 | LinkedIn | Procurement managers, founders and B2B decision-makers | Connection note, post-acceptance message |
| 2 | Email | Brochures, specifications, quotations and formal follow-ups | Introduction, follow-up, quotation, RFQ response |
| 3 | WhatsApp Business | Opted-in business contacts and warm follow-ups | Introduction, product summary |
| 4 | Instagram | D2C beauty, wellness, skincare and lifestyle brands | DM, public comment |
| 5 | Facebook / Messenger | SMEs, regional manufacturers and owner-managed businesses | Page message, enquiry reply |
| 6 | X | Founders, industry experts and public relationship building | Public reply, direct message |
| 7 | YouTube | Credibility, product education and inbound lead generation | Video topic, video script |

Email is the primary formal channel: approved emails open a pre-filled Gmail, Outlook or `mailto:` compose window so they can be saved as a draft and sent manually. Its own funnel is tracked per lead — `found → verified → draft generated → approved → saved to drafts → sent manually → opened/replied → qualified`.

### Compliance gates, enforced not advised

- **Do Not Contact** and recorded opt-outs block every channel, and no draft is generated.
- **WhatsApp** requires a number that is classified (company public, business public or professional direct) *and* a recorded consent basis. Personal or unverified numbers are never drafted; unclassified ones are parked as `waiting for consent`.
- **Instagram, Facebook and X** require a stored page or handle before a draft can be approved.
- **Public comments and replies** are checked against a personalisation guard. Filler such as "Check DM", "Nice post" or copy that names nothing specific about the prospect is rejected and replaced with the deterministic template.
- **LinkedIn** Connect and Send stay manual — the User Agreement prohibits unauthorised bots that add contacts or send messages.
- **YouTube** is publishing only. The agent never auto-comments and never mass-messages viewers.

## The workspace

Six views, in the order the work flows:

- **Draft inbox** — the unified approval screen: `Contact | Company | Channel | Draft type | Status | Action`. Filter by campaign, channel, status or free text. Selecting a row opens the draft panel with the eight per-channel actions: **Review draft, Approve, Open platform, Copy message, Mark sent, Record reply, Schedule follow-up, Do not contact.** The panel shows the compliance gate, the channel's policy note, and which brochure or spec sheet to attach.
- **Leads** — add and edit prospects, import a spreadsheet, and generate drafts across selected channels in one batch. Includes the **Google X-Ray builder**: the search mechanism the workflow is built around. Pick a channel, market, roles and keywords and it produces ready-to-run Google strings (`site:linkedin.com/in ("procurement manager" OR founder) …`) with one-click search and copy. Nothing is scraped — the operator runs the search and adds what they find.
- **Follow-ups** — dated reminders, overdue first, each with a direct link back to the platform.
- **Campaigns** — analyse a website into products, buyer segments, value propositions, a pitch and suggested X-Ray strings; pick the channels in scope.
- **Activity** — an append-only audit trail of every approval, manual send, reply and settings change.
- **Settings** — sender identity and signature, tone, daily draft limit, follow-up interval, and the collateral library (brochure, catalogue, COA, MSDS, spec sheet, price list) that drafts recommend as attachments.

### Importing leads

`Leads → Import` accepts `.csv`, `.txt` and `.xlsx` up to 5 MB and 2,000 rows. Headers are matched case-insensitively and anything unrecognised is ignored rather than failing the import:

| Field | Accepted headers |
|-------|------------------|
| Company | `company`, `company name`, `organisation`, `organization`, `account`, `brand` |
| Contact | `contact`, `contact name`, `name`, `full name`, `contact person` |
| Role | `role`, `title`, `designation`, `job title` |
| Domain | `domain`, `website`, `company domain`, `company website` |
| Industry | `industry`, `category`, `segment` |
| Location | `location`, `city`, `country`, `region`, `state` |
| Email | `email`, `email address`, `e-mail` |
| Phone | `phone`, `mobile`, `phone number`, `contact number`, `whatsapp`, `whatsapp number` |
| Profiles | `linkedin`, `instagram`, `facebook`, `x`, `twitter`, `youtube` (and `… url` / `… handle` / `… page` variants) |
| Other | `channel`, `profile url`, `source url`, `priority`, `notes`, `number type`, `consent`, `consent basis` |

Only `company` is required. The import reports created, duplicate, and invalid row counts with per-row errors.

## Drafting model

Optional. With no key configured the app writes every draft from its built-in templates and stays fully usable. With a key, the templates are rewritten for specificity and flow — and any result that fails the personalisation guard falls back to its template, so a model outage never blocks the operator.

Provider precedence: `LLM_PROVIDER` override → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → templates. Claude (`claude-opus-5`) is the default; OpenAI is kept as a secondary provider for workspaces that already had a key configured. The active provider is shown in the sidebar and on the Settings screen.

## Local development

Requires Node.js 22.13+ and PostgreSQL 16+. Copy `.env.example` to `.env`, set `DATABASE_URL`, then:

```bash
npm ci
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Example: `DATABASE_URL=postgresql://outreach:password@localhost:5432/outreach`.

To run the whole stack in Docker with the app published on the host:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

The app is at `http://localhost:3000` and health at `/api/health`. `docker-compose.local.yml` exists only to publish host ports — `docker-compose.yml` alone publishes none, because Dokploy routes through Traefik on a shared network.

```bash
npm test
```

## Deploy with Dokploy

1. Push this repository (the `main` branch) to your Git host and connect it in Dokploy.
2. Create a **Compose** application, select the repository and the `main` branch.
3. Set the Compose path to `./docker-compose.yml`. Do not add the local override file.
4. Add environment variables:
   - `POSTGRES_PASSWORD` — required, long and random.
   - `APP_PASSWORD` — required, **12 characters minimum**.
   - `APP_USERNAME`, `APP_DISPLAY_NAME`, `WORKSPACE_NAME` — optional, default to `admin` / `Workspace Owner` / `Octave`.
   - `ANTHROPIC_API_KEY` and optionally `ANTHROPIC_MODEL` — optional; omit to run on templates only.
   - Every supported variable is listed in `.env.example`.
5. Under **Domains**, add your domain to the `app` service on port `3000` and enable HTTPS. Traefik reaches the container over the Compose network, so no host port needs publishing.
6. Deploy, then confirm `https://your-domain/api/health` reports `status: ok` and sign in with `APP_USERNAME` / `APP_PASSWORD`.

To use a managed database instead of the bundled one, set `DATABASE_URL` (and `DATABASE_SSL=true`) and remove the `database` service from your Compose file.

The first boot creates or updates the workspace owner from `APP_USERNAME`, `APP_PASSWORD` and `APP_DISPLAY_NAME`. Sessions are database-backed behind a short-lived, HTTP-only cookie; changing the bootstrap password revokes existing sessions. The Postgres volume is persistent — configure scheduled volume backups before entering business data, and always serve over HTTPS.

## Operations and scope

- Migrations are versioned, advisory-locked and recorded in `schema_migrations`; they run on startup.
- `docker-entrypoint.sh` retries migrations while PostgreSQL starts, then bootstraps the owner and default workspace.
- Roles: `owner`, `admin`, `researcher`, `reviewer`, `sender`.
- Website fetching rejects private and link-local addresses, URL credentials, non-HTTP(S) schemes and oversized responses.
- Rotate credentials and API keys through Dokploy; never commit `.env`.
- IndiaMART and TradeIndia are intentionally excluded. This release does not scrape protected platforms, bypass access controls, connect accounts, or send any message on any channel.
