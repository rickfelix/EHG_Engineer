/**
 * Context Matcher - Selects relevant skills based on task context
 * SD-EVA-FEAT-SKILL-PACKAGING-001
 *
 * Scores each skill against the current task context and returns
 * only skills above a relevance threshold.
 */

/**
 * Score how relevant a skill is to the given context
 * @param {object} skill - Parsed skill object
 * @param {object} context - { keywords: string[], agentCode: string, tools: string[] }
 * @returns {number} Score from 0-100
 */
export function scoreSkillRelevance(skill, context) {
  let score = 0;
  const contextKeywords = (context.keywords || []).map(k => k.toLowerCase());
  const agentCode = (context.agentCode || '').toUpperCase();

  // Trigger keyword matching (max 60 points)
  if (skill.triggers.length > 0 && contextKeywords.length > 0) {
    const triggerMatches = skill.triggers.filter(t =>
      contextKeywords.some(k => k.includes(t.toLowerCase()) || t.toLowerCase().includes(k))
    );
    const triggerRatio = triggerMatches.length / skill.triggers.length;
    score += Math.min(60, Math.round(triggerRatio * 60));
  }

  // Context keyword matching (max 20 points)
  if (skill.contextKeywords.length > 0 && contextKeywords.length > 0) {
    const contextMatches = skill.contextKeywords.filter(ck =>
      contextKeywords.some(k => k.includes(ck.toLowerCase()) || ck.toLowerCase().includes(k))
    );
    const contextRatio = contextMatches.length / skill.contextKeywords.length;
    score += Math.min(20, Math.round(contextRatio * 20));
  }

  // Agent scope matching (max 20 points)
  if (skill.agentScope.length === 0) {
    // No scope restriction = universal skill, partial bonus
    score += 10;
  } else if (agentCode && skill.agentScope.includes(agentCode)) {
    score += 20;
  }

  return Math.min(100, score);
}

/**
 * Select skills relevant to the given context
 * @param {object[]} skills - Array of parsed skill objects
 * @param {object} context - { keywords: string[], agentCode: string, tools: string[] }
 * @param {object} options - { threshold: number, maxSkills: number }
 * @returns {object[]} Sorted array of { skill, score } above threshold
 */
export function selectSkills(skills, context, options = {}) {
  const threshold = options.threshold ?? 20;
  const maxSkills = options.maxSkills ?? 10;

  const scored = skills
    .filter(s => s.content && s.triggers.length > 0)
    .map(skill => ({
      skill,
      score: scoreSkillRelevance(skill, context)
    }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills);

  return scored;
}

/**
 * Format selected skills for injection into agent prompt
 * @param {object[]} scoredSkills - Array of { skill, score } from selectSkills
 * @param {number} tokenBudget - Max approximate tokens for all skills combined
 * @returns {{ injectedContent: string, skillCount: number, totalBytes: number }}
 */
export function formatSkillsForInjection(scoredSkills, tokenBudget = 2000) {
  if (scoredSkills.length === 0) {
    return { injectedContent: '', skillCount: 0, totalBytes: 0 };
  }

  const approxCharsPerToken = 4;
  const maxChars = tokenBudget * approxCharsPerToken;
  let totalChars = 0;
  const sections = [];

  for (const { skill, score } of scoredSkills) {
    const section = `### Skill: ${skill.name} (v${skill.version})\n${skill.content}`;
    if (totalChars + section.length > maxChars) break;
    sections.push(section);
    totalChars += section.length;
  }

  const header = `## Injected Skills (${sections.length}/${scoredSkills.length} matched)\n`;
  const injectedContent = header + sections.join('\n\n');

  return {
    injectedContent,
    skillCount: sections.length,
    totalBytes: Buffer.byteLength(injectedContent, 'utf-8')
  };
}
