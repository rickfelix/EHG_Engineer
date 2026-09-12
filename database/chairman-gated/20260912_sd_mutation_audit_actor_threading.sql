-- @chairman-gated
-- SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001 -- thread the acting session into created_by for the
-- sd_mutation_audit trigger. Today COALESCE(current_setting('app.actor', true), session_user)
-- always falls through to session_user (postgres for direct-pg writers, authenticator for
-- PostgREST writers) because nothing in the codebase ever calls set_config('app.actor', ...) --
-- confirmed zero producers by Explore evidence at LEAD (stored sub_agent_execution_results,
-- evidence row 4f3317cb-40df-45df-8d59-644a4dc1481a).
--
-- This migration adds a second-priority fallback: current_setting('request.headers', true)
-- ::json ->> 'x-actor-session'. That path is NOT a guess -- it was proven readable end-to-end by a
-- live PLAN-phase spike: a throwaway probe table with a BEFORE INSERT trigger reading
-- current_setting('request.headers', true), a real supabase-js createClient() call with
-- global.headers = {'x-actor-session': '<value>'} against the live PostgREST endpoint, and the
-- inserted row's trigger-captured column holding the exact header value (session_user_at_write
-- was 'authenticator', confirming this is exactly the attribution gap being closed). Falls back to
-- session_user (unchanged behavior, the pre-existing fallback) when neither source is set.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only.
--   WHY chairman-gated rather than database/migrations/: CREATE OR REPLACE FUNCTION on an existing
--   TRIGGER's function -- lands in scripts/lib/migration-tier-classifier.mjs's TIER-2 set (measured
--   reason: embedded_semicolon_ambiguity). A same-name function replacement reads APPLIED to the
--   classifier by object existence alone (QF-20260912-708/-533) -- the ceremony ledger row is the
--   real apply evidence, not object existence. metadata.migration_files on the SD declares this
--   file explicitly.
--
-- THREAT MODEL, STATED EXPLICITLY (VALIDATION finding): this makes audit attribution
-- ATTRIBUTABLE, not TAMPER-PROOF. Anyone who can set CLAUDE_SESSION_ID / LEO_ACTOR_ROLE_TAG in
-- the writing process's env, or forge an x-actor-session header on a PostgREST request, picks
-- the recorded actor. No untrusted-input path exists today (set_config is parameterized; zero
-- callers forward an inbound/attacker-controlled header wholesale into a Supabase client), but
-- this is a record of WHO SAID they acted, not a cryptographic proof of who acted.
--
-- SEARCH_PATH (VALIDATION finding): CREATE OR REPLACE FUNCTION resets proconfig (including any
-- search_path pinned by a separate ALTER FUNCTION, e.g. 20260831_pin_search_path_log_sd_mutation_
-- audit.sql) to NULL. Both functions below pin search_path INLINE so the pin cannot be silently
-- lost regardless of migration-apply ordering, and so the new unqualified call to
-- resolve_sd_mutation_audit_actor() from inside the SECURITY DEFINER body is not a schema-
-- shadowing vector (the CVE-2018-1058 class the 20260831 migration exists to close).
--
-- ACL (VALIDATION finding): resolve_sd_mutation_audit_actor() is SECURITY INVOKER with no
-- SECURITY DEFINER clause. Postgres grants EXECUTE to PUBLIC by default, and this project's
-- anon/authenticated roles inherit PUBLIC's grants -- so PostgREST would expose it as an
-- anon-callable RPC. Explicitly revoked below (first new public non-trigger function to need
-- this in this codebase). The sole real caller, log_sd_mutation_audit(), is SECURITY DEFINER
-- and retains EXECUTE as its owner.
--
-- Rollback: 20260912_sd_mutation_audit_actor_threading_DOWN.sql -- restores the exact prior
-- function body from 20260802_sd_mutation_audit_trigger.sql (applied 2026-08-11) and drops the
-- new helper function.

CREATE OR REPLACE FUNCTION resolve_sd_mutation_audit_actor()
RETURNS TABLE(actor_id text, actor_source text) AS $$
DECLARE
  v_app_actor text;
  v_header_actor text;
BEGIN
  v_app_actor := current_setting('app.actor', true);
  IF v_app_actor IS NOT NULL AND v_app_actor <> '' THEN
    RETURN QUERY SELECT v_app_actor, 'app.actor'::text;
    RETURN;
  END IF;

  -- request.headers is PostgREST-populated JSON; guard the cast so a malformed/absent value
  -- never aborts the governed write it is only meant to ATTRIBUTE.
  BEGIN
    v_header_actor := current_setting('request.headers', true)::json ->> 'x-actor-session';
  EXCEPTION WHEN OTHERS THEN
    v_header_actor := NULL;
  END;
  IF v_header_actor IS NOT NULL AND v_header_actor <> '' THEN
    RETURN QUERY SELECT v_header_actor, 'request.headers'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT session_user::text, 'session_user'::text;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

COMMENT ON FUNCTION resolve_sd_mutation_audit_actor() IS
'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001: prioritized actor resolution for governed-field audit '
'attribution -- app.actor (direct-pg writers), then request.headers x-actor-session (PostgREST '
'writers), then session_user (unattributed fallback, unchanged behavior).';

-- VALIDATION finding: this is a new public, non-trigger function -- without an explicit REVOKE it
-- ships anon/authenticated-EXECUTE-able via PostgREST RPC (Postgres grants EXECUTE to PUBLIC by
-- default). Its sole real caller (log_sd_mutation_audit(), SECURITY DEFINER, owned by postgres)
-- retains EXECUTE as the owning role regardless of this REVOKE.
REVOKE EXECUTE ON FUNCTION resolve_sd_mutation_audit_actor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION log_sd_mutation_audit()
RETURNS TRIGGER AS $$
DECLARE
  changed TEXT;
  old_j JSONB;
  new_j JSONB;
  v_actor_id TEXT;
  v_actor_source TEXT;
BEGIN
  SELECT actor_id, actor_source INTO v_actor_id, v_actor_source FROM resolve_sd_mutation_audit_actor();

  -- One row per CHANGED FIELD rather than one row per UPDATE carrying a diff: a reader asking
  -- "when did this SD's claim change" should not have to parse a blob that also contains a phase
  -- change. Matches how the existing sd_type writer records a single field.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    changed := 'status';
    old_j := jsonb_build_object('status', OLD.status);
    new_j := jsonb_build_object('status', NEW.status);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES ('sd_status_change', 'strategic_directive', NEW.sd_key, old_j, new_j,
            jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id, 'actor_source', v_actor_source),
            'info', v_actor_id);
  END IF;

  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    changed := 'current_phase';
    old_j := jsonb_build_object('current_phase', OLD.current_phase);
    new_j := jsonb_build_object('current_phase', NEW.current_phase);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES ('sd_phase_transition', 'strategic_directive', NEW.sd_key, old_j, new_j,
            jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id, 'actor_source', v_actor_source),
            'info', v_actor_id);
  END IF;

  -- Claim ACQUIRE and RELEASE are both recorded. Release is the direction that matters
  -- operationally: the untraced mutations that motivated the original SD included a stale
  -- claiming_session_id clear, and a claim that vanished with no record is the shape that makes a
  -- stranded SD impossible to attribute afterwards.
  IF NEW.claiming_session_id IS DISTINCT FROM OLD.claiming_session_id THEN
    changed := 'claiming_session_id';
    old_j := jsonb_build_object('claiming_session_id', OLD.claiming_session_id);
    new_j := jsonb_build_object('claiming_session_id', NEW.claiming_session_id);
    INSERT INTO audit_log (event_type, entity_type, entity_id, old_value, new_value, metadata, severity, created_by)
    VALUES (
      CASE WHEN NEW.claiming_session_id IS NULL THEN 'sd_claim_released' ELSE 'sd_claim_acquired' END,
      'strategic_directive', NEW.sd_key, old_j, new_j,
      jsonb_build_object('field', changed, 'trigger', 'trg_sd_mutation_audit', 'sd_id', NEW.id, 'actor_source', v_actor_source),
      'info', v_actor_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

COMMENT ON FUNCTION log_sd_mutation_audit() IS
'SD-LEO-INFRA-AUDIT-LOG-MUTATION-BLIND-001 FR-1 + SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001: writes an '
'audit_log row per changed governed field (status, current_phase, claiming_session_id) with '
'old_value/new_value populated and created_by attributed via resolve_sd_mutation_audit_actor() '
'(app.actor -> request.headers x-actor-session -> session_user).';

-- Trigger itself is unchanged (same WHEN clause, same function name) -- re-declared only so this
-- file is self-contained and independently re-appliable.
DROP TRIGGER IF EXISTS trg_sd_mutation_audit ON strategic_directives_v2;
CREATE TRIGGER trg_sd_mutation_audit
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.current_phase IS DISTINCT FROM NEW.current_phase
    OR OLD.claiming_session_id IS DISTINCT FROM NEW.claiming_session_id
  )
  EXECUTE FUNCTION log_sd_mutation_audit();
