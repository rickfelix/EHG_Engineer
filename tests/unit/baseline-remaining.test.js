/**
 * SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 (FR-5/FR-6) — scripts/baseline-remaining.mjs
 * Covers TS-7 (hash fixtures), TS-8 (finish-line idempotency), TS-9 (query error), TS-10
 * (deny-list vs allow-list divergence).
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  computeBaselineHash,
  computeRemaining,
  maybeSurfaceFinishLine,
  run,
  BASELINE_FEEDBACK_ID,
} from '../../scripts/baseline-remaining.mjs';

vi.mock('../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn(),
}));
import { recordPendingDecision } from '../../lib/chairman/record-pending-decision.mjs';

// SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 FR-5 AC#2: the literal historical fixture from the
// live frozen baseline row (feedback 58cc4231-1710-4693-97ff-723e3685a2e4), fetched directly
// from the database during EXEC-phase implementation (2026-09-15) -- NOT a synthetic
// placeholder. This is the exact fixture AC#2 calls for: "a known (sdKeys, qfIds,
// expected_hash) fixture ... usable as a literal test fixture." Proves the algorithm is
// correctly implemented against real, previously-verified data, not merely self-consistent.
const REAL_58CC4231_SD_KEYS = [
  'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B', 'SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-C',
  'SD-LEARN-FIX-ADDRESS-PAT-LES-015', 'SD-LEARN-FIX-ADDRESS-PAT-LES-016',
  'SD-LEARN-FIX-LEARNING-IMPROVEMENT-006', 'SD-LEO-FIX-KPI-COUNTS-CHEAP-001',
  'SD-LEO-FIX-REMEDIATION-JOURNEY-COHERENCE-001', 'SD-LEO-FIX-REMEDIATION-TEST-SUITE-006',
  'SD-LEO-FIX-REMEDIATION-UNIT-TEST-007', 'SD-LEO-FIX-REMEDIATION-UNIT-TEST-008',
  'SD-LEO-FIX-REPLACE-707-FABRICATED-001', 'SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001',
  'SD-LEO-INFRA-APPLY-STATE-VERIFIER-001', 'SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001',
  'SD-LEO-INFRA-CORE-SKILLS-REBUILD-001', 'SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001',
  'SD-LEO-INFRA-FINANCIAL-TIER2-ASSUMPTION-REGISTER-001', 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001',
  'SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001', 'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001',
  'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-A', 'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-B',
  'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-C', 'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-D',
  'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-E', 'SD-LEO-INFRA-VENTURE-FACTORY-HANDOFF-001-F',
  'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001', 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-E',
  'SD-PAT-FIX-PAT-AUTO-974F6C09-001',
];
const REAL_58CC4231_QF_IDS = [
  'QF-20260706-423', 'QF-20260706-496', 'QF-20260711-279', 'QF-20260711-401', 'QF-20260713-970',
  'QF-20260726-578', 'QF-20260728-291', 'QF-20260801-222', 'QF-20260808-213', 'QF-20260812-717',
  'QF-20260813-779', 'QF-20260817-982', 'QF-20260902-542', 'QF-20260903-008', 'QF-20260903-939',
  'QF-20260905-335', 'QF-20260905-476', 'QF-20260906-119', 'QF-20260906-162', 'QF-20260906-235',
  'QF-20260906-687', 'QF-20260907-999', 'QF-20260911-018', 'QF-20260911-098', 'QF-20260911-169',
  'QF-20260911-261', 'QF-20260911-285', 'QF-20260911-447', 'QF-20260911-476', 'QF-20260911-575',
  'QF-20260911-644', 'QF-20260911-707', 'QF-20260911-867', 'QF-20260912-079', 'QF-20260912-150',
  'QF-20260912-161', 'QF-20260912-269', 'QF-20260912-292', 'QF-20260912-364', 'QF-20260912-386',
  'QF-20260912-394', 'QF-20260912-444', 'QF-20260912-746', 'QF-20260912-752', 'QF-20260912-758',
  'QF-20260912-810', 'QF-20260912-901', 'QF-20260912-933', 'QF-20260912-959', 'QF-20260913-017',
  'QF-20260913-095', 'QF-20260913-105', 'QF-20260913-173', 'QF-20260913-176', 'QF-20260913-223',
  'QF-20260913-252', 'QF-20260913-292', 'QF-20260913-323', 'QF-20260913-365', 'QF-20260913-374',
  'QF-20260913-418', 'QF-20260913-438', 'QF-20260913-461', 'QF-20260913-510', 'QF-20260913-529',
  'QF-20260913-559', 'QF-20260913-566', 'QF-20260913-569', 'QF-20260913-613', 'QF-20260913-618',
  'QF-20260913-669', 'QF-20260913-685', 'QF-20260913-694', 'QF-20260913-730', 'QF-20260913-745',
  'QF-20260913-782', 'QF-20260913-787', 'QF-20260913-802', 'QF-20260913-861', 'QF-20260913-864',
  'QF-20260913-937', 'QF-20260913-943', 'QF-20260913-955', 'QF-20260913-984', 'QF-20260914-007',
  'QF-20260914-008', 'QF-20260914-045', 'QF-20260914-150', 'QF-20260914-163', 'QF-20260914-199',
  'QF-20260914-215', 'QF-20260914-308', 'QF-20260914-463', 'QF-20260914-473', 'QF-20260914-502',
  'QF-20260914-532', 'QF-20260914-535', 'QF-20260914-600', 'QF-20260914-631', 'QF-20260914-676',
  'QF-20260914-731', 'QF-20260914-765', 'QF-20260914-823', 'QF-20260914-854', 'QF-20260914-870',
  'QF-20260914-881', 'QF-20260914-898', 'QF-20260914-972', 'QF-20260914-976',
];
const REAL_58CC4231_SHA256 = '956e87342f851ea68ca05f2ce4878156867bd55473b0498cceefdfc07418d557';

describe('computeBaselineHash (TS-7: real historical fixture, FR-5 AC#2)', () => {
  it('reproduces the exact stored sha256 for the live frozen baseline row (58cc4231), 29 sd_keys / 109 qf_ids', () => {
    expect(REAL_58CC4231_SD_KEYS.length).toBe(29);
    expect(REAL_58CC4231_QF_IDS.length).toBe(109);
    expect(computeBaselineHash({ sdKeys: REAL_58CC4231_SD_KEYS, qfIds: REAL_58CC4231_QF_IDS })).toBe(REAL_58CC4231_SHA256);
  });

  it('a single-character mutation to either list breaks the match (proves the fixture is load-bearing, not vacuously true)', () => {
    const mutatedSdKeys = [...REAL_58CC4231_SD_KEYS];
    mutatedSdKeys[0] = mutatedSdKeys[0] + 'X';
    expect(computeBaselineHash({ sdKeys: mutatedSdKeys, qfIds: REAL_58CC4231_QF_IDS })).not.toBe(REAL_58CC4231_SHA256);
  });

  it('is sensitive to key-name casing (camelCase sdKeys/qfIds, not snake_case)', () => {
    const a = computeBaselineHash({ sdKeys: ['X'], qfIds: ['Y'] });
    const wrongKeys = crypto.createHash('sha256').update(JSON.stringify({ sd_keys: ['X'], qf_ids: ['Y'] })).digest('hex');
    expect(a).not.toBe(wrongKeys);
  });
});

describe('computeRemaining (deny-list definition, TS-10)', () => {
  function buildSupabase({ sdRows, qfRows, sdError = null, qfError = null }) {
    return {
      from: vi.fn((table) => ({
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(
              table === 'strategic_directives_v2'
                ? { data: sdRows, error: sdError }
                : { data: qfRows, error: qfError }
            ),
          })),
        })),
      })),
    };
  }

  it('counts anything not completed/cancelled as remaining (deny-list, TS-10)', async () => {
    const supabase = buildSupabase({
      sdRows: [
        { sd_key: 'SD-1', status: 'draft' },
        { sd_key: 'SD-2', status: 'completed' },
        { sd_key: 'SD-3', status: 'reopened' }, // not in any allow-list, but not terminal either
      ],
      qfRows: [{ id: 'QF-1', status: 'open' }, { id: 'QF-2', status: 'cancelled' }],
    });
    const result = await computeRemaining(supabase, { sdKeys: ['SD-1', 'SD-2', 'SD-3'], qfIds: ['QF-1', 'QF-2'] });
    expect(result.remainingSd).toBe(2); // draft + reopened, not completed
    expect(result.remainingQf).toBe(1); // open, not cancelled
  });

  it('throws BASELINE_QUERY_FAILED on an errored sd query, never coercing to zero (TS-9)', async () => {
    const supabase = buildSupabase({ sdRows: null, sdError: { message: 'connection reset' }, qfRows: [] });
    await expect(computeRemaining(supabase, { sdKeys: ['SD-1'], qfIds: [] }))
      .rejects.toThrow(/BASELINE_QUERY_FAILED/);
  });

  it('throws BASELINE_QUERY_FAILED on an errored qf query, never coercing to zero (TS-9)', async () => {
    const supabase = buildSupabase({ sdRows: [], qfRows: null, qfError: { message: 'timeout' } });
    await expect(computeRemaining(supabase, { sdKeys: [], qfIds: ['QF-1'] }))
      .rejects.toThrow(/BASELINE_QUERY_FAILED/);
  });
});

describe('maybeSurfaceFinishLine (TS-8: idempotency)', () => {
  function buildSupabase({ existingDecision = null }) {
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: existingDecision, error: null }),
            })),
          })),
        })),
      })),
    };
  }

  it('sd>0 or qf>0: never calls recordPendingDecision', async () => {
    recordPendingDecision.mockClear();
    const supabase = buildSupabase({});
    const r1 = await maybeSurfaceFinishLine(supabase, { remainingSd: 1, remainingQf: 0 });
    const r2 = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 3 });
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(r1.surfaced).toBe(false);
    expect(r2.surfaced).toBe(false);
  });

  it('sd=0/qf=0, no existing row: calls recordPendingDecision exactly once with blocking:true, referencing 3c4a6781', async () => {
    recordPendingDecision.mockClear();
    recordPendingDecision.mockResolvedValue({ recorded: true, id: 'dec-1' });
    const supabase = buildSupabase({ existingDecision: null });
    const r = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 0 });
    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.blocking).toBe(true);
    expect(call.decisionType).toBe('harness_baseline_finish_line');
    expect(call.title + call.context).toContain('3c4a6781');
    expect(r.surfaced).toBe(true);
  });

  it('sd=0/qf=0, an EXISTING row already present: recordPendingDecision is NOT called again', async () => {
    recordPendingDecision.mockClear();
    const supabase = buildSupabase({ existingDecision: { id: 'dec-existing' } });
    const r = await maybeSurfaceFinishLine(supabase, { remainingSd: 0, remainingQf: 0 });
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(r.surfaced).toBe(false);
    expect(r.reason).toBe('already_surfaced');
  });
});

describe('BASELINE_FEEDBACK_ID', () => {
  it('is the confirmed frozen baseline row id', () => {
    expect(BASELINE_FEEDBACK_ID).toBe('58cc4231-1710-4693-97ff-723e3685a2e4');
  });
});

// SD-LEO-INFRA-FILING-TOOLS-ENFORCE-001 FR-5 AC#3 (TS-7, TESTING mutation finding, EXEC-TO-PLAN):
// run()'s own fail-loud guards (BASELINE_ROW_NOT_FOUND, BASELINE_MALFORMED,
// BASELINE_HASH_MISMATCH) had zero direct coverage -- covered exclusively through the module's
// sub-functions until now. This is the tamper test AC#3 explicitly requires.
describe('run() — fail-loud guards (TS-7, FR-5 AC#3 tamper test)', () => {
  const sdKeys = ['SD-A', 'SD-B'];
  const qfIds = ['QF-1', 'QF-2'];
  const realHash = computeBaselineHash({ sdKeys, qfIds });

  function buildSupabase({ feedbackRow, sdRows = [], qfRows = [], decisionExisting = null }) {
    return {
      from: vi.fn((table) => {
        if (table === 'feedback') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: feedbackRow, error: null }) }) }) };
        }
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: sdRows, error: null }) }) }) };
        }
        if (table === 'quick_fixes') {
          return { select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: qfRows, error: null }) }) }) };
        }
        if (table === 'chairman_decisions') {
          return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: decisionExisting, error: null }) }) }) }) };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };
  }

  it('BASELINE_ROW_NOT_FOUND: throws when the feedback row does not exist', async () => {
    const supabase = buildSupabase({ feedbackRow: null });
    await expect(run(supabase)).rejects.toThrow(/BASELINE_ROW_NOT_FOUND/);
  });

  it('BASELINE_MALFORMED: throws when metadata.baseline or metadata.sha256 is missing', async () => {
    const supabase = buildSupabase({ feedbackRow: { id: BASELINE_FEEDBACK_ID, metadata: {} } });
    await expect(run(supabase)).rejects.toThrow(/BASELINE_MALFORMED/);
  });

  it('BASELINE_HASH_MISMATCH: throws loud on tampered baseline content (mutation-proof tamper test)', async () => {
    // Simulate tampering: the stored hash no longer matches the (mutated) id lists.
    const tamperedSdKeys = [...sdKeys, 'SD-INJECTED'];
    const supabase = buildSupabase({
      feedbackRow: { id: BASELINE_FEEDBACK_ID, metadata: { baseline: { sd_keys: tamperedSdKeys, qf_ids: qfIds }, sha256: realHash } },
    });
    await expect(run(supabase)).rejects.toThrow(/BASELINE_HASH_MISMATCH/);
  });

  it('success path: matching hash prints BASELINE_REMAINING and calls through to maybeSurfaceFinishLine', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = buildSupabase({
      feedbackRow: { id: BASELINE_FEEDBACK_ID, metadata: { baseline: { sd_keys: sdKeys, qf_ids: qfIds }, sha256: realHash } },
      sdRows: [{ sd_key: 'SD-A', status: 'draft' }, { sd_key: 'SD-B', status: 'completed' }],
      qfRows: [{ id: 'QF-1', status: 'open' }, { id: 'QF-2', status: 'cancelled' }],
    });
    const result = await run(supabase);
    expect(result).toEqual({ remainingSd: 1, remainingQf: 1 });
    expect(logSpy.mock.calls.some(([line]) => line === 'BASELINE_REMAINING sd=1 qf=1')).toBe(true);
    logSpy.mockRestore();
  });
});
