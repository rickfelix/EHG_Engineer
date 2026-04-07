import { describe, it, expect } from 'vitest';
import { extractMultiArtifacts } from '../../../lib/eva/eva-orchestrator-helpers.js';

describe('extractMultiArtifacts', () => {
  const STAGE_ID = 14;

  it('splits markdown headings into separate artifacts', () => {
    const stageOutput = `## blueprint_data_model
Data model content here with entities and relationships.

## blueprint_api_contract
API contract with endpoints and schemas.

## blueprint_erd_diagram
ERD diagram description.`;

    const required = ['blueprint_data_model', 'blueprint_api_contract', 'blueprint_erd_diagram'];
    const result = extractMultiArtifacts(stageOutput, required, STAGE_ID);

    expect(result).toHaveLength(3);
    expect(result[0].artifactType).toBe('blueprint_data_model');
    expect(result[0].payload.extractedFrom).toBe('section');
    expect(result[1].artifactType).toBe('blueprint_api_contract');
    expect(result[2].artifactType).toBe('blueprint_erd_diagram');
  });

  it('falls back to JSON key matching when no markdown headings', () => {
    const stageOutput = {
      blueprint_data_model: { entities: ['user', 'venture'], relations: ['has_many'] },
      blueprint_api_contract: { endpoints: ['/api/ventures'], methods: ['GET', 'POST'] },
      blueprint_erd_diagram: { diagram: 'mermaid code here with enough content to pass' },
    };

    const required = ['blueprint_data_model', 'blueprint_api_contract', 'blueprint_erd_diagram'];
    const result = extractMultiArtifacts(stageOutput, required, STAGE_ID);

    expect(result).toHaveLength(3);
    expect(result[0].artifactType).toBe('blueprint_data_model');
    expect(result[0].payload.extractedFrom).toBe('json_key');
    expect(result[1].artifactType).toBe('blueprint_api_contract');
  });

  it('skips already-persisted artifact types (dedup)', () => {
    const stageOutput = `## blueprint_data_model
Data model content here.

## blueprint_api_contract
API contract content here.

## blueprint_erd_diagram
ERD content here.`;

    const required = ['blueprint_data_model', 'blueprint_api_contract', 'blueprint_erd_diagram'];
    const existing = ['blueprint_data_model', 'blueprint_erd_diagram'];
    const result = extractMultiArtifacts(stageOutput, required, STAGE_ID, existing);

    expect(result).toHaveLength(1);
    expect(result[0].artifactType).toBe('blueprint_api_contract');
  });
});
