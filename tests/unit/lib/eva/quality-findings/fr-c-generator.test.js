/**
 * FR-C′ remediation SD generator tests.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001
 *
 * Three unit tests (no DB) + three HAS_REAL_DB-gated integration tests.
 * Pattern follows tests/unit/scripts/leo-analytics.test.js (the canonical
 * HAS_REAL_DB sentinel from SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  readRateLimitFromEnv,
  findOpenSdForCompositeKey,
  generateRemediationSdsForVenture,
  generateRemediationSdsBatch,
  selectPendingFindings,
  isLikelyTestFixture,
  FIXTURE_VENTURE_ID_PREFIX,
  FIXTURE_SIG_PREFIX,
  FR_C_REMEDIATION_SEVERITIES,
  FR_C_OPEN_SD_STATUSES,
} from '../../../../../lib/eva/quality-findings/sd-generator.js';
import { computeFindingHash } from '../../../../../lib/eva/quality-findings/finding-shape.js';

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// ============================================================================
// UNIT — no DB
// ============================================================================

describe('FR-C generator — unit', () => {
  let prevEnv;
  beforeEach(() => {
    prevEnv = process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY;
    delete process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY;
    else process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = prevEnv;
  });

  test('readRateLimitFromEnv defaults to 20 and parses valid integers', () => {
    expect(readRateLimitFromEnv()).toBe(20);
    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = '5';
    expect(readRateLimitFromEnv()).toBe(5);
    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = '100';
    expect(readRateLimitFromEnv()).toBe(100);
  });

  test('readRateLimitFromEnv falls back to 20 with stderr warning on invalid input', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = 'banana';
    expect(readRateLimitFromEnv()).toBe(20);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid'));

    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = '0';
    expect(readRateLimitFromEnv()).toBe(20);

    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = '-5';
    expect(readRateLimitFromEnv()).toBe(20);

    process.env.FR_C_RATE_LIMIT_PER_VENTURE_PER_DAY = '5.5';
    expect(readRateLimitFromEnv()).toBe(20);

    stderrSpy.mockRestore();
  });

  test('FR-C constants exclude "low" severity and limit dedup to open SD statuses', () => {
    expect(FR_C_REMEDIATION_SEVERITIES).toContain('critical');
    expect(FR_C_REMEDIATION_SEVERITIES).toContain('high');
    expect(FR_C_REMEDIATION_SEVERITIES).toContain('medium');
    expect(FR_C_REMEDIATION_SEVERITIES).not.toContain('low');

    expect(FR_C_OPEN_SD_STATUSES).toEqual(expect.arrayContaining(['draft', 'in_progress']));
    expect(FR_C_OPEN_SD_STATUSES).not.toContain('completed');
    expect(FR_C_OPEN_SD_STATUSES).not.toContain('cancelled');
  });

  test('findOpenSdForCompositeKey filters client-side by triple match', async () => {
    // Mocked supabase chain — returns three candidate SDs for the venture, only
    // one of which matches the (category, severity) triple.
    const ventureId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const candidates = [
      { id: 'sd-1', sd_key: 'SD-LEO-FIX-A-001', metadata: { generated_by: 'fr-c-prime-generator', venture_id: ventureId, finding_category: 'lint', severity: 'medium', source_finding_ids: ['f1'] }, status: 'draft' },
      { id: 'sd-2', sd_key: 'SD-LEO-FIX-B-002', metadata: { generated_by: 'fr-c-prime-generator', venture_id: ventureId, finding_category: 'unit_test', severity: 'high', source_finding_ids: ['f2', 'f3'] }, status: 'in_progress' },
      { id: 'sd-3', sd_key: 'SD-LEO-FIX-C-003', metadata: { generated_by: 'fr-c-prime-generator', venture_id: ventureId, finding_category: 'unit_test', severity: 'medium', source_finding_ids: ['f4'] }, status: 'draft' },
    ];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: function (col, val) {
            // chainable thenable for the final .in()
            return this;
          },
          in: vi.fn().mockResolvedValue({ data: candidates, error: null }),
        }),
      }),
    };
    // Manually build the chain by patching .eq to return self
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: candidates, error: null }),
    };
    supabase.from = vi.fn().mockReturnValue(chain);

    const matched = await findOpenSdForCompositeKey(supabase, ventureId, 'unit_test', 'high');
    expect(matched).not.toBeNull();
    expect(matched.id).toBe('sd-2');
    expect(matched.sd_key).toBe('SD-LEO-FIX-B-002');
    expect(matched.source_finding_ids).toEqual(['f2', 'f3']);

    // Re-stub for the second call
    chain.in.mockResolvedValueOnce({ data: candidates, error: null });
    const noMatch = await findOpenSdForCompositeKey(supabase, ventureId, 'secrets', 'critical');
    expect(noMatch).toBeNull();
  });

  test('generateRemediationSdsForVenture: selectPendingFindings with no rows returns clean empty result', async () => {
    // Build a chainable mock where the final await on the query returns {data:[], error:null}.
    // The chain is `from(t).select(...).eq(...).in(...).order(...).eq(...) <thenable>`.
    // Vitest mock-chain pattern (per orchestrator-persist-artifacts.test.js): each chainable
    // method returns a new thenable that resolves to {data, error}.
    const makeThenable = (data, error) => ({
      data, error,
      select: function () { return this; },
      eq: function () { return this; },
      in: function () { return this; },
      order: function () { return this; },
      gte: function () { return this; },
      then: function (cb) { return cb({ data: this.data, error: this.error }); },
    });

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'strategic_directives_v2') {
          // For countSdsCreatedTodayForVenture (.select with count opt) return 0
          return {
            ...makeThenable([], null),
            select: function (_cols, opts) {
              if (opts && opts.count === 'exact') {
                return makeThenable(null, null); // count-only → returns {count:0}
              }
              return this;
            },
          };
        }
        if (table === 'venture_quality_findings') {
          // selectPendingFindings query — return zero pending rows
          return makeThenable([], null);
        }
        return makeThenable(null, null);
      }),
    };
    // Override count-mode to actually return {count:0,error:null}
    supabase.from.mockImplementation((table) => {
      if (table === 'strategic_directives_v2') {
        return {
          select: vi.fn((_cols, opts) => {
            if (opts && opts.count === 'exact') {
              return {
                eq: function () { return this; },
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              };
            }
            return makeThenable([], null);
          }),
        };
      }
      if (table === 'venture_quality_findings') {
        const t = makeThenable([], null);
        return t;
      }
      return makeThenable(null, null);
    });

    const ventureId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const result = await generateRemediationSdsForVenture(ventureId, { supabase, rateLimit: 5 });
    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

// ============================================================================
// UNIT — fixture discriminator (PAT-TEST-FIXTURE-PROMOTION-001 systemic fix)
// ============================================================================

describe('FR-C generator — fixture discriminator', () => {
  let prevEnv;
  beforeEach(() => {
    prevEnv = process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    delete process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    else process.env.FR_C_ALLOW_FIXTURE_FINDINGS = prevEnv;
  });

  test('FIXTURE_VENTURE_ID_PREFIX and FIXTURE_SIG_PREFIX exposed as constants', () => {
    expect(FIXTURE_VENTURE_ID_PREFIX).toBe('fc000000-');
    expect(FIXTURE_SIG_PREFIX).toBe('t-');
  });

  test('isLikelyTestFixture identifies fc000000- venture_id', () => {
    expect(isLikelyTestFixture({ venture_id: 'fc000000-0000-4000-8000-abcdef012345', evidence_pointer: { sig: 's-real' } })).toBe(true);
  });

  test('isLikelyTestFixture identifies t-* sig', () => {
    expect(isLikelyTestFixture({ venture_id: '11111111-2222-3333-4444-555555555555', evidence_pointer: { sig: 't-foo' } })).toBe(true);
  });

  test('isLikelyTestFixture passes through production rows', () => {
    expect(isLikelyTestFixture({ venture_id: '11111111-2222-3333-4444-555555555555', evidence_pointer: { sig: 's-prod' } })).toBe(false);
    expect(isLikelyTestFixture({ venture_id: '11111111-2222-3333-4444-555555555555', evidence_pointer: null })).toBe(false);
    expect(isLikelyTestFixture({ venture_id: '11111111-2222-3333-4444-555555555555' })).toBe(false);
    expect(isLikelyTestFixture(null)).toBe(false);
  });

  test('selectPendingFindings filters fixture rows and emits test_fixture_skipped audit_log', async () => {
    const fixtureRow = { id: 'fix-1', venture_id: 'fc000000-aaaa-bbbb-cccc-dddddddddddd', finding_category: 'lint', severity: 'medium', evidence_pointer: { sig: 'unused' }, stage_number: 20, created_at: '2026-05-11T00:00:00Z' };
    const sigFixtureRow = { id: 'fix-2', venture_id: '99999999-2222-3333-4444-555555555555', finding_category: 'unit_test', severity: 'high', evidence_pointer: { sig: 't-spike' }, stage_number: 20, created_at: '2026-05-11T00:00:01Z' };
    const prodRow = { id: 'prod-1', venture_id: '99999999-2222-3333-4444-555555555555', finding_category: 'lint', severity: 'medium', evidence_pointer: { sig: 's-prod' }, stage_number: 20, created_at: '2026-05-11T00:00:02Z' };

    const auditInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const findingsThenable = {
      data: [fixtureRow, sigFixtureRow, prodRow], error: null,
      select: function () { return this; },
      eq: function () { return this; },
      in: function () { return this; },
      order: function () { return this; },
      then: function (cb) { return cb({ data: this.data, error: this.error }); },
    };

    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_quality_findings') return findingsThenable;
        if (table === 'audit_log') return { insert: auditInsert };
        throw new Error('unexpected table: ' + table);
      }),
    };

    const result = await selectPendingFindings(supabase, null);
    expect(result).toEqual([prodRow]);
    expect(auditInsert).toHaveBeenCalledTimes(2);
    const events = auditInsert.mock.calls.map((c) => c[0]);
    expect(events.every((e) => e.event_type === 'test_fixture_skipped')).toBe(true);
    expect(events[0].entity_id).toBe('fix-1');
    expect(events[0].metadata.venture_id).toBe(fixtureRow.venture_id);
    expect(events[1].entity_id).toBe('fix-2');
    expect(events[1].metadata.sig).toBe('t-spike');
  });

  test('FR_C_ALLOW_FIXTURE_FINDINGS=true bypasses the discriminator (test escape hatch)', async () => {
    process.env.FR_C_ALLOW_FIXTURE_FINDINGS = 'true';
    const fixtureRow = { id: 'fix-1', venture_id: 'fc000000-aaaa-bbbb-cccc-dddddddddddd', finding_category: 'lint', severity: 'medium', evidence_pointer: { sig: 't-x' }, stage_number: 20, created_at: '2026-05-11T00:00:00Z' };
    const auditInsert = vi.fn();
    const findingsThenable = {
      data: [fixtureRow], error: null,
      select: function () { return this; },
      eq: function () { return this; },
      in: function () { return this; },
      order: function () { return this; },
      then: function (cb) { return cb({ data: this.data, error: this.error }); },
    };
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_quality_findings') return findingsThenable;
        if (table === 'audit_log') return { insert: auditInsert };
        throw new Error('unexpected table: ' + table);
      }),
    };
    const result = await selectPendingFindings(supabase, null);
    expect(result).toEqual([fixtureRow]);
    expect(auditInsert).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INTEGRATION — HAS_REAL_DB-gated
// ============================================================================

describe.skipIf(!HAS_REAL_DB)('FR-C generator — integration (HAS_REAL_DB)', () => {
  let supabase;
  let testVentureId;
  let createdSdKeys;
  let createdFindingIds;
  let prevFixtureEnv;

  beforeEach(() => {
    // Integration suite seeds rows that match fixture sentinels (fc000000-
    // venture_id, t-* sigs). Bypass the discriminator here so generator paths
    // can exercise dedup/rate-limit on those rows; production cron never sets
    // this env var (PAT-TEST-FIXTURE-PROMOTION-001).
    prevFixtureEnv = process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    process.env.FR_C_ALLOW_FIXTURE_FINDINGS = 'true';
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // Stable per-test venture ID so cleanup can target it. Use a sentinel UUID
    // prefix to make rows easy to recognise in case cleanup misses any.
    testVentureId = 'fc000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');
    createdSdKeys = [];
    createdFindingIds = [];
  });

  afterEach(async () => {
    // Best-effort cleanup. Order matters: SDs first (no FK to findings), then findings.
    if (supabase && testVentureId) {
      try {
        await supabase.from('strategic_directives_v2').delete().eq('metadata->>venture_id', testVentureId);
      } catch { /* noop */ }
      try {
        await supabase.from('venture_quality_findings').delete().eq('venture_id', testVentureId);
      } catch { /* noop */ }
      try {
        await supabase.from('audit_log').delete().eq('metadata->>venture_id', testVentureId);
      } catch { /* noop */ }
    }
    if (prevFixtureEnv === undefined) delete process.env.FR_C_ALLOW_FIXTURE_FINDINGS;
    else process.env.FR_C_ALLOW_FIXTURE_FINDINGS = prevFixtureEnv;
  });

  async function seedFinding({ category = 'lint', severity = 'medium', sig = `s-${Date.now()}-${Math.random()}` } = {}) {
    const finding_hash = computeFindingHash({
      venture_id: testVentureId,
      stage_number: 20,
      finding_category: category,
      finding_signature: sig,
    });
    const { data, error } = await supabase
      .from('venture_quality_findings')
      .insert({
        venture_id: testVentureId,
        stage_number: 20,
        finding_category: category,
        severity,
        finding_hash,
        evidence_pointer: { sig },
        status: 'pending',
      })
      .select('id, status, finding_hash')
      .single();
    if (error) throw new Error('seedFinding failed: ' + error.message);
    createdFindingIds.push(data.id);
    return data;
  }

  test('TS-1 round-trip: pending finding → DRAFT SD; finding transitions to sd_filed', async () => {
    const finding = await seedFinding({ category: 'lint', severity: 'medium' });

    const result = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });

    expect(result.created.length).toBe(1);
    expect(result.appended.length).toBe(0);
    expect(result.skippedRateLimited.length).toBe(0);
    expect(result.errors.length).toBe(0);

    const newKey = result.created[0].sd_key;
    createdSdKeys.push(newKey);

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase, metadata')
      .eq('sd_key', newKey)
      .single();
    expect(sd.status).toBe('draft');
    expect(sd.current_phase).toBe('LEAD');
    expect(sd.metadata.generated_by).toBe('fr-c-prime-generator');
    expect(sd.metadata.venture_id).toBe(testVentureId);
    expect(sd.metadata.finding_category).toBe('lint');
    expect(sd.metadata.severity).toBe('medium');
    expect(sd.metadata.source_finding_ids).toContain(finding.id);

    const { data: f } = await supabase
      .from('venture_quality_findings')
      .select('status, sd_key, sd_filed_at')
      .eq('id', finding.id)
      .single();
    expect(f.status).toBe('sd_filed');
    expect(f.sd_key).toBe(newKey);
    expect(f.sd_filed_at).not.toBeNull();
  }, 30000);

  test('TS-2 dedup hit: second finding with same triple rolls under existing SD', async () => {
    const a = await seedFinding({ category: 'unit_test', severity: 'high', sig: 'sig-a' });

    const r1 = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });
    expect(r1.created.length).toBe(1);
    const sdKey = r1.created[0].sd_key;
    createdSdKeys.push(sdKey);

    // Second finding, same (venture, category, severity) triple
    const b = await seedFinding({ category: 'unit_test', severity: 'high', sig: 'sig-b' });

    const r2 = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 20 });
    expect(r2.created.length).toBe(0);
    expect(r2.appended.length).toBe(1);
    expect(r2.appended[0].sd_key).toBe(sdKey);

    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', sdKey)
      .single();
    expect(sd.metadata.source_finding_ids).toEqual(expect.arrayContaining([a.id, b.id]));

    // SD count for the triple is still 1
    const { data: allSds } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('metadata->>venture_id', testVentureId)
      .eq('metadata->>finding_category', 'unit_test')
      .eq('metadata->>severity', 'high');
    expect(allSds.length).toBe(1);

    // Audit log shows one dedup_miss + one dedup_hit for this venture
    const { data: audits } = await supabase
      .from('audit_log')
      .select('event_type')
      .eq('metadata->>venture_id', testVentureId)
      .in('event_type', ['dedup_miss', 'dedup_hit']);
    expect(audits.filter((a) => a.event_type === 'dedup_miss').length).toBeGreaterThanOrEqual(1);
    expect(audits.filter((a) => a.event_type === 'dedup_hit').length).toBeGreaterThanOrEqual(1);
  }, 30000);

  test('TS-3 rate-limit ceiling: SDs ≤ ceiling; remaining stay pending; one rate_limit_triggered audit', async () => {
    // Seed 5 findings across distinct triples so dedup doesn't absorb them.
    const triples = [
      { category: 'lint', severity: 'medium' },
      { category: 'unit_test', severity: 'high' },
      { category: 'e2e_test', severity: 'critical' },
      { category: 'secrets', severity: 'medium' },
      { category: 'npm_audit', severity: 'high' },
    ];
    const seeded = [];
    for (const t of triples) {
      seeded.push(await seedFinding({ ...t, sig: `t-${t.category}-${t.severity}` }));
    }

    // Ceiling=2 → only 2 SDs created; remaining 3 findings stay pending.
    const result = await generateRemediationSdsForVenture(testVentureId, { supabase, rateLimit: 2 });
    expect(result.created.length).toBe(2);
    expect(result.skippedRateLimited.length).toBe(3);
    expect(result.errors.length).toBe(0);

    result.created.forEach((c) => createdSdKeys.push(c.sd_key));

    // Verify the 3 unprocessed findings still pending
    const { data: stillPending } = await supabase
      .from('venture_quality_findings')
      .select('id, status')
      .eq('venture_id', testVentureId)
      .eq('status', 'pending');
    expect(stillPending.length).toBe(3);

    // Audit log shows exactly one rate_limit_triggered for this venture
    const { data: audits } = await supabase
      .from('audit_log')
      .select('event_type, metadata')
      .eq('metadata->>venture_id', testVentureId)
      .eq('event_type', 'rate_limit_triggered');
    expect(audits.length).toBe(1);
    expect(audits[0].metadata.ceiling).toBe(2);
  }, 60000);

  test('TS-5 status machine: forward-only enforcement raises on backward transition', async () => {
    const f = await seedFinding({ category: 'capability', severity: 'medium' });

    // Forward: pending → sd_filed
    const { error: e1 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'sd_filed' })
      .eq('id', f.id);
    expect(e1).toBeNull();

    // Backward: sd_filed → pending should be rejected by the trigger
    const { error: e2 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'pending' })
      .eq('id', f.id);
    expect(e2).not.toBeNull();
    expect(e2.message).toMatch(/invalid status transition/i);

    // Forward: sd_filed → resolved (resolved_at_v2 auto-populated by trigger)
    const { error: e3 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'resolved' })
      .eq('id', f.id);
    expect(e3).toBeNull();

    const { data: row } = await supabase
      .from('venture_quality_findings')
      .select('status, sd_filed_at, resolved_at_v2')
      .eq('id', f.id)
      .single();
    expect(row.status).toBe('resolved');
    expect(row.sd_filed_at).not.toBeNull();
    expect(row.resolved_at_v2).not.toBeNull();
    expect(new Date(row.resolved_at_v2).getTime()).toBeGreaterThanOrEqual(new Date(row.sd_filed_at).getTime());

    // Backward from resolved is rejected
    const { error: e4 } = await supabase
      .from('venture_quality_findings')
      .update({ status: 'pending' })
      .eq('id', f.id);
    expect(e4).not.toBeNull();
  }, 30000);
});
