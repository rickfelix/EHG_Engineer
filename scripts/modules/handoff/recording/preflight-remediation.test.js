/**
 * SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 — FR-1/FR-3 pure helpers.
 * Covers TS-1 (remediation enumeration), TS-6 (negative control: no stamp
 * when no prior SAEM rejection exists / error is distinguishable from
 * absence), and TS-8 (defensive truncation under the 102400-char CHECK
 * constraint, never silently dropping the row).
 */

import { describe, it, expect } from 'vitest';
import {
  buildPreflightRemediation,
  truncateValidationDetails,
  findPriorSaemRemediation,
  VALIDATION_DETAILS_MAX_CHARS
} from './preflight-remediation.js';

describe('buildPreflightRemediation', () => {
  it('TS-1: normalizes preflightIssues into a persistable remediation list', () => {
    const result = {
      preflightIssues: [
        { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'Missing sub-agent evidence for: TESTING', remediation: 'Run TESTING first.' }
      ]
    };
    const out = buildPreflightRemediation(result);
    expect(out).toEqual([
      { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'Missing sub-agent evidence for: TESTING', remediation: 'Run TESTING first.' }
    ]);
  });

  it('TS-1: normalizes preflightViolations (artifact-preflight shape) into the same shape', () => {
    const result = {
      preflightViolations: [
        { field: 'success_metrics', expected: '>=3 unique', got: '1', hint: 'Add more metrics.' }
      ]
    };
    const out = buildPreflightRemediation(result);
    expect(out).toEqual([
      { code: 'ARTIFACT_SHAPE:success_metrics', message: 'expected >=3 unique, got 1', remediation: 'Add more metrics.' }
    ]);
  });

  it('returns [] when neither preflightIssues nor preflightViolations are present', () => {
    expect(buildPreflightRemediation({})).toEqual([]);
    expect(buildPreflightRemediation(null)).toEqual([]);
  });
});

describe('truncateValidationDetails (TS-8)', () => {
  it('returns details unchanged when under the size budget', () => {
    const details = { summary: { passed: false }, preflight_remediation: [{ code: 'X', message: 'm', remediation: 'r' }] };
    expect(truncateValidationDetails(details)).toEqual(details);
  });

  it('caps each remediation string, then drops trailing entries, and never throws on a pathological payload', () => {
    const huge = 'x'.repeat(5000);
    const details = {
      summary: { passed: false, score: 0 },
      rejected_at: '2026-08-23T00:00:00.000Z',
      reason: 'PREREQUISITE_PREFLIGHT_FAILED',
      message: 'huge rejection',
      preflight_remediation: Array.from({ length: 50 }, (_, i) => ({
        code: `CODE_${i}`,
        message: `message ${i}`,
        remediation: huge
      }))
    };
    const out = truncateValidationDetails(details, VALIDATION_DETAILS_MAX_CHARS);
    const serialized = JSON.stringify(out);
    expect(serialized.length).toBeLessThanOrEqual(VALIDATION_DETAILS_MAX_CHARS);
    expect(out.preflight_remediation_truncated).toBe(true);
    // Never silently drops the row — summary/reason/message survive even in the pathological fallback.
    expect(out.reason).toBe('PREREQUISITE_PREFLIGHT_FAILED');
  });

  it('never throws regardless of input shape', () => {
    expect(() => truncateValidationDetails(null)).not.toThrow();
    expect(() => truncateValidationDetails(undefined)).not.toThrow();
  });
});

describe('findPriorSaemRemediation (TS-5/TS-6)', () => {
  function mockSupabase(rows) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: rows, error: null })
                })
              })
            })
          })
        })
      })
    };
  }

  it('TS-5: finds a matching prior rejection stamped with the same identity', async () => {
    const supabase = mockSupabase([
      {
        id: 'rej-1',
        created_at: '2026-08-23T00:00:00.000Z',
        validation_details: {
          preflight_remediation: [{ code: 'X', message: 'm', remediation: 'r' }],
          rejecting_identity: { sessionId: 'sess-abc', source: 'env' }
        }
      }
    ]);
    const out = await findPriorSaemRemediation(supabase, {
      sdId: 'sd-uuid',
      toPhase: 'PLAN',
      acceptingIdentity: { sessionId: 'sess-abc', source: 'env' }
    });
    expect(out.found).toBe(true);
    expect(out.rejectionIds).toEqual(['rej-1']);
  });

  it('TS-6: negative control — no prior SAEM rejection exists, found=false with no error', async () => {
    const supabase = mockSupabase([]);
    const out = await findPriorSaemRemediation(supabase, {
      sdId: 'sd-uuid',
      toPhase: 'PLAN',
      acceptingIdentity: { sessionId: 'sess-abc', source: 'env' }
    });
    expect(out.found).toBe(false);
    expect(out.error).toBeUndefined();
  });

  it('TS-6: an error result is distinguishable from a genuine negative (found=false, error set)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => Promise.resolve({ data: null, error: { message: 'boom' } })
                })
              })
            })
          })
        })
      })
    };
    const out = await findPriorSaemRemediation(supabase, {
      sdId: 'sd-uuid',
      toPhase: 'PLAN',
      acceptingIdentity: { sessionId: 'sess-abc', source: 'env' }
    });
    expect(out.found).toBe(false);
    expect(out.error).toBe('boom');
  });

  it('does not match a rejection lacking preflight_remediation (unrelated rejection)', async () => {
    const supabase = mockSupabase([
      { id: 'rej-2', created_at: '2026-08-23T00:00:00.000Z', validation_details: { summary: { passed: false } } }
    ]);
    const out = await findPriorSaemRemediation(supabase, {
      sdId: 'sd-uuid',
      toPhase: 'PLAN',
      acceptingIdentity: { sessionId: 'sess-abc', source: 'env' }
    });
    expect(out.found).toBe(false);
  });

  it('treats an unattributable identity (source=none) on either side as a candidate match', async () => {
    const supabase = mockSupabase([
      {
        id: 'rej-3',
        created_at: '2026-08-23T00:00:00.000Z',
        validation_details: {
          preflight_remediation: [{ code: 'X', message: 'm', remediation: 'r' }],
          rejecting_identity: { sessionId: null, source: 'none' }
        }
      }
    ]);
    const out = await findPriorSaemRemediation(supabase, {
      sdId: 'sd-uuid',
      toPhase: 'PLAN',
      acceptingIdentity: { sessionId: 'sess-abc', source: 'env' }
    });
    expect(out.found).toBe(true);
  });
});
