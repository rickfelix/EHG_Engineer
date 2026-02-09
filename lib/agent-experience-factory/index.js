/**
 * Agent Experience Factory - Public API
 *
 * Dynamically assembles experienced agents at invocation time
 * by querying accumulated domain knowledge.
 *
 * Usage:
 *   import { compose, getFactory } from './agent-experience-factory/index.js';
 *
 *   // Quick API (uses singleton factory)
 *   const { promptPreamble, metadata } = await compose({
 *     agentCode: 'DATABASE',
 *     domain: 'database',
 *     sessionId: 'session-123',
 *     maxPromptTokens: 1200
 *   });
 *
 *   // Or get factory instance for custom config
 *   const factory = await getFactory({ cacheTtlMs: 60000 });
 *   const result = await factory.compose({ ... });
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A
 */

import { AgentExperienceFactory } from './factory.js';

export { AgentExperienceFactory } from './factory.js';
export { SessionKnowledgeCache } from './cache/session-knowledge-cache.js';
export { estimateTokens, allocateTokenBudget, PRIORITY } from './token/token-estimator.js';
export { BaseAdapter } from './adapters/base-adapter.js';
export { IssuePatternsAdapter } from './adapters/issue-patterns-adapter.js';
export { RetrospectivesAdapter } from './adapters/retrospectives-adapter.js';
export { SkillsAdapter } from './adapters/skills-adapter.js';

/** @type {AgentExperienceFactory|null} */
let _singleton = null;

/**
 * Get or create singleton factory instance
 * @param {Object} [options] - Factory options
 * @returns {Promise<AgentExperienceFactory>}
 */
export async function getFactory(options = {}) {
  if (!_singleton) {
    const { getSupabaseClient } = await import('../sub-agent-executor/supabase-client.js');
    const supabase = await getSupabaseClient();
    _singleton = new AgentExperienceFactory(supabase, options);
  }
  return _singleton;
}

/**
 * Compose experienced agent context (convenience wrapper)
 * Uses singleton factory with default config
 *
 * @param {Object} invocationContext - See AgentExperienceFactory.compose()
 * @returns {Promise<{promptPreamble: string, metadata: Object}>}
 */
export async function compose(invocationContext) {
  const factory = await getFactory();
  return factory.compose(invocationContext);
}

/**
 * Reset singleton (for testing)
 */
export function resetFactory() {
  _singleton = null;
}
