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
  normalizeUpstreamParams,
  CHANNELS,
  REQUIRED_UPSTREAM,
  FEATURE_FLAG_KEY,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { CROSS_STAGE_DEPS } from '../../../../../lib/eva/contracts/stage-contracts.js';

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

// SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A (FR-003, option-ii): Distribution is now stage 21
// and Visual Assets is stage 22. Distribution's REQUIRED_UPSTREAM is only 3 entries
// (pricing/7, persona/10, GTM/12) — the former visual_social_graphics and
// visual_device_screenshots (source_stage:21) were removed because Distribution now runs
// BEFORE Visual (they were a forward-dependency contradiction).
const VALID_UPSTREAM = {
  stage7Data: { pricing: { tier: 'pro' } },
  stage10Data: { persona: { name: 'Pragmatic Priya' } },
  stage12Data: { gtm: { strategy: 'PLG' } },
  stage18Data: { copy: 'tagline' },
};

describe('stage-22-distribution-setup — pure helpers (FR-1/3/4)', () => {
  describe('validateEntryPreconditions (FR-3)', () => {
    it('passes when all 3 upstream artifacts present (pricing/7, persona/10, GTM/12)', () => {
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

  it('FR-3 — emits SKIP marker when engine_pricing_model (stage7) absent', async () => {
    // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A: Distribution no longer requires Visual
    // artifacts (they were a forward-dep contradiction). Verify that a genuinely
    // required precondition (stage7/pricing) causes a SKIP.
    const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
    const params = {
      ...VALID_UPSTREAM,
      stage7Data: null, // genuinely required upstream absent
      ventureName: 'TestVenture',
      ventureId: 'venture-uuid-1',
      supabase: sb,
      logger: { info: () => {}, warn: () => {} },
    };
    const out = await analyzeStage22Distribution(params);

    expect(out._skip).toBe(true);
    expect(out.precondition_missing.find(m => m.artifact_type === 'engine_pricing_model')).toBeDefined();
    expect(out.channels).toEqual([]);
    // SKIP marker persisted
    const skipInsert = inserted.find(i => i.payload.artifact_type === 'distribution_skip_marker');
    expect(skipInsert).toBeDefined();
    expect(skipInsert.payload.artifact_data.precondition_missing).toContain('engine_pricing_model');
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

// SD-LEO-FIX-FIX-POST-BUILD-001 — the worker upstream-loading fix.
// The generic worker (fetchUpstreamArtifacts) keys upstream data as stage{N}Data
// merged-by-stage with a __byType sub-map keyed by artifact_type. Before this fix
// (a) CROSS_STAGE_DEPS[22] omitted source stages 7/10/12 so stage7Data/stage10Data/
// stage12Data never arrived, and (b) the per-artifact-type S21 keys were never derived.
describe('SD-LEO-FIX-FIX-POST-BUILD-001 — worker upstream-loading fix', () => {
  // Shape the loader actually produces: stage{N}Data with a __byType sub-map.
  function makeWorkerShapeUpstream({ includeS21 = true } = {}) {
    const upstream = {
      stage7Data:  { tier: 'pro', __byType: { engine_pricing_model: { tier: 'pro' } } },
      stage10Data: { name: 'Pragmatic Priya', __byType: { identity_persona_brand: { name: 'Pragmatic Priya' } } },
      stage12Data: { strategy: 'PLG', __byType: { identity_gtm_sales_strategy: { strategy: 'PLG' } } },
      stage18Data: { copy: 'tagline', __byType: { content_marketing_copy: { copy: 'tagline' } } },
    };
    if (includeS21) {
      upstream.stage21Data = {
        // merged top-level (one type wins) + lossless __byType for both visual types
        url: 'social',
        __byType: {
          visual_social_graphics:    { social_url: 'https://cdn/social.png' },
          visual_device_screenshots: { screenshot_url: 'https://cdn/shot.png' },
        },
      };
    }
    return upstream;
  }

  // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A: Distribution is now stage_number 21
  // (not 22). CROSS_STAGE_DEPS[21] covers its deps; CROSS_STAGE_DEPS[22] is Visual Assets.
  describe('FR-1 — CROSS_STAGE_DEPS[21] alignment (Distribution is now stage 21)', () => {
    it('includes the producer-required source stages 7, 10 and 12', () => {
      for (const stage of [7, 10, 12]) {
        expect(CROSS_STAGE_DEPS[21]).toContain(stage);
      }
    });

    it('retains the build-phase context stages 17-20 (additive change only, stage 21 is self)', () => {
      // Distribution is stage 21, so CROSS_STAGE_DEPS[21] includes 17-20 as context;
      // 21 itself is not a dependency of itself.
      for (const stage of [17, 18, 19, 20]) {
        expect(CROSS_STAGE_DEPS[21]).toContain(stage);
      }
    });

    it('every REQUIRED_UPSTREAM source_stage is present in CROSS_STAGE_DEPS[21]', () => {
      const deps = new Set(CROSS_STAGE_DEPS[21]);
      for (const req of REQUIRED_UPSTREAM) {
        expect(deps.has(req.source_stage)).toBe(true);
      }
    });
  });

  describe('FR-2 — normalizeUpstreamParams (per-artifact-type S21 key derivation)', () => {
    it('does NOT derive stage21SocialData / stage21ScreenshotData (visual removed from REQUIRED_UPSTREAM)', () => {
      // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A: visual_social_graphics and
      // visual_device_screenshots were removed from REQUIRED_UPSTREAM (forward-dep fix).
      // normalizeUpstreamParams iterates REQUIRED_UPSTREAM generically; since those
      // artifact_types are gone, neither key is produced even when stage21Data.__byType
      // contains the visual entries.
      const out = normalizeUpstreamParams(makeWorkerShapeUpstream());
      expect(out.stage21SocialData).toBeUndefined();
      expect(out.stage21ScreenshotData).toBeUndefined();
    });

    it('leaves already-populated stage{N}Data keys untouched (stage7/10/12)', () => {
      const input = makeWorkerShapeUpstream();
      const out = normalizeUpstreamParams(input);
      expect(out.stage7Data).toBe(input.stage7Data);
      expect(out.stage10Data).toBe(input.stage10Data);
      expect(out.stage12Data).toBe(input.stage12Data);
    });

    it('is pure — does not mutate the input params', () => {
      const input = makeWorkerShapeUpstream();
      normalizeUpstreamParams(input);
      expect(input.stage21SocialData).toBeUndefined();
      expect(input.stage21ScreenshotData).toBeUndefined();
    });

    it('tolerates absent stage21Data / missing __byType without throwing', () => {
      expect(() => normalizeUpstreamParams({})).not.toThrow();
      expect(() => normalizeUpstreamParams({ stage21Data: {} })).not.toThrow();
      expect(() => normalizeUpstreamParams(null)).not.toThrow();
    });
  });

  describe('FR-3 — producer runs / skips correctly on worker-loader shape', () => {
    it('RUNS (preconditions ok) when all three required upstream artifacts (7/10/12) arrive in worker shape', () => {
      const normalized = normalizeUpstreamParams(makeWorkerShapeUpstream());
      const result = validateEntryPreconditions(normalized);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('does NOT skip end-to-end for a fully-built venture (worker shape)', async () => {
      setupMockLLM(makeLLMResponse());
      const { sb, inserted } = makeFakeSupabase({ flagEnabled: false });
      const out = await analyzeStage22Distribution({
        ...makeWorkerShapeUpstream(),
        ventureName: 'DataDistill',
        ventureId: 'venture-datadistill',
        supabase: sb,
        logger: { info: () => {}, warn: () => {} },
      });
      expect(out._skip).toBeUndefined();
      expect(inserted.find(i => i.payload.artifact_type === 'distribution_channel_config')).toBeDefined();
    });

    it('passes preconditions when S21 visual data absent — Distribution no longer requires Visual upstream', () => {
      // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A: visual_social_graphics and
      // visual_device_screenshots removed from REQUIRED_UPSTREAM (forward-dep fix).
      // Distribution runs BEFORE Visual Assets, so requiring Visual was a contradiction.
      // With S7/S10/S12 present and no stage21 visual data, preconditions are OK.
      const normalized = normalizeUpstreamParams(makeWorkerShapeUpstream({ includeS21: false }));
      const result = validateEntryPreconditions(normalized);
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
      // Visual artifact_types are not in the missing list (not required at all)
      const missingTypes = result.missing.map(m => m.artifact_type);
      expect(missingTypes).not.toContain('visual_social_graphics');
      expect(missingTypes).not.toContain('visual_device_screenshots');
      // S7/S10/S12 not falsely reported missing either
      expect(missingTypes).not.toContain('engine_pricing_model');
      expect(missingTypes).not.toContain('identity_persona_brand');
      expect(missingTypes).not.toContain('identity_gtm_sales_strategy');
    });
  });
});
