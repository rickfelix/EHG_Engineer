-- @approved-by: codestreetlabs@gmail.com
-- (approval transcribed by Adam per chairman ruling 2026-08-07; chairman 'run it' on the G6 trio at terminal, 2026-08-16 ceremony)
-- SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 — per-venture secret-bound ingest RPCs
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately. This
-- SD's own LEAD-phase finding (signal 89b287e5) caught a SIBLING chairman-gated file whose header
-- claimed "not applied" while pg_catalog showed it live — the fix for that class of drift is never
-- writing an approval stamp until an approval actually happened, not writing one and hoping to
-- correct it later. If this file is ever found APPLIED without an @approved-by line above this
-- paragraph, that is itself a policy violation worth signaling, independent of whether the DDL is
-- otherwise correct.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE DEFECT THIS DESIGNS A FIX FOR (verified live, all probes rolled back — see PLAN-phase
-- evidence dff83abd (LEAD VALIDATION) and 3db8cfa8 (PLAN TESTING) on this SD)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CORRECTED framing (EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7, item MED-6): this
-- file closes NEITHER hole below on its own. It ADDS a safer alternative path; the vulnerable
-- surfaces (telegram_bot_insert_feedback, record_venture_error's original signature) remain
-- exactly as reachable as before until the separate follow-on migrations named in "SCOPE OF THIS
-- FILE" below are also ratified and applied, AFTER callers have migrated. Do not record this SD
-- as having closed the vulnerability until that follow-on has actually landed.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   public.feedback policy telegram_bot_insert_feedback: WITH CHECK (source_type = 'telegram').
--   No venture predicate at all — any anon caller can INSERT a row with ANY venture_id by setting
--   source_type='telegram', including forged votes/status/created_at.
--
--   public.record_venture_error: SECURITY DEFINER, anon-EXECUTE, validates venture_id via
--   venture_exists_and_active() — EXISTENCE only, never OWNERSHIP. Any anon-key holder (the key
--   ships in every venture's public bundle, confirmed in apexniche-ai and marketlens) can attribute
--   an error to ANY venture_id, not just their own.
--
--   Neither surface can be fixed by tightening RLS alone: auth.uid() is NULL for anon, so a raw
--   table policy structurally cannot express "this caller owns this venture". Ownership requires a
--   caller-presented credential checked against a per-venture record — hence this migration.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS NOT AS SIMPLE AS "ADD A SECRET CHECK" — TWO CORRECTIONS FROM PLAN-PHASE TESTING
-- (evidence 3db8cfa8, both incorporated below; the PRD text these functions implement was revised
-- to match)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (1) A SECURITY DEFINER function owned by a role with rolbypassrls=true, writing to a table with
--     relforcerowsecurity=false, NEVER evaluates that table's RLS policies — including the
--     RESTRICTIVE anon_feedback_ingress_bounds rate-limit/content-integrity policy already live on
--     public.feedback. This is the exact G1 mechanism already documented for record_venture_error.
--     Every protection that policy provides (per-source_type rate limit, severity/category
--     integrity) is therefore re-implemented EXPLICITLY inside fn_submit_venture_feedback's body
--     below, not inherited. Skipping this would make the "fix" silently weaker than the status quo
--     for every OTHER anon-writable path that still goes through RLS.
-- (2) Adding a required parameter to record_venture_error's EXISTING signature would create a
--     PostgREST same-name RPC overload (resolved by argument-name set), returning PGRST203
--     (ambiguous function) for apexniche-ai/src/lib/error-capture.ts and
--     marketlens/src/lib/errorCapture.js the instant this migration applies — before either repo's
--     calling code has changed. fn_submit_venture_error below is therefore a NEW, separately-named
--     function; record_venture_error's existing signature is left completely untouched and keeps
--     serving unmigrated callers. Its anon-EXECUTE grant is revoked only as an explicit, separate,
--     later follow-on once FR-5's caller migration is confirmed complete — not part of this file.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SCOPE OF THIS FILE (Phase 1 only, per the PRD's implementation_approach)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This file ONLY adds new, additive objects (one table, five functions, two CHECK-constraint
-- widenings) and does NOT touch any existing anon grant, policy, or function signature. Nothing
-- existing stops working when this applies. Two follow-on steps are explicitly OUT of scope here
-- and require separate chairman-ratified migrations once callers have migrated:
--   (a) revoking anon-EXECUTE on record_venture_error's original signature
--   (b) tightening or removing telegram_bot_insert_feedback / venture_user_insert_feedback
-- Rollback: DROP the five functions and the venture_ingest_keys table (see foot of file); the
-- ALTER TABLE feedback_type CHECK widening is additive (new value only) and safe to leave in place
-- even on rollback — it does not change behavior for any existing feedback_type value.
--
-- TWO ARCHITECTURAL RESIDUALS, named rather than hidden (EXEC-phase SECURITY sub-agent finding,
-- evidence b99c9ec7, items HIGH-2/HIGH-3), neither fixed by this file — both belong to Phase 3
-- (caller migration), not Phase 1 (this file):
--   HIGH-2: a per-venture secret shipped in a venture's own client-side bundle (the same delivery
--     pattern as the CURRENT shared anon key) is still extractable by anyone who can read that
--     bundle. This design converts GLOBAL forgery (any anon-key holder, any venture) into
--     PER-VENTURE forgery (that venture's own key only) — closing cross-tenant spoofing, which is
--     the stated threat model — but is not ownership proof against someone targeting one specific
--     venture. Phase 3 should keep secret delivery server-side only where a venture's deployment
--     architecture allows it, and should not assume client-bundle delivery is equivalent to a
--     genuinely private credential.
--   HIGH-3: fn_provision_venture_ingest_key's UPSERT has no rotation grace window — rotating a
--     venture's secret immediately invalidates the old one, so rotation under suspected compromise
--     guarantees an ingest outage for that venture until its deployment is updated. Phase 3 or a
--     later amendment should consider a short-lived dual-valid window if rotation-under-suspicion
--     becomes a real operational need.
--
-- THREE MORE, from an independent peer review (sec-rls-expert, this session, ranked "fix-before-
-- Phase-3, not fix-before-apply" by the reviewer's own assessment — items 1/3/5/6 from that same
-- review WERE treated as fix-before-apply and are fixed above/below):
--   Failed-auth attempts (a wrong secret, a spoofed venture_id) are unmetered and unlogged — the
--     28000 exceptions at the top of both RPCs raise before any rate check runs and nothing
--     writes a failure row anywhere. Not a guessing risk at 256 bits of entropy, but a genuine
--     observability gap: a cross-tenant attack in progress (the exact threat model this file
--     exists for) is currently invisible. A later amendment should consider a lightweight
--     failure-count mechanism, structured so it cannot itself become a new oracle.
--   The feedback_type/source_type CHECK-constraint widenings (below) are DROP+ADD from a
--     snapshot of the live constraint captured at authoring time, not asserted as a subset in the
--     $verify$ block — a legitimate value added to either constraint between authoring and apply
--     would be silently reverted by this file, and the $verify$ block as written cannot detect
--     that. A later amendment could capture the pre-DROP value list and assert old ⊆ new. Related
--     but separate: ADD CONSTRAINT here takes ACCESS EXCLUSIVE with full validation on the live
--     table (~24.6k rows at authoring time) for the duration of this transaction — the same lock
--     class the 2026-08-12 incident (see the incident record in this SD's metadata) held on
--     production during an earlier, accidental apply. A NOT VALID + separate VALIDATE CONSTRAINT
--     pattern would reduce that window; not done here to keep this file's DDL shape matching its
--     own precedent (database/migrations/20260704d_venture_error_aggregation_rpc.sql uses the
--     same plain DROP+ADD).
--   fn_submit_venture_error's storm-suppression ON CONFLICT arbiter (idx_feedback_venture_error_
--     hash) is only exercised once a venture crosses 20 distinct fingerprints in the trailing
--     hour — a code path this SD's test suite cannot practically reach without a dedicated load
--     scenario. A 42P10 (arbiter mismatch) would first surface during a real error storm, not
--     during review. Flagged rather than fixed: the arbiter was independently verified to match
--     the live index predicate exactly (byte-for-byte), so this is a coverage gap, not a known
--     defect.
--
-- TWO MORE, from a second independent peer review (db-txn-expert, this session, database/
-- transaction focus) and a follow-up confirmation pass from the first reviewer (sec-rls-expert),
-- both ranked low/non-blocking:
--   The per-(venture, error_hash) cooldown on fn_submit_venture_error (added above) caps WRITES
--     to a given hash, not the RATE OF CALLS — a rate-limited call still runs the hash validation,
--     several index lookups, and a no-op UPDATE. Genuine request-rate control belongs at the
--     PostgREST/edge layer, not inside this function. Also: the cooldown does not compose into a
--     per-venture AGGREGATE cap — the storm ceiling bounds new DISTINCT hashes to 20/hour, but a
--     venture that seeds hashes over time (up to ~480/day at the ceiling) can keep cycling all of
--     them at 1 increment/second each, unbounded in total UPDATE volume. Ranked low because this
--     requires already holding a valid per-venture secret (self-DoS or post-compromise, not the
--     cross-tenant threat this file exists to close) and the outcome is write volume, not
--     unauthorized access. A per-venture aggregate increment cap would be the complete fix.
--
--   SPLITTER DEFECT IN MAINLINE TOOLING, NOT IN THIS FILE (same reviewer; escalates signal
--     47b6cf4c with measured blast radius): scripts/lib/supabase-connection.js's
--     splitPostgreSQLStatements() tracks only bare $$ dollar-quote tags, not NAMED ones
--     ($function$, $verify$) — every semicolon inside a named-tag body terminates a "statement"
--     early. This migration would shred into ~51 fragments if run through that splitter. NOT
--     exercised by the default apply path (scripts/apply-migration.js sends the whole file unless
--     --split-statements is passed, and no caller in this repo passes it) — but the splitter runs
--     UNCONDITIONALLY to compute schema_migrations_applied.statement_count for every apply,
--     corrupting that audit column for any past or future migration with a named tag (measured:
--     26 of 258 recorded applies already carry a corrupted count). --split-statements is
--     advertised as supported in this script's own usage banner; the first real use of it against
--     any of the ~194 named-tag .sql files under database/ would partially apply mid-function, the
--     same failure class as this SD's own 2026-08-12 incident, reached through a sanctioned flag
--     rather than a script bug. Not fixed here — it is mainline tooling shared across the whole
--     database/ directory, out of this SD's own scope.

BEGIN;

-- ============================================================
-- 1. venture_ingest_keys: one secret per venture. RLS-deny-all — no policy is defined for
--    any role, so only a SECURITY DEFINER function body or a service_role connection can read
--    a row. Mirrors sms_relay_secret's access shape (database/migrations/20260717_sms_relay_
--    staging.sql), keyed per-venture instead of a singleton.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venture_ingest_keys (
  venture_id UUID PRIMARY KEY REFERENCES public.ventures(id),
  ingest_secret_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ
);

COMMENT ON TABLE public.venture_ingest_keys IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: one secret per venture, used by fn_submit_venture_feedback '
  'and fn_submit_venture_error to bind an anon-authenticated write to a SPECIFIC venture, closing the '
  'existence-only venture_id validation gap on public.feedback and record_venture_error. Stores only a '
  'SHA-256 HASH (ingest_secret_hash), never the plaintext secret (EXEC-phase SECURITY sub-agent '
  'correction, evidence b99c9ec7) — the plaintext exists only transiently in fn_provision_venture_'
  'ingest_key''s local memory and the value returned to the caller once. RLS-deny-all (no policy for '
  'anon/authenticated/service_role) PLUS an explicit table-level REVOKE below — this instance''s ALTER '
  'DEFAULT PRIVILEGES was measured live (migration dry-run, rolled back) to grant every new public-'
  'schema table full SELECT/INSERT/UPDATE/DELETE to anon and authenticated BY DEFAULT, independent of '
  'RLS. RLS alone would still functionally deny access, but the explicit REVOKE means this table''s '
  'safety does not depend solely on RLS remaining enabled — the same defense-in-depth posture database/'
  'migrations/20260803_drive_reports.sql already established for a comparably sensitive table on this '
  'instance. The SAME ALTER DEFAULT PRIVILEGES mechanism applies to newly created FUNCTIONS too, not '
  'only tables (confirmed live) — every internal function below carries the equivalent explicit REVOKE.';

ALTER TABLE public.venture_ingest_keys ENABLE ROW LEVEL SECURITY;

-- Explicit, belt-and-suspenders REVOKE (see COMMENT above for why this is not redundant with RLS).
REVOKE ALL ON public.venture_ingest_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.venture_ingest_keys TO service_role;

-- ============================================================
-- 2. fn_venture_ingest_prior_hour_count: per-venture, per-source_type counting basis for the
--    rate limit the new RPC has to re-implement itself (see correction (1) above). Mirrors
--    fn_anon_ingress_prior_hour_count's shape (database/chairman-gated/20260804_ingress_bound_
--    definer_basis.sql) but keyed additionally by venture_id, closing the cross-venture DoS gap
--    FR-4 describes (one venture's flood no longer exhausts another's budget).
--    Deliberately NOT anon/authenticated-executable: it is only ever reached via a nested call
--    from inside another SECURITY DEFINER function, which executes as the function owner
--    regardless of grants — granting it directly to anon would additionally hand out a free
--    "how many events has venture X submitted this hour" oracle with no ownership check.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_venture_ingest_prior_hour_count(p_venture_id UUID, p_source_type TEXT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT count(*)
  FROM public.feedback f
  WHERE f.venture_id = p_venture_id
    AND f.source_type IS NOT DISTINCT FROM p_source_type
    AND f.created_at > now() - interval '1 hour';
$function$;

COMMENT ON FUNCTION public.fn_venture_ingest_prior_hour_count(UUID, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: per-venture-and-source_type prior-hour count, used '
  'internally by fn_submit_venture_feedback to close the cross-venture DoS gap left by the existing '
  'global-per-source_type anon_feedback_ingress_bounds policy (which additionally never evaluates '
  'for a SECURITY DEFINER caller in the first place).';

-- CORRECTED (EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7, FAIL/BLOCK-1): the same
-- ALTER DEFAULT PRIVILEGES this file's own comments document for TABLES (see venture_ingest_keys
-- above) ALSO applies to FUNCTIONS on this instance — confirmed live: a freshly created function
-- gets EXECUTE granted directly to anon AND authenticated, not merely to PUBLIC. REVOKE ... FROM
-- PUBLIC cannot remove a direct role grant. Every internal helper in this file must REVOKE FROM
-- anon, authenticated explicitly, not only PUBLIC — the omission below-this-comment's ORIGINAL
-- form would have made fn_provision_venture_ingest_key (further down) directly anon-callable,
-- handing out any venture's plaintext-equivalent secret to any anon-key holder. Fixed here and at
-- every other internal-function REVOKE in this file.
REVOKE ALL ON FUNCTION public.fn_venture_ingest_prior_hour_count(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. _verify_venture_ingest_secret: shared secret-check helper. Returns FALSE uniformly whether
--    the venture has no provisioned key at all, or has one that does not match — the caller
--    cannot distinguish "venture unknown" from "venture known, wrong secret" from this alone
--    (TS-6). Not anon/authenticated-executable for the same nested-call reason as above; also
--    avoids handing out a standalone secret-guessing oracle independent of the RPCs' other
--    business-logic latency.
--    CORRECTED (EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7, item 2): compares
--    against a SHA-256 hash, not the plaintext secret. This closes the timing-comparison residual
--    for free (no non-constant-time plaintext comparison exists anywhere anymore) AND makes
--    fn_provision_venture_ingest_key's COMMENT ("cannot be read back") literally true, which it
--    was NOT while venture_ingest_keys stored plaintext — a service_role connection (or a future
--    grant mistake) could previously read every venture's live secret directly off the table; now
--    it can only read a hash. digest() is pgcrypto (extensions schema, per the search_path note
--    on fn_provision_venture_ingest_key above).
-- ============================================================
CREATE OR REPLACE FUNCTION public._verify_venture_ingest_secret(p_venture_id UUID, p_ingest_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venture_ingest_keys k
    WHERE k.venture_id = p_venture_id
      AND p_ingest_secret IS NOT NULL
      AND k.ingest_secret_hash = encode(extensions.digest(p_ingest_secret, 'sha256'), 'hex')
  );
$function$;

COMMENT ON FUNCTION public._verify_venture_ingest_secret(UUID, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001: uniform venture-ownership check — FALSE for both a '
  'nonexistent venture_id and a real venture_id with the wrong secret, so response shape does not '
  'enumerate venture existence (TS-6). Compares a SHA-256 hash, never the plaintext secret.';

REVOKE ALL ON FUNCTION public._verify_venture_ingest_secret(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. fn_provision_venture_ingest_key: mints (or rotates) a venture's secret. service_role only —
--    this is a chairman/operator/backend-only action per FR-5, never client-callable. Returns the
--    plaintext secret ONCE, at mint time; after this call the table is unreadable to anything but
--    a service_role connection or another SECURITY DEFINER function body.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_provision_venture_ingest_key(p_venture_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ventures WHERE id = p_venture_id) THEN
    RAISE EXCEPTION 'fn_provision_venture_ingest_key: venture % does not exist', p_venture_id
      USING ERRCODE = '22023';
  END IF;

  -- gen_random_bytes lives in the extensions schema (pgcrypto), not public — confirmed live via
  -- pg_extension.extnamespace, matching the pinned search_path convention already established in
  -- database/migrations/20260602_pin_search_path_invoker_functions.sql. Schema-qualified
  -- explicitly (peer review finding sec-rls-expert, Q3 item 5, this session), not merely relying
  -- on search_path ordering: search_path here lists public BEFORE extensions, so an object named
  -- public.gen_random_bytes/public.digest would shadow pgcrypto's real ones for a SECURITY
  -- DEFINER function on the auth path. Not reachable today (measured: anon/authenticated lack
  -- CREATE on public), but qualifying costs nothing and removes the class of risk entirely rather
  -- than depending on a permission staying narrow.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  -- Only the HASH is stored (see _verify_venture_ingest_secret's header note) — v_secret itself
  -- exists only in this function's local memory and the value returned to the caller once.
  INSERT INTO public.venture_ingest_keys (venture_id, ingest_secret_hash, created_at, rotated_at)
  VALUES (p_venture_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'), now(), NULL)
  ON CONFLICT (venture_id) DO UPDATE
    SET ingest_secret_hash = EXCLUDED.ingest_secret_hash,
        rotated_at = now();

  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.fn_provision_venture_ingest_key(UUID) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-5: mints or rotates a venture''s ingest secret. '
  'service_role only. Returns the plaintext secret ONCE — store it in that venture''s deployment '
  'env immediately. Only a SHA-256 hash is persisted; the plaintext cannot be READ BACK from '
  'venture_ingest_keys afterward by any role (peer review correction, sec-rls-expert, this '
  'session: this claim is about READING, not about every capability — service_role holds '
  'rolbypassrls and a full table grant, so it can still WRITE a chosen ingest_secret_hash and '
  'impersonate any venture; that is inherent to what service_role is, not something hashing '
  'closes, and is the same trust boundary every table in this schema already depends on).';

-- CORRECTED (EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7, BLOCK-1, CRITICAL): the
-- original REVOKE ... FROM PUBLIC alone left this function directly anon-EXECUTE-able via this
-- instance's ALTER DEFAULT PRIVILEGES (confirmed live, same mechanism as the table-grant finding
-- above) — any anon-key holder could have called this to read any venture's secret AND
-- simultaneously invalidate that venture's real one via the rotation UPSERT. Explicit REVOKE FROM
-- anon, authenticated closes it; this was the most severe defect this migration would have shipped.
REVOKE ALL ON FUNCTION public.fn_provision_venture_ingest_key(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_provision_venture_ingest_key(UUID) TO service_role;

-- ============================================================
-- 5. Widen feedback_type CHECK to add 'venture_feedback' — the new type this migration's
--    feedback-path RPC writes, distinct from 'venture_error' (reserved for error-capture) and
--    from every 'user_%' type (reserved for the existing human-submitted venture_user_insert_
--    feedback path, which this migration does not touch). Additive only.
-- ============================================================
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_feedback_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_feedback_type_check
  CHECK (feedback_type IN (
    'sentry_error',
    'user_bug',
    'user_feature_request',
    'user_usability',
    'user_other',
    'venture_error',
    'venture_feedback'
  ));

-- ============================================================
-- 5b. Widen feedback_source_type_check to add 'venture_worker' — fn_submit_venture_feedback's
--     source_type, distinct from every existing allowed value (manual_feedback, auto_capture,
--     uat_failure, error_capture, uncaught_exception, unhandled_rejection, manual_capture,
--     todoist_intake, youtube_intake, claude_code_intake, telegram, user_feedback), verified
--     live via pg_get_constraintdef before writing this ALTER — 'venture_worker' does not
--     collide with any of them. 'error_capture' (fn_submit_venture_error's source_type) is
--     already in the existing list, matching record_venture_error's own convention — no change
--     needed there. Additive only.
-- ============================================================
ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_source_type_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_source_type_check
  CHECK (source_type IN (
    'manual_feedback',
    'auto_capture',
    'uat_failure',
    'error_capture',
    'uncaught_exception',
    'unhandled_rejection',
    'manual_capture',
    'todoist_intake',
    'youtube_intake',
    'claude_code_intake',
    'telegram',
    'user_feedback',
    'venture_worker'
  ));

-- ============================================================
-- 6. fn_submit_venture_feedback: the new, ownership-bound replacement write path for anon
--    feedback submissions. Uniform ERRCODE=28000 for the ownership check (TS-1, TS-6); server-
--    derived created_at/status/votes/assigned_to/triaged_by/user_id — none of these are
--    parameters, so none can be client-forged (TS-2, FR-2 AC-2). Re-implements BOTH protections
--    the RESTRICTIVE anon_feedback_ingress_bounds policy provides but which never evaluate for a
--    SECURITY DEFINER caller: the per-source_type/per-venture rate limit (FR-4, TS-4), and the
--    severity/category content-integrity bound the original policy also carries (mirrored here
--    for parity — this is the same "RLS never evaluates" mechanism applied to a second existing
--    protection, not just the rate limit).
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_feedback(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_source_type TEXT,
  p_severity TEXT,
  p_category TEXT,
  p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id UUID;
  v_venture_name TEXT;
BEGIN
  -- Ownership check FIRST, before any business-logic branch, so a nonexistent venture_id and a
  -- real venture_id with the wrong secret are indistinguishable (TS-6).
  -- IS NOT TRUE (not NOT ...), a defensive shape (EXEC-phase SECURITY sub-agent finding, evidence
  -- b99c9ec7, item 1): both helpers are SELECT EXISTS(...), which never returns NULL today, so NOT
  -- would be equally safe right now — but IF NOT <expr> is a fail-OPEN shape if that guarantee is
  -- ever weakened by a future edit (NULL fails NOT's IF-branch silently). IS NOT TRUE fails closed
  -- regardless of what the expression returns.
  IF public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF public.venture_exists_and_active(p_venture_id) IS NOT TRUE THEN
    -- Defense-in-depth: a venture can be soft-deleted or have ingestion disabled after its key
    -- was provisioned. Same uniform code — do not distinguish "deactivated" from "unauthorized".
    RAISE EXCEPTION 'fn_submit_venture_feedback: unauthorized' USING ERRCODE = '28000';
  END IF;

  IF p_source_type IS DISTINCT FROM 'venture_worker' THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: invalid source_type' USING ERRCODE = '22004';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: message is required' USING ERRCODE = '22004';
  END IF;
  IF length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;

  -- Content-integrity bound, mirrored from anon_feedback_ingress_bounds (which does not
  -- evaluate for this SECURITY DEFINER path — see file header correction (1)).
  -- CORRECTED (independent peer review, db-txn-expert, this session): the original check only
  -- excluded critical/high, so any OTHER out-of-domain value (a typo, a client bug) fell through
  -- to the live feedback_severity_check CHECK constraint and raised 23514 -- a distinguishable
  -- response from this RPC's own uniform-rejection convention used everywhere else. Now validated
  -- against the exact live allowed set (critical/high/medium/low, or NULL), with the business-rule
  -- exclusion (critical/high not permitted on this anon path) kept as a second, explicit check.
  IF p_severity IS NOT NULL AND p_severity NOT IN ('critical', 'high', 'medium', 'low') THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: invalid severity' USING ERRCODE = '22004';
  END IF;
  IF p_severity IS NOT NULL AND p_severity IN ('critical', 'high') THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: severity not permitted on this path' USING ERRCODE = '22004';
  END IF;
  IF p_category IS NOT DISTINCT FROM 'chairman_decision_deferred' THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: category not permitted on this path' USING ERRCODE = '22004';
  END IF;
  -- category has no live CHECK constraint but IS column-length-bound: public.feedback.category is
  -- varchar(50) (confirmed live via information_schema.columns, not assumed) -- truncating to
  -- anything >50 would itself raise "value too long for type character varying(50)", the exact
  -- failure a length guard exists to prevent. Caught by this file's own live dry-run validation.
  IF p_category IS NOT NULL AND length(p_category) > 50 THEN
    p_category := left(p_category, 50);
  END IF;

  -- Rate limit, mirrored from anon_feedback_ingress_bounds for the same reason, PLUS the new
  -- per-venture scope (FR-4, TS-4) that policy never had.
  -- CORRECTED TWICE, and this is the version that actually holds (VERIFY-phase VALIDATION
  -- finding, evidence 2df8275b, FR-4 FAIL): the EXEC-phase SECURITY correction (evidence
  -- b99c9ec7, BLOCK-2) rightly flagged 250 as an arbitrary borrow from auto_capture's own
  -- measured peak, but changing it to ALSO be 50 broke FR-4 itself — fn_venture_ingest_prior_
  -- hour_count(venture, source_type) is a strict SUBSET of fn_anon_ingress_prior_hour_count
  -- (source_type) (same predicate, plus a venture_id filter), so it can never exceed it. With
  -- both thresholds equal, the GLOBAL check always trips first regardless of which venture is
  -- responsible, making the per-venture check unreachable dead code and silently reintroducing
  -- the exact cross-venture DoS FR-4 exists to prevent (one venture's 50 events/hour locks out
  -- every other venture, identical to the status quo this migration is supposed to improve on).
  -- The global threshold MUST be strictly greater than the per-venture one for FR-4 to mean
  -- anything. 'venture_worker' has zero measured traffic (it's brand new), so there is no
  -- peak to derive a number from the way auto_capture's 250 was derived — instead this uses a
  -- reasoned multiplier: 10x the per-venture limit, i.e. enough headroom for 10 CONCURRENTLY
  -- flooding ventures (currently 3 known near-term callers per FR-5: AltifyAI, apexniche-ai,
  -- marketlens) before the shared source_type budget closes to everyone. This is a coarse
  -- system-sanity backstop against a runaway/bug scenario, NOT the primary protection — the
  -- primary protection is the per-venture check immediately below, which fires first for any
  -- single flooding venture and leaves the shared budget intact for every other venture.
  IF public.fn_anon_ingress_prior_hour_count('venture_worker') >= 500 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: rate limited' USING ERRCODE = '53400';
  END IF;
  IF public.fn_venture_ingest_prior_hour_count(p_venture_id, 'venture_worker') >= 50 THEN
    RAISE EXCEPTION 'fn_submit_venture_feedback: rate limited' USING ERRCODE = '53400';
  END IF;

  -- COALESCE guard (independent peer review, db-txn-expert, this session): source_application is
  -- NOT NULL on public.feedback. Latent today (0 of 151 live ventures have a NULL name), but a
  -- future NULL-named venture would otherwise raise a raw 23502 instead of a clean outcome for an
  -- otherwise-valid, correctly-authenticated submission. WIDTH COUPLING (same reviewer, follow-up
  -- pass): this is safe from truncation only because ventures.name and feedback.source_application
  -- are BOTH varchar(255) today ("safety by coincidence", not a cap) -- widening ventures.name in
  -- some future migration would silently arm a 22001 here. Longest live name is 53 chars.
  SELECT coalesce(name, 'unknown-venture') INTO v_venture_name FROM public.ventures WHERE id = p_venture_id;

  INSERT INTO public.feedback (
    venture_id, feedback_type, source_type, source_application,
    severity, category, title, description, type, status
  ) VALUES (
    p_venture_id, 'venture_feedback', 'venture_worker', v_venture_name,
    p_severity, p_category, left(p_message, 200), p_message, 'issue', 'new'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

COMMENT ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-2: ownership-bound replacement for anon feedback '
  'writes. Uniform ERRCODE=28000 for every ownership-check reject path (TS-1, TS-6). Re-implements '
  'the rate-limit and content-integrity checks that anon_feedback_ingress_bounds cannot provide for '
  'a SECURITY DEFINER caller (TS-4). created_at/status/votes/assigned_to/triaged_by/user_id are '
  'never parameters (TS-2).';

REVOKE ALL ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- 7. fn_submit_venture_error: NEW, separately-named error-capture RPC (correction (2) above —
--    NOT an overload of record_venture_error). Same dedup / per-venture distinct-fingerprint
--    storm-ceiling logic as record_venture_error (database/migrations/20260704d_venture_error_
--    aggregation_rpc.sql), reusing the SAME idx_feedback_venture_error_hash unique index and
--    _venture_error_storm_watermark_hash() helper — both already exist and are untouched by this
--    file — so rows from either the old or the new function dedup/aggregate together correctly.
--    Only the caller-authentication differs: this path requires the per-venture secret first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_submit_venture_error(
  p_venture_id UUID,
  p_ingest_secret TEXT,
  p_error_hash TEXT,
  p_message TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ceiling CONSTANT INTEGER := 20;
  v_window CONSTANT INTERVAL := interval '1 hour';
  v_distinct_count INTEGER;
  v_venture_name TEXT;
  -- Assigned inside BEGIN, not here (EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7,
  -- item 1): a DECLARE-block default expression evaluates at function entry, before the ownership
  -- check below — harmless today since this call is a pure IMMUTABLE constant with no venture-
  -- specific input or side effect, but it made the file's own "check FIRST" claim literally false.
  -- Moved so every expression genuinely runs after authorization, not merely every side effect.
  v_watermark_hash TEXT;
  v_existing_row_id UUID;
  v_updated_id UUID;
BEGIN
  -- Ownership check FIRST — same uniform code, same reasoning as fn_submit_venture_feedback (TS-6).
  -- IS NOT TRUE, not NOT — see the matching note in fn_submit_venture_feedback above.
  IF public._verify_venture_ingest_secret(p_venture_id, p_ingest_secret) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_error: unauthorized' USING ERRCODE = '28000';
  END IF;

  v_watermark_hash := public._venture_error_storm_watermark_hash();

  IF p_error_hash IS NULL OR p_error_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_error_hash');
  END IF;

  IF p_message IS NOT NULL AND length(p_message) > 2000 THEN
    p_message := left(p_message, 2000);
  END IF;
  IF p_context IS NOT NULL AND octet_length(p_context::text) > 8000 THEN
    p_context := jsonb_build_object('truncated', true);
  END IF;

  IF public.venture_exists_and_active(p_venture_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_submit_venture_error: unauthorized' USING ERRCODE = '28000';
  END IF;

  -- COALESCE guard (independent peer review, db-txn-expert, this session) — same reasoning as
  -- fn_submit_venture_feedback above: source_application is NOT NULL, latent-only risk today.
  SELECT coalesce(name, 'unknown-venture') INTO v_venture_name FROM public.ventures WHERE id = p_venture_id;

  SELECT id INTO v_existing_row_id
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type = 'venture_error'
    AND error_hash = p_error_hash
  LIMIT 1;

  IF v_existing_row_id IS NOT NULL THEN
    -- Per-hash cooldown (peer review finding sec-rls-expert, Q3 item 1, this session): this
    -- aggregation path previously had NO rate limit at all -- unlike fn_submit_venture_feedback,
    -- which calls fn_venture_ingest_prior_hour_count, a repeated error_hash never creates a new
    -- feedback row, so a row-COUNTING check can't see repeat-call volume; a secret holder could
    -- increment occurrence_count without bound in a tight loop. A 1-second minimum interval
    -- between increments for the SAME (venture, error_hash) caps that without new state --
    -- genuine incident traffic (real repeated errors, typically seconds-to-minutes apart) is
    -- unaffected; a pathological tight loop is capped at ~3600 increments/hour per hash instead
    -- of unbounded.
    -- clock_timestamp() throughout this cooldown, NOT now() (live dry-run finding, this session,
    -- confirmed empirically): now()/CURRENT_TIMESTAMP is fixed at TRANSACTION START in Postgres,
    -- not real wall-clock time. Using now() for the STORED value while comparing against
    -- clock_timestamp() made the stored last_seen look artificially stale the instant more than
    -- one real second had elapsed since the enclosing transaction began, regardless of true
    -- call-to-call spacing -- exactly the false-immediate-pass a cooldown must not have. Using
    -- clock_timestamp() consistently for both the stored value and the comparison ties the whole
    -- check to real elapsed time, which is also the more precise semantic for a genuinely
    -- "last SEEN" timestamp. Harmless for the normal case (a real PostgREST call is its own short
    -- transaction, where now() and clock_timestamp() are indistinguishable) and correct for the
    -- edge case (multiple calls batched in one caller-side transaction) that motivated using
    -- clock_timestamp() for the comparison in the first place.
    UPDATE public.feedback
    SET occurrence_count = occurrence_count + 1,
        last_seen = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = v_existing_row_id
      AND last_seen < clock_timestamp() - interval '1 second'
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'action', 'aggregated', 'id', v_updated_id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'action', 'aggregated_rate_limited', 'id', v_existing_row_id);
  END IF;

  SELECT count(DISTINCT error_hash) INTO v_distinct_count
  FROM public.feedback
  WHERE venture_id = p_venture_id
    AND feedback_type = 'venture_error'
    AND error_hash <> v_watermark_hash
    AND created_at > now() - v_window;

  IF v_distinct_count >= v_ceiling THEN
    INSERT INTO public.feedback (
      venture_id, feedback_type, source_type, source_application,
      error_hash, error_message, occurrence_count, first_seen, last_seen,
      title, description, type, status, severity
    ) VALUES (
      p_venture_id, 'venture_error', 'error_capture',
      v_venture_name,
      v_watermark_hash, '[STORM SUPPRESSED] distinct-fingerprint ceiling exceeded',
      1, now(), now(),
      'Venture error storm watermark', 'Distinct-fingerprint ceiling exceeded for this venture in the trailing window',
      'issue', 'new', 'high'
    )
    ON CONFLICT (venture_id, error_hash) WHERE feedback_type = 'venture_error' AND venture_id IS NOT NULL
    DO UPDATE SET occurrence_count = feedback.occurrence_count + 1, last_seen = now(), updated_at = now();

    RETURN jsonb_build_object('ok', true, 'action', 'storm_suppressed');
  END IF;

  INSERT INTO public.feedback (
    venture_id, feedback_type, source_type, source_application,
    error_hash, error_message, occurrence_count, first_seen, last_seen,
    title, description, type, status, severity, metadata
  ) VALUES (
    p_venture_id, 'venture_error', 'error_capture',
    v_venture_name,
    -- last_seen (not first_seen) is clock_timestamp() -- it is the field the cooldown check
    -- above reads on the NEXT call for this hash, so it needs real elapsed time, matching the
    -- clock_timestamp() correction on the aggregation branch above.
    p_error_hash, p_message, 1, now(), clock_timestamp(),
    left(coalesce(p_message, 'Venture error'), 200), coalesce(p_message, ''),
    'issue', 'new', 'medium', p_context
  )
  RETURNING id INTO v_existing_row_id;

  RETURN jsonb_build_object('ok', true, 'action', 'created', 'id', v_existing_row_id);
END;
$$;

COMMENT ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) IS
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 FR-3: ownership-bound sibling of record_venture_error. '
  'A NEW, separately-named function (not an added parameter on the existing signature) to avoid a '
  'PostgREST same-name RPC overload (PGRST203) that would otherwise break every unmigrated caller '
  'the instant this migration applies (TS-5). record_venture_error itself is untouched by this file. '
  'CLIENT CONTRACT NOTE (peer review, sec-rls-expert): a rate-limited repeat submission returns '
  '{ok:true, action:"aggregated_rate_limited"} -- ok alone does not mean "occurrence_count was '
  'incremented"; a caller that only checks ok will silently undercount a suppressed repeat.';

REVOKE ALL ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================
-- 8. Self-verify the grant posture. EXEC-phase SECURITY sub-agent finding, evidence b99c9ec7,
--    item 5: "add a fail-closed has_table_privilege/has_function_privilege assertion so it's a
--    measured invariant, not a one-time act" — this instance's ALTER DEFAULT PRIVILEGES fires on
--    every fresh CREATE, so a future re-run of the CREATE-side statements above without the
--    matching REVOKE (a partial re-apply, a copy-paste into a new file, a restore that replays
--    only some statements) could silently reintroduce exactly the BLOCK-1 defect this file's
--    corrections just closed. This block turns "we revoked it" into "we assert it holds", and
--    fails the whole transaction rather than applying half-fixed.
-- ============================================================
DO $verify$
BEGIN
  -- CORRECTED (independent peer review, db-txn-expert, this session): the original check only
  -- tested SELECT. This instance's ALTER DEFAULT PRIVILEGES grants a fresh public-schema table
  -- anon=arwdDxtm (confirmed live via pg_default_acl) -- SELECT is the LEAST dangerous of the
  -- eight privileges the REVOKE above actually removes. A partial re-apply that lost the REVOKE
  -- but still passed a SELECT-only check would leave anon able to UPDATE any venture's
  -- ingest_secret_hash to one it chose (forging that venture's identity) or INSERT/DELETE rows,
  -- while this assertion read clean. Checking all four DML privileges closes that.
  IF has_table_privilege('anon', 'public.venture_ingest_keys', 'SELECT')
     OR has_table_privilege('anon', 'public.venture_ingest_keys', 'INSERT')
     OR has_table_privilege('anon', 'public.venture_ingest_keys', 'UPDATE')
     OR has_table_privilege('anon', 'public.venture_ingest_keys', 'DELETE')
     OR has_table_privilege('authenticated', 'public.venture_ingest_keys', 'SELECT')
     OR has_table_privilege('authenticated', 'public.venture_ingest_keys', 'INSERT')
     OR has_table_privilege('authenticated', 'public.venture_ingest_keys', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.venture_ingest_keys', 'DELETE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_ingest_keys is reachable (SELECT/INSERT/UPDATE/DELETE) by anon or authenticated';
  END IF;

  -- Three additions (peer review finding sec-rls-expert, Q3 item 3, this session): the block
  -- above only checked SELECT for anon/authenticated, and nothing asserted RLS is actually
  -- enabled, that zero policies exist, or that service_role can ACTUALLY execute the provisioning
  -- RPC. The harness that validated this file so far called fn_provision_venture_ingest_key as
  -- postgres (the owner, which retains EXECUTE regardless of any REVOKE) — a missing or typo'd
  -- GRANT to service_role at the end of this file would pass every existing check while leaving
  -- FR-5's provisioning path dead on arrival for the only role meant to use it.
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.venture_ingest_keys'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_ingest_keys does not have RLS enabled';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'venture_ingest_keys') <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_ingest_keys has a policy — it must remain deny-all-by-absence';
  END IF;

  IF has_function_privilege('service_role', 'public.fn_provision_venture_ingest_key(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: service_role cannot execute fn_provision_venture_ingest_key — FR-5 provisioning would be unreachable';
  END IF;

  IF has_function_privilege('anon', 'public.fn_provision_venture_ingest_key(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_provision_venture_ingest_key(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_provision_venture_ingest_key is callable by anon or authenticated';
  END IF;

  IF has_function_privilege('anon', 'public._verify_venture_ingest_secret(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._verify_venture_ingest_secret(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: _verify_venture_ingest_secret is callable by anon or authenticated';
  END IF;

  IF has_function_privilege('anon', 'public.fn_venture_ingest_prior_hour_count(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_venture_ingest_prior_hour_count(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_venture_ingest_prior_hour_count is callable by anon or authenticated';
  END IF;

  -- TWO-SIDED: the client-facing RPCs MUST still be anon-callable — a verify block strict enough
  -- to reject every anon grant would silently no-op the two functions that exist specifically to
  -- BE anon-callable, and this assertion would never catch that regression.
  -- IS NOT TRUE, not NOT, matching this file's own stated principle (re-verification finding,
  -- evidence 83b9ce04, ADV-1) — has_function_privilege errors rather than returning NULL for a
  -- malformed identity, so NOT was not exploitable here, but the inconsistency undercut the
  -- principle the ownership checks above establish.
  IF has_function_privilege('anon', 'public.fn_submit_venture_feedback(uuid,text,text,text,text,text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_venture_feedback is NOT anon-callable — the fix would be unreachable';
  END IF;
  IF has_function_privilege('anon', 'public.fn_submit_venture_error(uuid,text,text,text,jsonb)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_submit_venture_error is NOT anon-callable — the fix would be unreachable';
  END IF;

  -- TS-5: record_venture_error's original signature must be completely untouched.
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'record_venture_error') <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: record_venture_error signature count changed — an overload may have been introduced';
  END IF;
END
$verify$;

-- PostgREST caches the schema; without this, both new RPCs return 404/PGRST202 to real anon
-- clients until PostgREST's own reload cycle catches up — a window where has_function_privilege
-- (a grant check) already reads correctly but the fix is not yet reachable over the actual API
-- surface (peer review finding sec-rls-expert, Q3 item 8, this session). Established convention
-- in this codebase (e.g. database/migrations/20260426_add_claude_sessions_loop_state.sql).
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed — additive-only migration, safe to reverse in one pass):
-- ============================================================
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_error(UUID, TEXT, TEXT, TEXT, JSONB);
-- REVOKE EXECUTE ON FUNCTION public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, service_role;
-- DROP FUNCTION IF EXISTS public.fn_submit_venture_feedback(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);
-- REVOKE EXECUTE ON FUNCTION public.fn_provision_venture_ingest_key(UUID) FROM service_role;
-- DROP FUNCTION IF EXISTS public.fn_provision_venture_ingest_key(UUID);
-- DROP FUNCTION IF EXISTS public._verify_venture_ingest_secret(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.fn_venture_ingest_prior_hour_count(UUID, TEXT);
-- REVOKE ALL ON public.venture_ingest_keys FROM service_role;
-- DROP TABLE IF EXISTS public.venture_ingest_keys;
-- (feedback_type and source_type CHECK widenings are left in place — additive, no behavior
--  change for any existing value)
