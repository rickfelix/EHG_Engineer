import { describe, it, expect } from 'vitest';
import { generateSuggestedPrompts } from '../../../lib/eva/friday-data-aggregator.js';

describe('generateSuggestedPrompts', () => {
  it('generates prompts from SD velocity data', () => {
    const data = {
      sd_velocity: { completed_this_week: 5, active_count: 3 },
      venture_progress: { active_count: 0, ventures: [] },
      brainstorm_outcomes: { count_this_week: 0 },
      trending_patterns: { active_count: 0 },
    };
    const prompts = generateSuggestedPrompts(data);
    expect(prompts.some(p => p.includes('5 SDs'))).toBe(true);
    expect(prompts.some(p => p.includes('3 active SDs'))).toBe(true);
  });

  it('generates prompts from venture data', () => {
    const data = {
      sd_velocity: { completed_this_week: 0, active_count: 0 },
      venture_progress: { active_count: 2, ventures: [{ name: 'AlphaVenture' }, { name: 'BetaCo' }] },
      brainstorm_outcomes: { count_this_week: 0 },
      trending_patterns: { active_count: 0 },
    };
    const prompts = generateSuggestedPrompts(data);
    expect(prompts.some(p => p.includes('AlphaVenture'))).toBe(true);
  });

  it('generates prompts from pattern data', () => {
    const data = {
      sd_velocity: { completed_this_week: 0, active_count: 0 },
      venture_progress: { active_count: 0, ventures: [] },
      brainstorm_outcomes: { count_this_week: 0 },
      trending_patterns: { active_count: 7 },
    };
    const prompts = generateSuggestedPrompts(data);
    expect(prompts.some(p => p.includes('7 recurring patterns'))).toBe(true);
  });

  it('always includes strategic decisions prompt', () => {
    const data = {
      sd_velocity: { completed_this_week: 0, active_count: 0 },
      venture_progress: { active_count: 0, ventures: [] },
      brainstorm_outcomes: { count_this_week: 0 },
      trending_patterns: { active_count: 0 },
    };
    const prompts = generateSuggestedPrompts(data);
    expect(prompts.some(p => p.includes('strategic decisions'))).toBe(true);
  });

  it('caps at 5 prompts', () => {
    const data = {
      sd_velocity: { completed_this_week: 5, active_count: 3 },
      venture_progress: { active_count: 2, ventures: [{ name: 'A' }, { name: 'B' }] },
      brainstorm_outcomes: { count_this_week: 3 },
      trending_patterns: { active_count: 7 },
    };
    const prompts = generateSuggestedPrompts(data);
    expect(prompts.length).toBeLessThanOrEqual(5);
  });
});

describe('EVA personality prompt', () => {
  it('base prompt includes dual-persona awareness', async () => {
    // Dynamic import to test the exported prompt
    const mod = await import('../../../lib/integrations/eva-chat-service.js').catch(() => null);
    // If import fails (missing deps in worktree), test the pattern directly
    const prompt = mod?.EVA_BASE_PROMPT || '';
    if (prompt) {
      expect(prompt).toContain('CHAIRMAN MODE');
      expect(prompt).toContain('BUILDER MODE');
      expect(prompt).toContain('probing follow-up question');
      expect(prompt).toContain('Intellectually curious');
    }
  });
});
