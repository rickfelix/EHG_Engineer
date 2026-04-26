/**
 * Stage 14 Per-Type Artifact Projections
 *
 * Carves the merged Stage 14 architecture+risk payload into the 4 sibling
 * typed artifacts required by lifecycle_stage_config.required_artifacts:
 * blueprint_data_model, blueprint_erd_diagram, blueprint_api_contract,
 * blueprint_schema_spec.
 *
 * Logic lifted verbatim from scripts/one-shot-recover-s14-lexiguard.mjs::buildProjections
 * (the production-tested LexiGuard recovery script). The 5th artifact
 * (blueprint_technical_architecture) is composed by the caller and remains
 * the legacy single-payload shape — see analyzeStage14 in
 * stage-14-technical-architecture.js.
 *
 * SD-LEO-INFRA-STAGE-PER-TYPE-001 (PRD FR-1).
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-14-projections
 */

import { ARTIFACT_TYPES } from '../../artifact-types.js';

/**
 * Project the merged Stage 14 architecture payload into 4 sibling typed artifacts.
 *
 * @param {Object} src - The merged architecture payload (the legacy
 *   blueprint_technical_architecture shape: architecture_summary, layers,
 *   security, dataEntities, integration_points, constraints).
 * @returns {Array<{artifactType: string, payload: Object, gaps: string[]}>}
 *   Exactly 4 entries, in deterministic order:
 *   blueprint_data_model, blueprint_erd_diagram, blueprint_api_contract,
 *   blueprint_schema_spec.
 */
export function projectStage14Artifacts(src) {
  const summary = src?.architecture_summary || '';
  const layersData = src?.layers?.data || null;
  const layersApi = src?.layers?.api || null;
  const dataEntities = Array.isArray(src?.dataEntities) ? src.dataEntities : [];
  const integrationPoints = Array.isArray(src?.integration_points) ? src.integration_points : [];
  const constraints = Array.isArray(src?.constraints) ? src.constraints : [];
  const security = src?.security || null;

  // Case-insensitive substring match on category field
  const constraintsByCategoryContains = (needle) =>
    constraints.filter(c => typeof c.category === 'string'
      && c.category.toLowerCase().includes(needle.toLowerCase()));
  const constraintsByCategoryIn = (needles) =>
    constraints.filter(c => typeof c.category === 'string'
      && needles.some(n => c.category.toLowerCase().includes(n.toLowerCase())));

  // Derive directed edges from dataEntities[].relationships strings
  const derivedRelationships = [];
  const seen = new Set();
  for (const e of dataEntities) {
    if (!e?.name || !Array.isArray(e.relationships)) continue;
    for (const target of e.relationships) {
      if (typeof target !== 'string' || !target) continue;
      const k = `${e.name}->${target}`;
      if (seen.has(k)) continue;
      seen.add(k);
      derivedRelationships.push({
        from: e.name,
        to: target,
        cardinality: null,
        relationship_type: 'reference',
        source: 'derived_from_dataEntities[].relationships',
      });
    }
  }

  // ── blueprint_data_model ──
  const constraintsDataMatch = constraintsByCategoryContains('data');
  const dataModel = {
    artifactType: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
    summary,
    data_layer: layersData,
    entities: dataEntities,
    constraints_data: constraintsDataMatch,
  };
  const dataModelGaps = [];
  if (!layersData) dataModelGaps.push('source.layers.data missing');
  if (dataEntities.length === 0) dataModelGaps.push('source.dataEntities empty');
  if (constraintsDataMatch.length === 0) {
    dataModelGaps.push('no constraints with category containing "data"');
  }
  dataModelGaps.push('source has no top-level "entities" key — used "dataEntities" instead');

  // ── blueprint_erd_diagram ──
  const erd = {
    artifactType: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
    summary: 'ERD projection from technical architecture',
    entities: dataEntities,
    relationships: derivedRelationships,
    diagram_format: 'logical_only',
  };
  const erdGaps = [
    'derived from dataEntities[].relationships strings (no cardinality)',
    'no visual ERD bytes — diagram_format=logical_only',
  ];
  if (dataEntities.length === 0) erdGaps.push('source.dataEntities empty');

  // ── blueprint_api_contract ──
  const apiContract = {
    artifactType: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
    summary: 'API contract projection from technical architecture',
    api_layer: layersApi,
    endpoints: Array.isArray(layersApi?.components) ? layersApi.components : [],
    integration_points: integrationPoints,
  };
  const apiGaps = [
    'endpoints lifted from layers.api.components (route groups, not OpenAPI ops)',
  ];
  if (!layersApi) apiGaps.push('source.layers.api missing');
  if (integrationPoints.length === 0) apiGaps.push('source.integration_points empty');

  // ── blueprint_schema_spec ──
  const constraintsSecCompliance = constraintsByCategoryIn(['security', 'compliance']);
  const schemaSpec = {
    artifactType: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
    summary: 'Schema specification projection from technical architecture',
    data_layer: layersData,
    entities: dataEntities,
    schema_format: 'structural',
    constraints: constraintsSecCompliance,
    security_context: security,
  };
  const schemaGaps = [
    'assembled from layers.data + dataEntities + filtered constraints (no DDL)',
    'schema_format=structural — no column types',
  ];
  if (!layersData) schemaGaps.push('source.layers.data missing');
  if (dataEntities.length === 0) schemaGaps.push('source.dataEntities empty');

  return [
    { artifactType: ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL, payload: dataModel, gaps: dataModelGaps },
    { artifactType: ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM, payload: erd, gaps: erdGaps },
    { artifactType: ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT, payload: apiContract, gaps: apiGaps },
    { artifactType: ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC, payload: schemaSpec, gaps: schemaGaps },
  ];
}
