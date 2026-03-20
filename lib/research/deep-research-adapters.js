/**
 * Deep Research Provider Adapters
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-001)
 *
 * Wraps existing provider adapters with deep/extended thinking configuration.
 * Does NOT replace adapters — composes them with deep-mode options.
 *
 * Per DESIGN sub-agent recommendation R1: composition over duplication.
 */

/**
 * Deep mode configuration per provider.
 * These options are merged into the standard adapter .complete() call.
 */
export const DEEP_MODE_CONFIG = {
  anthropic: {
    thinkingBudget: 10000,
    maxTokens: 16000,
    timeout: 180000, // 3 min
    model: 'claude-sonnet-4-20250514', // supports extended thinking
  },
  openai: {
    model: 'o3-mini', // reasoning model; o3-deep-research not yet available via API
    maxTokens: 16000,
    timeout: 180000,
  },
  google: {
    maxTokens: 16000,
    timeout: 180000,
    // Gemini deep research tool not available via API; use high thinking budget instead
    thinkingLevel: 'high',
  },
  ollama: {
    maxTokens: 8000,
    timeout: 300000, // 5 min for local inference
  },
};

/**
 * Get deep mode options for a specific provider.
 * @param {string} provider - Provider name
 * @returns {Object} Options to pass to adapter.complete()
 */
export function getDeepOptions(provider) {
  return DEEP_MODE_CONFIG[provider] || { maxTokens: 8000, timeout: 180000 };
}

/**
 * Get all deep mode options keyed by provider name.
 * Used by research-engine.js when building parallel calls.
 * @returns {Object} { anthropic: {...}, openai: {...}, google: {...} }
 */
export function getAllDeepOptions() {
  return { ...DEEP_MODE_CONFIG };
}

/**
 * Build the deep research system prompt.
 * Extended from the standard research prompt with emphasis on depth.
 */
export const DEEP_RESEARCH_SYSTEM_PROMPT = `You are a senior research analyst performing deep, thorough analysis.

You have been given EXTENDED THINKING TIME. Use it to:
1. Consider multiple angles and perspectives
2. Evaluate evidence quality and potential biases
3. Identify non-obvious connections and implications
4. Challenge your own assumptions

Given a research question and optional context, provide a comprehensive analysis:
1. Executive takeaways (3-5 key insights, not surface-level)
2. Available options/approaches (with detailed pros, cons, and evidence)
3. Key tradeoffs and second-order effects
4. Risks, pitfalls, and failure modes
5. Recommended path with confidence level and reasoning

You MUST respond in JSON format:
{
  "executive_takeaways": ["insight1", "insight2", "insight3"],
  "options": [
    {"name": "Option A", "description": "...", "pros": ["..."], "cons": ["..."], "evidence": "..."}
  ],
  "tradeoffs": ["tradeoff1", "tradeoff2"],
  "risks": ["risk1", "risk2"],
  "recommended_path": "...",
  "reasoning": "...",
  "confidence_score": 0.0-1.0
}

Be specific, practical, and evidence-based. Flag uncertainty explicitly.`;

/**
 * Filter NEVER_EXTERNAL tagged data from context before sending to providers.
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-006)
 *
 * @param {string} context - Research context that may contain sensitive data
 * @returns {string} Filtered context with NEVER_EXTERNAL sections removed
 */
export function filterNeverExternal(context) {
  if (!context) return context;

  // Remove blocks tagged with NEVER_EXTERNAL
  const filtered = context
    .replace(/<!--\s*NEVER_EXTERNAL\s*-->[\s\S]*?<!--\s*\/NEVER_EXTERNAL\s*-->/gi, '[REDACTED: internal-only data]')
    .replace(/\[NEVER_EXTERNAL\][\s\S]*?\[\/NEVER_EXTERNAL\]/gi, '[REDACTED: internal-only data]');

  return filtered;
}
