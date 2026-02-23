/**
 * Unit Tests for Attention Capital Synthesis Component
 * Part of SD-LEO-FEAT-ATTENTION-CAPITAL-SYNTHESIS-001
 *
 * Tests cover:
 * - calculateAttentionCapitalScore() weighted-sum logic
 * - classifyAttentionBand() band boundary classification
 * - Score clamping for out-of-range values
 * - Default fallback on LLM error and malformed JSON
 * - analyzeAttentionCapital() happy path with mocked LLM client
 */
import { vi } from 'vitest';
import {
  analyzeAttentionCapital,
  calculateAttentionCapitalScore,
  classifyAttentionBand,
  AC_WEIGHTS,
  ATTENTION_BANDS,
} from '../../../../lib/eva/stage-zero/synthesis/attention-capital.js';

describe('Attention Capital Synthesis', () => {
  // ---------------------------------------------------------------
  // 1. calculateAttentionCapitalScore() - weighted sum
  // ---------------------------------------------------------------
  describe('calculateAttentionCapitalScore', () => {
    it('should return 0 when all components are 0', () => {
      const components = {
        organic_search_momentum: 0,
        engagement_depth: 0,
        earned_media_ratio: 0,
        advocacy_signal: 0,
        return_engagement: 0,
      };
      expect(calculateAttentionCapitalScore(components)).toBe(0);
    });

    it('should return 100 when all components are 100', () => {
      const components = {
        organic_search_momentum: 100,
        engagement_depth: 100,
        earned_media_ratio: 100,
        advocacy_signal: 100,
        return_engagement: 100,
      };
      // 100 * (0.25 + 0.25 + 0.20 + 0.15 + 0.15) = 100 * 1.0 = 100
      expect(calculateAttentionCapitalScore(components)).toBe(100);
    });

    it('should compute correct weighted sum for known values', () => {
      const components = {
        organic_search_momentum: 80,
        engagement_depth: 60,
        earned_media_ratio: 40,
        advocacy_signal: 70,
        return_engagement: 50,
      };
      // 80*0.25 + 60*0.25 + 40*0.20 + 70*0.15 + 50*0.15
      // = 20 + 15 + 8 + 10.5 + 7.5 = 61
      expect(calculateAttentionCapitalScore(components)).toBe(61);
    });

    it('should return 0 for null input', () => {
      expect(calculateAttentionCapitalScore(null)).toBe(0);
    });

    it('should return 0 for undefined input', () => {
      expect(calculateAttentionCapitalScore(undefined)).toBe(0);
    });

    it('should treat missing sub-dimensions as 0', () => {
      // Only organic_search_momentum provided
      const partial = { organic_search_momentum: 100 };
      // 100 * 0.25 = 25, everything else 0
      expect(calculateAttentionCapitalScore(partial)).toBe(25);
    });

    it('should return 0 for empty object', () => {
      expect(calculateAttentionCapitalScore({})).toBe(0);
    });

    it('should round the result to nearest integer', () => {
      const components = {
        organic_search_momentum: 33,
        engagement_depth: 33,
        earned_media_ratio: 33,
        advocacy_signal: 33,
        return_engagement: 33,
      };
      // 33 * 1.0 = 33.0 (exact, but Math.round confirms integer output)
      expect(Number.isInteger(calculateAttentionCapitalScore(components))).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // 2. classifyAttentionBand() - band boundary classification
  // ---------------------------------------------------------------
  describe('classifyAttentionBand', () => {
    it('should classify 0 as AC-Low', () => {
      expect(classifyAttentionBand(0).band).toBe('AC-Low');
    });

    it('should classify 24 as AC-Low (upper boundary)', () => {
      expect(classifyAttentionBand(24).band).toBe('AC-Low');
    });

    it('should classify 25 as AC-Moderate (lower boundary)', () => {
      expect(classifyAttentionBand(25).band).toBe('AC-Moderate');
    });

    it('should classify 49 as AC-Moderate (upper boundary)', () => {
      expect(classifyAttentionBand(49).band).toBe('AC-Moderate');
    });

    it('should classify 50 as AC-High (lower boundary)', () => {
      expect(classifyAttentionBand(50).band).toBe('AC-High');
    });

    it('should classify 74 as AC-High (upper boundary)', () => {
      expect(classifyAttentionBand(74).band).toBe('AC-High');
    });

    it('should classify 75 as AC-Strong (lower boundary)', () => {
      expect(classifyAttentionBand(75).band).toBe('AC-Strong');
    });

    it('should classify 100 as AC-Strong (upper boundary)', () => {
      expect(classifyAttentionBand(100).band).toBe('AC-Strong');
    });

    it('should include interpretation string for each band', () => {
      expect(classifyAttentionBand(10).interpretation).toBe('Weak organic attention, relies on paid channels');
      expect(classifyAttentionBand(30).interpretation).toBe('Some organic traction, not yet self-sustaining');
      expect(classifyAttentionBand(60).interpretation).toBe('Strong organic attention with durable signals');
      expect(classifyAttentionBand(80).interpretation).toBe('Self-sustaining attention with compounding effects');
    });

    it('should return both band and interpretation fields', () => {
      const result = classifyAttentionBand(50);
      expect(result).toHaveProperty('band');
      expect(result).toHaveProperty('interpretation');
    });
  });

  // ---------------------------------------------------------------
  // 3. Score clamping (negative and overflow values)
  // ---------------------------------------------------------------
  describe('score clamping', () => {
    it('should clamp negative component values to 0', () => {
      const components = {
        organic_search_momentum: -50,
        engagement_depth: -100,
        earned_media_ratio: -10,
        advocacy_signal: -20,
        return_engagement: -30,
      };
      // All clamped to 0
      expect(calculateAttentionCapitalScore(components)).toBe(0);
    });

    it('should clamp overflow component values to 100', () => {
      const components = {
        organic_search_momentum: 200,
        engagement_depth: 150,
        earned_media_ratio: 300,
        advocacy_signal: 500,
        return_engagement: 110,
      };
      // All clamped to 100 => score = 100
      expect(calculateAttentionCapitalScore(components)).toBe(100);
    });

    it('should clamp mixed negative and overflow values correctly', () => {
      const components = {
        organic_search_momentum: -10,  // clamped to 0
        engagement_depth: 200,         // clamped to 100
        earned_media_ratio: 50,        // stays 50
        advocacy_signal: -5,           // clamped to 0
        return_engagement: 150,        // clamped to 100
      };
      // 0*0.25 + 100*0.25 + 50*0.20 + 0*0.15 + 100*0.15
      // = 0 + 25 + 10 + 0 + 15 = 50
      expect(calculateAttentionCapitalScore(components)).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // 4. Default fallback on LLM error and malformed JSON
  // ---------------------------------------------------------------
  describe('default fallback on LLM error', () => {
    const mockPathOutput = {
      suggested_name: 'Test Venture',
      suggested_problem: 'Test problem',
      suggested_solution: 'Test solution',
      target_market: 'Test market',
    };

    const silentLogger = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    it('should return default result when LLM throws an error', async () => {
      const errorClient = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: errorClient,
        logger: silentLogger,
      });

      expect(result.component).toBe('attention_capital');
      expect(result.ac_score).toBe(0);
      expect(result.ac_band).toBe('AC-Unknown');
      expect(result.ac_interpretation).toBe('Analysis unavailable');
      expect(result.confidence).toBe(0);
      expect(result.summary).toContain('Analysis failed');
    });

    it('should return default result when LLM returns malformed JSON', async () => {
      const malformedClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: 'This is not JSON at all, just plain text with no braces' }],
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: malformedClient,
        logger: silentLogger,
      });

      expect(result.component).toBe('attention_capital');
      expect(result.ac_score).toBe(0);
      expect(result.ac_band).toBe('AC-Unknown');
    });

    it('should return default result when LLM returns empty content', async () => {
      const emptyClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: '' }],
            usage: { input_tokens: 50, output_tokens: 0 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: emptyClient,
        logger: silentLogger,
      });

      expect(result.component).toBe('attention_capital');
      expect(result.ac_score).toBe(0);
      expect(result.ac_band).toBe('AC-Unknown');
    });

    it('should preserve default component_scores structure on error', async () => {
      const errorClient = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('timeout')),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: errorClient,
        logger: silentLogger,
      });

      expect(result.component_scores).toEqual({
        organic_search_momentum: 0,
        engagement_depth: 0,
        earned_media_ratio: 0,
        advocacy_signal: 0,
        return_engagement: 0,
      });
    });
  });

  // ---------------------------------------------------------------
  // 5. analyzeAttentionCapital() happy path with mocked LLM client
  // ---------------------------------------------------------------
  describe('analyzeAttentionCapital happy path', () => {
    const mockPathOutput = {
      suggested_name: 'GreenEnergy Tracker',
      suggested_problem: 'Consumers lack visibility into their real-time energy consumption',
      suggested_solution: 'Smart dashboard with AI-driven energy recommendations',
      target_market: 'Environmentally conscious homeowners',
    };

    const silentLogger = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    const mockLLMResponse = {
      organic_search_momentum: 65,
      engagement_depth: 70,
      earned_media_ratio: 55,
      advocacy_signal: 60,
      return_engagement: 75,
      confidence: 0.8,
      confidence_caveat: 'Scores inferred from training data patterns',
      summary: 'Strong organic attention potential with good engagement depth and return patterns.',
    };

    it('should return correctly structured result on valid LLM response', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(mockLLMResponse) }],
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      expect(result.component).toBe('attention_capital');
      expect(typeof result.ac_score).toBe('number');
      expect(result.ac_score).toBeGreaterThan(0);
      expect(result.ac_score).toBeLessThanOrEqual(100);
      expect(typeof result.ac_band).toBe('string');
      expect(result.ac_band).toMatch(/^AC-(Low|Moderate|High|Strong)$/);
      expect(typeof result.ac_interpretation).toBe('string');
      expect(result.ac_interpretation.length).toBeGreaterThan(0);
    });

    it('should compute correct weighted score from LLM component scores', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(mockLLMResponse) }],
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      // 65*0.25 + 70*0.25 + 55*0.20 + 60*0.15 + 75*0.15
      // = 16.25 + 17.5 + 11 + 9 + 11.25 = 65
      expect(result.ac_score).toBe(65);
      expect(result.ac_band).toBe('AC-High');
    });

    it('should pass through confidence from LLM response', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(mockLLMResponse) }],
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      expect(result.confidence).toBe(0.8);
      expect(result.confidence_caveat).toBe('Scores inferred from training data patterns');
      expect(result.summary).toBe('Strong organic attention potential with good engagement depth and return patterns.');
    });

    it('should extract component_scores into result', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(mockLLMResponse) }],
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      expect(result.component_scores).toEqual({
        organic_search_momentum: 65,
        engagement_depth: 70,
        earned_media_ratio: 55,
        advocacy_signal: 60,
        return_engagement: 75,
      });
    });

    it('should include usage data from LLM response', async () => {
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify(mockLLMResponse) }],
            usage: { input_tokens: 500, output_tokens: 200 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      expect(result.usage).toBeDefined();
    });

    it('should call LLM with correct message structure', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(mockLLMResponse) }],
        usage: { input_tokens: 100, output_tokens: 200 },
      });
      const mockClient = { messages: { create: mockCreate } };

      await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs).toHaveProperty('model');
      expect(callArgs).toHaveProperty('max_tokens', 1500);
      expect(callArgs).toHaveProperty('messages');
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toContain('GreenEnergy Tracker');
      expect(callArgs.messages[0].content).toContain('Environmentally conscious homeowners');
    });

    it('should handle LLM response with JSON embedded in prose', async () => {
      const proseWrapped = `Here is my analysis:\n\n${JSON.stringify(mockLLMResponse)}\n\nI hope this helps.`;
      const mockClient = {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: proseWrapped }],
            usage: { input_tokens: 500, output_tokens: 300 },
          }),
        },
      };

      const result = await analyzeAttentionCapital(mockPathOutput, {
        llmClient: mockClient,
        logger: silentLogger,
      });

      // Should still extract the JSON and compute score
      expect(result.ac_score).toBe(65);
      expect(result.ac_band).toBe('AC-High');
    });
  });

  // ---------------------------------------------------------------
  // 6. Exported constants validation
  // ---------------------------------------------------------------
  describe('AC_WEIGHTS', () => {
    it('should have correct weight values', () => {
      expect(AC_WEIGHTS.organic_search_momentum).toBe(0.25);
      expect(AC_WEIGHTS.engagement_depth).toBe(0.25);
      expect(AC_WEIGHTS.earned_media_ratio).toBe(0.20);
      expect(AC_WEIGHTS.advocacy_signal).toBe(0.15);
      expect(AC_WEIGHTS.return_engagement).toBe(0.15);
    });

    it('should have weights that sum to 1.0', () => {
      const sum = Object.values(AC_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should have exactly 5 weight entries', () => {
      expect(Object.keys(AC_WEIGHTS)).toHaveLength(5);
    });
  });

  describe('ATTENTION_BANDS', () => {
    it('should define 4 bands', () => {
      expect(ATTENTION_BANDS).toHaveLength(4);
    });

    it('should cover full 0-100 range without gaps', () => {
      expect(ATTENTION_BANDS[0].min).toBe(0);
      expect(ATTENTION_BANDS[ATTENTION_BANDS.length - 1].max).toBe(100);

      for (let i = 1; i < ATTENTION_BANDS.length; i++) {
        expect(ATTENTION_BANDS[i].min).toBe(ATTENTION_BANDS[i - 1].max + 1);
      }
    });

    it('should have band names in expected order', () => {
      const names = ATTENTION_BANDS.map(b => b.band);
      expect(names).toEqual(['AC-Low', 'AC-Moderate', 'AC-High', 'AC-Strong']);
    });

    it('should have interpretation strings for all bands', () => {
      for (const band of ATTENTION_BANDS) {
        expect(typeof band.interpretation).toBe('string');
        expect(band.interpretation.length).toBeGreaterThan(0);
      }
    });
  });
});
