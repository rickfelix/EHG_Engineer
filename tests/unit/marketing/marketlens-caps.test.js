/**
 * MarketLens standing-caps enforcement tests (SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001)
 * Covers TS-3: write cap blocks at threshold; instance-cap allow-2-refuse-3rd; fail-closed on error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordWrite, checkWriteBudget, acquireInstanceSlot, releaseInstanceSlot } from '../../../lib/marketing/marketlens-caps.js';

describe('recordWrite', () => {
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    mockLogger = { warn: vi.fn() };
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  it('inserts a row into venture_write_ledger', async () => {
    recordWrite({ ventureId: 'v-1', operationType: 'queue_insert', metadata: { foo: 'bar' } }, { supabase: mockSupabase, logger: mockLogger });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSupabase.from).toHaveBeenCalledWith('venture_write_ledger');
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ venture_id: 'v-1', operation_type: 'queue_insert', write_count: 1, metadata: { foo: 'bar' } })
    );
  });

  it('skips silently (with a warning) when no supabase client is provided', () => {
    recordWrite({ ventureId: 'v-1', operationType: 'publish' }, { logger: mockLogger });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No supabase client'));
  });
});

describe('checkWriteBudget', () => {
  it('returns isOverBudget=false when under the cap', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ is_over_budget: false, writes_used: 500, writes_remaining: 99500 }], error: null }) };
    const result = await checkWriteBudget('v-1', { supabase });
    expect(result.isOverBudget).toBe(false);
    expect(result.writesRemaining).toBe(99500);
  });

  it('returns isOverBudget=true at the 100k threshold', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ is_over_budget: true, writes_used: 100000, writes_remaining: 0 }], error: null }) };
    const result = await checkWriteBudget('v-1', { supabase });
    expect(result.isOverBudget).toBe(true);
    expect(result.writesRemaining).toBe(0);
  });

  it('fails CLOSED (isOverBudget=true) when the RPC errors', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'transient db error' } }) };
    const result = await checkWriteBudget('v-1', { supabase, logger: { warn: vi.fn() } });
    expect(result.isOverBudget).toBe(true);
    expect(result.error).toContain('transient db error');
  });

  it('fails CLOSED when the RPC call throws', async () => {
    const supabase = { rpc: vi.fn().mockRejectedValue(new Error('network down')) };
    const result = await checkWriteBudget('v-1', { supabase, logger: { warn: vi.fn() } });
    expect(result.isOverBudget).toBe(true);
  });

  it('fails CLOSED when no supabase client is provided', async () => {
    const result = await checkWriteBudget('v-1', {});
    expect(result.isOverBudget).toBe(true);
    expect(result.error).toBe('no_supabase_client');
  });
});

describe('acquireInstanceSlot / releaseInstanceSlot', () => {
  it('acquires successfully when under the 2-instance cap', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ acquired: true, current_count: 1 }], error: null }) };
    const result = await acquireInstanceSlot('v-1', { supabase });
    expect(result.acquired).toBe(true);
    expect(result.currentCount).toBe(1);
    expect(supabase.rpc).toHaveBeenCalledWith('acquire_content_loop_instance_slot', { p_venture_id: 'v-1', p_max_instances: 2 });
  });

  it('refuses a 3rd instance with a loggable reason', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ acquired: false, current_count: 2 }], error: null }) };
    const result = await acquireInstanceSlot('v-1', { supabase });
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('instance_cap_reached');
    expect(result.currentCount).toBe(2);
  });

  it('refuses (does not silently no-op) when the RPC errors', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }) };
    const result = await acquireInstanceSlot('v-1', { supabase, logger: { warn: vi.fn() } });
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('db down');
  });

  it('releases a slot and returns the decremented count', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ current_count: 1 }], error: null }) };
    await releaseInstanceSlot('v-1', { supabase });
    expect(supabase.rpc).toHaveBeenCalledWith('release_content_loop_instance_slot', { p_venture_id: 'v-1' });
  });
});
