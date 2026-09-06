-- @chairman-gated: applied by the chairman after sign-off (Tier 3: schema; personal data)
-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (Michael data model, FR-1) — docs/michael/02-SPEC.md §2.
-- The eleven michael_* tables: Michael's database source of truth (spec §0: the seat reads rows,
-- prose is generated only for the chairman's review). Natural keys per §2; NO streak columns
-- (streaks are computed from michael_feedback_ledger.dispositions at read time, §7 / Solomon Q4).
--
-- POSTURE (asserted, never inherited): pg_default_acl in this database grants anon/authenticated
-- full DML on every new relation (re-measured live 2026-09-06 by the DATABASE sub-agent, evidence
-- 1533367f: r -> anon=arwdDxtm | authenticated=arwdDxtm; f -> anon=X). Every table therefore
-- ENABLEs RLS, carries exactly one FOR ALL TO service_role policy, REVOKEs ALL from anon,
-- authenticated and PUBLIC, and GRANTs to service_role — the 20260830_commitments_table.sql
-- precedent. These tables hold personal data (Gmail summaries, calendar, Todoist, credentials):
-- RLS isolates them from anon and authenticated only; every service-role holder can read them and
-- the spec says so plainly (Solomon Q1.4). Bodies are never stored; prose is nulled at 30 days by
-- scripts/michael/retention.mjs (FR-6).
--
-- CHECKs are INLINE in CREATE TABLE (never a trailing ALTER ... ADD CONSTRAINT) because the DDL
-- tier applies this file twice to prove idempotence. No BEGIN/COMMIT here: scripts/apply-migration.js
-- wraps the transaction itself and an inner COMMIT would end it before the audit UPDATE. Never
-- apply with --split-statements (the verify block is a named dollar-quoted DO block). Never write a
-- dollar tag inside a comment: scripts/verify-migration-apply-state.mjs strips dollar-quoted bodies
-- BEFORE comments, so a tag mentioned in a comment would swallow every CREATE that follows it.
--
-- Marker posture: '-- @chairman-gated' and NO '-- @approved-by:' until the chairman signs (the
-- 3-factor guard in scripts/lib/migration-guards.js refuses until then; the disposition seeder's
-- RULE A records the DEFERRED entry). The chairman adds the marker at apply, as PR #8294 did for
-- child A.
--
-- Rollback: 20260906_michael_tables_DOWN.sql (drops the eleven tables, then the trigger function).

-- ── updated_at maintenance ───────────────────────────────────────────────────────────────────
-- Own function, not public.set_updated_at(): the vanilla DDL container lacks it, and a scoped
-- migration must not CREATE OR REPLACE / re-GRANT an object other tables' triggers depend on.
CREATE OR REPLACE FUNCTION public.michael_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.michael_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.michael_set_updated_at() TO service_role;

-- ── 1. michael_rules ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL CHECK (domain IN ('gmail', 'todoist', 'calendar', 'tasks', 'body', 'brief', 'capture', 'youtube')),
  rule_key TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  rule_json JSONB NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes UUID NULL REFERENCES public.michael_rules(id),
  provenance JSONB NOT NULL CHECK (jsonb_typeof(provenance) = 'object'),
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  auto_apply_since TIMESTAMPTZ NULL,
  auto_apply_verb TEXT NULL CHECK (auto_apply_verb IN ('label', 'archive', 'reschedule')),
  -- Table-level binding of the autonomy invariant (TR-8): a JS guard does not bind a service-role writer.
  CHECK (auto_apply = false OR (auto_apply_verb IS NOT NULL AND auto_apply_since IS NOT NULL)),
  -- SEC-M1 (EXEC SECURITY b4e557d4): the Opus verifier requirement binds here too — an auto-applied
  -- rule must carry provenance.verifier.subject_hash, whoever the writer is.
  CHECK (auto_apply = false OR (provenance -> 'verifier' ->> 'subject_hash') IS NOT NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- PARTIAL unique: retained superseded ancestors keep (domain, rule_key); only one row may be active.
-- ON CONFLICT callers must repeat the predicate: ON CONFLICT (domain, rule_key) WHERE status = 'active'.
CREATE UNIQUE INDEX IF NOT EXISTS michael_rules_active_domain_key_uniq ON public.michael_rules (domain, rule_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS michael_rules_supersedes_idx ON public.michael_rules (supersedes);
COMMENT ON TABLE public.michael_rules IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: every standing Michael rule with provenance; no streak columns (read-time from the ledger).';
ALTER TABLE public.michael_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_rules_service_role ON public.michael_rules;
CREATE POLICY michael_rules_service_role ON public.michael_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_rules FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_rules TO service_role;
DROP TRIGGER IF EXISTS michael_rules_set_updated_at ON public.michael_rules;
CREATE TRIGGER michael_rules_set_updated_at BEFORE UPDATE ON public.michael_rules FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 2. michael_gmail_labels ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_gmail_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id TEXT NOT NULL,
  name TEXT NOT NULL,
  class TEXT NULL,
  keep_in_inbox BOOLEAN NOT NULL DEFAULT false,
  summarize BOOLEAN NOT NULL DEFAULT false,
  last_seen_in_gmail_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_gmail_labels_label_id_uniq ON public.michael_gmail_labels (label_id);
COMMENT ON TABLE public.michael_gmail_labels IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: Gmail label registry (class, keep_in_inbox, summarize).';
ALTER TABLE public.michael_gmail_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_gmail_labels_service_role ON public.michael_gmail_labels;
CREATE POLICY michael_gmail_labels_service_role ON public.michael_gmail_labels FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_gmail_labels FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_gmail_labels TO service_role;
DROP TRIGGER IF EXISTS michael_gmail_labels_set_updated_at ON public.michael_gmail_labels;
CREATE TRIGGER michael_gmail_labels_set_updated_at BEFORE UPDATE ON public.michael_gmail_labels FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 3. michael_closures ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closure_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  closure_text TEXT NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  scope TEXT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_closures_closure_key_uniq ON public.michael_closures (closure_key);
COMMENT ON TABLE public.michael_closures IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: closed topics with keywords, expiry and provenance (replaces memory/closures.md).';
ALTER TABLE public.michael_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_closures_service_role ON public.michael_closures;
CREATE POLICY michael_closures_service_role ON public.michael_closures FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_closures FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_closures TO service_role;
DROP TRIGGER IF EXISTS michael_closures_set_updated_at ON public.michael_closures;
CREATE TRIGGER michael_closures_set_updated_at BEFORE UPDATE ON public.michael_closures FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 4. michael_feedback_ledger ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_feedback_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  landed TEXT NULL,
  friction TEXT NULL,
  -- [{topic, rule_key, proposed, chosen approve|override|auto|skip, reasoning}] — the grain that keeps auto-applied rules measurable.
  dispositions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dispositions) = 'array'),
  outcome_vs_jobs TEXT NULL,
  acted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_feedback_ledger_et_date_uniq ON public.michael_feedback_ledger (et_date);
COMMENT ON TABLE public.michael_feedback_ledger IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: one row per ET day; dispositions carry the approve/override/auto/skip grain streaks are computed from.';
ALTER TABLE public.michael_feedback_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_feedback_ledger_service_role ON public.michael_feedback_ledger;
CREATE POLICY michael_feedback_ledger_service_role ON public.michael_feedback_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_feedback_ledger FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_feedback_ledger TO service_role;
DROP TRIGGER IF EXISTS michael_feedback_ledger_set_updated_at ON public.michael_feedback_ledger;
CREATE TRIGGER michael_feedback_ledger_set_updated_at BEFORE UPDATE ON public.michael_feedback_ledger FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 5. michael_feeder_runs ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_feeder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feeder TEXT NOT NULL,
  et_date DATE NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  venue TEXT NOT NULL CHECK (venue IN ('task_scheduler', 'gha', 'seat')),
  status TEXT NOT NULL CHECK (status IN ('ok', 'degraded', 'failed', 'skipped', 'imported')),
  counts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  log_md TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  model_used TEXT NULL,
  tokens_in INTEGER NULL,
  tokens_out INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- et_date leads so the quiet-tick's (et_date, status='failed') count rides the natural key.
CREATE UNIQUE INDEX IF NOT EXISTS michael_feeder_runs_date_feeder_attempt_uniq ON public.michael_feeder_runs (et_date, feeder, attempt);
COMMENT ON TABLE public.michael_feeder_runs IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: one row per feeder attempt per ET day with venue, status, counts and model metering (replaces logs/YYYY-MM-DD-<feeder>.md).';
ALTER TABLE public.michael_feeder_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_feeder_runs_service_role ON public.michael_feeder_runs;
CREATE POLICY michael_feeder_runs_service_role ON public.michael_feeder_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_feeder_runs FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_feeder_runs TO service_role;
DROP TRIGGER IF EXISTS michael_feeder_runs_set_updated_at ON public.michael_feeder_runs;
CREATE TRIGGER michael_feeder_runs_set_updated_at BEFORE UPDATE ON public.michael_feeder_runs FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 6. michael_calendar_day ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_calendar_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title TEXT NULL,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  response_status TEXT NULL,
  coded_marker TEXT NULL,
  optional BOOLEAN NOT NULL DEFAULT false,
  overlap_group TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_calendar_day_date_event_uniq ON public.michael_calendar_day (et_date, event_id);
COMMENT ON TABLE public.michael_calendar_day IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: today ±1 from both calendars; rows older than 30 days are deleted by retention.';
ALTER TABLE public.michael_calendar_day ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_calendar_day_service_role ON public.michael_calendar_day;
CREATE POLICY michael_calendar_day_service_role ON public.michael_calendar_day FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_calendar_day FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_calendar_day TO service_role;
DROP TRIGGER IF EXISTS michael_calendar_day_set_updated_at ON public.michael_calendar_day;
CREATE TRIGGER michael_calendar_day_set_updated_at BEFORE UPDATE ON public.michael_calendar_day FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 7. michael_gmail_triage_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_gmail_triage_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  thread_id TEXT NOT NULL,
  class TEXT NULL,                    -- NULL = queued for the seat's classifier (nullability IS the queue signal)
  action_intent TEXT NULL,
  action_taken_at TIMESTAMPTZ NULL,
  needs_you BOOLEAN NOT NULL DEFAULT false,
  needs_you_reason TEXT NULL,         -- prose; nulled by retention at 30 days
  borderline BOOLEAN NOT NULL DEFAULT false,
  rule_key TEXT NULL,
  verified_by TEXT NULL,
  summary TEXT NULL,                  -- only summarize classes; bodies are NEVER stored; nulled at 30 days
  last_message_id TEXT NULL,
  reopened_at TIMESTAMPTZ NULL,       -- the revoke signal (spec §7)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_gmail_triage_items_date_thread_uniq ON public.michael_gmail_triage_items (et_date, thread_id);
CREATE INDEX IF NOT EXISTS michael_gmail_triage_items_rule_reopened_idx ON public.michael_gmail_triage_items (rule_key) WHERE reopened_at IS NOT NULL;
COMMENT ON TABLE public.michael_gmail_triage_items IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: per-thread triage state; summary only for summarize classes, bodies never stored; reopened_at is the auto_apply revoke signal.';
ALTER TABLE public.michael_gmail_triage_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_gmail_triage_items_service_role ON public.michael_gmail_triage_items;
CREATE POLICY michael_gmail_triage_items_service_role ON public.michael_gmail_triage_items FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_gmail_triage_items FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_gmail_triage_items TO service_role;
DROP TRIGGER IF EXISTS michael_gmail_triage_items_set_updated_at ON public.michael_gmail_triage_items;
CREATE TRIGGER michael_gmail_triage_items_set_updated_at BEFORE UPDATE ON public.michael_gmail_triage_items FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 8. michael_todoist_snapshot ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_todoist_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  task_id TEXT NOT NULL,
  effort_grade TEXT NULL,             -- NULL = queued for grading (nullability IS the queue signal)
  est_minutes INTEGER NULL,
  role_tag TEXT NULL,
  proposed_date DATE NULL,
  proposed_action TEXT NULL,
  chosen_action TEXT NULL,
  rule_key TEXT NULL,                 -- equality match for autonomy-read (never a substring of proposed_action)
  mutations_applied JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mutations_applied) = 'array'),
  moved_back_at TIMESTAMPTZ NULL,     -- the revoke signal (spec §7)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_todoist_snapshot_date_task_uniq ON public.michael_todoist_snapshot (et_date, task_id);
CREATE INDEX IF NOT EXISTS michael_todoist_snapshot_rule_moved_back_idx ON public.michael_todoist_snapshot (rule_key) WHERE moved_back_at IS NOT NULL;
COMMENT ON TABLE public.michael_todoist_snapshot IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: per-task snapshot with grading, proposals, applied mutations; moved_back_at is the auto_apply revoke signal.';
ALTER TABLE public.michael_todoist_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_todoist_snapshot_service_role ON public.michael_todoist_snapshot;
CREATE POLICY michael_todoist_snapshot_service_role ON public.michael_todoist_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_todoist_snapshot FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_todoist_snapshot TO service_role;
DROP TRIGGER IF EXISTS michael_todoist_snapshot_set_updated_at ON public.michael_todoist_snapshot;
CREATE TRIGGER michael_todoist_snapshot_set_updated_at BEFORE UPDATE ON public.michael_todoist_snapshot FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 9. michael_brief_runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_brief_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  data_json JSONB NULL,               -- spec §6 schema 2
  rendered_html TEXT NULL,            -- prose; nulled at 30 days
  brief_md TEXT NULL,                 -- prose; nulled at 30 days
  assembled_at TIMESTAMPTZ NULL,
  rendered_at TIMESTAMPTZ NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verify_notes TEXT NULL,
  enriched_at TIMESTAMPTZ NULL,       -- seat contribution applied
  surfaced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_brief_runs_et_date_uniq ON public.michael_brief_runs (et_date);
COMMENT ON TABLE public.michael_brief_runs IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: the brief of record per ET day; verified is the never-claim-more-than-landed flag; enriched_at marks the seat''s overnight contribution.';
ALTER TABLE public.michael_brief_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_brief_runs_service_role ON public.michael_brief_runs;
CREATE POLICY michael_brief_runs_service_role ON public.michael_brief_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_brief_runs FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_brief_runs TO service_role;
DROP TRIGGER IF EXISTS michael_brief_runs_set_updated_at ON public.michael_brief_runs;
CREATE TRIGGER michael_brief_runs_set_updated_at BEFORE UPDATE ON public.michael_brief_runs FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 10. michael_credentials ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,           -- one row in v1: google_chairman_oauth
  encrypted_blob TEXT NULL,           -- base64 from lib/security/encryption.cjs encrypt, decrypted ONLY on the chairman's host
  encryption_metadata JSONB NULL,     -- {appId, algorithm, timestamp, version} as returned by encrypt()
  key_fingerprint TEXT NULL,          -- makes a wrong-key decrypt diagnosable (child C resolves the key source)
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NULL,
  last_refreshed_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_credentials_identifier_uniq ON public.michael_credentials (identifier);
COMMENT ON TABLE public.michael_credentials IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: encrypted token blobs; child C writes them; no plaintext ever stored.';
ALTER TABLE public.michael_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_credentials_service_role ON public.michael_credentials;
CREATE POLICY michael_credentials_service_role ON public.michael_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_credentials FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_credentials TO service_role;
DROP TRIGGER IF EXISTS michael_credentials_set_updated_at ON public.michael_credentials;
CREATE TRIGGER michael_credentials_set_updated_at BEFORE UPDATE ON public.michael_credentials FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 11. michael_staged_items ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_staged_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                 -- capture | rule_edit | ruling | proposal ...
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  staged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispositioned_at TIMESTAMPTZ NULL,
  disposition TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS michael_staged_items_kind_open_idx ON public.michael_staged_items (kind) WHERE dispositioned_at IS NULL;
COMMENT ON TABLE public.michael_staged_items IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B spec §2: staged proposals and captures awaiting disposition; never applied unprompted.';
ALTER TABLE public.michael_staged_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_staged_items_service_role ON public.michael_staged_items;
CREATE POLICY michael_staged_items_service_role ON public.michael_staged_items FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_staged_items FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_staged_items TO service_role;
DROP TRIGGER IF EXISTS michael_staged_items_set_updated_at ON public.michael_staged_items;
CREATE TRIGGER michael_staged_items_set_updated_at BEFORE UPDATE ON public.michael_staged_items FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs at chairman apply time (and, extracted, in the DDL tier). A CREATE TABLE IF NOT EXISTS on a
-- wrong-shaped pre-existing table is a silent no-op, so columns and types are asserted too, not
-- only relation presence and privileges (DATABASE evidence 1533367f, D18/D19).
DO $verify$
DECLARE
  v_tables TEXT[] := ARRAY[
    'michael_rules', 'michael_gmail_labels', 'michael_closures', 'michael_feedback_ledger',
    'michael_feeder_runs', 'michael_calendar_day', 'michael_gmail_triage_items',
    'michael_todoist_snapshot', 'michael_brief_runs', 'michael_credentials', 'michael_staged_items'
  ];
  v_indexes TEXT[] := ARRAY[
    'michael_rules_active_domain_key_uniq', 'michael_rules_supersedes_idx',
    'michael_gmail_labels_label_id_uniq', 'michael_closures_closure_key_uniq',
    'michael_feedback_ledger_et_date_uniq', 'michael_feeder_runs_date_feeder_attempt_uniq',
    'michael_calendar_day_date_event_uniq', 'michael_gmail_triage_items_date_thread_uniq',
    'michael_gmail_triage_items_rule_reopened_idx', 'michael_todoist_snapshot_date_task_uniq',
    'michael_todoist_snapshot_rule_moved_back_idx', 'michael_brief_runs_et_date_uniq',
    'michael_credentials_identifier_uniq', 'michael_staged_items_kind_open_idx'
  ];
  -- table.column=type pins for the readers that already ship (scripts/michael-quiet-tick.mjs) and the verbs.
  v_columns TEXT[][] := ARRAY[
    ARRAY['michael_gmail_triage_items', 'et_date', 'date'],
    ARRAY['michael_gmail_triage_items', 'class', 'text'],
    ARRAY['michael_gmail_triage_items', 'reopened_at', 'timestamp with time zone'],
    ARRAY['michael_todoist_snapshot', 'et_date', 'date'],
    ARRAY['michael_todoist_snapshot', 'effort_grade', 'text'],
    ARRAY['michael_todoist_snapshot', 'moved_back_at', 'timestamp with time zone'],
    ARRAY['michael_todoist_snapshot', 'rule_key', 'text'],
    ARRAY['michael_brief_runs', 'et_date', 'date'],
    ARRAY['michael_brief_runs', 'verified', 'boolean'],
    ARRAY['michael_brief_runs', 'enriched_at', 'timestamp with time zone'],
    ARRAY['michael_feeder_runs', 'et_date', 'date'],
    ARRAY['michael_feeder_runs', 'status', 'text'],
    ARRAY['michael_staged_items', 'kind', 'text'],
    ARRAY['michael_staged_items', 'dispositioned_at', 'timestamp with time zone'],
    ARRAY['michael_rules', 'provenance', 'jsonb'],
    ARRAY['michael_rules', 'supersedes', 'uuid'],
    ARRAY['michael_feedback_ledger', 'dispositions', 'jsonb'],
    ARRAY['michael_calendar_day', 'calendar_id', 'text'],
    ARRAY['michael_credentials', 'encrypted_blob', 'text']
  ];
  t TEXT;
  ix TEXT;
  i INTEGER;
  v_rel TEXT;
BEGIN
  -- SEC-M5: every check below is an ASSERT, and ASSERTs are a silent no-op under
  -- plpgsql.check_asserts = off. RAISE is not an ASSERT, so this guard fires regardless.
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) IN ('off', 'false', '0') THEN
    RAISE EXCEPTION 'MICHAEL-TABLES: plpgsql.check_asserts is off — the verify block cannot verify anything';
  END IF;
  FOREACH t IN ARRAY v_tables LOOP
    v_rel := 'public.' || t;
    ASSERT to_regclass(v_rel) IS NOT NULL, 'MICHAEL-TABLES: ' || t || ' did not land';
    ASSERT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_rel::regclass AND relrowsecurity),
      'MICHAEL-TABLES: ' || t || ': RLS is NOT enabled';
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) = 1,
      'MICHAEL-TABLES: ' || t || ': expected exactly ONE policy';
    ASSERT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_rel::regclass
        AND p.polname = t || '_service_role'
        AND p.polroles = ARRAY['service_role'::regrole::oid]
        AND p.polcmd = '*'
        AND p.polpermissive
    ), 'MICHAEL-TABLES: ' || t || ': the policy is missing, renamed, or NOT "FOR ALL TO service_role"';
    ASSERT NOT has_table_privilege('anon', v_rel, 'SELECT'), 'MICHAEL-TABLES: ' || t || ': anon can SELECT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'INSERT'), 'MICHAEL-TABLES: ' || t || ': anon can INSERT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'UPDATE'), 'MICHAEL-TABLES: ' || t || ': anon can UPDATE';
    ASSERT NOT has_table_privilege('anon', v_rel, 'DELETE'), 'MICHAEL-TABLES: ' || t || ': anon can DELETE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'SELECT'), 'MICHAEL-TABLES: ' || t || ': authenticated can SELECT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'INSERT'), 'MICHAEL-TABLES: ' || t || ': authenticated can INSERT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'UPDATE'), 'MICHAEL-TABLES: ' || t || ': authenticated can UPDATE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'DELETE'), 'MICHAEL-TABLES: ' || t || ': authenticated can DELETE';
    ASSERT has_table_privilege('service_role', v_rel, 'SELECT'), 'MICHAEL-TABLES: ' || t || ': service_role cannot SELECT';
    ASSERT NOT EXISTS (
      SELECT 1
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = v_rel::regclass
        AND a.grantee <> c.relowner
        AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
    ), 'MICHAEL-TABLES: ' || t || ': a non-service table grant exists (including PUBLIC)';
    ASSERT NOT EXISTS (
      SELECT 1
      FROM pg_attribute at
      CROSS JOIN LATERAL aclexplode(at.attacl) a
      WHERE at.attrelid = v_rel::regclass
        AND at.attacl IS NOT NULL
        AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = v_rel::regclass)
        AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
    ), 'MICHAEL-TABLES: ' || t || ': a non-service COLUMN grant exists';
    ASSERT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ), 'MICHAEL-TABLES: ' || t || ': updated_at column missing';
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = v_rel::regclass AND tgname = t || '_set_updated_at' AND NOT tgisinternal
    ), 'MICHAEL-TABLES: ' || t || ': updated_at trigger missing';
    ASSERT NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name IN ('streak', 'approve_count', 'consecutive_approvals', 'streak_count')
    ), 'MICHAEL-TABLES: ' || t || ': a streak column exists — streaks are read-time only (spec §7)';
  END LOOP;

  FOREACH ix IN ARRAY v_indexes LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ix),
      'MICHAEL-TABLES: index ' || ix || ' missing';
  END LOOP;

  FOR i IN 1 .. array_length(v_columns, 1) LOOP
    ASSERT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_columns[i][1]
        AND column_name = v_columns[i][2] AND data_type = v_columns[i][3]
    ), 'MICHAEL-TABLES: ' || v_columns[i][1] || '.' || v_columns[i][2] || ' missing or not ' || v_columns[i][3];
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'michael_rules_active_domain_key_uniq'
      AND indexdef ILIKE '%WHERE%status%active%'
  ), 'MICHAEL-TABLES: michael_rules unique index is not PARTIAL on status = active';

  ASSERT NOT has_function_privilege('anon', 'public.michael_set_updated_at()', 'EXECUTE'),
    'MICHAEL-TABLES: anon can EXECUTE michael_set_updated_at';
  ASSERT NOT has_function_privilege('authenticated', 'public.michael_set_updated_at()', 'EXECUTE'),
    'MICHAEL-TABLES: authenticated can EXECUTE michael_set_updated_at';
  ASSERT has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE'),
    'MICHAEL-TABLES: service_role cannot EXECUTE michael_set_updated_at';
END
$verify$;
