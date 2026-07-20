/**
 * Tests for lib/eva/build-sd-review-gate.js — the second-party review of EVA
 * Stage-19 build payloads (POST-payload / PRE-INSERT, advisory-first, fail-open).
 *
 * SD-LEO-INFRA-BUILD-SD-REVIEW-GATE-001
 * Covers the three regression smoke scenarios (TS-1..TS-3), the pre-claim hold
 * (TS-4), gaps/dupes (TS-5), plus per-dimension unit behavior and fail-open.
 */
import { describe, it, expect } from 'vitest';
import {
  reviewBuildPayloads,
  reviewVisionAlignment,
  reviewStandardsCompleteness,
  reviewTierCoherence,
  reviewGapsDupes,
  resolveReviewMode,
  extractVisionTerms,
} from '../../lib/eva/build-sd-review-gate.js';
import { sprintItemLayerRank } from '../../lib/eva/lifecycle-sd-bridge.js';

// ── Test doubles ────────────────────────────────────────────────────────────
const silentLogger = { warn() {}, log() {}, error() {} };

/**
 * Supabase double for the paginated belt scan (FR-6 batch 7): production chains
 * .select().neq().order() then fetchAllPaginated appends .range() and awaits the
 * page. A short page (< pageSize) ends the loop; a page {error} makes
 * fetchAllPaginated throw with the original error text embedded, which the gate
 * re-wraps — /boom/-style assertions still match. `hang` makes .range() never
 * resolve, exercising the timeout path.
 */
function mockSupabase({ rows = [], error = null, hang = false } = {}) {
  const builder = {
    select() { return builder; },
    neq() { return builder; },
    order() { return builder; },
    range() {
      if (hang) return new Promise(() => {}); // never resolves -> exercises timeout
      return Promise.resolve({ data: error ? null : rows, error });
    },
  };
  return { from() { return builder; } };
}

const VISION = { extracted_dimensions: ['developer productivity', 'code review automation'] };

function alignedPayloads() {
  return [
    { title: 'Code review automation API', scope: 'backend', description: 'automate review' },
    { title: 'Developer productivity dashboard', scope: 'frontend', description: 'productivity metrics' },
  ];
}

// ── resolveReviewMode ───────────────────────────────────────────────────────
describe('resolveReviewMode', () => {
  it('defaults to advisory with no env/config', () => {
    expect(resolveReviewMode({ env: {}, config: null })).toBe('advisory');
  });
  it('honors BUILD_SD_REVIEW_MODE=enforcing', () => {
    expect(resolveReviewMode({ env: { BUILD_SD_REVIEW_MODE: 'enforcing' } })).toBe('enforcing');
  });
  it('falls back to config when env unset', () => {
    expect(resolveReviewMode({ env: {}, config: { build_sd_review_mode: 'enforcing' } })).toBe('enforcing');
  });
  it('treats any non-enforcing value as advisory', () => {
    expect(resolveReviewMode({ env: { BUILD_SD_REVIEW_MODE: 'banana' } })).toBe('advisory');
  });
});

// ── extractVisionTerms ──────────────────────────────────────────────────────
describe('extractVisionTerms', () => {
  it('pulls significant tokens from extracted_dimensions (array of strings)', () => {
    const terms = extractVisionTerms(VISION);
    expect(terms).toContain('developer');
    expect(terms).toContain('automation');
    expect(terms).not.toContain('the'); // stopword filtered
  });
  it('returns [] when no curated dimensions exist (fail-safe input)', () => {
    expect(extractVisionTerms(null)).toEqual([]);
    expect(extractVisionTerms({})).toEqual([]);
  });
  it('handles dimensions given as objects with a name field', () => {
    const terms = extractVisionTerms({ extracted_dimensions: [{ name: 'Observability tooling' }] });
    expect(terms).toContain('observability');
  });
});

// ── Dimension (a): vision-alignment ─────────────────────────────────────────
describe('reviewVisionAlignment', () => {
  it('flags a payload with no overlap with the vision themes', () => {
    const r = reviewVisionAlignment(
      [{ title: 'Pet grooming scheduler', scope: 'backend', description: 'book appointments' }],
      VISION,
    );
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].dimension).toBe('vision_alignment');
  });
  it('passes aligned payloads with zero flags', () => {
    const r = reviewVisionAlignment(alignedPayloads(), VISION);
    expect(r.flags).toHaveLength(0);
  });
  it('fail-safe no-op pass when no vision themes are available', () => {
    const r = reviewVisionAlignment([{ title: 'anything' }], null);
    expect(r.skipped).toBe(true);
    expect(r.flags).toHaveLength(0);
  });
});

// ── Dimension (b): standards-completeness ───────────────────────────────────
describe('reviewStandardsCompleteness', () => {
  const caps = [
    { name: 'auth', keywords: ['auth', 'authentication', 'login'] },
    { name: 'monitoring', keywords: ['monitor', 'observability', 'sentry'] },
  ];
  it('flags a mandatory capability not covered by any payload', () => {
    const r = reviewStandardsCompleteness(
      [{ title: 'Login and authentication service', scope: 'backend' }],
      caps,
    );
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].capability).toBe('monitoring');
  });
  it('passes when the build set collectively covers all capabilities', () => {
    const r = reviewStandardsCompleteness(
      [
        { title: 'Authentication service', scope: 'backend' },
        { title: 'Sentry observability wiring', scope: 'integration' },
      ],
      caps,
    );
    expect(r.flags).toHaveLength(0);
  });
  it('fail-safe no-op pass when no mandatory-capability list is configured', () => {
    const r = reviewStandardsCompleteness([{ title: 'x' }], null);
    expect(r.skipped).toBe(true);
    expect(r.flags).toHaveLength(0);
  });
  it('supports bare-string capabilities', () => {
    const r = reviewStandardsCompleteness([{ title: 'no match here' }], ['telemetry']);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].capability).toBe('telemetry');
  });
});

// ── Dimension (c): tier-coherence (reuses the bridge classifier) ────────────
describe('reviewTierCoherence', () => {
  it('flags a payload with no layer-bearing field', () => {
    const r = reviewTierCoherence([{ title: 'Untyped item' }], sprintItemLayerRank);
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].reason).toMatch(/single worker tier/);
  });
  it('flags a payload whose layer fields conflict across tiers', () => {
    const r = reviewTierCoherence(
      [{ title: 'Conflicted', architecture_layer: 'backend', scope: 'frontend' }],
      sprintItemLayerRank,
    );
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].reason).toMatch(/multiple tiers/);
  });
  it('passes a coherently-tiered payload', () => {
    const r = reviewTierCoherence([{ title: 'Backend only', scope: 'backend' }], sprintItemLayerRank);
    expect(r.flags).toHaveLength(0);
  });
  it('fail-safe no-op pass when no classifier is injected', () => {
    const r = reviewTierCoherence([{ title: 'x' }], null);
    expect(r.skipped).toBe(true);
    expect(r.flags).toHaveLength(0);
  });
});

// ── Dimension (d): gaps/dupes ───────────────────────────────────────────────
describe('reviewGapsDupes', () => {
  it('flags a payload duplicating an existing SD title', async () => {
    const supabase = mockSupabase({ rows: [{ sd_key: 'SD-OLD-1', title: 'Existing Thing', status: 'draft' }] });
    const r = await reviewGapsDupes([{ title: 'Existing Thing' }, { title: 'Brand New' }], { supabase, logger: silentLogger });
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0].existing_sd).toBe('SD-OLD-1');
  });
  it('throws on DB error so the caller can fail open', async () => {
    const supabase = mockSupabase({ error: { message: 'boom' } });
    await expect(reviewGapsDupes([{ title: 'x' }], { supabase, logger: silentLogger })).rejects.toThrow(/boom/);
  });
  it('fail-safe no-op pass with no supabase client', async () => {
    const r = await reviewGapsDupes([{ title: 'x' }], { logger: silentLogger });
    expect(r.skipped).toBe(true);
    expect(r.flags).toHaveLength(0);
  });
});

// ── reviewBuildPayloads — end-to-end verdict + hold + fail-open ──────────────
describe('reviewBuildPayloads', () => {
  const baseDeps = (overrides = {}) => ({
    supabase: mockSupabase({ rows: [] }),
    logger: silentLogger,
    layerRank: sprintItemLayerRank,
    env: {},
    ...overrides,
  });

  it('TS-3: a clean payload passes with zero flags and no hold', async () => {
    const r = await reviewBuildPayloads(
      { payloads: alignedPayloads(), canonicalVision: VISION, mode: 'enforcing' },
      baseDeps(),
    );
    expect(r.verdict).toBe('pass');
    expect(r.flags).toHaveLength(0);
    expect(r.hold).toBe(false);
  });

  it('TS-1: advisory + missing mandatory capability => flagged but NOT held', async () => {
    const r = await reviewBuildPayloads(
      {
        payloads: alignedPayloads(),
        canonicalVision: VISION,
        mandatoryCapabilities: [{ name: 'monitoring', keywords: ['observability', 'sentry'] }],
        mode: 'advisory',
      },
      baseDeps(),
    );
    expect(r.verdict).toBe('flagged');
    expect(r.flags.some((f) => f.dimension === 'standards_completeness')).toBe(true);
    expect(r.hold).toBe(false); // advisory never holds
  });

  it('TS-4: enforcing + flagged => hold=true (pre-claim hold)', async () => {
    const r = await reviewBuildPayloads(
      {
        payloads: alignedPayloads(),
        canonicalVision: VISION,
        mandatoryCapabilities: [{ name: 'monitoring', keywords: ['observability', 'sentry'] }],
        mode: 'enforcing',
      },
      baseDeps(),
    );
    expect(r.verdict).toBe('flagged');
    expect(r.hold).toBe(true);
  });

  it('TS-5: enforcing + duplicate title => flagged under gaps_dupes', async () => {
    const supabase = mockSupabase({ rows: [{ sd_key: 'SD-DUP-9', title: 'Code review automation API', status: 'draft' }] });
    const r = await reviewBuildPayloads(
      { payloads: alignedPayloads(), canonicalVision: VISION, mode: 'enforcing' },
      baseDeps({ supabase }),
    );
    expect(r.flags.some((f) => f.dimension === 'gaps_dupes')).toBe(true);
  });

  it('TS-2: reviewer error => proceed_failopen with NO hold (no wedge)', async () => {
    const supabase = mockSupabase({ error: { message: 'db down' } });
    const r = await reviewBuildPayloads(
      { payloads: alignedPayloads(), canonicalVision: VISION, mode: 'enforcing' },
      baseDeps({ supabase }),
    );
    expect(r.verdict).toBe('proceed_failopen');
    expect(r.failOpen).toBe(true);
    expect(r.hold).toBe(false);
  });

  it('TS-2 (timeout): a hung reviewer times out and proceeds without a hold', async () => {
    const supabase = mockSupabase({ hang: true });
    const r = await reviewBuildPayloads(
      { payloads: alignedPayloads(), canonicalVision: VISION, mode: 'enforcing', timeoutMs: 50 },
      baseDeps({ supabase }),
    );
    expect(r.verdict).toBe('proceed_failopen');
    expect(r.hold).toBe(false);
  });

  it('records per-dimension results in the verdict', async () => {
    const r = await reviewBuildPayloads(
      { payloads: alignedPayloads(), canonicalVision: VISION },
      baseDeps(),
    );
    expect(Object.keys(r.dimensions)).toEqual(
      expect.arrayContaining(['vision_alignment', 'standards_completeness', 'tier_coherence', 'gaps_dupes']),
    );
    expect(r.dimensions.tier_coherence.owner).toBe('coordinator');
    expect(r.dimensions.vision_alignment.owner).toBe('panel');
  });
});
