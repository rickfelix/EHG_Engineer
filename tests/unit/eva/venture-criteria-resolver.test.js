/**
 * Unit tests for the venture criteria resolver.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 1 (FR-003 input side)
 */
import { describe, it, expect } from 'vitest';
import { deriveVentureCriteria, ARTIFACT_SIGNALS } from '../../../lib/eva/bridge/venture-criteria-resolver.js';
import { selectAgentManifest } from '../../../lib/eva/bridge/agent-panel-manifest.js';

// The real DataDistill S0-18 artifact_type set (subset relevant to the signals).
const DATADISTILL_ARTIFACT_TYPES = [
  'intake_venture_analysis', 'truth_idea_brief', 'truth_competitive_analysis',
  'engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas',
  'identity_persona_brand', 'identity_gtm_sales_strategy',
  'blueprint_product_roadmap', 'blueprint_data_model', 'blueprint_erd_diagram',
  'blueprint_schema_spec', 'blueprint_technical_architecture',
  'blueprint_wireframes', 'wireframe_screens', 'marketing_landing_hero',
];

const codes = (agents) => agents.map((a) => a.code);

describe('deriveVentureCriteria', () => {
  it('derives presence-based criteria from the real DataDistill artifact set', () => {
    const c = deriveVentureCriteria(DATADISTILL_ARTIFACT_TYPES);
    expect(c.touchesData).toBe(true);        // has blueprint_data_model
    expect(c.hasUI).toBe(true);              // has wireframe_screens
    expect(c.monetizationRelevant).toBe(true); // has engine_pricing_model
    expect(c.growthRelevant).toBe(true);     // has identity_gtm_sales_strategy
  });

  it('passes through classification opts (dataSensitive, archetype) that presence cannot establish', () => {
    const c = deriveVentureCriteria(DATADISTILL_ARTIFACT_TYPES, { dataSensitive: true, archetype: 'algorithm-core' });
    expect(c.dataSensitive).toBe(true);
    expect(c.archetype).toBe('algorithm-core');
  });

  it('defaults safely for an empty/sparse venture', () => {
    const c = deriveVentureCriteria([]);
    expect(c).toEqual({
      touchesData: false, hasUI: false, monetizationRelevant: false,
      growthRelevant: false, dataSensitive: false, archetype: 'crud',
    });
  });

  it('tolerates non-array input', () => {
    expect(() => deriveVentureCriteria(undefined)).not.toThrow();
    expect(deriveVentureCriteria(null).touchesData).toBe(false);
  });

  it('signal lists are non-empty and frozen (catalog integrity)', () => {
    for (const [k, list] of Object.entries(ARTIFACT_SIGNALS)) {
      expect(Array.isArray(list), k).toBe(true);
      expect(list.length, k).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(ARTIFACT_SIGNALS)).toBe(true);
  });
});

describe('resolver -> manifest composition (DataDistill end-to-end)', () => {
  it('a data-sensitive algorithm-core DataDistill build pulls the full relevant panel', () => {
    const criteria = deriveVentureCriteria(DATADISTILL_ARTIFACT_TYPES, { dataSensitive: true, archetype: 'algorithm-core' });
    const manifest = codes(selectAgentManifest(criteria));
    // architecture, schema, ui, security, compliance, algorithm, monetization, growth, acceptance
    expect(manifest).toEqual(expect.arrayContaining([
      'API', 'DATABASE', 'DESIGN', 'SECURITY', 'VENTURE_STACK', 'PERFORMANCE', 'PRICING', 'MARKETING', 'STORIES',
    ]));
  });
});
