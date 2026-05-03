/**
 * Unit tests for Stage 22 Analysis Step — Distribution Setup
 * SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001
 *
 * Covers:
 *   FR-1 split + idempotency + dual-emit (flag OFF emits 3, flag ON emits 2)
 *   FR-3 entry-precondition refusal + SKIP marker artifact
 *   FR-4 channel-coverage validation (4 negative cases + happy path)
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client BEFORE importing the module under test.
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import {
  analyzeStage22Distribution,
  validateEntryPreconditions,
  validateChannelCoverage,
  splitArtifacts,
  CHANNELS,
  REQUIRED_UPSTREAM,
  FEATURE_FLAG_KEY,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

// Helper — full happy-path LLM response (all 6 channels, 3 active).
function makeLLMResponse(overrides = {}) {
  const channels = (overrides.channels || CHANNELS.map(ch => {
    const isActive = ['app_store', 'google_ads', 'email'].includes(ch);
    return {
      channel: ch,
      enabled: isActive,
      status: isActive ? 'active' : 'skipped',
      skip_reason: isActive ? null : `No ${ch} audience for B2B persona`,
      ad_copy: isActive ? { headline: 'h', body: 'b', cta: 'c' } : null,
      targeting: isActive ? { audience: 'a', demographics: 'd', keywords: ['k'] } : null,
    };
  }));
  return JSON.stringify({
    channels,
    email_sequences: [{ sequence_name: 'welcome', emails_count: 3, cadence: 'D0,D3,D7', preview: 'p' }],
    budget_allocation: { total_monthly: '$5k', by_channel: { google_ads: '50%', email: '50%' } },
    ...overrides,
  });
}

function setupMockLLM(response) {
  const mockComplete = vi.fn().mockResolvedValue(response);
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

// Factory — fake supabase client that records calls.
function makeFakeSupabase({ flagEnabled = false, captureWrites = [] } = {}) {
  const inserted = [];
  const updated = [];
  captureWrites.length = 0; // share array if caller wants to inspect
  const sb = {
    from(table) {
      const ctx = { table };
      const builder = {
        select(_fields) {
          ctx.op = 'select';
          return builder;
        },
        eq(col, val) {
          ctx.filters = ctx.filters || {};
          ctx.filters[col] = val;
          return builder;
        },
        maybeSingle() {
          if (table === 'leo_feature_flags' && ctx.filters?.flag_key === FEATURE_FLAG_KEY) {
            return Promise.resolve({ data: { is_enabled: flagEnabled }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(payload) {
          ctx.op = 'update';
          ctx.payload = payload;
          return {
            eq(col, val) {
              ctx.filters = ctx.filters || {};
              ctx.filters[col] = val;
              return this;
            },
          };
        },
        insert(payload) {
          inserted.push({ table, payload });
          captureWrites.push({ op: 'insert', table, payload });
          return Promise.resolve({ data: payload, error: null });
        },
      };
      // Mock update path so it returns a thenable when chained .eq().eq().eq().eq()
      const origUpdate = builder.update.bind(builder);
      builder.update = (payload) => {
        const rec = { op: 'update', table, payload, filters: {} };
        updated.push(rec);
        captureWrites.push(rec);
        const eqChain = {
          eq(col, val) { rec.filters[col] = val; return eqChain; },
          then(resolve) { resolve({ data: null, error: null }); return Promise.resolve({ data: null, error: null }); },
        };
        return eqChain;
      };
      return builder;
    },
  };
  return { sb, inserted, updated };
}

const VALID_UPSTREAM = {
  stage7Data: { pricing: { tier: 'pro' } },
  stage10Data: { persona: { name: 'Pragmatic Priya' } },
  stage12Data: { gtm: { strategy: 'PLG' } },
  stage21SocialData: { social: { url: 'x' } },
  stage21ScreenshotData: { screenshots: { url: 'y' } },
  stage18Data: { copy: 'tagline' },
};

describe('stage-22-distribution-setup — pure helpers (FR-1/3/4)', () => {
  describe('validateEntryPreconditions (FR-3)', () => {
    it('passes when all 5 upstream artifacts present', () => {
      const result = validateEntryPreconditions(VALID_UPSTREAM);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it.each(REQUIRED_UPSTREAM)('fails when $artifact_type missing', (req) => {
      const params = { ...VALID_UPSTREAM, [req.param_key]: null };
      const result = validateEntryPreconditions(params);
      expect(result.ok).toBe(false);
      expect(result.missing).toContainEqual({ artifact_type: req.artifact_type, source_stage: req.source_stage });
    });

    it('treats empty-object data as missing', () => {
      const result = validateEntryPreconditions({ ...VALID_UPSTREAM, stage7Data: {} });
      expect(result.ok).toBe(false);
      expect(result.missing[0].artifact_type).toBe('engine_pricing_model');
    });
  });

  describe('validateChannelCoverage (FR-4)', () => {
    function makeChannel(overrides = {}) {
      return {
        channel: 'email',
        enabled: true,
        ad_copy: { headline: 'h', body: 'b', cta: 'c' },
        targeting: { audience: 'a' },
        ...overrides,
      };
    }
    function makeAll6(overrides = {}) {
      return CHANNELS.map(ch => {
        const isActive = ['app_store', 'google_ads', 'email'].includes(ch);
        return makeChannel({
          channel: ch,
          enabled: isActive,
          skip_reason: isActive ? null : 'no audience',
          ad_copy: isActive ? { headline: 'h', body: 'b', cta: 'c' } : null,
          targeting: isActive ? { audience: 'a' } : null,
          ...overrides,
        });
      });
    }

    it('passes when all 6 channels present and well-formed', () => {
      expect(() => validateChannelCoverage(makeAll6())).not.toThrow();
    });

    it('throws when channels is not an array', () => {
      expect(() => validateChannelCoverage(null)).toThrow(/not an array/);
      expect(() => validateChannelCoverage('garbage')).toThrow(/not an array/);
    });

    it('throws when a channel is missing', () => {
      const channels = makeAll6().filter(c => c.channel !== 'twitter_x');
      expect(() => validateChannelCoverage(channels)).toThrow(/missing channel "twitter_x"/);
    });

    it('throws when an unrecognized channel is present', () => {
      const channels = makeAll6().concat([makeChannel({ channel: 'tiktok' })]);
      expect(() => validateChannelCoverage(channels)).toThrow(/unrecognized channel "tiktok"/);
    });

    it('throws when an enabled channel is missing ad_copy', () => {
      const channels = makeAll6();
      channels[0].ad_copy = null;
      expect(() => validateChannelCoverage(channels)).toThrow(/missing ad_copy object/);
    });

    it('throws when a disabled channel is missing skip_reason', () => {
      const channels = makeAll6();
      const ix = channels.findIndex(c => !c.enabled);
      channels[ix].skip_reason = '';
      channels[ix].reason = '';
      expect(() => validateChannelCoverage(channels)).toThrow(/missing skip_reason/);
    });
  });

  describe('splitArtifacts (FR-1)', () => {
    it('splits into channelConfig (no ad_copy) and adCopy (only enabled channels)', () => {
      const llmResult = JSON.parse(makeLLMResponse());
      const { channelConfig, adCopy } = splitArtifacts(llmResult);

      expect(channelConfig.channels).toHaveLength(6);
      expect(channelConfig.channels.every(c => c.ad_copy === undefined)).toBe(true);
      expect(channelConfig.budget_allocation).toBeDefined();

      expect(adCopy.channels_with_copy.length).toBe(3);
      expect(adCopy.channels_with_copy.every(c => c.ad_copy)).toBe(true);
      expect(adCopy.email_sequences).toHaveLength(1);
    });
  });
});

describe('analyzeStage22Distribution — integration (FR-1/3/4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FR-3 — emits SKIP marker when visual_social_graphics absent', async () => {
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      stage21SocialData: null, // missing
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-1',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);

    expect(out._skip).toBe(true);
    expect(out.precondition_missing.find(m => m.artifact_type === 'visual_social_graphics')).toBeDefined();
    expect(out.channels).toEqual([]);
    // SKIP marker persisted
    const skipInsert = inserted.find(i => i.payload.artifact_type === 'distribution_skip_marker');
    expect(skipInsert).toBeDefined();
    expect(skipInsert.payload.artifact_data.precondition_missing).toContain('visual_social_graphics');
    // Canonical pair NOT emitted
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_channel_config')).toBeUndefined();
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_ad_copy')).toBeUndefined();
  });

  it('FR-1 — emits BOTH canonical pair AND legacy launch_deployment_runbook when flag OFF (dual-emit)', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-2',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);

    expect(out._skip).toBeUndefined();
    expect(out._flag_enabled).toBe(false);
    expect(out._dual_emitted).toBe(true);
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_channel_config')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_ad_copy')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'launch_deployment_runbook')).toBeDefined();
  });

  it('FR-1 — emits ONLY canonical pair (no legacy) when flag ON (single-emit)', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: true });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-3',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);

    expect(out._flag_enabled).toBe(true);
    expect(out._dual_emitted).toBe(false);
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_channel_config')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_ad_copy')).toBeDefined();
    expect(inserted.find(i => i.payload.artifact_type === 'launch_deployment_runbook')).toBeUndefined();
  });

  it('FR-1 — idempotent: marks prior is_current=true rows as is_current=false before insert', async () => {
    setupMockLLM(makeLLMResponse());
    const { sb, updated } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-4',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    await analyzeStage22Distribution(params);
    // 3 update calls (one per artifact_type written) when dual-emit ON
    const channelConfigUpdates = updated.filter(u => u.filters.artifact_type === 'distribution_channel_config');
    const adCopyUpdates = updated.filter(u => u.filters.artifact_type === 'distribution_ad_copy');
    const legacyUpdates = updated.filter(u => u.filters.artifact_type === 'launch_deployment_runbook');
    expect(channelConfigUpdates.length).toBe(1);
    expect(adCopyUpdates.length).toBe(1);
    expect(legacyUpdates.length).toBe(1);
    // The update payload sets is_current=false
    expect(channelConfigUpdates[0].payload.is_current).toBe(false);
  });

  it('FR-4 — emits SKIP marker when LLM returns malformed coverage (missing channel)', async () => {
    setupMockLLM(makeLLMResponse({
      channels: CHANNELS.filter(c => c !== 'twitter_x').map(ch => ({
        channel: ch, enabled: true, ad_copy: { headline: 'h', body: 'b', cta: 'c' }, targeting: { audience: 'a' },
      })),
    }));
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-5',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);

    expect(out._skip).toBe(true);
    expect(out._validation_error).toMatch(/missing channel "twitter_x"/);
    const skipInsert = inserted.find(i => i.payload.artifact_type === 'distribution_skip_marker');
    expect(skipInsert).toBeDefined();
    expect(skipInsert.payload.artifact_data.precondition_missing).toContain('channel_coverage_violation');
    // Canonical pair NOT emitted (validation failed)
    expect(inserted.find(i => i.payload.artifact_type === 'distribution_channel_config')).toBeUndefined();
  });

  it('returns gracefully when supabase absent (no persistence happens)', async () => {
    setupMockLLM(makeLLMResponse());
    const params = {
      ...VALID_UPSTREAM,
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-6',
      supabase: null,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);
    expect(out._canonical_pair).toBeDefined();
    expect(out._flag_enabled).toBe(false); // defaults OFF when no supabase
  });
});
