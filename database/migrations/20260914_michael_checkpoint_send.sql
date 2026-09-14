-- @chairman-gated: applied by the chairman after sign-off (Tier 3: schema; personal data)
-- SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 -- the durable state for the Tier-2 personal
-- checkpoint send verb (ratification 561878ae): a same-day ledger (FR-1/FR-6/FR-7) and a
-- fail-closed enable/disable row (FR-5), following the database/migrations/20260906_michael_tables.sql
-- conventions exactly (surrogate UUID PK + natural-key UNIQUE INDEX, RLS service_role-only, REVOKE
-- ALL FROM anon/authenticated/PUBLIC, updated_at trigger reusing the shared
-- public.michael_set_updated_at() -- never re-created here).
--
-- michael_checkpoint_send_ledger: one row per IN-WINDOW, non-dry-run send ATTEMPT (sent, held, or
-- refused) -- never per raw schedule fire (~96/day; only 8 are in-window; the other ~88 are inert
-- with no row per the app-level window gate, lib/michael/feeder.mjs). The partial unique index on
-- (et_date, window_slot) WHERE outcome='sent' is FR-7's DB-level dedup: at most one 'sent' row per
-- slot per day, independent of and in addition to the application-level dedup check. body_sha256 +
-- body_len are the only body-shaped fields ever stored -- never verbatim text (SEC-M3 convention,
-- mirrors scripts/michael/todoist-act.mjs redactCall).
--
-- michael_checkpoint_send_enabled: a SINGLETON row (config_key UNIQUE, seeded 'checkpoint_send'
-- below) read fresh on every send attempt, fail-closed (treated as disabled) if the row or table is
-- missing or unreadable. Deliberately NOT leo_feature_flags (30s cache, fails open on read error)
-- and NOT michael_rules.auto_apply (flipping an active rule off requires an Opus-verifier artifact)
-- -- both considered and rejected in PLAN (VALIDATION V-4/V-5).
--
-- CHECKs are INLINE (never a trailing ALTER ... ADD CONSTRAINT): the DDL tier applies this file
-- twice to prove idempotence. No BEGIN/COMMIT: scripts/apply-migration.js wraps the transaction.
-- Never apply with --split-statements. Marker posture: '-- @chairman-gated' and NO
-- '-- @approved-by:' until the chairman signs.
--
-- Rollback: 20260914_michael_checkpoint_send_DOWN.sql (drops both tables; NEVER drops
-- public.michael_set_updated_at(), which the other michael_* tables still depend on).

-- ── 1. michael_checkpoint_send_ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_checkpoint_send_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  window_slot TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'held', 'refused')),
  refusal_code TEXT NULL,
  provider_message_id TEXT NULL,
  body_sha256 TEXT NULL,
  body_len INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- FR-7: at most one SENT row per (et_date, window_slot) -- a partial index, so multiple held/refused
-- rows for the same slot (e.g. a capped attempt followed by a later successful retry next window)
-- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS michael_checkpoint_send_ledger_sent_slot_uniq
  ON public.michael_checkpoint_send_ledger (et_date, window_slot) WHERE outcome = 'sent';
CREATE INDEX IF NOT EXISTS michael_checkpoint_send_ledger_et_date_idx ON public.michael_checkpoint_send_ledger (et_date);
COMMENT ON TABLE public.michael_checkpoint_send_ledger IS 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001: one row per in-window, non-dry-run checkpoint-send attempt (sent/held/refused); the audit trail FR-1 counts against and FR-6 requires. Partial unique (et_date, window_slot) WHERE outcome=''sent'' is FR-7''s DB-level per-slot dedup.';
ALTER TABLE public.michael_checkpoint_send_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_checkpoint_send_ledger_service_role ON public.michael_checkpoint_send_ledger;
CREATE POLICY michael_checkpoint_send_ledger_service_role ON public.michael_checkpoint_send_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_checkpoint_send_ledger FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_checkpoint_send_ledger TO service_role;
DROP TRIGGER IF EXISTS michael_checkpoint_send_ledger_set_updated_at ON public.michael_checkpoint_send_ledger;
CREATE TRIGGER michael_checkpoint_send_ledger_set_updated_at BEFORE UPDATE ON public.michael_checkpoint_send_ledger FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 2. michael_checkpoint_send_enabled ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.michael_checkpoint_send_enabled (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_checkpoint_send_enabled_config_key_uniq ON public.michael_checkpoint_send_enabled (config_key);
COMMENT ON TABLE public.michael_checkpoint_send_enabled IS 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001: FR-5''s fail-closed, read-fresh, no-cache enable/disable row (singleton, natural key ''checkpoint_send''). A missing row or an unreadable table is treated as disabled by the verb -- this table has no reader-side fallback to "enabled".';
ALTER TABLE public.michael_checkpoint_send_enabled ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_checkpoint_send_enabled_service_role ON public.michael_checkpoint_send_enabled;
CREATE POLICY michael_checkpoint_send_enabled_service_role ON public.michael_checkpoint_send_enabled FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_checkpoint_send_enabled FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_checkpoint_send_enabled TO service_role;
DROP TRIGGER IF EXISTS michael_checkpoint_send_enabled_set_updated_at ON public.michael_checkpoint_send_enabled;
CREATE TRIGGER michael_checkpoint_send_enabled_set_updated_at BEFORE UPDATE ON public.michael_checkpoint_send_enabled FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- Seed the singleton row, enabled by default -- so the verb finds a real row (rather than "no row
-- found", also treated as disabled) from the moment the chairman applies this migration.
INSERT INTO public.michael_checkpoint_send_enabled (config_key, enabled, reason)
VALUES ('checkpoint_send', true, 'seeded at migration apply, ratification 561878ae')
ON CONFLICT (config_key) DO NOTHING;

DO $verify$
DECLARE
  v_tables TEXT[] := ARRAY['michael_checkpoint_send_ledger', 'michael_checkpoint_send_enabled'];
  v_rel TEXT;
  t TEXT;
BEGIN
  -- SEC-M5: every check below is an ASSERT, and ASSERTs are a silent no-op under
  -- plpgsql.check_asserts = off. RAISE is not an ASSERT, so this guard fires regardless.
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) IN ('off', 'false', '0') THEN
    RAISE EXCEPTION 'MICHAEL-CHECKPOINT-SEND: plpgsql.check_asserts is off — the verify block cannot verify anything';
  END IF;
  FOREACH t IN ARRAY v_tables LOOP
    v_rel := 'public.' || t;
    ASSERT to_regclass(v_rel) IS NOT NULL, 'MICHAEL-CHECKPOINT-SEND: ' || t || ' did not land';
    ASSERT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_rel::regclass AND relrowsecurity),
      'MICHAEL-CHECKPOINT-SEND: ' || t || ': RLS is NOT enabled';
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) = 1,
      'MICHAEL-CHECKPOINT-SEND: ' || t || ': expected exactly ONE policy';
    ASSERT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_rel::regclass
        AND p.polname = t || '_service_role'
        AND p.polroles = ARRAY['service_role'::regrole::oid]
        AND p.polcmd = '*'
        AND p.polpermissive
    ), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': the policy is missing, renamed, or NOT "FOR ALL TO service_role"';
    ASSERT NOT has_table_privilege('anon', v_rel, 'SELECT'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': anon can SELECT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'INSERT'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': anon can INSERT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'UPDATE'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': anon can UPDATE';
    ASSERT NOT has_table_privilege('anon', v_rel, 'DELETE'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': anon can DELETE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'SELECT'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': authenticated can SELECT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'INSERT'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': authenticated can INSERT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'UPDATE'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': authenticated can UPDATE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'DELETE'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': authenticated can DELETE';
    ASSERT has_table_privilege('service_role', v_rel, 'SELECT'), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': service_role cannot SELECT';
    ASSERT NOT EXISTS (
      SELECT 1
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = v_rel::regclass
        AND a.grantee <> c.relowner
        AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
    ), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': a non-service table grant exists (including PUBLIC)';
    ASSERT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': updated_at column missing';
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = v_rel::regclass AND tgname = t || '_set_updated_at' AND NOT tgisinternal
    ), 'MICHAEL-CHECKPOINT-SEND: ' || t || ': updated_at trigger missing';
  END LOOP;

  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'michael_checkpoint_send_ledger_sent_slot_uniq'),
    'MICHAEL-CHECKPOINT-SEND: partial unique index michael_checkpoint_send_ledger_sent_slot_uniq missing';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'michael_checkpoint_send_enabled_config_key_uniq'),
    'MICHAEL-CHECKPOINT-SEND: unique index michael_checkpoint_send_enabled_config_key_uniq missing';
  ASSERT EXISTS (SELECT 1 FROM public.michael_checkpoint_send_enabled WHERE config_key = 'checkpoint_send'),
    'MICHAEL-CHECKPOINT-SEND: the seeded checkpoint_send config row is missing';

  -- Confirms this migration REUSED the shared trigger function rather than accidentally
  -- redefining or losing it -- the other michael_* tables' triggers still depend on it.
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'michael_set_updated_at' AND pronamespace = 'public'::regnamespace),
    'MICHAEL-CHECKPOINT-SEND: public.michael_set_updated_at() is missing';
  ASSERT has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE'),
    'MICHAEL-CHECKPOINT-SEND: service_role cannot EXECUTE michael_set_updated_at';
END
$verify$;
