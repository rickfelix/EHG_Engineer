/**
 * Stage SD Data for EHG Ideation Milestone (Stages 1-6)
 */

// Stage SD 1: Enhanced Ideation
export const stage1SD = {
  id: 'SD-IDEATION-STAGE1-001',
  sd_key: 'IDEATION-STAGE1-001',
  title: 'Stage 1: Enhanced Ideation (AI-Augmented Capture)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-DATA-001',
  sd_type: 'feature',

  description: `Transform Stage 1 from simple form capture to AI-augmented ideation experience.
Chairman inputs initial idea via voice or text, AI enhances description with market context,
identifies potential archetypes, and prepares structured data for subsequent stages.`,

  strategic_intent: `Reduce Chairman effort in initial idea capture while improving quality of input
for downstream AI analysis. Voice capture + AI enhancement = faster, better structured ideas.`,

  rationale: `Current Stage 1 is passive data collection. AI can enhance raw ideas with market context,
suggest improvements, and structure data optimally for agent analysis in Stages 2-6.`,

  scope: `Stage 1 enhancements:
- Voice capture integration (existing)
- AI description enhancement
- Archetype detection
- Tier recommendation
- Structured output for Stage 2`,

  strategic_objectives: [
    'Integrate EVA for voice-to-text capture with correction',
    'Implement AI description enhancement (expand 2 sentences to comprehensive summary)',
    'Add automatic archetype detection from description',
    'Implement tier recommendation based on complexity signals',
    'Structure output data for optimal Stage 2 consumption',
    'Enable Chairman editing of AI-enhanced description',
    'Store original and enhanced descriptions for comparison'
  ],

  success_criteria: [
    'Voice capture accuracy >=95%',
    'AI enhancement improves description quality by >=50% (measured by completeness)',
    'Archetype detection accuracy >=85%',
    'Tier recommendation accepted by Chairman >=80% of time',
    'Total Stage 1 completion time <2 minutes',
    'Chairman can revert to original description if preferred',
    'Structured output passes Stage 2 input validation'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-DATA-001', description: 'Ventures table metadata extensions' }
  ],

  risks: [
    { id: 'R1', description: 'AI enhancement may change Chairman intent', likelihood: 'medium', impact: 'medium', mitigation: 'Always show diff, allow revert, preserve original' }
  ],

  success_metrics: [
    { metric: 'enhancement_acceptance_rate', target: '>=85%', description: 'Percentage of AI enhancements accepted by Chairman' },
    { metric: 'stage1_completion_time', target: '<2 min', description: 'Average time from start to Stage 1 completion' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-DATA-001',
    stage_number: 1,
    stage_name: 'Enhanced Ideation',
    sequence_order: 1,
    layer: 3,
    existing_component: 'Stage1Enhanced.tsx',
    modifications: ['Add AI enhancement service call', 'Integrate archetype detection', 'Add tier recommendation UI', 'Store structured output to stage_executions']
  },

  created_by: 'LEAD'
};

// Stage SD 2: AI Review
export const stage2SD = {
  id: 'SD-IDEATION-STAGE2-001',
  sd_key: 'IDEATION-STAGE2-001',
  title: 'Stage 2: AI Review (Multi-Agent Analysis)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-AGENTS-001',
  sd_type: 'feature',

  description: `Stage 2 deploys multiple CrewAI agents to conduct initial venture analysis.
Market Sizing Analyst calculates TAM/SAM/SOM. Pain Point Validator confirms problem existence.
Results aggregated into preliminary viability assessment with confidence scores.`,

  strategic_intent: `Provide rapid, AI-driven initial assessment of venture viability before deeper
validation in subsequent stages. Early red flags identified save time on non-viable ideas.`,

  rationale: `Human review is slow and inconsistent. AI agents can analyze market size and validate
pain points in parallel, providing objective initial assessment within minutes.`,

  scope: `Stage 2 agent deployments:
- Market Sizing Analyst crew
- Pain Point Validator crew
- Result aggregation
- Preliminary viability score`,

  strategic_objectives: [
    'Deploy Market Sizing Analyst to calculate TAM/SAM/SOM',
    'Deploy Pain Point Validator to confirm problem existence',
    'Execute agents in parallel for faster completion',
    'Aggregate results into preliminary viability score',
    'Store detailed results in agent_results table',
    'Generate confidence-weighted summary for Chairman',
    'Flag early red flags for immediate attention'
  ],

  success_criteria: [
    'Both agents complete within 5 minutes',
    'TAM/SAM/SOM calculated with source citations',
    'Pain points validated from 3+ social sources',
    'Preliminary viability score between 0-100',
    'Red flags clearly highlighted in UI',
    'Results stored with full provenance',
    'Stage 2 never blocks on agent timeout (fallback to manual)'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-AGENTS-001', description: 'CrewAI agent registry and execution infrastructure' },
    { type: 'internal', sd_id: 'SD-IDEATION-STAGE1-001', description: 'Structured output from Stage 1' }
  ],

  risks: [
    { id: 'R1', description: 'Agent timeout may block venture progression', likelihood: 'medium', impact: 'high', mitigation: 'Implement 5-minute timeout with graceful fallback' }
  ],

  success_metrics: [
    { metric: 'agent_completion_rate', target: '>=95%', description: 'Percentage of Stage 2 analyses completing successfully' },
    { metric: 'stage2_duration', target: '<5 min', description: 'Time from Stage 2 start to completion' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-AGENTS-001',
    stage_number: 2,
    stage_name: 'AI Review',
    sequence_order: 2,
    layer: 3,
    existing_component: 'Stage2AIReview.tsx',
    agents_deployed: ['market_sizing_analyst', 'pain_point_validator'],
    parallel_execution: true,
    timeout_seconds: 300
  },

  created_by: 'LEAD'
};

// Stage SD 3: Comprehensive Validation
export const stage3SD = {
  id: 'SD-IDEATION-STAGE3-001',
  sd_key: 'IDEATION-STAGE3-001',
  title: 'Stage 3: Comprehensive Validation (Gate Preparation)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-AGENTS-001',
  sd_type: 'feature',

  description: `Stage 3 conducts comprehensive validation across market, technical, and strategic dimensions.
Prepares venture for Stage 3.4 Kill/Revise/Proceed gate. Multiple agents assess feasibility from different
angles, synthesizing into gate-ready recommendation.`,

  strategic_intent: `Ensure ventures reaching the gate decision have been thoroughly validated from
all critical perspectives. Reduce Chairman cognitive load by presenting synthesized recommendation.`,

  rationale: `The Stage 3.4 gate is the most important decision point in ideation. Thorough multi-dimensional
validation ensures Chairman has complete picture for Kill/Revise/Proceed decision.`,

  scope: `Stage 3 comprehensive validation:
- Pain Point Validator (deeper analysis)
- Technical Validator (feasibility)
- Strategic Fit Analyzer (portfolio alignment)
- Systems Thinker (second-order effects)
- Gate recommendation synthesis`,

  strategic_objectives: [
    'Execute deep pain point validation with competitive context',
    'Assess technical feasibility and complexity',
    'Evaluate strategic fit with portfolio',
    'Identify second and third-order effects',
    'Synthesize multi-dimensional analysis into gate recommendation',
    'Generate Kill/Revise/Proceed recommendation with confidence',
    'Prepare Stage 3.4 gate presentation for Chairman'
  ],

  success_criteria: [
    'All 4 validation dimensions assessed',
    'Gate recommendation accuracy >=85% (vs Chairman decision)',
    'Second-order effects identified for >=80% of ventures',
    'Technical feasibility assessment includes effort estimate',
    'Portfolio synergies identified when present',
    'Stage 3 completes within 10 minutes',
    'Gate presentation includes actionable revision suggestions'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-AGENTS-001', description: 'Agent crews for validation dimensions' },
    { type: 'internal', sd_id: 'SD-IDEATION-STAGE2-001', description: 'Preliminary assessment from Stage 2' }
  ],

  risks: [
    { id: 'R1', description: 'Gate recommendation may conflict with Chairman intuition', likelihood: 'medium', impact: 'medium', mitigation: 'Show full reasoning, always allow Chairman override' }
  ],

  success_metrics: [
    { metric: 'gate_recommendation_accuracy', target: '>=85%', description: 'Percentage of recommendations aligned with Chairman decision' },
    { metric: 'stage3_duration', target: '<10 min', description: 'Time from Stage 3 start to completion' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-AGENTS-001',
    stage_number: 3,
    stage_name: 'Comprehensive Validation',
    sequence_order: 3,
    layer: 3,
    existing_component: 'Stage3ComprehensiveValidation.tsx',
    agents_deployed: ['pain_point_validator', 'technical_validator', 'strategic_fit_analyzer', 'systems_thinker'],
    includes_gate: true,
    gate_id: 'stage_3_4',
    gate_options: ['KILL', 'REVISE', 'PROCEED']
  },

  created_by: 'LEAD'
};

// Stage SD 4: Competitive Intelligence
export const stage4SD = {
  id: 'SD-IDEATION-STAGE4-001',
  sd_key: 'IDEATION-STAGE4-001',
  title: 'Stage 4: Competitive Intelligence (AI-Powered Mapping)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-AGENTS-001',
  sd_type: 'feature',

  description: `Stage 4 maps competitive landscape using AI-powered research. Identifies direct/indirect
competitors, analyzes their strengths/weaknesses, and positions venture for differentiation.
Injects portfolio context for synergy detection across existing EHG ventures.`,

  strategic_intent: `Provide comprehensive competitive intelligence that enables strategic positioning.
Portfolio context ensures new ventures leverage existing EHG capabilities.`,

  rationale: `Manual competitive research is time-consuming and often incomplete. AI agents can
scan multiple sources, synthesize findings, and identify differentiation opportunities faster.`,

  scope: `Stage 4 competitive intelligence:
- Competitive landscape mapping
- Competitor strength/weakness analysis
- Differentiation opportunity identification
- Portfolio synergy detection
- Strategic positioning recommendation`,

  strategic_objectives: [
    'Deploy Competitive Intel Mapper agent',
    'Identify 5-10 direct competitors with profiles',
    'Analyze 3-5 indirect competitors/substitutes',
    'Map competitor strengths and weaknesses',
    'Identify 3+ differentiation opportunities',
    'Inject portfolio context for synergy detection',
    'Generate strategic positioning recommendation',
    'Flag high-threat competitors for attention'
  ],

  success_criteria: [
    'Competitive map includes >=5 direct competitors',
    'Each competitor has strength/weakness analysis',
    'Differentiation opportunities are actionable',
    'Portfolio synergies identified when present',
    'Competitive intelligence loads async (not blocking)',
    'Stage 4 completes within 8 minutes',
    'Data sources cited for verification'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-AGENTS-001', description: 'Competitive Intel Mapper agent' },
    { type: 'internal', sd_id: 'SD-IDEATION-STAGE3-001', description: 'Validated venture data from Stage 3' }
  ],

  risks: [
    { id: 'R1', description: 'Competitive data may be outdated', likelihood: 'medium', impact: 'medium', mitigation: 'Include data freshness indicator, allow manual refresh' }
  ],

  success_metrics: [
    { metric: 'competitor_coverage', target: '>=5 direct', description: 'Number of direct competitors identified' },
    { metric: 'stage4_duration', target: '<8 min', description: 'Time from Stage 4 start to completion' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-AGENTS-001',
    stage_number: 4,
    stage_name: 'Competitive Intelligence',
    sequence_order: 4,
    layer: 3,
    existing_component: 'Stage4CompetitiveIntelligence.tsx',
    agents_deployed: ['competitive_intel_mapper', 'strategic_fit_analyzer'],
    portfolio_context_injection: true
  },

  created_by: 'LEAD'
};

// Stage SD 5: Profitability Forecasting
export const stage5SD = {
  id: 'SD-IDEATION-STAGE5-001',
  sd_key: 'IDEATION-STAGE5-001',
  title: 'Stage 5: Profitability Forecasting (Financial Modeling)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-DATA-001',
  sd_type: 'feature',

  description: `Stage 5 builds financial model with unit economics, revenue projections, and profitability
forecast. Uses archetype-specific benchmarks and market data from previous stages to generate
realistic projections with scenario analysis.`,

  strategic_intent: `Provide data-driven financial projections that inform investment decisions.
Archetype benchmarks ensure realistic expectations for different venture types.`,

  rationale: `Financial viability is critical for venture success. AI-generated projections based on
market data and archetype benchmarks provide objective baseline for Chairman evaluation.`,

  scope: `Stage 5 financial modeling:
- Unit economics calculation
- Revenue projection (3-year)
- Cost structure analysis
- Profitability forecast
- Scenario analysis (best/base/worst)`,

  strategic_objectives: [
    'Deploy Financial Modeler agent',
    'Calculate unit economics (CAC, LTV, margins)',
    'Generate 3-year revenue projection',
    'Build cost structure model',
    'Create profitability forecast with timeline to break-even',
    'Run scenario analysis (best/base/worst)',
    'Apply archetype-specific benchmarks',
    'Flag unrealistic assumptions'
  ],

  success_criteria: [
    'Unit economics calculated with all key metrics',
    'Revenue projections based on market sizing from Stage 2/4',
    '3 scenarios generated with clear assumptions',
    'Break-even timeline identified',
    'Archetype benchmarks applied for validation',
    'Unrealistic assumptions flagged',
    'Stage 5 completes within 6 minutes',
    'Financial model exportable for deeper analysis'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-DATA-001', description: 'Database tables for financial projections' },
    { type: 'internal', sd_id: 'SD-IDEATION-PATTERNS-001', description: 'Archetype benchmarks for validation' },
    { type: 'internal', sd_id: 'SD-IDEATION-STAGE4-001', description: 'Market data and competitive context' }
  ],

  risks: [
    { id: 'R1', description: 'Financial projections may be overly optimistic', likelihood: 'high', impact: 'medium', mitigation: 'Apply conservative archetype benchmarks, show range' }
  ],

  success_metrics: [
    { metric: 'projection_accuracy', target: '+-30%', description: 'Historical accuracy of projections vs actuals' },
    { metric: 'stage5_duration', target: '<6 min', description: 'Time from Stage 5 start to completion' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-DATA-001',
    stage_number: 5,
    stage_name: 'Profitability Forecasting',
    sequence_order: 5,
    layer: 3,
    existing_component: 'Stage5ProfitabilityForecasting.tsx',
    agents_deployed: ['financial_modeler'],
    recursion_trigger: true,
    recursion_condition: 'profitability_score < 60%',
    recursion_target_stage: 3
  },

  created_by: 'LEAD'
};

// Stage SD 6: Risk Evaluation
export const stage6SD = {
  id: 'SD-IDEATION-STAGE6-001',
  sd_key: 'IDEATION-STAGE6-001',
  title: 'Stage 6: Risk Evaluation (Threat Assessment)',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-PATTERNS-001',
  sd_type: 'feature',

  description: `Stage 6 evaluates venture risks across market, technical, operational, and financial dimensions.
Quantifies risk levels, identifies mitigation strategies, and generates final ideation milestone summary.
Triggers recursion to earlier stages if critical risks discovered.`,

  strategic_intent: `Ensure Chairman has complete risk picture before proceeding to development stages.
Proactive risk identification enables mitigation planning.`,

  rationale: `Risks not identified in ideation become expensive problems in development. AI-powered
risk assessment ensures systematic coverage of risk categories.`,

  scope: `Stage 6 risk evaluation:
- Market risk assessment
- Technical risk assessment
- Operational risk assessment
- Financial risk assessment
- Mitigation strategy generation
- Ideation milestone summary`,

  strategic_objectives: [
    'Deploy Risk Assessor agent',
    'Deploy Systems Thinker for second-order risks',
    'Assess risks across 4 dimensions',
    'Quantify risk levels (1-10 scale)',
    'Generate mitigation strategies for high risks',
    'Trigger recursion if critical risk score >80%',
    'Create ideation milestone summary',
    'Prepare handoff to Stage 7 (development stages)'
  ],

  success_criteria: [
    'All 4 risk dimensions assessed',
    'Critical risks (>80%) trigger recursion',
    'Mitigation strategies provided for all high risks',
    'Second-order risks identified',
    'Ideation milestone summary complete',
    'Stage 6 completes within 8 minutes',
    'Risk assessment exportable for tracking',
    'Handoff to development stages prepared'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-PATTERNS-001', description: 'Recursion engine for critical risk handling' },
    { type: 'internal', sd_id: 'SD-IDEATION-AGENTS-001', description: 'Risk Assessor and Systems Thinker agents' },
    { type: 'internal', sd_id: 'SD-IDEATION-STAGE5-001', description: 'Financial projections for financial risk context' }
  ],

  risks: [
    { id: 'R1', description: 'Risk assessment may miss novel risk categories', likelihood: 'low', impact: 'high', mitigation: 'Include open-ended risk identification, learn from Chairman additions' }
  ],

  success_metrics: [
    { metric: 'risk_coverage', target: '4 dimensions', description: 'All risk dimensions assessed' },
    { metric: 'stage6_duration', target: '<8 min', description: 'Time from Stage 6 start to completion' },
    { metric: 'recursion_trigger_accuracy', target: '>=90%', description: 'Accuracy of recursion trigger decisions' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-PATTERNS-001',
    stage_number: 6,
    stage_name: 'Risk Evaluation',
    sequence_order: 6,
    layer: 3,
    existing_component: 'Stage6RiskEvaluation.tsx',
    agents_deployed: ['risk_assessor', 'systems_thinker'],
    recursion_trigger: true,
    recursion_conditions: [
      { condition: 'critical_risk_discovered', threshold: 'risk_score > 80%', target_stage: 3 },
      { condition: 'new_competitor_threat', threshold: 'competitive_position_change > 20%', target_stage: 4 }
    ],
    milestone_completion: true,
    milestone_name: 'Ideation Milestone',
    next_milestone: 'Development Milestone (Stages 7-15)'
  },

  created_by: 'LEAD'
};
