/**
 * MarketLens Owned-Audience Content Loop — full integration test
 * SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
 *
 * End-to-end: provision (organic-only, excluding a paid stub channel) -> generate+queue
 * -> approve -> publish (kill-switch + zero-budget gated) -> weekly rollup -> caps ledger.
 * Only the LLM call boundary is mocked (cost/determinism); every DB operation runs for
 * real against a disposable test venture, cleaned up in afterAll.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

vi.mock('../../lib/llm/client-factory.js', () => ({
  getFastClient: () => ({
    complete: async () => ({
      content: JSON.stringify([
        { headline: 'Test headline A', body: 'Test body A https://marketlens.test', cta: 'Learn more' },
        { headline: 'Test headline B', body: 'Test body B', cta: 'Sign up' },
      ]),
    }),
  }),
}));

const { generateAndQueue, publishApprovedItem, computeWeeklyRollup } = await import('../../lib/marketing/owned-audience-content-loop.js');
const { provisionOrganicChannel } = await import('../../lib/marketing/organic-channel-provisioning.js');
const { checkWriteBudget } = await import('../../lib/marketing/marketlens-caps.js');

const supabase = createSupabaseServiceClient();

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

describe.skipIf(!HAS_REAL_DB)('MarketLens Owned-Audience Content Loop (integration)', () => {
  let testVentureId;
  let testCompanyId;
  let testChannelRowId;
  let queueItemId;

  beforeAll(async () => {
    testCompanyId = uuidv4();
    testVentureId = uuidv4();

    await supabase.from('companies').insert({ id: testCompanyId, name: 'Test Company for Owned-Audience Loop', created_at: new Date().toISOString() });
    await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Test Venture for Owned-Audience Loop',
      is_demo: true, // SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002: fixture flagged at creation
      company_id: testCompanyId,
      problem_statement: 'Test problem statement',
      current_lifecycle_stage: 24,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // Stub distribution_channel_config artifact — deliberately includes a PAID channel
    // (google_ads) to prove provisioning excludes it, mirroring the real MarketLens stub.
    // artifact_data.channels is an ARRAY of {channel, status} objects (live-confirmed shape).
    await supabase.from('venture_artifacts').insert({
      venture_id: testVentureId,
      artifact_type: 'distribution_channel_config',
      title: 'distribution_channel_config',
      lifecycle_stage: 22,
      artifact_data: {
        channels: [
          { channel: 'blog_seo', status: 'active' },
          { channel: 'twitter_x', status: 'active' },
          { channel: 'google_ads', status: 'active' },
        ],
      },
    });

    await supabase.from('factory_guardrail_state').insert({ venture_id: testVentureId, kill_switch_active: false });

    const { data: channelRow } = await supabase.from('distribution_channels').select('id').eq('platform', 'website').limit(1).maybeSingle();
    testChannelRowId = channelRow?.id;
  });

  afterAll(async () => {
    if (queueItemId) await supabase.from('marketing_content_queue').delete().eq('id', queueItemId);
    if (testVentureId) {
      await supabase.from('venture_audience_weekly').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_write_ledger').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_distribution_channels').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_artifacts').delete().eq('venture_id', testVentureId);
      await supabase.from('factory_guardrail_state').delete().eq('venture_id', testVentureId);
      await supabase.from('marketing_content_queue').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) await supabase.from('companies').delete().eq('id', testCompanyId);
  });

  it('provisions an organic-only channel, excluding the paid stub entry', async () => {
    const result = await provisionOrganicChannel({ ventureId: testVentureId }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.channelType).not.toBe('google_ads');
    expect(['blog_seo', 'twitter_x']).toContain(result.channelType);

    const { data: row } = await supabase.from('venture_distribution_channels').select('*').eq('venture_id', testVentureId).single();
    expect(row.is_organic).toBe(true);
    expect(Number(row.budget_usd)).toBe(0);
  });

  it('is idempotent on a second provisioning call', async () => {
    const result = await provisionOrganicChannel({ ventureId: testVentureId }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('already_provisioned');
  });

  it('generates content and inserts it into marketing_content_queue as pending_review', async () => {
    const result = await generateAndQueue(
      { ventureId: testVentureId, ventureContext: { name: 'Test Venture', description: 'test', targetAudience: 'testers', industry: 'testing' } },
      { supabase }
    );
    expect(result.ok).toBe(true);
    queueItemId = result.queueItemId;

    const { data: row } = await supabase.from('marketing_content_queue').select('*').eq('id', queueItemId).single();
    expect(row.status).toBe('pending_review');
    expect(row.venture_id).toBe(testVentureId);
    expect(row.title).toBe('Test headline A');
  });

  it('records a write-ledger entry for the queue insert', async () => {
    // recordWrite() is fire-and-forget by design (mirrors token-tracker.js's
    // recordTokenUsage) — give the async insert from the previous test a tick to land.
    await new Promise((r) => setTimeout(r, 50));
    const { isOverBudget, writesUsed } = await checkWriteBudget(testVentureId, { supabase });
    expect(isOverBudget).toBe(false);
    expect(writesUsed).toBeGreaterThanOrEqual(1);
  });

  it('refuses to publish a pending_review item (not yet approved)', async () => {
    const result = await publishApprovedItem({ queueItemId, ventureId: testVentureId, platform: 'x' }, { supabase });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('queue_item_not_approved');
  });

  it('publishes once approved (adapter dry-runs safely with no X credentials configured)', async () => {
    await supabase.from('marketing_content_queue').update({ status: 'approved' }).eq('id', queueItemId);

    const result = await publishApprovedItem({ queueItemId, ventureId: testVentureId, platform: 'x' }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.published).toBe(true);

    const { data: row } = await supabase.from('marketing_content_queue').select('status').eq('id', queueItemId).single();
    expect(row.status).toBe('posted');
  });

  it('aborts publish and preserves approved status when the kill-switch is active', async () => {
    // Re-approve a fresh item so this test is independent of the previous publish.
    const { data: secondItem } = await supabase.from('marketing_content_queue').insert({
      venture_id: testVentureId, title: 'Second item', content_body: 'body', content_type: 'social_post', status: 'approved',
    }).select('id').single();

    await supabase.from('factory_guardrail_state').update({ kill_switch_active: true }).eq('venture_id', testVentureId);

    const result = await publishApprovedItem({ queueItemId: secondItem.id, ventureId: testVentureId, platform: 'x' }, { supabase });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('kill_switch_active');

    const { data: row } = await supabase.from('marketing_content_queue').select('status').eq('id', secondItem.id).single();
    expect(row.status).toBe('approved'); // not consumed

    await supabase.from('factory_guardrail_state').update({ kill_switch_active: false }).eq('venture_id', testVentureId);
    await supabase.from('marketing_content_queue').delete().eq('id', secondItem.id);
  });

  it('computes a durable weekly rollup from distribution_history', async () => {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay() + 1); // Monday of current week
    const weekStartIso = weekStart.toISOString().slice(0, 10);

    await supabase.from('distribution_history').insert({
      venture_id: testVentureId,
      platform: 'x',
      status: 'posted',
      posted_at: new Date().toISOString(),
      clicks: 3,
      impressions: 30,
      engagement_rate: 1.2,
    });

    const result = await computeWeeklyRollup({ ventureId: testVentureId, weekStart: weekStartIso }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.alreadyComputed).toBe(false);

    const { data: rollup } = await supabase.from('venture_audience_weekly').select('*').eq('venture_id', testVentureId).eq('week_start', weekStartIso).single();
    expect(rollup.clicks).toBeGreaterThanOrEqual(3);
    expect(rollup.post_count).toBeGreaterThanOrEqual(1);

    // Second call for the same week is a no-op durable snapshot.
    const second = await computeWeeklyRollup({ ventureId: testVentureId, weekStart: weekStartIso }, { supabase });
    expect(second.alreadyComputed).toBe(true);

    await supabase.from('distribution_history').delete().eq('venture_id', testVentureId);
  });
});
