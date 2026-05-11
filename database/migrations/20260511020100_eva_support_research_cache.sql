-- database/migrations/20260511020100_eva_support_research_cache.sql
--
-- SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-3
-- TTL-bounded research result cache keyed by SHA-256 hex of normalized query.
-- service_role-only RLS posture.

CREATE TABLE IF NOT EXISTS eva_support_research_cache (
  query_hash    CHAR(64)    PRIMARY KEY,
  query_text    TEXT        NOT NULL,
  response_text TEXT        NOT NULL,
  "references"  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  ttl_until     TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plain b-tree index supports eviction-scan: WHERE ttl_until < now()
CREATE INDEX IF NOT EXISTS idx_eva_support_research_cache_ttl
  ON eva_support_research_cache (ttl_until);

ALTER TABLE eva_support_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all
  ON eva_support_research_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE  eva_support_research_cache IS
  'EVA Support research result cache. Keyed by SHA-256 hex of normalize(query)=lowercase+trim+collapse-whitespace. TTL-bounded via ttl_until; eviction by separate cron/script (see scripts/cron/evict-research-cache.mjs if/when added). service_role-only RLS.';
COMMENT ON COLUMN eva_support_research_cache.query_text IS
  'May contain PII (e.g. user names in research queries). Protected by service_role-only RLS + TTL eviction via ttl_until. NOT encrypted at column level — relies on Supabase storage-layer encryption-at-rest.';
COMMENT ON COLUMN eva_support_research_cache."references" IS
  'JSONB array of citation refs. Quote as "references" in raw SQL to avoid FK-reference keyword ambiguity.';

-- ROLLBACK: DROP TABLE IF EXISTS eva_support_research_cache;
