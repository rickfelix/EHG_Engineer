-- @approved-by: codestreetlabs@gmail.com
-- Approval provenance: chairman SMS reply "A" 2026-08-10T00:37:39Z, sms_relay_staging row 4bbbfbf9-8bfc-4002-a20c-8a9bdd1659db (sig_valid), answering decision packet adam-venture-demand-apply-20260809 (sent 2026-08-10T00:12Z, rec A = apply tonight via scribe ceremony). Transcribed by Adam per ruling 5d86e2e3 (worker may transcribe @approved-by with full citation). Solomon consult 80eb4567 -> CONCUR-A (advisories 7aba74b2, e0ba608c).
-- SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 — FR-1.
--
-- THE GAP THIS CLOSES: a marketing channel graduates to autonomous purely on a clean-streak
-- counter (lib/marketing/autonomy-gate.js:236-238 computes graduate = cleanStreak >= requiredStreak
-- and upserts autonomy_state='autonomous'), with NO check that the venture has any real market
-- demand behind it. This table is the verdict that FR-4's trigger and FR-5's call site read.
--
-- THE LOAD-BEARING PROPERTY IS UNFAKEABILITY AT THE DATA LAYER. A gate is only as honest as the
-- data it trusts: a settable verdict defeats this SD regardless of how correct the gate logic is.
-- So the verdict is APPEND-ONLY (frozen after INSERT, undeletable) rather than merely
-- "computed by the right function" — a mutable row protected only by convention is protected by
-- nothing once any other writer exists.
--
-- WHAT IS DELIBERATELY ABSENT, and this is structural rather than stylistic:
--   * NO boolean column. A boolean cannot represent three states, and the third state is the
--     entire point (see below).
--   * NO numeric score/health column. A NOT NULL score forces every unmeasurable row to INVENT A
--     NUMBER, and an invented number is indistinguishable from a measured one. That is the exact
--     fabrication this SD exists to abolish.
--   * NO negatively-phrased flag (no `blocked`, no `denied`, no `failed`). Polarity decides the
--     safety property: a .maybeSingle() on this table returns {data:null,error:null}, so
--     `if (v?.verdict === 'PASS')` BLOCKS on absence (correct) while `if (!v?.blocked)` PASSES on
--     absence (fail-OPEN). Only a positively-phrased verdict can be read fail-closed, so the
--     negative form is not offered at all.
-- The verify block at the bottom ASSERTS these absences, so a later "helpful" ALTER TABLE adding a
-- score column fails the deploy instead of silently reopening the hole.
--
-- NO_DATA IS FIRST-CLASS AND IS NEVER FOLDED. The precedent is lib/governance/demand-gate.js:47-50,
-- which freezes a three-value decision and states that collapsing "unmeasurable" into either
-- neighbour recreates the defect: folded into PASS it fabricates demand that was never measured;
-- folded into BLOCKED it becomes indistinguishable from a venture that was measured and failed,
-- which hides the fact that nobody is measuring. A venture nobody can measure is not a venture
-- with no demand.
--
-- MEASURED BASELINE AT PLAN (runtime, not code reading): all 10 venture_telemetry rows resolve
-- no_writer_yet; Image Alt Text Generator has no telemetry row at all; ops_payment_events holds
-- exactly one row (livemode=false, unattributed, venture_id=null). So NO_DATA is the honest
-- verdict for every venture in the fleet today, and this table is expected to fill with NO_DATA
-- rows — that is the gate working, not the gate broken.

CREATE TABLE IF NOT EXISTS public.venture_demand_verdicts (
  id            BIGSERIAL PRIMARY KEY,

  venture_id    UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,

  -- CHECK IS LOAD-BEARING, NOT DECORATION. A bare `verdict TEXT NOT NULL` gives the read sites
  -- nothing to rely on and lets a typo ('pass', 'Passed', 'ok') become a permanent silent
  -- third state that no consumer handles. FR-4's trigger compares against the literal 'PASS';
  -- if this vocabulary is open, that comparison is a string-matching accident.
  verdict       TEXT NOT NULL CHECK (verdict IN ('PASS', 'BLOCKED', 'NO_DATA')),

  -- Per-rung detail: each rung resolves MEASURED{value} or UNMEASURABLE{reason}, never a bare
  -- number. Stored as JSONB because the rung set is owned by lib/marketing/venture-activation-gate.js
  -- and will grow; a column-per-rung would make every new rung a migration.
  -- The visitors rung carries DECLARED_UNFILTERED here (FR-3): no bot filtering exists anywhere in
  -- this repo, Cloudflare visitor counts are aggregate-by-design and cannot be filtered
  -- downstream, and signups are a venture self-report. Labelling an unfiltered count "filtered"
  -- would be precisely the camouflage this SD abolishes.
  rungs         JSONB NOT NULL,

  -- NOT NULL on EVERY row, not only on NO_DATA. That is the whole difference between a checked
  -- all-clear and an unchecked one: a PASS with no citation is an assertion, not a measurement.
  citation      TEXT NOT NULL,

  -- FR-6, ruled by the coordinator as acceptance (b): a verdict that says only NO_DATA is not
  -- good enough. The row must name what evidence is missing and what would produce it, so a
  -- blocked venture has a legible route forward rather than an opaque refusal. NOT NULL on every
  -- row including PASS (where it states what would have to stop being true to lose the pass).
  path_to_pass  TEXT NOT NULL,

  -- NOT SUPPLIED BY THE WRITER. A client clock lets two producers with any drift interleave into
  -- a history that is subtly out of order and shows nothing wrong. The database clock is
  -- single-sourced. Also: a writer that supplies its own timestamp can backdate a verdict, which
  -- is a fakeability hole in a table whose whole purpose is to be unfakeable.
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT venture_demand_verdicts_citation_nonempty
    CHECK (btrim(citation) <> ''),
  CONSTRAINT venture_demand_verdicts_path_to_pass_nonempty
    CHECK (btrim(path_to_pass) <> ''),
  -- rungs must be a JSON OBJECT, not a bare scalar or array. Without this, `rungs: 0` or
  -- `rungs: "none"` satisfies NOT NULL and stores a shape no consumer can read.
  CONSTRAINT venture_demand_verdicts_rungs_is_object
    CHECK (jsonb_typeof(rungs) = 'object')
);

-- FR-4's trigger asks "does a PASS verdict exist for this venture" on every autonomy write, and
-- the audit reads the newest verdict per venture. Both are this index.
CREATE INDEX IF NOT EXISTS venture_demand_verdicts_venture_computed_idx
  ON public.venture_demand_verdicts (venture_id, computed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY. Pattern from database/migrations/20260803_drive_reports.sql:197-267, the only
-- migration in this repo that makes a stored value literally unwritable after INSERT.
--
-- WHY THE DELETE GUARD IS NOT REDUNDANT WITH THE UPDATE GUARD: freezing UPDATE alone leaves
-- delete-and-reinsert as a complete bypass — the same row id is gone but the venture's verdict is
-- whatever was inserted last, which is exactly the mutability the freeze was meant to remove.
-- Both guards name SERVICE_ROLE AS THEIR OWN THREAT MODEL, because service_role bypasses RLS
-- entirely and is the role every writer in this codebase actually runs as. A guard that only
-- constrains anon/authenticated does not constrain anybody who can currently reach this table.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.venture_demand_verdicts_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  RAISE EXCEPTION
    'venture_demand_verdicts is append-only: row % for venture % cannot be modified after insert. A demand verdict is an OBSERVATION — correcting it means recording a NEW verdict, not editing the old one, so the history of what was believed when survives.',
    OLD.id, OLD.venture_id;
END
$freeze$;

DROP TRIGGER IF EXISTS venture_demand_verdicts_no_update ON public.venture_demand_verdicts;
CREATE TRIGGER venture_demand_verdicts_no_update
  BEFORE UPDATE ON public.venture_demand_verdicts
  FOR EACH ROW EXECUTE FUNCTION public.venture_demand_verdicts_freeze();

CREATE OR REPLACE FUNCTION public.venture_demand_verdicts_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'venture_demand_verdicts is append-only: row % for venture % cannot be deleted. Without this guard, delete-and-reinsert is a complete bypass of the update freeze.',
    OLD.id, OLD.venture_id;
END
$nodelete$;

DROP TRIGGER IF EXISTS venture_demand_verdicts_no_delete_trg ON public.venture_demand_verdicts;
CREATE TRIGGER venture_demand_verdicts_no_delete_trg
  BEFORE DELETE ON public.venture_demand_verdicts
  FOR EACH ROW EXECUTE FUNCTION public.venture_demand_verdicts_no_delete();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. Supabase's ALTER DEFAULT PRIVILEGES grants anon/authenticated on new public tables.
-- RLS-with-no-policy blocks the ROWS so reads return nothing — but THE GRANT STILL EXISTS and
-- nothing says so. That is safety-by-coincidence: the table would sit one permissive policy away
-- from exposure, and the one-word edit that causes it reads as ordinary house style.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.venture_demand_verdicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_demand_verdicts_service_role ON public.venture_demand_verdicts;
CREATE POLICY venture_demand_verdicts_service_role
  ON public.venture_demand_verdicts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.venture_demand_verdicts FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.venture_demand_verdicts TO service_role;

-- VERIFY. CREATE TABLE IF NOT EXISTS advertises an idempotence that HIDES A REAL FAILURE: if the
-- table already exists in some other shape, every CHECK and every constraint above silently does
-- NOT land and this file still reports success. An unapplied-or-partially-applied migration would
-- be indistinguishable from a correct one. This block aborts the deploy instead.
DO $verify$
DECLARE
  bad_col text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.venture_demand_verdicts'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%verdict = ANY%'
  ) THEN
    RAISE EXCEPTION 'venture_demand_verdicts: the CHECK on verdict did not land — the vocabulary is open, so a typo becomes a silent fourth state and FR-4''s trigger comparison against ''PASS'' is a string-matching accident';
  END IF;

  -- THE ABSENCE ASSERTIONS. These are the point of this block, not a footnote: the design
  -- decision "no boolean, no numeric score, no negative flag" is worth nothing if a later ALTER
  -- TABLE can quietly reintroduce one. A column named `passed`/`blocked`/`score`/`health` here
  -- would let a read site pick the fail-OPEN polarity, and a NOT NULL score would force every
  -- NO_DATA row to invent a number.
  FOR bad_col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venture_demand_verdicts'
      AND (
        column_name IN ('passed', 'blocked', 'denied', 'failed', 'score', 'health', 'is_valid')
        OR data_type = 'boolean'
      )
  LOOP
    RAISE EXCEPTION 'venture_demand_verdicts: column % must not exist. A boolean cannot carry the three-state vocabulary, a numeric score forces every NO_DATA row to invent a number, and a negatively-phrased flag inverts fail-closed polarity because a null from .maybeSingle() is falsy.', bad_col;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.venture_demand_verdicts'::regclass
      AND tgname = 'venture_demand_verdicts_no_update' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'venture_demand_verdicts: the append-only UPDATE freeze did not land — the verdict is editable and therefore fakeable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.venture_demand_verdicts'::regclass
      AND tgname = 'venture_demand_verdicts_no_delete_trg' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'venture_demand_verdicts: the append-only DELETE guard did not land — delete-and-reinsert bypasses the update freeze completely';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'venture_demand_verdicts'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'venture_demand_verdicts: a non-service grant is present — this table gates channel autonomy and must not be reachable by anon or authenticated';
  END IF;
END
$verify$;

COMMENT ON TABLE public.venture_demand_verdicts IS
  'SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-1: per-venture demand-validation verdict over PASS/BLOCKED/NO_DATA. Append-only and computed-only — never a settable field. NO_DATA is first-class and is never folded into PASS or BLOCKED. No boolean, numeric-score, or negatively-phrased column exists here by design; the migration''s verify block asserts their absence.';
