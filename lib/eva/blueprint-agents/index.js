/**
 * Blueprint Agent Registry
 *
 * Central registry mapping artifact types to their agent modules.
 * Provides lookup and enumeration of all blueprint agents.
 *
 * @module lib/eva/blueprint-agents
 */

import * as dataModel from './data-model.js';
import * as erdDiagram from './erd-diagram.js';
import * as technicalArchitecture from './technical-architecture.js';
import * as apiContract from './api-contract.js';
import * as schemaSpec from './schema-spec.js';
import * as userStoryPack from './user-story-pack.js';
import * as riskRegister from './risk-register.js';
import * as financialProjection from './financial-projection.js';
import * as launchReadiness from './launch-readiness.js';
import * as sprintPlan from './sprint-plan.js';
import * as promotionGate from './promotion-gate.js';

const agents = [
  dataModel,
  erdDiagram,
  technicalArchitecture,
  apiContract,
  schemaSpec,
  userStoryPack,
  riskRegister,
  financialProjection,
  launchReadiness,
  sprintPlan,
  promotionGate,
];

/** @type {Map<string, {systemPrompt: string, artifactType: string, dependencies: string[], description: string}>} */
export const agentRegistry = new Map(
  agents.map((agent) => [agent.artifactType, agent])
);

/** All 11 artifact type strings in declaration order */
export const ARTIFACT_TYPES = agents.map((a) => a.artifactType);

/**
 * Look up an agent module by artifact type.
 *
 * @param {string} artifactType - The artifact type key
 * @returns {{systemPrompt: string, artifactType: string, dependencies: string[], description: string} | undefined}
 */
export function getAgent(artifactType) {
  return agentRegistry.get(artifactType);
}
