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

-- ONE ROW PER run_id, ENFORCED BY THE DATABASE.
--
-- The producer probes for an existing run_id before writing, but a probe-then-write is a
-- decision made from a stale read: two ticks of the self-healing window that overlap, or a
-- GitHub job re-run racing the original, can both observe "no row" and both insert. The
-- application guard is the fast path; this index is what makes the duplicate IMPOSSIBLE
-- rather than merely unlikely.
--
-- It matters more here than the word "duplicate" suggests. Section 5 computes report-over-
-- report deltas against the immediately prior row. A second row for the same run makes it
-- diff a report against itself: guaranteed zero movement, rendered as a stall that is not
-- happening. The duplicate does not just waste a row, it silently corrupts the one section
-- whose entire subject is history.
--
-- PARTIAL, because run_id is nullable: an ad-hoc row written without a run id is legitimate
-- (cadence 'on_demand'), and NULLs are distinct under a plain UNIQUE anyway. Stating WHERE
-- makes the intent legible instead of relying on that NULL-comparison subtlety.
CREATE UNIQUE INDEX IF NOT EXISTS drive_reports_run_id_uniq
  ON public.drive_reports (run_id)
  WHERE run_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- APPEND-ONLY OBSERVATIONS — the boundary on the C4 ruling, enforced not documented.
--
-- The ruling that permits storing a value at all (coordinator 640f3ebc) covers OBSERVATIONS:
-- a number stamped generated_at with its citation and predicate attached is a measurement with
-- its instrument, not copied state. The ruling's stated boundary is that this holds ONLY while
-- the observation is append-only — "if any path UPDATES a stored observation in place, it stops
-- being an observation and becomes copied state again (the delta baseline silently rewrites)".
--
-- That boundary is load-bearing for section 5. Report-over-report deltas compare N against N+1;
-- if N can be edited afterwards, the baseline moves and a delta silently becomes meaningless
-- while continuing to render a number. Nothing above this line prevented that.
--
-- BUT THE ROW IS NOT WHOLLY IMMUTABLE, and that is the whole difficulty: consumption_receipts
-- MUST be writable, because C1 requires each consumer to stamp its OWN receipt after the fact.
-- So this is partial immutability — the observation fields freeze, the receipt field does not.
-- A blanket immutability trigger would have been simpler and would have broken C1.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drive_reports_freeze_observations()
RETURNS trigger
LANGUAGE plpgsql
AS $freeze$
BEGIN
  IF NEW.sections IS DISTINCT FROM OLD.sections THEN
    RAISE EXCEPTION 'drive_reports.sections is append-only: a stored observation that can be rewritten is copied state, and section-5 deltas silently lose their baseline (report id %)', OLD.id;
  END IF;
  IF NEW.drive_score IS DISTINCT FROM OLD.drive_score THEN
    RAISE EXCEPTION 'drive_reports.drive_score is append-only: rewriting a past score rewrites the trend it is measured against (report id %)', OLD.id;
  END IF;
  IF NEW.generated_at IS DISTINCT FROM OLD.generated_at THEN
    RAISE EXCEPTION 'drive_reports.generated_at is append-only: it is the observation timestamp, not a bookkeeping field (report id %)', OLD.id;
  END IF;
  -- run_id, because the unique index that prevents duplicate runs is PARTIAL (WHERE run_id IS
  -- NOT NULL). Setting run_id to NULL on an existing row moves it OUT of the index predicate and
  -- frees the key for re-insertion — re-opening the duplicate path, and with it the section-5
  -- corruption where a report is diffed against itself. Only service_role can do this, but
  -- service_role is exactly this trigger's threat model: every other frozen column above is
  -- protected from the same actor. A constraint that an UPDATE can step around is not one.
  IF NEW.run_id IS DISTINCT FROM OLD.run_id THEN
    RAISE EXCEPTION 'drive_reports.run_id is append-only: it is the idempotence key, and clearing it moves the row out of the partial unique index and frees the key for a duplicate (report id %)', OLD.id;
  END IF;
  -- consumption_receipts and metadata are DELIBERATELY writable. Receipts are stamped by each
  -- consumer after the producer is done (C1), so freezing them would break the requirement
  -- this table exists to serve.
  RETURN NEW;
END
$freeze$;

DROP TRIGGER IF EXISTS drive_reports_freeze_observations_trg ON public.drive_reports;
CREATE TRIGGER drive_reports_freeze_observations_trg
  BEFORE UPDATE ON public.drive_reports
  FOR EACH ROW EXECUTE FUNCTION public.drive_reports_freeze_observations();

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

  -- The idempotence guard has to be UNIQUE and it has to be PARTIAL. Asserted on both
  -- properties, because an index that exists under the right name while being neither would
  -- pass a name-only check and enforce nothing — and the failure it admits (a duplicate run)
  -- is invisible in the data: it looks exactly like a report showing no movement.
  ASSERT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.drive_reports'::regclass
      AND c.relname = 'drive_reports_run_id_uniq'
      AND i.indisunique
      AND i.indpred IS NOT NULL
  ), 'drive_reports: drive_reports_run_id_uniq is missing, not UNIQUE, or not partial — two rows for one run would be insertable, and section 5 would then diff a report against itself and report a stall that is not happening';

  -- The reclassification trigger, enforced rather than merely documented: if ANY role other than
  -- the owner and service_role holds ANY privilege on this table, the non-permission-class
  -- classification recorded on the SD is false and the deploy must fail loudly rather than ship a lie.
  --
  -- WIDENED from `grantee IN ('anon','authenticated')`. The coordinator ruling reclassifies on ANY
  -- NON-SERVICE GRANT, but the old assertion ENUMERATED TWO ROLES BY NAME — so `GRANT ... TO PUBLIC`,
  -- or a grant to any role invented later, walked straight past the one check enforcing the ruling's
  -- own condition. A tripwire narrower than the rule it guards reads as enforcement and isn't.
  -- Found by the SECURITY sub-agent, which correctly marked it INFERRED rather than measured.
  --
  -- MEASURED WHILE WIDENING, and it corrected my own first explanation: I assumed
  -- information_schema.role_table_grants could not see PUBLIC at all. It can — this database has 2
  -- such rows. So the defect was never the view's blindness; it was the literal two-role list. Worth
  -- stating because the wrong diagnosis would have suggested the wrong fix (swap the view) instead
  -- of the right one (stop naming roles).
  --
  -- Reads pg_class.relacl via aclexplode: the authoritative ACL, which represents PUBLIC explicitly
  -- as grantee OID 0 and enumerates EVERY grantee rather than the ones we thought to name.
  -- Deny-by-default — a role invented next year is caught by construction, not by amendment.
  -- Verified read-only before shipping: this predicate executes and correctly enumerates
  -- anon/authenticated/service_role on existing tables, and aclexplode does surface grantee=0.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public.drive_reports'::regclass
      AND a.grantee <> c.relowner                                            -- the owner is not a grant
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'drive_reports: a non-service grant exists (including PUBLIC) — this table is now PERMISSION-CLASS and requires chairman approval';

  -- COLUMN-LEVEL grants, which the table-level check above cannot see at all. pg_class.relacl
  -- holds only table grants; `GRANT SELECT (sections) ON drive_reports TO anon` lands in
  -- pg_attribute.attacl and leaves relacl untouched, so it walks past the tripwire exactly the
  -- way `GRANT ... TO PUBLIC` used to. Same defect, one level down: a check that reads one ACL
  -- catalogue and speaks for both.
  --
  -- RLS is still the real barrier, so this is not an exposure — it is the SD's own
  -- classification rule being enforced completely rather than partially. Raised by the SECURITY
  -- sub-agent as INFERRED (no live PG available to it); the DDL suite executes it for real.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_attribute at
    CROSS JOIN LATERAL aclexplode(at.attacl) a
    WHERE at.attrelid = 'public.drive_reports'::regclass
      AND at.attacl IS NOT NULL
      AND a.grantee <> (SELECT relowner FROM pg_class WHERE oid = 'public.drive_reports'::regclass)
      AND COALESCE(pg_get_userbyid(NULLIF(a.grantee, 0)), 'PUBLIC') <> 'service_role'
  ), 'drive_reports: a non-service COLUMN grant exists (including PUBLIC) — column grants live in pg_attribute.attacl and are invisible to the table-level ACL check; this table is now PERMISSION-CLASS and requires chairman approval';

  -- The append-only boundary on the C4 ruling. Without this trigger a stored observation is
  -- rewritable, which turns it back into copied state and silently moves the baseline every
  -- section-5 delta is measured against. Asserted here because the ruling explicitly asked
  -- for one assertion pinning it — a boundary that is only in a comment is not a boundary.
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.drive_reports'::regclass
      AND tgname = 'drive_reports_freeze_observations_trg'
      AND NOT tgisinternal
  ), 'drive_reports: the append-only trigger is missing — stored observations would be rewritable and section-5 deltas would lose their baseline';
END
$verify$;

-- Reload PostgREST schema cache so the new table is immediately visible.
NOTIFY pgrst, 'reload schema';
