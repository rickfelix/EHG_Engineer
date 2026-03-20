/**
 * CrossArtifactConsistencyChecker — Validates inter-artifact reference integrity.
 * Checks three reference pairs: endpoint↔wireframe, story↔API, entity↔ERD.
 *
 * @module lib/eva/blueprint-scoring/consistency-checker
 */

import { ARTIFACT_TYPES } from '../artifact-types.js';

/**
 * @typedef {Object} ConsistencyPenalty
 * @property {string} type - Reference pair type (endpoint_wireframe, story_api, entity_erd)
 * @property {string} source - Source artifact type
 * @property {string} target - Target artifact type
 * @property {string[]} orphaned - Items in source with no match in target
 * @property {number} penalty - Penalty points (0-100 scale contribution)
 */

/**
 * Check cross-artifact reference consistency for a set of artifacts.
 *
 * @param {Record<string, object>} artifacts - Map of artifactType → content
 * @returns {{ penalties: ConsistencyPenalty[], totalPenalty: number, checkedPairs: number }}
 */
export function checkConsistency(artifacts) {
  const penalties = [];

  // Check endpoint ↔ wireframe mapping
  const apiEndpoints = extractKeys(artifacts[ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT], ['endpoints', 'routes', 'paths']);
  const wireframeRefs = extractKeys(artifacts[ARTIFACT_TYPES.BLUEPRINT_LAUNCH_READINESS], ['screens', 'pages', 'views']);
  if (apiEndpoints.length > 0 || wireframeRefs.length > 0) {
    const orphaned = findOrphaned(apiEndpoints, wireframeRefs);
    if (orphaned.length > 0) {
      penalties.push({
        type: 'endpoint_wireframe',
        source: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
        target: ARTIFACT_TYPES.BLUEPRINT_LAUNCH_READINESS,
        orphaned,
        penalty: Math.min(orphaned.length * 5, 30),
      });
    }
  }

  // Check story ↔ API alignment
  const stories = extractKeys(artifacts[ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK], ['stories', 'epics', 'features']);
  if (stories.length > 0 && apiEndpoints.length > 0) {
    const coverage = stories.length > 0 && apiEndpoints.length > 0
      ? Math.min(stories.length, apiEndpoints.length) / Math.max(stories.length, apiEndpoints.length)
      : 1;
    if (coverage < 0.5) {
      penalties.push({
        type: 'story_api',
        source: ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK,
        target: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
        orphaned: [`Coverage ratio ${Math.round(coverage * 100)}% below 50% threshold`],
        penalty: Math.round((1 - coverage) * 20),
      });
    }
  }

  // Check entity ↔ ERD coverage
  const entities = extractKeys(artifacts[ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL], ['entities', 'tables', 'models']);
  const erdEntities = extractKeys(artifacts[ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM], ['entities', 'tables', 'erDiagram']);
  if (entities.length > 0 && erdEntities.length > 0) {
    const orphaned = findOrphaned(entities, erdEntities);
    if (orphaned.length > 0) {
      penalties.push({
        type: 'entity_erd',
        source: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
        target: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
        orphaned,
        penalty: Math.min(orphaned.length * 5, 25),
      });
    }
  }

  const totalPenalty = penalties.reduce((sum, p) => sum + p.penalty, 0);
  return { penalties, totalPenalty: Math.min(totalPenalty, 50), checkedPairs: 3 };
}

/** Extract keys from nested content by searching for known array/object field names. */
function extractKeys(content, fieldNames) {
  if (!content || typeof content !== 'object') return [];
  const keys = [];
  for (const name of fieldNames) {
    if (Array.isArray(content[name])) {
      keys.push(...content[name].map((item) =>
        typeof item === 'string' ? item : item.name || item.id || item.key || JSON.stringify(item).slice(0, 30)
      ));
    } else if (content[name] && typeof content[name] === 'object') {
      keys.push(...Object.keys(content[name]));
    }
  }
  // Search one level deeper if no matches at top level
  if (keys.length === 0) {
    for (const val of Object.values(content)) {
      if (typeof val === 'object' && val !== null) {
        for (const name of fieldNames) {
          if (Array.isArray(val[name])) keys.push(...val[name].map(String));
        }
      }
    }
  }
  return keys;
}

/** Find items in source that have no close match in target. */
function findOrphaned(sourceItems, targetItems) {
  const targetSet = new Set(targetItems.map((t) => t.toLowerCase()));
  return sourceItems.filter((s) => !targetSet.has(s.toLowerCase()));
}
