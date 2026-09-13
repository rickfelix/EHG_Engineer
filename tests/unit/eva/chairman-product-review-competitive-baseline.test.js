/**
 * SD-LEO-INFRA-COMPETITIVE-BASELINES-RECURRING-001 -- FR-6 / TS-4, TS-5: the packet never waits
 * on the competitive-baseline read, and the gap is always labelled, never silently missing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/discovery/competitive-baseline-service.js', () => ({
  CompetitiveBaselineService: vi.fn(),
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  isFixtureVenture: vi.fn(() => false),
  fetchVentureForFixtureCheck: vi.fn(async () => ({ name: 'AltifyAI' })),
}));
vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({ escalateChairmanDecision: vi.fn() }));
vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({ resolveSdInputOrNull: vi.fn() }));
vi.mock('../../../lib/eva/post-build-convergence-gate.js', () => ({ loadVerdictSummary: vi.fn(async () => null) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({ getStageGovernance: vi.fn() }));
// SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-4/FR-5: additive, read-only lookups
// generateReviewPacket now also makes -- stubbed so fakeSupabase below (which never
// modeled these tables) doesn't need to.
vi.mock('../../../lib/eva/stage-templates/screen-reconciliation-builder.js', () => ({
  readScreenReconciliation: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, precheckCapabilities: vi.fn().mockResolvedValue(new Map()) };
});
vi.mock('../../../lib/eva/utils/validate-venture-default-capabilities.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readCapabilityOverrides: vi.fn().mockResolvedValue(new Map()) };
});
vi.mock('../../../lib/eva/bridge/stack-scan-reader.js', () => ({
  readStackScanConclusion: vi.fn().mockResolvedValue({ available: false, reason: 'no_venture_resources_github_repo_record' }),
}));

import { generateReviewPacket } from '../../../lib/eva/chairman-product-review.js';
import { CompetitiveBaselineService } from '../../../lib/discovery/competitive-baseline-service.js';

const fakeSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ in: () => Promise.resolve({ data: [] }) }),
      }),
    }),
  }),
};

describe('generateReviewPacket -- competitive-baseline section (never waits)', () => {
  const logs = [];
  const testLogger = { log: (...a) => logs.push(a.join(' ')) };
  beforeEach(() => {
    vi.clearAllMocks();
    logs.length = 0;
  });

  it('TS-4: a fresh baseline present -> packet includes it and completes', async () => {
    CompetitiveBaselineService.mockImplementation(function () { return ({
      getFreshOrNull: vi.fn(async () => [{ competitor_name: 'Acme', produced_at: 'x', expires_at: 'y' }]),
    }); });
    const packet = await generateReviewPacket(fakeSupabase, 'v1', testLogger);
    expect(packet.competitiveBaseline.available).toBe(true);
    expect(packet.competitiveBaseline.competitors).toHaveLength(1);
  });

  it('TS-5: baseline absent (null) -> packet PROCEEDS with a labelled gap, not silently missing', async () => {
    CompetitiveBaselineService.mockImplementation(function () { return ({
      getFreshOrNull: vi.fn(async () => null),
    }); });
    const packet = await generateReviewPacket(fakeSupabase, 'v1', testLogger);
    expect(packet.skipped).toBe(false);
    expect(packet.competitiveBaseline).toEqual({ available: false, reason: 'missing_or_stale' });
  });

  it('TS-5: getFreshOrNull THROWS -> packet PROCEEDS, error is caught, gap labelled as error', async () => {
    CompetitiveBaselineService.mockImplementation(function () { return ({
      getFreshOrNull: vi.fn(async () => { throw new Error('query failed'); }),
    }); });
    const packet = await generateReviewPacket(fakeSupabase, 'v1', testLogger);
    expect(packet.skipped).toBe(false);
    expect(packet.competitiveBaseline).toEqual({ available: false, reason: 'error' });
  });

  it('TS-5: getFreshOrNull HANGS past the timeout budget -> packet PROCEEDS, labelled as timeout', async () => {
    vi.useFakeTimers();
    CompetitiveBaselineService.mockImplementation(function () { return ({
      getFreshOrNull: vi.fn(() => new Promise(() => {})), // never resolves
    }); });
    const packetPromise = generateReviewPacket(fakeSupabase, 'v1', testLogger);
    await vi.advanceTimersByTimeAsync(6000);
    const packet = await packetPromise;
    expect(packet.skipped).toBe(false);
    expect(packet.competitiveBaseline).toEqual({ available: false, reason: 'timeout' });
    vi.useRealTimers();
  });

  it('TS-5: getFreshOrNull returns an EMPTY array (truthy, but zero rows) -> treated as missing, not present', async () => {
    CompetitiveBaselineService.mockImplementation(function () { return ({
      getFreshOrNull: vi.fn(async () => []),
    }); });
    const packet = await generateReviewPacket(fakeSupabase, 'v1', testLogger);
    expect(packet.competitiveBaseline).toEqual({ available: false, reason: 'missing_or_stale' });
  });
});
