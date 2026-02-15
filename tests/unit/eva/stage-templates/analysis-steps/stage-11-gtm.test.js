/**
 * Unit tests for Stage 11 Analysis Step - GTM (v2.0 enhancements)
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Tests v2.0 features:
 * - persona/painPoints per tier
 * - channelType enum validation and fallback
 * - primaryTier cross-referencing against tier names
 * - BACKLOG/ACTIVE status logic based on budget
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-11-gtm.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client before importing the module under test
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

// Mock web-search
vi.mock('../../../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(() => false),
  searchBatch: vi.fn(async () => []),
  formatResultsForPrompt: vi.fn(() => ''),
}));

import { analyzeStage11, REQUIRED_TIERS, REQUIRED_CHANNELS, CHANNEL_TYPES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-11-gtm.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../../../../lib/eva/utils/web-search.js';

/**
 * Helper: create a well-formed LLM response JSON string.
 */
function createLLMResponse(overrides = {}) {
  const base = {
    tiers: [
      { name: 'Enterprise', description: 'Large companies', tam: 10000000, sam: 1000000, som: 100000, persona: 'CTO at Fortune 500', painPoints: ['Complex data pipelines', 'Vendor lock-in'] },
      { name: 'Mid-Market', description: 'Growing companies', tam: 5000000, sam: 500000, som: 50000, persona: 'VP Engineering at Series B+', painPoints: ['Scaling challenges'] },
      { name: 'SMB', description: 'Small businesses', tam: 2000000, sam: 200000, som: 20000, persona: 'Technical founder', painPoints: ['Limited budget', 'No dedicated ops team'] },
    ],
    channels: [
      { name: 'Organic Search', monthly_budget: 5000, expected_cac: 100, primary_kpi: 'Organic traffic', channelType: 'organic', primaryTier: 'SMB' },
      { name: 'Paid Search', monthly_budget: 10000, expected_cac: 150, primary_kpi: 'Conversions', channelType: 'paid', primaryTier: 'Mid-Market' },
      { name: 'Social Media', monthly_budget: 3000, expected_cac: 80, primary_kpi: 'Engagement', channelType: 'organic', primaryTier: 'SMB' },
      { name: 'Content Marketing', monthly_budget: 4000, expected_cac: 90, primary_kpi: 'Leads', channelType: 'owned', primaryTier: 'Enterprise' },
      { name: 'Email Marketing', monthly_budget: 2000, expected_cac: 50, primary_kpi: 'Open rate', channelType: 'owned', primaryTier: 'Mid-Market' },
      { name: 'Partnerships', monthly_budget: 0, expected_cac: 120, primary_kpi: 'Referrals', channelType: 'earned', primaryTier: 'Enterprise' },
      { name: 'Events', monthly_budget: 8000, expected_cac: 200, primary_kpi: 'Attendees', channelType: 'paid', primaryTier: 'Enterprise' },
      { name: 'Direct Sales', monthly_budget: 12000, expected_cac: 250, primary_kpi: 'Deals closed', channelType: 'paid', primaryTier: 'Enterprise' },
    ],
    launch_timeline: [
      { milestone: 'Soft launch', date: '2026-06-01', owner: 'Founder' },
      { milestone: 'Public launch', date: '2026-09-01', owner: 'Marketing' },
      { milestone: 'Growth phase', date: '2027-01-01', owner: 'Growth Team' },
    ],
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const VALID_PARAMS = {
  stage1Data: { description: 'An AI-powered analytics platform', targetMarket: 'SMBs', problemStatement: 'Data chaos' },
};

describe('stage-11-gtm.js - Analysis Step v2.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export REQUIRED_TIERS = 3', () => {
      expect(REQUIRED_TIERS).toBe(3);
    });

    it('should export REQUIRED_CHANNELS = 8', () => {
      expect(REQUIRED_CHANNELS).toBe(8);
    });

    it('should export CHANNEL_TYPES with 4 valid values', () => {
      expect(CHANNEL_TYPES).toEqual(['paid', 'organic', 'earned', 'owned']);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage1Data is missing', async () => {
      await expect(analyzeStage11({})).rejects.toThrow('Stage 11 GTM requires Stage 1 data with description');
    });

    it('should throw when stage1Data.description is empty', async () => {
      await expect(analyzeStage11({ stage1Data: { description: '' } })).rejects.toThrow('Stage 11 GTM requires Stage 1 data with description');
    });
  });

  describe('Tier persona/painPoints normalization', () => {
    it('should include persona in tier output when LLM provides it', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].persona).toBe('CTO at Fortune 500');
      expect(result.tiers[1].persona).toBe('VP Engineering at Series B+');
      expect(result.tiers[2].persona).toBe('Technical founder');
    });

    it('should include painPoints in tier output when LLM provides them', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].painPoints).toEqual(['Complex data pipelines', 'Vendor lock-in']);
      expect(result.tiers[1].painPoints).toEqual(['Scaling challenges']);
      expect(result.tiers[2].painPoints).toEqual(['Limited budget', 'No dedicated ops team']);
    });

    it('should set persona to null when LLM omits it', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].persona).toBeNull();
      expect(result.tiers[1].persona).toBeNull();
      expect(result.tiers[2].persona).toBeNull();
    });

    it('should set painPoints to empty array when LLM omits them', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].painPoints).toEqual([]);
      expect(result.tiers[1].painPoints).toEqual([]);
      expect(result.tiers[2].painPoints).toEqual([]);
    });

    it('should truncate persona to 500 characters', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10, persona: 'P'.repeat(600) },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].persona.length).toBe(500);
    });

    it('should truncate painPoints items to 300 characters', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10, painPoints: ['X'.repeat(400)] },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].painPoints[0].length).toBe(300);
    });
  });

  describe('channelType enum validation', () => {
    it('should accept valid channelType values', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(CHANNEL_TYPES).toContain(ch.channelType);
      }
    });

    it('should default to "organic" for invalid channelType', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 1000,
          expected_cac: 50,
          primary_kpi: `KPI${i + 1}`,
          channelType: 'invalid-type',
          primaryTier: 'T1',
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch.channelType).toBe('organic');
      }
    });

    it('should default to "organic" when channelType is missing', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 1000,
          expected_cac: 50,
          primary_kpi: `KPI${i + 1}`,
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch.channelType).toBe('organic');
      }
    });
  });

  describe('primaryTier cross-referencing', () => {
    it('should keep primaryTier when it matches an existing tier name', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      // First channel has primaryTier: 'SMB' which matches tier name
      expect(result.channels[0].primaryTier).toBe('SMB');
    });

    it('should default primaryTier to first tier name when it does not match any tier', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 1000,
          expected_cac: 50,
          primary_kpi: `KPI${i + 1}`,
          channelType: 'organic',
          primaryTier: 'NonExistentTier',
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'Alpha', description: 'First', tam: 1000, sam: 100, som: 10 },
          { name: 'Beta', description: 'Second', tam: 500, sam: 50, som: 5 },
          { name: 'Gamma', description: 'Third', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch.primaryTier).toBe('Alpha'); // defaults to first tier
      }
    });

    it('should default primaryTier to first tier name when primaryTier is missing', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 1000,
          expected_cac: 50,
          primary_kpi: `KPI${i + 1}`,
          channelType: 'paid',
          // no primaryTier
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'FirstTier', description: 'First', tam: 1000, sam: 100, som: 10 },
          { name: 'SecondTier', description: 'Second', tam: 500, sam: 50, som: 5 },
          { name: 'ThirdTier', description: 'Third', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch.primaryTier).toBe('FirstTier');
      }
    });
  });

  describe('BACKLOG/ACTIVE status logic', () => {
    it('should set status to "BACKLOG" when monthly_budget is 0', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      // Channel index 5 ("Partnerships") has budget 0
      const backlogChannel = result.channels.find(ch => ch.name === 'Partnerships');
      expect(backlogChannel.status).toBe('BACKLOG');
    });

    it('should set status to "ACTIVE" when monthly_budget > 0', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      const activeChannel = result.channels.find(ch => ch.name === 'Paid Search');
      expect(activeChannel.status).toBe('ACTIVE');
    });

    it('should compute activeChannelCount and backlogChannelCount correctly', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      // In the mock, 7 channels have budget > 0 and 1 has budget = 0
      expect(result.activeChannelCount).toBe(7);
      expect(result.backlogChannelCount).toBe(1);
    });

    it('should mark all channels as BACKLOG when all budgets are 0', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 0,
          expected_cac: 50,
          primary_kpi: `KPI${i + 1}`,
          channelType: 'organic',
          primaryTier: 'T1',
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch.status).toBe('BACKLOG');
      }
      expect(result.activeChannelCount).toBe(0);
      expect(result.backlogChannelCount).toBe(8);
    });
  });

  describe('Tier normalization', () => {
    it('should pad to exactly 3 tiers when LLM provides fewer', async () => {
      setupMock({ tiers: [{ name: 'Only', description: 'One tier', tam: 1000, sam: 100, som: 10 }] });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers.length).toBe(3);
      expect(result.tiers[1].name).toBe('Tier 2');
      expect(result.tiers[2].name).toBe('Tier 3');
    });

    it('should truncate to exactly 3 tiers when LLM provides more', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
          { name: 'T4', description: 'D4', tam: 100, sam: 10, som: 1 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers.length).toBe(3);
    });

    it('should clamp negative TAM/SAM/SOM to 0', async () => {
      setupMock({
        tiers: [
          { name: 'T1', description: 'D1', tam: -5000, sam: -100, som: -10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].tam).toBe(0);
      expect(result.tiers[0].sam).toBe(0);
      expect(result.tiers[0].som).toBe(0);
    });

    it('should truncate tier name to 200 and description to 500 characters', async () => {
      setupMock({
        tiers: [
          { name: 'N'.repeat(300), description: 'D'.repeat(600), tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].name.length).toBe(200);
      expect(result.tiers[0].description.length).toBe(500);
    });
  });

  describe('Channel normalization', () => {
    it('should pad to exactly 8 channels when LLM provides fewer', async () => {
      setupMock({ channels: [{ name: 'Only One', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'Leads' }] });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.channels.length).toBe(8);
    });

    it('should truncate to exactly 8 channels when LLM provides more', async () => {
      const channels = [];
      for (let i = 0; i < 12; i++) {
        channels.push({ name: `Ch${i}`, monthly_budget: 1000, expected_cac: 50, primary_kpi: `KPI${i}`, channelType: 'paid', primaryTier: 'Enterprise' });
      }
      setupMock({ channels });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.channels.length).toBe(8);
    });

    it('should clamp negative budget and CAC to 0', async () => {
      const channels = [];
      channels.push({ name: 'NegBudget', monthly_budget: -5000, expected_cac: -100, primary_kpi: 'Leads', channelType: 'paid', primaryTier: 'Enterprise' });
      for (let i = 1; i < 8; i++) {
        channels.push({ name: `Ch${i}`, monthly_budget: 1000, expected_cac: 50, primary_kpi: `KPI${i}`, channelType: 'paid', primaryTier: 'Enterprise' });
      }
      setupMock({ channels });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.channels[0].monthly_budget).toBe(0);
      expect(result.channels[0].expected_cac).toBe(0);
    });
  });

  describe('Derived metrics', () => {
    it('should compute totalMonthlyBudget correctly', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      // 5000 + 10000 + 3000 + 4000 + 2000 + 0 + 8000 + 12000 = 44000
      expect(result.totalMonthlyBudget).toBe(44000);
    });

    it('should compute avgCac excluding zero-CAC channels', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      // All 8 channels have non-zero CAC: (100+150+80+90+50+120+200+250)/8 = 1040/8 = 130
      expect(result.avgCac).toBe(130);
    });

    it('should return avgCac as 0 when all channels have zero CAC', async () => {
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          name: `Ch${i + 1}`,
          monthly_budget: 1000,
          expected_cac: 0,
          primary_kpi: `KPI${i + 1}`,
          channelType: 'organic',
          primaryTier: 'T1',
        });
      }
      setupMock({
        channels,
        tiers: [
          { name: 'T1', description: 'D1', tam: 1000, sam: 100, som: 10 },
          { name: 'T2', description: 'D2', tam: 500, sam: 50, som: 5 },
          { name: 'T3', description: 'D3', tam: 200, sam: 20, som: 2 },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.avgCac).toBe(0);
    });

    it('should include tierCount and channelCount in output', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tierCount).toBe(3);
      expect(result.channelCount).toBe(8);
    });
  });

  describe('Launch timeline normalization', () => {
    it('should use LLM-provided timeline when available', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.launch_timeline.length).toBe(3);
      expect(result.launch_timeline[0].milestone).toBe('Soft launch');
    });

    it('should provide default timeline when LLM returns empty array', async () => {
      setupMock({ launch_timeline: [] });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.launch_timeline.length).toBe(3);
      expect(result.launch_timeline[0].milestone).toBe('Soft launch');
      expect(result.launch_timeline[1].milestone).toBe('Public launch');
      expect(result.launch_timeline[2].milestone).toBe('Growth phase');
    });

    it('should truncate milestone to 200 and owner to 100 characters', async () => {
      setupMock({
        launch_timeline: [
          { milestone: 'M'.repeat(300), date: '2026-06-01', owner: 'O'.repeat(200) },
        ],
      });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.launch_timeline[0].milestone.length).toBe(200);
      expect(result.launch_timeline[0].owner.length).toBe(100);
    });
  });

  describe('Optional upstream data integration', () => {
    it('should include stage10 brand context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage11({
        ...VALID_PARAMS,
        stage10Data: { brandGenome: { archetype: 'Hero', audience: 'Tech professionals' } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('Hero');
      expect(userPrompt).toContain('Tech professionals');
    });

    it('should include stage5 financial context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage11({
        ...VALID_PARAMS,
        stage5Data: { initialInvestment: 75000, year1: { revenue: 300000 } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('75000');
      expect(userPrompt).toContain('300000');
    });
  });

  describe('Output shape', () => {
    it('should return all expected top-level fields', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result).toHaveProperty('tiers');
      expect(result).toHaveProperty('channels');
      expect(result).toHaveProperty('launch_timeline');
      expect(result).toHaveProperty('totalMonthlyBudget');
      expect(result).toHaveProperty('avgCac');
      expect(result).toHaveProperty('tierCount');
      expect(result).toHaveProperty('channelCount');
      expect(result).toHaveProperty('activeChannelCount');
      expect(result).toHaveProperty('backlogChannelCount');
    });

    it('should ensure each channel has all v2.0 fields', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      for (const ch of result.channels) {
        expect(ch).toHaveProperty('name');
        expect(ch).toHaveProperty('monthly_budget');
        expect(ch).toHaveProperty('expected_cac');
        expect(ch).toHaveProperty('primary_kpi');
        expect(ch).toHaveProperty('channelType');
        expect(ch).toHaveProperty('primaryTier');
        expect(ch).toHaveProperty('status');
      }
    });

    it('should ensure each tier has all v2.0 fields', async () => {
      setupMock();
      const result = await analyzeStage11(VALID_PARAMS);
      for (const tier of result.tiers) {
        expect(tier).toHaveProperty('name');
        expect(tier).toHaveProperty('description');
        expect(tier).toHaveProperty('tam');
        expect(tier).toHaveProperty('sam');
        expect(tier).toHaveProperty('som');
        expect(tier).toHaveProperty('persona');
        expect(tier).toHaveProperty('painPoints');
      }
    });
  });

  describe('JSON parsing', () => {
    it('should handle LLM response wrapped in markdown code block', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage11(VALID_PARAMS);
      expect(result.tiers[0].name).toBe('Enterprise');
    });

    it('should throw on unparseable LLM response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('Not JSON');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage11(VALID_PARAMS)).rejects.toThrow('Failed to parse LLM response as JSON');
    });
  });

  describe('Web search integration', () => {
    it('should not call searchBatch when search is disabled', async () => {
      isSearchEnabled.mockReturnValue(false);
      setupMock();
      await analyzeStage11(VALID_PARAMS);
      expect(searchBatch).not.toHaveBeenCalled();
    });

    it('should call searchBatch with GTM queries when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([{ title: 'GTM Report', url: 'https://example.com', content: 'GTM data' }]);
      formatResultsForPrompt.mockReturnValue('Web: GTM data');
      setupMock();

      await analyzeStage11({ ...VALID_PARAMS, ventureName: 'TestVenture' });

      expect(searchBatch).toHaveBeenCalledTimes(1);
      const queries = searchBatch.mock.calls[0][0];
      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('go to market');
      expect(queries[1]).toContain('CAC');
      expect(formatResultsForPrompt).toHaveBeenCalledWith(
        expect.any(Array),
        'GTM Intelligence Research',
      );
    });

    it('should inject web context into LLM prompt when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([]);
      formatResultsForPrompt.mockReturnValue('Web: GTM intelligence here');
      const mockComplete = setupMock();

      await analyzeStage11(VALID_PARAMS);

      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('Web: GTM intelligence here');
    });
  });
});
