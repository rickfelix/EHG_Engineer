/**
 * Owned-audience content-loop tests (SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001)
 * Covers TS-2 (queue SSOT), TS-4 (kill-switch), TS-5 (zero-budget), TS-6 (durable weekly rollup).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishApprovedItem, computeWeeklyRollup, aggregateWeeklyMetrics } from '../../../lib/marketing/owned-audience-content-loop.js';

vi.mock('../../../lib/marketing/publisher/index.js', () => ({
  publish: vi.fn().mockResolvedValue({ success: true, postId: 'post-1' }),
}));
vi.mock('../../../lib/marketing/marketlens-caps.js', () => ({
  recordWrite: vi.fn(),
  checkWriteBudget: vi.fn().mockResolvedValue({ isOverBudget: false }),
}));
vi.mock('../../../lib/eva/utils/token-tracker.js', () => ({
  recordTokenUsage: vi.fn(),
  checkBudget: vi.fn().mockResolvedValue({ is_over_budget: false }),
}));

import { publish } from '../../../lib/marketing/publisher/index.js';
import { checkWriteBudget } from '../../../lib/marketing/marketlens-caps.js';

describe('aggregateWeeklyMetrics (pure)', () => {
  it('sums clicks/impressions and averages engagement_rate', () => {
    const rows = [
      { clicks: 10, impressions: 100, engagement_rate: 2.5 },
      { clicks: 20, impressions: 200, engagement_rate: 3.5 },
    ];
    const result = aggregateWeeklyMetrics(rows);
    expect(result).toEqual({ clicks: 30, impressions: 300, engagementRate: 3, postCount: 2 });
  });

  it('returns zeros for an empty week', () => {
    expect(aggregateWeeklyMetrics([])).toEqual({ clicks: 0, impressions: 0, engagementRate: 0, postCount: 0 });
  });
});

describe('publishApprovedItem', () => {
  let mockLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    checkWriteBudget.mockResolvedValue({ isOverBudget: false });
    mockLogger = { warn: vi.fn() };
  });

  function buildSupabase({ queueStatus = 'approved', killSwitchActive = false, channelJoin = { budget_usd: 0, is_organic: true } } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'marketing_content_queue') {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'q-1', status: queueStatus, title: 't', content_body: 'b', venture_id: 'v-1' }, error: null }) }) }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === 'factory_guardrail_state') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { kill_switch_active: killSwitchActive }, error: null }) }) }) };
        }
        if (table === 'venture_distribution_channels') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: channelJoin, error: null }) }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  it('publishes when the queue item is approved, kill-switch is off, and budget is zero (TS-4/TS-5 happy path)', async () => {
    const supabase = buildSupabase();
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(true);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ id: 'q-1' }), platform: 'x', ventureId: 'v-1' })
    );
  });

  it('rejects a non-approved queue item without ever calling publish', async () => {
    const supabase = buildSupabase({ queueStatus: 'pending_review' });
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('queue_item_not_approved');
    expect(publish).not.toHaveBeenCalled();
  });

  it('TS-4: aborts without consuming the item when the kill-switch is active', async () => {
    const supabase = buildSupabase({ killSwitchActive: true });
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('kill_switch_active');
    expect(publish).not.toHaveBeenCalled();
  });

  it('fails closed when the kill-switch lookup itself errors', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'marketing_content_queue') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'q-1', status: 'approved', title: 't', content_body: 'b', venture_id: 'v-1' }, error: null }) }) }) };
        }
        if (table === 'factory_guardrail_state') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'db down' } }) }) }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('kill_switch_check_failed_closed');
    expect(publish).not.toHaveBeenCalled();
  });

  it('TS-5: rejects publish when the channel-join budget_usd is non-zero', async () => {
    const supabase = buildSupabase({ channelJoin: { budget_usd: 10, is_organic: true } });
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('zero_budget_enforcement');
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects publish when no channel has been provisioned', async () => {
    const supabase = buildSupabase({ channelJoin: null });
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_provisioned_channel');
  });

  it('blocks publish when the write cap is exceeded', async () => {
    checkWriteBudget.mockResolvedValue({ isOverBudget: true });
    const supabase = buildSupabase();
    const result = await publishApprovedItem({ queueItemId: 'q-1', ventureId: 'v-1', platform: 'x' }, { supabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('write_cap_exceeded');
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('computeWeeklyRollup', () => {
  it('TS-6: is a no-op (does not overwrite) when a rollup already exists for that week', async () => {
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_audience_weekly') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing' } }) }) }) }) };
        }
        throw new Error(`Unexpected table in no-op test: ${table}`);
      }),
    };
    const result = await computeWeeklyRollup({ ventureId: 'v-1', weekStart: '2026-07-06' }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.alreadyComputed).toBe(true);
  });

  it('computes and inserts a new snapshot matching distribution_history aggregates', async () => {
    let insertedRow = null;
    const supabase = {
      from: vi.fn((table) => {
        if (table === 'venture_audience_weekly') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
            insert: async (row) => { insertedRow = row; return { error: null }; },
          };
        }
        if (table === 'distribution_history') {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({ lt: async () => ({ data: [{ clicks: 5, impressions: 50, engagement_rate: 1.5 }], error: null }) }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const result = await computeWeeklyRollup({ ventureId: 'v-1', weekStart: '2026-07-06' }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.alreadyComputed).toBe(false);
    expect(insertedRow).toEqual(expect.objectContaining({ venture_id: 'v-1', week_start: '2026-07-06', clicks: 5, impressions: 50, engagement_rate: 1.5, post_count: 1 }));
  });
});
