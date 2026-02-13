/**
 * Tests for lib/skills/context-matcher.js
 * SD-EVA-FEAT-SKILL-PACKAGING-001
 */
import { describe, it, expect } from 'vitest';
import { scoreSkillRelevance, selectSkills, formatSkillsForInjection } from '../../../lib/skills/context-matcher.js';

const makeSkill = (overrides = {}) => ({
  name: 'test-skill',
  version: '1.0.0',
  triggers: ['schema', 'table', 'column'],
  contextKeywords: ['database', 'infrastructure'],
  agentScope: ['DATABASE'],
  content: '# Test Skill\nSome content here.',
  ...overrides
});

describe('scoreSkillRelevance', () => {
  it('scores high for exact trigger + context + scope match', () => {
    const skill = makeSkill();
    const context = { keywords: ['schema', 'database'], agentCode: 'DATABASE', tools: [] };
    const score = scoreSkillRelevance(skill, context);
    expect(score).toBeGreaterThanOrEqual(40);
  });

  it('scores trigger matches proportionally', () => {
    const skill = makeSkill({ triggers: ['schema', 'table', 'column', 'index'] });
    // 1 out of 4 triggers match
    const score1 = scoreSkillRelevance(skill, { keywords: ['schema'], agentCode: '', tools: [] });
    // 3 out of 4 triggers match
    const score3 = scoreSkillRelevance(skill, { keywords: ['schema', 'table', 'column'], agentCode: '', tools: [] });
    expect(score3).toBeGreaterThan(score1);
  });

  it('gives agent scope bonus when code matches', () => {
    const skill = makeSkill({ agentScope: ['DATABASE'] });
    const withScope = scoreSkillRelevance(skill, { keywords: ['schema'], agentCode: 'DATABASE', tools: [] });
    const withoutScope = scoreSkillRelevance(skill, { keywords: ['schema'], agentCode: 'API', tools: [] });
    expect(withScope).toBeGreaterThan(withoutScope);
  });

  it('gives partial bonus for universal skills (no scope)', () => {
    const skill = makeSkill({ agentScope: [] });
    const score = scoreSkillRelevance(skill, { keywords: ['schema'], agentCode: 'DATABASE', tools: [] });
    expect(score).toBeGreaterThan(0);
  });

  it('returns 0 for no matches at all', () => {
    const skill = makeSkill({ triggers: ['react', 'vue', 'angular'], contextKeywords: ['frontend'], agentScope: ['DESIGN'] });
    const score = scoreSkillRelevance(skill, { keywords: ['database', 'migration'], agentCode: 'DATABASE', tools: [] });
    expect(score).toBe(0);
  });

  it('handles partial keyword matching (substring)', () => {
    const skill = makeSkill({ triggers: ['schema'] });
    const score = scoreSkillRelevance(skill, { keywords: ['schema change'], agentCode: '', tools: [] });
    expect(score).toBeGreaterThan(0);
  });
});

describe('selectSkills', () => {
  it('selects skills above threshold', () => {
    const skills = [
      makeSkill({ name: 'db-skill', triggers: ['schema', 'table'], agentScope: ['DATABASE'] }),
      makeSkill({ name: 'ui-skill', triggers: ['react', 'component'], contextKeywords: ['frontend'], agentScope: ['DESIGN'] })
    ];
    const context = { keywords: ['schema', 'database'], agentCode: 'DATABASE', tools: [] };
    const result = selectSkills(skills, context, { threshold: 20 });
    expect(result.length).toBe(1);
    expect(result[0].skill.name).toBe('db-skill');
  });

  it('sorts by score descending', () => {
    const skills = [
      makeSkill({ name: 'low', triggers: ['schema'], contextKeywords: [], agentScope: [] }),
      makeSkill({ name: 'high', triggers: ['schema', 'table'], contextKeywords: ['database'], agentScope: ['DATABASE'] })
    ];
    const context = { keywords: ['schema', 'table', 'database'], agentCode: 'DATABASE', tools: [] };
    const result = selectSkills(skills, context, { threshold: 1 });
    expect(result[0].skill.name).toBe('high');
  });

  it('respects maxSkills limit', () => {
    const skills = Array.from({ length: 20 }, (_, i) =>
      makeSkill({ name: `skill-${i}`, triggers: ['schema'] })
    );
    const context = { keywords: ['schema'], agentCode: 'DATABASE', tools: [] };
    const result = selectSkills(skills, context, { threshold: 1, maxSkills: 3 });
    expect(result.length).toBe(3);
  });

  it('filters out skills with no content', () => {
    const skills = [makeSkill({ content: '' })];
    const context = { keywords: ['schema'], agentCode: 'DATABASE', tools: [] };
    const result = selectSkills(skills, context, { threshold: 1 });
    expect(result.length).toBe(0);
  });
});

describe('formatSkillsForInjection', () => {
  it('formats skills with header and sections', () => {
    const scored = [{ skill: makeSkill({ name: 'my-skill', version: '2.0.0' }), score: 80 }];
    const result = formatSkillsForInjection(scored);
    expect(result.injectedContent).toContain('## Injected Skills');
    expect(result.injectedContent).toContain('### Skill: my-skill (v2.0.0)');
    expect(result.skillCount).toBe(1);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('returns empty for no skills', () => {
    const result = formatSkillsForInjection([]);
    expect(result.injectedContent).toBe('');
    expect(result.skillCount).toBe(0);
  });

  it('respects token budget', () => {
    const longContent = 'x'.repeat(5000);
    const scored = [
      { skill: makeSkill({ name: 's1', content: longContent }), score: 90 },
      { skill: makeSkill({ name: 's2', content: longContent }), score: 80 }
    ];
    // With a very small budget, should only fit 1 skill
    const result = formatSkillsForInjection(scored, 1500);
    expect(result.skillCount).toBe(1);
  });
});
