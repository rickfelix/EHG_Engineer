#!/usr/bin/env node

/**
 * Create EHG Ideation Milestone Strategic Directives
 *
 * Creates 1 vision parent SD + 3 foundation SDs + 6 stage SDs for Stages 1-6 vision.
 * Uses parent-child relationships (parent_sd_id) for proper hierarchy.
 *
 * Hierarchy:
 * SD-IDEATION-VISION-001 (PARENT)
 * ├── SD-IDEATION-DATA-001 (Foundation - Critical)
 * │   ├── SD-IDEATION-STAGE1-001 (Enhanced Idea Capture)
 * │   └── SD-IDEATION-STAGE5-001 (Profitability Forecasting)
 * ├── SD-IDEATION-AGENTS-001 (Foundation - Critical)
 * │   ├── SD-IDEATION-STAGE2-001 (AI Review)
 * │   ├── SD-IDEATION-STAGE3-001 (Comprehensive Validation)
 * │   └── SD-IDEATION-STAGE4-001 (Competitive Intelligence)
 * └── SD-IDEATION-PATTERNS-001 (Foundation - High)
 *     └── SD-IDEATION-STAGE6-001 (Risk Evaluation)
 *
 * Created: 2025-11-26 (EHG Stages 1-6 Vision Alignment)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// VISION PARENT SD
// ============================================================================
const visionParentSD = {
  id: 'SD-IDEATION-VISION-001',
  sd_key: 'IDEATION-VISION-001',
  title: 'EHG Stages 1-6 Ideation Milestone Vision',
  version: '1.1',
  status: 'active',
  category: 'strategic',
  priority: 'critical',
  target_application: 'EHG',
  current_phase: 'LEAD',
  sd_type: 'feature',  // Valid: feature, infrastructure, database, security, documentation

  description: `Comprehensive vision for EHG Stages 1-6 (Ideation Milestone) transformation.
This parent SD establishes the strategic direction for fully autonomous venture ideation with AI-orchestrated
validation, competitive intelligence, and risk assessment. The vision encompasses EHG Holdings architecture
(Chairman, EVA, Board of Directors, Portfolios, Companies, Ventures) with CrewAI agents serving as
AI executives and shared services under EHG Corporate.

Target State: Chairman submits venture idea → AI agents autonomously execute Stages 1-6 →
Chairman approves/rejects at Stage 3.4 gate (Kill/Revise/Proceed). Zero manual intervention required
between submission and gate decision.`,

  strategic_intent: `Transform EHG venture ideation from manual, human-dependent process to fully autonomous
AI-orchestrated pipeline. Establish foundation for 40-stage workflow automation with Stages 1-6 as proof of concept.`,

  rationale: `Current venture ideation requires significant Chairman time for research, validation, and analysis.
AI agents can conduct market research, validate pain points, analyze competitors, and assess risks faster and
more comprehensively than manual processes. This frees Chairman to focus on strategic decisions at gates only.`,

  scope: `EHG application Stages 1-6 (Ideation Milestone):
- Stage 1: Enhanced Ideation (idea capture + AI enhancement)
- Stage 2: AI Review (multi-agent analysis)
- Stage 3: Comprehensive Validation (market + technical + strategic)
- Stage 4: Competitive Intelligence (AI-powered market mapping)
- Stage 5: Profitability Forecasting (financial modeling)
- Stage 6: Risk Evaluation (threat assessment + mitigation)
- Stage 3.4 Gate: Kill/Revise/Proceed decision point`,

  strategic_objectives: [
    'Establish fully autonomous ideation pipeline requiring zero manual intervention between submission and gate',
    'Deploy CrewAI agent hierarchy: CEO, VPs, Managers as venture executives',
    'Implement shared services model (Marketing, Legal, Finance) under EHG Corporate',
    'Enable portfolio context injection for synergy detection across ventures',
    'Achieve <2 minute idea submission to agent deployment',
    'Complete full 6-stage analysis in 15-45 minutes (tier-dependent)',
    'Deliver ≥85% Chairman acceptance rate on AI recommendations',
    'Support graceful degradation when AI fails (expand manual controls)'
  ],

  success_criteria: [
    'Stages 1-6 execute without manual intervention',
    'CrewAI agents deployed and operational for all 6 stages',
    'Stage 3.4 gate presents actionable Kill/Revise/Proceed recommendation',
    'Portfolio context injected at Stage 4 (synergy detection)',
    'Venture archetypes (SaaS B2B, Marketplace, E-commerce, Content) accelerate validation',
    'Recursion engine enables non-linear stage flow (Stage 5→3 loops)',
    'All validation results stored in database (not markdown)',
    'Chairman dashboard shows real-time agent progress',
    'Error handling provides graceful degradation to manual controls'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: null,
      description: 'Supabase database with RLS policies configured'
    },
    {
      type: 'internal',
      sd_id: null,
      description: 'CrewAI framework installed and operational'
    },
    {
      type: 'external',
      description: 'OpenAI API access for embeddings and LLM calls'
    },
    {
      type: 'external',
      description: 'Reddit API for pain point validation'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'CrewAI agent execution may exceed cost budget',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Implement cost caps per venture, tier-based LLM model selection'
    },
    {
      id: 'R2',
      description: 'AI recommendations may not align with Chairman preferences',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Learning loop captures Chairman feedback, adjusts agent prompts'
    },
    {
      id: 'R3',
      description: 'External API rate limits may slow Stage 4 competitive intel',
      likelihood: 'high',
      impact: 'medium',
      mitigation: 'Cache results, implement queue-based processing, fallback to LLM research'
    },
    {
      id: 'R4',
      description: 'Complex ventures may require more than 2 recursion iterations',
      likelihood: 'low',
      impact: 'low',
      mitigation: 'Allow Chairman override to force progression'
    }
  ],

  success_metrics: [
    {
      metric: 'autonomous_execution_rate',
      target: '≥95%',
      description: 'Percentage of ventures completing Stages 1-6 without manual intervention'
    },
    {
      metric: 'chairman_acceptance_rate',
      target: '≥85%',
      description: 'Percentage of AI recommendations accepted by Chairman'
    },
    {
      metric: 'stage_completion_time',
      target: '15-45 min',
      description: 'Time from submission to Stage 6 completion (tier-dependent)'
    },
    {
      metric: 'agent_confidence_score',
      target: '≥80%',
      description: 'Average confidence score across all agent analyses'
    },
    {
      metric: 'cost_per_venture',
      target: '<$2.00',
      description: 'Average API cost for full 6-stage analysis'
    }
  ],

  metadata: {
    is_parent: true,
    child_sd_ids: [
      'SD-IDEATION-DATA-001',
      'SD-IDEATION-AGENTS-001',
      'SD-IDEATION-PATTERNS-001'
    ],
    grandchild_sd_ids: [
      'SD-IDEATION-STAGE1-001',
      'SD-IDEATION-STAGE2-001',
      'SD-IDEATION-STAGE3-001',
      'SD-IDEATION-STAGE4-001',
      'SD-IDEATION-STAGE5-001',
      'SD-IDEATION-STAGE6-001'
    ],
    vision_version: '1.1',
    ehg_holdings_architecture: {
      holding_company: 'EHG Holdings',
      corporate_entity: 'EHG Corporate (platform + shared services)',
      portfolio_structure: 'Portfolios → Companies → Ventures',
      ai_hierarchy: {
        chairman_assistant: 'EVA',
        board: 'Board of Directors (CrewAI agents)',
        company_leadership: 'AI CEO, VPs, Managers per company',
        shared_services: ['Marketing', 'Legal', 'Finance', 'Engineering']
      }
    },
    stage_mapping: {
      stage_1: 'SD-IDEATION-STAGE1-001',
      stage_2: 'SD-IDEATION-STAGE2-001',
      stage_3: 'SD-IDEATION-STAGE3-001',
      stage_4: 'SD-IDEATION-STAGE4-001',
      stage_5: 'SD-IDEATION-STAGE5-001',
      stage_6: 'SD-IDEATION-STAGE6-001'
    },
    implementation_layers: [
      'Layer 1 (Critical): Data Foundation + Agent Registry',
      'Layer 2 (High): Recursion Engine + Archetypes',
      'Layer 3 (High): Stage-specific implementations'
    ]
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// FOUNDATION SD 1: Data Foundation (Critical)
// ============================================================================
const dataFoundationSD = {
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
  sd_type: 'database',  // Database schema foundation

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
    {
      type: 'internal',
      sd_id: null,
      description: 'Existing ventures table in Supabase'
    },
    {
      type: 'internal',
      sd_id: null,
      description: 'Existing user authentication system'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'JSONB queries may be slow without proper indexing',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Create GIN indexes on frequently queried JSONB paths'
    },
    {
      id: 'R2',
      description: 'Realtime subscriptions may cause performance issues at scale',
      likelihood: 'low',
      impact: 'medium',
      mitigation: 'Implement subscription throttling and selective column updates'
    }
  ],

  success_metrics: [
    {
      metric: 'query_latency_p95',
      target: '<100ms',
      description: '95th percentile query latency for dashboard views'
    },
    {
      metric: 'data_integrity',
      target: '100%',
      description: 'No orphaned records or referential integrity violations'
    },
    {
      metric: 'realtime_latency',
      target: '<1s',
      description: 'Time from database write to UI update'
    }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-VISION-001',
    child_sd_ids: ['SD-IDEATION-STAGE1-001', 'SD-IDEATION-STAGE5-001'],
    sequence_order: 1,
    layer: 1,
    database_tables: {
      new: [
        {
          name: 'stage_executions',
          purpose: 'Track venture progress through stages',
          columns: ['id', 'venture_id', 'stage_number', 'stage_name', 'status', 'started_at', 'completed_at', 'result_summary', 'confidence_score', 'metadata']
        },
        {
          name: 'agent_results',
          purpose: 'Store agent execution outputs',
          columns: ['id', 'venture_id', 'stage_number', 'agent_type', 'agent_name', 'result', 'confidence_score', 'execution_time_ms', 'cost_usd', 'created_at']
        },
        {
          name: 'validation_scores',
          purpose: 'Historical validation scoring',
          columns: ['id', 'venture_id', 'stage_number', 'validation_type', 'score', 'max_score', 'details', 'validated_at']
        }
      ],
      modified: [
        {
          name: 'ventures',
          changes: 'Extend metadata JSONB with tier, archetype, recursion_state, current_stage'
        }
      ]
    },
    rls_policies: [
      'stage_executions: users can only see their own ventures',
      'agent_results: read-only for venture owners',
      'validation_scores: read-only for venture owners'
    ]
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// FOUNDATION SD 2: CrewAI Agent Registry (Critical)
// ============================================================================
const agentsFoundationSD = {
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
  sd_type: 'infrastructure',  // Agent infrastructure

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
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-DATA-001',
      description: 'Database tables for agent results storage'
    },
    {
      type: 'external',
      description: 'OpenAI API for LLM execution'
    },
    {
      type: 'external',
      description: 'Python runtime environment'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'CrewAI agent execution costs may exceed budget',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Implement per-venture cost caps, use cheaper models for Tier 0'
    },
    {
      id: 'R2',
      description: 'Agent hallucinations may produce unreliable analysis',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Implement fact-checking agents, require source citations'
    },
    {
      id: 'R3',
      description: 'Concurrent execution may cause rate limiting',
      likelihood: 'high',
      impact: 'medium',
      mitigation: 'Implement request queuing and backoff strategies'
    }
  ],

  success_metrics: [
    {
      metric: 'agent_success_rate',
      target: '≥95%',
      description: 'Percentage of agent executions completing successfully'
    },
    {
      metric: 'average_execution_time',
      target: '<5 min per stage',
      description: 'Average time for agent crew to complete stage analysis'
    },
    {
      metric: 'monthly_api_cost',
      target: '<$150',
      description: 'Total OpenAI API costs for agent execution'
    },
    {
      metric: 'confidence_calibration',
      target: '±10%',
      description: 'Difference between predicted and actual accuracy'
    }
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
      {
        agent_id: 'market_sizing_analyst',
        role: 'Senior Market Intelligence Analyst',
        goal: 'Calculate TAM/SAM/SOM with high accuracy',
        stage_assignment: [2, 4],
        tools: ['market_data_api', 'calculator'],
        llm: 'gpt-4o-mini',
        estimated_cost: '$0.02-0.05'
      },
      {
        agent_id: 'pain_point_validator',
        role: 'Customer Insights Researcher',
        goal: 'Validate genuine customer pain points from social data',
        stage_assignment: [2, 3],
        tools: ['reddit_api', 'sentiment_analyzer'],
        llm: 'gpt-4o-mini',
        estimated_cost: '$0.03-0.08'
      },
      {
        agent_id: 'competitive_intel_mapper',
        role: 'Competitive Intelligence Specialist',
        goal: 'Map competitive landscape and differentiation opportunities',
        stage_assignment: [4],
        tools: ['web_search', 'company_database'],
        llm: 'gpt-4o',
        estimated_cost: '$0.05-0.15'
      },
      {
        agent_id: 'strategic_fit_analyzer',
        role: 'Strategic Portfolio Analyst',
        goal: 'Evaluate alignment with portfolio strategy',
        stage_assignment: [3, 4],
        tools: ['portfolio_analyzer', 'synergy_detector'],
        llm: 'gpt-4o-mini',
        estimated_cost: '$0.02-0.05'
      },
      {
        agent_id: 'financial_modeler',
        role: 'Financial Analyst',
        goal: 'Build unit economics and profitability forecasts',
        stage_assignment: [5],
        tools: ['financial_calculator', 'market_data_api'],
        llm: 'gpt-4o',
        estimated_cost: '$0.05-0.10'
      },
      {
        agent_id: 'risk_assessor',
        role: 'Risk Management Specialist',
        goal: 'Identify and quantify venture risks',
        stage_assignment: [6],
        tools: ['risk_framework', 'market_data_api'],
        llm: 'gpt-4o-mini',
        estimated_cost: '$0.03-0.06'
      },
      {
        agent_id: 'technical_validator',
        role: 'Technical Feasibility Analyst',
        goal: 'Assess technical requirements and complexity',
        stage_assignment: [3],
        tools: ['tech_stack_analyzer'],
        llm: 'gpt-4o-mini',
        estimated_cost: '$0.02-0.04'
      },
      {
        agent_id: 'systems_thinker',
        role: 'Systems Thinking Strategist',
        goal: 'Identify second and third-order effects',
        stage_assignment: [3, 6],
        tools: ['causal_loop_builder'],
        llm: 'gpt-4o',
        estimated_cost: '$0.05-0.10'
      }
    ],
    crew_compositions: {
      tier_0: ['market_sizing_analyst', 'pain_point_validator'],
      tier_1: ['market_sizing_analyst', 'pain_point_validator', 'competitive_intel_mapper', 'strategic_fit_analyzer', 'financial_modeler', 'risk_assessor'],
      tier_2: ['market_sizing_analyst', 'pain_point_validator', 'competitive_intel_mapper', 'strategic_fit_analyzer', 'financial_modeler', 'risk_assessor', 'technical_validator', 'systems_thinker']
    }
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// FOUNDATION SD 3: Recursion & Archetypes (High)
// ============================================================================
const patternsFoundationSD = {
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
  sd_type: 'feature',  // Product feature (patterns & archetypes)

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
    'Archetype detection accuracy ≥85%',
    'Archetype templates reduce validation time by 40%',
    'Custom archetype creation enabled for new patterns',
    'Recursion history informs future threshold tuning',
    'No infinite loops possible (hard cap at 3 iterations)'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-DATA-001',
      description: 'Stage execution tracking for recursion state'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-AGENTS-001',
      description: 'Agent results to trigger recursion decisions'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Recursion may cause excessive delays for Chairman',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Implement Chairman override, show progress clearly'
    },
    {
      id: 'R2',
      description: 'Archetype detection may misclassify hybrid ventures',
      likelihood: 'high',
      impact: 'low',
      mitigation: 'Allow manual archetype selection, support multi-archetype'
    }
  ],

  success_metrics: [
    {
      metric: 'recursion_convergence_rate',
      target: '≥90%',
      description: 'Percentage of ventures converging within 2 iterations'
    },
    {
      metric: 'archetype_detection_accuracy',
      target: '≥85%',
      description: 'Accuracy of automatic archetype classification'
    },
    {
      metric: 'validation_time_reduction',
      target: '≥40%',
      description: 'Time savings from archetype templates vs generic'
    }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-VISION-001',
    child_sd_ids: ['SD-IDEATION-STAGE6-001'],
    sequence_order: 3,
    layer: 2,
    recursion_engine: {
      triggers: [
        {
          from_stage: 5,
          to_stage: 3,
          condition: 'unit_economics_invalid',
          threshold: 'profitability_score < 60%'
        },
        {
          from_stage: 6,
          to_stage: 4,
          condition: 'new_competitor_threat',
          threshold: 'competitive_position_change > 20%'
        },
        {
          from_stage: 6,
          to_stage: 3,
          condition: 'critical_risk_discovered',
          threshold: 'risk_score > 80%'
        }
      ],
      convergence_criteria: {
        quality_improvement_threshold: 0.10,
        max_iterations: 2,
        hard_cap: 3
      },
      state_machine: {
        states: ['linear', 'recursing', 'converged', 'forced_exit'],
        transitions: ['trigger_recursion', 'quality_improved', 'max_iterations', 'chairman_override']
      }
    },
    venture_archetypes: [
      {
        archetype_id: 'saas_b2b',
        name: 'SaaS B2B',
        description: 'Software-as-a-Service for business customers',
        key_metrics: ['MRR', 'CAC', 'LTV', 'Churn Rate', 'NRR'],
        benchmarks: {
          ltv_cac_ratio: '>3:1',
          monthly_churn: '<5%',
          gross_margin: '>70%'
        },
        validation_focus: ['pain_point_severity', 'willingness_to_pay', 'switching_cost'],
        typical_stages: [1, 2, 3, 4, 5, 6]
      },
      {
        archetype_id: 'marketplace',
        name: 'Marketplace',
        description: 'Two-sided platform connecting buyers and sellers',
        key_metrics: ['GMV', 'Take Rate', 'Liquidity', 'Repeat Rate'],
        benchmarks: {
          take_rate: '10-30%',
          repeat_purchase_rate: '>40%',
          supplier_retention: '>80%'
        },
        validation_focus: ['chicken_egg_problem', 'network_effects', 'disintermediation_risk'],
        typical_stages: [1, 2, 3, 4, 5, 6]
      },
      {
        archetype_id: 'ecommerce',
        name: 'E-commerce',
        description: 'Direct-to-consumer product sales',
        key_metrics: ['AOV', 'Conversion Rate', 'Return Rate', 'COGS'],
        benchmarks: {
          gross_margin: '>40%',
          conversion_rate: '>2%',
          return_rate: '<20%'
        },
        validation_focus: ['product_differentiation', 'fulfillment_cost', 'brand_defensibility'],
        typical_stages: [1, 2, 3, 5]
      },
      {
        archetype_id: 'content',
        name: 'Content/Media',
        description: 'Content creation and distribution platform',
        key_metrics: ['MAU', 'DAU/MAU', 'Time on Site', 'Ad Revenue'],
        benchmarks: {
          dau_mau_ratio: '>20%',
          session_duration: '>5 min',
          ad_cpm: '>$5'
        },
        validation_focus: ['content_moat', 'creator_economics', 'audience_retention'],
        typical_stages: [1, 2, 3, 4]
      }
    ]
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 1: Enhanced Ideation
// ============================================================================
const stage1SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    'Voice capture accuracy ≥95%',
    'AI enhancement improves description quality by ≥50% (measured by completeness)',
    'Archetype detection accuracy ≥85%',
    'Tier recommendation accepted by Chairman ≥80% of time',
    'Total Stage 1 completion time <2 minutes',
    'Chairman can revert to original description if preferred',
    'Structured output passes Stage 2 input validation'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-DATA-001',
      description: 'Ventures table metadata extensions'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'AI enhancement may change Chairman intent',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Always show diff, allow revert, preserve original'
    }
  ],

  success_metrics: [
    {
      metric: 'enhancement_acceptance_rate',
      target: '≥85%',
      description: 'Percentage of AI enhancements accepted by Chairman'
    },
    {
      metric: 'stage1_completion_time',
      target: '<2 min',
      description: 'Average time from start to Stage 1 completion'
    }
  ],

  metadata: {
    parent_sd_id: 'SD-IDEATION-DATA-001',
    stage_number: 1,
    stage_name: 'Enhanced Ideation',
    sequence_order: 1,
    layer: 3,
    existing_component: 'Stage1Enhanced.tsx',
    modifications: [
      'Add AI enhancement service call',
      'Integrate archetype detection',
      'Add tier recommendation UI',
      'Store structured output to stage_executions'
    ]
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 2: AI Review
// ============================================================================
const stage2SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-AGENTS-001',
      description: 'CrewAI agent registry and execution infrastructure'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-STAGE1-001',
      description: 'Structured output from Stage 1'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Agent timeout may block venture progression',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Implement 5-minute timeout with graceful fallback'
    }
  ],

  success_metrics: [
    {
      metric: 'agent_completion_rate',
      target: '≥95%',
      description: 'Percentage of Stage 2 analyses completing successfully'
    },
    {
      metric: 'stage2_duration',
      target: '<5 min',
      description: 'Time from Stage 2 start to completion'
    }
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

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 3: Comprehensive Validation
// ============================================================================
const stage3SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    'Gate recommendation accuracy ≥85% (vs Chairman decision)',
    'Second-order effects identified for ≥80% of ventures',
    'Technical feasibility assessment includes effort estimate',
    'Portfolio synergies identified when present',
    'Stage 3 completes within 10 minutes',
    'Gate presentation includes actionable revision suggestions'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-AGENTS-001',
      description: 'Agent crews for validation dimensions'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-STAGE2-001',
      description: 'Preliminary assessment from Stage 2'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Gate recommendation may conflict with Chairman intuition',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Show full reasoning, always allow Chairman override'
    }
  ],

  success_metrics: [
    {
      metric: 'gate_recommendation_accuracy',
      target: '≥85%',
      description: 'Percentage of recommendations aligned with Chairman decision'
    },
    {
      metric: 'stage3_duration',
      target: '<10 min',
      description: 'Time from Stage 3 start to completion'
    }
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

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 4: Competitive Intelligence
// ============================================================================
const stage4SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    'Competitive map includes ≥5 direct competitors',
    'Each competitor has strength/weakness analysis',
    'Differentiation opportunities are actionable',
    'Portfolio synergies identified when present',
    'Competitive intelligence loads async (not blocking)',
    'Stage 4 completes within 8 minutes',
    'Data sources cited for verification'
  ],

  dependencies: [
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-AGENTS-001',
      description: 'Competitive Intel Mapper agent'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-STAGE3-001',
      description: 'Validated venture data from Stage 3'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Competitive data may be outdated',
      likelihood: 'medium',
      impact: 'medium',
      mitigation: 'Include data freshness indicator, allow manual refresh'
    }
  ],

  success_metrics: [
    {
      metric: 'competitor_coverage',
      target: '≥5 direct',
      description: 'Number of direct competitors identified'
    },
    {
      metric: 'stage4_duration',
      target: '<8 min',
      description: 'Time from Stage 4 start to completion'
    }
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

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 5: Profitability Forecasting
// ============================================================================
const stage5SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-DATA-001',
      description: 'Database tables for financial projections'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-PATTERNS-001',
      description: 'Archetype benchmarks for validation'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-STAGE4-001',
      description: 'Market data and competitive context'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Financial projections may be overly optimistic',
      likelihood: 'high',
      impact: 'medium',
      mitigation: 'Apply conservative archetype benchmarks, show range'
    }
  ],

  success_metrics: [
    {
      metric: 'projection_accuracy',
      target: '±30%',
      description: 'Historical accuracy of projections vs actuals'
    },
    {
      metric: 'stage5_duration',
      target: '<6 min',
      description: 'Time from Stage 5 start to completion'
    }
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

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// STAGE SD 6: Risk Evaluation
// ============================================================================
const stage6SD = {
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
  sd_type: 'feature',  // UI/UX stage feature

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
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-PATTERNS-001',
      description: 'Recursion engine for critical risk handling'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-AGENTS-001',
      description: 'Risk Assessor and Systems Thinker agents'
    },
    {
      type: 'internal',
      sd_id: 'SD-IDEATION-STAGE5-001',
      description: 'Financial projections for financial risk context'
    }
  ],

  risks: [
    {
      id: 'R1',
      description: 'Risk assessment may miss novel risk categories',
      likelihood: 'low',
      impact: 'high',
      mitigation: 'Include open-ended risk identification, learn from Chairman additions'
    }
  ],

  success_metrics: [
    {
      metric: 'risk_coverage',
      target: '4 dimensions',
      description: 'All risk dimensions assessed'
    },
    {
      metric: 'stage6_duration',
      target: '<8 min',
      description: 'Time from Stage 6 start to completion'
    },
    {
      metric: 'recursion_trigger_accuracy',
      target: '≥90%',
      description: 'Accuracy of recursion trigger decisions'
    }
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
      {
        condition: 'critical_risk_discovered',
        threshold: 'risk_score > 80%',
        target_stage: 3
      },
      {
        condition: 'new_competitor_threat',
        threshold: 'competitive_position_change > 20%',
        target_stage: 4
      }
    ],
    milestone_completion: true,
    milestone_name: 'Ideation Milestone',
    next_milestone: 'Development Milestone (Stages 7-15)'
  },

  created_by: 'LEAD',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function createIdeationMilestoneSDs() {
  console.log('========================================================');
  console.log('🚀 Creating EHG Ideation Milestone Strategic Directives');
  console.log('========================================================\n');

  const allSDs = [
    { sd: visionParentSD, type: 'VISION PARENT' },
    { sd: dataFoundationSD, type: 'FOUNDATION (Data)' },
    { sd: agentsFoundationSD, type: 'FOUNDATION (Agents)' },
    { sd: patternsFoundationSD, type: 'FOUNDATION (Patterns)' },
    { sd: stage1SD, type: 'STAGE 1' },
    { sd: stage2SD, type: 'STAGE 2' },
    { sd: stage3SD, type: 'STAGE 3' },
    { sd: stage4SD, type: 'STAGE 4' },
    { sd: stage5SD, type: 'STAGE 5' },
    { sd: stage6SD, type: 'STAGE 6' }
  ];

  const results = {
    created: [],
    updated: [],
    failed: []
  };

  for (const { sd, type } of allSDs) {
    console.log(`\n📋 Processing ${type}: ${sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   Parent: ${sd.parent_sd_id || 'None (Root)'}`);

    try {
      // Check if SD exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', sd.id)
        .single();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update({
            ...sd,
            updated_at: new Date().toISOString()
          })
          .eq('id', sd.id);

        if (error) throw error;
        console.log('   ✅ Updated existing SD');
        results.updated.push(sd.id);
      } else {
        // Insert new
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert(sd);

        if (error) throw error;
        console.log('   ✅ Created new SD');
        results.created.push(sd.id);
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.failed.push({ id: sd.id, error: error.message });
    }
  }

  // Summary
  console.log('\n========================================================');
  console.log('📊 CREATION SUMMARY');
  console.log('========================================================');
  console.log(`✅ Created: ${results.created.length}`);
  results.created.forEach(id => console.log(`   - ${id}`));
  console.log(`🔄 Updated: ${results.updated.length}`);
  results.updated.forEach(id => console.log(`   - ${id}`));
  console.log(`❌ Failed: ${results.failed.length}`);
  results.failed.forEach(({ id, error }) => console.log(`   - ${id}: ${error}`));

  console.log('\n========================================================');
  console.log('🏗️  HIERARCHY STRUCTURE');
  console.log('========================================================');
  console.log(`
SD-IDEATION-VISION-001 (PARENT - Critical)
├── SD-IDEATION-DATA-001 (Foundation - Critical)
│   ├── SD-IDEATION-STAGE1-001 (Stage 1: Enhanced Ideation)
│   └── SD-IDEATION-STAGE5-001 (Stage 5: Profitability Forecasting)
├── SD-IDEATION-AGENTS-001 (Foundation - Critical)
│   ├── SD-IDEATION-STAGE2-001 (Stage 2: AI Review)
│   ├── SD-IDEATION-STAGE3-001 (Stage 3: Comprehensive Validation)
│   └── SD-IDEATION-STAGE4-001 (Stage 4: Competitive Intelligence)
└── SD-IDEATION-PATTERNS-001 (Foundation - High)
    └── SD-IDEATION-STAGE6-001 (Stage 6: Risk Evaluation)
  `);

  console.log('========================================================');
  console.log('🎯 NEXT STEPS');
  console.log('========================================================');
  console.log('1. Archive existing SDs that conflict with new vision');
  console.log('2. Create backlog items in sd_backlog_map for each SD');
  console.log('3. Begin PLAN phase for Layer 1 SDs (DATA + AGENTS)');
  console.log('4. Transition VISION SD to approved status after review');

  return results;
}

// Execute
createIdeationMilestoneSDs()
  .then(results => {
    if (results.failed.length === 0) {
      console.log('\n✅ All Strategic Directives created successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some Strategic Directives failed to create');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  });
