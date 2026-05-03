/**
 * Tests for auto-triage and assist-runner ai_triage_source values.
 *
 * Regression: chk_ai_triage_source_valid CHECK constraint on the feedback
 * table only allows 'llm' or 'rules' (or NULL). Previous writers used
 * 'auto-triage-llm' and 'assist-runner', which silently violated the
 * constraint and stranded ~194 untriaged rows. See CAPA-5.
 *
 * @module scripts/modules/inbox/auto-triage.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be declared before any import of the modules under test
// (vi.mock calls are hoisted). LLM client + supabase + dotenv are stubbed
// so importing the script does not exit() or open network sockets.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: () => ({ update: () => ({ eq: () => ({}) }) }) })),
}));

vi.mock('dotenv/config', () => ({}));

const llmCompleteMock = vi.fn();
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: () => ({ complete: llmCompleteMock }),
}));

// Force isMainModule to return false so the script doesn't auto-invoke run()
vi.mock('../../../lib/utils/is-main-module.js', () => ({
  isMainModule: () => false,
}));

// Provide minimal env so getSupabase()/getSupabaseClient() don't process.exit().
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const { classifyWithLLM, heuristicClassify, VALID_SOURCES } = await import('./auto-triage.js');
const { classifyItem, TRIAGE_SOURCE } = await import('./assist-runner.js');

describe('chk_ai_triage_source_valid compatibility', () => {
  it('VALID_SOURCES exports the constraint-allowed set', () => {
    expect(VALID_SOURCES).toEqual(['llm', 'rules']);
  });

  describe('auto-triage heuristicClassify', () => {
    it("returns source='rules' for category=ci_failure", () => {
      const r = heuristicClassify({ title: 'x', category: 'ci_failure' });
      expect(r.source).toBe('rules');
      expect(VALID_SOURCES).toContain(r.source);
    });

    it("returns source='rules' for title containing 'fail'", () => {
      const r = heuristicClassify({ title: 'build fail on main', category: '' });
      expect(r.source).toBe('rules');
    });

    it("returns source='rules' for default 'question' classification", () => {
      const r = heuristicClassify({ title: 'how does X work?', category: '' });
      expect(r.classification).toBe('question');
      expect(r.source).toBe('rules');
    });
  });

  describe('auto-triage classifyWithLLM', () => {
    beforeEach(() => llmCompleteMock.mockReset());

    it("returns source='llm' on parseable LLM output", async () => {
      llmCompleteMock.mockResolvedValueOnce('{"classification":"bug","confidence":0.9}');
      const r = await classifyWithLLM({ title: 't', description: 'd' });
      expect(r.classification).toBe('bug');
      expect(r.source).toBe('llm');
      expect(VALID_SOURCES).toContain(r.source);
    });

    it("returns source='rules' when LLM output has no JSON", async () => {
      llmCompleteMock.mockResolvedValueOnce('I refuse to classify');
      const r = await classifyWithLLM({ title: 't', description: 'd' });
      expect(r.classification).toBe('question');
      expect(r.source).toBe('rules');
    });

    it("returns source='rules' when LLM throws (heuristic fallback)", async () => {
      llmCompleteMock.mockRejectedValueOnce(new Error('API key not valid'));
      const r = await classifyWithLLM({ title: 'crash on save', category: '' });
      expect(r.classification).toBe('bug');
      expect(r.source).toBe('rules');
      expect(VALID_SOURCES).toContain(r.source);
    });
  });

  describe('assist-runner classifyItem', () => {
    it("always returns source='rules' (heuristic only)", async () => {
      expect(TRIAGE_SOURCE).toBe('rules');
      const r1 = await classifyItem({ title: 'broken thing', category: '' });
      const r2 = await classifyItem({ title: 'add new feature', category: '' });
      const r3 = await classifyItem({ title: '?', category: 'ci_failure' });
      for (const r of [r1, r2, r3]) {
        expect(r.source).toBe('rules');
        expect(VALID_SOURCES).toContain(r.source);
      }
    });
  });

  it('rejects the legacy invalid source values', () => {
    expect(VALID_SOURCES).not.toContain('auto-triage-llm');
    expect(VALID_SOURCES).not.toContain('assist-runner');
  });
});
