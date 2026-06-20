-- SD-LEO-INFRA-SOURCING-ENGINE-GAUGE-GAP-MINER-001 (FR-2 enabler)
-- @approved-by: codestreetlabs@gmail.com
-- Prod-apply approval (additive-only) stamped during SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001
-- go-live, chairman-authorized 2026-06-20. Additive CHECK widen (full set incl adam_direct+vdr_gauge);
-- reversible. APPLY LAST (after adam_direct) — this array is the complete allowed set.
-- DORMANT (TIER-2): extend roadmap_wave_items.source_type CHECK to admit 'vdr_gauge', so the gauge-gap
-- miner can register STAGED candidates (one per unbuilt/partial active-rung capability) as roadmap
-- items. ADDITIVE + REVERSIBLE (widening a CHECK never invalidates existing rows). Workers do NOT
-- self-apply: Adam applies under the chairman's additive-DDL delegation. Until applied, the engine is
-- dormant-safe (lib/sourcing-engine/gauge-gap-miner.js forces dry-run on a 23514 CHECK violation) — it
-- computes what it WOULD stage but writes nothing, so the chairman-visible roadmap is never mutated
-- prematurely.
--
-- Pairs with database/migrations/20260619_sourcing_engine_lane_column.sql (the DORMANT lane column);
-- BOTH must be applied before the miner stages live. Stacks on the adam_direct widening
-- (20260620_roadmap_wave_items_adam_direct_source_type.sql) — order-independent (each re-creates the
-- full allowed set), but the array below MUST include every previously-admitted value.

ALTER TABLE roadmap_wave_items
  DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;

ALTER TABLE roadmap_wave_items
  ADD CONSTRAINT roadmap_wave_items_source_type_check
  CHECK (source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text, 'adam_direct'::text, 'vdr_gauge'::text]));

COMMENT ON CONSTRAINT roadmap_wave_items_source_type_check ON roadmap_wave_items IS
  'Allowed intake source types. vdr_gauge added by SD-LEO-INFRA-SOURCING-ENGINE-GAUGE-GAP-MINER-001 '
  'so the VDR gauge-gap miner can register STAGED capability-gap candidates as roadmap items.';

-- Rollback (only if NO vdr_gauge rows exist; otherwise widen-only is the safe state):
--   ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;
--   ALTER TABLE roadmap_wave_items ADD CONSTRAINT roadmap_wave_items_source_type_check
--     CHECK (source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text, 'adam_direct'::text]));
