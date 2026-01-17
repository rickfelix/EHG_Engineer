/**
 * Simplifier Module
 * Part of SD-LEO-001: /simplify Command for Automated Code Simplification
 *
 * Exports:
 * - SimplificationEngine: Core logic for applying database-driven rules
 * - Plugin bridge functions: Detection and delegation to official plugin
 */

export { SimplificationEngine, default as SimplificationEngineDefault } from './simplification-engine.js';
export { detectPlugin, delegateToPlugin, getPluginStatus } from './plugin-bridge.js';
