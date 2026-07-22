/**
 * Unit tests for the Chairman Product-Review Gate module.
 * SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-2, FR-3, FR-4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  isFixtureVenture: vi.fn(),
  fetchVentureForFixtureCheck: vi.fn(),
}));

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  escalateChairmanDecision: vi.fn(),
}));

vi.mock('../../../lib/eva/post-build-convergence-gate.js', () => ({
  loadVerdictSummary: vi.fn(),
}));

import {
  buildGuidedTour,
  buildSurfacesInventory,
  resolveAccessInstructions,
  buildReviewDiff,
  buildVerdictTable,
  sanitizeForChairman,
  extractHumanText,
  generateReviewPacket,
  requestProductReview,
  recordProductReviewVerdict,
  PRODUCT_REVIEW_STAGE,
  PRODUCT_REVIEW_DECISION_TYPE,
} from '../../../lib/eva/chairman-product-review.js';
import { createOrReusePendingDecision, isFixtureVenture, fetchVentureForFixtureCheck } from '../../../lib/eva/chairman-decision-watcher.js';
import { escalateChairmanDecision } from '../../../lib/chairman/record-pending-decision.mjs';
import { loadVerdictSummary } from '../../../lib/eva/post-build-convergence-gate.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('constants', () => {
  it('targets stage 23 with a dedicated decision_type', () => {
    expect(PRODUCT_REVIEW_STAGE).toBe(23);
    expect(PRODUCT_REVIEW_DECISION_TYPE).toBe('product_review');
  });
});

// Regression fixtures: shapes observed on the REAL MarketLens venture in the live DB
// (venture_id ecbba50e-3c98-4493-9e77-1719cf6b6f00) via a real CLI run against
// scripts/chairman-product-review-packet.js -- the original buildGuidedTour/
// buildSurfacesInventory (title || content || fallback) leaked raw artifact_type strings and a
// "(Stage 11)" reference straight into chairman-facing text on this exact data.
describe('sanitizeForChairman', () => {
  it('strips a "(Stage N)" reference', () => {
    expect(sanitizeForChairman('Naming Candidates (Stage 11)')).toBe('Naming Candidates');
  });

  it('strips a bare "Stage N" reference without parens', () => {
    expect(sanitizeForChairman('Reviewed at Stage 23')).toBe('Reviewed at');
  });

  it('rejects a bare snake_case identifier (looks like a raw artifact_type)', () => {
    expect(sanitizeForChairman('marketing_landing_hero')).toBeNull();
    expect(sanitizeForChairman('distribution_channel_config')).toBeNull();
  });

  it('rejects a bare kebab-case identifier', () => {
    expect(sanitizeForChairman('some-internal-slug')).toBeNull();
  });

  it('passes through ordinary multi-word prose unchanged', () => {
    expect(sanitizeForChairman('Unlock Market Truths: Precise AI Buyer Personas')).toBe('Unlock Market Truths: Precise AI Buyer Personas');
    expect(sanitizeForChairman('npm run dev')).toBe('npm run dev');
  });

  it('returns null for empty/non-string input', () => {
    expect(sanitizeForChairman('')).toBeNull();
    expect(sanitizeForChairman(null)).toBeNull();
    expect(sanitizeForChairman(undefined)).toBeNull();
    expect(sanitizeForChairman(42)).toBeNull();
  });
});

describe('extractHumanText', () => {
  it('rejects a title that is literally the raw artifact_type placeholder, falls back to JSON content', () => {
    const artifact = { title: 'marketing_landing_hero', content: JSON.stringify({ headline: 'Unlock Market Truths: Precise AI Buyer Personas' }) };
    expect(extractHumanText(artifact)).toBe('Unlock Market Truths: Precise AI Buyer Personas');
  });

  it('strips a stage reference embedded in an otherwise-good title', () => {
    const artifact = { title: 'Naming Candidates (Stage 11)', content: JSON.stringify({ candidates: [{ name: 'MarketLens' }] }) };
    expect(extractHumanText(artifact)).toBe('Naming Candidates');
  });

  it('extracts subject from an email-shaped JSON content when title is the placeholder', () => {
    const artifact = { title: 'marketing_email_welcome', content: JSON.stringify({ subject: 'Welcome to MarketLens, [Name]!' }) };
    expect(extractHumanText(artifact)).toBe('Welcome to MarketLens, [Name]!');
  });

  it('extracts a candidate name when title/headline/subject are all absent', () => {
    const artifact = { title: 'identity_naming_visual', content: JSON.stringify({ candidates: [{ name: 'MarketLens', rationale: '...' }] }) };
    expect(extractHumanText(artifact)).toBe('MarketLens');
  });

  it('falls through to null (never a raw JSON blob) when nothing safe is found', () => {
    const artifact = { title: 'distribution_channel_config', content: JSON.stringify({ channels: [{ channel: 'blog_seo' }] }) };
    const result = extractHumanText(artifact);
    expect(result === null || (!result.includes('{') && !result.includes('"'))).toBe(true);
  });

  it('returns null for a missing artifact', () => {
    expect(extractHumanText(null)).toBeNull();
    expect(extractHumanText(undefined)).toBeNull();
  });
});

describe('buildGuidedTour', () => {
  it('fills in stops from matching artifacts and falls back for the rest', () => {
    const tour = buildGuidedTour({
      marketing_landing_hero: { title: 'Welcome to Acme' },
      identity_brand_name: { content: 'Acme' },
    });
    expect(tour.length).toBeGreaterThanOrEqual(5);
    expect(tour.length).toBeLessThanOrEqual(8);
    const landing = tour.find(s => s.stop.toLowerCase().includes('landing'));
    expect(landing.note).toBe('Welcome to Acme');
    const signup = tour.find(s => s.stop.toLowerCase().includes('sign up'));
    expect(signup.note).toMatch(/not yet documented/i);
  });

  it('never includes opaque IDs or stage numbers in stop labels', () => {
    const tour = buildGuidedTour({});
    for (const stop of tour) {
      expect(stop.stop).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no UUID fragments
      expect(stop.stop).not.toMatch(/stage\s*\d+/i);
    }
  });

  // Real MarketLens venture data (venture_id ecbba50e-3c98-4493-9e77-1719cf6b6f00): title equals
  // the raw artifact_type, content is JSON. The pre-fix version surfaced 'marketing_landing_hero'
  // verbatim as the note text.
  it('never leaks a raw artifact_type or JSON blob when the underlying data is messy (real-shape fixture)', () => {
    const tour = buildGuidedTour({
      marketing_landing_hero: { title: 'marketing_landing_hero', content: JSON.stringify({ headline: 'Unlock Market Truths: Precise AI Buyer Personas' }) },
      identity_brand_name: { title: 'Naming Candidates (Stage 11)', content: JSON.stringify({ candidates: [{ name: 'MarketLens' }] }) },
    });
    const landing = tour.find(s => s.stop.toLowerCase().includes('landing'));
    expect(landing.note).toBe('Unlock Market Truths: Precise AI Buyer Personas');
    const brand = tour.find(s => s.stop.toLowerCase().includes('brand surface'));
    expect(brand.note).toBe('Naming Candidates');
    const allNotes = tour.map(s => s.note).join(' | ');
    expect(allNotes).not.toMatch(/marketing_landing_hero|identity_brand_name/);
    expect(allNotes).not.toMatch(/stage\s*\d+/i);
    expect(allNotes).not.toMatch(/[{}]/); // never a raw JSON blob
  });
});

describe('buildSurfacesInventory', () => {
  it('marks present/absent per artifact_type', () => {
    const inventory = buildSurfacesInventory({
      launch_production_app: { file_url: 'https://acme.example.com' },
    });
    const launch = inventory.find(s => s.surface === 'launch production app');
    expect(launch.present).toBe(true);
    expect(launch.detail).toBe('https://acme.example.com');
    const missing = inventory.find(s => s.surface === 'identity logo image');
    expect(missing.present).toBe(false);
    expect(missing.detail).toBeNull();
  });

  it('never leaks a raw artifact_type placeholder as the detail text (real-shape fixture)', () => {
    const inventory = buildSurfacesInventory({
      distribution_channel_config: { title: 'distribution_channel_config', content: JSON.stringify({ channels: [{ channel: 'blog_seo', status: 'active' }] }) },
    });
    const surface = inventory.find(s => s.surface === 'distribution channel config');
    expect(surface.present).toBe(true);
    expect(surface.detail).not.toBe('distribution_channel_config');
    if (surface.detail) {
      expect(surface.detail).not.toMatch(/[{}]/);
    }
  });
});

describe('resolveAccessInstructions', () => {
  it('prefers a deployed URL when present', () => {
    const result = resolveAccessInstructions({ file_url: 'https://acme.example.com', content: 'npm run dev' });
    expect(result).toEqual({ mode: 'url', instructions: 'https://acme.example.com' });
  });

  it('falls back to local-run instructions when no URL exists', () => {
    const result = resolveAccessInstructions({ content: 'npm run dev' });
    expect(result).toEqual({ mode: 'local_run', instructions: 'npm run dev' });
  });

  it('reports missing access when neither exists', () => {
    const result = resolveAccessInstructions(null);
    expect(result.mode).toBe('local_run');
    expect(result.instructions).toMatch(/no deployed url/i);
  });
});

describe('buildReviewDiff', () => {
  it('reports no changes when there is no prior packet (first-ever review)', () => {
    const current = { access: { instructions: 'x' }, guidedTour: [], surfacesInventory: [] };
    expect(buildReviewDiff(null, current)).toEqual({ hasChanges: false, changes: [] });
  });

  it('reports no changes when nothing differs', () => {
    const packet = {
      access: { instructions: 'https://acme.example.com' },
      guidedTour: [{ stop: 'Landing page', note: 'Looks great' }],
      surfacesInventory: [{ surface: 'launch production app', present: true, detail: 'https://acme.example.com' }],
    };
    expect(buildReviewDiff(packet, packet)).toEqual({ hasChanges: false, changes: [] });
  });

  it('detects an access-instructions change', () => {
    const prev = { access: { instructions: 'npm run dev' }, guidedTour: [], surfacesInventory: [] };
    const curr = { access: { instructions: 'https://acme.example.com' }, guidedTour: [], surfacesInventory: [] };
    const diff = buildReviewDiff(prev, curr);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changes).toContainEqual({ about: 'How to see it', before: 'npm run dev', after: 'https://acme.example.com' });
  });

  it('detects a guided-tour stop note change', () => {
    const prev = { guidedTour: [{ stop: 'Landing page — first impression', note: 'Not yet documented' }], surfacesInventory: [] };
    const curr = { guidedTour: [{ stop: 'Landing page — first impression', note: 'Now live with new hero copy' }], surfacesInventory: [] };
    const diff = buildReviewDiff(prev, curr);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changes[0]).toEqual({ about: 'Landing page — first impression', before: 'Not yet documented', after: 'Now live with new hero copy' });
  });

  it('detects a surface going from absent to present', () => {
    const prev = { guidedTour: [], surfacesInventory: [{ surface: 'identity logo image', present: false, detail: null }] };
    const curr = { guidedTour: [], surfacesInventory: [{ surface: 'identity logo image', present: true, detail: 'https://cdn.example.com/logo.png' }] };
    const diff = buildReviewDiff(prev, curr);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changes[0]).toEqual({ about: 'identity logo image', before: 'not yet there', after: 'https://cdn.example.com/logo.png' });
  });

  it('never includes opaque IDs in diff text', () => {
    const prev = { guidedTour: [{ stop: 'Sign up', note: 'blocked' }], surfacesInventory: [] };
    const curr = { guidedTour: [{ stop: 'Sign up', note: 'working, tested with a real account' }], surfacesInventory: [] };
    const diff = buildReviewDiff(prev, curr);
    expect(JSON.stringify(diff)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  // SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D: adherence-score deltas surface in the same
  // taste-language as the rest of the diff (design-agent guidance).
  it('detects an adherence-score change across re-reviews', () => {
    const prev = { guidedTour: [], surfacesInventory: [], adherenceScore: 40 };
    const curr = { guidedTour: [], surfacesInventory: [], adherenceScore: 88 };
    const diff = buildReviewDiff(prev, curr);
    expect(diff.hasChanges).toBe(true);
    expect(diff.changes).toContainEqual({ about: 'Built-vs-planned adherence score', before: '40', after: '88' });
  });

  it('does not report a spurious adherence-score change when neither packet has a score yet', () => {
    const prev = { guidedTour: [], surfacesInventory: [] };
    const curr = { guidedTour: [], surfacesInventory: [] };
    expect(buildReviewDiff(prev, curr)).toEqual({ hasChanges: false, changes: [] });
  });
});

describe('generateReviewPacket', () => {
  const logger = createMockLogger();

  it('skips fixture ventures without querying artifacts', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', is_demo: true });
    isFixtureVenture.mockReturnValue(true);
    const supabase = { from: vi.fn() };

    const result = await generateReviewPacket(supabase, 'v1', logger);

    expect(result).toEqual({ skipped: true, reason: 'fixture_venture' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('assembles a packet with zero opaque IDs for a real venture', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            { artifact_type: 'launch_production_app', file_url: 'https://marketlens.example.com' },
            { artifact_type: 'marketing_landing_hero', title: 'See your market clearly' },
          ],
        }),
      }),
    };

    const result = await generateReviewPacket(supabase, 'v1', logger);

    expect(result.skipped).toBe(false);
    expect(result.ventureName).toBe('MarketLens');
    expect(result.access).toEqual({ mode: 'url', instructions: 'https://marketlens.example.com' });
    expect(result.guidedTour.length).toBeGreaterThan(0);
    expect(result.surfacesInventory.length).toBeGreaterThan(0);
    const packetText = JSON.stringify(result);
    expect(packetText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  // SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-D: verdictTable/adherenceScore ride BESIDE the
  // guidedTour as a distinct secondary section (design-agent CONDITIONAL_PASS guidance) —
  // never replacing it, never appearing when no verdict has been persisted.
  it('surfaces no verdictTable/adherenceScore when no verdict has been persisted for this venture', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    loadVerdictSummary.mockResolvedValue(null);
    const supabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) }),
    };

    const result = await generateReviewPacket(supabase, 'v1', logger);

    expect(result).not.toHaveProperty('verdictTable');
    expect(result).not.toHaveProperty('adherenceScore');
    expect(result).not.toHaveProperty('belowThreshold');
    expect(result.guidedTour.length).toBeGreaterThan(0); // primary section unaffected
  });

  it('surfaces verdictTable + adherenceScore as a secondary section when a verdict is persisted (PASS, not below threshold)', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    loadVerdictSummary.mockResolvedValue({
      status: 'PASS', adherence_score: 91, escalated: false,
      dimension_scores: { ui_evidence: 95, user_story_coverage: 88 }, unscored_dimensions: [], dimension_floor: 60,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) }),
    };

    const result = await generateReviewPacket(supabase, 'v1', logger);

    expect(result.adherenceScore).toBe(91);
    expect(result.belowThreshold).toBeUndefined();
    expect(result.verdictTable).toEqual([
      { dimension: 'ui evidence', status: 'pass', score: 95 },
      { dimension: 'user story coverage', status: 'pass', score: 88 },
    ]);
    expect(result.guidedTour.length).toBeGreaterThan(0); // primary section still present, unaffected
  });

  it('flags belowThreshold:true when the persisted verdict is ESCALATED (the retrodiction negative case)', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens (pre-recovery)' });
    isFixtureVenture.mockReturnValue(false);
    loadVerdictSummary.mockResolvedValue({
      status: 'ESCALATED', adherence_score: 4, escalated: true,
      dimension_scores: { user_story_coverage: 0, persona_coverage: null }, unscored_dimensions: ['persona_coverage'], dimension_floor: 60,
    });
    const supabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) }),
    };

    const result = await generateReviewPacket(supabase, 'v1', logger);

    expect(result.adherenceScore).toBe(4);
    expect(result.belowThreshold).toBe(true);
    expect(result.verdictTable).toContainEqual({ dimension: 'user story coverage', status: 'fail', score: 0 });
    expect(result.verdictTable).toContainEqual({ dimension: 'persona coverage', status: 'unscored', score: null });
  });
});

describe('buildVerdictTable', () => {
  it('returns null when no verdict exists', () => {
    expect(buildVerdictTable(null)).toBeNull();
  });

  it('maps dimension keys to plain-language names and pass/fail/unscored status', () => {
    const table = buildVerdictTable({
      dimension_scores: { ui_evidence: 80, user_story_coverage: 40 },
      unscored_dimensions: [],
      dimension_floor: 60,
    });
    expect(table).toEqual([
      { dimension: 'ui evidence', status: 'pass', score: 80 },
      { dimension: 'user story coverage', status: 'fail', score: 40 },
    ]);
  });

  it('marks a dimension unscored regardless of its numeric score value', () => {
    const table = buildVerdictTable({
      dimension_scores: { persona_coverage: null },
      unscored_dimensions: ['persona_coverage'],
      dimension_floor: 60,
    });
    expect(table).toEqual([{ dimension: 'persona coverage', status: 'unscored', score: null }]);
  });

  it('never fails/passes a dimension when no dimension_floor was persisted (defensive: unknown rubric)', () => {
    const table = buildVerdictTable({
      dimension_scores: { ui_evidence: 80 },
      unscored_dimensions: [],
      dimension_floor: null,
    });
    expect(table).toEqual([{ dimension: 'ui evidence', status: 'pass', score: 80 }]);
  });

  // Known limitation (flagged by testing-agent, EXEC phase): with no dimension_floor persisted,
  // a LOW score cannot be distinguished from a passing one and defaults to 'pass' rather than
  // 'unknown' -- documented here explicitly rather than left as an untested edge case. In
  // practice dimension_floor is always persisted (runS19ConvergenceGate always reads it off
  // scoreResult.rubric), so this only bites a hand-corrupted/legacy summary row.
  it('a LOW score with no dimension_floor also defaults to pass (documented limitation, not a silent gap)', () => {
    const table = buildVerdictTable({
      dimension_scores: { user_story_coverage: 2 },
      unscored_dimensions: [],
      dimension_floor: null,
    });
    expect(table).toEqual([{ dimension: 'user story coverage', status: 'pass', score: 2 }]);
  });
});

/**
 * Table-aware supabase mock: venture_artifacts chain ends in .in() (per generateReviewPacket),
 * chairman_decisions chain ends in .maybeSingle() (per requestProductReview's prior-attempt lookup).
 */
function makeRequestReviewSupabase({ artifacts = [], priorAttempt = null } = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'venture_artifacts') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: artifacts }) };
      }
      if (table === 'chairman_decisions') {
        return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: priorAttempt }),
        };
      }
      // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-2): requestProductReview now calls the REAL
      // getStageGovernance(supabase) to derive blocking via isHighConsequence(PRODUCT_REVIEW_STAGE).
      // Empty rows -> every stage (incl. 23) defaults to non-high-consequence, matching today's
      // pre-existing behavior for every test in this file that doesn't care about the new flag.
      if (table === 'venture_stages') {
        return { select: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }
      // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: _readFresh now ALSO reads leo_feature_flags
      // (HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED) on every refresh. Irrelevant here (empty
      // venture_stages rows above already default every stage to non-high-consequence).
      if (table === 'leo_feature_flags') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { is_enabled: true }, error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    channel: vi.fn(() => { throw new Error('channel not available in this mock'); }),
  };
}

describe('requestProductReview', () => {
  const logger = createMockLogger();

  it('propagates a fixture-venture skip without minting or escalating a decision', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', is_demo: true });
    isFixtureVenture.mockReturnValue(true);
    const supabase = { from: vi.fn() };

    const result = await requestProductReview(supabase, 'v1', logger);

    expect(result).toEqual({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });
    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
    expect(escalateChairmanDecision).not.toHaveBeenCalled();
  });

  it('mints a FIRST-time product_review decision (no attemptNumber, no diff) and escalates once', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    const supabase = makeRequestReviewSupabase({ priorAttempt: null });
    createOrReusePendingDecision.mockResolvedValue({ id: 'decision-1', isNew: true });
    escalateChairmanDecision.mockResolvedValue({ escalated: true });

    const result = await requestProductReview(supabase, 'v1', logger);

    expect(createOrReusePendingDecision).toHaveBeenCalledWith(expect.objectContaining({
      ventureId: 'v1',
      stageNumber: PRODUCT_REVIEW_STAGE,
      decisionType: PRODUCT_REVIEW_DECISION_TYPE,
      attemptNumber: null,
      supabase,
    }));
    const briefData = createOrReusePendingDecision.mock.calls[0][0].briefData;
    expect(briefData.diffSinceLastReview).toBeUndefined();
    expect(escalateChairmanDecision).toHaveBeenCalledWith(supabase, 'decision-1');
    expect(result).toEqual({ id: 'decision-1', isNew: true, escalated: true });
  });

  it('does not escalate when decision minting itself was skipped (non-fixture skip path)', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    const supabase = makeRequestReviewSupabase();
    createOrReusePendingDecision.mockResolvedValue({ id: null, isNew: false, skipped: true });

    const result = await requestProductReview(supabase, 'v1', logger);

    expect(result).toEqual({ id: null, isNew: false, skipped: true });
    expect(escalateChairmanDecision).not.toHaveBeenCalled();
  });

  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-3): re-review after a send-back must mint the
  // NEXT attempt_number explicitly -- otherwise it would 23505-collide with the prior (rejected)
  // row now that decision_type is part of the uniqueness key -- and attach a diff.
  it('on RE-review (a prior resolved attempt exists), mints the next attempt_number and attaches a diff', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    const priorPacket = { access: { mode: 'local_run', instructions: 'no deployed url' }, guidedTour: [], surfacesInventory: [] };
    const supabase = makeRequestReviewSupabase({
      artifacts: [{ artifact_type: 'launch_production_app', file_url: 'https://marketlens.example.com' }],
      priorAttempt: { attempt_number: 1, brief_data: priorPacket },
    });
    createOrReusePendingDecision.mockResolvedValue({ id: 'decision-2', isNew: true });
    escalateChairmanDecision.mockResolvedValue({ escalated: true });

    await requestProductReview(supabase, 'v1', logger);

    expect(createOrReusePendingDecision).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 2 }));
    const briefData = createOrReusePendingDecision.mock.calls[0][0].briefData;
    expect(briefData.diffSinceLastReview.hasChanges).toBe(true);
    expect(briefData.diffSinceLastReview.changes).toContainEqual(expect.objectContaining({ about: 'How to see it' }));
  });

  it('increments from the highest prior attempt_number, not always to 2', async () => {
    fetchVentureForFixtureCheck.mockResolvedValue({ id: 'v1', name: 'MarketLens' });
    isFixtureVenture.mockReturnValue(false);
    const supabase = makeRequestReviewSupabase({ priorAttempt: { attempt_number: 4, brief_data: null } });
    createOrReusePendingDecision.mockResolvedValue({ id: 'decision-5', isNew: true });
    escalateChairmanDecision.mockResolvedValue({ escalated: true });

    await requestProductReview(supabase, 'v1', logger);

    expect(createOrReusePendingDecision).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 5 }));
  });
});

describe('recordProductReviewVerdict', () => {
  const logger = createMockLogger();

  it('records an approve verdict with no work items', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq: updateEq }) }),
    };

    const result = await recordProductReviewVerdict(supabase, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'approve',
    }, logger);

    expect(updateEq).toHaveBeenCalledWith('id', 'd1');
    expect(supabase.from().update).toHaveBeenCalledWith({ status: 'approved', decision: 'approve' });
    expect(result).toEqual({ recorded: true, workItemIds: [] });
  });

  it('records approve_with_notes as an approved conditional_pass', async () => {
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = { from: vi.fn().mockReturnValue({ update: updateFn }) };

    await recordProductReviewVerdict(supabase, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'approve_with_notes',
    }, logger);

    expect(updateFn).toHaveBeenCalledWith({ status: 'approved', decision: 'conditional_pass' });
  });

  // feedback_sd_map.sd_id FKs to strategic_directives_v2(id) -- NOT sd_key. Verified live: this
  // SD's own `id` column value is a UUID string, distinct from its human-readable sd_key.
  const RESOLVED_SD_UUID = '9a1e83b0-9587-4e1e-b589-546e9ffb3701';

  it('on send_back, creates one valid feedback row + feedback_sd_map link per note', async () => {
    const feedbackInsertedRows = [];
    const mapInsertedRows = [];
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'chairman_decisions') {
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === 'strategic_directives_v2') {
          // resolveSdInputOrNull's query shape: .select('*').or(...).single()
          return { select: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: RESOLVED_SD_UUID, sd_key: 'SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001' }, error: null }) };
        }
        if (table === 'feedback') {
          return {
            insert: vi.fn().mockImplementation((row) => {
              feedbackInsertedRows.push(row);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: `fb-${feedbackInsertedRows.length}` }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'feedback_sd_map') {
          return {
            insert: vi.fn().mockImplementation((row) => {
              mapInsertedRows.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await recordProductReviewVerdict(supabase, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'send_back', notes: ['Fix the pricing page copy', 'Logo is blurry on mobile'],
    }, logger);

    expect(result.recorded).toBe(true);
    expect(result.workItemIds).toEqual(['fb-1', 'fb-2']);
    expect(feedbackInsertedRows).toHaveLength(2);
    for (const row of feedbackInsertedRows) {
      expect(row.type).toBe('issue');
      expect(row.feedback_type).toBe('user_other'); // feedback_type_check enum; omitting would default to 'sentry_error'
      expect(row.status).toBe('new'); // feedback_status_check: 'open' is NOT a valid value
      expect(row.source_type).toBe('user_feedback'); // feedback_source_type_check enum
      expect(row.source_application).toBeTruthy(); // NOT NULL column
      expect(row.venture_id).toBe('v1');
    }
    // Not vacuous: fails loudly (0 !== 2) if the strategic_directives_v2 mock above ever breaks,
    // rather than silently skipping the loop below the way the pre-fix version did.
    expect(mapInsertedRows).toHaveLength(2);
    for (const row of mapInsertedRows) {
      expect(row.relationship_type).toBe('related'); // feedback_sd_map_relationship_type_check enum
      expect(row.sd_id).toBe(RESOLVED_SD_UUID); // the resolved `id`, never the literal sd_key (would 23503)
    }
  });

  it('still creates feedback rows (but skips the map link) when SD-id resolution fails', async () => {
    const feedbackInsertedRows = [];
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'chairman_decisions') {
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === 'strategic_directives_v2') {
          return { select: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } }) };
        }
        if (table === 'feedback') {
          return {
            insert: vi.fn().mockImplementation((row) => {
              feedbackInsertedRows.push(row);
              return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'fb-1' }, error: null }) }) };
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await recordProductReviewVerdict(supabase, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'send_back', notes: ['A note'],
    }, logger);

    expect(result.workItemIds).toEqual(['fb-1']); // feedback row still created — the primary side effect
    expect(feedbackInsertedRows).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalled(); // resolution-failure warning, non-fatal
  });

  it('continues past a single feedback-insert failure without throwing', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'chairman_decisions') {
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === 'strategic_directives_v2') {
          return { select: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: RESOLVED_SD_UUID, sd_key: 'SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001' }, error: null }) };
        }
        if (table === 'feedback') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await recordProductReviewVerdict(supabase, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'send_back', notes: ['note one'],
    }, logger);

    expect(result.workItemIds).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws on an unknown verdict', async () => {
    await expect(recordProductReviewVerdict({}, {
      decisionId: 'd1', ventureId: 'v1', verdict: 'maybe_later',
    }, logger)).rejects.toThrow('Unknown product-review verdict');
  });
});
