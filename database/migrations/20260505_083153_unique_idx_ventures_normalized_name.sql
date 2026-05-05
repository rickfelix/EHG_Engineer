-- Unique partial index on normalized venture name to prevent collision at write-time.
-- SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A / PA-3 (validation C5 + database-agent R3)
--
-- Why: The DB-derived registry uses NFKC + lowercase + alphanumeric-strip
-- normalization to resolve name-style mismatches (e.g., 'CommitCraft AI' ↔
-- 'commitcraft-ai'). Two ventures normalizing to the same key would silently
-- corrupt registry lookups. This unique partial index prevents that at write-
-- time; the resolver's collision throw is defense-in-depth on top of this.
--
-- Filter `deleted_at IS NULL` so soft-deleted ventures don't block re-creation
-- under the same name (cancellation + relaunch flow).
--
-- Filter `status IN ('active','paused')` so cancelled/archived ventures don't
-- block new ventures under the same name (matches the view's filter for
-- consistency).
--
-- COLLATE "C" ensures locale-deterministic uniqueness across servers.
-- Postgres NORMALIZE() applies Unicode NFKC normalization (per security-agent C-SEC-1).

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventures_normalized_name
  ON ventures (
    LOWER(REGEXP_REPLACE(NORMALIZE(name, NFKC), '[^A-Za-z0-9]', '', 'g')) COLLATE "C"
  )
  WHERE deleted_at IS NULL AND status IN ('active', 'paused');

COMMENT ON INDEX idx_ventures_normalized_name IS
'Unique partial index enforcing portfolio name uniqueness after NFKC + alphanumeric normalization. Prevents the registry collision class at write-time. Defense-in-depth pair: resolver throws VentureRegistryCollisionError if collision somehow lands. SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A.';
