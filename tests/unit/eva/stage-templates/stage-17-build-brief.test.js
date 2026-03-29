/**
 * Tests for Stage 17 Build Brief Synthesis
 * SD-LEO-FEAT-STAGE-BUILD-BRIEF-001
 */
import { describe, it, expect } from 'vitest';
import { synthesizeBuildBrief } from '../../../../lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js';

const REQUIRED_ARTIFACTS = {
  1: 'truth_idea_brief',
  2: 'truth_ai_critique',
  3: 'truth_validation_decision',
  4: 'truth_competitive_analysis',
  5: 'truth_financial_model',
  6: 'engine_risk_matrix',
  7: 'engine_pricing_model',
  8: 'engine_business_model_canvas',
  9: 'engine_exit_strategy',
  10: 'identity_persona_brand',
  11: 'identity_naming_visual',
  12: 'identity_gtm_sales_strategy',
  13: 'blueprint_product_roadmap',
  14: 'blueprint_technical_architecture',
  15: 'blueprint_risk_register',
  16: 'blueprint_api_contract',
};

function makeArtifact(stage, type, data) {
  return { id: `art-${stage}`, lifecycle_stage: stage, artifact_type: type, is_current: true, metadata: {}, created_at: new Date().toISOString(), artifact_data: data };
}

describe('synthesizeBuildBrief', () => {
  it('returns all 12 sections with full artifact data', () => {
    const artifactsByStage = {
      1: [makeArtifact(1, 'truth_idea_brief', { problemStatement: 'Users cannot find parking', valueProp: 'AI parking finder' })],
      4: [makeArtifact(4, 'truth_competitive_analysis', { competitors: [{ name: 'ParkMe' }, { name: 'SpotHero' }] })],
      5: [makeArtifact(5, 'truth_financial_model', { unitEconomics: '$5/user/mo', decision: 'GO' })],
      6: [makeArtifact(6, 'engine_risk_matrix', { highest_risk_factor: 'Regulatory', aggregate_risk_score: 3.2 })],
      7: [makeArtifact(7, 'engine_pricing_model', { rationale: 'Freemium with premium tier', tiers: ['Free', 'Pro'] })],
      8: [makeArtifact(8, 'engine_business_model_canvas', { valuePropositions: ['Real-time parking availability'], revenueStreams: ['Subscriptions'] })],
      10: [makeArtifact(10, 'identity_persona_brand', { customerPersonas: [{ name: 'Urban commuter' }], brandPersonality: 'Reliable' })],
      11: [makeArtifact(11, 'identity_naming_visual', { visualIdentity: 'Clean blue theme', brandExpression: 'Trust and speed' })],
      12: [makeArtifact(12, 'identity_gtm_sales_strategy', { channels: ['App stores', 'Social media'], salesModel: 'Self-serve' })],
      13: [makeArtifact(13, 'blueprint_product_roadmap', { vision_statement: 'Eliminate parking frustration', milestones: [{ name: 'MVP' }] })],
      14: [makeArtifact(14, 'blueprint_technical_architecture', { architecture_summary: 'React + Node + Postgres', layers: { frontend: {}, backend: {} } })],
      15: [makeArtifact(15, 'blueprint_risk_register', { risks: [{ risk: 'Scale issue' }], wireframes: [{ screen: 'Home' }] })],
    };

    const brief = synthesizeBuildBrief(artifactsByStage, REQUIRED_ARTIFACTS);

    expect(brief).toHaveProperty('problem_and_value');
    expect(brief).toHaveProperty('competitive_edge');
    expect(brief).toHaveProperty('financial_model');
    expect(brief).toHaveProperty('risk_matrix');
    expect(brief).toHaveProperty('pricing_strategy');
    expect(brief).toHaveProperty('business_model');
    expect(brief).toHaveProperty('customer_personas');
    expect(brief).toHaveProperty('brand_identity');
    expect(brief).toHaveProperty('gtm_strategy');
    expect(brief).toHaveProperty('product_roadmap');
    expect(brief).toHaveProperty('architecture');
    expect(brief).toHaveProperty('srip');

    // All 12 sections should be populated
    const populated = Object.values(brief).filter(v => v.length > 0);
    expect(populated.length).toBe(12);

    expect(brief.problem_and_value).toContain('parking');
    expect(brief.business_model).toContain('Real-time parking');
    expect(brief.product_roadmap).toContain('parking frustration');
  });

  it('returns empty strings for missing stages', () => {
    const artifactsByStage = {
      1: [makeArtifact(1, 'truth_idea_brief', { problemStatement: 'Need faster delivery' })],
      8: [makeArtifact(8, 'engine_business_model_canvas', { valuePropositions: ['Fast delivery'] })],
    };

    const brief = synthesizeBuildBrief(artifactsByStage, REQUIRED_ARTIFACTS);

    expect(brief.problem_and_value).toContain('delivery');
    expect(brief.business_model).toContain('Fast delivery');
    expect(brief.competitive_edge).toBe('');
    expect(brief.financial_model).toBe('');
    expect(brief.risk_matrix).toBe('');
    expect(brief.pricing_strategy).toBe('');
    expect(brief.customer_personas).toBe('');
    expect(brief.brand_identity).toBe('');
    expect(brief.gtm_strategy).toBe('');
    expect(brief.product_roadmap).toBe('');
    expect(brief.architecture).toBe('');
    expect(brief.srip).toBe('');
  });

  it('returns all empty strings when artifactsByStage is empty', () => {
    const brief = synthesizeBuildBrief({}, REQUIRED_ARTIFACTS);

    for (const [, value] of Object.entries(brief)) {
      expect(value).toBe('');
    }
    expect(Object.keys(brief)).toHaveLength(12);
  });

  it('handles malformed artifact_data gracefully', () => {
    const artifactsByStage = {
      1: [makeArtifact(1, 'truth_idea_brief', null)],
      8: [{ id: 'x', lifecycle_stage: 8, artifact_type: 'engine_business_model_canvas', metadata: {}, artifact_data: undefined }],
    };

    const brief = synthesizeBuildBrief(artifactsByStage, REQUIRED_ARTIFACTS);
    expect(brief.problem_and_value).toBe('');
    expect(brief.business_model).toBe('');
  });

  it('truncates long sections to stay under token budget', () => {
    const longText = 'A'.repeat(500);
    const artifactsByStage = {
      1: [makeArtifact(1, 'truth_idea_brief', { problemStatement: longText })],
    };

    const brief = synthesizeBuildBrief(artifactsByStage, REQUIRED_ARTIFACTS);
    expect(brief.problem_and_value.length).toBeLessThanOrEqual(155); // 150 + '...'

    // Total token budget check
    const serialized = JSON.stringify(brief);
    const wordCount = serialized.split(/\s+/).length;
    expect(wordCount * 1.3).toBeLessThan(2000);
  });
});
