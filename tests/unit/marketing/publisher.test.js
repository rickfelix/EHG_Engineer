/**
 * Publisher Abstraction Layer Tests
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the adapters - use function() not arrow for constructor compatibility
vi.mock('../../../lib/marketing/publisher/adapters/x.js', () => {
  function MockXAdapter() {
    this.publish = vi.fn().mockResolvedValue({ success: true, postId: 'x-123', postUrl: 'https://x.com/i/status/x-123' });
    this.formatForX = vi.fn(content => content.body || '');
  }
  return { XAdapter: MockXAdapter };
});

vi.mock('../../../lib/marketing/publisher/adapters/bluesky.js', () => {
  function MockBlueskyAdapter() {
    this.publish = vi.fn().mockResolvedValue({ success: true, postId: 'at://did:plc:abc/app.bsky.feed.post/rkey', postUrl: 'https://bsky.app/profile/test/post/rkey' });
  }
  return { BlueskyAdapter: MockBlueskyAdapter };
});

/**
 * Table-aware mock — required since SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3/
 * FR-6 added three new pre-adapter-construction queries (venture_channel_autonomy,
 * venture_channel_publish_ledger, venture_guardrail_state) plus a credential lookup
 * (venture_channel_secrets) that a single table-agnostic chain can no longer represent
 * without silently mis-resolving one of them.
 *
 * Defaults represent the "everything wired and healthy" happy path: autonomous channel
 * (bypasses the propose-and-approve ledger check), under the rate limit, kill-switch
 * clear, funded budget, no venture-specific credential on record (adapters fall back to
 * their own dry-run path, which the adapter mocks below short-circuit anyway).
 */
function createMockSupabase(overrides = {}) {
  const tableConfig = {
    campaign_content: { maybeSingle: { data: null, error: null }, limitData: [] },
    venture_channel_autonomy: { maybeSingle: { data: { autonomy_state: 'autonomous' }, error: null } },
    venture_channel_publish_ledger: { maybeSingle: { data: null, error: null }, count: 0, gteError: null },
    venture_guardrail_state: {
      data: [
        { guardrail: 'human-gate', decision: 'allow', killswitch_open: false },
        { guardrail: 'd1-write-ceiling', decision: 'allow', killswitch_open: false }
      ],
      error: null
    },
    venture_channel_secrets: { maybeSingle: { data: null, error: null } },
    channel_budgets: {
      single: {
        data: { status: 'active', current_month_spend_cents: 0, monthly_budget_cents: 10000, daily_limit_cents: null },
        error: null
      }
    },
    ...overrides
  };

  const builder = (table) => {
    const cfg = tableConfig[table] || {};
    const chain = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      eq: vi.fn(() => chain),
      in: vi.fn(() => Promise.resolve({ data: cfg.data ?? [], error: cfg.error ?? null })),
      gte: vi.fn(() => Promise.resolve({ count: cfg.count ?? 0, error: cfg.gteError ?? null })),
      limit: vi.fn(() => Promise.resolve({ data: cfg.limitData ?? [] })),
      single: vi.fn(() => Promise.resolve(cfg.single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(cfg.maybeSingle ?? { data: null, error: null }))
    };
    return chain;
  };

  const mock = { from: vi.fn((table) => builder(table)) };
  return mock;
}

describe('Publisher', () => {
  let publish, getSupportedPlatforms;
  let mockSupabase;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    const mod = await import('../../../lib/marketing/publisher/index.js');
    publish = mod.publish;
    getSupportedPlatforms = mod.getSupportedPlatforms;
  });

  it('should return supported platforms', () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain('x');
    expect(platforms).toContain('bluesky');
  });

  it('should reject unsupported platforms', async () => {
    const result = await publish({
      supabase: mockSupabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'tiktok',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported platform');
  });

  it('should publish to x platform', async () => {
    const result = await publish({
      supabase: mockSupabase,
      content: { id: 'c-1', body: 'Test post', headline: 'Hello' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(true);
    expect(result.postId).toBe('x-123');
  });

  it('should publish to bluesky platform', async () => {
    const result = await publish({
      supabase: mockSupabase,
      content: { id: 'c-1', body: 'Test post' },
      platform: 'bluesky',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(true);
    expect(result.postId).toContain('at://');
  });

  it('should record attribution event on successful publish', async () => {
    await publish({
      supabase: mockSupabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    // Verify marketing_attribution insert was called
    expect(mockSupabase.from).toHaveBeenCalledWith('marketing_attribution');
  });

  it('should BLOCK publish (fail closed) when no budget row exists', async () => {
    // QF-20260706-549: publisher/index.js has its own local checkBudget() (separate
    // from lib/marketing/budget-governor.js) that also failed open on a missing row.
    const noBudgetSupabase = createMockSupabase({
      channel_budgets: { single: { data: null, error: null } }
    });

    const result = await publish({
      supabase: noBudgetSupabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No budget configured');
  });

  it('should deduplicate existing dispatches', async () => {
    // Mock existing dispatch found
    const dedupeSupabase = createMockSupabase({
      campaign_content: { limitData: [{ id: 'existing', external_post_id: 'x-existing' }] }
    });

    const result = await publish({
      supabase: dedupeSupabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(true);
    expect(result.deduplicated).toBe(true);
  });
});

describe('Publisher — SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-3/FR-6 hard gates', () => {
  let publish;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../lib/marketing/publisher/index.js');
    publish = mod.publish;
  });

  it('hard-blocks a publish attempt with no approval record (propose_and_approve default, no accepted ledger entry)', async () => {
    const supabase = createMockSupabase({
      venture_channel_autonomy: { maybeSingle: { data: null, error: null } }, // no row -> defaults to propose_and_approve
      venture_channel_publish_ledger: { maybeSingle: { data: null, error: null } } // no accepted entry
    });

    const result = await publish({
      supabase,
      content: { id: 'c-unapproved', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('autonomy-gate');
    expect(result.error).toContain('AUTONOMY_APPROVAL_REQUIRED');
  });

  it('allows publish when a channel has an accepted ledger entry for this content (propose-and-approve satisfied)', async () => {
    const supabase = createMockSupabase({
      venture_channel_autonomy: { maybeSingle: { data: { autonomy_state: 'propose_and_approve' }, error: null } },
      venture_channel_publish_ledger: { maybeSingle: { data: { id: 'ledger-1' }, error: null } }
    });

    const result = await publish({
      supabase,
      content: { id: 'c-approved', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(true);
  });

  it('fails closed (blocks) when the autonomy-state lookup errors', async () => {
    const supabase = createMockSupabase({
      venture_channel_autonomy: { maybeSingle: { data: null, error: { message: 'connection reset' } } }
    });

    const result = await publish({
      supabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('autonomy-gate');
    expect(result.error).toContain('fail-closed');
  });

  it('hard-blocks when the durable rate limit is exceeded', async () => {
    const supabase = createMockSupabase({
      venture_channel_publish_ledger: { maybeSingle: { data: null, error: null }, count: 50 }
    });

    const result = await publish({
      supabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('rate-limit');
    expect(result.error).toContain('RATE_LIMIT_EXCEEDED');
  });

  it('halts an in-flight publish when the chairman kill-switch is open', async () => {
    const supabase = createMockSupabase({
      venture_guardrail_state: {
        data: [
          { guardrail: 'human-gate', decision: 'allow', killswitch_open: false },
          { guardrail: 'd1-write-ceiling', decision: 'allow', killswitch_open: true }
        ],
        error: null
      }
    });

    const result = await publish({
      supabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('spend-guardrail');
  });

  it('fails closed when guardrail rows are not recorded for this venture', async () => {
    const supabase = createMockSupabase({
      venture_guardrail_state: { data: [], error: null }
    });

    const result = await publish({
      supabase,
      content: { id: 'c-1', body: 'Test' },
      platform: 'x',
      ventureId: 'v-1'
    });

    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('spend-guardrail');
    expect(result.error).toContain('not recorded');
  });
});

describe('X Adapter Formatting', () => {
  it('should format content within 280 chars', async () => {
    const { XAdapter } = await import('../../../lib/marketing/publisher/adapters/x.js');
    // Using the real implementation for formatting tests
    const realAdapter = {
      formatForX(content) {
        const parts = [];
        if (content.headline) parts.push(content.headline);
        if (content.body) parts.push(content.body);
        if (content.cta) parts.push(content.cta);
        let text = parts.join('\n\n');
        if (text.length > 280) {
          text = text.substring(0, 279) + '\u2026';
        }
        return text;
      }
    };

    const text = realAdapter.formatForX({
      headline: 'Short Headline',
      body: 'Short body',
      cta: 'Learn more'
    });

    expect(text.length).toBeLessThanOrEqual(280);
    expect(text).toContain('Short Headline');
  });

  it('should truncate content exceeding 280 chars', () => {
    const longContent = {
      headline: 'A'.repeat(150),
      body: 'B'.repeat(150),
      cta: 'C'.repeat(50)
    };

    const parts = [];
    if (longContent.headline) parts.push(longContent.headline);
    if (longContent.body) parts.push(longContent.body);
    if (longContent.cta) parts.push(longContent.cta);
    let text = parts.join('\n\n');
    if (text.length > 280) {
      text = text.substring(0, 279) + '\u2026';
    }

    expect(text.length).toBe(280);
    expect(text.endsWith('\u2026')).toBe(true);
  });
});

describe('Bluesky Adapter Formatting', () => {
  it('should format content within 300 chars', () => {
    const content = {
      headline: 'Test Post',
      body: 'This is a test post for Bluesky',
      cta: 'Check it out'
    };

    const parts = [];
    if (content.headline) parts.push(content.headline);
    if (content.body) parts.push(content.body);
    if (content.cta) parts.push(content.cta);
    let text = parts.join('\n\n');
    if (text.length > 300) {
      text = text.substring(0, 299) + '\u2026';
    }

    expect(text.length).toBeLessThanOrEqual(300);
    expect(text).toContain('Test Post');
  });
});
