/**
 * Unit tests for Stage 11 GTM - Tournament Feature Flag Integration
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E (FR-1, FR-5)
 *
 * Tests the CREW_TOURNAMENT_ENABLED feature flag behavior:
 * - TS-1: Flag OFF: no tournament code executes, single LLM call
 * - TS-2: Flag ON: delegates to runTournament
 * - TS-3: Flag ON + tournament winner: result includes tournament metadata
 * - TS-4: Flag ON + tournament fallback: falls back to single generation
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-11-gtm-tournament.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock LLM client
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

// Mock web-search (always disabled for these tests)
vi.mock('../../../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(() => false),
  searchBatch: vi.fn(async () => []),
  formatResultsForPrompt: vi.fn(() => ''),
}));

// Mock tournament orchestrator
vi.mock('../../../../../lib/eva/crews/tournament-orchestrator.js', () => ({
  runTournament: vi.fn(),
}));

// Mock four-buckets utilities
vi.mock('../../../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: vi.fn(() => '\n\nEPISTEMIC CLASSIFICATION...'),
}));

vi.mock('../../../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: vi.fn(() => ({
    classifications: [],
    factCount: 0,
    assumptionCount: 0,
    simulationCount: 0,
    unknownCount: 0,
  })),
}));

import { analyzeStage11 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-11-gtm.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { runTournament } from '../../../../../lib/eva/crews/tournament-orchestrator.js';

/** Well-formed GTM response for LLM mocks. */
function createLLMResponse(overrides = {}) {
  const base = {
    tiers: [
      { name: 'SMB SaaS', description: 'Small SaaS companies needing GTM automation', tam: 5000000, sam: 1000000, som: 100000, persona: 'CTO at 10-50 person SaaS startup', painPoints: ['Manual GTM planning', 'No market data'] },
      { name: 'Mid-Market', description: 'Growing SaaS companies scaling their GTM', tam: 20000000, sam: 5000000, som: 500000, persona: 'VP Marketing at 50-200 person company', painPoints: ['CAC tracking', 'Channel optimization'] },
      { name: 'Enterprise', description: 'Large organizations with complex GTM needs', tam: 50000000, sam: 10000000, som: 1000000, persona: 'CMO at Fortune 500 with multi-channel attribution needs', painPoints: ['Multi-channel attribution', 'Budget allocation'] },
    ],
    channels: [
      { name: 'LinkedIn Ads', monthly_budget: 5000, expected_cac: 120, primary_kpi: 'Demo requests per month', channelType: 'paid', primaryTier: 'SMB SaaS' },
      { name: 'SEO Blog', monthly_budget: 2000, expected_cac: 30, primary_kpi: 'Organic signups per month', channelType: 'organic', primaryTier: 'SMB SaaS' },
      { name: 'Product Hunt Launch', monthly_budget: 500, expected_cac: 15, primary_kpi: 'Launch day signups', channelType: 'earned', primaryTier: 'SMB SaaS' },
      { name: 'Email Newsletter', monthly_budget: 300, expected_cac: 8, primary_kpi: 'Conversion rate', channelType: 'owned', primaryTier: 'Mid-Market' },
      { name: 'Google Ads', monthly_budget: 3000, expected_cac: 80, primary_kpi: 'Trial signups', channelType: 'paid', primaryTier: 'Mid-Market' },
      { name: 'Partner Integrations', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'Integration installs', channelType: 'earned', primaryTier: 'Mid-Market' },
      { name: 'Conference Talks', monthly_budget: 2000, expected_cac: 200, primary_kpi: 'Leads per event', channelType: 'owned', primaryTier: 'Enterprise' },
      { name: 'Outbound Sales', monthly_budget: 4000, expected_cac: 300, primary_kpi: 'Meetings booked per week', channelType: 'owned', primaryTier: 'Enterprise' },
    ],
    launch_timeline: [
      { milestone: 'Beta launch', date: '2026-03-01', owner: 'Product' },
      { milestone: 'Public launch', date: '2026-04-15', owner: 'Marketing' },
      { milestone: 'Growth phase', date: '2026-07-01', owner: 'Growth' },
    ],
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupDirectMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const silentLogger = { log: () => {} };

const VALID_PARAMS = {
  stage1Data: { description: 'An AI-powered analytics platform', targetMarket: 'SMBs', problemStatement: 'Data chaos' },
  logger: silentLogger,
};

/** Sample tournament metadata for mocks. */
function createTournamentMeta(overrides = {}) {
  return {
    generationCount: 3,
    successCount: 3,
    failedCount: 0,
    winnerIndex: 1,
    threshold: 60,
    fallback: false,
    durationMs: 2500,
    scores: [
      { index: 0, temperature: 0.3, failed: false, total: 72, specificity: 18, actionability: 20, marketFit: 16, financialCoherence: 18 },
      { index: 1, temperature: 0.7, failed: false, total: 85, specificity: 22, actionability: 23, marketFit: 20, financialCoherence: 20 },
      { index: 2, temperature: 1.0, failed: false, total: 68, specificity: 15, actionability: 19, marketFit: 17, financialCoherence: 17 },
    ],
    ...overrides,
  };
}

describe('stage-11-gtm.js - Tournament Feature Flag Integration', () => {
  let originalEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env.CREW_TOURNAMENT_ENABLED;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.CREW_TOURNAMENT_ENABLED;
    } else {
      process.env.CREW_TOURNAMENT_ENABLED = originalEnv;
    }
  });

  describe('CREW_TOURNAMENT_ENABLED=false (TS-1)', () => {
    beforeEach(() => {
      process.env.CREW_TOURNAMENT_ENABLED = 'false';
    });

    it('should NOT call runTournament when flag is false', async () => {
      setupDirectMock();
      await analyzeStage11(VALID_PARAMS);
      expect(runTournament).not.toHaveBeenCalled();
    });

    it('should call getLLMClient directly for single generation', async () => {
      const mockComplete = setupDirectMock();
      await analyzeStage11(VALID_PARAMS);
      expect(getLLMClient).toHaveBeenCalled();
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('should NOT include tournament metadata in result', async () => {
      setupDirectMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result).not.toHaveProperty('tournament');
    });

    it('should produce a valid result with all standard fields', async () => {
      setupDirectMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result).toHaveProperty('tiers');
      expect(result).toHaveProperty('channels');
      expect(result).toHaveProperty('launch_timeline');
      expect(result).toHaveProperty('totalMonthlyBudget');
      expect(result).toHaveProperty('avgCac');
      expect(result.tiers).toHaveLength(3);
      expect(result.channels).toHaveLength(8);
    });

    it('should NOT call runTournament when flag is unset', async () => {
      delete process.env.CREW_TOURNAMENT_ENABLED;
      setupDirectMock();
      await analyzeStage11(VALID_PARAMS);
      expect(runTournament).not.toHaveBeenCalled();
    });

    it('should NOT call runTournament when flag is empty string', async () => {
      process.env.CREW_TOURNAMENT_ENABLED = '';
      setupDirectMock();
      await analyzeStage11(VALID_PARAMS);
      expect(runTournament).not.toHaveBeenCalled();
    });

    it('should NOT call runTournament when flag is "TRUE" (case mismatch)', async () => {
      process.env.CREW_TOURNAMENT_ENABLED = 'TRUE';
      setupDirectMock();
      await analyzeStage11(VALID_PARAMS);
      // The code checks === 'true' (lowercase), so 'TRUE' should NOT trigger tournament
      expect(runTournament).not.toHaveBeenCalled();
    });
  });

  describe('CREW_TOURNAMENT_ENABLED=true with winner (TS-2, TS-3)', () => {
    beforeEach(() => {
      process.env.CREW_TOURNAMENT_ENABLED = 'true';
    });

    it('should call runTournament when flag is true', async () => {
      const parsedResult = JSON.parse(createLLMResponse());
      parsedResult.fourBuckets = { classifications: [], factCount: 0, assumptionCount: 0, simulationCount: 0, unknownCount: 0 };

      runTournament.mockResolvedValue({
        result: parsedResult,
        tournament: createTournamentMeta(),
      });

      await analyzeStage11(VALID_PARAMS);
      expect(runTournament).toHaveBeenCalledTimes(1);
    });

    it('should pass correct parameters to runTournament', async () => {
      const parsedResult = JSON.parse(createLLMResponse());
      parsedResult.fourBuckets = { classifications: [], factCount: 0, assumptionCount: 0, simulationCount: 0, unknownCount: 0 };

      runTournament.mockResolvedValue({
        result: parsedResult,
        tournament: createTournamentMeta(),
      });

      await analyzeStage11(VALID_PARAMS);

      expect(runTournament).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.any(String),
          userPrompt: expect.any(String),
          context: expect.objectContaining({
            description: 'An AI-powered analytics platform',
            targetMarket: 'SMBs',
          }),
          options: expect.objectContaining({
            logger: expect.any(Object),
          }),
        })
      );
    });

    it('should include tournament metadata in result when tournament succeeds', async () => {
      const parsedResult = JSON.parse(createLLMResponse());
      parsedResult.fourBuckets = { classifications: [], factCount: 0, assumptionCount: 0, simulationCount: 0, unknownCount: 0 };
      const tournamentMeta = createTournamentMeta();

      runTournament.mockResolvedValue({
        result: parsedResult,
        tournament: tournamentMeta,
      });

      const result = await analyzeStage11(VALID_PARAMS);

      expect(result).toHaveProperty('tournament');
      expect(result.tournament).toEqual(tournamentMeta);
    });

    it('should normalize tournament winner result the same as single generation', async () => {
      const parsedResult = JSON.parse(createLLMResponse());
      parsedResult.fourBuckets = { classifications: [], factCount: 0, assumptionCount: 0, simulationCount: 0, unknownCount: 0 };

      runTournament.mockResolvedValue({
        result: parsedResult,
        tournament: createTournamentMeta(),
      });

      const result = await analyzeStage11(VALID_PARAMS);

      // Standard normalization checks
      expect(result.tiers).toHaveLength(3);
      expect(result.channels).toHaveLength(8);
      expect(result).toHaveProperty('totalMonthlyBudget');
      expect(result).toHaveProperty('avgCac');
      expect(result).toHaveProperty('tierCount', 3);
      expect(result).toHaveProperty('channelCount', 8);
    });

    it('should NOT call getLLMClient directly when tournament returns a winner', async () => {
      const parsedResult = JSON.parse(createLLMResponse());
      parsedResult.fourBuckets = { classifications: [], factCount: 0, assumptionCount: 0, simulationCount: 0, unknownCount: 0 };

      runTournament.mockResolvedValue({
        result: parsedResult,
        tournament: createTournamentMeta(),
      });

      const mockComplete = vi.fn();
      getLLMClient.mockReturnValue({ complete: mockComplete });

      await analyzeStage11(VALID_PARAMS);

      // getLLMClient is still called (for the client ref at top of analyzeStage11),
      // but complete() should NOT be called when tournament provides a winner
      expect(mockComplete).not.toHaveBeenCalled();
    });
  });

  describe('CREW_TOURNAMENT_ENABLED=true with fallback (TS-4)', () => {
    beforeEach(() => {
      process.env.CREW_TOURNAMENT_ENABLED = 'true';
    });

    it('should fall back to single generation when tournament returns null result', async () => {
      const tournamentMeta = createTournamentMeta({ fallback: true, winnerIndex: null });

      runTournament.mockResolvedValue({
        result: null,
        tournament: tournamentMeta,
      });

      const mockComplete = vi.fn().mockResolvedValue(createLLMResponse());
      getLLMClient.mockReturnValue({ complete: mockComplete });

      const result = await analyzeStage11(VALID_PARAMS);

      // Should have called complete() as fallback
      expect(mockComplete).toHaveBeenCalledTimes(1);
      // Result should still be valid
      expect(result.tiers).toHaveLength(3);
      expect(result.channels).toHaveLength(8);
    });

    it('should still include tournament metadata even on fallback', async () => {
      const tournamentMeta = createTournamentMeta({ fallback: true, winnerIndex: null });

      runTournament.mockResolvedValue({
        result: null,
        tournament: tournamentMeta,
      });

      const mockComplete = vi.fn().mockResolvedValue(createLLMResponse());
      getLLMClient.mockReturnValue({ complete: mockComplete });

      const result = await analyzeStage11(VALID_PARAMS);

      expect(result).toHaveProperty('tournament');
      expect(result.tournament.fallback).toBe(true);
    });
  });
});
