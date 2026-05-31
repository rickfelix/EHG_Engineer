/**
 * Vitest coverage for FR-B: stage-20 analyzer persistence path
 * (SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-B-001).
 *
 * Tests target the exported persistAnalyzerFindings helper directly so we do
 * not need to stand up the full analyzer pipeline (cloneRepo + 4 checks).
 *
 * Mock-supabase pattern is the same shape as
 * tests/unit/eva/quality-findings/writer.test.js:15-55, extended with an
 * audit_log capture (rows Map keyed on insert id, calls array recording
 * event_type / metadata) for FR-3 assertions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { persistAnalyzerFindings } from '../../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';
import { computeFindingHash } from '../../../../lib/eva/quality-findings/finding-shape.js';

/**
 * makeMockSupabase — extended from writer.test.js to also capture audit_log
 * inserts. Optional `auditThrows` injects a thrower for TS-6 coverage.
 */
function makeMockSupabase({ upsertThrows = false, auditThrows = false } = {}) {
  const rows = new Map();             // venture_quality_findings: venture_id|finding_hash → row
  const auditRows = [];               // audit_log: ordered insert log
  const calls = [];                   // every operation
  let nextId = 1;

  const client = {
    from(table) {
      const builder = {
        upsert(payload, opts) {
          calls.push({ op: 'upsert', table, payload, opts });
          if (table === 'venture_quality_findings' && upsertThrows) {
            return {
              select: () => ({
                single: async () => { throw new Error('FK violation'); },
              }),
            };
          }
          if (table === 'venture_quality_findings') {
            const key = `${payload.venture_id}|${payload.finding_hash}`;
            const id = rows.has(key) ? rows.get(key).id : `mock-${nextId++}`;
            rows.set(key, { ...payload, id });
            return {
              select: () => ({
                single: async () => ({ data: { id }, error: null }),
              }),
            };
          }
          return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
        },
        insert(payload) {
          calls.push({ op: 'insert', table, payload });
          if (table === 'audit_log') {
            if (auditThrows) {
              return Promise.reject(new Error('audit_log table does not exist'));
            }
            const id = `audit-${auditRows.length + 1}`;
            auditRows.push({ ...payload, id });
            return Promise.resolve({ data: { id }, error: null });
          }
          return Promise.resolve({ data: {}, error: null });
        },
      };
      return builder;
    },
    _rows: rows,
    _auditRows: auditRows,
    _calls: calls,
  };
  return client;
}

const VENTURE_ID = 'v-fixture-1';

const makeFinding = (signature, overrides = {}) => ({
  venture_id: VENTURE_ID,
  stage_number: 20,
  finding_category: 'lint',
  severity: 'medium',
  finding_hash: computeFindingHash({
    venture_id: VENTURE_ID,
    stage_number: 20,
    finding_category: 'lint',
    finding_signature: signature,
  }),
  evidence_pointer: { signature },
  ...overrides,
});

const adapted = (canonical = [], skipped = []) => ({ canonical, skipped, hashes: new Set() });

describe('persistAnalyzerFindings — FR-B', () => {
  let supabase;
  beforeEach(() => {
    // QF-20260530-155: these are persist-path unit tests. The FR-C sync-SD
    // generator (writeFinding → maybeGenerateSdForFinding) has its own coverage
    // and would otherwise fire on the high-severity fixture (TS-1), logging a
    // 2nd `fr_c_sync_generator.error` audit_log against the persist-only mock.
    // Disable it so audit_log assertions reflect only the persist summary.
    process.env.LEO_FR_C_SYNC_GENERATION_ENABLED = 'false';
    supabase = makeMockSupabase();
  });

  it('TS-1: happy path — writes rows and emits one audit_log info row', async () => {
    const batch = adapted([
      makeFinding('no-unused-vars:src/foo.js:1'),
      makeFinding('no-unused-vars:src/foo.js:2'),
      makeFinding('npm-audit:left-pad@1.0.0', { finding_category: 'npm_audit', severity: 'high' }),
    ]);
    const result = await persistAnalyzerFindings(supabase, VENTURE_ID, batch);

    expect(result.written).toBe(3);
    expect(result.errors).toEqual([]);
    expect(result.skipped_count).toBe(0);
    expect(supabase._rows.size).toBe(3);

    const auditInserts = supabase._calls.filter(c => c.table === 'audit_log');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].payload.severity).toBe('info');
    expect(auditInserts[0].payload.event_type).toBe('venture_quality_findings.persist');
    expect(auditInserts[0].payload.entity_type).toBe('venture');
    expect(auditInserts[0].payload.entity_id).toBe(VENTURE_ID);
    expect(auditInserts[0].payload.created_by).toBe('stage-20-code-quality-analyzer');
    expect(auditInserts[0].payload.metadata).toEqual({
      inserted_count: 3,
      skipped_count: 0,
      error_count: 0,
      hash_schema_version: 'fnv1a-16',
    });
  });

  it('TS-2: idempotent re-run — same batch twice yields same row count', async () => {
    const batch = adapted([
      makeFinding('lint-rule:src/a.js'),
      makeFinding('lint-rule:src/b.js'),
    ]);

    const r1 = await persistAnalyzerFindings(supabase, VENTURE_ID, batch);
    const r2 = await persistAnalyzerFindings(supabase, VENTURE_ID, batch);

    expect(r1.written).toBe(2);
    expect(r2.written).toBe(2);
    expect(supabase._rows.size).toBe(2);

    const auditInserts = supabase._calls.filter(c => c.table === 'audit_log');
    expect(auditInserts).toHaveLength(2);
    expect(auditInserts.every(c => c.payload.severity === 'info')).toBe(true);
  });

  it('TS-3: DB error — analyzer-side return still safe; audit warning emitted', async () => {
    // writer.writeFindingsBatch catches per-finding (writer.js:79-95), so a
    // .upsert that throws surfaces as r.errors[].finding/error rather than
    // tripping the toplevel try/catch. This is the realistic shape users
    // hit when a single finding fails RLS / FK validation.
    const throwing = makeMockSupabase({ upsertThrows: true });
    const batch = adapted([makeFinding('lint:foo')]);

    const result = await persistAnalyzerFindings(throwing, VENTURE_ID, batch);

    expect(result.written).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].error).toContain('FK violation');
    expect(result.errors[0].finding).toBeTruthy();
    expect(result.skipped_count).toBe(result.errors.length);

    const auditInserts = throwing._calls.filter(c => c.table === 'audit_log');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].payload.severity).toBe('warning');
    expect(auditInserts[0].payload.metadata.error_count).toBeGreaterThanOrEqual(1);
  });

  it('TS-4: empty batch — short-circuits with no upsert and no audit_log', async () => {
    const result = await persistAnalyzerFindings(supabase, VENTURE_ID, adapted([]));

    expect(result.written).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.skipped_count).toBe(0);
    expect(supabase._calls).toEqual([]);
  });

  it('TS-5: no supabase client — skips cleanly with skipped_reason', async () => {
    const batch = adapted([makeFinding('lint:foo')]);
    const result = await persistAnalyzerFindings(null, VENTURE_ID, batch);

    expect(result).toEqual({
      written: 0,
      errors: [],
      skipped_count: 0,
      skipped_reason: 'no_supabase_client',
    });
  });

  it('TS-6: audit_log insert failure — swallowed; persistence still succeeds', async () => {
    const throwing = makeMockSupabase({ auditThrows: true });
    const batch = adapted([makeFinding('lint:foo'), makeFinding('lint:bar')]);

    const result = await persistAnalyzerFindings(throwing, VENTURE_ID, batch);

    expect(result.written).toBe(2);
    expect(result.errors).toEqual([]);
    expect(throwing._rows.size).toBe(2);

    // audit_log insert was attempted but threw; no rows captured.
    expect(throwing._auditRows).toEqual([]);
    const auditAttempts = throwing._calls.filter(c => c.table === 'audit_log');
    expect(auditAttempts).toHaveLength(1);
  });
});
