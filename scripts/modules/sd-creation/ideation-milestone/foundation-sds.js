/**
 * Foundation SD Data for EHG Ideation Milestone
 * Contains Data Foundation, Agents Foundation, and Patterns Foundation SDs
 */

// Foundation SD 1: Data Foundation (Critical)
export const dataFoundationSD = {
  id: 'SD-IDEATION-DATA-001',
  sd_key: 'IDEATION-DATA-001',
  title: 'Stages 1-6 Data Foundation',
  version: '1.0',
  status: 'active',
  category: 'database',
  priority: 'critical',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-VISION-001',
  sd_type: 'database',

  description: `Establish comprehensive database schema and data infrastructure for Stages 1-6 autonomous operation.
Creates tables for venture metadata, stage execution tracking, agent results storage, and validation history.
Implements RLS policies for multi-tenant security and real-time subscriptions for progress monitoring.`,

  strategic_intent: `Provide robust, scalable data foundation that enables autonomous agent execution with full
audit trail and real-time visibility into venture progress through ideation milestone.`,

  rationale: `Current venture tables lack structure for tracking multi-stage, multi-agent execution.
Need dedicated tables for agent results, validation scores, and recursion state to enable autonomous operation.`,

  scope: `Database schema design and implementation:
- Extend ventures table metadata
- Create stage_executions tracking table
- Create agent_results storage table
- Create validation_scores history table
- Implement RLS policies for security
- Enable real-time subscriptions`,

  strategic_objectives: [
    'Design and implement stage_executions table for tracking venture progress',
    'Create agent_results table with JSONB storage for flexible result schemas',
    'Implement validation_scores table for historical scoring data',
    'Extend ventures.metadata JSONB with tier, archetype, recursion_state',
    'Configure RLS policies for row-level security',
    'Enable Supabase realtime subscriptions for progress monitoring',
    'Create database views for Chairman dashboard queries',
    'Implement indexes for performant queries'
  ],

  success_criteria: [
    'All 6 stages can store execution results in database',
    'Agent results queryable by venture_id, stage, agent_type',
    'Validation scores tracked with timestamps for trend analysis',
    'RLS policies prevent cross-tenant data access',
    'Realtime subscriptions update Chairman dashboard within 1 second',
    'Query performance <100ms for dashboard views',
    'Full audit trail for compliance requirements',
    'Database migrations versioned and reversible'
  ],

  dependencies: [
    { type: 'internal', sd_id: null, description: 'Existing ventures table in Supabase' },
    { type: 'internal', sd_id: null, description: 'Existing user authentication system' }
  ],

  risks: [
    { id: 'R1', description: 'JSONB queries may be slow without proper indexing', likelihood: 'medium', impact: 'medium', mitigation: 'Create GIN indexes on frequently queried JSONB paths' },
    { id: 'R2', description: 'Realtime subscriptions may cause performance issues at scale', likelihood: 'low', impact: 'medium', mitigation: 'Implement subscription throttling and selective column updates' }
  ],

  success_metrics: [
    { metric: 'query_latency_p95', target: '<100ms', description: '95th percentile query latency for dashboard views' },
    { metric: 'data_integrity', target: '100%', description: 'No orphaned records or referential integrity violations' },
    { metric: 'realtime_latency', target: '<1s', description: 'Time from database write to UI update' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-VISION-001',
    child_sd_ids: ['SD-IDEATION-STAGE1-001', 'SD-IDEATION-STAGE5-001'],
    sequence_order: 1,
    layer: 1,
    database_tables: {
      new: [
        { name: 'stage_executions', purpose: 'Track venture progress through stages', columns: ['id', 'venture_id', 'stage_number', 'stage_name', 'status', 'started_at', 'completed_at', 'result_summary', 'confidence_score', 'metadata'] },
        { name: 'agent_results', purpose: 'Store agent execution outputs', columns: ['id', 'venture_id', 'stage_number', 'agent_type', 'agent_name', 'result', 'confidence_score', 'execution_time_ms', 'cost_usd', 'created_at'] },
        { name: 'validation_scores', purpose: 'Historical validation scoring', columns: ['id', 'venture_id', 'stage_number', 'validation_type', 'score', 'max_score', 'details', 'validated_at'] }
      ],
      modified: [
        { name: 'ventures', changes: 'Extend metadata JSONB with tier, archetype, recursion_state, current_stage' }
      ]
    },
    rls_policies: [
      'stage_executions: users can only see their own ventures',
      'agent_results: read-only for venture owners',
      'validation_scores: read-only for venture owners'
    ]
  },

  created_by: 'LEAD'
};

// Foundation SD 2: CrewAI Agent Registry (Critical)
export const agentsFoundationSD = {
  id: 'SD-IDEATION-AGENTS-001',
  sd_key: 'IDEATION-AGENTS-001',
  title: 'CrewAI Agent Registry & Execution Infrastructure',
  version: '1.0',
  status: 'active',
  category: 'infrastructure',
  priority: 'critical',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-VISION-001',
  sd_type: 'infrastructure',

  description: `Establish CrewAI agent registry and execution infrastructure for Stages 1-6 autonomous operation.
Defines agent roles (Market Analyst, Pain Point Validator, Competitive Intel, etc.), configures hierarchical
crew orchestration, and implements execution tracking with cost management.`,

  strategic_intent: `Create scalable, cost-effective AI agent infrastructure that enables autonomous venture
analysis across all 6 ideation stages with proper orchestration and resource management.`,

  rationale: `Manual venture analysis is time-consuming and inconsistent. CrewAI provides proven multi-agent
orchestration framework with 5.76x performance improvement. Agent registry enables dynamic crew composition
based on venture tier and archetype.`,

  scope: `CrewAI integration and agent infrastructure:
- Agent registry with roles, goals, tools
- Crew configuration for hierarchical orchestration
- Execution tracking with cost attribution
- Result aggregation and confidence scoring
- Python FastAPI backend integration`,

  strategic_objectives: [
    'Deploy CrewAI framework with hierarchical crew process',
    'Create agent registry table with role definitions',
    'Implement 8+ agents for Stages 1-6 coverage',
    'Configure crew compositions per venture tier',
    'Build execution tracking with cost attribution',
    'Create result aggregation service',
    'Implement confidence scoring algorithm',
    'Enable dynamic crew scaling based on load'
  ],

  success_criteria: [
    'CrewAI framework operational in production',
    'Agent registry contains all required agents with proper configurations',
    'Crews execute with hierarchical process and manager delegation',
    'Execution costs tracked per agent, per venture',
    'Monthly API costs stay under budget ($150/month)',
    'Agent results aggregated into unified venture analysis',
    'Confidence scores reflect actual prediction accuracy',
    'System handles 10+ concurrent venture analyses'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-DATA-001', description: 'Database tables for agent results storage' },
    { type: 'external', description: 'OpenAI API for LLM execution' },
    { type: 'external', description: 'Python runtime environment' }
  ],

  risks: [
    { id: 'R1', description: 'CrewAI agent execution costs may exceed budget', likelihood: 'medium', impact: 'high', mitigation: 'Implement per-venture cost caps, use cheaper models for Tier 0' },
    { id: 'R2', description: 'Agent hallucinations may produce unreliable analysis', likelihood: 'medium', impact: 'high', mitigation: 'Implement fact-checking agents, require source citations' },
    { id: 'R3', description: 'Concurrent execution may cause rate limiting', likelihood: 'high', impact: 'medium', mitigation: 'Implement request queuing and backoff strategies' }
  ],

  success_metrics: [
    { metric: 'agent_success_rate', target: '>=95%', description: 'Percentage of agent executions completing successfully' },
    { metric: 'average_execution_time', target: '<5 min per stage', description: 'Average time for agent crew to complete stage analysis' },
    { metric: 'monthly_api_cost', target: '<$150', description: 'Total OpenAI API costs for agent execution' },
    { metric: 'confidence_calibration', target: '+-10%', description: 'Difference between predicted and actual accuracy' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-VISION-001',
    child_sd_ids: ['SD-IDEATION-STAGE2-001', 'SD-IDEATION-STAGE3-001', 'SD-IDEATION-STAGE4-001'],
    sequence_order: 2,
    layer: 1,
    crewai_configuration: {
      framework_version: 'crewai>=0.51.0',
      process_type: 'hierarchical',
      manager_llm: 'gpt-4o-mini',
      agent_llm_default: 'gpt-4o-mini',
      agent_llm_premium: 'gpt-4o',
      delegation_enabled: true
    },
    agent_registry: [
      { agent_id: 'market_sizing_analyst', role: 'Senior Market Intelligence Analyst', goal: 'Calculate TAM/SAM/SOM with high accuracy', stage_assignment: [2, 4], tools: ['market_data_api', 'calculator'], llm: 'gpt-4o-mini', estimated_cost: '$0.02-0.05' },
      { agent_id: 'pain_point_validator', role: 'Customer Insights Researcher', goal: 'Validate genuine customer pain points from social data', stage_assignment: [2, 3], tools: ['reddit_api', 'sentiment_analyzer'], llm: 'gpt-4o-mini', estimated_cost: '$0.03-0.08' },
      { agent_id: 'competitive_intel_mapper', role: 'Competitive Intelligence Specialist', goal: 'Map competitive landscape and differentiation opportunities', stage_assignment: [4], tools: ['web_search', 'company_database'], llm: 'gpt-4o', estimated_cost: '$0.05-0.15' },
      { agent_id: 'strategic_fit_analyzer', role: 'Strategic Portfolio Analyst', goal: 'Evaluate alignment with portfolio strategy', stage_assignment: [3, 4], tools: ['portfolio_analyzer', 'synergy_detector'], llm: 'gpt-4o-mini', estimated_cost: '$0.02-0.05' },
      { agent_id: 'financial_modeler', role: 'Financial Analyst', goal: 'Build unit economics and profitability forecasts', stage_assignment: [5], tools: ['financial_calculator', 'market_data_api'], llm: 'gpt-4o', estimated_cost: '$0.05-0.10' },
      { agent_id: 'risk_assessor', role: 'Risk Management Specialist', goal: 'Identify and quantify venture risks', stage_assignment: [6], tools: ['risk_framework', 'market_data_api'], llm: 'gpt-4o-mini', estimated_cost: '$0.03-0.06' },
      { agent_id: 'technical_validator', role: 'Technical Feasibility Analyst', goal: 'Assess technical requirements and complexity', stage_assignment: [3], tools: ['tech_stack_analyzer'], llm: 'gpt-4o-mini', estimated_cost: '$0.02-0.04' },
      { agent_id: 'systems_thinker', role: 'Systems Thinking Strategist', goal: 'Identify second and third-order effects', stage_assignment: [3, 6], tools: ['causal_loop_builder'], llm: 'gpt-4o', estimated_cost: '$0.05-0.10' }
    ],
    crew_compositions: {
      tier_0: ['market_sizing_analyst', 'pain_point_validator'],
      tier_1: ['market_sizing_analyst', 'pain_point_validator', 'competitive_intel_mapper', 'strategic_fit_analyzer', 'financial_modeler', 'risk_assessor'],
      tier_2: ['market_sizing_analyst', 'pain_point_validator', 'competitive_intel_mapper', 'strategic_fit_analyzer', 'financial_modeler', 'risk_assessor', 'technical_validator', 'systems_thinker']
    }
  },

  created_by: 'LEAD'
};

// Foundation SD 3: Recursion & Archetypes (High)
export const patternsFoundationSD = {
  id: 'SD-IDEATION-PATTERNS-001',
  sd_key: 'IDEATION-PATTERNS-001',
  title: 'Recursion Engine & Venture Archetypes',
  version: '1.0',
  status: 'active',
  category: 'product_feature',
  priority: 'high',
  target_application: 'EHG',
  current_phase: 'LEAD',
  parent_sd_id: 'SD-IDEATION-VISION-001',
  sd_type: 'feature',

  description: `Implement non-linear stage execution (Recursion Engine) and venture archetypes for
accelerated validation. Recursion enables Stage 5/6 findings to trigger return to Stage 3/4 for
refinement. Archetypes (SaaS B2B, Marketplace, E-commerce, Content) provide pre-configured validation
templates with industry-specific metrics and benchmarks.`,

  strategic_intent: `Enable intelligent, adaptive venture validation that responds to findings dynamically
rather than forcing linear progression. Archetypes reduce validation time by 40% through pre-configured templates.`,

  rationale: `Linear stage progression ignores the reality that later-stage findings often invalidate
earlier assumptions. Recursion allows the system to self-correct. Archetypes leverage patterns from
successful ventures to accelerate validation of similar ideas.`,

  scope: `Two major components:
1. Recursion Engine: Non-linear stage flow with convergence criteria
2. Venture Archetypes: Pre-configured templates with metrics and benchmarks`,

  strategic_objectives: [
    'Implement recursion triggers based on validation score thresholds',
    'Create recursion state machine with max 2 iterations default',
    'Build +10% quality improvement threshold for recursion convergence',
    'Define 4 venture archetypes: SaaS B2B, Marketplace, E-commerce, Content',
    'Create archetype-specific validation criteria and benchmarks',
    'Implement archetype detection from venture description',
    'Enable Chairman override for recursion control',
    'Track recursion history for learning optimization'
  ],

  success_criteria: [
    'Recursion triggers accurately when validation scores drop >15%',
    '90% of ventures converge within 2 recursion iterations',
    'Chairman can force progression to bypass recursion',
    'Archetype detection accuracy >=85%',
    'Archetype templates reduce validation time by 40%',
    'Custom archetype creation enabled for new patterns',
    'Recursion history informs future threshold tuning',
    'No infinite loops possible (hard cap at 3 iterations)'
  ],

  dependencies: [
    { type: 'internal', sd_id: 'SD-IDEATION-DATA-001', description: 'Stage execution tracking for recursion state' },
    { type: 'internal', sd_id: 'SD-IDEATION-AGENTS-001', description: 'Agent results to trigger recursion decisions' }
  ],

  risks: [
    { id: 'R1', description: 'Recursion may cause excessive delays for Chairman', likelihood: 'medium', impact: 'medium', mitigation: 'Implement Chairman override, show progress clearly' },
    { id: 'R2', description: 'Archetype detection may misclassify hybrid ventures', likelihood: 'high', impact: 'low', mitigation: 'Allow manual archetype selection, support multi-archetype' }
  ],

  success_metrics: [
    { metric: 'recursion_convergence_rate', target: '>=90%', description: 'Percentage of ventures converging within 2 iterations' },
    { metric: 'archetype_detection_accuracy', target: '>=85%', description: 'Accuracy of automatic archetype classification' },
    { metric: 'validation_time_reduction', target: '>=40%', description: 'Time savings from archetype templates vs generic' }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-VISION-001',
    child_sd_ids: ['SD-IDEATION-STAGE6-001'],
    sequence_order: 3,
    layer: 2,
    recursion_engine: {
      triggers: [
        { from_stage: 5, to_stage: 3, condition: 'unit_economics_invalid', threshold: 'profitability_score < 60%' },
        { from_stage: 6, to_stage: 4, condition: 'new_competitor_threat', threshold: 'competitive_position_change > 20%' },
        { from_stage: 6, to_stage: 3, condition: 'critical_risk_discovered', threshold: 'risk_score > 80%' }
      ],
      convergence_criteria: { quality_improvement_threshold: 0.10, max_iterations: 2, hard_cap: 3 },
      state_machine: { states: ['linear', 'recursing', 'converged', 'forced_exit'], transitions: ['trigger_recursion', 'quality_improved', 'max_iterations', 'chairman_override'] }
    },
    venture_archetypes: [
      { archetype_id: 'saas_b2b', name: 'SaaS B2B', description: 'Software-as-a-Service for business customers', key_metrics: ['MRR', 'CAC', 'LTV', 'Churn Rate', 'NRR'], benchmarks: { ltv_cac_ratio: '>3:1', monthly_churn: '<5%', gross_margin: '>70%' }, validation_focus: ['pain_point_severity', 'willingness_to_pay', 'switching_cost'], typical_stages: [1, 2, 3, 4, 5, 6] },
      { archetype_id: 'marketplace', name: 'Marketplace', description: 'Two-sided platform connecting buyers and sellers', key_metrics: ['GMV', 'Take Rate', 'Liquidity', 'Repeat Rate'], benchmarks: { take_rate: '10-30%', repeat_purchase_rate: '>40%', supplier_retention: '>80%' }, validation_focus: ['chicken_egg_problem', 'network_effects', 'disintermediation_risk'], typical_stages: [1, 2, 3, 4, 5, 6] },
      { archetype_id: 'ecommerce', name: 'E-commerce', description: 'Direct-to-consumer product sales', key_metrics: ['AOV', 'Conversion Rate', 'Return Rate', 'COGS'], benchmarks: { gross_margin: '>40%', conversion_rate: '>2%', return_rate: '<20%' }, validation_focus: ['product_differentiation', 'fulfillment_cost', 'brand_defensibility'], typical_stages: [1, 2, 3, 5] },
      { archetype_id: 'content', name: 'Content/Media', description: 'Content creation and distribution platform', key_metrics: ['MAU', 'DAU/MAU', 'Time on Site', 'Ad Revenue'], benchmarks: { dau_mau_ratio: '>20%', session_duration: '>5 min', ad_cpm: '>$5' }, validation_focus: ['content_moat', 'creator_economics', 'audience_retention'], typical_stages: [1, 2, 3, 4] }
    ]
  },

  created_by: 'LEAD'
};
