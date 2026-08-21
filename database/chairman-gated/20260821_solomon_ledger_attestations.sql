-- SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-3/FR-4) -- Restore ceremony staging: decision_by
-- attestation table + the 2 tick-line-verified attestation rows, per RESTORE RULING A
-- (chairman_decisions id 00919a91-8ccf-4684-ba6e-e7af8fdb861a) for incident ba330d67.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: this file creates TRIGGERS
--   (append-only guard) and REVOKE/GRANT statements -- both land it in
--   scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2). Per LEAD-phase
--   VALIDATION evidence 42676f5d, the '@chairman-gated' tag itself is decorative (not
--   gate-checked) -- the ACTUAL enforced gate is the absence of a line matching
--   scripts/lib/migration-guards.js's APPROVED_BY_RE. This file deliberately supplies no such
--   line, so it cannot self-apply.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS, AND WHY decision_by IS NEVER REWRITTEN BY THIS FILE.
--
-- Incident ba330d67 (feedback row 14e36ad9): an unguarded one-off script's normalizeDecisionBy()
-- (scripts/coordinator-ack-adam.cjs:110-124) TRUNCATED 1212 rows' decision_by to their leading
-- identity-token prefix at 2026-08-21T14:06:00Z. The 40-char cap never fired (max surviving
-- length 13), so every surviving value is a byte-exact, unmodified PREFIX of its lost original --
-- the LOST data is the narrative tail, not the identity itself. The CURRENT decision_by value for
-- all 1212 rows is therefore already correct as an identity token; nothing needs restoring in
-- that column.
--
-- Of the 4 manifest-flagged rows (.artifacts/incident-damage-manifest-20260821.json), 2
-- (0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3, 922f8dfb-a548-49b4-869e-0f8c7b73fd73) are independently
-- corroborated by .claude/adam-session-state-08049808.md as genuinely processed by the named
-- decider on the damage date, BOTH at EXPLICIT tick-line strength (lines 294 and 341
-- respectively -- CORRECTED, EXEC-phase: an earlier draft claimed 0f9ffc05 was weaker/batch-only,
-- based on a grep pass that searched for the full UUID instead of the short 8-char id form the
-- log actually uses; see the row-level comment on the INSERT below for the corrected citation and
-- how the mistake was caught). This attestation is a DURABLE, AUDITABLE RECORD that independent
-- verification happened -- it is NOT a content restoration, because there is no lost value to
-- restore for these 2 rows.
--
-- The 2 remaining manifest rows (4ca4e7a2, 98c97aa1) are coordinator-asserted only, with NO
-- located tick-line evidence -- they are deliberately EXCLUDED from this file's INSERT and are
-- surfaced instead by scripts/one-off/stage-decision-restore-report.mjs as a chairman
-- accept/reject decision, never silently folded into the attestation set.
--
-- MODELLED ON: database/chairman-gated/20260817_venture_gate_attestations.sql (applied
-- 2026-08-18). Reproduces its load-bearing properties: append-only via BEFORE UPDATE/DELETE/
-- TRUNCATE triggers naming service_role as the threat model (RLS does not bind service_role --
-- rolbypassrls=true), judge<>judged (attested_by <> produced_by, case/whitespace-normalised),
-- a generic-actor denylist on both identity columns, non-null shaped citation, DB-clock
-- computed_at never writer-supplied, and a behavioural (not merely existential) DO $verify$
-- block. SIMPLIFIED from that precedent: single attestation kind (no check_type vocabulary,
-- since this table only ever records one thing), no subject_content_hash (decision_by for these
-- 2 rows is a stable historical fact attested once, not a recurring live artifact needing
-- staleness detection), no chairman-human-email requirement (this is a worker's evidentiary
-- cross-reference, not a chairman site review).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.solomon_ledger_attestations (
  id              BIGSERIAL PRIMARY KEY,

  ledger_row_id   UUID NOT NULL REFERENCES public.solomon_advice_outcome_ledger(id) ON DELETE CASCADE,

  incident_id     TEXT NOT NULL,

  -- WHO SIGNED vs WHO/WHAT MADE THE THING BEING SIGNED FOR (produced the current decision_by
  -- value being attested as correct). Same anti-rubber-stamp shape as the precedent.
  attested_by     TEXT NOT NULL,
  produced_by     TEXT NOT NULL,

  subject_ref     TEXT NOT NULL,

  -- NOT NULL, shaped, and DELIBERATELY WORDED DIFFERENTLY PER ROW where the evidence strength
  -- differs -- an identical citation string across rows of different evidentiary quality would
  -- paper over the exact asymmetry this SD exists to report honestly (LEAD-phase stories-agent
  -- finding).
  source_citation TEXT NOT NULL,

  findings        JSONB NOT NULL,

  -- NOT SUPPLIED BY THE WRITER -- see precedent's identical rationale (backdating).
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sla_incident_id_nonempty CHECK (btrim(incident_id) <> ''),
  CONSTRAINT sla_subject_ref_nonempty CHECK (btrim(subject_ref) <> ''),
  CONSTRAINT sla_findings_is_object CHECK (jsonb_typeof(findings) = 'object'),

  CONSTRAINT sla_source_citation_shape CHECK (
    btrim(source_citation) <> '' AND length(btrim(source_citation)) >= 20
  ),

  CONSTRAINT sla_attester_not_producer CHECK (
    lower(btrim(attested_by)) <> lower(btrim(produced_by))
  ),

  -- Denylist copied verbatim from database/chairman-gated/20260817_venture_gate_attestations.sql
  -- (vga_attested_by_is_identified / vga_produced_by_is_identified) -- same rationale, same
  -- normalisation (strip trailing digit/separator before matching so 'agent-01' still collides
  -- with 'agent').
  CONSTRAINT sla_attested_by_is_identified CHECK (
    btrim(attested_by) <> ''
    AND length(btrim(attested_by)) >= 3
    AND lower(regexp_replace(btrim(attested_by), '[-_. ]?[0-9]+$', '')) NOT IN (
      'system','systems','sys','worker','workers','agent','agents','subagent','sub_agent',
      'bot','robot','service','services','service_role','serviceaccount','svc',
      'admin','administrator','root','superuser','operator','automation','automated','auto',
      'ci','cd','cicd','pipeline','cron','job','task','runner','daemon','script','process',
      'machine','llm','ai','model','claude','gpt','openai','anthropic','eva','leo','orchestrator',
      'unknown','unspecified','undefined','none','null','nil','na','n/a','tbd','todo','pending',
      'test','tests','testing','tester','anonymous','anon','default','user','users','someone',
      'somebody','me','self','it','they','placeholder','xxx','foo','bar','temp','tmp'
    )
  ),

  CONSTRAINT sla_produced_by_is_identified CHECK (
    btrim(produced_by) <> ''
    AND length(btrim(produced_by)) >= 3
    AND lower(regexp_replace(btrim(produced_by), '[-_. ]?[0-9]+$', '')) NOT IN (
      'system','systems','sys','worker','workers','agent','agents','subagent','sub_agent',
      'bot','robot','service','services','service_role','serviceaccount','svc',
      'admin','administrator','root','superuser','operator','automation','automated','auto',
      'ci','cd','cicd','pipeline','cron','job','task','runner','daemon','script','process',
      'machine','llm','ai','model','claude','gpt','openai','anthropic','eva','leo','orchestrator',
      'unknown','unspecified','undefined','none','null','nil','na','n/a','tbd','todo','pending',
      'test','tests','testing','tester','anonymous','anon','default','user','users','someone',
      'somebody','me','self','it','they','placeholder','xxx','foo','bar','temp','tmp'
    )
  ),

  -- One attestation per ledger row per incident -- this file inserts each of the 2 rows exactly
  -- once; a re-run of this file (should the chairman re-apply after a partial failure) must not
  -- duplicate.
  CONSTRAINT sla_one_attestation_per_row_per_incident UNIQUE (ledger_row_id, incident_id)
);

CREATE INDEX IF NOT EXISTS solomon_ledger_attestations_ledger_row_idx
  ON public.solomon_ledger_attestations (ledger_row_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- APPEND-ONLY. Triggers, not RLS -- service_role bypasses RLS (rolbypassrls=true, measured this
-- session against this same database) and is the role every writer here runs as.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solomon_ledger_attestations_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  RAISE EXCEPTION
    'solomon_ledger_attestations is append-only: row % (ledger_row %) cannot be modified after insert. Re-attesting means recording a NEW row, so what was attested, by whom, and against which citation all survive.',
    OLD.id, OLD.ledger_row_id;
END
$freeze$;

DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_update ON public.solomon_ledger_attestations;
CREATE TRIGGER solomon_ledger_attestations_no_update
  BEFORE UPDATE ON public.solomon_ledger_attestations
  FOR EACH ROW EXECUTE FUNCTION public.solomon_ledger_attestations_freeze();

CREATE OR REPLACE FUNCTION public.solomon_ledger_attestations_no_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $nodelete$
BEGIN
  RAISE EXCEPTION
    'solomon_ledger_attestations is append-only: row % (ledger_row %) cannot be deleted. Without this guard, delete-and-reinsert bypasses the update freeze completely.',
    OLD.id, OLD.ledger_row_id;
END
$nodelete$;

DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_delete_trg ON public.solomon_ledger_attestations;
CREATE TRIGGER solomon_ledger_attestations_no_delete_trg
  BEFORE DELETE ON public.solomon_ledger_attestations
  FOR EACH ROW EXECUTE FUNCTION public.solomon_ledger_attestations_no_delete();

-- Row-level triggers do NOT fire for TRUNCATE -- only a statement-level trigger can intercept it.
CREATE OR REPLACE FUNCTION public.solomon_ledger_attestations_no_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $notrunc$
BEGIN
  RAISE EXCEPTION 'solomon_ledger_attestations is append-only: TRUNCATE is not permitted. It would erase the entire attestation history with no row-level trigger able to observe it.';
END
$notrunc$;

DROP TRIGGER IF EXISTS solomon_ledger_attestations_no_truncate_trg ON public.solomon_ledger_attestations;
CREATE TRIGGER solomon_ledger_attestations_no_truncate_trg
  BEFORE TRUNCATE ON public.solomon_ledger_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION public.solomon_ledger_attestations_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. pg_default_acl grants anon/authenticated arwdDxtm on every new public-schema table by
-- default -- RLS-with-no-policy blocks rows, but the grant itself still exists until revoked.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.solomon_ledger_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solomon_ledger_attestations_service_role ON public.solomon_ledger_attestations;
CREATE POLICY solomon_ledger_attestations_service_role
  ON public.solomon_ledger_attestations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.solomon_ledger_attestations FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SEQUENCE public.solomon_ledger_attestations_id_seq FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.solomon_ledger_attestations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.solomon_ledger_attestations_id_seq TO service_role;

COMMENT ON TABLE public.solomon_ledger_attestations IS
  'SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-3/FR-4). Append-only durable record that independent '
  'verification happened for a solomon_advice_outcome_ledger row''s decision_by, per RESTORE '
  'RULING A (chairman_decisions 00919a91) for incident ba330d67. NEVER a decision_by rewrite -- '
  'the attested rows'' current decision_by is already correct (only the narrative tail was lost, '
  'not the identity prefix). Service-role only.';

COMMENT ON COLUMN public.solomon_ledger_attestations.source_citation IS
  'Worded per-row to reflect the ACTUAL evidence strength -- never a boilerplate string identical '
  'across rows of different evidentiary quality (LEAD-phase stories-agent finding).';

COMMENT ON COLUMN public.solomon_ledger_attestations.computed_at IS
  'DB clock. Never writer-supplied -- a writer that supplies its own timestamp can backdate an '
  'attestation.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FR-4: the 2 tick-line-verified attestation rows. decision_by is NOT touched -- it is already
-- correct for both. Values verified live this session (2026-08-21): both rows' current
-- decision_by = 'adam-08049808'.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.solomon_ledger_attestations
  (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
VALUES
  (
    '922f8dfb-a548-49b4-869e-0f8c7b73fd73',
    'ba330d67',
    'golf-8',
    'incident-ba330d67-damage-manifest',
    'solomon_advice_outcome_ledger.decision_by',
    'EXPLICIT tick-line match: .claude/adam-session-state-08049808.md:294 reads "Ledger row 922f8dfb deferred (0 aged pending)" -- the row id appears verbatim in Adam''s contemporaneous session log, dated the same DEFICIT-URGENT tick (2026-08-21 13:32Z) as the incident''s damage window. decision_by=''adam-08049808'' independently confirmed correct.',
    jsonb_build_object(
      'manifest_recoverable', 'yes',
      'manifest_recovery_source', 'adam-session-state-08049808.md tick 21st 13:32Z',
      'manifest_recovery_note', 'deferred (0 aged pending) -- explicit tick-line match',
      'current_decision_by', 'adam-08049808',
      'verification_method', 'literal row-id string match against session-state log'
    )
  ),
  (
    '0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3',
    'ba330d67',
    'golf-8',
    'incident-ba330d67-damage-manifest',
    'solomon_advice_outcome_ledger.decision_by',
    -- CORRECTED (EXEC-phase, harness self-test): an earlier draft of this citation claimed only
    -- batch-membership corroboration for this row (weaker than 922f8dfb's), based on a manual
    -- grep pass that searched for the FULL UUID rather than the SHORT 8-char id form the log
    -- actually uses -- the exact same class of bug the harness itself (stage-decision-restore-
    -- report.mjs) initially had and self-caught on its own first live run. Once the harness
    -- correctly matched on the short id, EXPLICIT tick-line evidence surfaced at BOTH 294 AND 341.
    'EXPLICIT tick-line match: .claude/adam-session-state-08049808.md:341 reads "supplied the verbatim constant for my 2 pre-14:06Z rows (922f8dfb, 0f9ffc05 -- the standard defer string, no caveat suffix, defer_trigger constant too); other 2 = coordinator-named" -- a SECOND, independent, explicit-id citation confirming this row alongside 922f8dfb, and distinguishing both from the 2 unverified rows (4ca4e7a2, 98c97aa1) in the SAME sentence. decision_by=''adam-08049808'' independently confirmed correct at the SAME evidentiary tier as 922f8dfb, not a weaker one.',
    jsonb_build_object(
      'manifest_recoverable', 'yes',
      'manifest_recovery_source', 'adam-session-state-08049808.md tick 21st 13:32Z',
      'manifest_recovery_note', 'deferred (0 aged pending) -- part of the DEFICIT-URGENT tick batch',
      'current_decision_by', 'adam-08049808',
      'verification_method', 'literal short-id string match (line 341), corrected from an earlier full-UUID grep miss'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Behavioural proof, not merely existential -- each guard attempt runs inside this DO
-- block's implicit subtransaction so nothing survives whether it passes or fails, and the table
-- is append-only so a row that DID land could never be cleaned up otherwise.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  truncate_was_blocked boolean := false;
  v_count int;
BEGIN
  ASSERT to_regclass('public.solomon_ledger_attestations') IS NOT NULL,
    'solomon_ledger_attestations table did not land';

  SELECT count(*) INTO v_count FROM public.solomon_ledger_attestations
    WHERE incident_id = 'ba330d67';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: expected exactly 2 rows for incident ba330d67 after apply, found %. The 2 unverified manifest rows (4ca4e7a2, 98c97aa1) must never be silently included.', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.solomon_ledger_attestations
    WHERE incident_id = 'ba330d67'
      AND ledger_row_id IN ('4ca4e7a2-50bd-4d39-bd0f-cb9c822cb47d', '98c97aa1-edd0-462c-a39d-032edd22d6c8')
  ) THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: an unverified manifest row (4ca4e7a2 or 98c97aa1) was attested -- this must never happen, these 2 rows have no located tick-line evidence.';
  END IF;

  -- Existential checks for the UPDATE/DELETE guards (matching the precedent's own restraint):
  -- a BEHAVIOURAL test here would need a boolean-flag pattern to distinguish "the trigger's own
  -- RAISE EXCEPTION fired" from "our own GUARD-DID-NOT-FIRE RAISE EXCEPTION fired", since both
  -- use the SAME generic raise_exception SQLSTATE (P0001) -- a bare `WHEN raise_exception THEN
  -- NULL` handler would silently swallow a genuine guard failure along with the expected
  -- rejection. TRUNCATE below uses the boolean-flag pattern correctly for exactly this reason;
  -- UPDATE/DELETE use the cheaper, still-meaningful existential form instead of risking the same
  -- trap twice.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.solomon_ledger_attestations'::regclass
                 AND tgname='solomon_ledger_attestations_no_update' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: the append-only UPDATE freeze did not land -- an attestation is editable and therefore fakeable';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.solomon_ledger_attestations'::regclass
                 AND tgname='solomon_ledger_attestations_no_delete_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: the append-only DELETE guard did not land -- delete-and-reinsert bypasses the update freeze completely';
  END IF;

  -- TRUNCATE gets the BEHAVIOURAL (not merely existential) test, via the boolean-flag pattern:
  -- row-level triggers don't fire for TRUNCATE at all, so an existential pg_trigger check on the
  -- STATEMENT-level trigger proves less about whether TRUNCATE is actually rejected than it does
  -- for UPDATE/DELETE -- worth the extra care to prove it fires, not just that it exists.
  BEGIN
    EXECUTE 'TRUNCATE public.solomon_ledger_attestations';
  EXCEPTION
    WHEN raise_exception THEN truncate_was_blocked := true;
  END;
  IF NOT truncate_was_blocked THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: GUARD DID NOT FIRE -- TRUNCATE succeeded. The append-only guarantee is decorative; refusing to deploy.';
  END IF;

  BEGIN
    INSERT INTO public.solomon_ledger_attestations
      (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
    VALUES
      ('922f8dfb-a548-49b4-869e-0f8c7b73fd73', 'probe-verify', 'system', 'probe-producer',
       'probe://verify', 'probe: generic-actor guard must reject attested_by=system, twenty chars', '{}'::jsonb);
    RAISE EXCEPTION 'solomon_ledger_attestations: GUARD DID NOT FIRE -- attested_by=''system'' was ACCEPTED.';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.solomon_ledger_attestations
      (ledger_row_id, incident_id, attested_by, produced_by, subject_ref, source_citation, findings)
    VALUES
      ('922f8dfb-a548-49b4-869e-0f8c7b73fd73', 'probe-verify', 'golf-8', 'Golf-8 ',
       'probe://verify', 'probe: judge-not-producer guard must reject case/whitespace evasion', '{}'::jsonb);
    RAISE EXCEPTION 'solomon_ledger_attestations: GUARD DID NOT FIRE -- a self-judged row (attester = producer, differing only in case/whitespace) was ACCEPTED.';
  EXCEPTION
    WHEN check_violation THEN NULL; -- expected
  END;

  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='solomon_ledger_attestations'
               AND grantee IN ('anon','authenticated','PUBLIC')) THEN
    RAISE EXCEPTION 'solomon_ledger_attestations: a non-service grant is present -- this table must not be reachable by anon or authenticated.';
  END IF;

  RAISE NOTICE 'solomon_ledger_attestations verified: table + triggers + posture + 2-row attestation all present and correct';
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK -- see 20260821_solomon_ledger_attestations_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT worker/Adam-delegatable -- it creates triggers +
-- REVOKE/GRANT):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260821_solomon_ledger_attestations.sql" \
--     --prod-deploy --allow-any-path
--
-- VERIFY (run after apply):
--   SELECT count(*) FROM solomon_ledger_attestations WHERE incident_id = 'ba330d67'; -- expect 2
--   SELECT ledger_row_id, source_citation FROM solomon_ledger_attestations WHERE incident_id = 'ba330d67';
-- ============================================================================
