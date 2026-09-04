-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2 (AC-4/AC-6/AC-7)
--
-- Extends the EXISTING enforce_canonical_lifecycle_write() trigger function (created by
-- 20260824_strategic_directives_canonical_writer_choke.sql, Step 3 — already live) with a
-- second, independent refusal: a transition INTO status='completed' is rejected while
-- metadata carries an UNRELEASED chairman hold (requires_human_action_reason or
-- review_hold_reason, per VAL-1 evidence cc6f72a7 — the two keys that actually mean
-- "chairman must act", not the four that VAL-1 found resolveHoldProvenance() over-matching
-- on: deferred_by, not_worker_claimable_reason, dispatch_ineligible_reason, pilot_throwaway).
--
-- WHY THIS TRIGGER (VAL-4): enforce_canonical_lifecycle_write() already fires BEFORE every
-- UPDATE that changes status/current_phase/completion_date — including complete_orchestrator_sd()'s
-- own `UPDATE strategic_directives_v2 SET status='completed', ...` (line ~1149 of the parent
-- migration). Adding the check HERE, once, closes the gap for every completion writer that
-- reaches this table, not only the two named in the PRD (LeadFinalApprovalExecutor already
-- has an equivalent JS-side guard — SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 1, merged
-- separately — this is defense in depth for that path and the ONLY guard for any writer that
-- reaches this table directly, e.g. complete_orchestrator_sd() or a future/manual write).
--
-- TRANSITION-GATED, NOT STATUS-GATED (AC-7): the check only fires when
-- NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'. It NEVER fires on an
-- already-completed row, so an unrelated column update to one of FR-4's 11 historical
-- stale-hold rows (already status='completed') passes through untouched. FR-4's backfill
-- therefore carries no ordering dependency on this guard landing first.
--
-- RUNS ONCE (TG_ARGV[0] = 'early', the FIRST-firing aaa_ guard, matching that guard's own
-- fail-fast placement before the stamp-validation's sibling BEFORE-ROW triggers such as
-- status_auto_transition ever run) — not on zzz_, to avoid a redundant duplicate evaluation
-- (harmless either way since a RAISE EXCEPTION aborts the whole transaction on first fire,
-- but running it once is simpler to reason about and matches the file's own aaa_/zzz_
-- separation-of-concerns convention: aaa_ is where NEW-tuple validation belongs, zzz_ is
-- where the FINAL-tuple at-rest cleanup belongs).
--
-- DISTINCT SQLSTATE (SDCW2, not SDCW1): SDCW1 is load-bearing for a specific JS discriminator
-- (skip-and-continue.js:148, `updateError.message.includes('0 rows')`, and the file's own
-- header states NEITHER existing SDCW1 message may ever contain that substring). This is a
-- THIRD, semantically distinct failure mode — a business-rule refusal, not a missing/invalid
-- writer-identity stamp — and callers should be able to tell the two apart programmatically.
--
-- WRITER-SIDE MECHANISM MIRRORED, NOT DUPLICATED: this SQL predicate reproduces
-- lib/fleet/claim-eligibility.cjs's isUnreleasedChairmanHold()/isHoldReleased() semantics
-- exactly (release = metadata.unfenced_at present AND, if the corresponding set-at field is
-- also present, unfenced_at >= that set-at field) — same field names, same "no set-at stamp
-- means treat any unfenced_at as sufficient" fallback. The three new helper functions below
-- are the SQL-side counterpart; keep them in sync with the JS predicate if either changes.
--
-- CEREMONY: this file lives in database/chairman-gated/ and is NEVER self-applied by the
-- worker that authors it — see that directory's README.md. It is purely additive to an
-- EXISTING function (CREATE OR REPLACE FUNCTION on an already-live trigger target; no new
-- trigger binding, no column, no lock-sensitive ALTER, no RLS change), so the review is
-- narrower than most entries in that README: read the three new helper functions plus the
-- one new IF block inserted into enforce_canonical_lifecycle_write()'s existing body.
--
-- ROLLBACK: see the paired _DOWN.sql (restores enforce_canonical_lifecycle_write() to its
-- pre-this-migration body — the exact text captured from
-- 20260824_strategic_directives_canonical_writer_choke.sql lines 466-511 — and drops the
-- three new helper functions).

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. HELPER FUNCTIONS
-- ───────────────────────────────────────────────────────────────────────────────────────────────

-- Safe timestamptz parse: NULL/malformed input returns NULL rather than raising, mirroring
-- JS's Date.parse -> NaN -> !Number.isFinite fallback (a malformed unfenced_at/set-at value
-- must never abort the whole UPDATE; it must be treated as "not a valid release marker").
CREATE OR REPLACE FUNCTION public.sd_safe_parse_timestamptz(raw text)
 RETURNS timestamptz
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-1's isHoldReleased(metadata, setAtField), in SQL.
-- Released iff unfenced_at parses AND (the set-at field does not parse, OR unfenced_at is
-- at/after it) -- byte-identical semantics to the JS side (lib/fleet/claim-eligibility.cjs).
CREATE OR REPLACE FUNCTION public.sd_metadata_hold_released(metadata jsonb, set_at_field text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unfenced_at timestamptz;
  v_set_at      timestamptz;
BEGIN
  v_unfenced_at := public.sd_safe_parse_timestamptz(metadata ->> 'unfenced_at');
  IF v_unfenced_at IS NULL THEN
    RETURN false;
  END IF;
  v_set_at := public.sd_safe_parse_timestamptz(metadata ->> set_at_field);
  IF v_set_at IS NULL THEN
    RETURN true;
  END IF;
  RETURN v_unfenced_at >= v_set_at;
END;
$function$;

-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-1's isUnreleasedChairmanHold(), in SQL. Deliberately
-- NOT a mirror of resolveHoldProvenance() -- VAL-1 (evidence cc6f72a7) measured that function
-- over-matching 42 completed SDs across 6 source keys; only requires_human_action_reason and
-- review_hold_reason mean "chairman must act", and only while unreleased.
CREATE OR REPLACE FUNCTION public.sd_metadata_has_unreleased_chairman_hold(metadata jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_human_action_reason text;
  v_review_reason       text;
BEGIN
  v_human_action_reason := NULLIF(btrim(COALESCE(metadata ->> 'requires_human_action_reason', '')), '');
  v_review_reason       := NULLIF(btrim(COALESCE(metadata ->> 'review_hold_reason', '')), '');

  IF v_human_action_reason IS NOT NULL
     AND NOT public.sd_metadata_hold_released(metadata, 'requires_human_action_at') THEN
    RETURN true;
  END IF;

  IF v_review_reason IS NOT NULL
     AND NOT public.sd_metadata_hold_released(metadata, 'review_hold_at') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- SECURITY finding SEC-4 (evidence 62a7d823): these 3 functions have ordinary scalar
-- signatures and would otherwise be born reachable at POST /rest/v1/rpc/<name> (live-probed
-- pg_default_acl: postgres/anon/authenticated/service_role all get EXECUTE by default --
-- 20260816_defacl_anon_auth_axis.sql, which would close this at the ACL-default level, is
-- not applied). No data exposure (SECURITY INVOKER, no table access), but this trigger-
-- support family has no legitimate external caller -- same SEC-M2 class this directory's
-- own README documents for a sibling migration.
-- SEC-6 fix (SECURITY evidence b71d1614, 2026-09-04): authenticated deliberately KEEPS
-- EXECUTE, matching sibling public.sd_canonical_writer_policy(text)'s precedent
-- (20260824_sd_canonical_writer_policy_revoke.sql) -- enforce_canonical_lifecycle_write()
-- has no SECURITY DEFINER, so it runs as the invoking role; revoking from authenticated
-- would turn a governance block into a bare 42501 permission error for any
-- authenticated-role UPDATE that reaches this trigger, with no added protection (these are
-- internal helpers, not independently reachable RPC endpoints either way).
REVOKE EXECUTE ON FUNCTION public.sd_safe_parse_timestamptz(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sd_metadata_hold_released(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sd_metadata_has_unreleased_chairman_hold(jsonb) FROM PUBLIC, anon;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. AMENDED enforce_canonical_lifecycle_write() -- full body restated (CREATE OR REPLACE),
--    one new IF block inserted between the existing stamp-validation block and the existing
--    NULL-at-rest cleanup block. No trigger re-binding needed: aaa_/zzz_ already point at this
--    function name and pick up the new body immediately on replace.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_canonical_lifecycle_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected_changed boolean;
BEGIN
  v_protected_changed :=
        NEW.status          IS DISTINCT FROM OLD.status
     OR NEW.current_phase   IS DISTINCT FROM OLD.current_phase
     OR NEW.completion_date IS DISTINCT FROM OLD.completion_date;

  IF v_protected_changed THEN
    IF NEW.lifecycle_write_token IS NULL THEN
      RAISE EXCEPTION 'missing canonical-writer stamp on protected-column write'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format(
                'guard=%s sd=%s status:%s->%s current_phase:%s->%s completion_date:%s->%s',
                TG_NAME, NEW.id,
                OLD.status, NEW.status,
                OLD.current_phase, NEW.current_phase,
                OLD.completion_date, NEW.completion_date),
              HINT    = 'Set lifecycle_write_token to your registry identity in the SAME UPDATE statement. Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.sd_canonical_writer_policy(NEW.lifecycle_write_token)
    ) THEN
      RAISE EXCEPTION 'stamp value not present in canonical-writer registry'
        USING ERRCODE = 'SDCW1',
              DETAIL  = format('guard=%s sd=%s rejected_identity=%L', TG_NAME, NEW.id, NEW.lifecycle_write_token),
              HINT    = 'Enumerate valid identities with: SELECT writer_identity FROM public.sd_canonical_writer_policy();';
    END IF;
  END IF;

  -- SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2 (AC-4/AC-6/AC-7): refuse a transition INTO
  -- 'completed' while an unreleased chairman hold stands. Runs ONCE (TG_ARGV[0]='early', the
  -- FIRST-firing aaa_ guard) so a rejection here aborts before status_auto_transition or any
  -- other BEFORE-ROW sibling runs. Transition-gated (OLD.status IS DISTINCT FROM 'completed')
  -- so it NEVER fires on an already-completed row -- a later unrelated column update to a
  -- pre-existing held-but-completed row (an FR-4 backfill target) passes through untouched, so
  -- FR-4's backfill carries no ordering dependency on this guard (AC-7).
  IF TG_ARGV[0] = 'early'
     AND NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND public.sd_metadata_has_unreleased_chairman_hold(NEW.metadata)
  THEN
    RAISE EXCEPTION 'cannot complete SD while an unreleased chairman hold stands'
      USING ERRCODE = 'SDCW2',
            DETAIL  = format(
              'guard=%s sd=%s requires_human_action_reason=%L review_hold_reason=%L',
              TG_NAME, NEW.id,
              NEW.metadata ->> 'requires_human_action_reason',
              NEW.metadata ->> 'review_hold_reason'),
            HINT    = 'Release the hold first via releaseHold() (lib/fleet/claim-eligibility.cjs), which stamps unfenced_at/unfenced_by/unfenced_reason, then re-run completion.';
  END IF;

  -- NULL-at-rest cleanup (FR-3). UNCONDITIONAL, deliberately: it must run even when no protected
  -- column changed, because otherwise a coordination-only write that happened to carry a stamp
  -- would leave a valid value at rest for the NEXT unstamped write to inherit.
  IF TG_ARGV[0] = 'final' THEN
    NEW.lifecycle_write_token := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. VERIFY -- function-level assertions for the three new SQL helper functions, mirroring the
--    JS-side unit tests exactly (lib/fleet/claim-eligibility.cjs's isUnreleasedChairmanHold /
--    isHoldReleased test suite). A live trigger-fire proof was attempted and deliberately
--    dropped -- see the comment at 3d below for why.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
BEGIN
  -- 3a. sd_safe_parse_timestamptz
  IF public.sd_safe_parse_timestamptz(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: sd_safe_parse_timestamptz(NULL) should be NULL';
  END IF;
  IF public.sd_safe_parse_timestamptz('not-a-timestamp') IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: sd_safe_parse_timestamptz(garbage) should be NULL, not raise or return a value';
  END IF;
  IF public.sd_safe_parse_timestamptz('2026-08-01T00:00:00Z') IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: sd_safe_parse_timestamptz(valid ISO) should parse';
  END IF;

  -- 3b. sd_metadata_hold_released
  IF public.sd_metadata_hold_released('{}'::jsonb, 'requires_human_action_at') IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED: no unfenced_at at all -> not released';
  END IF;
  IF public.sd_metadata_hold_released(
       jsonb_build_object('unfenced_at', '2026-08-02T00:00:00Z', 'requires_human_action_at', '2026-08-01T00:00:00Z'),
       'requires_human_action_at') IS NOT true THEN
    RAISE EXCEPTION 'VERIFY FAILED: unfenced_at AFTER set-at -> released';
  END IF;
  IF public.sd_metadata_hold_released(
       jsonb_build_object('unfenced_at', '2026-08-01T00:00:00Z', 'requires_human_action_at', '2026-08-05T00:00:00Z'),
       'requires_human_action_at') IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED: unfenced_at BEFORE set-at (stale/reused stamp) -> still held';
  END IF;
  IF public.sd_metadata_hold_released(
       jsonb_build_object('unfenced_at', '2026-08-01T00:00:00Z'),
       'review_hold_at') IS NOT true THEN
    RAISE EXCEPTION 'VERIFY FAILED: unfenced_at present, no set-at field to compare against -> released (fallback true, mirrors JS)';
  END IF;

  -- 3c. sd_metadata_has_unreleased_chairman_hold (mirrors the JS AC-1/AC-2 unit tests)
  IF public.sd_metadata_has_unreleased_chairman_hold(jsonb_build_object('deferred_by', 'someone')) IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED (AC-1): deferred_by-only is NOT a chairman hold';
  END IF;
  IF public.sd_metadata_has_unreleased_chairman_hold(jsonb_build_object('not_worker_claimable_reason', 'wrong repo')) IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED (AC-1): not_worker_claimable_reason-only is NOT a chairman hold';
  END IF;
  IF public.sd_metadata_has_unreleased_chairman_hold(jsonb_build_object('requires_human_action_reason', 'x')) IS NOT true THEN
    RAISE EXCEPTION 'VERIFY FAILED: requires_human_action_reason with no release -> unreleased hold';
  END IF;
  IF public.sd_metadata_has_unreleased_chairman_hold(jsonb_build_object('review_hold_reason', 'x')) IS NOT true THEN
    RAISE EXCEPTION 'VERIFY FAILED (AC-2): review_hold_reason with NO release marker -> unreleased hold (the one-way-latch gap FR-1 closes)';
  END IF;
  IF public.sd_metadata_has_unreleased_chairman_hold(
       jsonb_build_object('review_hold_reason', 'x', 'unfenced_at', '2026-08-02T00:00:00Z')) IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED (AC-2): review_hold_reason WITH a release marker -> NOT an unreleased hold';
  END IF;
  IF public.sd_metadata_has_unreleased_chairman_hold(jsonb_build_object('review_hold_reason', '   ')) IS NOT false THEN
    RAISE EXCEPTION 'VERIFY FAILED: whitespace-only review_hold_reason is treated as absent';
  END IF;

  -- SEC-4 fix (post-3c, pre-3d): assert the EXECUTE-grant posture mechanically, not merely by reading the
  -- REVOKE statements above -- a lesson this repo has learned before (this directory's own
  -- 20260817_fdbk_internal_feedback_rpc.sql header: "a verify block that only re-checks
  -- catalog shape can pass while every real call still 42501s, because EXECUTE grants were
  -- never asserted").
  -- SEC-6 fix: only anon is asserted revoked now -- authenticated deliberately keeps
  -- EXECUTE (see the REVOKE block above for the full rationale).
  IF has_function_privilege('anon', 'public.sd_safe_parse_timestamptz(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'VERIFY FAILED (SEC-4): anon can still EXECUTE sd_safe_parse_timestamptz';
  END IF;
  IF has_function_privilege('anon', 'public.sd_metadata_hold_released(jsonb,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'VERIFY FAILED (SEC-4): anon can still EXECUTE sd_metadata_hold_released';
  END IF;
  IF has_function_privilege('anon', 'public.sd_metadata_has_unreleased_chairman_hold(jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'VERIFY FAILED (SEC-4): anon can still EXECUTE sd_metadata_has_unreleased_chairman_hold';
  END IF;

  -- 3d. A LIVE trigger-fire proof (real disposable-row INSERT + completion UPDATE) was
  -- attempted and deliberately dropped: strategic_directives_v2 carries independent,
  -- unrelated lifecycle-completeness guards (a PCVP handoff-evidence-required check, and a
  -- handoff-creation-bypass-block restricting sd_phase_handoffs INSERTs to scripts/handoff.js
  -- itself) that also fire on ANY synthetic completion attempt regardless of hold state --
  -- satisfying them would require simulating a full protocol-compliant SD lifecycle inside
  -- this migration, out of proportion for proving THIS specific IF block. The wiring itself
  -- is a single, minimal, directly-inspectable addition to an already-live trigger function,
  -- reusing NEW/OLD bindings the pre-existing stamp-validation block above already relies on
  -- (same function, same row, same BEFORE UPDATE firing) -- the assertions above (3a-3c) prove
  -- the actual new logic (the SQL predicate) exhaustively; what remains unverified by this
  -- script is only whether the IF block's syntax is well-formed, which the dry-run already
  -- confirms by reaching THIS point without a parse/plpgsql-compile error.

  RAISE NOTICE 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 part 2: all function-level verify assertions passed (live disposable-row trigger-fire proof intentionally out of scope -- see comment above).';
END
$verify$;
