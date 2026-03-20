/**
 * Stage Config — maps stage numbers to file patterns, required artifacts,
 * gate types, and vision keys for Plan Agent and Reality Agent consumption.
 *
 * SSOT sources:
 *   - DB: lifecycle_stage_config (stage names, phases, work types, artifacts)
 *   - App: venture-workflow.ts (component paths, gate types, chunks)
 *
 * GENERATED FILE — DO NOT HAND-EDIT.
 * Regenerate via: node scripts/generate-stage-config.js --write
 */

const STAGE_CONFIG = {
  1: {
    name: 'Draft Idea',
    componentFile: 'Stage1DraftIdea.tsx',
    filePatterns: ['src/components/stages/Stage1DraftIdea*'],
    requiredArtifacts: ['truth_idea_brief'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_TRUTH',
    visionKeys: ['draft-idea'],
    archPhases: ['validation']
  },
  2: {
    name: 'AI Review',
    componentFile: 'Stage2AIReview.tsx',
    filePatterns: ['src/components/stages/Stage2AIReview*'],
    requiredArtifacts: ['truth_ai_critique'],
    workType: 'automated_check',
    gateType: null,
    phase: 'THE_TRUTH',
    visionKeys: ['ai-review'],
    archPhases: ['validation']
  },
  3: {
    name: 'Comprehensive Validation',
    componentFile: 'Stage3ComprehensiveValidation.tsx',
    filePatterns: ['src/components/stages/Stage3ComprehensiveValidation*'],
    requiredArtifacts: ['truth_validation_decision'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_TRUTH',
    visionKeys: ['comprehensive-validation'],
    archPhases: ['validation']
  },
  4: {
    name: 'Competitive Intelligence',
    componentFile: 'Stage4CompetitiveIntelligence.tsx',
    filePatterns: ['src/components/stages/Stage4CompetitiveIntelligence*'],
    requiredArtifacts: ['truth_competitive_analysis'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_TRUTH',
    visionKeys: ['competitive-intelligence'],
    archPhases: ['validation']
  },
  5: {
    name: 'Profitability Forecasting',
    componentFile: 'Stage5ProfitabilityForecasting.tsx',
    filePatterns: ['src/components/stages/Stage5ProfitabilityForecasting*'],
    requiredArtifacts: ['truth_financial_model'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_TRUTH',
    visionKeys: ['profitability-forecasting'],
    archPhases: ['validation']
  },
  6: {
    name: 'Risk Evaluation',
    componentFile: 'Stage6RiskEvaluation.tsx',
    filePatterns: ['src/components/stages/Stage6RiskEvaluation*'],
    requiredArtifacts: ['engine_risk_matrix'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_ENGINE',
    visionKeys: ['risk-evaluation'],
    archPhases: ['design']
  },
  7: {
    name: 'Revenue Architecture',
    componentFile: 'Stage7RevenueArchitecture.tsx',
    filePatterns: ['src/components/stages/Stage7RevenueArchitecture*'],
    requiredArtifacts: ['engine_pricing_model'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_ENGINE',
    visionKeys: ['revenue-architecture'],
    archPhases: ['design']
  },
  8: {
    name: 'Business Model Canvas',
    componentFile: 'Stage8BusinessModelCanvas.tsx',
    filePatterns: ['src/components/stages/Stage8BusinessModelCanvas*'],
    requiredArtifacts: ['engine_business_model_canvas'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_ENGINE',
    visionKeys: ['business-model-canvas'],
    archPhases: ['design']
  },
  9: {
    name: 'Exit Strategy',
    componentFile: 'Stage9ExitStrategy.tsx',
    filePatterns: ['src/components/stages/Stage9ExitStrategy*'],
    requiredArtifacts: ['engine_exit_strategy'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_ENGINE',
    visionKeys: ['exit-strategy'],
    archPhases: ['design']
  },
  10: {
    name: 'Customer & Brand Foundation',
    componentFile: 'Stage10CustomerBrand.tsx',
    filePatterns: ['src/components/stages/Stage10CustomerBrand*'],
    requiredArtifacts: ['identity_persona_brand', 'identity_brand_guidelines'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['customer-brand-foundation'],
    archPhases: ['identity']
  },
  11: {
    name: 'Naming & Visual Identity',
    componentFile: 'Stage11NamingVisualIdentity.tsx',
    filePatterns: ['src/components/stages/Stage11NamingVisualIdentity*'],
    requiredArtifacts: ['identity_naming_visual', 'identity_brand_name'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['naming-visual-identity'],
    archPhases: ['identity']
  },
  12: {
    name: 'GTM & Sales Strategy',
    componentFile: 'Stage12GtmSalesStrategy.tsx',
    filePatterns: ['src/components/stages/Stage12GtmSalesStrategy*'],
    requiredArtifacts: ['identity_gtm_sales_strategy'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['gtm-sales-strategy'],
    archPhases: ['identity']
  },
  13: {
    name: 'Product Roadmap',
    componentFile: 'Stage13ProductRoadmap.tsx',
    filePatterns: ['src/components/stages/Stage13ProductRoadmap*'],
    requiredArtifacts: ['blueprint_product_roadmap'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['product-roadmap'],
    archPhases: ['build']
  },
  14: {
    name: 'Technical Architecture',
    componentFile: 'Stage14TechnicalArchitecture.tsx',
    filePatterns: ['src/components/stages/Stage14TechnicalArchitecture*'],
    requiredArtifacts: ['blueprint_data_model', 'blueprint_erd_diagram'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['technical-architecture'],
    archPhases: ['build']
  },
  15: {
    name: 'Risk Register',
    componentFile: 'Stage15RiskRegister.tsx',
    filePatterns: ['src/components/stages/Stage15RiskRegister*'],
    requiredArtifacts: ['user_story_pack'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['risk-register'],
    archPhases: ['build']
  },
  16: {
    name: 'Financial Projections',
    componentFile: 'Stage16FinancialProjections.tsx',
    filePatterns: ['src/components/stages/Stage16FinancialProjections*'],
    requiredArtifacts: ['api_contract', 'schema_spec'],
    workType: 'decision_gate',
    gateType: 'promotion',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['financial-projections'],
    archPhases: ['build']
  },
  17: {
    name: 'Build Readiness',
    componentFile: 'Stage17BuildReadiness.tsx',
    filePatterns: ['src/components/stages/Stage17BuildReadiness*'],
    requiredArtifacts: ['system_prompt', 'cicd_config'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['build-readiness'],
    archPhases: ['execution']
  },
  18: {
    name: 'Sprint Planning',
    componentFile: 'Stage18SprintPlanning.tsx',
    filePatterns: ['src/components/stages/Stage18SprintPlanning*'],
    requiredArtifacts: [],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['sprint-planning'],
    archPhases: ['execution']
  },
  19: {
    name: 'Build Execution',
    componentFile: 'Stage19BuildExecution.tsx',
    filePatterns: ['src/components/stages/Stage19BuildExecution*'],
    requiredArtifacts: [],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['build-execution'],
    archPhases: ['execution']
  },
  20: {
    name: 'Quality Assurance',
    componentFile: 'Stage20QualityAssurance.tsx',
    filePatterns: ['src/components/stages/Stage20QualityAssurance*'],
    requiredArtifacts: ['security_audit'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['quality-assurance'],
    archPhases: ['execution']
  },
  21: {
    name: 'Build Review & Integration Testing',
    componentFile: 'Stage21BuildReview.tsx',
    filePatterns: ['src/components/stages/Stage21BuildReview*'],
    requiredArtifacts: ['test_plan', 'uat_report'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['build-review'],
    archPhases: ['execution']
  },
  22: {
    name: 'Release Readiness',
    componentFile: 'Stage22ReleaseReadiness.tsx',
    filePatterns: ['src/components/stages/Stage22ReleaseReadiness*'],
    requiredArtifacts: ['deployment_runbook'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['release-readiness'],
    archPhases: ['execution']
  },
  23: {
    name: 'Marketing Preparation',
    componentFile: 'Stage23MarketingPreparation.tsx',
    filePatterns: ['src/components/stages/Stage23MarketingPreparation*'],
    requiredArtifacts: ['launch_checklist'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_LAUNCH',
    visionKeys: ['marketing-preparation'],
    archPhases: ['launch']
  },
  24: {
    name: 'Launch Readiness',
    componentFile: 'Stage24LaunchReadiness.tsx',
    filePatterns: ['src/components/stages/Stage24LaunchReadiness*'],
    requiredArtifacts: ['analytics_dashboard', 'health_scoring_system', 'churn_triggers', 'retention_playbook'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_LAUNCH',
    visionKeys: ['launch-readiness'],
    archPhases: ['launch']
  },
  25: {
    name: 'Launch Execution',
    componentFile: 'Stage25LaunchExecution.tsx',
    filePatterns: ['src/components/stages/Stage25LaunchExecution*'],
    requiredArtifacts: ['optimization_roadmap', 'assumptions_vs_reality_report'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_LAUNCH',
    visionKeys: ['launch-execution'],
    archPhases: ['launch']
  }
};

/**
 * Get config for a specific stage
 * @param {number} stageNumber
 * @returns {object} stage config
 */
export function getStageConfig(stageNumber) {
  return STAGE_CONFIG[stageNumber] || null;
}

/**
 * Get configs for a range of stages
 * @param {number} from
 * @param {number} to
 * @returns {object} map of stage number to config
 */
export function getStageRange(from, to) {
  const result = {};
  for (let i = from; i <= to; i++) {
    if (STAGE_CONFIG[i]) {
      result[i] = STAGE_CONFIG[i];
    }
  }
  return result;
}

/**
 * Gate stages — stages requiring chairman decision to advance.
 * Kill gates: venture can be terminated.
 * Promotion gates: venture elevated from simulation to production.
 * @returns {number[]}
 */
export function getGateStages() {
  return Object.entries(STAGE_CONFIG)
    .filter(([, c]) => c.gateType !== null)
    .map(([n]) => parseInt(n));
}

/**
 * Get kill gate stages only
 * @returns {number[]}
 */
export function getKillGateStages() {
  return Object.entries(STAGE_CONFIG)
    .filter(([, c]) => c.gateType === 'kill')
    .map(([n]) => parseInt(n));
}

export { STAGE_CONFIG };
