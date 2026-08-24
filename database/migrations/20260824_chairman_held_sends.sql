-- SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1) — durable hold-and-release lane for chairman-
-- targeted decision sends that the pre-send Solomon consult could not verdict in-call.
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   The REVOKE/GRANT statements below are required posture, not optional hardening — pg_default_acl
--   in this database grants `arwdDxtm` to anon AND authenticated on EVERY new relation, and `X` on
--   every new function (MEASURED 2026-08-24: defaclacl
--   `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,...}`).
--   A bare CREATE TABLE here would hand anon full DML on the chairman control surface. REVOKE/GRANT
--   top-level puts this file in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set,
--   making it TIER-2 and requiring the 3-factor chairman gate (`--prod-deploy` + single-use 1h token
--   + an `@approved-by` header matching `git config user.email`). The builder holds none of those and
--   MUST NOT forge the attestation. The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260824_chairman_held_sends.sql --prod-deploy
--   APPLY IS NOT MINE.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT — apply-migration.js already wraps the file (scripts/apply-migration.js:341/430).
-- ⚠ DO NOT run with --split-statements: the named dollar-quoted DO/function blocks ($chs_*$) are only
--   safe on the DEFAULT single-query path; splitPostgreSQLStatements recognizes bare $$ but not $tag$.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY A NEW TABLE AND NOT A 'held' STATUS ON sms_outbound_obligations.
--
-- The obvious reuse — widen sms_outbound_obligations_status_check to admit 'held' — was evaluated and
-- REJECTED on three measured grounds:
--
--  1. THE HOLD WOULD BE ONE PREDICATE EDIT AWAY FROM BEING SENT. lib/chairman/sms-outbound-worker.js
--     claims with `.eq('status','owed')` and NO kind filter (:584), served by the partial index
--     idx_sms_outbound_obligations_claimable WHERE status='owed'. A 'held' value is safe there only
--     for as long as EVERY status-touching pass in that worker continues to not name it — and there
--     are at least six (void/collapse :263-350, claim :584, quiet-window re-arm :186, escalate :207,
--     'sending' reaper :441-456, provider-check :480-540). That is fail-OPEN by default: any future
--     sweep widened to `status IN ('owed','held')`, or any age-based "stuck row" reaper, silently
--     converts a fail-closed hold into an unconsulted send on the chairman control surface. The
--     entire value of this row is that it CANNOT be sent; it must not live in the table whose
--     drain-worker's job is to send everything it finds.
--
--  2. not_before IS NOT A SUBSTITUTE. A hold expressed as a future not_before is fail-open BY
--     CONSTRUCTION — the row becomes claimable when the clock passes, regardless of whether Solomon
--     ever answered. It also stays status='owed' and therefore remains visible to Pass-1's
--     void/collapse logic (:263-350), which can rewrite or void it out from under the hold.
--
--  3. THE COLUMN SET WOULD MISREPORT WHAT IT HOLDS. sms_outbound_obligations carries no
--     chairman_user_id, subject, options, or consult correlation — ≥6 columns meaningless to the
--     other ~20 `kind` values would have to be bolted on. And the lifecycles differ: an obligation is
--     "we owe a send"; this row is "we owe a DECISION about whether to send". Different terminal
--     states, different reconciliation key. Same argument 20260821_eva_scheduler_queue_status_add_cancelled.sql
--     made for minting 'cancelled' rather than overloading 'completed'.
--
-- BLAST RADIUS. A new table touches zero live rows and zero live predicates. The rejected
-- alternative would take ACCESS EXCLUSIVE on the 1000-row table the chairman's entire outbound lane
-- drains through (MEASURED 2026-08-24: 1000 rows — delivered 965 / sent 28 / failed 6 / canceled 1;
-- ZERO in 'owed' and ZERO with a future not_before, i.e. the drain keeps up and an injected row is
-- claimed promptly).
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THERE IS NO `token` / `sms_reply_token_expires_at` COLUMN HERE. THIS IS THE LOAD-BEARING PART.
--
-- The hold in lib/comms/adam-outbound/chairman-sms-gate/index.js returns at :432, BEFORE decision
-- staging at :456. The naive fix — stage the decision at hold time so the packet is durable — would
-- mint a LIVE sms_reply_token for a message that has not been sent and may never be sent, reopening
-- the exact defect SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 exists to prevent (sms-bridge.js:
-- "a message that never sent should not receive a live reply token").
--
-- So this table carries the MATERIALS to stage, never the staging itself. stageDecisionSmsNotification
-- — which mints the token, writes chairman_notifications, and patches
-- chairman_decisions.{sms_reply_token, sms_reply_token_expires_at, brief_data.sms_options} — is called
-- ONCE, on the RELEASE path, in the existing stage→dispatch→confirm/rollback order. The hold captures;
-- the release stages. `hold_expires_at` below is a DIFFERENT clock (how long we keep holding) and is
-- named so it cannot be collapsed with the reply-token TTL.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CODE PREREQUISITE THIS SCHEMA CANNOT SUPPLY, STATED SO NOBODY READS THE TABLE AS SUFFICIENT.
--
-- lib/adam/should-consult-solomon.js performBoundedConsult() computes `correlationId` (:340) and then
-- DROPS IT on the chairman arm: the hold-and-surface return (:365-371) carries only
-- {action, degraded, consequence, reason} — no correlationId — while the proceed arm (:415) does
-- carry it. The session_coordination consult row IS inserted (consult() ran and resolved
-- {correlationId, pending:true} before the hold branch), so the anchor EXISTS in the database; it is
-- simply never handed back to the caller. Without a one-line fix adding
-- `...(correlationId ? { correlationId } : {})` to the hold return, every row in this table would be
-- born with consult_correlation_id = NULL and be UNRECONCILABLE BY CONSTRUCTION — a table that reads
-- as wired while yielding nothing. consult_correlation_id is nullable only because the
-- consult-threw/timed-out path genuinely has no id, and losing the chairman's message would be worse
-- than storing an honest un-releasable row; v_chairman_held_sends_unreconcilable below makes those
-- rows LOUD rather than silently stuck.
--
-- RECONCILIATION CONTRACT (reuses lib/coordinator/reply-class.cjs — no new verdict lookup):
--   resolveAnswerRows(supabase, [consult_correlation_id, ...]) -> Map<correlation_id, answerPayload>,
--   matching session_coordination rows on payload->>reply_to with payload->>kind = ADAM_ADVISORY.
--   reconcileLateVerdicts' own candidate window is RECONCILE_HORIZON_MS = 24h (reply-class.cjs:25),
--   which is why hold_expires_at defaults to 24h: a held row whose consult row has aged out of the
--   reconciler's horizon is never releasable, and the two clocks must not drift apart silently.
--   MEASURED 2026-08-24: 27 pre_send consult rows exist, 6 unreconciled, newest 20:32Z — the lane is live.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1) The held-send lane.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chairman_held_sends (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Reconciliation anchor (joins to session_coordination via reply-class.cjs resolveAnswerRows).
  -- Deliberately NOT a foreign key: session_coordination has no reaper (4670 rows, 3379 already past
  -- expires_at — measured in reply-class.cjs:352), and an FK would add a lock dependency on a table
  -- this lane must never be able to block.
  consult_correlation_id        uuid UNIQUE,
  consult_row_id                uuid,

  -- ── Chairman identity. TEXT (not uuid) to match chairman_notifications.chairman_user_id's live
  -- type EXACTLY — that column is text NOT NULL, and a type mismatch here would surface only at
  -- release time, i.e. at the worst possible moment. Resolved via fn_resolve_chairman_user_id()
  -- below; see the identity note at the bottom of this file for why env-only was insufficient.
  chairman_user_id              text NOT NULL,
  chairman_email                text NOT NULL,
  recipient_phone               text,

  -- ── The decision packet (B-3: none of this can live on sms_outbound_obligations).
  decision_id                   uuid,
  subject                       text NOT NULL,
  body                          text NOT NULL,
  -- MUST be a JSON array, never an object. extractOptionLabels() returns string[], and
  -- updateChairmanDecisionSmsFields writes it verbatim to brief_data.sms_options. The object-vs-array
  -- ambiguity is a repeat defect class (SD-VWC-PRESETS-001), so it is closed by CHECK, not by comment.
  options                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  consequence_level             text,
  message_kind                  text,
  sender_callsign               text,
  session_id                    text,

  -- ── Hold lifecycle.
  status                        text NOT NULL DEFAULT 'held',
  hold_reason                   text NOT NULL,
  held_at                       timestamptz NOT NULL DEFAULT now(),
  -- NOT the reply-token TTL. See the header. Aligned to reply-class.cjs RECONCILE_HORIZON_MS (24h).
  hold_expires_at               timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),

  -- ── Release, with a CITED verdict (never prose, never an unsourced boolean).
  released_at                   timestamptz,
  release_disposition           text,
  release_verdict               text,
  release_verdict_answer_row_id uuid,
  released_send_result          jsonb,

  -- ── Optimistic claim, mirroring sms_outbound_obligations' proven shape:
  --    UPDATE ... SET status='releasing', claimed_at=now() WHERE id=? AND status='held' AND claimed_at IS NULL
  claimed_at                    timestamptz,
  claimed_by                    text,
  attempts                      integer NOT NULL DEFAULT 0,
  last_error                    text,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  metadata                      jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.chairman_held_sends IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1) — durable hold lane for chairman-targeted decision sends held by the pre-send Solomon consult gate (lib/adam/should-consult-solomon.js hold-and-surface arm). Written by lib/comms/adam-outbound/chairman-sms-gate/index.js at hold time; released by a sweep that reconciles consult_correlation_id against Solomon verdicts using lib/coordinator/reply-class.cjs resolveAnswerRows(). Carries the MATERIALS to stage a decision SMS but never the reply token itself — stageDecisionSmsNotification runs on the RELEASE path only, so a message that never sent never receives a live reply token (SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001). Service-role only.';

COMMENT ON COLUMN public.chairman_held_sends.consult_correlation_id IS
  'session_coordination payload.correlation_id of the pre-send consult. THE reconciliation anchor. NULL only when performBoundedConsult reached the hold arm without an envelope (consult threw/timed out before insertCoordinationRow) — such rows are un-releasable and surface in v_chairman_held_sends_unreconcilable.';
COMMENT ON COLUMN public.chairman_held_sends.hold_expires_at IS
  'How long we keep HOLDING. NOT the SMS reply-token TTL (that is chairman_decisions.sms_reply_token_expires_at, minted at release). Defaulted to 24h to match reply-class.cjs RECONCILE_HORIZON_MS — past it the consult row has aged out of the reconciler window and the hold can never be resolved.';
COMMENT ON COLUMN public.chairman_held_sends.release_verdict_answer_row_id IS
  'session_coordination.id of the ANSWERING row that released this hold. Required for status=released by CHECK — a release must cite the row that caused it, so "released" can never be asserted without the evidence that justifies it.';
COMMENT ON COLUMN public.chairman_held_sends.options IS
  'string[] from extractOptionLabels(). CHECK-enforced to be a JSON ARRAY (not an object) because it is written verbatim to chairman_decisions.brief_data.sms_options at release.';

-- ---------------------------------------------------------------------------
-- 2) Constraints. Declared standalone (not inline) so a partial apply or a manual DROP CONSTRAINT
--    can be repaired by re-running this file — matching worker_wind_down_events.sql's convention.
-- ---------------------------------------------------------------------------
DO $chs_constraints$
DECLARE
  v_name text;
  v_defs text[][] := ARRAY[
    ['chairman_held_sends_status_check',
     $c$CHECK (status IN ('held','releasing','released','suppressed','abandoned','expired','unreconcilable'))$c$],
    ['chairman_held_sends_options_is_array_check',
     $c$CHECK (jsonb_typeof(options) = 'array')$c$],
    ['chairman_held_sends_metadata_is_object_check',
     $c$CHECK (jsonb_typeof(metadata) = 'object')$c$],
    -- Mirrors chairman_decisions_consequence_level_check verbatim so the two vocabularies cannot drift.
    ['chairman_held_sends_consequence_level_check',
     $c$CHECK (consequence_level IS NULL OR consequence_level IN ('low','medium','high'))$c$],
    ['chairman_held_sends_release_disposition_check',
     $c$CHECK (release_disposition IS NULL OR release_disposition IN ('send','suppress','amend'))$c$],
    -- HONESTY CONSTRAINT. A row cannot claim to be released without a timestamp, a disposition, AND a
    -- citation of the answering session_coordination row. This is what makes "released" un-fakeable
    -- by a buggy sweep: the DB refuses the write rather than trusting the writer's prose.
    ['chairman_held_sends_released_requires_citation_check',
     $c$CHECK (status <> 'released' OR (released_at IS NOT NULL AND release_disposition IS NOT NULL AND release_verdict_answer_row_id IS NOT NULL))$c$],
    -- Symmetrically: a suppressed row must also say what suppressed it.
    ['chairman_held_sends_suppressed_requires_citation_check',
     $c$CHECK (status <> 'suppressed' OR (released_at IS NOT NULL AND release_verdict_answer_row_id IS NOT NULL))$c$],
    -- A row that never left the hold must not carry release residue.
    ['chairman_held_sends_unreleased_is_clean_check',
     $c$CHECK (status NOT IN ('held','releasing') OR (released_at IS NULL AND release_disposition IS NULL))$c$]
  ];
BEGIN
  FOR i IN 1 .. array_length(v_defs, 1) LOOP
    v_name := v_defs[i][1];
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.chairman_held_sends'::regclass AND conname = v_name
    ) THEN
      EXECUTE format('ALTER TABLE public.chairman_held_sends ADD CONSTRAINT %I %s', v_name, v_defs[i][2]);
    END IF;
  END LOOP;
END
$chs_constraints$;

-- ---------------------------------------------------------------------------
-- 3) Indexes. The claimable index mirrors idx_sms_outbound_obligations_claimable's proven partial
--    shape — the sweep only ever scans rows still on hold.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS chairman_held_sends_claimable_idx
  ON public.chairman_held_sends (held_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS chairman_held_sends_decision_id_idx
  ON public.chairman_held_sends (decision_id) WHERE decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chairman_held_sends_created_at_idx
  ON public.chairman_held_sends (created_at);

-- ---------------------------------------------------------------------------
-- 4) updated_at. Reuses the existing canonical public.update_updated_at_column() rather than minting
--    an 84th variant (83 *_updated_at functions already exist — measured 2026-08-24). Guarded so this
--    file still applies cleanly if that function is ever renamed.
-- ---------------------------------------------------------------------------
DO $chs_touch$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS chairman_held_sends_touch_updated_at ON public.chairman_held_sends;
    CREATE TRIGGER chairman_held_sends_touch_updated_at
      BEFORE UPDATE ON public.chairman_held_sends
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  ELSE
    RAISE WARNING 'public.update_updated_at_column() not found — chairman_held_sends.updated_at will NOT auto-touch; the writer must set it explicitly';
  END IF;
END
$chs_touch$;

-- ---------------------------------------------------------------------------
-- 5) Posture: service-role only. ASSERTED, never inherited — see the header on pg_default_acl.
--    (Cautionary live example: sms_outbound_obligations has RLS enabled with a service_role-only
--    policy, yet anon AND authenticated still hold all 7 table-level privileges — measured
--    2026-08-24. RLS saves it; the REVOKE was never done. This table does BOTH.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.chairman_held_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chairman_held_sends_service_role ON public.chairman_held_sends;
CREATE POLICY chairman_held_sends_service_role
  ON public.chairman_held_sends
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.chairman_held_sends FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.chairman_held_sends TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Chairman identity resolution (L-5), DB-first and FAIL-LOUD.
--
--    WHY NOT app_config. A VALIDATION pass noted app_config already holds a `chairman_email` key.
--    It does — value 'rickfelix2000@gmail.com' — but it is a DEAD KEY: MEASURED 2026-08-24, ZERO
--    pg_proc bodies and ZERO pg_policies reference it, and the only code references are archived PRD
--    scripts and a doc comment. fn_is_chairman() was rewritten to test
--    auth.users.raw_app_meta_data instead, so the description "for RLS policies" no longer holds.
--    Separately, app_config is ANON-READABLE (policy app_config_anon_read), so storing the chairman's
--    auth UUID there would publish an internal identifier to unauthenticated clients. Building the
--    identity path on that key would be building on something both unread and over-exposed.
--
--    THIS FUNCTION uses the SAME predicate the LIVE authority (fn_is_chairman) uses, so no fourth
--    vocabulary is introduced, and raises on 0 or >1 matches instead of returning NULL.
--
--    ⚠ The live role value is 'admin', NOT 'chairman' (measured: exactly 1 of 3 auth.users rows
--      matches — 69c8aa7a-7661-48ed-9779-746fa6290873 / rickfelix2000@gmail.com / role='admin',
--      which is exactly the id both live chairman_notifications rows already carry). A narrower
--      `role = 'chairman'` predicate would return ZERO rows. The broad list is required, not sloppy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_chairman_user_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $chs_resolve$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(u.id ORDER BY u.id) INTO v_ids
  FROM auth.users u
  WHERE u.raw_app_meta_data->>'role' IN ('chairman', 'admin', 'owner')
     OR u.raw_app_meta_data->'roles' @> '"chairman"'::jsonb;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'fn_resolve_chairman_user_id: NO auth.users row matches the chairman predicate — chairman identity is unresolvable; do NOT fall back to an env var or a sentinel';
  END IF;
  IF array_length(v_ids, 1) > 1 THEN
    RAISE EXCEPTION 'fn_resolve_chairman_user_id: % auth.users rows match the chairman predicate (%) — identity is AMBIGUOUS and must be disambiguated explicitly, never guessed', array_length(v_ids, 1), v_ids;
  END IF;

  RETURN v_ids[1]::text;
END
$chs_resolve$;

COMMENT ON FUNCTION public.fn_resolve_chairman_user_id() IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 (FR-1 / L-5) — single canonical resolver for the chairman auth.users id, using the SAME predicate as fn_is_chairman(). Raises on 0 or >1 match; never returns NULL. Exists because process.env.CHAIRMAN_USER_ID is UNSET (measured 2026-08-24) and no sendChairmanSMS caller supplies message.chairmanUserId, so chairman-sms-gate:463 resolves to undefined and every decision staging attempt violates chairman_notifications.chairman_user_id NOT NULL. Service-role only — the chairman UUID must not be readable by anon.';

-- pg_default_acl grants EXECUTE on every new function to anon AND authenticated (objtype "f",
-- measured). Revoked explicitly; the chairman UUID is not public.
REVOKE ALL ON FUNCTION public.fn_resolve_chairman_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_chairman_user_id() TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Observability. A hold that can never be released must be LOUD, not merely stuck — a
--    non-terminal state with no expiry is invisible as both work and neglect.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_chairman_held_sends_unreconcilable AS
SELECT
  h.id,
  h.decision_id,
  h.subject,
  h.held_at,
  h.hold_expires_at,
  h.hold_reason,
  h.attempts,
  h.last_error,
  CASE
    WHEN h.consult_correlation_id IS NULL THEN 'no_consult_anchor'
    WHEN h.hold_expires_at <= now()       THEN 'past_reconcile_horizon'
    ELSE 'other'
  END AS blocker
FROM public.chairman_held_sends h
WHERE h.status IN ('held', 'releasing')
  AND (h.consult_correlation_id IS NULL OR h.hold_expires_at <= now());

COMMENT ON VIEW public.v_chairman_held_sends_unreconcilable IS
  'SD-LEO-INFRA-CHAIRMAN-DECISION-LANE-001 — held rows that CANNOT be released: either born without a consult correlation anchor (performBoundedConsult reached the hold arm with no envelope) or aged past reply-class.cjs RECONCILE_HORIZON_MS. Non-empty means chairman decisions are silently stranded. Intended reader: the release sweep''s alarm path and the Adam hourly heartbeat.';

REVOKE ALL ON public.v_chairman_held_sends_unreconcilable FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.v_chairman_held_sends_unreconcilable TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Self-verification: fail the deploy if the table, its POSTURE, or the resolver did not land.
--    Privilege checks use the full privilege LIST, not a single verb — has_table_privilege with one
--    privilege only proves THAT ONE is revoked (SECURITY evidence d0547fd5).
-- ---------------------------------------------------------------------------
DO $chs_verify$
DECLARE
  v_anon_any  boolean;
  v_authn_any boolean;
  v_resolved  text;
  v_missing   text;
BEGIN
  ASSERT to_regclass('public.chairman_held_sends') IS NOT NULL,
    'chairman_held_sends table did not land';

  ASSERT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.chairman_held_sends'::regclass AND relrowsecurity),
    'chairman_held_sends: RLS is NOT enabled — the service-role-only classification does not hold';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chairman_held_sends'
      AND policyname='chairman_held_sends_service_role'
  ), 'chairman_held_sends: service-role policy is missing';

  SELECT has_table_privilege('anon','public.chairman_held_sends','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') INTO v_anon_any;
  SELECT has_table_privilege('authenticated','public.chairman_held_sends','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') INTO v_authn_any;
  IF v_anon_any OR v_authn_any THEN
    RAISE EXCEPTION 'chairman_held_sends: anon/authenticated still hold SOME table-level privilege after REVOKE (anon=%, authenticated=%)', v_anon_any, v_authn_any;
  END IF;

  -- Every constraint this file declares must actually be present.
  SELECT string_agg(c.name, ', ') INTO v_missing
  FROM (VALUES
    ('chairman_held_sends_status_check'),
    ('chairman_held_sends_options_is_array_check'),
    ('chairman_held_sends_metadata_is_object_check'),
    ('chairman_held_sends_consequence_level_check'),
    ('chairman_held_sends_release_disposition_check'),
    ('chairman_held_sends_released_requires_citation_check'),
    ('chairman_held_sends_suppressed_requires_citation_check'),
    ('chairman_held_sends_unreleased_is_clean_check')
  ) AS c(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.chairman_held_sends'::regclass AND conname=c.name
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'chairman_held_sends: missing constraint(s): %', v_missing;
  END IF;

  -- EXERCISE the honesty constraint rather than reading its definition back: a definition that
  -- merely CONTAINS the right text is not proof the constraint rejects the bad row.
  BEGIN
    INSERT INTO public.chairman_held_sends
      (chairman_user_id, chairman_email, subject, body, hold_reason, status)
    VALUES ('probe','probe@invalid','probe','probe','probe','released');
    RAISE EXCEPTION 'chairman_held_sends: honesty constraint FAILED — a released row with no citation was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'chairman_held_sends: released-requires-citation constraint verified by exercise';
  END;

  -- The resolver must exist AND resolve unambiguously right now.
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_resolve_chairman_user_id'
  ), 'fn_resolve_chairman_user_id did not land';

  SELECT public.fn_resolve_chairman_user_id() INTO v_resolved;
  RAISE NOTICE 'chairman identity resolves to %', v_resolved;

  -- Cross-check against the id the live chairman_notifications rows already carry. A resolver that
  -- disagrees with production data is worse than no resolver.
  IF EXISTS (SELECT 1 FROM public.chairman_notifications)
     AND NOT EXISTS (SELECT 1 FROM public.chairman_notifications WHERE chairman_user_id = v_resolved) THEN
    RAISE EXCEPTION 'fn_resolve_chairman_user_id returned % but NO chairman_notifications row carries that id — the resolver disagrees with live data', v_resolved;
  END IF;

  ASSERT to_regclass('public.v_chairman_held_sends_unreconcilable') IS NOT NULL,
    'v_chairman_held_sends_unreconcilable view did not land';

  RAISE NOTICE 'chairman_held_sends verified: table + constraints + RLS + policy + revoked-grants + resolver + view';
END
$chs_verify$;

-- VERIFY (run after apply; this file's existence is a lead, never proof a live object changed):
--   SELECT to_regclass('public.chairman_held_sends');
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.chairman_held_sends'::regclass;          -- true
--   SELECT has_table_privilege('anon','public.chairman_held_sends','INSERT');                      -- false
--   SELECT has_table_privilege('authenticated','public.chairman_held_sends','SELECT');             -- false
--   SELECT conname FROM pg_constraint WHERE conrelid='public.chairman_held_sends'::regclass;       -- 8 checks + pkey + unique
--   SELECT public.fn_resolve_chairman_user_id();                                                   -- 69c8aa7a-7661-48ed-9779-746fa6290873
--   SELECT has_function_privilege('anon','public.fn_resolve_chairman_user_id()','EXECUTE');         -- false
--   SELECT * FROM public.v_chairman_held_sends_unreconcilable;                                     -- expected empty
