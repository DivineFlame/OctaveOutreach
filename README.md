# Octave Outreach Agent

A human-controlled business AI automation workspace for website analysis, sales pitches, Google X-Ray search strings, public-source lead research, and channel-specific outreach drafts. Messages stay as drafts; the user opens each social platform and sends manually.

## Included

- Protected website fetching and offer analysis
- Product, value proposition, buyer-segment, pitch, and X-Ray search outputs
- Drafts for LinkedIn, email, WhatsApp, Instagram, Facebook, X, and YouTube
- PostgreSQL persistence and automatic versioned migrations
- Manual approval, hold, sent, and replied states
- Optional OpenAI Responses API analysis with a deterministic fallback
- Database-backed sessions, workspace roles, login throttling, health checks, security headers, Docker, and Docker Compose

IndiaMART and TradeIndia are intentionally excluded. No platform message is sent automatically.

## Local development

Requires Node.js 22+ and PostgreSQL 16+. Copy `.env.example` to `.env`, add `DATABASE_URL`, then run:

```bash
npm ci
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Example: `DATABASE_URL=postgresql://outreach:password@localhost:5432/outreach`.

## Docker Compose

Copy `.env.example` to `.env`, replace both passwords, then run:

```bash
docker compose up --build -d
docker compose ps
```

The app is at `http://localhost:3000`; health is at `/api/health`.

## Deploy with Dokploy

1. Push this directory to a private Git repository.
2. In Dokploy, create a **Compose** application and select the repository and branch.
3. Select `./docker-compose.yml` as the Compose path.
4. Add `POSTGRES_PASSWORD`, `APP_PASSWORD`, and optionally `OPENAI_API_KEY` in Dokploy. Other supported variables are in `.env.example`.
5. Add the app domain to the `app` service on port `3000`, enable HTTPS, and deploy.
6. Confirm `https://your-domain/api/health` reports `status: ok`, then sign in with `APP_USERNAME` and `APP_PASSWORD`.

The first deployment creates or updates the workspace owner from `APP_USERNAME`, `APP_PASSWORD`, and `APP_DISPLAY_NAME`. The password must contain at least 12 characters. Authentication uses a short-lived, HTTP-only session cookie; changing the bootstrap password revokes existing sessions. The database volume is persistent, so configure scheduled volume backups before entering business data and always use HTTPS.

## Operations and scope

- Migrations run on startup and are recorded in `schema_migrations`.
- The container retries migrations while PostgreSQL starts, then bootstraps the owner and default workspace.
- Rotate credentials and API keys through Dokploy; never commit `.env`.
- Lead rows are ready for later CSV import and compliant enrichment. This release does not scrape protected platforms, bypass access controls, connect accounts, or send messages.
