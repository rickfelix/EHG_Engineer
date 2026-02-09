/**
 * Deterministic Token Estimator
 * Pure function for token estimation - environment-independent
 *
 * Uses conservative heuristic: ~4 chars per token (Claude-family models)
 * Deterministic: same input always produces same output
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (TR-3)
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for a text string
 * Deterministic pure function - no external dependencies
 *
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Priority levels for token budget allocation
 * Lower number = higher priority (kept first during truncation)
 */
export const PRIORITY = {
  SAFETY: 0,        // P0: Safety/operating rules - never truncated
  ISSUE_PATTERNS: 1, // P1: Known issues and proven solutions
  RETROSPECTIVES: 2, // P2: Learnings from past work
  SKILLS: 3,         // P3: Agent capabilities and patterns
  FORMATTING: 4      // P4: Formatting/boilerplate - truncated first
};

/**
 * Allocate token budget across priority sections
 * Higher priority sections get their full allocation first
 *
 * @param {Array<{priority: number, content: string, source: string}>} sections
 * @param {number} maxTokens - Total token budget
 * @returns {{sections: Array<{priority: number, content: string, source: string, tokens: number, truncated: boolean}>, truncationEvents: Array, totalTokens: number}}
 */
export function allocateTokenBudget(sections, maxTokens) {
  const truncationEvents = [];
  let totalTokens = 0;

  // Sort by priority (lowest number = highest priority)
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);

  const allocated = sorted.map(section => {
    const tokens = estimateTokens(section.content);

    if (totalTokens + tokens <= maxTokens) {
      // Fits within budget
      totalTokens += tokens;
      return { ...section, tokens, truncated: false };
    }

    // Need to truncate
    const remaining = Math.max(0, maxTokens - totalTokens);

    if (remaining === 0) {
      // No budget left - drop entirely
      truncationEvents.push({
        source: section.source,
        priority: section.priority,
        action: 'dropped',
        originalTokens: tokens,
        keptTokens: 0
      });
      return { ...section, content: '', tokens: 0, truncated: true };
    }

    // Partial truncation - keep what fits
    const keepChars = remaining * CHARS_PER_TOKEN;
    const truncatedContent = section.content.substring(0, keepChars);
    totalTokens += remaining;

    truncationEvents.push({
      source: section.source,
      priority: section.priority,
      action: 'truncated',
      originalTokens: tokens,
      keptTokens: remaining
    });

    return { ...section, content: truncatedContent, tokens: remaining, truncated: true };
  });

  return { sections: allocated, truncationEvents, totalTokens };
}

/**
 * Truncate items within a section by rank (lowest ranked dropped first)
 *
 * @param {Array<{content: string, rank?: number}>} items - Items sorted by rank (highest first)
 * @param {number} maxTokens - Token budget for this section
 * @returns {{kept: Array, dropped: Array, totalTokens: number}}
 */
export function truncateByRank(items, maxTokens) {
  let totalTokens = 0;
  const kept = [];
  const dropped = [];

  for (const item of items) {
    const tokens = estimateTokens(item.content || JSON.stringify(item));
    if (totalTokens + tokens <= maxTokens) {
      totalTokens += tokens;
      kept.push(item);
    } else {
      dropped.push(item);
    }
  }

  return { kept, dropped, totalTokens };
}
