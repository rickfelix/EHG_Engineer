/**
 * Unit tests for Tournament Orchestrator - Parallel LLM Generation with Competitive Selection
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-E (FR-1, FR-3, FR-5)
 *
 * Test Scenarios:
 * - TS-1: Happy path - 3 generations, all succeed, highest score wins
 * - TS-2: Partial failure - 1 of 3 fails, tournament proceeds with 2
 * - TS-3: All below threshold - returns null result with fallback=true
 * - TS-4: All fail - returns null result with fallback=true
 * - TS-5: Tournament metadata includes all scores and winner index
 * - TS-6: Custom temperatures and threshold options
 *
 * @module tests/unit/eva/crews/tournament-orchestrator.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM client before importing module under test
vi.mock('../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(),
}));

// Mock parse-json utility
vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((text) => {
    // Attempt real JSON parse, mirroring the real implementation
    const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
    return JSON.parse(cleaned);
  }),
}));

// Mock four-buckets utilities
vi.mock('../../../../lib/eva/utils/four-buckets-prompt.js', () => ({
  getFourBucketsPrompt: vi.fn(() => '\n\nEPISTEMIC CLASSIFICATION...'),
}));

vi.mock('../../../../lib/eva/utils/four-buckets-parser.js', () => ({
  parseFourBuckets: vi.fn(() => ({
    classifications: [],
    factCount: 0,
    assumptionCount: 0,
    simulationCount: 0,
    unknownCount: 0,
  })),
}));

import { runTournament, DEFAULT_TEMPERATURES, DEFAULT_THRESHOLD, GENERATION_TIMEOUT_MS } from '../../../../lib/eva/crews/tournament-orchestrator.js';
import { getLLMClient } from '../../../../lib/llm/index.js';

/**
 * Helper: create a well-formed GTM JSON string for LLM mock responses.
 */
function createGTMResponse(overrides = {}) {
  const base = {
    tiers: [
      { name: 'SMB SaaS', description: 'Small SaaS companies needing GTM automation', tam: 5000000, sam: 1000000, som: 100000, persona: 'CTO at 10-50 person SaaS startup', painPoints: ['Manual GTM planning', 'No market data'] },
      { name: 'Mid-Market', description: 'Growing SaaS companies scaling their go-to-market', tam: 20000000, sam: 5000000, som: 500000, persona: 'VP Marketing at 50-200 person company', painPoints: ['CAC tracking', 'Channel optimization'] },
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

/**
 * Helper: create a low-quality GTM JSON string that scores below threshold.
 */
function createLowScoreResponse() {
  return JSON.stringify({
    tiers: [
      { name: 'Tier 1', description: 'TBD', tam: 0, sam: 0, som: 0 },
      { name: 'Tier 2', description: 'TBD', tam: 0, sam: 0, som: 0 },
      { name: 'Tier 3', description: 'TBD', tam: 0, sam: 0, som: 0 },
    ],
    channels: [
      { name: 'Organic Search', monthly_budget: 0, expected_cac: 0, primary_kpi: 'TBD', channelType: 'organic' },
      { name: 'Paid Search', monthly_budget: 0, expected_cac: 0, primary_kpi: 'TBD', channelType: 'organic' },
    ],
    launch_timeline: [],
  });
}

/** Silent logger to suppress tournament console output during tests. */
const silentLogger = { log: () => {} };

/** Standard tournament params for tests. */
function createTournamentParams(overrides = {}) {
  return {
    systemPrompt: 'You are a GTM engine.',
    userPrompt: 'Generate GTM for a SaaS analytics platform.',
    context: { description: 'SaaS analytics platform', targetMarket: 'SaaS companies' },
    options: { logger: silentLogger, ...overrides },
  };
}

/**
 * Helper: set up LLM mock that returns different responses per call.
 * @param {(string|Error)[]} responses - Array of response strings or Errors to throw
 */
function setupLLMMock(responses) {
  const mockComplete = vi.fn();
  responses.forEach((resp, i) => {
    if (resp instanceof Error) {
      mockComplete.mockRejectedValueOnce(resp);
    } else {
      mockComplete.mockResolvedValueOnce(resp);
    }
  });
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

describe('tournament-orchestrator.js - Parallel LLM Tournament', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export DEFAULT_TEMPERATURES as [0.3, 0.7, 1.0]', () => {
      expect(DEFAULT_TEMPERATURES).toEqual([0.3, 0.7, 1.0]);
    });

    it('should export DEFAULT_THRESHOLD as 60', () => {
      expect(DEFAULT_THRESHOLD).toBe(60);
    });

    it('should export GENERATION_TIMEOUT_MS as 30000', () => {
      expect(GENERATION_TIMEOUT_MS).toBe(30_000);
    });
  });

  describe('Happy path - all generations succeed (TS-1)', () => {
    it('should return the highest-scoring result as winner', async () => {
      // All 3 respond with valid high-quality GTM
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { result, tournament } = await runTournament(createTournamentParams());

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('tiers');
      expect(result).toHaveProperty('channels');
      expect(tournament.fallback).toBe(false);
      expect(tournament.winnerIndex).toBeTypeOf('number');
      expect(tournament.winnerIndex).toBeGreaterThanOrEqual(0);
      expect(tournament.winnerIndex).toBeLessThan(3);
    });

    it('should call getLLMClient 3 times (once per generation)', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      await runTournament(createTournamentParams());

      expect(getLLMClient).toHaveBeenCalledTimes(3);
      expect(getLLMClient).toHaveBeenCalledWith({ purpose: 'content-generation' });
    });

    it('should pass temperature to each LLM call', async () => {
      const mockComplete = setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      await runTournament(createTournamentParams());

      // Each call should have different temperature
      const temps = mockComplete.mock.calls.map(call => call[2]?.temperature);
      expect(temps).toContain(0.3);
      expect(temps).toContain(0.7);
      expect(temps).toContain(1.0);
    });
  });

  describe('Partial failure - some generations fail (TS-2)', () => {
    it('should proceed with 2 successful generations when 1 fails', async () => {
      setupLLMMock([
        createGTMResponse(),
        new Error('LLM timeout'),
        createGTMResponse(),
      ]);

      const { result, tournament } = await runTournament(createTournamentParams());

      expect(result).not.toBeNull();
      expect(tournament.successCount).toBe(2);
      expect(tournament.failedCount).toBe(1);
      expect(tournament.fallback).toBe(false);
    });

    it('should proceed with 1 successful generation when 2 fail', async () => {
      setupLLMMock([
        new Error('Rate limit'),
        new Error('Connection reset'),
        createGTMResponse(),
      ]);

      const { result, tournament } = await runTournament(createTournamentParams());

      expect(result).not.toBeNull();
      expect(tournament.successCount).toBe(1);
      expect(tournament.failedCount).toBe(2);
    });
  });

  describe('All below threshold - fallback (TS-3)', () => {
    it('should return null result with fallback=true when best score < threshold', async () => {
      setupLLMMock([
        createLowScoreResponse(),
        createLowScoreResponse(),
        createLowScoreResponse(),
      ]);

      const { result, tournament } = await runTournament(createTournamentParams());

      expect(result).toBeNull();
      expect(tournament.fallback).toBe(true);
      expect(tournament.winnerIndex).toBeNull();
    });

    it('should respect custom threshold option', async () => {
      // Use a very high threshold that even good responses fail
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { result, tournament } = await runTournament(
        createTournamentParams({ threshold: 999 })
      );

      expect(result).toBeNull();
      expect(tournament.fallback).toBe(true);
      expect(tournament.threshold).toBe(999);
    });

    it('should accept results with a low threshold', async () => {
      setupLLMMock([
        createLowScoreResponse(),
        createLowScoreResponse(),
        createLowScoreResponse(),
      ]);

      const { result, tournament } = await runTournament(
        createTournamentParams({ threshold: 0 })
      );

      // Even low-quality results should pass a threshold of 0
      expect(result).not.toBeNull();
      expect(tournament.fallback).toBe(false);
    });
  });

  describe('All generations fail (TS-4)', () => {
    it('should return null result with fallback=true when all fail', async () => {
      setupLLMMock([
        new Error('LLM down'),
        new Error('Rate limit exceeded'),
        new Error('Service unavailable'),
      ]);

      const { result, tournament } = await runTournament(createTournamentParams());

      expect(result).toBeNull();
      expect(tournament.fallback).toBe(true);
      expect(tournament.winnerIndex).toBeNull();
      expect(tournament.successCount).toBe(0);
      expect(tournament.failedCount).toBe(3);
    });
  });

  describe('Tournament metadata structure (TS-5)', () => {
    it('should include all required metadata fields', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      expect(tournament).toHaveProperty('generationCount');
      expect(tournament).toHaveProperty('successCount');
      expect(tournament).toHaveProperty('failedCount');
      expect(tournament).toHaveProperty('winnerIndex');
      expect(tournament).toHaveProperty('threshold');
      expect(tournament).toHaveProperty('fallback');
      expect(tournament).toHaveProperty('durationMs');
      expect(tournament).toHaveProperty('scores');
    });

    it('should have generationCount matching number of temperatures', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      expect(tournament.generationCount).toBe(3);
    });

    it('should include scores array with entry for each generation', async () => {
      setupLLMMock([
        createGTMResponse(),
        new Error('fail'),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      expect(tournament.scores).toHaveLength(3);
      // Each score entry should have required fields
      for (const score of tournament.scores) {
        expect(score).toHaveProperty('index');
        expect(score).toHaveProperty('failed');
      }
    });

    it('should mark failed generations in scores array', async () => {
      setupLLMMock([
        createGTMResponse(),
        new Error('fail'),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      const failedScore = tournament.scores.find(s => s.index === 1);
      expect(failedScore.failed).toBe(true);
      expect(failedScore.total).toBeNull();
    });

    it('should include dimension scores for successful generations', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      const successScore = tournament.scores.find(s => !s.failed);
      expect(successScore.total).toBeTypeOf('number');
      expect(successScore.specificity).toBeTypeOf('number');
      expect(successScore.actionability).toBeTypeOf('number');
      expect(successScore.marketFit).toBeTypeOf('number');
      expect(successScore.financialCoherence).toBeTypeOf('number');
    });

    it('should have durationMs as a positive number', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      expect(tournament.durationMs).toBeTypeOf('number');
      expect(tournament.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should use DEFAULT_THRESHOLD when no threshold option is provided', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(createTournamentParams());

      expect(tournament.threshold).toBe(DEFAULT_THRESHOLD);
    });
  });

  describe('Custom options (TS-6)', () => {
    it('should respect custom temperatures array', async () => {
      const mockComplete = setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(
        createTournamentParams({ temperatures: [0.5, 0.9] })
      );

      expect(tournament.generationCount).toBe(2);
      expect(getLLMClient).toHaveBeenCalledTimes(2);

      const temps = mockComplete.mock.calls.map(call => call[2]?.temperature);
      expect(temps).toContain(0.5);
      expect(temps).toContain(0.9);
    });

    it('should work with a single temperature (1 generation)', async () => {
      setupLLMMock([createGTMResponse()]);

      const { result, tournament } = await runTournament(
        createTournamentParams({ temperatures: [0.7] })
      );

      expect(result).not.toBeNull();
      expect(tournament.generationCount).toBe(1);
      expect(tournament.successCount).toBe(1);
    });

    it('should work with 5 temperatures', async () => {
      setupLLMMock([
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
        createGTMResponse(),
      ]);

      const { tournament } = await runTournament(
        createTournamentParams({ temperatures: [0.1, 0.3, 0.5, 0.7, 1.0] })
      );

      expect(tournament.generationCount).toBe(5);
    });
  });

  describe('Scoring integration', () => {
    it('should select the generation with highest total score as winner', async () => {
      // First response: low quality (generic tiers, no specifics)
      const lowQuality = JSON.stringify({
        tiers: [
          { name: 'Tier 1', description: 'TBD', tam: 100, sam: 50, som: 10 },
          { name: 'Tier 2', description: 'TBD', tam: 100, sam: 50, som: 10 },
          { name: 'Tier 3', description: 'TBD', tam: 100, sam: 50, som: 10 },
        ],
        channels: [
          { name: 'Organic Search', monthly_budget: 0, expected_cac: 0, primary_kpi: 'TBD', channelType: 'organic' },
          { name: 'Paid Search', monthly_budget: 0, expected_cac: 0, primary_kpi: 'TBD', channelType: 'organic' },
        ],
        launch_timeline: [],
      });

      // Second response: high quality
      const highQuality = createGTMResponse();

      // Third response: medium quality
      const mediumQuality = JSON.stringify({
        tiers: [
          { name: 'Startups', description: 'Early stage startups building their first product', tam: 1000000, sam: 500000, som: 50000, persona: 'Technical founder at seed-stage company', painPoints: ['No marketing budget'] },
          { name: 'Growth', description: 'Series A/B companies', tam: 5000000, sam: 2000000, som: 200000, persona: 'Head of Growth', painPoints: ['Scaling channels'] },
          { name: 'Enterprise', description: 'TBD', tam: 10000000, sam: 3000000, som: 300000 },
        ],
        channels: [
          { name: 'Content Marketing', monthly_budget: 2000, expected_cac: 40, primary_kpi: 'Blog subscribers per month', channelType: 'owned', primaryTier: 'Startups' },
          { name: 'Google Ads', monthly_budget: 5000, expected_cac: 100, primary_kpi: 'Trial signups per month', channelType: 'paid', primaryTier: 'Growth' },
        ],
        launch_timeline: [
          { milestone: 'MVP Launch', date: '2026-03-01', owner: 'Product' },
        ],
      });

      setupLLMMock([lowQuality, highQuality, mediumQuality]);

      const { tournament } = await runTournament(
        createTournamentParams({ threshold: 0 })
      );

      // The high quality response (index 1) should score highest
      const winnerScore = tournament.scores[tournament.winnerIndex];
      for (const score of tournament.scores) {
        if (!score.failed && score.index !== tournament.winnerIndex) {
          expect(winnerScore.total).toBeGreaterThanOrEqual(score.total);
        }
      }
    });
  });
});
