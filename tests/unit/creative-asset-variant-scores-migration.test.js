// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1, TS-7, TR-1, TR-6, TR-7) — static,
// live-probe-free assertions on the creative_asset_variant_scores migration. Pins the DDL
// shape and, critically, proves the file classifies TIER-1 (auto-apply eligible) while also
// being non-delegatable via the Adam-delegated apply path (contains ENABLE RLS + CREATE
// POLICY). Also asserts the "no ON DELETE" invariant that FR-1/FR-9 depend on -- the single
// most consequential DDL decision in this SD -- statically, before the migration is ever
// submitted for apply (G8/G9, TESTING evidence d82e9679-c331-4225-b36d-9cf3bb5d9116).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../scripts/lib/migration-tier-classifier.mjs';
import { isDelegatableAdditive } from '../../lib/migration/adam-delegated-apply.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(__dirname, '../../database/migrations/20260826_creative_asset_variant_scores.sql');

// Strip `--` line comments before scanning for literal DDL tokens -- this file's own header
// prose deliberately DISCUSSES "ON DELETE" and "COMMENT ON TABLE" as hazards to avoid, so a
// naive whole-file regex would false-positive on the documentation, not the DDL. The
// classifier itself already handles this correctly (proven live); this helper matches that.
function stripSqlComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('creative_asset_variant_scores migration (FR-1)', () => {
  let sql;
  let ddlOnly;
  beforeAll(() => {
    sql = fs.readFileSync(MIGRATION, 'utf8');
    ddlOnly = stripSqlComments(sql);
  });

  it('creates the join table with plain (NO ACTION) FKs -- never ON DELETE', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS creative_asset_variant_scores/);
    expect(sql).toMatch(/creative_asset_id\s+UUID NOT NULL REFERENCES creative_assets\(id\)/);
    expect(sql).toMatch(/variant_id\s+UUID NOT NULL REFERENCES marketing_content_variants\(id\)/);
    expect(sql).toMatch(/UNIQUE \(creative_asset_id, variant_id\)/);
    // G9: the single most consequential DDL decision (plain FKs, not cascade) is checkable
    // statically, before the irreversible apply step -- not only post-apply via pg_constraint.
    expect(ddlOnly.toUpperCase()).not.toMatch(/ON DELETE/);
  });

  it('enables RLS with the canonical venture-access scoping via creative_assets.venture_id (not a tautology)', () => {
    expect(sql).toMatch(/ALTER TABLE creative_asset_variant_scores ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FOR ALL TO authenticated/);
    expect(sql).toMatch(/SELECT company_id FROM user_company_access WHERE user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/cavs_service_role[\s\S]*FOR ALL TO service_role[\s\S]*USING \(true\)/);
  });

  it('classifies TIER-1 (auto-apply eligible)', () => {
    const result = classifyMigration(sql);
    expect(result.tier).toBe(1);
  });

  it('is NOT delegatable via the Adam-delegated apply path (TR-7) -- TIER-1 is necessary but not sufficient for delegation', () => {
    const result = isDelegatableAdditive(sql);
    expect(result.delegatable).toBe(false);
    expect(result.reason).toMatch(/policy_or_rls_chairman_only/);
  });

  it('uses only `--` header comments, never COMMENT ON TABLE (TR-6)', () => {
    expect(ddlOnly).not.toMatch(/COMMENT ON TABLE/i);
  });
});
