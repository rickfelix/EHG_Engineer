-- SUPERSEDED / RETIRED — DO NOT APPLY.
-- Original: SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-4 — canonicalize
-- stage_config.gate_type on lifecycle_stage_config.work_type.
--
-- RETIRED by SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001 (2026-06-15):
-- This migration references public.lifecycle_stage_config and public.stage_config,
-- which were INTENTIONALLY DROPPED on 2026-05-30 by
-- SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F (20260530_childF_drop_legacy_stage_tables.sql)
-- after their data was unified into the canonical superset table public.venture_stages.
-- It NEVER successfully applied to the live DB (only FAILED apply rows:
-- "relation public.lifecycle_stage_config does not exist").
--
-- Its functional intent is ALREADY delivered in the consolidated DB:
--   * canonical_rule(text, text) was re-created BYTE-IDENTICALLY by
--     20260529_create_venture_stages_unified.sql FR-2, and
--   * the gate_type/work_type canonicalization is enforced natively by the
--     venture_stages_canonical_rule_check CHECK constraint on venture_stages.
-- Nothing remains to port. canonical_rule() MUST NOT be dropped — it is a LIVE
-- dependency of venture_stages_canonical_rule_check.
--
-- Body neutralized to a self-skipping no-op so the deploy-drift verifier and the
-- pending-migrations pre-check stop retrying a migration that can never apply
-- post-consolidation. Re-creating lifecycle_stage_config would re-split the SSOT
-- and re-introduce the exact writer-consumer asymmetry the unification fixed.

DO $superseded$
BEGIN
  RAISE NOTICE 'SKIPPED: 20260519_canonicalize_stage_config_gate_type is SUPERSEDED by SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001 (venture_stages is the SSOT; canonical_rule already live). No-op — never applicable post-consolidation.';
END
$superseded$;
