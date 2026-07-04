/**
 * Organic-only channel provisioning tests (SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001)
 * Covers TS-1: organic-only filter excludes the paid channel in the live stub.
 *
 * artifact_data.channels is a live-confirmed ARRAY of {channel, status, ...} objects
 * (verified directly against the real MarketLens venture_artifacts row), not an
 * object keyed by channel type.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectOrganicChannel, provisionOrganicChannel, _internal } from '../../../lib/marketing/organic-channel-provisioning.js';

describe('selectOrganicChannel (pure)', () => {
  it('excludes google_ads even when marked active, selecting an organic channel instead', () => {
    const channels = [
      { channel: 'blog_seo', status: 'active' },
      { channel: 'twitter_x', status: 'active' },
      { channel: 'email', status: 'active' },
      { channel: 'google_ads', status: 'active' },
      { channel: 'facebook_instagram', status: 'pending' },
    ];
    const { channelType, reason } = selectOrganicChannel(channels);
    expect(channelType).not.toBe('google_ads');
    expect(_internal.PAID_CHANNEL_TYPES).toContain('google_ads');
    expect(_internal.ORGANIC_CHANNEL_TYPES).toContain(channelType);
    expect(reason).toBe('selected_from_organic_allowlist');
  });

  it('prefers blog_seo over twitter_x/email when multiple organic channels are active', () => {
    const { channelType } = selectOrganicChannel([
      { channel: 'blog_seo', status: 'active' },
      { channel: 'twitter_x', status: 'active' },
      { channel: 'email', status: 'active' },
    ]);
    expect(channelType).toBe('blog_seo');
  });

  it('returns null when only a paid channel is active', () => {
    const { channelType, reason } = selectOrganicChannel([{ channel: 'google_ads', status: 'active' }]);
    expect(channelType).toBeNull();
    expect(reason).toBe('no_active_organic_channel_in_config');
  });

  it('returns null when no channel config is provided', () => {
    const { channelType, reason } = selectOrganicChannel(null);
    expect(channelType).toBeNull();
    expect(reason).toBe('no_channel_config_provided');
  });

  it('returns null when channels is not an array', () => {
    const { channelType, reason } = selectOrganicChannel({ blog_seo: { status: 'active' } });
    expect(channelType).toBeNull();
    expect(reason).toBe('no_channel_config_provided');
  });

  it('ignores channels with non-active status', () => {
    const { channelType, reason } = selectOrganicChannel([{ channel: 'blog_seo', status: 'pending' }]);
    expect(channelType).toBeNull();
    expect(reason).toBe('no_active_organic_channel_in_config');
  });
});

describe('provisionOrganicChannel (I/O)', () => {
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    mockLogger = { warn: vi.fn() };
  });

  function buildSupabaseMock({ existingRow = null, artifactData, channelRow = { id: 'chan-1' } } = {}) {
    const calls = [];
    return {
      calls,
      from: vi.fn((table) => {
        calls.push(table);
        if (table === 'venture_distribution_channels') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingRow }) }) }),
            insert: (row) => ({
              select: () => ({
                single: async () => ({ data: { id: 'vdc-1' }, error: null, __inserted: row }),
              }),
            }),
          };
        }
        if (table === 'venture_artifacts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: artifactData, error: artifactData ? null : { message: 'not found' } }) }),
              }),
            }),
          };
        }
        if (table === 'distribution_channels') {
          return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: channelRow, error: channelRow ? null : { message: 'not found' } }) }) }) }) };
        }
        if (table === 'channel_budgets') {
          return { upsert: async () => ({ error: null }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
  }

  it('is idempotent: returns the existing row instead of creating a duplicate', async () => {
    mockSupabase = buildSupabaseMock({ existingRow: { id: 'vdc-existing', channel_id: 'chan-1', is_organic: true } });
    const result = await provisionOrganicChannel({ ventureId: 'v-1' }, { supabase: mockSupabase, logger: mockLogger });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('already_provisioned');
    expect(result.venturedistributionChannelId).toBe('vdc-existing');
  });

  it('never selects google_ads even when the live stub lists it active, and inserts is_organic=true/budget_usd=0', async () => {
    mockSupabase = buildSupabaseMock({
      artifactData: { artifact_data: { channels: [{ channel: 'blog_seo', status: 'active' }, { channel: 'google_ads', status: 'active' }] } },
    });

    const result = await provisionOrganicChannel({ ventureId: 'v-1' }, { supabase: mockSupabase, logger: mockLogger });
    expect(result.ok).toBe(true);
    expect(result.channelType).toBe('blog_seo');
    expect(result.channelType).not.toBe('google_ads');
  });

  it('fails gracefully when no distribution_channel_config artifact exists', async () => {
    mockSupabase = buildSupabaseMock({ artifactData: null });
    const result = await provisionOrganicChannel({ ventureId: 'v-1' }, { supabase: mockSupabase, logger: mockLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_distribution_channel_config');
  });

  it('returns false when no supabase client is provided', async () => {
    const result = await provisionOrganicChannel({ ventureId: 'v-1' }, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_supabase_client');
  });
});
