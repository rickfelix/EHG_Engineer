/**
 * Plugin System Entry Point
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
 *
 * Re-exports all plugin modules for convenient access.
 */

export { scanAnthropicRepos, ANTHROPIC_REPOS } from './anthropic-scanner.js';
export { evaluatePlugin, RELEVANCE_KEYWORDS, MAX_SCORE } from './fitness-rubric.js';
export { adaptPlugin, evaluateAndAdapt } from './plugin-adapter.js';
