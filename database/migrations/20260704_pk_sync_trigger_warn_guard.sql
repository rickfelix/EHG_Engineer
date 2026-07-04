-- @approved-by: codestreetlabs@gmail.com
-- SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003 (F-6): observability guard for the
-- PK-mutating twin-column sync triggers on strategic_directives_v2.
--
-- sync_sd_code_user_facing / sync_uuid_internal_pk bidirectionally sync
-- id<->sd_code_user_facing and uuid_id<->uuid_internal_pk. A write to the
-- "alias" column (sd_code_user_facing / uuid_internal_pk) silently rewrites
-- the real PK/FK-bearing column (id / uuid_id) with no trace.
--
-- A full repo-wide consumer audit (2026-07-04) found:
--   - both triggers' INSERT null-fill branch is a genuine, test-guarded live
--     dependency of lib/sourcing-engine/refill-auto-promote.js -- removing
--     it breaks auto-refill promotion (NOT NULL violation).
--   - zero live consumers rely on the dangerous UPDATE PK-rewrite branch.
--   - uuid_id (not uuid_internal_pk) is the real FK target for 5+ tables
--     (sd_wall_states, sd_transition_audit, sd_kickbacks, sd_gate_results,
--     sd_corrections, capability_reuse_log), so the sync trigger's
--     defensive value (preventing uuid_id/uuid_internal_pk divergence) is
--     real and must be preserved.
-- Full retirement is therefore NOT yet safe (mirrors the F-5 precedent) --
-- this migration adds a RAISE WARNING to the dangerous UPDATE branch ONLY.
-- No propagation direction, no INSERT-branch behavior, changes.
-- Date: 2026-07-04

CREATE OR REPLACE FUNCTION public.sync_sd_code_user_facing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- If id is updated, sync to sd_code_user_facing (unchanged)
    IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
        NEW.sd_code_user_facing := NEW.id;
    END IF;

    -- If sd_code_user_facing is updated, sync to id (unchanged behavior;
    -- SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003: now WARNs since this rewrites the PK)
    IF TG_OP = 'UPDATE' AND NEW.sd_code_user_facing IS DISTINCT FROM OLD.sd_code_user_facing THEN
        RAISE WARNING 'sync_sd_code_user_facing: sd_code_user_facing write on row id=% rewrote primary key id % -> %',
            OLD.id, OLD.id, NEW.sd_code_user_facing;
        NEW.id := NEW.sd_code_user_facing;
    END IF;

    -- For inserts, ensure both columns have the same value (unchanged)
    IF TG_OP = 'INSERT' THEN
        IF NEW.sd_code_user_facing IS NULL THEN
            NEW.sd_code_user_facing := NEW.id;
        ELSIF NEW.id IS NULL THEN
            NEW.id := NEW.sd_code_user_facing;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_uuid_internal_pk()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.uuid_id IS DISTINCT FROM OLD.uuid_id THEN
        NEW.uuid_internal_pk := NEW.uuid_id;
    END IF;

    -- SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003: now WARNs since this rewrites the
    -- FK-bearing uuid_id column (unchanged propagation behavior otherwise)
    IF TG_OP = 'UPDATE' AND NEW.uuid_internal_pk IS DISTINCT FROM OLD.uuid_internal_pk THEN
        RAISE WARNING 'sync_uuid_internal_pk: uuid_internal_pk write on row id=% rewrote FK-bearing uuid_id % -> %',
            NEW.id, OLD.uuid_id, NEW.uuid_internal_pk;
        NEW.uuid_id := NEW.uuid_internal_pk;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.uuid_internal_pk IS NULL THEN
            NEW.uuid_internal_pk := NEW.uuid_id;
        ELSIF NEW.uuid_id IS NULL THEN
            NEW.uuid_id := NEW.uuid_internal_pk;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'sync_sd_code_user_facing') NOT LIKE '%RAISE WARNING%' THEN
    RAISE EXCEPTION 'FAILED: sync_sd_code_user_facing missing the warn guard';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'sync_uuid_internal_pk') NOT LIKE '%RAISE WARNING%' THEN
    RAISE EXCEPTION 'FAILED: sync_uuid_internal_pk missing the warn guard';
  END IF;
  RAISE NOTICE 'SUCCESS: PK-rewrite warn guard applied to both twin-column sync triggers';
END $$;
