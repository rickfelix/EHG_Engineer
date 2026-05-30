/**
 * Stage Config — maps stage numbers to file patterns, required artifacts,
 * gate types, and vision keys for Plan Agent and Reality Agent consumption.
 *
 * SSOT: venture_stages (DB). App-only fields (component_path, gate_label,
 * app_description) live on venture_stages as additive columns.
 *
 * GENERATED FILE — DO NOT HAND-EDIT.
 * Regenerate via: node scripts/generate-stage-config.cjs --write
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
    requiredArtifacts: ['identity_persona_brand'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_IDENTITY',
    visionKeys: ['customer-brand-foundation'],
    archPhases: ['identity']
  },
  11: {
    name: 'Naming & Visual Identity',
    componentFile: 'Stage11NamingVisualIdentity.tsx',
    filePatterns: ['src/components/stages/Stage11NamingVisualIdentity*'],
    requiredArtifacts: ['identity_naming_visual'],
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
    requiredArtifacts: ['identity_brand_guidelines', 'identity_gtm_sales_strategy'],
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
    requiredArtifacts: ['blueprint_technical_architecture', 'blueprint_data_model', 'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['technical-architecture'],
    archPhases: ['build']
  },
  15: {
    name: 'Design Studio',
    componentFile: 'Stage15DesignStudio.tsx',
    filePatterns: ['src/components/stages/Stage15DesignStudio*'],
    requiredArtifacts: ['wireframe_screens'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BLUEPRINT',
    visionKeys: ['design-studio'],
    archPhases: ['build']
  },
  16: {
    name: 'Financial Projections',
    componentFile: 'Stage16FinancialProjections.tsx',
    filePatterns: ['src/components/stages/Stage16FinancialProjections*'],
    requiredArtifacts: ['blueprint_financial_projection'],
    workType: 'decision_gate',
    gateType: 'promotion',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['financial-projections'],
    archPhases: ['build']
  },
  17: {
    name: 'Blueprint Review',
    componentFile: 'Stage17BlueprintReview.tsx',
    filePatterns: ['src/components/stages/Stage17BlueprintReview*'],
    requiredArtifacts: ['system_devils_advocate_review'],
    workType: 'decision_gate',
    gateType: 'promotion',
    phase: 'THE_BLUEPRINT',
    visionKeys: ['blueprint-review'],
    archPhases: ['build']
  },
  18: {
    name: 'Marketing Copy Studio',
    componentFile: 'Stage18MarketingCopy.tsx',
    filePatterns: ['src/components/stages/Stage18MarketingCopy*'],
    requiredArtifacts: ['marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero', 'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement', 'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['marketing-copy-studio'],
    archPhases: ['execution']
  },
  19: {
    name: 'Sprint Planning',
    componentFile: 'Stage19SprintPlanning.tsx',
    filePatterns: ['src/components/stages/Stage19SprintPlanning*'],
    requiredArtifacts: ['build_mvp_build'],
    workType: 'sd_required',
    gateType: 'promotion',
    phase: 'THE_BUILD',
    visionKeys: ['sprint-planning'],
    archPhases: ['execution']
  },
  20: {
    name: 'Code Quality Gate',
    componentFile: 'Stage20CodeQuality.tsx',
    filePatterns: ['src/components/stages/Stage20CodeQuality*'],
    requiredArtifacts: ['code_quality_report'],
    workType: 'automated_check',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['code-quality-gate'],
    archPhases: ['execution']
  },
  21: {
    name: 'Visual Assets',
    componentFile: 'Stage21VisualAssets.tsx',
    filePatterns: ['src/components/stages/Stage21VisualAssets*'],
    requiredArtifacts: ['visual_device_screenshots', 'visual_social_graphics'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['visual-assets'],
    archPhases: ['execution']
  },
  22: {
    name: 'Distribution Setup',
    componentFile: 'Stage22DistributionSetup.tsx',
    filePatterns: ['src/components/stages/Stage22DistributionSetup*'],
    requiredArtifacts: ['distribution_channel_config', 'distribution_ad_copy'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_BUILD',
    visionKeys: ['distribution-setup'],
    archPhases: ['execution']
  },
  23: {
    name: 'Launch Readiness',
    componentFile: 'Stage23LaunchReadiness.tsx',
    filePatterns: ['src/components/stages/Stage23LaunchReadiness*'],
    requiredArtifacts: ['launch_readiness_checklist'],
    workType: 'decision_gate',
    gateType: 'kill',
    phase: 'THE_BUILD',
    visionKeys: ['launch-readiness-gate'],
    archPhases: ['execution']
  },
  24: {
    name: 'Go Live & Announce',
    componentFile: 'Stage24GoLive.tsx',
    filePatterns: ['src/components/stages/Stage24GoLive*'],
    requiredArtifacts: ['launch_metrics'],
    workType: 'decision_gate',
    gateType: 'promotion',
    phase: 'THE_LAUNCH',
    visionKeys: ['go-live'],
    archPhases: ['launch']
  },
  25: {
    name: 'Post-Launch Review',
    componentFile: 'Stage25PostLaunchReview.tsx',
    filePatterns: ['src/components/stages/Stage25PostLaunchReview*'],
    requiredArtifacts: ['postlaunch_assumptions_vs_reality', 'postlaunch_user_feedback_summary'],
    workType: 'artifact_only',
    gateType: 'promotion',
    phase: 'THE_LAUNCH',
    visionKeys: ['post-launch-review'],
    archPhases: ['launch']
  },
  26: {
    name: 'Growth Playbook',
    componentFile: 'Stage26GrowthPlaybook.tsx',
    filePatterns: ['src/components/stages/Stage26GrowthPlaybook*'],
    requiredArtifacts: ['growth_playbook', 'growth_optimization_roadmap'],
    workType: 'artifact_only',
    gateType: null,
    phase: 'THE_LAUNCH',
    visionKeys: ['growth-playbook'],
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
