-- SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-3 — REVOKE EXECUTE on
-- public.sd_canonical_writer_policy(text) for PUBLIC and anon.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CHAIRMAN-GATED. Corrected scope (PUBLIC, anon — excluding authenticated) chairman-ratified:
-- morning ruling #1 'A' (2026-08-25) + ratification-sitting packet ruling 4-APPROVE BOTH, fresh
-- verbal 'A' in-terminal. Scribed by Adam per CLAUDE_ADAM.md §3c. Applies strictly AFTER the choke.
-- @approved-by: codestreetlabs@gmail.com
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- PROVENANCE AND SCOPE CORRECTION (read before approving):
--
-- database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql (R5,
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001) creates public.sd_canonical_writer_policy(text)
-- but only GRANTs EXECUTE to service_role and authenticated (that file's line ~433) -- it never
-- REVOKEs the default EXECUTE grant Postgres extends to PUBLIC on function creation, which a
-- secdef lint independently flagged as a real gap (scripts/lint/secdef-execute-revoke-allowlist.json).
-- The chairman separately ratified authoring this addendum: chairman_decisions.id e1da09a3,
-- sms_relay_staging rows 45411c8a (body "A", received_at 2026-08-24T16:16:08.848Z) and fc671c59
-- (body "Go and ratify", received_at 2026-08-24T16:25:40.363Z) -- both timestamps pasted verbatim
-- from that table, correcting an earlier narrated-but-instrument-contradicted 16:41-16:46Z window.
--
-- THAT RATIFICATION'S OWN TEXT NAMED "FROM PUBLIC, anon, authenticated" -- this file deliberately
-- narrows that to PUBLIC, anon ONLY. Prospective TESTING (SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001,
-- evidence 142015b2, re-verified 838b982d) measured that both
-- public.enforce_canonical_lifecycle_write() and public.sd_canonical_writer_policy(text) are
-- SECURITY INVOKER (neither declares SECURITY DEFINER), so the guard trigger runs as whichever
-- role performs the UPDATE -- exactly the invariant the choke file's own header states at
-- lines ~427-432 ("every role that can UPDATE this table must be able to call the registry").
-- Live pg_policies on strategic_directives_v2 confirm 'authenticated' genuinely has direct UPDATE
-- access via 2 policies (strategic_directives_v2_service_role_access, cmd=ALL;
-- venture_update_strategic_directives_v2, cmd=UPDATE). Revoking EXECUTE from 'authenticated' would
-- make the guard trigger raise 42501 (insufficient_privilege) on every such live write -- fail-closed
-- inside a BEFORE ROW trigger, and 42501 is NOT the app's own SDCW1 code, so
-- scripts/modules/handoff/lib/canonical-writer-stamp.js's isCanonicalWriteRejection() would not
-- recognize the failure, silently swallowing it in any caller that only branches on SDCW1.
--
-- PUBLIC and anon carry no legitimate call path to this function. CORRECTION (SECURITY re-
-- verification, evidence e9545112, finding S1): an earlier draft of this note claimed "anon has no
-- UPDATE grant on the table at all" -- that is FALSE. Live measurement: anon DOES hold a table-
-- level UPDATE grant on strategic_directives_v2. The real reason anon cannot reach a live write is
-- Row-Level Security: relrowsecurity=true on the table, and the only anon-facing policy is
-- anon_read_strategic_directives_v2 (cmd=SELECT) -- there is no anon UPDATE policy, so any anon
-- UPDATE matches zero rows and the guard trigger never fires (RLS filters before the trigger sees a
-- row). The safety of narrowing this REVOKE to exclude anon-breakage-risk therefore rests
-- specifically on RLS-for-anon, not on an absent table grant -- if an anon UPDATE policy were ever
-- added to this table without re-reviewing this file, that reasoning would need re-verification.
-- Revoking EXECUTE from PUBLIC/anon is still inert exactly as the original ratification intended --
-- the narrowing removes only the part of the originally-named scope that would have broken
-- production, not the part that closes the real gap.
--
-- This correction is flagged for RE-RATIFICATION, not silently substituted: the chairman approved
-- authoring a REVOKE addendum in principle (e1da09a3), but the specific corrected scope below
-- (PUBLIC, anon -- excluding authenticated) has not itself been chairman-approved yet. Signaled
-- non-blocking via /signal spec-conflict (55488b41) and /signal stuck (dbedbac6).
--
-- Apply only after this file's own @approved-by header is filled in by the chairman/coordinator,
-- following the same ceremony as the choke file itself (database/chairman-gated/README.md).
--
-- CEREMONY ORDERING (SECURITY re-verification, evidence e9545112, finding S2): this file MUST apply
-- strictly AFTER the choke file itself -- sd_canonical_writer_policy(text) does not exist in pg_proc
-- until the choke file creates it, so applying this REVOKE first raises 42883 (undefined_function),
-- fail-closed but asymmetric with the choke file's own PRE-condition discipline. The $precondition$
-- block below makes that ordering requirement explicit rather than relying on operator discipline.
--
-- DOWN-CYCLE COUPLING (same finding, S2): database/chairman-gated/20260824_strategic_directives_
-- canonical_writer_choke_DOWN.sql DROPs sd_canonical_writer_policy entirely. A DOWN-then-re-apply
-- cycle of the choke file would silently revert THIS file's REVOKE too -- Postgres restores the
-- default PUBLIC EXECUTE grant on a fresh CREATE (only CREATE OR REPLACE preserves an existing ACL,
-- and DROP+CREATE is not that). Nothing currently re-arms this REVOKE automatically after such a
-- cycle, and scripts/lint/secdef-execute-revoke-allowlist.json still allowlists this function, so
-- the secdef-execute-revoke-lint would NOT flag the regression. Any ceremony that runs the choke
-- file's DOWN migration must re-apply this file afterward -- called out here so it lands on the
-- ceremony checklist, not rediscovered live.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'sd_canonical_writer_policy'
  ) THEN
    RAISE EXCEPTION 'sd_canonical_writer_policy REVOKE addendum: the function does not exist yet -- apply database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql FIRST. Refusing to proceed out of order.';
  END IF;
END
$precondition$;

REVOKE EXECUTE ON FUNCTION public.sd_canonical_writer_policy(text) FROM PUBLIC, anon;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- $verify$ — STRUCTURAL POST-CONDITIONS, RUN AS PART OF THE APPLY ITSELF
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Read-only assertions about the grant surface after the REVOKE above. Fails closed if the
-- narrowed scope did not land, or if it accidentally also stripped a role it should not have.
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'sd_canonical_writer_policy'
       AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'sd_canonical_writer_policy REVOKE addendum: PUBLIC still holds EXECUTE — refusing to consider this applied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'sd_canonical_writer_policy'
       AND grantee = 'anon' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'sd_canonical_writer_policy REVOKE addendum: anon still holds EXECUTE — refusing to consider this applied';
  END IF;

  -- The corrected scope's whole point: authenticated must be UNAFFECTED by this file.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'sd_canonical_writer_policy'
       AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'sd_canonical_writer_policy REVOKE addendum: authenticated LOST EXECUTE — this is the exact production-breaking regression this file exists to avoid. Refusing to consider this applied.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'sd_canonical_writer_policy'
       AND grantee = 'service_role' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'sd_canonical_writer_policy REVOKE addendum: service_role LOST EXECUTE — refusing to consider this applied';
  END IF;
END
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Re-grants exactly what this file revoked. Does not touch service_role/authenticated, which this
-- file never revoked in the first place.
--
--   GRANT EXECUTE ON FUNCTION public.sd_canonical_writer_policy(text) TO PUBLIC;
--
-- (anon inherits EXECUTE back from PUBLIC once PUBLIC has it again; no separate anon GRANT needed,
-- mirroring how it never had one before this file's REVOKE.)
