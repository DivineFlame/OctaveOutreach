-- Per-lead, per-channel outreach pipeline.
-- Adds the channel profile map, WhatsApp consent classification, the email
-- funnel, draft approval/send/reply audit columns and follow-up reminders.

-- Leads -----------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS profiles JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_number_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_basis TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_stage TEXT NOT NULL DEFAULT 'none';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- Seed the profile map from the single legacy profile_url column.
UPDATE leads
SET profiles = jsonb_build_object(channel, profile_url)
WHERE profile_url <> '' AND profiles = '{}'::jsonb;

-- Leads that already carry an email address start the funnel at "found".
UPDATE leads SET email_stage = 'found' WHERE email <> '' AND email_stage = 'none';
UPDATE leads SET email_stage = 'verified' WHERE verification_status = 'verified' AND email_stage = 'found';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_whatsapp_number_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_whatsapp_number_type_check CHECK (
  whatsapp_number_type IN ('unknown', 'company_public', 'business_public', 'professional_direct', 'personal_unverified')
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_email_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_email_stage_check CHECK (
  email_stage IN ('none', 'found', 'verified', 'draft_generated', 'approved', 'saved_to_drafts', 'sent', 'opened_replied', 'qualified')
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_consent_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_consent_status_check CHECK (
  consent_status IN ('unknown', 'legitimate_interest', 'consented', 'opted_out')
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_verification_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_verification_status_check CHECK (
  verification_status IN ('unverified', 'verified', 'invalid', 'risky')
);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_priority_check;
ALTER TABLE leads ADD CONSTRAINT leads_priority_check CHECK (priority IN ('A', 'B', 'C'));

-- Drafts ----------------------------------------------------------------
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS sequence_step INTEGER NOT NULL DEFAULT 1;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS sent_by TEXT;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS reply_note TEXT NOT NULL DEFAULT '';

ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_approved_by_fkey;
ALTER TABLE drafts ADD CONSTRAINT drafts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_sent_by_fkey;
ALTER TABLE drafts ADD CONSTRAINT drafts_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_status_check;
ALTER TABLE drafts ADD CONSTRAINT drafts_status_check CHECK (
  status IN ('needs_review', 'approved', 'ready', 'waiting_consent', 'held',
             'saved_to_drafts', 'sent', 'replied', 'qualified')
);

ALTER TABLE drafts DROP CONSTRAINT IF EXISTS drafts_channel_check;
ALTER TABLE drafts ADD CONSTRAINT drafts_channel_check CHECK (
  channel IN ('linkedin', 'email', 'whatsapp', 'instagram', 'facebook', 'x', 'youtube')
);

-- Follow-ups ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
  draft_id TEXT REFERENCES drafts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  due_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_workspace_due ON follow_ups(workspace_id, status, due_on);
CREATE INDEX IF NOT EXISTS idx_follow_ups_draft ON follow_ups(draft_id);
CREATE INDEX IF NOT EXISTS idx_drafts_workspace_lead ON drafts(workspace_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_dnc ON leads(workspace_id, do_not_contact);
