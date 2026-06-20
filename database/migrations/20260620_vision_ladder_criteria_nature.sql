-- SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-1)
-- Persist a reviewable `nature` classification on each vision_ladder_criteria row.
-- Additive, nullable, reversible. NULL = un-backfilled / unclassified (never a violation).
-- Source of truth for the classification is OPERATIONAL_NATURE in lib/vision/vdr-registry.js;
-- this column is the queryable, persisted form so coherence can be asserted as data.
-- Mirrors database/migrations/20260619_sd_backlog_map_disposition.sql (additive-column pattern).

ALTER TABLE vision_ladder_criteria
  ADD COLUMN IF NOT EXISTS nature text DEFAULT NULL;

ALTER TABLE vision_ladder_criteria
  DROP CONSTRAINT IF EXISTS chk_vision_ladder_criteria_nature;

ALTER TABLE vision_ladder_criteria
  ADD CONSTRAINT chk_vision_ladder_criteria_nature
  CHECK (nature IS NULL OR nature IN ('buildable', 'operational'));

COMMENT ON COLUMN vision_ladder_criteria.nature IS
  'Deterministic capability classification: buildable (the fleet can ship it) or operational '
  '(requires a live venture / KR / chairman signal). NULL = un-backfilled. Source of truth is '
  'OPERATIONAL_NATURE in lib/vision/vdr-registry.js. SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001.';

-- Backfill: idempotent, keyed on the UNIQUE (rung_id, capability). The 6 OPERATIONAL_NATURE
-- members are 'operational'; everything else is 'buildable'. Only fills rows where nature IS NULL
-- so re-running is a no-op and never clobbers a reviewed value.
UPDATE vision_ladder_criteria c
SET nature = CASE
  WHEN c.capability IN (
    'Solo-operator survivability',
    'A queryable, structured north star',
    'Governance cascade enforced',
    'OKR-driven prioritization + day-28 hard stop',
    'All 7 governance guardrails',
    'Competitive vigilance process established'
  ) THEN 'operational'
  ELSE 'buildable'
END
WHERE c.nature IS NULL;

-- Rollback: ALTER TABLE vision_ladder_criteria DROP CONSTRAINT IF EXISTS chk_vision_ladder_criteria_nature;
--           ALTER TABLE vision_ladder_criteria DROP COLUMN IF EXISTS nature;
