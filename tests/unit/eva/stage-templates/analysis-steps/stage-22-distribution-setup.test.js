/**
 * Unit tests for Stage 22 Analysis Step — Distribution Setup (thesis-derived rebuild)
 * SD: SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-B
 *
 * Covers (PRD FR-1..FR-8 / TS-1..TS-9):
 *   FR-1 thesis-derived channels, open taxonomy, no fixed-six validator
 *   FR-2 persona×channel JOIN → COHERENCE_JOIN_GAP (fail-partial)
 *   FR-3 ranked budget-boxed portfolio, ≥2 message variants, UTM/first-touch,
 *        back-compat channels[]/counts + value-domain normalization
 *   FR-4 fail-partial per-experiment validation
 *   FR-5 binding gate: recorded blocking chairman decision + block marker,
 *        canonical pair withheld, dedup, zero _skip:true
 *   FR-7 approved chairman skip → BUILD_DEVIATION_RECORD valve
 *   TR-4 no fabricated fallback portfolio on LLM failure
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Mock the LLM client BEFORE importing the module under test.
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));
// Growth co-output + gap diagnostics are separately-owned modules with their own
// suites — isolate them here so their DB/LLM traffic doesn't pollute call capture.
vi.mock('../../../../../lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js', () => ({
  runPrelaunchGrowthCoOutput: vi.fn(async () => ({ status: 'mocked' })),
}));
vi.mock('../../../../../lib/eva/contracts/describe-artifact-gap.js', () => ({
  describeArtifactGap: vi.fn(async () => null),
}));

import {
  analyzeStage22Distribution,
  validateThesisChannelClaim,
  deriveChannelsFromThesis,
  validateExperiment,
  rankExperiments,
  assembleExperiments,
  splitArtifacts,
  normalizeChannelName,
  normalizeUpstreamParams,
  paidBudgetAdvisory,
  THESIS_ARTIFACT_TYPE,
  BLOCK_DECISION_TYPE,
  SKIP_DECISION_TYPE,
  REQUIRED_UPSTREAM,
} from '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

const silent = { info() {}, warn() {}, error() {}, log() {} };

// ---------------------------------------------------------------------------
// Fake supabase harness (extended for the rebuild — HIGH-6 finding):
// - generic eq/in filter application against seeded per-table rows
// - chainable insert().select('id')[.single()] (recordPendingDecision, recordDeviation)
// - order()/limit()/maybeSingle()/single() and thenable awaiting
// ---------------------------------------------------------------------------
function makeFakeSupabase(seedRows = {}) {
  const calls = { inserts: [], updates: [] };
  let insertSeq = 0;

  function from(table) {
    const q = { table, op: 'select', filters: [], limitN: null, wantSingle: false, wantMaybe: false, payload: null };

    function applyFilters(rows) {
      return rows.filter((row) => q.filters.every(([kind, col, val]) => {
        if (kind === 'eq') return row[col] === val;
        if (kind === 'in') return Array.isArray(val) && val.includes(row[col]);
        return true;
      }));
    }

    function exec() {
      if (q.op === 'insert') {
        const id = `fake-${table}-${++insertSeq}`;
        const data = q.wantSingle ? { ...q.payload, id } : [{ ...q.payload, id }];
        return Promise.resolve({ data, error: null });
      }
      if (q.op === 'update') {
        return Promise.resolve({ data: null, error: null });
      }
      let rows = applyFilters(seedRows[table] || []);
      if (q.limitN != null) rows = rows.slice(0, q.limitN);
      if (q.wantSingle || q.wantMaybe) return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null });
    }

    const builder = {
      select() { return builder; },
      insert(payload) {
        q.op = 'insert';
        q.payload = payload;
        calls.inserts.push({ table, row: payload });
        return builder;
      },
      update(patch) {
        q.op = 'update';
        q.payload = patch;
        calls.updates.push({ table, patch });
        return builder;
      },
      eq(col, val) { q.filters.push(['eq', col, val]); return builder; },
      in(col, val) { q.filters.push(['in', col, val]); return builder; },
      contains(col, val) { q.filters.push(['contains', col, val]); return builder; },
      gte() { return builder; },
      order() { return builder; },
      limit(n) { q.limitN = n; return builder; },
      maybeSingle() { q.wantMaybe = true; return exec(); },
      single() { q.wantSingle = true; return exec(); },
      then(res, rej) { return exec().then(res, rej); },
    };
    return builder;
  }

  return { sb: { from }, calls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const WEB_SAAS_THESIS = {
  claims: {
    WHO: { personas: ['consultant', 'indie builder'] },
    CHANNEL: {
      channels: [
        { channel: 'community', channel_type: 'community', persona: 'consultant', cost_hypothesis: '10h to 100 strangers' },
        { channel: 'twitter', channel_type: 'social', persona: 'indie builder' },
        { channel: 'integration', channel_type: 'integration', persona: 'consultant' },
      ],
    },
  },
};

function thesisRow(artifactData = WEB_SAAS_THESIS) {
  return {
    id: 'thesis-row-1',
    venture_id: 'ven-1',
    artifact_type: THESIS_ARTIFACT_TYPE,
    is_current: true,
    artifact_data: artifactData,
    created_at: '2026-07-01T00:00:00Z',
  };
}

function makeExperiment(channel, persona, overrides = {}) {
  return {
    channel,
    hypothesis: `${persona} discovers via ${channel} because that is where they already look for tools`,
    persona_mapping: persona,
    cost_to_signal_bound: '$0 + 8 hours to reach 100 relevant strangers',
    success_criteria: '25 landing visits, 5 waitlist signups in 14 days',
    kill_criteria: '<1% CTR after 200 impressions',
    execution_tier: 'T1',
    message_variants: [
      { variant_id: 'A', headline: 'hA', body: 'bA', cta: 'cA' },
      { variant_id: 'B', headline: 'hB', body: 'bB', cta: 'cB' },
    ],
    utm: { utm_source: channel, utm_medium: 'organic', utm_campaign: 'launch' },
    ...overrides,
  };
}

function llmResponse(experiments, extra = {}) {
  return JSON.stringify({
    experiments,
    email_sequences: [{ sequence_name: 'welcome', emails_count: 3, cadence: 'D0,D3,D7', preview: 'p' }],
    budget_allocation: { total_monthly: '$50', by_channel: { community: '60%', twitter_x: '30%', integration: '10%' } },
    ...extra,
  });
}

function setupMockLLM(response) {
  const mockComplete = typeof response === 'function'
    ? vi.fn().mockImplementation(response)
    : vi.fn().mockResolvedValue(response);
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const insertsOf = (calls, table, type = null) => calls.inserts
  .filter((i) => i.table === table)
  .filter((i) => (type ? i.row.artifact_type === type : true));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe('normalizeChannelName — value-domain normalization (FR-3, CRITICAL-2)', () => {
  it('maps legacy-platform synonyms onto the selectOrganicChannel allowlist', () => {
    expect(normalizeChannelName('twitter')).toBe('twitter_x');
    expect(normalizeChannelName('X')).toBe('twitter_x');
    expect(normalizeChannelName('Build In Public')).toBe('twitter_x');
    expect(normalizeChannelName('content_seo')).toBe('blog_seo');
    expect(normalizeChannelName('newsletter')).toBe('email');
    expect(normalizeChannelName('instagram')).toBe('facebook_instagram');
  });

  it('passes open-taxonomy names through unchanged (never a fixed list)', () => {
    for (const open of ['community', 'integration', 'marketplace', 'partnership', 'referral']) {
      expect(normalizeChannelName(open)).toBe(open);
    }
  });
});

describe('validateThesisChannelClaim — consumption contract (FR-8)', () => {
  it('accepts the design-shaped thesis and extracts channels + personas', () => {
    const r = validateThesisChannelClaim(WEB_SAAS_THESIS);
    expect(r.ok).toBe(true);
    expect(r.channels).toHaveLength(3);
    expect(r.personas).toEqual(['consultant', 'indie builder']);
    expect(r.problems).toEqual([]);
  });

  it('tolerates benign extra fields (additive-producer friendly)', () => {
    const thesis = {
      version: 3,
      extra_top: true,
      claims: {
        ...WEB_SAAS_THESIS.claims,
        WTP: { price_point: '$29/mo' },
        CHANNEL: { ...WEB_SAAS_THESIS.claims.CHANNEL, evidence_grade: 'B' },
      },
    };
    expect(validateThesisChannelClaim(thesis).ok).toBe(true);
  });

  it('accepts array-form claims keyed by claim_type', () => {
    const thesis = {
      claims: [
        { claim_type: 'WHO', personas: [{ name: 'consultant' }] },
        { claim_type: 'CHANNEL', channels: [{ channel: 'community', persona: 'consultant' }] },
      ],
    };
    const r = validateThesisChannelClaim(thesis);
    expect(r.ok).toBe(true);
    expect(r.personas).toEqual(['consultant']);
  });

  it('reports a missing CHANNEL claim', () => {
    const r = validateThesisChannelClaim({ claims: { WHO: { personas: ['consultant'] } } });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/CHANNEL claim is missing/);
  });

  it('reports empty channels[] and missing thesis', () => {
    expect(validateThesisChannelClaim({ claims: { WHO: { personas: ['p'] }, CHANNEL: { channels: [] } } }).ok).toBe(false);
    expect(validateThesisChannelClaim(null).ok).toBe(false);
    expect(validateThesisChannelClaim(undefined).problems.length).toBeGreaterThan(0);
  });
});

describe('deriveChannelsFromThesis — persona×channel JOIN (FR-2 / TS-4)', () => {
  it('joins each channel to a WHO persona and normalizes names', () => {
    const parsed = validateThesisChannelClaim(WEB_SAAS_THESIS);
    const d = deriveChannelsFromThesis(parsed);
    expect(d.channels.map((c) => c.channel)).toEqual(['community', 'twitter_x', 'integration']);
    expect(d.channels[0].persona).toBe('consultant');
    expect(d.channels[1].source_channel).toBe('twitter');
    expect(d.invalid).toEqual([]);
  });

  it('raises COHERENCE_JOIN_GAP for a channel whose persona is not in the WHO claim — that entry only', () => {
    const thesis = {
      claims: {
        WHO: { personas: ['consultant'] },
        CHANNEL: {
          channels: [
            { channel: 'community', persona: 'consultant' },
            { channel: 'app_store', persona: 'builder' }, // not in WHO
          ],
        },
      },
    };
    const d = deriveChannelsFromThesis(validateThesisChannelClaim(thesis));
    expect(d.channels).toHaveLength(1);
    expect(d.invalid).toHaveLength(1);
    expect(d.invalid[0].invalid_reason).toMatch(/COHERENCE_JOIN_GAP/);
    expect(d.invalid[0].invalid_reason).toMatch(/builder/);
  });

  it('invalidates a second channel normalizing to the same legacy name (no duplicate experiments / inflated counts)', () => {
    const thesis = {
      claims: {
        WHO: { personas: ['consultant', 'indie builder'] },
        CHANNEL: {
          channels: [
            { channel: 'twitter', persona: 'consultant' },
            { channel: 'build_in_public', persona: 'indie builder' }, // also → twitter_x
          ],
        },
      },
    };
    const d = deriveChannelsFromThesis(validateThesisChannelClaim(thesis));
    expect(d.channels).toHaveLength(1);
    expect(d.channels[0].channel).toBe('twitter_x');
    expect(d.invalid).toHaveLength(1);
    expect(d.invalid[0].invalid_reason).toMatch(/duplicate_channel/);
    expect(d.invalid[0].invalid_reason).toMatch(/twitter/);
  });

  it('raises COHERENCE_JOIN_GAP for a channel naming no persona at all', () => {
    const thesis = {
      claims: {
        WHO: { personas: ['consultant'] },
        CHANNEL: { channels: [{ channel: 'community' }] },
      },
    };
    const d = deriveChannelsFromThesis(validateThesisChannelClaim(thesis));
    expect(d.channels).toHaveLength(0);
    expect(d.invalid[0].invalid_reason).toMatch(/COHERENCE_JOIN_GAP: channel names no persona/);
  });
});

describe('validateExperiment — fail-partial unit (FR-4)', () => {
  it('passes a fully-formed experiment', () => {
    expect(validateExperiment(makeExperiment('community', 'consultant')).valid).toBe(true);
  });

  it('fails on missing kill_criteria (with the reason named)', () => {
    const r = validateExperiment(makeExperiment('community', 'consultant', { kill_criteria: '' }));
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/kill_criteria/);
  });

  it('fails with fewer than 2 well-formed message variants — never pads (FR-3)', () => {
    const r = validateExperiment(makeExperiment('community', 'consultant', {
      message_variants: [{ variant_id: 'A', headline: 'h', body: 'b', cta: 'c' }],
    }));
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/>=2 well-formed message variants/);
  });

  it('fails on invalid execution_tier and missing utm fields', () => {
    const r = validateExperiment(makeExperiment('community', 'consultant', {
      execution_tier: 'T9',
      utm: { utm_source: 'community' },
    }));
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/execution_tier/);
    expect(r.reasons.join(' ')).toMatch(/utm/);
  });
});

describe('rankExperiments (FR-3)', () => {
  it('orders by generator rank, re-stamps 1-based ranks, and stamps first-touch attribution', () => {
    const ranked = rankExperiments([
      makeExperiment('a', 'p', { rank: 7 }),
      makeExperiment('b', 'p', { rank: 2 }),
      makeExperiment('c', 'p', {}), // unranked → last, stable
    ]);
    expect(ranked.map((e) => e.channel)).toEqual(['b', 'a', 'c']);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(ranked.every((e) => e.attribution === 'first_touch')).toBe(true);
  });
});

describe('assembleExperiments (FR-4)', () => {
  const derived = [
    { channel: 'community', source_channel: 'community', channel_type: 'community', persona: 'consultant', cost_hypothesis: null },
    { channel: 'twitter_x', source_channel: 'twitter', channel_type: 'social', persona: 'indie builder', cost_hypothesis: null },
  ];

  it('invalidates a thesis channel the generator omitted (not_generated)', () => {
    const r = assembleExperiments(derived, { experiments: [makeExperiment('community', 'consultant')] });
    expect(r.valid).toHaveLength(1);
    expect(r.invalid).toHaveLength(1);
    expect(r.invalid[0].invalid_reason).toMatch(/not_generated/);
  });

  it('invalidates generator channels outside the thesis (not_in_thesis) — never silently drops them', () => {
    const r = assembleExperiments(derived, {
      experiments: [
        makeExperiment('community', 'consultant'),
        makeExperiment('twitter', 'indie builder'), // normalizes onto derived twitter_x
        makeExperiment('linkedin', 'consultant'),   // off-thesis
      ],
    });
    expect(r.valid).toHaveLength(2);
    expect(r.invalid.map((i) => i.invalid_reason).join(' ')).toMatch(/not_in_thesis/);
  });

  it('defaults persona_mapping from the derived persona when the generator omits it', () => {
    const exp = makeExperiment('community', 'consultant');
    delete exp.persona_mapping;
    const r = assembleExperiments(derived.slice(0, 1), { experiments: [exp] });
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].persona_mapping).toBe('consultant');
  });
});

describe('splitArtifacts — back-compat consumer contract (FR-3 / TS-9 shape half)', () => {
  const portfolio = {
    experiments: rankExperiments([
      makeExperiment('twitter_x', 'indie builder'),
      makeExperiment('community', 'consultant'),
    ]),
    invalid_experiments: [{ channel: 'app_store', entry: {}, invalid_reason: 'COHERENCE_JOIN_GAP: x' }],
    email_sequences: [{ sequence_name: 'welcome' }],
    budget_allocation: { total_monthly: '$50', by_channel: { community: '100%' } },
    thesis_version: 'thesis-row-1',
  };

  it('keeps channels[].{channel,status,enabled,skip_reason} with status pinned active for valid experiments', () => {
    const { channelConfig } = splitArtifacts(portfolio);
    const active = channelConfig.channels.filter((c) => c.status === 'active');
    expect(active).toHaveLength(2);
    expect(active.every((c) => c.enabled === true && c.skip_reason === null)).toBe(true);
    const skipped = channelConfig.channels.find((c) => c.status === 'skipped');
    expect(skipped.channel).toBe('app_store');
    expect(skipped.skip_reason).toMatch(/COHERENCE_JOIN_GAP/);
  });

  it('active_channels equals the valid-experiment count (stage-23 read)', () => {
    const { channelConfig } = splitArtifacts(portfolio);
    expect(channelConfig.active_channels).toBe(2);
    expect(channelConfig.total_channels).toBe(3);
  });

  it('message variants live ONLY in the ad-copy artifact; config carries variant_count', () => {
    const { channelConfig, adCopy } = splitArtifacts(portfolio);
    expect(channelConfig.experiments.every((e) => !('message_variants' in e))).toBe(true);
    expect(channelConfig.experiments.every((e) => e.variant_count === 2)).toBe(true);
    expect(adCopy.channels_with_copy).toHaveLength(2);
    expect(adCopy.channels_with_copy.every((c) => c.message_variants.length >= 2)).toBe(true);
  });

  it('config carries first-touch attribution + thesis_version + paid-budget advisory', () => {
    const { channelConfig } = splitArtifacts(portfolio);
    expect(channelConfig.attribution).toBe('first_touch');
    expect(channelConfig.thesis_version).toBe('thesis-row-1');
    expect(channelConfig.paid_budget_advisory.flagged).toBe(false);
  });
});

describe('paidBudgetAdvisory (unchanged behavior)', () => {
  it('flags paid spend above 20%', () => {
    expect(paidBudgetAdvisory({ by_channel: { google_ads: '40%', community: '60%' } }).flagged).toBe(true);
    expect(paidBudgetAdvisory({ by_channel: { community: '90%', google_ads: '10%' } }).flagged).toBe(false);
  });
});

describe('normalizeUpstreamParams + REQUIRED_UPSTREAM (optional context, key convention pinned)', () => {
  it('REQUIRED_UPSTREAM keeps whole-stage stage{N}Data keys (invariant test contract)', () => {
    for (const req of REQUIRED_UPSTREAM) {
      expect(req.param_key).toBe(`stage${req.source_stage}Data`);
    }
  });

  it('is pure and tolerates missing __byType', () => {
    const params = { stage7Data: { pricing: true }, ventureId: 'v' };
    const out = normalizeUpstreamParams(params);
    expect(out.stage7Data).toEqual({ pricing: true });
    expect(out).not.toBe(params);
  });
});

// ---------------------------------------------------------------------------
// analyzeStage22Distribution — end-to-end paths (fake supabase + mocked LLM)
// ---------------------------------------------------------------------------
describe('TS-1: web-SaaS thesis without app_store → full portfolio, no skip, no block', () => {
  it('persists the canonical pair with 3 ranked experiments and zero _skip/_blocked', async () => {
    const { sb, calls } = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    setupMockLLM(llmResponse([
      makeExperiment('community', 'consultant', { rank: 1 }),
      makeExperiment('twitter', 'indie builder', { rank: 2 }),
      makeExperiment('integration', 'consultant', { rank: 3 }),
    ]));

    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'MarketLens', supabase: sb, logger: silent });

    expect('_skip' in result).toBe(false);
    expect('_blocked' in result).toBe(false);
    expect(result.active_channels).toBe(3);
    expect(result.experiments.map((e) => e.channel)).toEqual(['community', 'twitter_x', 'integration']);

    const configInsert = insertsOf(calls, 'venture_artifacts', 'distribution_channel_config');
    const copyInsert = insertsOf(calls, 'venture_artifacts', 'distribution_ad_copy');
    expect(configInsert).toHaveLength(1);
    expect(copyInsert).toHaveLength(1);
    expect(configInsert[0].row.lifecycle_stage).toBe(21);
    expect(configInsert[0].row.title.length).toBeGreaterThan(0);
    // No app_store anywhere — the fixed six is gone; open taxonomy is first-class.
    expect(configInsert[0].row.artifact_data.channels.some((c) => c.channel === 'app_store')).toBe(false);
    expect(configInsert[0].row.artifact_data.channels.some((c) => c.channel === 'integration')).toBe(true);
    expect(configInsert[0].row.artifact_data.channels.some((c) => c.channel === 'community')).toBe(true);
    // No block/skip markers, no chairman decisions on the happy path.
    expect(insertsOf(calls, 'venture_artifacts', 'distribution_block_marker')).toHaveLength(0);
    expect(insertsOf(calls, 'chairman_decisions')).toHaveLength(0);
  });

  // SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-2: real production trigger for
  // provisionOrganicChannel(), wired right after the canonical pair is persisted.
  it('provisions the organic distribution channel as a non-blocking side effect once distribution_channel_config exists', async () => {
    const { sb, calls } = makeFakeSupabase({
      venture_artifacts: [
        thesisRow(),
        // Simulates the artifact this same call's persistCanonicalPair writes — the fake
        // supabase's seedRows are static (inserts don't feed back into subsequent
        // selects), so it's seeded directly to exercise provisionOrganicChannel's real
        // read path.
        { venture_id: 'ven-1', artifact_type: 'distribution_channel_config', is_current: true, artifact_data: { channels: [{ channel: 'twitter_x', status: 'active' }] } },
      ],
      distribution_channels: [{ id: 'chan-twitter-x', platform: 'twitter' }],
    });
    setupMockLLM(llmResponse([makeExperiment('twitter', 'indie builder', { rank: 1 })]));

    await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'MarketLens', supabase: sb, logger: silent });

    const vdcInserts = insertsOf(calls, 'venture_distribution_channels');
    expect(vdcInserts).toHaveLength(1);
    expect(vdcInserts[0].row).toMatchObject({ venture_id: 'ven-1', channel_id: 'chan-twitter-x', is_organic: true, budget_usd: 0 });
  });

  it('does not fail the stage when organic-channel provisioning finds no config to read yet', async () => {
    // No pre-seeded distribution_channel_config artifact — provisionOrganicChannel
    // returns {ok:false, reason:'no_distribution_channel_config'} and the stage proceeds
    // unaffected (non-blocking side effect, per implementation_approach).
    const { sb } = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    setupMockLLM(llmResponse([makeExperiment('community', 'consultant', { rank: 1 })]));

    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'MarketLens', supabase: sb, logger: silent });

    expect('_blocked' in result).toBe(false);
  });

  it('dual-emits the legacy runbook while the gate flag is OFF, single-emits when ON', async () => {
    const flagOff = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    setupMockLLM(llmResponse([makeExperiment('community', 'consultant')]));
    await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: flagOff.sb, logger: silent });
    expect(insertsOf(flagOff.calls, 'venture_artifacts', 'launch_deployment_runbook')).toHaveLength(1);

    const flagOn = makeFakeSupabase({
      venture_artifacts: [thesisRow()],
      leo_feature_flags: [{ flag_key: 'LEO_S22_GATES_ENABLED', is_enabled: true }],
    });
    setupMockLLM(llmResponse([makeExperiment('community', 'consultant')]));
    await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: flagOn.sb, logger: silent });
    expect(insertsOf(flagOn.calls, 'venture_artifacts', 'launch_deployment_runbook')).toHaveLength(0);
  });
});

describe('TS-2: fail-partial — one malformed channel invalidates only that experiment', () => {
  it('persists the valid experiments and records the malformed one under invalid_experiments', async () => {
    const { sb, calls } = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    setupMockLLM(llmResponse([
      makeExperiment('community', 'consultant'),
      makeExperiment('twitter', 'indie builder', { kill_criteria: '' }), // malformed
      makeExperiment('integration', 'consultant'),
    ]));

    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });

    expect('_skip' in result).toBe(false);
    expect('_blocked' in result).toBe(false);
    expect(result.active_channels).toBe(2);
    expect(result.invalid_experiments).toHaveLength(1);
    expect(result.invalid_experiments[0].channel).toBe('twitter_x');
    expect(result.invalid_experiments[0].invalid_reason).toMatch(/kill_criteria/);
    expect(insertsOf(calls, 'venture_artifacts', 'distribution_channel_config')).toHaveLength(1);
  });
});

describe('TS-3/FR-5: binding gate — missing thesis blocks with a recorded chairman decision', () => {
  it('records a blocking pending distribution_block decision + block marker; withholds the pair; no _skip', async () => {
    const { sb, calls } = makeFakeSupabase({}); // no thesis rows
    setupMockLLM(llmResponse([]));

    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });

    expect(result._blocked).toBe(true);
    expect('_skip' in result).toBe(false);
    expect(result.block_reason).toBe('demand_thesis_missing');
    expect(result.decision_id).toBeTruthy();

    const decisions = insertsOf(calls, 'chairman_decisions');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].row.decision_type).toBe(BLOCK_DECISION_TYPE);
    expect(decisions[0].row.lifecycle_stage).toBe(21);
    expect(decisions[0].row.blocking).toBe(true);
    expect(decisions[0].row.status).toBe('pending');
    expect(typeof decisions[0].row.summary).toBe('string');

    const marker = insertsOf(calls, 'venture_artifacts', 'distribution_block_marker');
    expect(marker).toHaveLength(1);
    expect(marker[0].row.title).toBe('Distribution blocked');
    expect(marker[0].row.lifecycle_stage).toBe(21);
    expect(marker[0].row.artifact_data.decision_id).toBe(result.decision_id);

    // The canonical pair is WITHHELD — that is what blocks advancement.
    expect(insertsOf(calls, 'venture_artifacts', 'distribution_channel_config')).toHaveLength(0);
    expect(insertsOf(calls, 'venture_artifacts', 'distribution_ad_copy')).toHaveLength(0);
    // The LLM is never consulted without a thesis.
    expect(getLLMClient).not.toHaveBeenCalled();
  });

  it('blocks with demand_thesis_invalid when the thesis has no CHANNEL claim', async () => {
    const { sb, calls } = makeFakeSupabase({
      venture_artifacts: [thesisRow({ claims: { WHO: { personas: ['consultant'] } } })],
    });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('demand_thesis_invalid');
    expect(result.block_detail).toMatch(/CHANNEL claim is missing/);
    expect(insertsOf(calls, 'chairman_decisions')).toHaveLength(1);
  });

  it('blocks with no_joinable_channels when every channel fails the persona JOIN (all COHERENCE_JOIN_GAP)', async () => {
    const { sb } = makeFakeSupabase({
      venture_artifacts: [thesisRow({
        claims: {
          WHO: { personas: ['consultant'] },
          CHANNEL: { channels: [{ channel: 'community', persona: 'nobody' }] },
        },
      })],
    });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('no_joinable_channels');
    expect(result.block_detail).toMatch(/COHERENCE_JOIN_GAP/);
  });

  it('blocks with all_experiments_invalid when generation yields zero valid experiments', async () => {
    const { sb } = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    setupMockLLM(llmResponse([
      makeExperiment('community', 'consultant', { message_variants: [] }),
      makeExperiment('twitter', 'indie builder', { hypothesis: '' }),
      makeExperiment('integration', 'consultant', { execution_tier: 'nope' }),
    ]));
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('all_experiments_invalid');
  });

  it('returns a graceful non-persisting block without supabase (no throw)', async () => {
    const result = await analyzeStage22Distribution({ ventureName: 'V', logger: silent });
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('no_supabase_or_ventureId');
    expect(result.decision_id).toBeNull();
  });
});

describe('TS-6/FR-5b: block-decision dedup', () => {
  it('reuses an existing PENDING distribution_block decision instead of inserting a duplicate', async () => {
    const { sb, calls } = makeFakeSupabase({
      chairman_decisions: [{
        id: 'existing-block-1',
        venture_id: 'ven-1',
        lifecycle_stage: 21,
        decision_type: BLOCK_DECISION_TYPE,
        decision: 'pending',
        status: 'pending',
      }],
    });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result._blocked).toBe(true);
    expect(result.decision_id).toBe('existing-block-1');
    expect(insertsOf(calls, 'chairman_decisions')).toHaveLength(0);
  });
});

describe('TS-5/TS-6/FR-7: the ONLY skip path is an APPROVED chairman decision', () => {
  const approvedSkip = {
    id: 'skip-dec-1',
    venture_id: 'ven-1',
    lifecycle_stage: 21,
    decision_type: SKIP_DECISION_TYPE,
    decision: 'approve',
    status: 'approved',
    summary: 'MarketLens: skip distribution for the probe window',
  };

  it('honors an approved skip via BUILD_DEVIATION_RECORD rows for BOTH canonical types', async () => {
    const { sb, calls } = makeFakeSupabase({ chairman_decisions: [approvedSkip] });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });

    expect(result._blocked).toBe(true);
    expect(result.skipped_by_decision).toBe(true);
    expect(result.decision_id).toBe('skip-dec-1');
    expect('_skip' in result).toBe(false);

    const deviations = insertsOf(calls, 'venture_artifacts', 'build_deviation_record');
    expect(deviations).toHaveLength(2);
    const refs = deviations.map((d) => d.row.artifact_data.artifact_ref).sort();
    expect(refs).toEqual(['distribution_ad_copy', 'distribution_channel_config']);
    expect(deviations.every((d) => d.row.artifact_data.weight === 'declared-descope')).toBe(true);
    expect(deviations.every((d) => d.row.artifact_data.why.includes('skip-dec-1'))).toBe(true);

    const marker = insertsOf(calls, 'venture_artifacts', 'distribution_block_marker');
    expect(marker).toHaveLength(1);
    expect(marker[0].row.artifact_data.skipped_by_decision).toBe(true);
    // No NEW pending decision is created on the skip path.
    expect(insertsOf(calls, 'chairman_decisions')).toHaveLength(0);
  });

  it('is idempotent on re-run: existing chairman deviation records for this decision are reused, not duplicated', async () => {
    const priorDeviation = (id) => ({
      id,
      venture_id: 'ven-1',
      artifact_type: 'build_deviation_record',
      is_current: false,
      created_at: '2026-07-08T00:00:00Z',
      artifact_data: {
        artifact_ref: 'distribution_channel_config',
        why: `Chairman-approved distribution skip (chairman_decisions ${approvedSkip.id}): prior run`,
        decided_by: 'chairman',
        weight: 'declared-descope',
      },
    });
    const { sb, calls } = makeFakeSupabase({
      chairman_decisions: [approvedSkip],
      venture_artifacts: [priorDeviation('dev-prior-1')],
    });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result.skipped_by_decision).toBe(true);
    expect(result.block_reason).toBe('skipped_by_chairman_decision'); // labeled, not anonymous
    // No NEW deviation inserts — prior records reused.
    expect(insertsOf(calls, 'venture_artifacts', 'build_deviation_record')).toHaveLength(0);
    expect(result.deviation_ids).toContain('dev-prior-1');
  });

  it('does NOT honor a PENDING (unapproved) skip decision — the block path fires instead', async () => {
    const { sb, calls } = makeFakeSupabase({
      chairman_decisions: [{ ...approvedSkip, id: 'skip-dec-2', decision: 'pending', status: 'pending' }],
    });
    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });
    expect(result.skipped_by_decision).toBeUndefined();
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('demand_thesis_missing');
    expect(insertsOf(calls, 'venture_artifacts', 'build_deviation_record')).toHaveLength(0);
  });
});

describe('TS-7/TR-4: LLM failure → recorded block, never a fabricated fallback portfolio', () => {
  it('retries once, then blocks with generation_failed and persists NO portfolio', async () => {
    const { sb, calls } = makeFakeSupabase({ venture_artifacts: [thesisRow()] });
    const mockComplete = vi.fn().mockRejectedValue(new Error('provider down'));
    getLLMClient.mockReturnValue({ complete: mockComplete });

    const result = await analyzeStage22Distribution({ ventureId: 'ven-1', ventureName: 'V', supabase: sb, logger: silent });

    expect(mockComplete).toHaveBeenCalledTimes(2); // one retry
    expect(result._blocked).toBe(true);
    expect(result.block_reason).toBe('generation_failed');
    expect(insertsOf(calls, 'venture_artifacts', 'distribution_channel_config')).toHaveLength(0);
    expect(insertsOf(calls, 'venture_artifacts', 'launch_deployment_runbook')).toHaveLength(0);
  });
});

describe('module invariants (FR-1/FR-5 acceptance)', () => {
  const raw = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js'),
    'utf8',
  );
  // Strip block + line comments so doc references to the removed pattern don't false-positive.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('emits zero _skip:true anywhere in the module CODE (the silent-skip path is gone)', () => {
    expect(src).not.toMatch(/_skip\s*:\s*true/);
    expect(src).not.toMatch(/persistSkipMarker/);
  });

  it('contains no fixed channel-universe validator or fallback (fixed six removed)', () => {
    expect(src).not.toMatch(/validateChannelCoverage/);
    expect(src).not.toMatch(/all 6 must appear/);
    expect(src).not.toMatch(/buildFallback/);
    expect(src).not.toMatch(/'app_store',\s*'google_ads'/);
  });
});
