// SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — static, live-probe-free assertions on the
// creative_assets migration. Pins the DDL shape (columns, provenance, theater-guard seam,
// venture-scoped RLS) so an accidental edit that weakens scoping or drops provenance is caught
// at CI without touching a live DB. Mirrors the OBSERVED-migration static-test convention.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(__dirname, '../../database/migrations/20260712_creative_assets.sql');

describe('creative_assets migration (FR-1)', () => {
  let sql;
  beforeAll(() => { sql = fs.readFileSync(MIGRATION, 'utf8'); });

  it('creates the venture-scoped creative_assets table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS creative_assets/);
    // venture ownership cascades on venture delete (assets are owned by the venture)
    expect(sql).toMatch(/venture_id\s+UUID NOT NULL REFERENCES ventures\(id\) ON DELETE CASCADE/);
  });

  it('gates capability to image|video (video envelope-flagged in code)', () => {
    expect(sql).toMatch(/capability\s+TEXT NOT NULL CHECK \(capability IN \('image', 'video'\)\)/);
  });

  it('carries generation provenance, cost, and the theater-guard consumed_at seam', () => {
    expect(sql).toMatch(/generator\s+TEXT NOT NULL/);
    expect(sql).toMatch(/brand_source_refs JSONB/);
    expect(sql).toMatch(/provenance\s+JSONB/);
    expect(sql).toMatch(/cost\s+NUMERIC/);
    expect(sql).toMatch(/consumed_at\s+TIMESTAMPTZ/);
  });

  it('enables RLS with the canonical venture-access scoping (not a tautology)', () => {
    expect(sql).toMatch(/ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY/);
    // real scoping: authenticated users limited to ventures in their accessible companies
    expect(sql).toMatch(/FOR ALL TO authenticated/);
    expect(sql).toMatch(/SELECT company_id FROM user_company_access WHERE user_id = auth\.uid\(\)/);
    // service role (the FR-1 generation service) gets full access
    expect(sql).toMatch(/creative_assets_service_role[\s\S]*FOR ALL TO service_role[\s\S]*USING \(true\)/);
  });

  it('is documented as chairman-gated (RLS => not self-applicable)', () => {
    expect(sql).toMatch(/CHAIRMAN-GATED APPLY/);
    expect(sql).toMatch(/MERGED != LIVE/);
  });
});
