-- SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001 (FR-1)
-- Canonical north-star contract: the single queryable target-of-record (vision-ladder
-- ordinal 11) the cockpit gauges (ord 2/3/4) bind to instead of each inventing its own
-- target. ADDITIVE ONLY — a new table, no ALTER of existing tables, NO RLS/policy (keeps
-- this TIER-1). The single chairman-ratified row is populated by a separate data step
-- (scripts/populate-north-star.mjs) so this DDL stays purely additive.
--
-- The contract fields mirror docs/04_features/ehg-northstar-contract-phase0.md §5a.

CREATE TABLE IF NOT EXISTS north_star (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition          TEXT NOT NULL,
  metric              TEXT NOT NULL,
  target              JSONB NOT NULL,                 -- { amount, unit, qualifier }
  sustain             TEXT,                           -- e.g. '6 consecutive qualifying months'
  measurement_source  TEXT,                           -- pointer to where current_value is read
  cadence             TEXT,                           -- how often the value is recomputed
  status              TEXT NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'chairman_ratified', 'amended')),
  provenance          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE north_star IS
  'Canonical north-star contract (vision-ladder ordinal 11): the single chairman-ratified target-of-record the cockpit gauges bind to. Read via lib/vision/north-star.js getNorthStar(). SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001.';

-- At most one ACTIVE canonical record: only one row may be chairman_ratified at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_north_star_one_ratified
  ON north_star ((status))
  WHERE status = 'chairman_ratified';
