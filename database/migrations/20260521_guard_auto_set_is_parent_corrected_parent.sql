-- Migration: SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001 (D3 — closes feedback 44b3621b)
-- Guard auto_set_is_parent() against re-promoting a deliberately-corrected parent.
--
-- ============================================================================
-- FRAMING CORRECTION (the feedback 44b3621b premise was wrong)
-- ============================================================================
-- The live auto_set_is_parent() does NOT throw. It writes a metadata JSONB key
-- (metadata || '{"is_parent": true}') on the parent referenced by NEW.parent_sd_id;
-- it does NOT reference a non-existent is_parent COLUMN. Verified read-only 2026-05-21.
--
-- PROBLEM: once a parent's is_parent is deliberately corrected to false (recorded by the
-- companion writer scripts/correct-sd-is-parent.mjs into
-- governance_metadata.is_parent_change_history), the existing trigger silently
-- re-promotes it to true on the next child parent_sd_id write, because the WHERE clause
-- only checks metadata->>'is_parent' != 'true' (which a 'false' value satisfies).
--
-- FIX (additive — CREATE OR REPLACE, no DROP, idempotent): the nested UPDATE skips a
-- parent whose MOST-RECENT is_parent_change_history entry has to=false. Mirrors
-- enforce_parent_orchestrator_type (SD-FDBK-GEN-FIX-TRG-ENFORCE-001 / PR #3815) but uses
-- MOST-RECENT-WINS semantics (not sticky any-to=false): is_parent legitimately re-flips to
-- true when a real child re-attaches, so a later genuine correction can re-promote.
--
-- VERIFICATION (read-only / rolled-back tx, this DB, 2026-05-21, DATABASE sub-agent):
--   * Recursion-safe: the nested UPDATE writes only metadata (attnum 31); both
--     trg_auto_set_is_parent and trg_enforce_parent_orchestrator_type fire only on
--     UPDATE OF parent_sd_id (attnum 47) -> no re-fire, no infinite loop.
--   * No governance/gaming-trigger abort: sd_type is untouched.
--   * Zero collateral: 0 rows currently carry governance_metadata.is_parent_change_history,
--     so the guard is a pure no-op on existing data until the writer records a correction;
--     the 25 referenced parents with is_parent != true carry no marker and still auto-set.
--
-- APPLY PATH (Windows direct pg): set DISABLE_SSL_VERIFY=true.
-- APPLY-TO-PROD is gated on explicit user go. Do NOT apply automatically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_set_is_parent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.parent_sd_id IS NOT NULL THEN
    UPDATE strategic_directives_v2 AS p
    SET metadata = COALESCE(p.metadata, '{}'::jsonb) || '{"is_parent": true}'::jsonb
    WHERE p.id = NEW.parent_sd_id
      AND (p.metadata->>'is_parent' IS NULL OR p.metadata->>'is_parent' != 'true')
      -- SD-LEO-INFRA-DATABASE-SCHEMA-OBJECT-001: do NOT re-promote a parent whose
      -- most-recent deliberate is_parent correction set it to false. Most-recent-wins
      -- (not sticky) so a later genuine re-parenting can still re-promote.
      AND COALESCE((
        SELECT (h.elem->>'to')
        FROM jsonb_array_elements(
               COALESCE(p.governance_metadata->'is_parent_change_history', '[]'::jsonb)
             ) WITH ORDINALITY AS h(elem, ord)
        ORDER BY (h.elem->>'changed_at') DESC NULLS LAST, h.ord DESC
        LIMIT 1
      ), 'true') <> 'false';
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- ROLLBACK (restore the prior body — no corrected-parent guard):
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.auto_set_is_parent()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- BEGIN
--   IF NEW.parent_sd_id IS NOT NULL THEN
--     UPDATE strategic_directives_v2
--     SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_parent": true}'::jsonb
--     WHERE id = NEW.parent_sd_id
--       AND (metadata->>'is_parent' IS NULL OR metadata->>'is_parent' != 'true');
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
