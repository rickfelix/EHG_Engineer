// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-1
// CHECK constraint enforcement on lineage_verdict + lineage_attribution_confidence.
// Validates the migration semantics without requiring a live Postgres instance —
// asserts the SQL clauses present in the migration file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, '../../database/migrations/20260516120000_add_lineage_verdict_columns.sql');

describe('lineage verdict migration schema', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('ADDs both columns additively', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lineage_attribution_confidence NUMERIC\(5,2\) NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS lineage_verdict TEXT NULL/);
  });

  it('verdict CHECK accepts the 3-enum set and NULL (grandfathered)', () => {
    expect(sql).toMatch(/chk_lineage_verdict_enum/);
    expect(sql).toMatch(/'BACKFILLED_HIGH'/);
    expect(sql).toMatch(/'BACKFILLED_LOW_CONFIDENCE'/);
    expect(sql).toMatch(/'GRANDFATHERED_NO_VALIDATION'/);
    expect(sql).toMatch(/lineage_verdict IS NULL/);
  });

  it('confidence CHECK enforces NUMERIC range 0-100 and allows NULL', () => {
    expect(sql).toMatch(/chk_lineage_attribution_confidence_range/);
    expect(sql).toMatch(/lineage_attribution_confidence >= 0 AND lineage_attribution_confidence <= 100/);
    expect(sql).toMatch(/lineage_attribution_confidence IS NULL/);
  });

  it('uses additive ALTER pattern (no JSONB CHECK on metadata — RISK C0-R-03 mitigation)', () => {
    expect(sql).not.toMatch(/CHECK\s*\(\s*metadata\s*->>/);
    expect(sql).not.toMatch(/NOT NULL/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});
