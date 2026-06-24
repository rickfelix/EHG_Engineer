-- SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 (FR-1)
-- ADDITIVE, REVERSIBLE constraint widen. No data backfill, no row changes.
--
-- Widens the competitive_baselines.epistemic_tag CHECK contract by exactly ONE value: adds 'OBSERVED'
-- to the existing allowed set (FACT/ASSUMPTION/SIMULATION/UNKNOWN). This unblocks inserting OBSERVED
-- baselines, which the vdr-registry OBSERVED gauge (lib/vision/vdr-registry.js:209 — probes
-- competitive_baselines for epistemic_tag='OBSERVED', min:1) requires to ever go green. Today the
-- constraint makes an OBSERVED insert impossible, so the gauge can never reach >=1.
--
-- Live constraint confirmed (information_schema / pg_constraint) as:
--   competitive_baselines_epistemic_tag_check
--   CHECK ((epistemic_tag = ANY (ARRAY['FACT'::text,'ASSUMPTION'::text,'SIMULATION'::text,'UNKNOWN'::text])))
-- The constraint was created via an unversioned/direct apply (no prior repo migration); this file is
-- its first versioned definition, so DROP CONSTRAINT IF EXISTS is the safe path.
--
-- RETAINED TEETH: the set is WIDENED by one value, not removed — any tag outside the 5-value set
-- still rejects.
--
-- DORMANT: the fleet AUTHORS + TESTS this migration; workers CANNOT self-apply prod. Additive CHECK
-- widen — applied via the database-agent under the chairman's additive-DDL delegation
-- (MIGRATION_APPLY_TOKEN). Recorded as a follow-up; NOT chairman-gated (no RLS policy involved).
--
-- Idempotent (DROP IF EXISTS then ADD) so a re-run is a no-op.

ALTER TABLE competitive_baselines
  DROP CONSTRAINT IF EXISTS competitive_baselines_epistemic_tag_check;

ALTER TABLE competitive_baselines
  ADD CONSTRAINT competitive_baselines_epistemic_tag_check
  CHECK (epistemic_tag = ANY (ARRAY['FACT'::text, 'ASSUMPTION'::text, 'SIMULATION'::text, 'UNKNOWN'::text, 'OBSERVED'::text]));

-- ROLLBACK (reversible — restores the prior 4-value contract; only safe if no OBSERVED rows exist):
--   ALTER TABLE competitive_baselines DROP CONSTRAINT IF EXISTS competitive_baselines_epistemic_tag_check;
--   ALTER TABLE competitive_baselines ADD CONSTRAINT competitive_baselines_epistemic_tag_check
--     CHECK (epistemic_tag = ANY (ARRAY['FACT'::text,'ASSUMPTION'::text,'SIMULATION'::text,'UNKNOWN'::text]));
