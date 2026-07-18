/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-7 audit-stamp
 */
import { describe, it, expect, vi } from 'vitest';
import { computePolicyVersion, recordSwitchOnAuditStamp } from '../../../../lib/switch-automation/prechecks/audit-stamp.js';

describe('PC-7: computePolicyVersion', () => {
  it('returns a version string derived from policy row count + most recent added_at', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [{ added_at: '2026-07-18T00:00:00Z' }], error: null })),
          })),
        })),
      })),
    };
    const version = await computePolicyVersion(supabase);
    expect(version).toBe('v1:1:2026-07-18T00:00:00Z');
  });

  it('fails soft to a sentinel when the policy table has zero rows', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    };
    const version = await computePolicyVersion(supabase);
    expect(version).toBe('policy-table-empty');
  });

  it('fails soft to a sentinel when the STAGED policy table is not live yet', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: null, error: { message: 'relation does not exist' } })),
          })),
        })),
      })),
    };
    const version = await computePolicyVersion(supabase);
    expect(version).toBe('policy-table-not-live');
  });
});

describe('PC-7: recordSwitchOnAuditStamp', () => {
  it('inserts exactly one row with all required fields', async () => {
    const insertMock = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: 'audit-1' }, error: null })),
      })),
    }));
    const supabase = { from: vi.fn(() => ({ insert: insertMock })) };

    const result = await recordSwitchOnAuditStamp(supabase, {
      component: 'component-x',
      action: 'switch-on',
      actor: 'test-actor',
      policyVersion: 'v1:1:...',
      evidenceSnapshot: { foo: 'bar' },
      decision: 'auto-proceed',
    });

    expect(result).toEqual({ id: 'audit-1' });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      component: 'component-x',
      decision: 'auto-proceed',
      policy_version: 'v1:1:...',
      evidence_snapshot: { foo: 'bar' },
    }));
  });

  it('throws loudly on an insert failure (never silently swallows an audit-write error)', async () => {
    const supabase = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { message: 'constraint violation' } })),
          })),
        })),
      })),
    };
    await expect(recordSwitchOnAuditStamp(supabase, {
      component: 'x', action: 'y', actor: 'z', policyVersion: 'v1', evidenceSnapshot: {}, decision: 'auto-proceed',
    })).rejects.toThrow(/constraint violation/);
  });
});
