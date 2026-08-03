-- SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (FR-4) — the Drive Report table.
--
-- CLASSIFICATION, recorded rather than assumed: TIER-1-ADDITIVE and NOT permission-class, so
-- no chairman pre-approval was needed to author this (coordinator ruling 2c526b33). That
-- classification is CONDITIONAL on the posture below being service-role-only.
--
-- THE RECLASSIFICATION TRIGGER, written here because a flag without its invalidating condition
-- is how a classification silently rots: THE MOMENT ANY NON-SERVICE GRANT APPEARS ON THIS TABLE
-- IT BECOMES PERMISSION-CLASS AND GOES TO THE CHAIRMAN. Adding an anon or authenticated grant
-- is not a tweak to this migration; it is a different class of change.
--
-- POSTURE IS ASSERTED, NOT INFERRED (coordinator ruling 4ba3f708, revised after measurement).
-- The precedent originally cited relied on Postgres' implicit deny — RLS on with no policy. A
-- population check of six recent table migrations found that shape was the OUTLIER: five use an
-- explicit service_role policy and four carry a verify block. For a table whose non-permission
-- status is CONDITIONAL on its posture, the posture must be self-verifying — the reclassification
-- trigger above is only enforceable if something actually checks, and the DO $verify$ block is
-- that something at the cheapest possible point.
--
-- WHY THE SECTIONS ARE JSONB AND NOT COLUMNS (C4): sections store CITATIONS AND PREDICATES ONLY —
-- every number must be re-derivable from its cited query, with no copied state. Columns would
-- invite storing the values themselves, which is exactly what the guardrail forbids.

CREATE TABLE IF NOT EXISTS public.drive_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at          timestamptz NOT NULL DEFAULT now(),

  -- Which run produced this, so a report traces back to the job that wrote it.
  run_id                text,
  cadence               text NOT NULL DEFAULT 'scheduled'
                          CHECK (cadence IN ('scheduled', 'on_demand')),

  -- The five sections. Citations and predicates only — never copied values.
  sections              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- drive_score X/8 over four legs, 2 points each, every leg carrying artifact row-ids.
  -- Chairman decision latency lives here too, BESIDE the score and ungraded (option A,
  -- ratified by SMS, row 5d90338c) — never folded into the total.
  drive_score           jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Consumption receipts, keyed by lane. STAMPED BY THE CONSUMER, never by the producer
  -- (C1) — this table only holds the shape; children -C and -D do the writing. Producer-
  -- stamped receipts would prove the producer believed delivery happened, which is the one
  -- thing a receipt must not be.
  consumption_receipts  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Bumped when the sections/score shape changes, so an old row is readable as old rather
  -- than as malformed.
  schema_version        integer NOT NULL DEFAULT 1,

  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.drive_reports IS
  'Externally-scheduled Drive Report (SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B). One row per run of the GHA cron, computed on wall-clock cadence independent of any session turn state. Sections store citations and predicates only, never copied values, so every number is re-derivable from its cited query. Consumption receipts are written BY EACH CONSUMER, never by the producer. Service-role only; any non-service grant reclassifies this table as permission-class and requires chairman approval.';

COMMENT ON COLUMN public.drive_reports.consumption_receipts IS
  'Per-lane receipts, written by the consuming pipeline step itself (coordinator, adam, chairman-brief). Producer-stamped values here would be worthless — a receipt exists to prove the consumer read it, not that the producer sent it.';

-- Section 5 counts unmoved items across reports, and the self-staleness alarm asks "when was
-- the last one" — both are ordered reads over generated_at.
CREATE INDEX IF NOT EXISTS drive_reports_generated_at_idx
  ON public.drive_reports (generated_at DESC);

-- ---------------------------------------------------------------------------
-- Posture: service-role only. Asserted, not inherited.
-- ---------------------------------------------------------------------------
ALTER TABLE public.drive_reports ENABLE ROW LEVEL SECURITY;

-- Guarded so the file is genuinely re-runnable — the CREATE TABLE and CREATE INDEX above use
-- IF NOT EXISTS, which advertises an idempotence a bare CREATE POLICY would not have.
DROP POLICY IF EXISTS drive_reports_service_role ON public.drive_reports;
CREATE POLICY drive_reports_service_role
  ON public.drive_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- THE LOAD-BEARING LINES. Default grants are the documented failure mode; an inherited grant
-- here would publish fleet plan-position and belt-diagnosis content to anon via PostgREST.
REVOKE ALL ON public.drive_reports FROM anon, authenticated;
GRANT ALL ON public.drive_reports TO service_role;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the table OR ITS POSTURE did not land.
-- The posture assertions are the point — a table that lands without its RLS is the
-- silent failure this whole classification depends on not happening.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT to_regclass('public.drive_reports') IS NOT NULL,
    'drive_reports table did not land';

  ASSERT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.drive_reports'::regclass AND relrowsecurity
  ), 'drive_reports: RLS is NOT enabled — the service-role-only classification does not hold';

  ASSERT (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drive_reports'
  ) = 1, 'drive_reports: expected exactly ONE policy — a second policy is a posture change, not an addition';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'drive_reports'
      AND policyname = 'drive_reports_service_role'
  ), 'drive_reports: the service_role policy is missing or renamed';

  -- The reclassification trigger, enforced rather than merely documented: if anon or
  -- authenticated hold ANY privilege on this table, the non-permission-class classification
  -- recorded on the SD is false and the deploy must fail loudly rather than ship a lie.
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'drive_reports'
      AND grantee IN ('anon', 'authenticated')
  ), 'drive_reports: a non-service grant exists — this table is now PERMISSION-CLASS and requires chairman approval';
END
$verify$;

-- Reload PostgREST schema cache so the new table is immediately visible.
NOTIFY pgrst, 'reload schema';
