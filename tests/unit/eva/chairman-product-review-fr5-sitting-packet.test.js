/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-5: sitting-packet completeness.
 * - buildGuidedTour: screenId-bound stops (signup, core_action) resolve via a
 *   reconciliation row, never left as a permanent placeholder.
 * - buildCapabilityScorecard: FR-3's 7 capability rows summarized for the packet.
 * - generateReviewPacket: reconciliationTable + registryScorecard sections present.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  isFixtureVenture: vi.fn(() => false),
  fetchVentureForFixtureCheck: vi.fn(async () => ({ id: 'v1', name: 'AltifyAI' })),
}));
vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({ escalateChairmanDecision: vi.fn() }));
vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({ resolveSdInputOrNull: vi.fn() }));
vi.mock('../../../lib/eva/post-build-convergence-gate.js', () => ({ loadVerdictSummary: vi.fn(async () => null) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({ getStageGovernance: vi.fn() }));
vi.mock('../../../lib/discovery/competitive-baseline-service.js', () => ({
  CompetitiveBaselineService: vi.fn().mockImplementation(() => ({ getFreshOrNull: vi.fn().mockResolvedValue(null) })),
}));

import {
  buildGuidedTour,
  describeReconciliationRow,
  buildCapabilityScorecard,
  generateReviewPacket,
} from '../../../lib/eva/chairman-product-review.js';
import { readScreenReconciliation } from '../../../lib/eva/stage-templates/screen-reconciliation-builder.js';
import { precheckCapabilities } from '../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';
import { readCapabilityOverrides } from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

vi.mock('../../../lib/eva/stage-templates/screen-reconciliation-builder.js', () => ({
  readScreenReconciliation: vi.fn(),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, precheckCapabilities: vi.fn() };
});
vi.mock('../../../lib/eva/utils/validate-venture-default-capabilities.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readCapabilityOverrides: vi.fn() };
});

const fakeArtifactsSupabase = {
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [] }) }) }) }) }),
};

describe('describeReconciliationRow', () => {
  it('returns null for a missing row', () => {
    expect(describeReconciliationRow(undefined)).toBeNull();
  });

  it('describes a built_and_walked row without leaking the screen_id', () => {
    const note = describeReconciliationRow({ screen_id: 'screen-5', journey_ids: ['a', 'b'], reconciliation_status: 'built_and_walked' });
    expect(note).toMatch(/Built and verified/);
    expect(note).toMatch(/2 user journey steps/);
    expect(note).not.toContain('screen-5');
  });

  it('describes a built_not_walked row', () => {
    const note = describeReconciliationRow({ journey_ids: ['a'], reconciliation_status: 'built_not_walked' });
    expect(note).toMatch(/not yet confirmed/);
    expect(note).toMatch(/1 user journey step[^s]/);
  });

  it('returns null for an unreachable/not_built row (no positive claim to make)', () => {
    expect(describeReconciliationRow({ journey_ids: [], reconciliation_status: 'unreachable' })).toBeNull();
    expect(describeReconciliationRow({ journey_ids: [], reconciliation_status: 'not_built' })).toBeNull();
  });
});

describe('buildGuidedTour -- FR-5 screenId fallback', () => {
  it('signup and core_action resolve via reconciliationByScreen when no artifact backs them', () => {
    const tour = buildGuidedTour({}, {
      'screen-1': { journey_ids: ['jny-a'], reconciliation_status: 'built_and_walked' },
      'screen-5': { journey_ids: ['jny-b', 'jny-c'], reconciliation_status: 'built_not_walked' },
    });
    const signup = tour.find((t) => t.stop === 'Sign up');
    const coreAction = tour.find((t) => t.stop === 'The core thing this product does');
    expect(signup.note).toMatch(/Built and verified/);
    expect(coreAction.note).toMatch(/Built —/);
    expect(coreAction.note).not.toMatch(/Not yet documented/);
  });

  it('falls back to the placeholder note when no reconciliation row exists for a screenId stop', () => {
    const tour = buildGuidedTour({}, {});
    const signup = tour.find((t) => t.stop === 'Sign up');
    expect(signup.note).toMatch(/Not yet documented/);
  });

  it('pricing_terms resolves via the engine_pricing_model artifact (rationale field)', () => {
    const tour = buildGuidedTour({
      engine_pricing_model: { title: 'engine_pricing_model', content: JSON.stringify({ rationale: 'Tiered pricing reflects usage-based value delivery.' }) },
    });
    const pricing = tour.find((t) => t.stop === 'Pricing / terms');
    expect(pricing.note).toBe('Tiered pricing reflects usage-based value delivery.');
  });
});

describe('buildCapabilityScorecard', () => {
  it('AltifyAI-shaped: 1 pass, 0 overridden, 6 fail', () => {
    const wiredMap = new Map([
      ['feedback-widget', { wired: false, reason: 'no rows' }],
      ['error-capture-middleware', { wired: true, reason: 'found a row' }],
      ['telemetry-analytics', { wired: false, reason: 'no usage events' }],
    ]);
    const overrides = new Map();
    const scorecard = buildCapabilityScorecard(wiredMap, overrides);
    expect(scorecard.pass).toBe(1);
    expect(scorecard.overridden).toBe(0);
    expect(scorecard.fail).toBe(6);
    expect(scorecard.capabilities).toHaveLength(7);
    expect(scorecard.capabilities.find((c) => c.capability_id === 'error-capture-middleware').status).toBe('pass');
  });

  it('a no-signal capability with a recorded override counts as overridden, not pass', () => {
    const scorecard = buildCapabilityScorecard(new Map(), new Map([['cost-instrumentation', { override_reason: 'pre-revenue' }]]));
    const entry = scorecard.capabilities.find((c) => c.capability_id === 'cost-instrumentation');
    expect(entry.status).toBe('overridden');
    expect(scorecard.overridden).toBe(1);
    expect(scorecard.pass).toBe(0);
  });
});

describe('generateReviewPacket -- FR-5 new sections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes reconciliationTable and registryScorecard as distinct top-level keys', async () => {
    readScreenReconciliation.mockResolvedValue([{ screen_id: 'screen-2', reconciliation_status: 'built_and_walked' }]);
    precheckCapabilities.mockResolvedValue(new Map([['error-capture-middleware', { wired: true, reason: 'found a row' }]]));
    readCapabilityOverrides.mockResolvedValue(new Map());

    const packet = await generateReviewPacket(fakeArtifactsSupabase, 'v1', { log: () => {} });

    expect(packet.reconciliationTable).toEqual([{ screen_id: 'screen-2', reconciliation_status: 'built_and_walked' }]);
    expect(packet.registryScorecard.pass).toBe(1);
    expect(packet.registryScorecard.capabilities).toHaveLength(7);
  });

  it('degrades to empty sections (never throws) when the reconciliation/capability reads fail', async () => {
    readScreenReconciliation.mockResolvedValue([]);
    precheckCapabilities.mockResolvedValue(new Map());
    readCapabilityOverrides.mockResolvedValue(new Map());

    const packet = await generateReviewPacket(fakeArtifactsSupabase, 'v1', { log: () => {} });
    expect(packet.reconciliationTable).toEqual([]);
    expect(packet.registryScorecard.fail).toBe(7);
  });
});
