/**
 * Blueprint Coordinator
 *
 * Orchestrates blueprint agent execution in dependency order.
 * No LLM calls — pure orchestration logic with topological sort.
 *
 * @module lib/eva/blueprint-coordinator
 */

import { agentRegistry, ARTIFACT_TYPES, getAgent } from './blueprint-agents/index.js';

/**
 * Topological sort of artifact types respecting agent dependencies.
 * Uses Kahn's algorithm (BFS-based) for deterministic ordering.
 *
 * @returns {string[]} Artifact types in valid execution order
 * @throws {Error} If a dependency cycle is detected
 */
export function resolveExecutionOrder() {
  const inDegree = new Map();
  const adjacency = new Map(); // dependency -> dependents

  for (const type of ARTIFACT_TYPES) {
    inDegree.set(type, 0);
    adjacency.set(type, []);
  }

  for (const [type, agent] of agentRegistry) {
    for (const dep of agent.dependencies) {
      if (!agentRegistry.has(dep)) {
        throw new Error(`Agent "${type}" depends on unknown artifact type "${dep}"`);
      }
      adjacency.get(dep).push(type);
      inDegree.set(type, inDegree.get(type) + 1);
    }
  }

  const queue = [];
  for (const [type, degree] of inDegree) {
    if (degree === 0) queue.push(type);
  }

  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    for (const dependent of adjacency.get(current)) {
      const newDegree = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  if (sorted.length !== ARTIFACT_TYPES.length) {
    throw new Error('Dependency cycle detected in blueprint agents');
  }

  return sorted;
}

/**
 * Orchestrate blueprint agent execution in dependency order.
 *
 * @param {Object} ventureData - Venture brief and context
 * @param {Object} [options]
 * @param {Function} [options.executeAgent] - async (agent, context) => result. If omitted, returns the execution plan.
 * @returns {Promise<Map<string, any>>} Results keyed by artifact_type
 */
export async function orchestrate(ventureData, options = {}) {
  const { executeAgent } = options;
  const order = resolveExecutionOrder();
  const results = new Map();

  for (const artifactType of order) {
    const agent = getAgent(artifactType);
    const upstreamContext = {};
    for (const dep of agent.dependencies) {
      upstreamContext[dep] = results.get(dep);
    }

    const context = { ventureData, upstream: upstreamContext };

    if (executeAgent) {
      results.set(artifactType, await executeAgent(agent, context));
    } else {
      results.set(artifactType, { planned: true, dependencies: agent.dependencies });
    }
  }

  return results;
}

/**
 * Returns the agent registry for external inspection.
 *
 * @returns {Map<string, Object>}
 */
export function getAgentRegistry() {
  return agentRegistry;
}
