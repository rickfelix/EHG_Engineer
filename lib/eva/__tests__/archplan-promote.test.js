/**
 * Tests for lib/eva/archplan-promote.js
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-5)
 */
import { describe, test, expect, vi } from 'vitest';
import { promoteArchPlan } from '../archplan-promote.js';

function mockSupabase({ row = null, readErr = null, updateResult = null, updateErr = null } = {}) {
  const updateCalls = [];
  return {
    _updateCalls: updateCalls,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error: readErr })),
        })),
      })),
      update: vi.fn((payload) => {
        updateCalls.push(payload);
        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: updateResult, error: updateErr })),
            })),
          })),
        };
      }),
    })),
  };
}

describe('promoteArchPlan', () => {
  test('throws if supabase is missing', async () => {
    await expect(promoteArchPlan({ planKey: 'ARCH-1', promotedBy: 'reviewer' }))
      .rejects.toThrow('supabase client is required');
  });

  test('throws if planKey is missing', async () => {
    await expect(promoteArchPlan({ supabase: {}, promotedBy: 'reviewer' }))
      .rejects.toThrow('planKey is required');
  });

  test('throws if promotedBy is missing', async () => {
    await expect(promoteArchPlan({ supabase: {}, planKey: 'ARCH-1' }))
      .rejects.toThrow('promotedBy is required');
  });

  // TS-15: missing plan_key must be reported explicitly, never a silent success.
  test('reports not_found for a non-existent plan_key, does not attempt an UPDATE', async () => {
    const supabase = mockSupabase({ row: null });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-MISSING', promotedBy: 'reviewer' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('not_found');
    expect(supabase._updateCalls.length).toBe(0);
  });

  // TS-6a: self-approval refused (literal same-label replay).
  test('refuses promotion when promotedBy equals the row\'s own created_by', async () => {
    const supabase = mockSupabase({
      row: { id: '1', plan_key: 'ARCH-1', status: 'draft', chairman_approved: false, created_by: 'eva-archplan-command', quality_checked: true },
    });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-1', promotedBy: 'eva-archplan-command' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('self_approval_refused');
    expect(supabase._updateCalls.length).toBe(0);
  });

  // TS-6b: NULL created_by case, explicitly decided (refuse-on-null is the safer default --
  // promotedBy is never null per the guard clause above, so promotedBy === null can never be
  // true; a NULL-created_by row is therefore ALWAYS promotable by any real identity).
  test('promotes a row with created_by=NULL when promotedBy is any real identity', async () => {
    const supabase = mockSupabase({
      row: { id: '2', plan_key: 'ARCH-2', status: 'draft', chairman_approved: false, created_by: null, quality_checked: true },
      updateResult: { id: '2', plan_key: 'ARCH-2', status: 'active', chairman_approved: true, chairman_approved_at: '2026-01-01T00:00:00.000Z' },
    });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-2', promotedBy: 'reviewer-session-x' });
    expect(result.promoted).toBe(true);
    expect(supabase._updateCalls.length).toBe(1);
  });

  // TS-7: successful promotion path.
  test('promotes a draft row when promotedBy differs from created_by', async () => {
    const supabase = mockSupabase({
      row: { id: '3', plan_key: 'ARCH-3', status: 'draft', chairman_approved: false, created_by: 'eva-archplan-command', quality_checked: true },
      updateResult: { id: '3', plan_key: 'ARCH-3', status: 'active', chairman_approved: true, chairman_approved_at: '2026-01-01T00:00:00.000Z' },
    });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-3', promotedBy: 'reviewer-session-y' });
    expect(result.promoted).toBe(true);
    expect(result.data.status).toBe('active');
    expect(result.data.chairman_approved).toBe(true);
    expect(result.data.chairman_approved_at).not.toBeNull();
  });

  // TS-8 (unit-testable half only -- the trigger's actual rejection is proven at the
  // integration tier, tests/integration/eva/; here we only prove the UPDATE surfaces
  // whatever error the DB layer returns, rather than swallowing it).
  test('surfaces an UPDATE error (e.g. from the quality-advancement trigger) rather than swallowing it', async () => {
    const supabase = mockSupabase({
      row: { id: '4', plan_key: 'ARCH-4', status: 'draft', chairman_approved: false, created_by: 'eva-archplan-command', quality_checked: false },
      updateErr: { message: 'Cannot set architecture plan status to active: quality_checked is false.' },
    });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-4', promotedBy: 'reviewer-session-z' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('update_failed');
    expect(result.error).toMatch(/quality_checked is false/);
  });

  // TS-14: already-active row is a no-op, never overwrites existing chairman_approved_at.
  test('no-ops on an already-approved row without attempting an UPDATE', async () => {
    const supabase = mockSupabase({
      row: { id: '5', plan_key: 'ARCH-5', status: 'active', chairman_approved: true, created_by: 'eva-archplan-command', quality_checked: true },
    });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-5', promotedBy: 'reviewer-session-w' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('already_approved');
    expect(supabase._updateCalls.length).toBe(0);
  });

  // TS-10: the UPDATE payload must contain ONLY status/chairman_approved/chairman_approved_at
  // -- never created_by, content, or sections.
  test('the UPDATE payload contains only status, chairman_approved, and chairman_approved_at', async () => {
    const supabase = mockSupabase({
      row: { id: '6', plan_key: 'ARCH-6', status: 'draft', chairman_approved: false, created_by: 'eva-archplan-command', quality_checked: true },
      updateResult: { id: '6', plan_key: 'ARCH-6', status: 'active', chairman_approved: true, chairman_approved_at: '2026-01-01T00:00:00.000Z' },
    });
    await promoteArchPlan({ supabase, planKey: 'ARCH-6', promotedBy: 'reviewer-session-v' });
    expect(supabase._updateCalls.length).toBe(1);
    const payload = supabase._updateCalls[0];
    expect(Object.keys(payload).sort()).toEqual(['chairman_approved', 'chairman_approved_at', 'status']);
    expect(payload).not.toHaveProperty('created_by');
    expect(payload).not.toHaveProperty('content');
    expect(payload).not.toHaveProperty('sections');
  });

  test('surfaces a read error without attempting an UPDATE', async () => {
    const supabase = mockSupabase({ readErr: { message: 'connection lost' } });
    const result = await promoteArchPlan({ supabase, planKey: 'ARCH-7', promotedBy: 'reviewer' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('read_failed');
    expect(supabase._updateCalls.length).toBe(0);
  });
});
