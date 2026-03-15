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
    requiredArtifacts: ['idea_brief'],
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
    requiredArtifacts: ['critique_report'],
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
    requiredArtifacts: ['validation_report'],
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
    requiredArtifacts: ['competitive_analysis'],
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
    requiredArtifacts: ['financial_model'],
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
    requiredArtifacts: ['risk_matrix'],
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
    requiredArtifacts: ['pricing_model'],
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
    requiredArtifacts: ['business_model_canvas'],
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
    requiredArtifacts: ['exit_strategy'],
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
    requiredArtifacts: ['strategic_narrative', 'marketing_manifest', 'cultural_design_config'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['customer-brand-foundation'],
    archPhases: ['identity']
  },
  11: {
    name: 'Naming & Visual Identity',
    componentFile: 'Stage11GtmStrategy.tsx',
    filePatterns: ['src/components/stages/Stage11GtmStrategy*'],
    requiredArtifacts: ['gtm_plan', 'marketing_manifest'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['gtm-strategy'],
    archPhases: ['identity']
  },
  12: {
    name: 'GTM & Sales Strategy',
    componentFile: 'Stage12SalesSuccessLogic.tsx',
    filePatterns: ['src/components/stages/Stage12SalesSuccessLogic*'],
    requiredArtifacts: ['sales_playbook'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_IDENTITY',
    visionKeys: ['sales-success-logic'],
    archPhases: ['identity']
  },
  13: {
    name: 'Product Roadmap',
    componentFile: 'Stage13TechStackInterrogation.tsx',
    filePatterns: ['src/components/stages/Stage13TechStackInterrogation*'],
    requiredArtifacts: ['tech_stack_decision'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['tech-stack-interrogation'],
    archPhases: ['build']
  },
  14: {
    name: 'Technical Architecture',
    componentFile: 'Stage14DataModelArchitecture.tsx',
    filePatterns: ['src/components/stages/Stage14DataModelArchitecture*'],
    requiredArtifacts: ['data_model', 'erd_diagram'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['data-model-architecture'],
    archPhases: ['build']
  },
  15: {
    name: 'Risk Register',
    componentFile: 'Stage15EpicUserStoryBreakdown.tsx',
    filePatterns: ['src/components/stages/Stage15EpicUserStoryBreakdown*'],
    requiredArtifacts: ['user_story_pack'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['epic-user-story-breakdown'],
    archPhases: ['build']
  },
  16: {
    name: 'Financial Projections',
    componentFile: 'Stage16SchemaFirewall.tsx',
    filePatterns: ['src/components/stages/Stage16SchemaFirewall*'],
    requiredArtifacts: ['api_contract', 'schema_spec'],
    workType: 'decision_gate',
    gateType: 'promotion',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['schema-firewall'],
    archPhases: ['build']
  },
  17: {
    name: 'Build Readiness',
    componentFile: 'Stage17EnvironmentConfig.tsx',
    filePatterns: ['src/components/stages/Stage17EnvironmentConfig*'],
    requiredArtifacts: ['system_prompt', 'cicd_config'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['environment-config'],
    archPhases: ['execution']
  },
  18: {
    name: 'Sprint Planning',
    componentFile: 'Stage18MvpDevelopmentLoop.tsx',
    filePatterns: ['src/components/stages/Stage18MvpDevelopmentLoop*'],
    requiredArtifacts: [],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['mvp-development-loop'],
    archPhases: ['execution']
  },
  19: {
    name: 'Build Execution',
    componentFile: 'Stage19IntegrationApiLayer.tsx',
    filePatterns: ['src/components/stages/Stage19IntegrationApiLayer*'],
    requiredArtifacts: [],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['integration-api-layer'],
    archPhases: ['execution']
  },
  20: {
    name: 'Quality Assurance',
    componentFile: 'Stage20SecurityPerformance.tsx',
    filePatterns: ['src/components/stages/Stage20SecurityPerformance*'],
    requiredArtifacts: ['security_audit'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['security-performance'],
    archPhases: ['execution']
  },
  21: {
    name: 'Build Review & Integration Testing',
    componentFile: 'Stage21QaUat.tsx',
    filePatterns: ['src/components/stages/Stage21QaUat*'],
    requiredArtifacts: ['test_plan', 'uat_report'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['qa-uat'],
    archPhases: ['execution']
  },
  22: {
    name: 'Release Readiness',
    componentFile: 'Stage22Deployment.tsx',
    filePatterns: ['src/components/stages/Stage22Deployment*'],
    requiredArtifacts: ['deployment_runbook'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['deployment'],
    archPhases: ['execution']
  },
  23: {
    name: 'Marketing Preparation',
    componentFile: 'Stage23ProductionLaunch.tsx',
    filePatterns: ['src/components/stages/Stage23ProductionLaunch*'],
    requiredArtifacts: ['launch_checklist'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_LAUNCH',
    visionKeys: ['production-launch'],
    archPhases: ['launch']
  },
  24: {
    name: 'Launch Readiness',
    componentFile: 'Stage24GrowthMetricsOptimization.tsx',
    filePatterns: ['src/components/stages/Stage24GrowthMetricsOptimization*'],
    requiredArtifacts: ['analytics_dashboard', 'health_scoring_system', 'churn_triggers', 'retention_playbook'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_LAUNCH',
    visionKeys: ['analytics-feedback'],
    archPhases: ['launch']
  },
  25: {
    name: 'Launch Execution',
    componentFile: 'Stage25ScalePlanning.tsx',
    filePatterns: ['src/components/stages/Stage25ScalePlanning*'],
    requiredArtifacts: ['optimization_roadmap', 'assumptions_vs_reality_report'],
    workType: 'sd_required',
    gateType: null,
    phase: 'THE_LAUNCH',
    visionKeys: ['optimization-scale'],
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
