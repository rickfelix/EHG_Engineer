/**
 * SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-2, FR-3 -- unit coverage for
 * lib/periodic-liveness/chairman-awareness-writer.mjs.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AWARENESS_SUMMARY_PREFIX,
  RECORDED_VIA,
  buildAwarenessRow,
  writeChairmanAwareness,
  resolveChairmanAwareness,
} from '../../../lib/periodic-liveness/chairman-awareness-writer.mjs';

describe('buildAwarenessRow', () => {
  it('carries the full required insert shape (NOT NULL columns included)', () => {
    const row = buildAwarenessRow({ escalatingKeys: ['proc-1'], reason: 'dead_owner' });
    expect(row).toMatchObject({
      venture_id: null,
      lifecycle_stage: 0,
      decision: 'advisory',
      decision_type: 'advisory',
      status: 'approved',
      blocking: false,
    });
    expect(row.brief_data.recorded_via).toBe(RECORDED_VIA);
  });

  it('uses a summary prefix distinct from ladder-escalation.mjs\'s DIGEST_PREFIX ("Periodic-liveness ladder:")', () => {
    const row = buildAwarenessRow({ escalatingKeys: ['proc-1'], reason: 'dead_owner' });
    expect(row.summary.startsWith(AWARENESS_SUMMARY_PREFIX)).toBe(true);
    expect(row.summary.startsWith('Periodic-liveness ladder:')).toBe(false);
  });

  it('records all escalating keys in brief_data.process_keys and minted_context', () => {
    const row = buildAwarenessRow({ escalatingKeys: ['proc-1', 'proc-2'], reason: 'chairman_owned' });
    expect(row.brief_data.process_keys).toEqual(['proc-1', 'proc-2']);
    expect(row.brief_data.minted_context.process_keys).toEqual(['proc-1', 'proc-2']);
  });
});

describe('writeChairmanAwareness', () => {
  it('inserts a fresh row when none exists today', async () => {
    const insertSelect = vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: insertSelect }) }) }) };
    const findExisting = vi.fn().mockResolvedValue(null);
    const result = await writeChairmanAwareness(supabase, { processKey: 'proc-1', reason: 'dead_owner' }, { findExisting });
    expect(result).toEqual({ written: true, id: 'row-1', refreshed: false });
  });

  it('merges a second process into today\'s existing row rather than inserting a duplicate (one row per day)', async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const insert = vi.fn();
    const supabase = { from: () => ({ update, insert }) };
    const findExisting = vi.fn().mockResolvedValue({ id: 'row-today', brief_data: { process_keys: ['proc-1'], minted_context: { process_keys: ['proc-1'] } } });
    const result = await writeChairmanAwareness(supabase, { processKey: 'proc-2', reason: 'dead_owner' }, { findExisting });
    expect(result).toEqual({ written: true, id: 'row-today', refreshed: true });
    expect(insert).not.toHaveBeenCalled();
    const updateArg = update.mock.calls[0][0];
    expect(updateArg.brief_data.process_keys).toEqual(['proc-1', 'proc-2']);
    // Forensic-preservation: the ORIGINAL mint-time context is preserved, not overwritten.
    expect(updateArg.brief_data.minted_context).toEqual({ process_keys: ['proc-1'] });
  });

  it('does not duplicate the same process key on a second call the same day', async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const supabase = { from: () => ({ update }) };
    const findExisting = vi.fn().mockResolvedValue({ id: 'row-today', brief_data: { process_keys: ['proc-1'] } });
    const result = await writeChairmanAwareness(supabase, { processKey: 'proc-1', reason: 'dead_owner' }, { findExisting });
    expect(result.refreshed).toBe(true);
    expect(update.mock.calls[0][0].brief_data.process_keys).toEqual(['proc-1']);
  });

  it('fails soft (never throws) on an insert error, and logs loudly', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const insertSelect = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: insertSelect }) }) }) };
    const result = await writeChairmanAwareness(supabase, { processKey: 'proc-1', reason: 'dead_owner' }, { findExisting: async () => null });
    expect(result).toEqual({ written: false, error: 'boom' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('resolveChairmanAwareness', () => {
  it('stamps brief_data.resolved_at_by_key for the specific process key', async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const supabase = { from: () => ({ update }) };
    const findRow = vi.fn().mockResolvedValue({ id: 'row-1', brief_data: { process_keys: ['proc-1', 'proc-2'] } });
    const result = await resolveChairmanAwareness(supabase, 'proc-1', { findRow });
    expect(result).toEqual({ resolved: true, id: 'row-1' });
    const updateArg = update.mock.calls[0][0];
    expect(updateArg.brief_data.resolved_at_by_key['proc-1']).toEqual(expect.any(String));
  });

  it('is a fail-soft no-op when no unresolved row names this process', async () => {
    const findRow = vi.fn().mockResolvedValue(null);
    const supabase = { from: () => ({}) };
    const result = await resolveChairmanAwareness(supabase, 'proc-never-escalated', { findRow });
    expect(result.resolved).toBe(false);
  });

  it('does not clobber a sibling process key\'s prior resolution', async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const supabase = { from: () => ({ update }) };
    const findRow = vi.fn().mockResolvedValue({
      id: 'row-1',
      brief_data: { process_keys: ['proc-1', 'proc-2'], resolved_at_by_key: { 'proc-2': '2026-09-01T00:00:00Z' } },
    });
    await resolveChairmanAwareness(supabase, 'proc-1', { findRow });
    const updateArg = update.mock.calls[0][0];
    expect(updateArg.brief_data.resolved_at_by_key['proc-2']).toBe('2026-09-01T00:00:00Z');
    expect(updateArg.brief_data.resolved_at_by_key['proc-1']).toEqual(expect.any(String));
  });
});
