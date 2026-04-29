/**
 * Vitest coverage for venture_quality_findings writer (SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B).
 * Tests use a mock supabase client — DB integration is verified by the migration's CHECK constraints
 * and the schema test file (which queries information_schema).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { writeFinding, writeFindingsBatch, resolveFinding } from '../../../../lib/eva/quality-findings/writer.js';
import { computeFindingHash } from '../../../../lib/eva/quality-findings/finding-shape.js';

/**
 * Mock supabase client that records calls and simulates UPSERT idempotency
 * by storing rows keyed on (venture_id, finding_hash).
 */
function makeMockSupabase() {
  const rows = new Map(); // key: venture_id|finding_hash → row
  const calls = [];

  const client = {
    from(table) {
      const ctx = { table, _filters: {} };
      const builder = {
        upsert(payload, opts) {
          calls.push({ op: 'upsert', table, payload, opts });
          const key = `${payload.venture_id}|${payload.finding_hash}`;
          const id = rows.has(key) ? rows.get(key).id : `mock-${rows.size + 1}`;
          rows.set(key, { ...payload, id });
          return {
            select: () => ({
              single: async () => ({ data: { id }, error: null }),
            }),
          };
        },
        update(payload) {
          calls.push({ op: 'update', table, payload });
          const buildable = {
            eq(col, val) {
              ctx._filters[col] = val;
              return buildable;
            },
            is(col, val) {
              ctx._filters[col] = `IS:${val}`;
              return Promise.resolve({ error: null, count: 1 });
            },
          };
          return buildable;
        },
      };
      return builder;
    },
    _rows: rows,
    _calls: calls,
  };
  return client;
}

const validFinding = (overrides = {}) => ({
  venture_id: 'v1',
  stage_number: 20,
  finding_category: 'lint',
  severity: 'medium',
  finding_hash: computeFindingHash({
    venture_id: 'v1',
    stage_number: 20,
    finding_category: 'lint',
    finding_signature: 'no-unused-vars:src/foo.js:42',
  }),
  evidence_pointer: { file: 'src/foo.js' },
  ...overrides,
});

describe('writeFinding', () => {
  let supabase;
  beforeEach(() => {
    supabase = makeMockSupabase();
  });

  it('upserts a valid finding', async () => {
    const r = await writeFinding(supabase, validFinding());
    expect(r.id).toBe('mock-1');
    expect(supabase._calls).toHaveLength(1);
    expect(supabase._calls[0].op).toBe('upsert');
    expect(supabase._calls[0].opts.onConflict).toBe('venture_id,finding_hash');
  });

  it('idempotent — same finding written twice yields same id', async () => {
    const f = validFinding();
    const r1 = await writeFinding(supabase, f);
    const r2 = await writeFinding(supabase, f);
    expect(r1.id).toBe(r2.id);
    expect(supabase._rows.size).toBe(1);
  });

  it('rejects invalid finding (missing venture_id)', async () => {
    await expect(writeFinding(supabase, validFinding({ venture_id: null }))).rejects.toThrow(/Invalid finding/);
  });

  it('rejects unknown finding_category', async () => {
    await expect(writeFinding(supabase, validFinding({ finding_category: 'invented' }))).rejects.toThrow(/finding_category/);
  });

  it('rejects unknown severity', async () => {
    await expect(writeFinding(supabase, validFinding({ severity: 'urgent' }))).rejects.toThrow(/severity/);
  });

  it('forwards evidence_pointer to upsert payload', async () => {
    const ev = { file: 'src/x.js', line: 10 };
    await writeFinding(supabase, validFinding({ evidence_pointer: ev }));
    expect(supabase._calls[0].payload.evidence_pointer).toEqual(ev);
  });
});

describe('writeFindingsBatch', () => {
  it('auto-computes finding_hash from finding_signature when missing', async () => {
    const supabase = makeMockSupabase();
    const f = {
      venture_id: 'v2',
      stage_number: 20,
      finding_category: 'secrets',
      severity: 'critical',
      finding_signature: 'aws-key:src/config.js',
      evidence_pointer: {},
    };
    const r = await writeFindingsBatch(supabase, [f]);
    expect(r.written).toBe(1);
    expect(r.errors).toEqual([]);
    expect(supabase._calls[0].payload.finding_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('captures errors per-finding without aborting batch', async () => {
    const supabase = makeMockSupabase();
    const valid = validFinding();
    const invalid = { ...valid, severity: 'urgent' };
    const r = await writeFindingsBatch(supabase, [valid, invalid, valid]);
    expect(r.written).toBe(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].error).toMatch(/severity/);
  });

  it('handles empty array', async () => {
    const supabase = makeMockSupabase();
    const r = await writeFindingsBatch(supabase, []);
    expect(r.written).toBe(0);
    expect(r.errors).toEqual([]);
  });
});

describe('resolveFinding', () => {
  it('marks finding as resolved', async () => {
    const supabase = makeMockSupabase();
    const r = await resolveFinding(supabase, 'v1', 'hash123');
    expect(r.updated).toBe(true);
  });

  it('throws on missing arguments', async () => {
    const supabase = makeMockSupabase();
    await expect(resolveFinding(supabase, null, 'h')).rejects.toThrow();
    await expect(resolveFinding(supabase, 'v', null)).rejects.toThrow();
  });
});
