-- SD-LEO-INFRA-SOURCING-ENGINE-ADAM-DIRECT-REGISTRY-001 (FR-2 enabler)
-- @approved-by: codestreetlabs@gmail.com
-- Prod-apply approval (additive-only) stamped during SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001
-- go-live, chairman-authorized 2026-06-20. Additive CHECK widen; reversible. APPLY BEFORE the
-- vdr_gauge widening (this array omits vdr_gauge; vdr_gauge migration carries the full set).
-- DORMANT (TIER-2): extend roadmap_wave_items.source_type CHECK to admit 'adam_direct', so
-- Adam-direct candidates + ghost-backfill rows can be registered. ADDITIVE + REVERSIBLE (widening a
-- CHECK never invalidates existing rows). Workers do NOT self-apply: Adam applies under the
-- chairman's additive-DDL delegation. Until applied, the engine is dormant-safe (lib/sourcing-engine/
-- adam-direct-registry.js forces dry-run on a 23514 CHECK violation) — it computes what it WOULD
-- register but writes nothing, so the chairman-visible roadmap is never mutated prematurely.
--
-- Pairs with database/migrations/20260619_sourcing_engine_lane_column.sql (the DORMANT lane column);
-- BOTH must be applied before the backfill writes live.

ALTER TABLE roadmap_wave_items
  DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;

ALTER TABLE roadmap_wave_items
  ADD CONSTRAINT roadmap_wave_items_source_type_check
  CHECK (source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text, 'adam_direct'::text]));

COMMENT ON CONSTRAINT roadmap_wave_items_source_type_check ON roadmap_wave_items IS
  'Allowed intake source types. adam_direct added by SD-LEO-INFRA-SOURCING-ENGINE-ADAM-DIRECT-REGISTRY-001 '
  'so Adam-direct candidates + ghost-backfilled Adam SDs can register as roadmap items.';

-- Rollback (only if NO adam_direct rows exist; otherwise widen-only is the safe state):
--   ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;
--   ALTER TABLE roadmap_wave_items ADD CONSTRAINT roadmap_wave_items_source_type_check
--     CHECK (source_type = ANY (ARRAY['todoist'::text, 'youtube'::text, 'brainstorm'::text]));
