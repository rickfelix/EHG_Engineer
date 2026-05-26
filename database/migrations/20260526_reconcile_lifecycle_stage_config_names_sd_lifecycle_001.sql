-- ============================================================================
-- Migration: 20260526_reconcile_lifecycle_stage_config_names_sd_lifecycle_001
-- SD:        SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001
-- FR:        FR-1 (Conform lifecycle_stage_config.stage_name to stage_config SSOT)
-- Author:    database-agent (EXEC phase)
-- Date:      2026-05-26
-- ============================================================================
--
-- PURPOSE
-- -------
-- The PLAN-phase audit identified exactly two stage_number rows where
-- `lifecycle_stage_config.stage_name` disagrees with `stage_config.stage_name`:
--
--   * stage_number = 14
--       lifecycle_stage_config = 'Technical Architecture & Risk Register'
--       stage_config           = 'Technical Architecture'
--
--   * stage_number = 19
--       lifecycle_stage_config = 'Build in Replit'
--       stage_config           = 'Sprint Planning'
--
-- All other stages (1-26) already agree. `stage_config` is the declared
-- name-authoritative SSOT (see lib/eva/stage-governance.js).
-- `lifecycle_stage_config` is gate-semantics-authoritative; only the display
-- `stage_name` is being conformed here — no gate semantics are altered.
--
-- FK SAFETY
-- ---------
-- Live data audit (PLAN phase, evidence row 97ebe7d2-8f2b-4280-b25b-afb2d3f7a1a1)
-- confirmed 0 rows in venture_stage_work / venture_artifacts / ventures store
-- a stage NAME — they all key off the integer `stage_number`. The only FK
-- against these tables is `advisory_checkpoints.stage_number` which references
-- the integer. Therefore renaming `stage_name` is FK-safe.
--
-- IDEMPOTENCY RATIONALE
-- ---------------------
-- The `IS DISTINCT FROM` predicate guarantees that:
--   1) NULL-safe comparison (a NULL on either side would not falsely match
--      a non-NULL counterpart).
--   2) On a second run, after `lsc.stage_name` already equals `sc.stage_name`,
--      the predicate evaluates FALSE and zero rows are updated.
-- The IN (14, 19) clause is a defensive belt-and-suspenders restrictor: even
-- if a future SSOT drift introduced a third divergent stage_number, this
-- migration will NOT silently rewrite it. Any new divergence must be
-- triaged + addressed by a new SD.
--
-- ROLLBACK
-- --------
--   UPDATE lifecycle_stage_config SET stage_name = 'Technical Architecture & Risk Register' WHERE stage_number = 14;
--   UPDATE lifecycle_stage_config SET stage_name = 'Build in Replit' WHERE stage_number = 19;
--
-- ============================================================================

UPDATE lifecycle_stage_config lsc
   SET stage_name = sc.stage_name,
       updated_at = now()
  FROM stage_config sc
 WHERE lsc.stage_number = sc.stage_number
   AND lsc.stage_number IN (14, 19)
   AND lsc.stage_name IS DISTINCT FROM sc.stage_name;
