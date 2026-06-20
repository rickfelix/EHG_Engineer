-- SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001 (FR-1 / FR-2)
-- Sourcing engine child 2/10 — the schema foundation.
--
-- Adds a SEPARATE, mutable `lane` column (DISTINCT from the terminal `disposition`) to
-- conversion_ledger + roadmap_wave_items. `lane` is the routing state the router (child 1)
-- computes and every downstream child (register-first stamping, dedup-autostamp, populator)
-- writes; `disposition` stays the terminal outcome. The two axes must not be overloaded.
--
-- DORMANT: the fleet AUTHORS and TESTS this migration; workers CANNOT self-apply prod. This is an
-- ADDITIVE, nullable column with an additive CHECK — Adam applies it via the database-agent under the
-- chairman's additive-DDL delegation. It is NOT chairman-gated (an additive nullable column needs no
-- RLS policy; the chairman is only paged when an RLS policy is required). Until applied, the engine
-- fail-softs: a writer that finds the column absent degrades rather than erroring.
--
-- Idempotent (IF NOT EXISTS / DROP-then-ADD constraint) so a re-run is a no-op.

ALTER TABLE conversion_ledger  ADD COLUMN IF NOT EXISTS lane text;
ALTER TABLE roadmap_wave_items ADD COLUMN IF NOT EXISTS lane text;

-- Additive CHECK: the 5 canonical lanes + 'decline'. 'blocked-on-X' is parametric (the suffix names
-- the blocker), so it is matched by prefix with at least one suffix char (`blocked-on-_%`). NULL is
-- allowed (lane absent => engine degrades). This must stay in lockstep with lib/sourcing-engine/lane.js
-- (FIXED_LANES + isValidLane); the lib's lane test pins the vocabulary.
ALTER TABLE conversion_ledger  DROP CONSTRAINT IF EXISTS conversion_ledger_lane_check;
ALTER TABLE conversion_ledger  ADD  CONSTRAINT conversion_ledger_lane_check
  CHECK (
    lane IS NULL
    OR lane IN ('belt-ready', 'chairman-gated', 'outcome-gated', 'dedup', 'decline')
    OR lane LIKE 'blocked-on-_%'
  );

ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_lane_check;
ALTER TABLE roadmap_wave_items ADD  CONSTRAINT roadmap_wave_items_lane_check
  CHECK (
    lane IS NULL
    OR lane IN ('belt-ready', 'chairman-gated', 'outcome-gated', 'dedup', 'decline')
    OR lane LIKE 'blocked-on-_%'
  );

COMMENT ON COLUMN conversion_ledger.lane  IS 'Sourcing-engine routing lane (mutable; SEPARATE from terminal disposition). Vocab: lib/sourcing-engine/lane.js. SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001.';
COMMENT ON COLUMN roadmap_wave_items.lane IS 'Sourcing-engine routing lane (mutable; SEPARATE from terminal item_disposition). Vocab: lib/sourcing-engine/lane.js. SD-LEO-INFRA-SOURCING-ENGINE-LEDGER-LANE-COLUMN-001.';
