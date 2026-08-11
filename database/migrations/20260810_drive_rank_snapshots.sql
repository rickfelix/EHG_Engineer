-- SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-1/TR-1) — the ranked-top-5 snapshot table.
--
-- WHY THIS EXISTS: scripts/coordinator-backlog-rank.mjs writes the ranked-top-5 to
-- strategic_directives_v2.metadata.dispatch_rank via an atomic jsonb merge (buildRankPatch,
-- coordinator-backlog-rank.mjs:92), then CLEARS those same 3 keys on claim/block/terminal
-- (buildRankClearQuery, coordinator-backlog-rank.mjs:171 — both the per-tick diff loop and the
-- separate terminal-status sweep). A LIVE top-5-by-dispatch_rank query at drive-report-sweep.mjs
-- report time therefore excludes any SD claimed since it was ranked — exactly leg2_uptake's own
-- numerator (coordinator ruling 8280af5a, "the adding-to-an-exclusion-set class"). Storing an
-- APPEND-ONLY snapshot in a table separate from strategic_directives_v2.metadata sidesteps the
-- clobber-risk surface entirely, rather than requiring a new merge-safe write path on that row
-- (validation-agent evidence 4b0ae5d3 confirmed no reusable snapshot vehicle already exists:
-- drive_reports.sections.next_acts.order is empty by construction — it sources
-- roadmap_wave_items, which never carries metadata.dispatch_rank).
--
-- CLASSIFICATION: TIER-1-ADDITIVE, service-role-only posture (same classification rule as
-- drive_reports — 20260803_drive_reports.sql). No chairman pre-approval required as long as
-- this posture holds; any non-service grant reclassifies it as permission-class.
--
-- WHY INSERT-ONLY (never UPSERT-by-sd_id): a ranking run every ~15 minutes (prospective
-- testing-agent risk R1, evidence 4abcf446) means the SAME sd_id is ranked many times a day.
-- Upserting would collapse every ranking of an SD into one row and destroy the ability to pick
-- "the cohort ~24h ago" rather than "the latest cohort" — and the latest cohort is BY
-- CONSTRUCTION unclaimed (the ranker only ranks currently-claimable leaves), so reading it would
-- read as a permanent ~0% uptake while still reporting leg2 as measured. UPDATE is blocked at the
-- DB level (a snapshot row that can be edited after ranking is not a snapshot). DELETE is
-- deliberately NOT blocked — see "REAPER" below for why an unconditional DELETE guard, modeled
-- on drive_reports' guard-with-a-GUC-escape-hatch, would have made this table's own retention
-- policy silently non-functional.
--
-- REAPER (operator-contract, lib/retention/policies.js): this table accumulates ~175k rows/year
-- (5 rows every ~15min from the armed standard_loop:backlog-rank cron) and needs the SAME
-- retention-enforce.js archive-then-delete cycle every other trend table in this repo uses. That
-- cycle issues a plain supabase-js `.delete().in('id', ch)` with no way to set a per-request
-- Postgres GUC — so a DELETE-side guard requiring `SET LOCAL ...allow_delete='on'` (as
-- drive_reports_guard_delete does) would make the archiver succeed at archiving and then fail at
-- deleting, FOREVER, every single run: a reaper that only ever looks satisfied. Caught before
-- shipping by working through what the declared policy actually needs to succeed, not just what
-- satisfies the gate's existence check. The UPDATE guard alone is the load-bearing invariant for
-- leg2's window-anchor math (ranked_at must never move for a LIVE row); a row's eventual deletion
-- by the standard retention cycle does not threaten that.

CREATE TABLE IF NOT EXISTS public.drive_rank_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Shared across every row written by one coordinator-backlog-rank.mjs run — the cohort key.
  ranked_at     timestamptz NOT NULL,

  -- 1-based rank within that run's top-5 (1 = highest unlock score).
  rank          integer NOT NULL CHECK (rank >= 1 AND rank <= 5),

  -- strategic_directives_v2.id is character varying(50), NOT uuid, despite holding
  -- uuid-shaped values (measured against information_schema.columns before writing this —
  -- a uuid-typed FK column here would fail to even create against the real PK type).
  sd_id         character varying(50) NOT NULL REFERENCES public.strategic_directives_v2(id),
  sd_key        text NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),

  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.drive_rank_snapshots IS
  'SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 — append-only ranked-top-5 snapshot, one row per (ranked_at cohort, rank 1-5), written by coordinator-backlog-rank.mjs at ranking time and read by drive-report-sweep.mjs leg2_uptake at report time. Exists so leg2''s numerator survives coordinator-backlog-rank.mjs clearing metadata.dispatch_rank on claim. Rows are never UPDATEd (DB-enforced trigger — a live row''s ranked_at must never move); rows ARE deleted by the standard retention-enforce.js archive-then-delete cycle (lib/retention/policies.js), which needs a plain DELETE with no GUC escape hatch to function. Service-role only.';

-- The reader's primary access pattern: find the nearest cohort whose ranked_at has fully
-- elapsed the claim window, then fetch that cohort's rows.
CREATE INDEX IF NOT EXISTS drive_rank_snapshots_ranked_at_idx
  ON public.drive_rank_snapshots (ranked_at DESC);

-- Declared as a standalone idempotent block (not inline in CREATE TABLE) for the same
-- self-healing reason drive_report_receipts' UNIQUE constraint is: `CREATE TABLE IF NOT EXISTS`
-- is a no-op once the table exists, so an inline UNIQUE would only ever be created once, at
-- first apply — a partial apply or manual drop could not be repaired by re-running this file.
DO $rank_snap_uniq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drive_rank_snapshots'::regclass
      AND conname = 'drive_rank_snapshots_cohort_rank_uniq'
  ) THEN
    ALTER TABLE public.drive_rank_snapshots
      ADD CONSTRAINT drive_rank_snapshots_cohort_rank_uniq UNIQUE (ranked_at, rank);
  END IF;
END
$rank_snap_uniq$;

-- ---------------------------------------------------------------------------
-- APPEND-ONLY (UPDATE half only). A snapshot row that can be edited after the fact is not a
-- snapshot, and leg2's window-anchor math depends on a live row's ranked_at never moving.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drive_rank_snapshots_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $upd$
BEGIN
  RAISE EXCEPTION 'drive_rank_snapshots rows are append-only: a snapshot cohort that can be edited after ranking is not a snapshot, and leg2''s window-anchor math (ranked_at + 24h) depends on ranked_at never moving (row id %)', OLD.id;
END
$upd$;

DROP TRIGGER IF EXISTS drive_rank_snapshots_guard_update_trg ON public.drive_rank_snapshots;
CREATE TRIGGER drive_rank_snapshots_guard_update_trg
  BEFORE UPDATE ON public.drive_rank_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.drive_rank_snapshots_guard_update();

-- ---------------------------------------------------------------------------
-- NO DELETE GUARD (deliberate, and a repair of this file's first version — see the REAPER note
-- near the top). retention-enforce.js's plain `.delete().in('id', ch)` has no path to set a
-- per-request GUC, so a delete-side guard would leave this table's reaper permanently unable to
-- actually shrink the hot table while still reporting "archived" every run. Explicitly dropped
-- (not merely omitted) so a re-run of this file REPAIRS a database that already has the
-- earlier, delete-guarded version applied — the same self-healing property every other
-- idempotent statement in this file has.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS drive_rank_snapshots_guard_delete_trg ON public.drive_rank_snapshots;
DROP FUNCTION IF EXISTS public.drive_rank_snapshots_guard_delete();

-- ---------------------------------------------------------------------------
-- Posture: service-role only. Asserted, not inherited.
-- ---------------------------------------------------------------------------
ALTER TABLE public.drive_rank_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drive_rank_snapshots_service_role ON public.drive_rank_snapshots;
CREATE POLICY drive_rank_snapshots_service_role
  ON public.drive_rank_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.drive_rank_snapshots FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.drive_rank_snapshots TO service_role;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the table OR ITS POSTURE did not land.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT to_regclass('public.drive_rank_snapshots') IS NOT NULL,
    'drive_rank_snapshots table did not land';

  ASSERT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.drive_rank_snapshots'::regclass AND relrowsecurity
  ), 'drive_rank_snapshots: RLS is NOT enabled — the service-role-only classification does not hold';

  ASSERT (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drive_rank_snapshots'
  ) = 1, 'drive_rank_snapshots: expected exactly ONE policy — a second policy is a posture change, not an addition';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drive_rank_snapshots'
      AND policyname = 'drive_rank_snapshots_service_role'
  ), 'drive_rank_snapshots: the service_role policy is missing or renamed';

  -- SECURITY review (evidence 36b4016b): a name-only + count-only policy check is satisfiable by
  -- a policy named drive_rank_snapshots_service_role but written FOR ALL TO PUBLIC — porting the
  -- drive_reports precedent (20260803_drive_reports.sql) verbatim rather than shipping the same
  -- gap twice. pg_policy.polroles is the load-bearing column: TO PUBLIC stores {0}, so an explicit
  -- ARRAY['service_role'::regrole] comparison rejects it.
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.drive_rank_snapshots'::regclass
      AND p.polname = 'drive_rank_snapshots_service_role'
      AND p.polroles = ARRAY['service_role'::regrole::oid]
      AND p.polcmd = '*'
      AND p.polpermissive
  ), 'drive_rank_snapshots: the policy exists but is NOT "FOR ALL TO service_role" — a policy TO PUBLIC (polroles {0}) or scoped to one command would pass a name-only check while granting this table far more widely, which is the permission-class reclassification this table requires chairman approval for';

  -- Table-level ACL tripwire, reading pg_class.relacl via aclexplode (the authoritative ACL,
  -- representing PUBLIC explicitly as grantee OID 0) — deny-by-default so a role invented next
  -- year is caught by construction, not by amendment.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public.drive_rank_snapshots'::regclass
      AND a.grantee <> c.relowner
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'drive_rank_snapshots: a non-service grant exists (including PUBLIC) — this table is now PERMISSION-CLASS and requires chairman approval';

  -- Column-level ACL tripwire. pg_class.relacl holds only table grants; a column-scoped GRANT
  -- lands in pg_attribute.attacl and leaves relacl untouched, invisible to the check above.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_attribute at
    CROSS JOIN LATERAL aclexplode(at.attacl) a
    WHERE at.attrelid = 'public.drive_rank_snapshots'::regclass
      AND at.attacl IS NOT NULL
      AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.drive_rank_snapshots'::regclass)
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'drive_rank_snapshots: a non-service COLUMN grant exists (including PUBLIC) — column grants live in pg_attribute.attacl and are invisible to the table-level ACL check; this table is now PERMISSION-CLASS and requires chairman approval';

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drive_rank_snapshots'::regclass
      AND conname = 'drive_rank_snapshots_cohort_rank_uniq'
  ), 'drive_rank_snapshots: the (ranked_at, rank) uniqueness constraint is missing';

  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.drive_rank_snapshots'::regclass
      AND tgname = 'drive_rank_snapshots_guard_update_trg'
  ), 'drive_rank_snapshots: the append-only UPDATE guard trigger is missing';

  -- Deliberately ABSENT (see the REAPER note near the top): a DELETE guard would make
  -- retention-enforce.js's plain `.delete()` fail forever, so this asserts it stays gone even if
  -- a future edit reintroduces it by copy-paste from the drive_reports precedent.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.drive_rank_snapshots'::regclass
      AND tgname = 'drive_rank_snapshots_guard_delete_trg'
  ), 'drive_rank_snapshots: a DELETE guard trigger exists — this would make retention-enforce.js archive successfully and then fail to delete, forever; the reaper needs a plain DELETE to function';
END
$verify$;
