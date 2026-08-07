/**
 * Tests for LLM Story Generator
 * SD-LEO-ENH-LLM-POWERED-USER-001: LLM-powered user story generation
 *
 * @module llm-story-generator.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMStoryGenerator,
  createLLMStoryGenerator,
  isLLMAvailable
} from './llm-story-generator.js';

/**
 * SD-LEO-INFRA-USER-STORY-QUALITY-001 (FR-6) — REMOVED: a vi.mock of '@anthropic-ai/sdk'.
 *
 * *** THAT MOCK BOUND TO NOTHING FOR 172 DAYS AND IT IS WHY THE BUG SURVIVED. ***
 * The production module stopped importing @anthropic-ai/sdk when it moved onto the client factory
 * (commit 6c88cf30e30, 2026-02-10). From that moment the mock intercepted a package this file's
 * subject never loads, so it shaped nothing — while still LOOKING like the network path was under
 * test. Worse, the mock provided a `.messages.create`, so anyone reading it would reasonably
 * conclude that call shape was exercised and valid. It was neither: the real factory client has no
 * `.messages`, which is exactly the defect this SD fixes.
 *
 * Nothing replaces it here, because no test in this file reaches the network path at all. The tests
 * that DO drive it — with a client carrying the real adapter surface — live in
 * tests/unit/stories/llm-path-executes.test.js. Leaving a mock behind that implies otherwise would
 * re-create the illusion this SD exists to remove.
 */

describe('LLMStoryGenerator', () => {
  let generator;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-api-key';
    generator = new LLMStoryGenerator();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalEnv;
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('returns true when API key is set', () => {
      expect(generator.isEnabled()).toBe(true);
    });

    it('stays enabled regardless of env — the FACTORY owns availability, not this class', () => {
      /**
       * SD-LEO-INFRA-USER-STORY-QUALITY-001: this case used to assert isEnabled() === false with no
       * API key, and it has been failing since the class moved onto the client factory. `enabled` is
       * now hardcoded true ("Factory handles availability"), so NO env change can make it false —
       * it was asserting a contract the code deliberately abandoned, which is why it sat quarantined
       * rather than being fixed.
       *
       * Pinning the CURRENT contract instead of deleting the case, so a change that reintroduces
       * env-sensitivity here has to update this deliberately rather than silently.
       */
      delete process.env.OPENAI_API_KEY;
      delete process.env.USE_LOCAL_LLM;
      const noKeyGenerator = new LLMStoryGenerator();
      expect(noKeyGenerator.isEnabled()).toBe(true);
    });
  });

  describe('buildStoryGenerationPrompt', () => {
    it('builds prompt with PRD context', () => {
      const criteria = ['Create user login', 'View dashboard'];
      const prd = {
        title: 'User Auth Feature',
        executive_summary: 'Authentication system for users',
        target_application: 'EHG Platform'
      };

      const prompt = generator.buildStoryGenerationPrompt(criteria, prd);

      expect(prompt).toContain('User Auth Feature');
      expect(prompt).toContain('Authentication system for users');
      expect(prompt).toContain('EHG Platform');
      expect(prompt).toContain('1. Create user login');
      expect(prompt).toContain('2. View dashboard');
      expect(prompt).toContain('Given-When-Then');
    });

    it('handles missing PRD gracefully', () => {
      const criteria = ['Test criterion'];
      const prompt = generator.buildStoryGenerationPrompt(criteria, null);

      expect(prompt).toContain('No PRD context available');
      expect(prompt).toContain('Test criterion');
    });
  });

  describe('buildSingleStoryPrompt', () => {
    it('builds prompt for single criterion', () => {
      const criterion = 'View portfolio performance';
      const prd = { title: 'Portfolio Dashboard' };

      const prompt = generator.buildSingleStoryPrompt(criterion, prd, 0);

      expect(prompt).toContain('View portfolio performance');
      expect(prompt).toContain('Portfolio Dashboard');
      expect(prompt).toContain('JSON');
    });
  });

  describe('buildGapDetectionPrompt', () => {
    it('includes gap categories', () => {
      const criteria = ['Create report'];
      const prd = { title: 'Reporting', executive_summary: 'Reports system' };

      const prompt = generator.buildGapDetectionPrompt(criteria, prd);

      expect(prompt).toContain('Error Handling');
      expect(prompt).toContain('Edge Cases');
      expect(prompt).toContain('Performance');
      expect(prompt).toContain('Security');
      expect(prompt).toContain('Accessibility');
    });
  });

  describe('parseStoryResponse', () => {
    it('parses valid JSON response', () => {
      const response = `{
        "stories": [
          {
            "criterion_index": 0,
            "title": "Login Feature",
            "user_role": "Platform User",
            "user_want": "log in securely",
            "user_benefit": "access my account",
            "acceptance_criteria": [{"scenario": "Happy path", "given": "user exists", "when": "credentials entered", "then": "logged in"}],
            "story_points": 3
          }
        ],
        "gaps": [
          {"type": "security", "description": "MFA not specified", "recommendation": "Add MFA requirement"}
        ]
      }`;

      const result = generator.parseStoryResponse(response, ['Create login'], 'SD-TEST-001');

      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].title).toBe('Login Feature');
      expect(result.stories[0].generated_by).toBe('LLM');
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].type).toBe('security');
    });

    it('parses JSON in markdown code block', () => {
      const response = '```json\n{"stories": [{"title": "Test"}], "gaps": []}\n```';

      const result = generator.parseStoryResponse(response, ['Test'], 'SD-TEST-001');

      expect(result.stories).toHaveLength(1);
      expect(result.stories[0].title).toBe('Test');
    });

    it('returns empty arrays for invalid JSON', () => {
      const response = 'Invalid response with no JSON';

      const result = generator.parseStoryResponse(response, ['Test'], 'SD-TEST-001');

      expect(result.stories).toHaveLength(0);
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('parseSingleStoryResponse', () => {
    it('parses single story JSON', () => {
      const response = `{
        "title": "View Reports",
        "user_role": "Business Analyst",
        "user_want": "view comprehensive reports",
        "user_benefit": "make data-driven decisions",
        "acceptance_criteria": [],
        "story_points": 5
      }`;

      const result = generator.parseSingleStoryResponse(response, 'View reports', 0);

      expect(result.title).toBe('View Reports');
      expect(result.user_role).toBe('Business Analyst');
      expect(result.generated_by).toBe('LLM');
      expect(result.criterion_index).toBe(0);
    });

    it('returns null for invalid JSON', () => {
      const result = generator.parseSingleStoryResponse('not json', 'Test', 0);
      expect(result).toBeNull();
    });
  });

  describe('parseGapResponse', () => {
    it('parses gap array', () => {
      const response = `[
        {"type": "error_handling", "description": "No error handling", "recommendation": "Add try-catch", "severity": "high"},
        {"type": "edge_case", "description": "Empty state not handled", "recommendation": "Add empty state UI", "severity": "medium"}
      ]`;

      const result = generator.parseGapResponse(response);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('error_handling');
      expect(result[1].severity).toBe('medium');
    });

    it('returns empty array for invalid JSON', () => {
      const result = generator.parseGapResponse('not json');
      expect(result).toHaveLength(0);
    });
  });
});

describe('Factory Functions', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalEnv;
  });

  describe('createLLMStoryGenerator', () => {
    it('creates generator instance', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const generator = createLLMStoryGenerator();
      expect(generator).toBeInstanceOf(LLMStoryGenerator);
    });

    it('accepts custom options', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const generator = createLLMStoryGenerator({ model: 'custom-model' });
      expect(generator.model).toBe('custom-model');
    });
  });

  describe('isLLMAvailable', () => {
    it('returns true when API key is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      expect(isLLMAvailable()).toBe(true);
    });

    it('returns false when API key is not set', () => {
      delete process.env.OPENAI_API_KEY;
      // SD-LEO-INFRA-USER-STORY-QUALITY-001: isLLMAvailable() is OPENAI_API_KEY || USE_LOCAL_LLM.
      // Deleting one enabler left the other set from ambient env, so this asserted a state it had

      // not actually created — the test was stale, not the code.
      delete process.env.USE_LOCAL_LLM;
      expect(isLLMAvailable()).toBe(false);
    });
  });
});
