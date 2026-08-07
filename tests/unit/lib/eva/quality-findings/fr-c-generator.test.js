/**
 * FR-C′ remediation SD generator tests.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001
 *
 * NO-DB UNIT TESTS ONLY. The live-database integration block that used to live at the bottom of
 * this file now lives in fr-c-generator.db.test.js, moved by
 * SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001.
 *
 * WHY IT MOVED. That block INSERTs, UPDATEs and DELETEs rows in strategic_directives_v2,
 * venture_quality_findings, audit_log and feedback, and it was gated on a locally re-derived
 * HAS_REAL_DB — "a URL is set and it isn't the sentinel" — which derives PERMISSION TO WRITE from
 * the mere PRESENCE of credentials. Paired with tests/setup.unit.js applying its sentinel via
 * `||=`, it ran exactly when the unit tier's credential guard had FAILED. 11 rows carrying this
 * suite's fc000000- fixture venture_id reached production between 2026-05-04 and 2026-07-07.
 *
 * Rewriting the gate was not enough, and the repo's own DB-test guard said so: with the sentinel
 * now unconditional, a live-DB suite in a unit-project path can NEVER run, so it is not merely
 * mis-gated but misrouted. The `.db.test.js` name routes it to the db project, which is gated at
 * project level on assessDbTarget — no designated target, zero files collected. That is a
 * structural guarantee rather than a per-file predicate anyone can re-derive wrongly.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
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

// The local HAS_REAL_DB re-derivation that used to sit here is GONE, not corrected — it moved with
// the suite it gated and was replaced there by the repo's canonical predicate, imported rather than
// re-derived. Re-deriving a safety rule beside the one that already exists is how the original
// defect survived its own test suite. Nothing in this file needs a database.

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
      range: function () { return this; },
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
      range: function () { return this; },
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
      range: function () { return this; },
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
