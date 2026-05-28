-- SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 Phase 1
-- (1) Add content_hash GENERATED STORED columns to eva_vision_documents + eva_architecture_plans
--     (DATABASE sub-agent COND-1: source-table content_hash columns missing, blocks FR-3/TR-7).
-- (2) Create eva_vision_rubric_cache table — additive, no FKs (stale-but-keyed acceptable).

BEGIN;

-- (1) content_hash on source tables — deterministic, computed at write time, no backfill.
--     md5(text) is IMMUTABLE on text input (sha256 path requires bytea via convert_to which
--     is STABLE, not IMMUTABLE, and GENERATED columns require IMMUTABLE expressions).
--     md5 collision probability across <1000 venture docs is astronomically low; cache key
--     in JS combines this with the OTHER side's hash + vision/plan keys so even a
--     hypothetical single-side collision cannot poison the cache.
ALTER TABLE eva_vision_documents
  ADD COLUMN IF NOT EXISTS content_hash text
    GENERATED ALWAYS AS (md5(coalesce(content, ''))) STORED;

ALTER TABLE eva_architecture_plans
  ADD COLUMN IF NOT EXISTS content_hash text
    GENERATED ALWAYS AS (md5(coalesce(content, ''))) STORED;

-- (2) cache table — primary key on cache_key supports ON CONFLICT DO UPDATE for setCachedRubrics
CREATE TABLE IF NOT EXISTS eva_vision_rubric_cache (
  cache_key text PRIMARY KEY,
  vision_key text NOT NULL,
  plan_key text NOT NULL,
  vision_content_hash text,
  plan_content_hash text,
  rubrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_hit_at timestamptz,
  generator_model text,
  generator_cost_usd numeric(8,4)
);

CREATE INDEX IF NOT EXISTS idx_eva_vision_rubric_cache_keys
  ON eva_vision_rubric_cache (vision_key, plan_key);

COMMENT ON TABLE eva_vision_rubric_cache IS
  'SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001: LLM-generated venture rubrics cached by SHA-256(vision_key+plan_key+both content_hashes). Stale-but-keyed acceptable; content_hash is the freshness signal. EHG self-scoring uses the static rubric library and never touches this table.';

COMMIT;
