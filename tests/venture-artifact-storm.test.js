/**
 * SD-LEO-FIX-REMEDIATE-ARRESTED-VENTURE-001 — storm residue remediation pins.
 * All offline: migration static pins + gauge membership + writeArtifactBatch
 * single-current invariant (the mechanism that preserved exactly the current rows
 * through 1,200+ storm writes — the cleanup predicate's safety depends on it).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UP = path.join(ROOT, 'database/migrations/20260610_purge_venture_artifact_storm_residue.sql');
const DOWN = path.join(ROOT, 'database/migrations/20260610_purge_venture_artifact_storm_residue_DOWN.sql');
const STORM_TYPES = ['launch_test_plan', 'blueprint_sprint_plan', 'build_security_audit'];

describe('purge migration (UP) — safety invariants', () => {
  const sql = fs.readFileSync(UP, 'utf8');

  it('carries @approved-by + split-statements warning + bounded timeouts', () => {
    expect(sql).toMatch(/^--\s*@approved-by:\s*\S+@\S+/m);
    expect(sql).toMatch(/DO NOT run .*--split-statements/i);
    expect(sql).toMatch(/SET LOCAL lock_timeout/i);
    expect(sql).toMatch(/SET LOCAL statement_timeout/i);
  });

  it('quarantine predicate is type-scoped AND stale-only', () => {
    expect(sql).toMatch(/is_current = false/);
    for (const t of STORM_TYPES) expect(sql).toContain(`'${t}'`);
  });

  it('CURRENT-ROW TRIPWIRE: aborts if any is_current=true row lands in quarantine', () => {
    expect(sql).toMatch(/WHERE is_current = true/);
    expect(sql).toMatch(/RAISE EXCEPTION 'purge aborted: % is_current=true row\(s\) in quarantine/);
  });

  it('aborts on pre-existing quarantine; DELETE is quarantine-id-bound; post-assert present', () => {
    expect(sql).toMatch(/to_regclass\('public\.venture_artifacts_storm_quarantine_20260610'\)\s+IS NOT NULL/i);
    expect(sql).toMatch(/DELETE FROM venture_artifacts va\s+USING\s+venture_artifacts_storm_quarantine_20260610 q\s+WHERE va\.id = q\.id/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'purge failed:/);
  });

  it('adds NO constraints (stale versions are legitimate; detection is the gauge)', () => {
    expect(sql).not.toMatch(/ADD CONSTRAINT/i);
  });
});

describe('purge migration (DOWN) — reversibility', () => {
  const sql = fs.readFileSync(DOWN, 'utf8');

  it('column-explicit re-insert (28 cols), idempotent, with completeness assert', () => {
    expect(sql).toMatch(/INSERT INTO venture_artifacts\s*\(/i);
    expect(sql).not.toMatch(/INSERT INTO venture_artifacts\s+SELECT \*/i);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
    expect(sql).toMatch(/RAISE EXCEPTION 'rollback incomplete:/);
    // all 28 live columns named
    for (const col of ['artifact_embedding', 'supports_plan_key', 'platform', 'epistemic_evidence']) {
      expect(sql).toContain(col);
    }
  });
});

describe('gauge coverage — venture_artifacts under standing watch', () => {
  it('GOVERNANCE_TABLES includes venture_artifacts plus both original incident tables', () => {
    const { GOVERNANCE_TABLES } = require(path.join(ROOT, 'lib/coordinator/row-growth.cjs'));
    expect(GOVERNANCE_TABLES).toContain('venture_artifacts');
    expect(GOVERNANCE_TABLES).toContain('management_reviews');
    expect(GOVERNANCE_TABLES).toContain('sd_baseline_items');
  });

  it('observed storm rates would trigger the gauge within one daily tick', () => {
    const { detectRowGrowthAnomalies } = require(path.join(ROOT, 'lib/coordinator/row-growth.cjs'));
    // launch_test_plan grew ~1230 rows over 6 days ≈ 205/day on a table of ~250 baseline:
    const gradual = detectRowGrowthAnomalies(
      { tables: { venture_artifacts: 256 } },
      { tables: { venture_artifacts: 461 } } // +205 in one tick
    );
    expect(gradual.length).toBe(0); // below abs spike AND below 500-row factor floor...
    // ...but by day 3 the factor trigger fires:
    const day3 = detectRowGrowthAnomalies(
      { tables: { venture_artifacts: 666 } },
      { tables: { venture_artifacts: 1080 } } // x1.62 above the 500-row floor
    );
    expect(day3.length).toBe(1);
    expect(day3[0].trigger).toBe('growth_factor');
    // and a full-rate 30s storm (~2880/day) trips abs_spike immediately:
    const fullRate = detectRowGrowthAnomalies(
      { tables: { venture_artifacts: 256 } },
      { tables: { venture_artifacts: 6200 } }
    );
    expect(fullRate[0].trigger).toBe('abs_spike');
  });
});

describe('writeArtifactBatch single-current invariant (cleanup-safety mechanism)', () => {
  it('repeated batch persists leave exactly ONE is_current=true row per (venture,stage,type)', async () => {
    const { writeArtifactBatch } = await import('../lib/eva/artifact-persistence-service.js');
    // In-memory venture_artifacts emulating mark-stale + insert semantics.
    const rows = [];
    let nextId = 1;
    const mock = {
      from(table) {
        expect(table).toBe('venture_artifacts');
        const ctx = { filters: {} };
        const b = {
          update(payload) { ctx.update = payload; return b; },
          insert(payload) {
            const arr = Array.isArray(payload) ? payload : [payload];
            const inserted = arr.map((r) => ({ ...r, id: String(nextId++) }));
            rows.push(...inserted);
            return {
              select: (cols) => ({
                single: async () => ({ data: inserted[0], error: null }),
                then: (res) => res({ data: inserted.map(r => ({ id: r.id })), error: null }),
              }),
              then: (res) => res({ data: inserted, error: null }),
            };
          },
          select() { return b; },
          eq(col, val) { ctx.filters[col] = val; return b; },
          in(col, vals) { ctx.filters[col] = vals; return b; },
          limit() { return b; },
          async maybeSingle() { return { data: null, error: null }; },
          then(resolve) {
            if (ctx.update) {
              // apply mark-stale update to matching rows
              for (const r of rows) {
                const match = Object.entries(ctx.filters).every(([k, v]) =>
                  Array.isArray(v) ? v.includes(r[k]) : r[k] === v);
                if (match) Object.assign(r, ctx.update);
              }
              return resolve({ data: null, error: null });
            }
            return resolve({ data: rows, error: null });
          },
        };
        return b;
      },
    };
    const batch = [{ artifactType: 'blueprint_sprint_plan', title: 't', payload: { a: 1 } }];
    await writeArtifactBatch(mock, 'v1', 19, batch);
    await writeArtifactBatch(mock, 'v1', 19, batch); // storm re-run
    await writeArtifactBatch(mock, 'v1', 19, batch); // storm re-run
    const current = rows.filter((r) => r.venture_id === 'v1' && r.artifact_type === 'blueprint_sprint_plan' && r.is_current === true);
    const stale = rows.filter((r) => r.venture_id === 'v1' && r.artifact_type === 'blueprint_sprint_plan' && r.is_current === false);
    expect(current.length).toBe(1);   // exactly one current — the invariant the cleanup relies on
    expect(stale.length).toBe(2);     // N-1 stale — the storm residue shape
  });
});
