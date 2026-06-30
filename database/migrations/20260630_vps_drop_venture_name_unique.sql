-- Migration: drop the redundant UNIQUE(venture_name) on venture_provisioning_state
-- SD: SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001 (FR-1)
-- @approved-by: codestreetlabs@gmail.com
--
-- ROOT CAUSE (run#10 S19 HARD BLOCKER): venture_provisioning_state has
--   venture_id  UUID PRIMARY KEY        -- per-venture uniqueness ALREADY enforced here
--   venture_name TEXT NOT NULL UNIQUE   -- REDUNDANT + WRONG: names legitimately repeat
-- The clone name generator reuses names (run#10 'MarketLens' == cancelled run#4 'MarketLens'),
-- so the provisioning writer's INSERT hits the venture_name UNIQUE constraint -> S19 bridge can't
-- create the venture tree -> the venture loops stuck at S19.
--
-- FIX: DROP the redundant venture_name UNIQUE constraint. venture_id (PK) remains the sole, correct
-- uniqueness key. NO data migration is needed: the PK already prevents venture_id dupes, and
-- venture_name dupes cannot pre-exist while this very constraint stands. The idx_vps_venture_name
-- lookup index is left in place (it is a plain, NON-unique index — created separately at table
-- creation, NOT backed by this constraint), so name lookups are unaffected.
--
-- Low-risk + reversible: dropping a redundant UNIQUE constraint (re-add with
--   ALTER TABLE venture_provisioning_state ADD CONSTRAINT venture_provisioning_state_venture_name_key UNIQUE (venture_name);
-- if ever needed). Brief ACCESS EXCLUSIVE lock to drop the constraint.

ALTER TABLE venture_provisioning_state
  DROP CONSTRAINT IF EXISTS venture_provisioning_state_venture_name_key;

COMMENT ON COLUMN venture_provisioning_state.venture_name IS
  'Human-readable venture name (NOT unique — names legitimately repeat across ventures, e.g. a clone reusing a cancelled venture''s name). Per-venture uniqueness is enforced by the venture_id PRIMARY KEY. SD-LEO-INFRA-VENTURE-PROVISIONING-NAME-COLLISION-001.';
