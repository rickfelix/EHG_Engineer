-- SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — FR-1: the durable capacity-verdict table.
--
-- CHAIRMAN-GATED. The builder STAGES; the chairman APPLIES. Do not self-apply, including inside a
-- transaction that is rolled back — an apply attempt against a gated object is still an apply
-- attempt, and it is invisible in a diff, which is exactly why the boundary is stated rather than
-- assumed (TR-3).
--
-- WHAT THIS IS FOR, IN ONE QUESTION: "how long has the belt been in DEFICIT?" That is unanswerable
-- today, and not because it is hard — because nobody wrote the number down. The verdict ladder has
-- been computed on every capacity-forecast tick (every 10 minutes) and DISCARDED. This table is the
-- place it lands.
--
-- IT IS ALSO THE OTHER HALF OF AN ALREADY-SHIPPED HALF. SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B
-- FR-2 had two clauses. Clause 2 — drive_score leg4 citing a durable verdict row — was built and
-- reviewed. Clause 1, the row, was not, so leg4 has held a citation pointed at nothing and
-- scoreLeg4 has had zero production callers. Until this table is APPLIED, that stays true: leg4
-- reports unavailable, and that is the expected state, not a regression (FR-5).
--
-- ============================================================================================
-- PRE-CONDITION — READ BEFORE APPLYING.
-- ============================================================================================
-- This script CREATES a new table and must never quietly adopt or alter an existing one. If a
-- belt_capacity_verdicts already exists, something else made it, this file's assumptions about its
-- shape are unverified, and CREATE TABLE IF NOT EXISTS would exit successfully having changed
-- nothing — the silent no-op that reads exactly like a successful apply. Fail instead.
DO $$
BEGIN
  IF to_regclass('public.belt_capacity_verdicts') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: public.belt_capacity_verdicts already exists. This script '
      'creates it and does not reconcile an existing one. Capture the live definition, decide '
      'whether it is this table, and reconcile before applying. DO NOT swap in CREATE TABLE IF NOT '
      'EXISTS to make this pass — that turns a real conflict into a successful-looking no-op.';
  END IF;
END $$;

CREATE TABLE public.belt_capacity_verdicts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The window/run this verdict belongs to. NULLABLE ON PURPOSE: the capacity forecast writes on a
  -- 10-minute cadence with no run key of its own, while the drive-report sweep writes under its ET
  -- window key. Forcing a synthetic id on the forecast would invent provenance it does not have.
  run_id        TEXT,

  -- THE FROZEN FOUR. This CHECK is the same closed set as lib/drive-loop/score/leg4-capacity.js:38,
  -- and it is duplicated here deliberately rather than left to the application: the reader THROWS on
  -- an unrecognised verdict (:66), so a row carrying anything else is a row that poisons the reader
  -- that cites it. The constraint makes that row unwritable rather than merely discouraged.
  --
  -- 'OK-CORPUS-GATED' IS DELIBERATELY NOT IN THIS LIST. classifyCorpusGatedDeficit can rewrite the
  -- forecast's rendered verdict to that value, but it is a POLICY overlay answering "is this deficit
  -- fillable" — a different vocabulary from the capacity ladder. It is recorded in `detail`
  -- (detail->>'rendered_verdict'), never in this column.
  verdict       TEXT NOT NULL CHECK (verdict IN ('DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS')),

  -- The measurement behind the verdict. NOT NULL because a verdict with a null belt_depth renders
  -- as measured on every dashboard that reads it and is not — and that is the precise shape a
  -- caller passing the wrong row envelope produces. The application guards this too; both, because
  -- a durable record outlives the code that wrote it.
  belt_depth    INTEGER NOT NULL,
  demand_soon   INTEGER NOT NULL,
  deficit       INTEGER NOT NULL,

  -- Free-form provenance: which instrument wrote it, whether the corpus gate fired, and the
  -- rendered verdict when it differs from the ladder reading above.
  detail        JSONB,

  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query this table exists to serve is "what has the verdict been, over time" — always
-- ordered by time, usually filtered to a verdict class. One index, matching that.
CREATE INDEX belt_capacity_verdicts_recorded_at_idx
  ON public.belt_capacity_verdicts (recorded_at DESC);

-- ============================================================================================
-- LOCK IT DOWN. THIS IS NOT BOILERPLATE — OMITTING IT SHIPS THE TABLE OPEN.
-- ============================================================================================
-- MEASURED ON THIS DATABASE by the SECURITY sub-agent, not assumed from convention:
--   pg_default_acl, schema public, objtype 'r':
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--   and anon + authenticated both hold USAGE on schema public.
-- So EVERY new public table inherits full SELECT/INSERT/UPDATE/DELETE/TRUNCATE for anon and
-- authenticated the instant CREATE TABLE returns. Saying nothing here is not "neutral defaults",
-- it is OPT-IN-TO-OPEN. 815 of 849 public tables (96%) have RLS enabled; the RLS-off cohort is
-- mostly quarantine snapshots and backups. This is a governance table and does not belong there.
--
-- WHY IT MATTERS MORE THAN THE DATA SUGGESTS. The contents are dull — counts and four enum
-- strings. The exposure is INTEGRITY, not confidentiality: anon INSERT/UPDATE would forge the very
-- trend drive_score leg4 cites, and that trend feeds the coordinator's Adam-sourcing reach-out. An
-- anon TRUNCATE destroys history this file's own _DOWN states cannot be recomputed after the fact.
--
-- NOTE THE COMPARATOR IS WORSE HERE, NOT BETTER. session_coordination could argue its unused write
-- grants were dormant because RLS was ON there and no policy admitted them. With RLS OFF, grants
-- are the ONLY gate, and every one of them is live immediately.
--
-- ZERO RISK TO THIS SD'S OWN WRITERS: both producers build their client with
-- SUPABASE_SERVICE_ROLE_KEY, and service_role bypasses RLS entirely. RLS with no policies does not
-- touch the write path — it closes the anon/authenticated path and nothing else.
ALTER TABLE public.belt_capacity_verdicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.belt_capacity_verdicts FROM anon, authenticated;

COMMENT ON TABLE public.belt_capacity_verdicts IS
  'SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001: one row per capacity-forecast / drive-report run, '
  'recording the belt capacity verdict that run reached. Closes FR-2 clause 1 of '
  'SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (shipped with AC-3 UNMET). The verdict vocabulary is '
  'owned by lib/drive-loop/score/leg4-capacity.js:38 — keep the CHECK above in step with it.';

COMMENT ON COLUMN public.belt_capacity_verdicts.verdict IS
  'The capacity ladder reading, one of the frozen four. NOT the forecast''s rendered verdict, which '
  'the corpus gate may set to OK-CORPUS-GATED — that lives in detail->>''rendered_verdict''.';

-- ============================================================================================
-- POST-CONDITION — the migration asserts its own claim, in the same transaction.
-- ============================================================================================
-- Without this, a partial apply (table created, index or constraint silently absent) exits green.
DO $$
BEGIN
  IF to_regclass('public.belt_capacity_verdicts') IS NULL THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: belt_capacity_verdicts was not created.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.belt_capacity_verdicts'::regclass AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: the verdict CHECK constraint is missing — the table would '
      'accept a verdict the reader throws on.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'belt_capacity_verdicts_recorded_at_idx'
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: the recorded_at index is missing.';
  END IF;

  -- THE LOCKDOWN ASSERTS ITSELF. Without this the ALTER/REVOKE above are a hope: a future edit that
  -- drops them leaves a governance table silently joining the 4% unprotected cohort, and NOTHING
  -- fails at apply time to say so. The whole reason this table needs the guard is that the database
  -- default is permissive, so "we did not say anything" and "we opened it" are the same outcome.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.belt_capacity_verdicts'::regclass) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: row level security is NOT enabled. With RLS off, the '
      'inherited default ACL leaves anon and authenticated holding full write access.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'belt_capacity_verdicts'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: anon or authenticated still holds a write-class grant. '
      'The verdict history feeds drive_score leg4 and the coordinator sourcing loop; a forgeable '
      'trend is worse than no trend.';
  END IF;
END $$;
