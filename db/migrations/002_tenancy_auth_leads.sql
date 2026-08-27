CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspaces (id, name, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Octave', 'octave')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'researcher', 'reviewer', 'sender')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id TEXT;
UPDATE campaigns SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE campaigns ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_workspace_id_fkey;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_domain TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS verification_source TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE leads l SET workspace_id = c.workspace_id FROM campaigns c WHERE l.campaign_id = c.id AND l.workspace_id IS NULL;
UPDATE leads SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE leads ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_workspace_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE drafts ADD COLUMN IF NOT EXISTS workspace_id TEXT;
UPDATE drafts d SET workspace_id = c.workspace_id FROM campaigns c WHERE d.campaign_id = c.id AND d.workspace_id IS NULL;
UPDATE drafts SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE drafts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_workspace_id_fkey;
ALTER TABLE drafts ADD CONSTRAINT drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS workspace_id TEXT;
UPDATE workspace_settings SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE workspace_settings ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_workspace_id_fkey;
ALTER TABLE workspace_settings ADD CONSTRAINT workspace_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workspace_settings DROP CONSTRAINT IF EXISTS workspace_settings_pkey;
ALTER TABLE workspace_settings ADD PRIMARY KEY (workspace_id, id);

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS workspace_id TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS actor_user_id TEXT;
UPDATE activity_log SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE activity_log ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_workspace_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_actor_user_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_updated ON campaigns(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_campaign ON leads(workspace_id, campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_email ON leads(workspace_id, lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_leads_workspace_domain ON leads(workspace_id, lower(company_domain)) WHERE company_domain <> '';
CREATE INDEX IF NOT EXISTS idx_drafts_workspace_status ON drafts(workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_token_active ON sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_workspace_created ON activity_log(workspace_id, created_at DESC);
