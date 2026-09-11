-- @chairman-gated: applied by the chairman after sign-off (Tier 3: schema; personal data)
-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J (Michael v1.1 data model) — docs/michael/02-SPEC.md §2.
-- Four new v1.1 tables: michael_oracle_history, michael_oracle_alignment, michael_health_daily,
-- michael_check_in_journal. The spec gives NO column detail for any of the four (§2's table only
-- names them and their Dropbox replacement paths) -- this is therefore a first-cut, minimal,
-- extensible schema, documented as such per-table below.
--
-- SHAPE: follows child B's REAL migration (20260906_michael_tables.sql) precisely, not the shape
-- validation found the spec itself misdescribes. Every table uses a surrogate
-- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` plus a SEPARATE natural-key UNIQUE INDEX -- never
-- a natural-key-as-PRIMARY-KEY, which would give a re-running feeder no stable conflict target and
-- duplicate rows on every retry (PLAN-TO-EXEC TESTING finding B3, testing-agent:aa363409899c1c035).
-- Two tables are one-row-per-ET-day (mirrors michael_feedback_ledger/michael_brief_runs);
-- two are multi-row-per-day with a per-day sequence number (mirrors michael_calendar_day's
-- (et_date, external_id) shape, substituting a self-assigned `seq` since these rows have no
-- external natural key of their own).
--
-- REUSES public.michael_set_updated_at() (child B) -- never CREATE OR REPLACE it again here, since
-- the eleven v1 tables' triggers already depend on it.
--
-- CHECKs are INLINE (never a trailing ALTER ... ADD CONSTRAINT): the DDL tier applies this file
-- twice to prove idempotence. No BEGIN/COMMIT: scripts/apply-migration.js wraps the transaction.
-- Never apply with --split-statements. Marker posture: '-- @chairman-gated' and NO
-- '-- @approved-by:' until the chairman signs.
--
-- Rollback: 20260907_michael_v1_1_tables_DOWN.sql (drops the four tables; NEVER drops
-- public.michael_set_updated_at(), which the eleven v1 tables still depend on).

-- ── 1. michael_oracle_history ────────────────────────────────────────────────────────────────
-- Multi-row-per-day: reflective/journal entries extracted from the legacy Dropbox oracle folder
-- (memory/oracle/*) via the oracle-extract feeder. `seq` is a per-ET-date ordinal the feeder
-- assigns at write time (1, 2, 3, ...) -- there is no external natural key to key on instead.
CREATE TABLE IF NOT EXISTS public.michael_oracle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  seq INTEGER NOT NULL DEFAULT 1,
  content TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_oracle_history_date_seq_uniq ON public.michael_oracle_history (et_date, seq);
COMMENT ON TABLE public.michael_oracle_history IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J spec §2 (v1.1): oracle journal entries extracted from Drive, one row per (et_date, seq) (replaces memory/oracle/*). First-cut schema -- spec gives no column detail.';
ALTER TABLE public.michael_oracle_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_oracle_history_service_role ON public.michael_oracle_history;
CREATE POLICY michael_oracle_history_service_role ON public.michael_oracle_history FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_oracle_history FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_oracle_history TO service_role;
DROP TRIGGER IF EXISTS michael_oracle_history_set_updated_at ON public.michael_oracle_history;
CREATE TRIGGER michael_oracle_history_set_updated_at BEFORE UPDATE ON public.michael_oracle_history FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 2. michael_oracle_alignment ──────────────────────────────────────────────────────────────
-- One row per ET day: a daily alignment/reflection summary derived from that day's oracle_history.
CREATE TABLE IF NOT EXISTS public.michael_oracle_alignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimension_scores) = 'object'),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_oracle_alignment_et_date_uniq ON public.michael_oracle_alignment (et_date);
COMMENT ON TABLE public.michael_oracle_alignment IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J spec §2 (v1.1): one row per ET day, alignment scoring derived from oracle_history. First-cut schema -- spec gives no column detail.';
ALTER TABLE public.michael_oracle_alignment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_oracle_alignment_service_role ON public.michael_oracle_alignment;
CREATE POLICY michael_oracle_alignment_service_role ON public.michael_oracle_alignment FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_oracle_alignment FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_oracle_alignment TO service_role;
DROP TRIGGER IF EXISTS michael_oracle_alignment_set_updated_at ON public.michael_oracle_alignment;
CREATE TRIGGER michael_oracle_alignment_set_updated_at BEFORE UPDATE ON public.michael_oracle_alignment FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 3. michael_health_daily ──────────────────────────────────────────────────────────────────
-- One row per ET day: health metrics synced from Drive (replaces data/health-*.json). Personal
-- health data -- see scripts/michael/retention.mjs's RETENTION_TARGETS entry for this table.
CREATE TABLE IF NOT EXISTS public.michael_health_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_health_daily_et_date_uniq ON public.michael_health_daily (et_date);
COMMENT ON TABLE public.michael_health_daily IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J spec §2 (v1.1): one row per ET day, health metrics synced via the health-sync feeder (replaces data/health-*.json). First-cut schema -- spec gives no column detail.';
ALTER TABLE public.michael_health_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_health_daily_service_role ON public.michael_health_daily;
CREATE POLICY michael_health_daily_service_role ON public.michael_health_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_health_daily FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_health_daily TO service_role;
DROP TRIGGER IF EXISTS michael_health_daily_set_updated_at ON public.michael_health_daily;
CREATE TRIGGER michael_health_daily_set_updated_at BEFORE UPDATE ON public.michael_health_daily FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

-- ── 4. michael_check_in_journal ──────────────────────────────────────────────────────────────
-- Multi-row-per-day: check-in entries (replaces data/check-in-log.jsonl). Spec §9 leaves the
-- storage mechanism an OPEN decision ("whether the check-in journal stays as Todoist comments or
-- moves to a table with Todoist as a mirror") -- this table is the "moves to a table" half,
-- mirroring oracle_history's (et_date, seq) shape since check-ins likewise have no external
-- natural key of their own.
CREATE TABLE IF NOT EXISTS public.michael_check_in_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  et_date DATE NOT NULL,
  seq INTEGER NOT NULL DEFAULT 1,
  entry_text TEXT NULL,
  mood TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS michael_check_in_journal_date_seq_uniq ON public.michael_check_in_journal (et_date, seq);
COMMENT ON TABLE public.michael_check_in_journal IS 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J spec §2 (v1.1): one row per (et_date, seq) check-in entry (replaces data/check-in-log.jsonl). First-cut schema -- spec §9 leaves the storage mechanism an open decision; this is the table-backed half.';
ALTER TABLE public.michael_check_in_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS michael_check_in_journal_service_role ON public.michael_check_in_journal;
CREATE POLICY michael_check_in_journal_service_role ON public.michael_check_in_journal FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.michael_check_in_journal FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.michael_check_in_journal TO service_role;
DROP TRIGGER IF EXISTS michael_check_in_journal_set_updated_at ON public.michael_check_in_journal;
CREATE TRIGGER michael_check_in_journal_set_updated_at BEFORE UPDATE ON public.michael_check_in_journal FOR EACH ROW EXECUTE FUNCTION public.michael_set_updated_at();

DO $verify$
DECLARE
  v_tables TEXT[] := ARRAY[
    'michael_oracle_history', 'michael_oracle_alignment', 'michael_health_daily', 'michael_check_in_journal'
  ];
  v_indexes TEXT[] := ARRAY[
    'michael_oracle_history_date_seq_uniq', 'michael_oracle_alignment_et_date_uniq',
    'michael_health_daily_et_date_uniq', 'michael_check_in_journal_date_seq_uniq'
  ];
  v_columns TEXT[][] := ARRAY[
    ARRAY['michael_oracle_history', 'et_date', 'date'],
    ARRAY['michael_oracle_history', 'seq', 'integer'],
    ARRAY['michael_oracle_alignment', 'et_date', 'date'],
    ARRAY['michael_oracle_alignment', 'dimension_scores', 'jsonb'],
    ARRAY['michael_health_daily', 'et_date', 'date'],
    ARRAY['michael_health_daily', 'metrics', 'jsonb'],
    ARRAY['michael_check_in_journal', 'et_date', 'date'],
    ARRAY['michael_check_in_journal', 'seq', 'integer']
  ];
  t TEXT;
  ix TEXT;
  i INTEGER;
  v_rel TEXT;
BEGIN
  -- SEC-M5: every check below is an ASSERT, and ASSERTs are a silent no-op under
  -- plpgsql.check_asserts = off. RAISE is not an ASSERT, so this guard fires regardless.
  IF lower(coalesce(current_setting('plpgsql.check_asserts', true), 'on')) IN ('off', 'false', '0') THEN
    RAISE EXCEPTION 'MICHAEL-V1.1-TABLES: plpgsql.check_asserts is off — the verify block cannot verify anything';
  END IF;
  FOREACH t IN ARRAY v_tables LOOP
    v_rel := 'public.' || t;
    ASSERT to_regclass(v_rel) IS NOT NULL, 'MICHAEL-V1.1-TABLES: ' || t || ' did not land';
    ASSERT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_rel::regclass AND relrowsecurity),
      'MICHAEL-V1.1-TABLES: ' || t || ': RLS is NOT enabled';
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) = 1,
      'MICHAEL-V1.1-TABLES: ' || t || ': expected exactly ONE policy';
    ASSERT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = v_rel::regclass
        AND p.polname = t || '_service_role'
        AND p.polroles = ARRAY['service_role'::regrole::oid]
        AND p.polcmd = '*'
        AND p.polpermissive
    ), 'MICHAEL-V1.1-TABLES: ' || t || ': the policy is missing, renamed, or NOT "FOR ALL TO service_role"';
    ASSERT NOT has_table_privilege('anon', v_rel, 'SELECT'), 'MICHAEL-V1.1-TABLES: ' || t || ': anon can SELECT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'INSERT'), 'MICHAEL-V1.1-TABLES: ' || t || ': anon can INSERT';
    ASSERT NOT has_table_privilege('anon', v_rel, 'UPDATE'), 'MICHAEL-V1.1-TABLES: ' || t || ': anon can UPDATE';
    ASSERT NOT has_table_privilege('anon', v_rel, 'DELETE'), 'MICHAEL-V1.1-TABLES: ' || t || ': anon can DELETE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'SELECT'), 'MICHAEL-V1.1-TABLES: ' || t || ': authenticated can SELECT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'INSERT'), 'MICHAEL-V1.1-TABLES: ' || t || ': authenticated can INSERT';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'UPDATE'), 'MICHAEL-V1.1-TABLES: ' || t || ': authenticated can UPDATE';
    ASSERT NOT has_table_privilege('authenticated', v_rel, 'DELETE'), 'MICHAEL-V1.1-TABLES: ' || t || ': authenticated can DELETE';
    ASSERT has_table_privilege('service_role', v_rel, 'SELECT'), 'MICHAEL-V1.1-TABLES: ' || t || ': service_role cannot SELECT';
    ASSERT NOT EXISTS (
      SELECT 1
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = v_rel::regclass
        AND a.grantee <> c.relowner
        AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
    ), 'MICHAEL-V1.1-TABLES: ' || t || ': a non-service table grant exists (including PUBLIC)';
    ASSERT NOT EXISTS (
      SELECT 1
      FROM pg_attribute at
      CROSS JOIN LATERAL aclexplode(at.attacl) a
      WHERE at.attrelid = v_rel::regclass
        AND at.attacl IS NOT NULL
        AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = v_rel::regclass)
        AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
    ), 'MICHAEL-V1.1-TABLES: ' || t || ': a non-service COLUMN grant exists';
    ASSERT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
    ), 'MICHAEL-V1.1-TABLES: ' || t || ': updated_at column missing';
    ASSERT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = v_rel::regclass AND tgname = t || '_set_updated_at' AND NOT tgisinternal
    ), 'MICHAEL-V1.1-TABLES: ' || t || ': updated_at trigger missing';
  END LOOP;

  FOREACH ix IN ARRAY v_indexes LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ix),
      'MICHAEL-V1.1-TABLES: index ' || ix || ' missing';
  END LOOP;

  FOR i IN 1 .. array_length(v_columns, 1) LOOP
    ASSERT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_columns[i][1]
        AND column_name = v_columns[i][2] AND data_type = v_columns[i][3]
    ), 'MICHAEL-V1.1-TABLES: ' || v_columns[i][1] || '.' || v_columns[i][2] || ' missing or not ' || v_columns[i][3];
  END LOOP;

  -- Confirms this migration REUSED the shared trigger function rather than accidentally
  -- redefining or losing it -- the eleven v1 tables' triggers still depend on it.
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'michael_set_updated_at' AND pronamespace = 'public'::regnamespace),
    'MICHAEL-V1.1-TABLES: public.michael_set_updated_at() is missing';
  ASSERT has_function_privilege('service_role', 'public.michael_set_updated_at()', 'EXECUTE'),
    'MICHAEL-V1.1-TABLES: service_role cannot EXECUTE michael_set_updated_at';
END
$verify$;
