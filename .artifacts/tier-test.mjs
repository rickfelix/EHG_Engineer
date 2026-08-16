import { classifyMigration } from '../scripts/lib/migration-tier-classifier.mjs';
const cases = {
  'A: metadata only (nullable, no default)':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;`,
  'B: metadata with const default':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;`,
  'C: metadata + content_hash, one ALTER, two actions':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb, ADD COLUMN IF NOT EXISTS content_hash text;`,
  'D: plain btree on real columns (RECOMMENDED)':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;\nALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS content_hash text;\nCREATE INDEX IF NOT EXISTS idx_plan_critiques_sd_hash_created ON plan_critiques (sd_id, content_hash, created_at DESC);`,
  'E: EXPRESSION index on jsonb path (the jsonb-only alternative)':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;\nCREATE INDEX IF NOT EXISTS idx_pc_hash ON plan_critiques ((metadata->>'content_hash'));`,
  'F: GIN index on metadata':
    `CREATE INDEX IF NOT EXISTS idx_pc_meta ON plan_critiques USING gin (metadata);`,
  'G: full recommended migration + COMMENT ON COLUMN':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;\nALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS content_hash text;\nCREATE INDEX IF NOT EXISTS idx_plan_critiques_sd_hash_created ON plan_critiques (sd_id, content_hash, created_at DESC);\nCOMMENT ON COLUMN plan_critiques.content_hash IS 'SHA-256 of the exact PRD+arch text sent to the LLM, post-truncation.';\nCOMMENT ON COLUMN plan_critiques.metadata IS 'Gate-run metadata. truncated: {prd,arch,shown,total}.';`,
  'H: partial index (freshness predicate)':
    `CREATE INDEX IF NOT EXISTS idx_pc_hash ON plan_critiques (sd_id, content_hash) WHERE content_hash IS NOT NULL;`,
  'I: CONCURRENTLY variant':
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_plan_critiques_sd_hash_created ON plan_critiques (sd_id, content_hash, created_at DESC);`,
  'J: with a backfill UPDATE (anti-pattern check)':
    `ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;\nUPDATE plan_critiques SET metadata = '{}'::jsonb WHERE metadata IS NULL;`,
};
for (const [k, sql] of Object.entries(cases)) {
  const r = classifyMigration(sql);
  console.log(`TIER-${r.tier}  ${k}\n        reason=${r.reason}\n        matched=${JSON.stringify(r.matched)}\n`);
}
