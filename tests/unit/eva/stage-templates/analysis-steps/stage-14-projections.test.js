/**
 * Unit tests for projectStage14Artifacts (FR-1, FR-4 of SD-LEO-INFRA-STAGE-PER-TYPE-001).
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-14-projections.test
 */

import { describe, it, expect } from 'vitest';
import { projectStage14Artifacts } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-14-projections.js';
import { ARTIFACT_TYPES } from '../../../../../lib/eva/artifact-types.js';

const TYPES = [
  ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL,
  ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM,
  ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT,
  ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC,
];

function fullFidelityPayload() {
  return {
    architecture_summary: 'A full-stack architecture for the venture.',
    layers: {
      presentation: { technology: 'React', components: ['App', 'Header'], rationale: 'SPA' },
      api: { technology: 'REST', components: ['/users', '/orders'], rationale: 'Standard REST' },
      business_logic: { technology: 'Node.js', components: ['svc1'], rationale: 'JS unification' },
      data: { technology: 'PostgreSQL', components: ['users_table'], rationale: 'ACID' },
      infrastructure: { technology: 'AWS', components: ['ECS'], rationale: 'Managed' },
    },
    security: { authStrategy: 'JWT', dataClassification: 'internal', complianceRequirements: ['SOC2'] },
    dataEntities: [
      { name: 'User', description: 'App user', relationships: ['Order', 'Profile'], estimatedVolume: '1k/mo' },
      { name: 'Order', description: 'Purchase', relationships: ['User'], estimatedVolume: '500/mo' },
    ],
    integration_points: [
      { name: 'Auth', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' },
    ],
    constraints: [
      { name: 'Latency', description: 'p95 < 200ms', category: 'performance' },
      { name: 'Encryption', description: 'TLS 1.3', category: 'security' },
      { name: 'Audit', description: 'SOX compliance', category: 'compliance' },
      { name: 'Backups', description: 'Hourly', category: 'data_retention' },
    ],
  };
}

describe('projectStage14Artifacts', () => {
  it('case (a): full-fidelity input produces 4 projections with non-empty payloads', () => {
    const result = projectStage14Artifacts(fullFidelityPayload());
    expect(result).toHaveLength(4);
    expect(result.map(r => r.artifactType)).toEqual(TYPES);
    for (const entry of result) {
      expect(entry.payload).toBeTruthy();
      expect(typeof entry.payload).toBe('object');
      expect(Array.isArray(entry.gaps)).toBe(true);
    }
  });

  it('case (b): missing layers.data adds gap entries to data_model and schema_spec', () => {
    const src = fullFidelityPayload();
    src.layers.data = null;
    const result = projectStage14Artifacts(src);
    const dataModel = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL);
    const schemaSpec = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC);
    expect(dataModel.gaps.some(g => g.includes('layers.data'))).toBe(true);
    expect(schemaSpec.gaps.some(g => g.includes('layers.data'))).toBe(true);
  });

  it('case (c): missing layers.api adds gap entry to api_contract', () => {
    const src = fullFidelityPayload();
    src.layers.api = null;
    const result = projectStage14Artifacts(src);
    const apiContract = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT);
    expect(apiContract.gaps.some(g => g.includes('layers.api'))).toBe(true);
    expect(apiContract.payload.api_layer).toBeNull();
    expect(apiContract.payload.endpoints).toEqual([]);
  });

  it('case (d): empty dataEntities adds gaps to data_model, erd_diagram, schema_spec', () => {
    const src = fullFidelityPayload();
    src.dataEntities = [];
    const result = projectStage14Artifacts(src);
    const byType = Object.fromEntries(result.map(r => [r.artifactType, r]));
    expect(byType[ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL].gaps.some(g => g.includes('dataEntities'))).toBe(true);
    expect(byType[ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM].gaps.some(g => g.includes('dataEntities'))).toBe(true);
    expect(byType[ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC].gaps.some(g => g.includes('dataEntities'))).toBe(true);
    expect(byType[ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM].payload.relationships).toEqual([]);
  });

  it('case (e): constraints with category containing "data" end up only in data_model (not schema_spec)', () => {
    const src = fullFidelityPayload();
    const result = projectStage14Artifacts(src);
    const dataModel = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL);
    const schemaSpec = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC);
    const dataModelCategories = dataModel.payload.constraints_data.map(c => c.category);
    expect(dataModelCategories).toContain('data_retention');
    const schemaSpecCategories = schemaSpec.payload.constraints.map(c => c.category);
    expect(schemaSpecCategories).not.toContain('data_retention');
  });

  it('case (f): constraints with category "security"/"compliance" end up only in schema_spec (not data_model)', () => {
    const src = fullFidelityPayload();
    const result = projectStage14Artifacts(src);
    const dataModel = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL);
    const schemaSpec = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC);
    const schemaSpecCategories = schemaSpec.payload.constraints.map(c => c.category);
    expect(schemaSpecCategories).toEqual(expect.arrayContaining(['security', 'compliance']));
    const dataModelCategories = dataModel.payload.constraints_data.map(c => c.category);
    expect(dataModelCategories).not.toContain('security');
    expect(dataModelCategories).not.toContain('compliance');
  });

  it('case (g): derived relationships are directed edges with cardinality:null', () => {
    const result = projectStage14Artifacts(fullFidelityPayload());
    const erd = result.find(r => r.artifactType === ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM);
    expect(erd.payload.relationships.length).toBeGreaterThan(0);
    for (const rel of erd.payload.relationships) {
      expect(rel.from).toBeTruthy();
      expect(rel.to).toBeTruthy();
      expect(rel.cardinality).toBeNull();
      expect(rel.relationship_type).toBe('reference');
    }
    expect(erd.payload.relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'User', to: 'Order' }),
      expect.objectContaining({ from: 'User', to: 'Profile' }),
      expect.objectContaining({ from: 'Order', to: 'User' }),
    ]));
  });

  it('case (h): idempotent — calling twice on same input produces deep-equal results', () => {
    const src = fullFidelityPayload();
    const a = projectStage14Artifacts(src);
    const b = projectStage14Artifacts(src);
    expect(a).toEqual(b);
  });

  it('artifactType values come from ARTIFACT_TYPES constants (not hardcoded strings)', () => {
    const result = projectStage14Artifacts(fullFidelityPayload());
    expect(result[0].artifactType).toBe('blueprint_data_model');
    expect(result[1].artifactType).toBe('blueprint_erd_diagram');
    expect(result[2].artifactType).toBe('blueprint_api_contract');
    expect(result[3].artifactType).toBe('blueprint_schema_spec');
  });

  it('handles null/undefined input without throwing', () => {
    expect(() => projectStage14Artifacts(null)).not.toThrow();
    expect(() => projectStage14Artifacts(undefined)).not.toThrow();
    expect(() => projectStage14Artifacts({})).not.toThrow();
    const result = projectStage14Artifacts({});
    expect(result).toHaveLength(4);
  });
});
