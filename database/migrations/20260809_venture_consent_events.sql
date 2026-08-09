-- SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 — FR-7.
--
-- THIS CREATES, IT DOES NOT EXTEND. campaign_enrollments has NO consent column at all — no opt-in
-- timestamp, no provenance. It has only `status`, a MUTABLE field whose CHECK vocabulary includes
-- 'unsubscribed'. That field is exactly what this migration abolishes as a source of truth:
--   * it is SETTABLE — any writer can flip 'unsubscribed' back to 'active', and nothing records
--     that it happened or who did it;
--   * it conflates ENROLLMENT LIFECYCLE (active/paused/completed) with PERMISSION, so a
--     bookkeeping update and a consent revocation are the same write;
--   * it is read from a CACHED enrollment record at send time (email-campaigns.js processStep
--     checks `enrollment.status`, on the object its caller loaded), so an opt-out arriving between
--     load and send is invisible — the enroll-to-send gap.
-- 031_gdpr_compliance_tables.sql:11 defines user_consent_records, but that migration WAS NEVER
-- APPLIED, so there is nothing live to extend either.
--
-- THE SHAPE: consent is an EVENT LOG, and permission is DERIVED from it — "the most recent event
-- for this recipient is an opt_in" — never stored as a flag. A derived permission cannot be set;
-- it can only be changed by recording another event, which leaves the previous one intact and
-- readable. That is what makes a fabricated consent record expensive instead of free.
--
-- ONE SUPPRESSION SURFACE. This does NOT stand up a second suppression store alongside the
-- campaign_enrollments status field — it SUBSUMES it. A correction that lands on one surface while
-- another keeps serving stale is the failure this ordering avoids.

CREATE TABLE IF NOT EXISTS public.venture_consent_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id     UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,

  -- The recipient this consent is ABOUT. Stored lowercased-and-trimmed by the writer; the
  -- constraint below refuses anything else, so two spellings of one address cannot disagree about
  -- whether that person consented.
  recipient_email TEXT NOT NULL,

  -- Closed vocabulary. An open TEXT column would let a third value appear that no read site
  -- handles, and the read site here decides whether a human gets emailed.
  event_type     TEXT NOT NULL CHECK (event_type IN ('opt_in', 'opt_out')),

  -- NOT NULL, and it is the point of the table. "Someone consented" is not a fact; "this form on
  -- this page at this time" is. A consent record with no provenance is indistinguishable from one
  -- that was invented, which is the whole failure mode FR-7 exists to close.
  provenance     TEXT NOT NULL,

  -- Optional pointer to the artifact (form submission id, webhook event id, unsubscribe token).
  source_ref     TEXT,

  -- NOT SUPPLIED BY THE WRITER. Ordering decides permission here — the LATEST event wins — so a
  -- writer that stamps its own time could backdate an opt_in to outrank a later opt_out and
  -- resurrect a recipient who unsubscribed. The database clock is single-sourced.
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT venture_consent_events_provenance_nonempty
    CHECK (btrim(provenance) <> ''),
  CONSTRAINT venture_consent_events_email_normalized
    CHECK (recipient_email = lower(btrim(recipient_email)) AND recipient_email <> '')
);

-- The send-time question is "latest event for this venture+recipient", asked on every send.
CREATE INDEX IF NOT EXISTS venture_consent_events_lookup_idx
  ON public.venture_consent_events (venture_id, recipient_email, occurred_at DESC);

-- APPEND-ONLY, same rationale as venture_demand_verdicts and the same threat model: service_role
-- is what every writer here runs as, so guards that only bind anon/authenticated bind nobody.
-- Consent history is the evidence that a send was lawful; an editable history is not evidence.
CREATE OR REPLACE FUNCTION public.venture_consent_events_freeze()
RETURNS TRIGGER LANGUAGE plpgsql AS $freeze$
BEGIN
  RAISE EXCEPTION
    'venture_consent_events is append-only: consent event % cannot be modified. Withdrawing or re-granting consent means RECORDING A NEW EVENT, so the history of what the recipient actually did survives.',
    OLD.id;
END
$freeze$;

DROP TRIGGER IF EXISTS venture_consent_events_no_update ON public.venture_consent_events;
CREATE TRIGGER venture_consent_events_no_update
  BEFORE UPDATE ON public.venture_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.venture_consent_events_freeze();

CREATE OR REPLACE FUNCTION public.venture_consent_events_no_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'venture_consent_events is append-only: consent event % cannot be deleted. Deleting an opt_out would silently restore permission — the precise harm this table exists to prevent.',
    OLD.id;
END
$nodelete$;

DROP TRIGGER IF EXISTS venture_consent_events_no_delete_trg ON public.venture_consent_events;
CREATE TRIGGER venture_consent_events_no_delete_trg
  BEFORE DELETE ON public.venture_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.venture_consent_events_no_delete();

ALTER TABLE public.venture_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_consent_events_service_role ON public.venture_consent_events;
CREATE POLICY venture_consent_events_service_role
  ON public.venture_consent_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- This table holds recipient email addresses — PII. A non-service grant here is a disclosure, not
-- merely an untidy permission.
REVOKE ALL ON public.venture_consent_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.venture_consent_events TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE LINK. Enforced BY TRIGGER FOR NEW ROWS ONLY, deliberately, rather than as a NOT NULL column.
--
-- campaign_enrollments holds live rows (2 at authoring, both integration-test addresses at
-- example.com). A NOT NULL column would demand a backfill, and the only way to backfill a consent
-- reference is to CREATE CONSENT EVENTS FOR PEOPLE WHO NEVER GAVE CONSENT. That is precisely the
-- fabrication this SD exists to abolish, and doing it inside the migration that abolishes it would
-- be the purest form of the defect.
--
-- So: pre-existing rows are GRANDFATHERED and readable, but they carry no consent reference, and
-- the send path refuses a send without one. They are un-sendable by construction rather than
-- retroactively legitimised.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.campaign_enrollments
  ADD COLUMN IF NOT EXISTS consent_event_id UUID REFERENCES public.venture_consent_events(id);

CREATE OR REPLACE FUNCTION public.campaign_enrollments_requires_consent()
RETURNS TRIGGER LANGUAGE plpgsql AS $requires_consent$
BEGIN
  IF NEW.consent_event_id IS NULL THEN
    RAISE EXCEPTION
      'campaign_enrollment for % refused: consent_event_id is required. Enrollment must reference a REAL captured opt-in in venture_consent_events — the mutable status field is no longer a source of permission.',
      NEW.lead_email
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.venture_consent_events c
    WHERE c.id = NEW.consent_event_id
      AND c.event_type = 'opt_in'
      AND c.venture_id = NEW.venture_id
      AND c.recipient_email = lower(btrim(NEW.lead_email))
  ) THEN
    RAISE EXCEPTION
      'campaign_enrollment for % refused: consent_event_id % does not resolve to an opt_in for THIS venture and THIS recipient. A witness that merely exists is not a witness to the right thing.',
      NEW.lead_email, NEW.consent_event_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$requires_consent$;

-- INSERT only. An UPDATE trigger would make the grandfathered rows unmaintainable (any
-- bookkeeping update would raise), and those rows are already un-sendable at the send path, which
-- is where the harm actually lives.
DROP TRIGGER IF EXISTS campaign_enrollments_requires_consent_trg ON public.campaign_enrollments;
CREATE TRIGGER campaign_enrollments_requires_consent_trg
  BEFORE INSERT ON public.campaign_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.campaign_enrollments_requires_consent();

DO $verify$
DECLARE
  bad text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.venture_consent_events'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%event_type = ANY%'
  ) THEN
    RAISE EXCEPTION 'venture_consent_events: the CHECK on event_type did not land — an unhandled third value could reach the read site that decides whether a human gets emailed';
  END IF;

  FOR bad IN
    SELECT t FROM unnest(ARRAY['venture_consent_events_no_update', 'venture_consent_events_no_delete_trg']) AS t
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.venture_consent_events'::regclass
        AND tgname = t AND NOT tgisinternal
    )
  LOOP
    RAISE EXCEPTION 'venture_consent_events: append-only guard % did not land — consent history is editable and therefore is not evidence', bad;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.campaign_enrollments'::regclass
      AND tgname = 'campaign_enrollments_requires_consent_trg' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'campaign_enrollments: the consent-required trigger did not land — new enrollments can still be created with no captured opt-in';
  END IF;

  -- PII table: assert the posture directly rather than trusting that REVOKE ran.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'venture_consent_events'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'venture_consent_events: a non-service grant is present on a table of recipient email addresses — that is a disclosure, not an untidy permission';
  END IF;
END
$verify$;

COMMENT ON TABLE public.venture_consent_events IS
  'SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-7: append-only opt_in/opt_out event log. Permission is DERIVED (latest event wins) and never stored as a settable flag. Subsumes the campaign_enrollments.status field as the source of suppression truth.';
