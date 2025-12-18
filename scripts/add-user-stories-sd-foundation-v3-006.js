#!/usr/bin/env node

/**
 * Add User Stories for SD-FOUNDATION-V3-006
 * 25-Stage Crew Mapping Completion
 *
 * Extends STAGE_CREW_MAP to support all 25 venture lifecycle stages
 * Currently only stages 1-6 have crew mappings
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

const SD_ID = 'SD-FOUNDATION-V3-006';
const PRD_ID = 'PRD-SD-FOUNDATION-V3-006';

const stories = [
  {
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Define Crew Types for THE_ENGINE Phase (Stages 7-9)',
    user_role: 'System Architect',
    user_want: 'crew type configurations for BUSINESS_MODEL, TECHNICAL_VALIDATION, and OPERATIONS_DESIGN crews',
    user_benefit: 'ventures can progress through THE_ENGINE phase with appropriate specialized crews handling each stage',
    status: 'draft',
    priority: 'critical',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - BUSINESS_MODEL crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'BUSINESS_MODEL crew config is added',
        then: 'Config includes crew_id "BUSINESS_MODEL", responsibility "Revenue model design and validation", capabilities ["business_planning", "financial_modeling", "revenue_strategy"], and required_agents ["business_analyst", "financial_planner"]',
      },
      {
        id: 'AC-001-2',
        scenario: 'Happy path - TECHNICAL_VALIDATION crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'TECHNICAL_VALIDATION crew config is added',
        then: 'Config includes crew_id "TECHNICAL_VALIDATION", responsibility "Technical feasibility assessment and validation", capabilities ["architecture_review", "tech_stack_validation", "scalability_assessment"], and required_agents ["tech_lead", "architect"]',
      },
      {
        id: 'AC-001-3',
        scenario: 'Happy path - OPERATIONS_DESIGN crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'OPERATIONS_DESIGN crew config is added',
        then: 'Config includes crew_id "OPERATIONS_DESIGN", responsibility "Operational process design and workflow planning", capabilities ["process_design", "workflow_automation", "efficiency_optimization"], and required_agents ["operations_specialist", "process_engineer"]',
      },
      {
        id: 'AC-001-4',
        scenario: 'Validation - TypeScript compilation',
        given: 'New crew configs are added to CREW_REGISTRY',
        when: 'TypeScript compiler runs',
        then: 'No type errors AND crew configs match CrewConfig interface',
      },
      {
        id: 'AC-001-5',
        scenario: 'Unit test - Crew registry lookup',
        given: 'New crew types are in CREW_REGISTRY',
        when: 'getCrewConfig("BUSINESS_MODEL") is called',
        then: 'Returns valid crew config with all required fields',
      }
    ],
    definition_of_done: [
      'CREW_REGISTRY contains BUSINESS_MODEL crew config',
      'CREW_REGISTRY contains TECHNICAL_VALIDATION crew config',
      'CREW_REGISTRY contains OPERATIONS_DESIGN crew config',
      'TypeScript compilation succeeds with no errors',
      'Unit tests pass for getCrewConfig() with new crew types',
      'Code review approved by architect'
    ],
    technical_notes: 'THE_ENGINE phase (stages 7-9) focuses on validating business model viability, technical feasibility, and operational readiness before moving to THE_IDENTITY phase. Each crew has distinct responsibilities and capabilities aligned with phase objectives.',
    implementation_approach: 'Add three new crew configs to CREW_REGISTRY constant in evaTaskContracts.ts. Follow existing pattern from DISCOVERY, CONCEPT_VALIDATION crews. Ensure crew_id matches enum values if CrewType is typed.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("BUSINESS_MODEL") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("TECHNICAL_VALIDATION") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("OPERATIONS_DESIGN") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P1',
        scenario: 'TypeScript type checking passes for all crew configs'
      }
    ],
    implementation_context: 'FR-1: Crew type definitions. THE_ENGINE phase is the third major phase in 25-stage protocol, focusing on business and technical validation before identity/brand work begins.',
    architecture_references: [
      'lib/evaTaskContracts.ts - CREW_REGISTRY constant (add new entries)',
      'lib/evaTaskContracts.ts - CrewConfig interface (reference for structure)',
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP (will be updated in US-006)',
      'Database: venture_stages table - stage metadata for stages 7-9'
    ],
    example_code_patterns: {
      crew_config_example: `// In lib/evaTaskContracts.ts - CREW_REGISTRY
export const CREW_REGISTRY: Record<string, CrewConfig> = {
  // ... existing crews (DISCOVERY, CONCEPT_VALIDATION, etc.)

  // NEW: THE_ENGINE Phase Crews (Stages 7-9)
  BUSINESS_MODEL: {
    crew_id: 'BUSINESS_MODEL',
    responsibility: 'Revenue model design and validation',
    capabilities: [
      'business_planning',
      'financial_modeling',
      'revenue_strategy',
      'pricing_strategy',
      'unit_economics'
    ],
    required_agents: ['business_analyst', 'financial_planner'],
    optional_agents: ['marketing_strategist'],
    parallel_execution_allowed: false,
    typical_stage_assignment: 7
  },

  TECHNICAL_VALIDATION: {
    crew_id: 'TECHNICAL_VALIDATION',
    responsibility: 'Technical feasibility assessment and validation',
    capabilities: [
      'architecture_review',
      'tech_stack_validation',
      'scalability_assessment',
      'security_review',
      'performance_analysis'
    ],
    required_agents: ['tech_lead', 'architect'],
    optional_agents: ['security_specialist', 'devops_engineer'],
    parallel_execution_allowed: false,
    typical_stage_assignment: 8
  },

  OPERATIONS_DESIGN: {
    crew_id: 'OPERATIONS_DESIGN',
    responsibility: 'Operational process design and workflow planning',
    capabilities: [
      'process_design',
      'workflow_automation',
      'efficiency_optimization',
      'resource_planning',
      'capacity_planning'
    ],
    required_agents: ['operations_specialist', 'process_engineer'],
    optional_agents: ['automation_engineer'],
    parallel_execution_allowed: false,
    typical_stage_assignment: 9
  }
};`
    }
  },

  {
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Define Crew Types for THE_IDENTITY Phase (Stages 10-13)',
    user_role: 'System Architect',
    user_want: 'crew type configurations for BRAND_DEVELOPMENT and MARKET_POSITIONING crews',
    user_benefit: 'ventures can establish brand identity and market positioning with specialized crews',
    status: 'draft',
    priority: 'critical',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - BRAND_DEVELOPMENT crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'BRAND_DEVELOPMENT crew config is added',
        then: 'Config includes crew_id "BRAND_DEVELOPMENT", responsibility "Brand identity creation and guidelines", capabilities ["brand_strategy", "visual_identity", "messaging", "storytelling"], and required_agents ["brand_strategist", "creative_director"]',
      },
      {
        id: 'AC-002-2',
        scenario: 'Happy path - MARKET_POSITIONING crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'MARKET_POSITIONING crew config is added',
        then: 'Config includes crew_id "MARKET_POSITIONING", responsibility "Market analysis and competitive positioning", capabilities ["market_research", "competitive_analysis", "positioning_strategy", "customer_segmentation"], and required_agents ["market_analyst", "positioning_strategist"]',
      },
      {
        id: 'AC-002-3',
        scenario: 'Co-execution pattern - Stages 10-11 parallel work',
        given: 'BRAND_DEVELOPMENT handles stages 10-11',
        when: 'Stage 10 (Brand Foundation) and Stage 11 (Brand Guidelines) are mapped',
        then: 'Both stages map to BRAND_DEVELOPMENT crew AND crew config allows parallel work on related branding tasks',
      },
      {
        id: 'AC-002-4',
        scenario: 'Co-execution pattern - Stages 12-13 parallel work',
        given: 'MARKET_POSITIONING handles stages 12-13',
        when: 'Stage 12 (Market Analysis) and Stage 13 (Positioning Strategy) are mapped',
        then: 'Both stages map to MARKET_POSITIONING crew AND crew config allows parallel work on market research and positioning',
      }
    ],
    definition_of_done: [
      'CREW_REGISTRY contains BRAND_DEVELOPMENT crew config',
      'CREW_REGISTRY contains MARKET_POSITIONING crew config',
      'TypeScript compilation succeeds',
      'Unit tests pass for both crew configs',
      'Documentation explains stage assignments (10-11 brand, 12-13 positioning)',
      'Code review approved'
    ],
    technical_notes: 'THE_IDENTITY phase (stages 10-13) focuses on brand development and market positioning. BRAND_DEVELOPMENT crew handles stages 10-11 (foundation + guidelines), MARKET_POSITIONING crew handles stages 12-13 (analysis + strategy). Crews may work in parallel on related tasks.',
    implementation_approach: 'Add two new crew configs to CREW_REGISTRY. BRAND_DEVELOPMENT for stages 10-11, MARKET_POSITIONING for stages 12-13. Consider setting parallel_execution_allowed: true for these crews since brand and positioning work can happen concurrently.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("BRAND_DEVELOPMENT") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("MARKET_POSITIONING") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P1',
        scenario: 'Crews support parallel execution for stages 10-11 and 12-13'
      }
    ],
    implementation_context: 'FR-1: Crew type definitions for THE_IDENTITY phase. Brand and positioning crews work on venture identity establishment after engine validation.',
    architecture_references: [
      'lib/evaTaskContracts.ts - CREW_REGISTRY constant',
      'lib/evaTaskContracts.ts - STAGE_CO_EXECUTION_MAP (document parallel patterns)',
      'Database: venture_stages table - stage metadata for stages 10-13'
    ],
    example_code_patterns: {
      identity_crews: `// THE_IDENTITY Phase Crews (Stages 10-13)
BRAND_DEVELOPMENT: {
  crew_id: 'BRAND_DEVELOPMENT',
  responsibility: 'Brand identity creation and guidelines',
  capabilities: [
    'brand_strategy',
    'visual_identity',
    'messaging',
    'storytelling',
    'tone_of_voice',
    'brand_guidelines'
  ],
  required_agents: ['brand_strategist', 'creative_director'],
  optional_agents: ['copywriter', 'designer'],
  parallel_execution_allowed: true, // Stages 10-11 can run concurrently
  typical_stage_assignment: [10, 11]
},

MARKET_POSITIONING: {
  crew_id: 'MARKET_POSITIONING',
  responsibility: 'Market analysis and competitive positioning',
  capabilities: [
    'market_research',
    'competitive_analysis',
    'positioning_strategy',
    'customer_segmentation',
    'value_proposition',
    'differentiation_strategy'
  ],
  required_agents: ['market_analyst', 'positioning_strategist'],
  optional_agents: ['data_analyst', 'customer_insights_specialist'],
  parallel_execution_allowed: true, // Stages 12-13 can run concurrently
  typical_stage_assignment: [12, 13]
}`
    }
  },

  {
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Define Crew Types for THE_BLUEPRINT Phase (Stages 14-18)',
    user_role: 'System Architect',
    user_want: 'crew type configurations for PRODUCT_DESIGN, ENGINEERING_SPEC, and ARCHITECTURE crews',
    user_benefit: 'ventures can create detailed product specifications and architecture before development',
    status: 'draft',
    priority: 'critical',
    story_points: 8,
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - PRODUCT_DESIGN crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'PRODUCT_DESIGN crew config is added',
        then: 'Config includes crew_id "PRODUCT_DESIGN", responsibility "Product design and UX specification", capabilities ["ui_design", "ux_design", "wireframing", "prototyping", "design_systems"], and required_agents ["product_designer", "ux_researcher"]',
      },
      {
        id: 'AC-003-2',
        scenario: 'Happy path - ENGINEERING_SPEC crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'ENGINEERING_SPEC crew config is added',
        then: 'Config includes crew_id "ENGINEERING_SPEC", responsibility "Technical specification and API design", capabilities ["api_design", "data_modeling", "integration_planning", "technical_documentation"], and required_agents ["tech_lead", "solutions_architect"]',
      },
      {
        id: 'AC-003-3',
        scenario: 'Happy path - ARCHITECTURE crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'ARCHITECTURE crew config is added',
        then: 'Config includes crew_id "ARCHITECTURE", responsibility "System architecture design and infrastructure planning", capabilities ["system_design", "infrastructure_planning", "scalability_design", "security_architecture"], and required_agents ["architect", "infrastructure_engineer"]',
      },
      {
        id: 'AC-003-4',
        scenario: 'Stage assignment - Multi-stage crews',
        given: 'PRODUCT_DESIGN and ENGINEERING_SPEC handle multiple stages',
        when: 'Stage assignments are configured',
        then: 'PRODUCT_DESIGN handles stages 14-15 AND ENGINEERING_SPEC handles stages 16-17 AND ARCHITECTURE handles stage 18 only',
      }
    ],
    definition_of_done: [
      'CREW_REGISTRY contains PRODUCT_DESIGN crew config (stages 14-15)',
      'CREW_REGISTRY contains ENGINEERING_SPEC crew config (stages 16-17)',
      'CREW_REGISTRY contains ARCHITECTURE crew config (stage 18)',
      'TypeScript compilation succeeds',
      'Unit tests pass for all three crew configs',
      'Documentation explains sequential blueprint workflow',
      'Code review approved'
    ],
    technical_notes: 'THE_BLUEPRINT phase (stages 14-18) creates detailed specifications before development. Sequential flow: Product Design (14-15) → Engineering Spec (16-17) → Architecture (18). Design outputs feed into engineering specs, which feed into architecture decisions. No parallel execution recommended due to dependencies.',
    implementation_approach: 'Add three crew configs to CREW_REGISTRY. Set parallel_execution_allowed: false for all three since they have sequential dependencies. PRODUCT_DESIGN outputs inform ENGINEERING_SPEC, which informs ARCHITECTURE.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'All three BLUEPRINT crew configs validate correctly'
      },
      {
        type: 'unit',
        priority: 'P1',
        scenario: 'Sequential stage assignment (14-15, 16-17, 18) is documented'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'dispatchStageTask() correctly assigns crews for stages 14-18'
      }
    ],
    implementation_context: 'FR-1: Crew type definitions for THE_BLUEPRINT phase. Critical pre-development phase that prevents "build the wrong thing" failures.',
    architecture_references: [
      'lib/evaTaskContracts.ts - CREW_REGISTRY constant',
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP (will reference these crews)',
      'Database: venture_stages table - stage metadata for stages 14-18',
      'docs/25-stage-protocol.md - THE_BLUEPRINT phase documentation'
    ],
    example_code_patterns: {
      blueprint_crews: `// THE_BLUEPRINT Phase Crews (Stages 14-18)
PRODUCT_DESIGN: {
  crew_id: 'PRODUCT_DESIGN',
  responsibility: 'Product design and UX specification',
  capabilities: [
    'ui_design',
    'ux_design',
    'wireframing',
    'prototyping',
    'design_systems',
    'user_flows',
    'interaction_design'
  ],
  required_agents: ['product_designer', 'ux_researcher'],
  optional_agents: ['ui_designer', 'design_systems_specialist'],
  parallel_execution_allowed: false, // Sequential: Design → Spec → Architecture
  typical_stage_assignment: [14, 15],
  outputs: ['design_mockups', 'user_flows', 'design_system_spec']
},

ENGINEERING_SPEC: {
  crew_id: 'ENGINEERING_SPEC',
  responsibility: 'Technical specification and API design',
  capabilities: [
    'api_design',
    'data_modeling',
    'integration_planning',
    'technical_documentation',
    'schema_design',
    'endpoint_specification'
  ],
  required_agents: ['tech_lead', 'solutions_architect'],
  optional_agents: ['api_designer', 'database_architect'],
  parallel_execution_allowed: false,
  typical_stage_assignment: [16, 17],
  inputs_from: ['PRODUCT_DESIGN'], // Depends on design outputs
  outputs: ['api_spec', 'data_models', 'integration_docs']
},

ARCHITECTURE: {
  crew_id: 'ARCHITECTURE',
  responsibility: 'System architecture design and infrastructure planning',
  capabilities: [
    'system_design',
    'infrastructure_planning',
    'scalability_design',
    'security_architecture',
    'performance_architecture',
    'deployment_architecture'
  ],
  required_agents: ['architect', 'infrastructure_engineer'],
  optional_agents: ['security_architect', 'devops_lead'],
  parallel_execution_allowed: false,
  typical_stage_assignment: 18,
  inputs_from: ['ENGINEERING_SPEC'], // Depends on engineering spec
  outputs: ['architecture_diagram', 'infrastructure_plan', 'security_design']
}`
    }
  },

  {
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Define Crew Types for THE_BUILD_LOOP Phase (Stages 19-23)',
    user_role: 'System Architect',
    user_want: 'crew type configurations for DEVELOPMENT, QA_VALIDATION, and DEPLOYMENT crews',
    user_benefit: 'ventures can execute iterative build cycles with proper development, testing, and deployment workflows',
    status: 'draft',
    priority: 'critical',
    story_points: 8,
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - DEVELOPMENT crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'DEVELOPMENT crew config is added',
        then: 'Config includes crew_id "DEVELOPMENT", responsibility "Code implementation and feature development", capabilities ["frontend_dev", "backend_dev", "database_dev", "api_implementation"], and required_agents ["developer", "tech_lead"]',
      },
      {
        id: 'AC-004-2',
        scenario: 'Happy path - QA_VALIDATION crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'QA_VALIDATION crew config is added',
        then: 'Config includes crew_id "QA_VALIDATION", responsibility "Quality assurance and testing validation", capabilities ["unit_testing", "integration_testing", "e2e_testing", "performance_testing"], and required_agents ["qa_engineer", "test_automation_engineer"]',
      },
      {
        id: 'AC-004-3',
        scenario: 'Happy path - DEPLOYMENT crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'DEPLOYMENT crew config is added',
        then: 'Config includes crew_id "DEPLOYMENT", responsibility "Deployment automation and release management", capabilities ["ci_cd", "release_automation", "environment_management", "rollback_procedures"], and required_agents ["devops_engineer", "release_manager"]',
      },
      {
        id: 'AC-004-4',
        scenario: 'Build loop workflow - Sequential execution',
        given: 'THE_BUILD_LOOP is an iterative phase',
        when: 'Stages 19-23 are configured',
        then: 'DEVELOPMENT (19-20) → QA_VALIDATION (21-22) → DEPLOYMENT (23) follows sequential workflow AND supports multiple iterations',
      }
    ],
    definition_of_done: [
      'CREW_REGISTRY contains DEVELOPMENT crew config (stages 19-20)',
      'CREW_REGISTRY contains QA_VALIDATION crew config (stages 21-22)',
      'CREW_REGISTRY contains DEPLOYMENT crew config (stage 23)',
      'TypeScript compilation succeeds',
      'Unit tests pass for all three crew configs',
      'Documentation explains iterative build loop pattern',
      'Code review approved'
    ],
    technical_notes: 'THE_BUILD_LOOP phase (stages 19-23) is iterative: Development (19-20) → QA (21-22) → Deployment (23). Loop repeats until MVP ready. Each crew has distinct responsibilities in continuous delivery pipeline. QA failures loop back to Development, Deployment failures loop back to QA.',
    implementation_approach: 'Add three crew configs to CREW_REGISTRY. Set parallel_execution_allowed: false for sequential workflow. Document loop-back patterns for failures. Consider adding iteration tracking to crew configs.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'All three BUILD_LOOP crew configs validate correctly'
      },
      {
        type: 'integration',
        priority: 'P0',
        scenario: 'dispatchStageTask() correctly assigns crews for stages 19-23'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'Build loop iteration tracking works (multiple passes through 19-23)'
      }
    ],
    implementation_context: 'FR-1: Crew type definitions for THE_BUILD_LOOP phase. Core development phase with iterative dev→test→deploy cycles.',
    architecture_references: [
      'lib/evaTaskContracts.ts - CREW_REGISTRY constant',
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP (will reference these crews)',
      'Database: venture_stages table - stage metadata for stages 19-23',
      'docs/25-stage-protocol.md - THE_BUILD_LOOP phase documentation'
    ],
    example_code_patterns: {
      build_loop_crews: `// THE_BUILD_LOOP Phase Crews (Stages 19-23)
DEVELOPMENT: {
  crew_id: 'DEVELOPMENT',
  responsibility: 'Code implementation and feature development',
  capabilities: [
    'frontend_dev',
    'backend_dev',
    'database_dev',
    'api_implementation',
    'code_review',
    'refactoring'
  ],
  required_agents: ['developer', 'tech_lead'],
  optional_agents: ['frontend_specialist', 'backend_specialist'],
  parallel_execution_allowed: false, // Sequential in build loop
  typical_stage_assignment: [19, 20],
  loop_role: 'BUILD', // Part of iterative loop
  outputs: ['implemented_features', 'code_commits', 'pr_reviews']
},

QA_VALIDATION: {
  crew_id: 'QA_VALIDATION',
  responsibility: 'Quality assurance and testing validation',
  capabilities: [
    'unit_testing',
    'integration_testing',
    'e2e_testing',
    'performance_testing',
    'regression_testing',
    'test_automation'
  ],
  required_agents: ['qa_engineer', 'test_automation_engineer'],
  optional_agents: ['performance_tester', 'security_tester'],
  parallel_execution_allowed: false,
  typical_stage_assignment: [21, 22],
  loop_role: 'TEST', // Part of iterative loop
  inputs_from: ['DEVELOPMENT'],
  outputs: ['test_reports', 'bug_reports', 'qa_approval'],
  failure_action: 'LOOP_BACK_TO_DEVELOPMENT' // On test failures
},

DEPLOYMENT: {
  crew_id: 'DEPLOYMENT',
  responsibility: 'Deployment automation and release management',
  capabilities: [
    'ci_cd',
    'release_automation',
    'environment_management',
    'rollback_procedures',
    'monitoring_setup',
    'deployment_verification'
  ],
  required_agents: ['devops_engineer', 'release_manager'],
  optional_agents: ['sre', 'infrastructure_engineer'],
  parallel_execution_allowed: false,
  typical_stage_assignment: 23,
  loop_role: 'DEPLOY', // Final step in iterative loop
  inputs_from: ['QA_VALIDATION'],
  outputs: ['deployed_release', 'deployment_logs', 'monitoring_alerts'],
  failure_action: 'LOOP_BACK_TO_QA' // On deployment failures
}`
    }
  },

  {
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Define Crew Types for LAUNCH_LEARN Phase (Stages 24-25)',
    user_role: 'System Architect',
    user_want: 'crew type configurations for LAUNCH_PREP and MONITORING_ITERATION crews',
    user_benefit: 'ventures can launch to market and establish monitoring/learning systems',
    status: 'draft',
    priority: 'critical',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - LAUNCH_PREP crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'LAUNCH_PREP crew config is added',
        then: 'Config includes crew_id "LAUNCH_PREP", responsibility "Launch readiness and go-to-market execution", capabilities ["launch_planning", "marketing_campaign", "customer_onboarding", "support_setup"], and required_agents ["launch_manager", "marketing_specialist"]',
      },
      {
        id: 'AC-005-2',
        scenario: 'Happy path - MONITORING_ITERATION crew definition',
        given: 'CREW_REGISTRY in evaTaskContracts.ts is being extended',
        when: 'MONITORING_ITERATION crew config is added',
        then: 'Config includes crew_id "MONITORING_ITERATION", responsibility "Post-launch monitoring and continuous improvement", capabilities ["metrics_monitoring", "user_feedback", "iteration_planning", "optimization"], and required_agents ["product_manager", "data_analyst"]',
      },
      {
        id: 'AC-005-3',
        scenario: 'Final phase - Stage completion',
        given: 'LAUNCH_LEARN is the final phase (stages 24-25)',
        when: 'Stage 25 completes',
        then: 'Venture lifecycle completes AND monitoring transitions to ongoing operations',
      }
    ],
    definition_of_done: [
      'CREW_REGISTRY contains LAUNCH_PREP crew config (stage 24)',
      'CREW_REGISTRY contains MONITORING_ITERATION crew config (stage 25)',
      'TypeScript compilation succeeds',
      'Unit tests pass for both crew configs',
      'Documentation explains final phase transition',
      'Code review approved'
    ],
    technical_notes: 'LAUNCH_LEARN phase (stages 24-25) is the final phase: Launch Prep (24) handles go-to-market, Monitoring/Iteration (25) establishes ongoing learning loops. Stage 25 is ongoing/continuous, not a one-time completion.',
    implementation_approach: 'Add two crew configs to CREW_REGISTRY. LAUNCH_PREP for stage 24, MONITORING_ITERATION for stage 25. Consider marking stage 25 as "continuous" or "ongoing" since monitoring never truly "completes".',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("LAUNCH_PREP") returns valid config'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewConfig("MONITORING_ITERATION") returns valid config'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'dispatchStageTask() correctly assigns crews for stages 24-25'
      }
    ],
    implementation_context: 'FR-1: Crew type definitions for LAUNCH_LEARN phase. Final phase before ongoing operations.',
    architecture_references: [
      'lib/evaTaskContracts.ts - CREW_REGISTRY constant',
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP (will reference these crews)',
      'Database: venture_stages table - stage metadata for stages 24-25'
    ],
    example_code_patterns: {
      launch_crews: `// LAUNCH_LEARN Phase Crews (Stages 24-25)
LAUNCH_PREP: {
  crew_id: 'LAUNCH_PREP',
  responsibility: 'Launch readiness and go-to-market execution',
  capabilities: [
    'launch_planning',
    'marketing_campaign',
    'customer_onboarding',
    'support_setup',
    'documentation_finalization',
    'stakeholder_communication'
  ],
  required_agents: ['launch_manager', 'marketing_specialist'],
  optional_agents: ['support_lead', 'communications_specialist'],
  parallel_execution_allowed: false,
  typical_stage_assignment: 24,
  outputs: ['launch_plan', 'marketing_materials', 'onboarding_docs']
},

MONITORING_ITERATION: {
  crew_id: 'MONITORING_ITERATION',
  responsibility: 'Post-launch monitoring and continuous improvement',
  capabilities: [
    'metrics_monitoring',
    'user_feedback',
    'iteration_planning',
    'optimization',
    'analytics_tracking',
    'learning_synthesis'
  ],
  required_agents: ['product_manager', 'data_analyst'],
  optional_agents: ['customer_success_manager', 'growth_specialist'],
  parallel_execution_allowed: false,
  typical_stage_assignment: 25,
  is_ongoing: true, // Stage 25 is continuous, not one-time
  outputs: ['metrics_dashboard', 'feedback_reports', 'iteration_backlog']
}`
    }
  },

  {
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Extend STAGE_CREW_MAP for All 25 Stages',
    user_role: 'System Architect',
    user_want: 'STAGE_CREW_MAP constant updated to map all stages 7-25 to their respective crews',
    user_benefit: 'getCrewForStage() function works for all 25 stages, enabling full venture lifecycle support',
    status: 'draft',
    priority: 'critical',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - THE_ENGINE stage mappings',
        given: 'STAGE_CREW_MAP is being extended',
        when: 'Stages 7-9 are mapped',
        then: 'Stage 7 → BUSINESS_MODEL AND Stage 8 → TECHNICAL_VALIDATION AND Stage 9 → OPERATIONS_DESIGN',
      },
      {
        id: 'AC-006-2',
        scenario: 'Happy path - THE_IDENTITY stage mappings',
        given: 'STAGE_CREW_MAP is being extended',
        when: 'Stages 10-13 are mapped',
        then: 'Stages 10-11 → BRAND_DEVELOPMENT AND Stages 12-13 → MARKET_POSITIONING',
      },
      {
        id: 'AC-006-3',
        scenario: 'Happy path - THE_BLUEPRINT stage mappings',
        given: 'STAGE_CREW_MAP is being extended',
        when: 'Stages 14-18 are mapped',
        then: 'Stages 14-15 → PRODUCT_DESIGN AND Stages 16-17 → ENGINEERING_SPEC AND Stage 18 → ARCHITECTURE',
      },
      {
        id: 'AC-006-4',
        scenario: 'Happy path - THE_BUILD_LOOP stage mappings',
        given: 'STAGE_CREW_MAP is being extended',
        when: 'Stages 19-23 are mapped',
        then: 'Stages 19-20 → DEVELOPMENT AND Stages 21-22 → QA_VALIDATION AND Stage 23 → DEPLOYMENT',
      },
      {
        id: 'AC-006-5',
        scenario: 'Happy path - LAUNCH_LEARN stage mappings',
        given: 'STAGE_CREW_MAP is being extended',
        when: 'Stages 24-25 are mapped',
        then: 'Stage 24 → LAUNCH_PREP AND Stage 25 → MONITORING_ITERATION',
      },
      {
        id: 'AC-006-6',
        scenario: 'Function validation - getCrewForStage()',
        given: 'STAGE_CREW_MAP contains all 25 stages',
        when: 'getCrewForStage(15) is called',
        then: 'Returns "PRODUCT_DESIGN" crew',
      },
      {
        id: 'AC-006-7',
        scenario: 'Function validation - All stages covered',
        given: 'STAGE_CREW_MAP is complete',
        when: 'Iterating stages 1-25',
        then: 'Every stage returns a valid crew_id from CREW_REGISTRY',
      }
    ],
    definition_of_done: [
      'STAGE_CREW_MAP contains entries for stages 7-25',
      'All stage-to-crew mappings match phase assignments from US-001 through US-005',
      'getCrewForStage() returns valid crew for all stages 1-25',
      'TypeScript compilation succeeds',
      'Unit tests pass for all stage mappings',
      'Integration test verifies end-to-end stage progression 1→25',
      'Code review approved'
    ],
    technical_notes: 'STAGE_CREW_MAP is the central routing table for crew dispatch. Must align with crew definitions from US-001 through US-005. Some crews handle multiple stages (e.g., BRAND_DEVELOPMENT handles both 10 and 11). Mapping must be deterministic and complete.',
    implementation_approach: 'Extend existing STAGE_CREW_MAP constant in evaTaskContracts.ts. Follow pattern from stages 1-6. For multi-stage crews, map each stage individually (stage 10 → BRAND_DEVELOPMENT, stage 11 → BRAND_DEVELOPMENT). Validate completeness with unit tests.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewForStage(n) returns valid crew for n = 1 to 25'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'All crew_ids in STAGE_CREW_MAP exist in CREW_REGISTRY'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'dispatchStageTask() works for all stages 7-25'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'Venture progression from stage 1 to 25 dispatches correct crews'
      }
    ],
    implementation_context: 'FR-2: Stage-to-crew mapping. Central routing logic that enables 25-stage venture progression.',
    architecture_references: [
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP constant (extend for stages 7-25)',
      'lib/evaTaskContracts.ts - getCrewForStage() function (test with new stages)',
      'lib/evaTaskContracts.ts - CREW_REGISTRY (reference for valid crew_ids)',
      'Database: venture_stages table - stage metadata'
    ],
    example_code_patterns: {
      stage_crew_map_extension: `// In lib/evaTaskContracts.ts - STAGE_CREW_MAP
export const STAGE_CREW_MAP: Record<number, string> = {
  // Existing stages 1-6 (already mapped)
  1: 'DISCOVERY',
  2: 'CONCEPT_VALIDATION',
  // ... etc

  // NEW: THE_ENGINE Phase (Stages 7-9)
  7: 'BUSINESS_MODEL',
  8: 'TECHNICAL_VALIDATION',
  9: 'OPERATIONS_DESIGN',

  // NEW: THE_IDENTITY Phase (Stages 10-13)
  10: 'BRAND_DEVELOPMENT',
  11: 'BRAND_DEVELOPMENT', // Same crew handles both 10 and 11
  12: 'MARKET_POSITIONING',
  13: 'MARKET_POSITIONING', // Same crew handles both 12 and 13

  // NEW: THE_BLUEPRINT Phase (Stages 14-18)
  14: 'PRODUCT_DESIGN',
  15: 'PRODUCT_DESIGN', // Same crew handles both 14 and 15
  16: 'ENGINEERING_SPEC',
  17: 'ENGINEERING_SPEC', // Same crew handles both 16 and 17
  18: 'ARCHITECTURE',

  // NEW: THE_BUILD_LOOP Phase (Stages 19-23)
  19: 'DEVELOPMENT',
  20: 'DEVELOPMENT', // Same crew handles both 19 and 20
  21: 'QA_VALIDATION',
  22: 'QA_VALIDATION', // Same crew handles both 21 and 22
  23: 'DEPLOYMENT',

  // NEW: LAUNCH_LEARN Phase (Stages 24-25)
  24: 'LAUNCH_PREP',
  25: 'MONITORING_ITERATION'
};

// Validation function to ensure completeness
export function validateStageCrewMap(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check all stages 1-25 have mappings
  for (let stage = 1; stage <= 25; stage++) {
    if (!STAGE_CREW_MAP[stage]) {
      errors.push(\`Stage \${stage} missing from STAGE_CREW_MAP\`);
    }
  }

  // Check all mapped crews exist in CREW_REGISTRY
  Object.entries(STAGE_CREW_MAP).forEach(([stage, crewId]) => {
    if (!CREW_REGISTRY[crewId]) {
      errors.push(\`Stage \${stage} maps to non-existent crew: \${crewId}\`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}`
    },
    e2e_test_path: 'tests/e2e/SD-FOUNDATION-V3-006-US-006-stage-crew-map.spec.ts',
    e2e_test_status: 'not_created'
  },

  {
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Add Co-Execution Patterns to STAGE_CO_EXECUTION_MAP',
    user_role: 'System Architect',
    user_want: 'STAGE_CO_EXECUTION_MAP updated to identify stages where multiple crews can work in parallel',
    user_benefit: 'venture progression can parallelize work where appropriate, reducing overall time-to-completion',
    status: 'draft',
    priority: 'high',
    story_points: 3,
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Happy path - IDENTITY phase parallel work',
        given: 'THE_IDENTITY phase has potential for parallel execution',
        when: 'STAGE_CO_EXECUTION_MAP is updated',
        then: 'Stages 10-11 (BRAND_DEVELOPMENT) marked as potentially parallel with stages 12-13 (MARKET_POSITIONING) if venture has sufficient resources',
      },
      {
        id: 'AC-007-2',
        scenario: 'Validation - Sequential dependencies',
        given: 'Some phases have strict sequential dependencies',
        when: 'STAGE_CO_EXECUTION_MAP is configured',
        then: 'BLUEPRINT phase (14-18) NOT marked for parallel execution due to design→spec→architecture dependencies',
      },
      {
        id: 'AC-007-3',
        scenario: 'Documentation - Parallel execution guidelines',
        given: 'Co-execution patterns are configured',
        when: 'Developers review STAGE_CO_EXECUTION_MAP',
        then: 'Documentation explains when parallel execution is safe vs risky AND resource requirements for parallel work',
      }
    ],
    definition_of_done: [
      'STAGE_CO_EXECUTION_MAP identifies parallel-safe stage groups',
      'Documentation explains parallel execution patterns',
      'Documentation warns about resource requirements',
      'Unit tests validate co-execution rules',
      'Code review approved'
    ],
    technical_notes: 'Not all stages can safely execute in parallel. THE_BLUEPRINT (14-18) and THE_BUILD_LOOP (19-23) have strict sequential dependencies. THE_IDENTITY (10-13) could potentially parallelize brand and positioning work if resources allow. Co-execution requires careful coordination.',
    implementation_approach: 'Add or update STAGE_CO_EXECUTION_MAP constant in evaTaskContracts.ts. Mark stages 10-11 and 12-13 as potentially parallel. Document prerequisites (sufficient agents, no resource conflicts). Consider adding resource_requirement field to crew configs.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P1',
        scenario: 'STAGE_CO_EXECUTION_MAP correctly identifies parallel-safe stages'
      },
      {
        type: 'unit',
        priority: 'P2',
        scenario: 'Sequential phases (BLUEPRINT, BUILD_LOOP) not marked for parallel execution'
      }
    ],
    implementation_context: 'FR-3: Co-execution patterns. Optimization for venture progression speed, but must preserve dependencies.',
    architecture_references: [
      'lib/evaTaskContracts.ts - STAGE_CO_EXECUTION_MAP constant',
      'lib/evaTaskContracts.ts - CREW_REGISTRY (parallel_execution_allowed field)',
      'docs/25-stage-protocol.md - Phase dependencies documentation'
    ],
    example_code_patterns: {
      co_execution_map: `// In lib/evaTaskContracts.ts - STAGE_CO_EXECUTION_MAP
export const STAGE_CO_EXECUTION_MAP: Record<string, CoExecutionPattern> = {
  IDENTITY_PARALLEL: {
    pattern_id: 'IDENTITY_PARALLEL',
    description: 'Brand and positioning work can happen concurrently',
    stages: [10, 11, 12, 13],
    crews: ['BRAND_DEVELOPMENT', 'MARKET_POSITIONING'],
    parallel_safe: true,
    prerequisites: [
      'Sufficient agents available (≥2 brand specialists + ≥2 market analysts)',
      'No resource conflicts (different deliverables)',
      'Clear coordination mechanism (shared context, regular syncs)'
    ],
    benefits: 'Reduces IDENTITY phase time by ~40%',
    risks: 'Misalignment between brand and positioning if poorly coordinated'
  },

  BLUEPRINT_SEQUENTIAL: {
    pattern_id: 'BLUEPRINT_SEQUENTIAL',
    description: 'Blueprint phases must execute sequentially',
    stages: [14, 15, 16, 17, 18],
    crews: ['PRODUCT_DESIGN', 'ENGINEERING_SPEC', 'ARCHITECTURE'],
    parallel_safe: false,
    reason: 'Strict dependencies: Design outputs → Spec inputs → Architecture inputs',
    enforcement: 'System prevents parallel execution'
  },

  BUILD_LOOP_SEQUENTIAL: {
    pattern_id: 'BUILD_LOOP_SEQUENTIAL',
    description: 'Build loop must follow Dev→QA→Deploy sequence',
    stages: [19, 20, 21, 22, 23],
    crews: ['DEVELOPMENT', 'QA_VALIDATION', 'DEPLOYMENT'],
    parallel_safe: false,
    reason: 'Sequential pipeline: Code → Test → Deploy',
    enforcement: 'System prevents parallel execution'
  }
};`
    }
  },

  {
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: PRD_ID,
    title: 'Integration Tests for Stages 7-25 Dispatch',
    user_role: 'QA Engineer',
    user_want: 'comprehensive integration tests validating getCrewForStage() and dispatchStageTask() for stages 7-25',
    user_benefit: 'confidence that all 25 stages can successfully dispatch tasks to appropriate crews',
    status: 'draft',
    priority: 'high',
    story_points: 5,
    acceptance_criteria: [
      {
        id: 'AC-008-1',
        scenario: 'Integration test - getCrewForStage() for all stages',
        given: 'STAGE_CREW_MAP contains mappings for stages 1-25',
        when: 'Integration test iterates through all stages',
        then: 'getCrewForStage(n) returns valid crew_id for every n from 1 to 25 AND each crew_id exists in CREW_REGISTRY',
      },
      {
        id: 'AC-008-2',
        scenario: 'Integration test - dispatchStageTask() for stages 7-25',
        given: 'Venture is progressing through lifecycle',
        when: 'dispatchStageTask() is called for stages 7-25',
        then: 'Each stage dispatches to correct crew AND crew config is valid AND no errors occur',
      },
      {
        id: 'AC-008-3',
        scenario: 'Integration test - Full venture lifecycle 1→25',
        given: 'Test venture starts at stage 1',
        when: 'Venture progresses through all 25 stages',
        then: 'Each stage transition successful AND correct crew assigned at each stage AND venture completes at stage 25',
      },
      {
        id: 'AC-008-4',
        scenario: 'Unit test - Crew config validation',
        given: 'All new crews added to CREW_REGISTRY',
        when: 'Unit tests validate crew configs',
        then: 'All required fields present (crew_id, responsibility, capabilities, required_agents) AND no TypeScript errors',
      },
      {
        id: 'AC-008-5',
        scenario: 'Edge case - Invalid stage number',
        given: 'getCrewForStage() is called',
        when: 'Stage number is 0 or 26 or negative',
        then: 'Function returns null or throws appropriate error AND does not crash',
      }
    ],
    definition_of_done: [
      'Unit tests for getCrewForStage() pass (stages 1-25)',
      'Unit tests for crew config validation pass',
      'Integration tests for dispatchStageTask() pass (stages 7-25)',
      'Integration test for full lifecycle 1→25 passes',
      'Edge case tests pass (invalid stage numbers)',
      'Test coverage ≥90% on new code',
      'All tests green in CI pipeline'
    ],
    technical_notes: 'Integration tests should use test ventures, not production data. Tests should validate crew dispatch logic, not actual crew execution. Mock crew task execution to isolate dispatch logic. Edge cases: stage 0, stage 26+, negative stages, null/undefined stages.',
    implementation_approach: 'Create test file tests/integration/stage-crew-dispatch.test.ts. Test getCrewForStage() for all 25 stages. Test dispatchStageTask() end-to-end. Mock database calls. Use test fixtures for venture data.',
    test_scenarios: [
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'getCrewForStage() returns valid crew for stages 1-25'
      },
      {
        type: 'unit',
        priority: 'P0',
        scenario: 'All crew configs in CREW_REGISTRY validate correctly'
      },
      {
        type: 'integration',
        priority: 'P0',
        scenario: 'dispatchStageTask() works for stages 7-25'
      },
      {
        type: 'integration',
        priority: 'P1',
        scenario: 'Full venture lifecycle 1→25 dispatches correctly'
      },
      {
        type: 'unit',
        priority: 'P2',
        scenario: 'Edge cases: invalid stage numbers handled gracefully'
      }
    ],
    implementation_context: 'FR-4: Integration testing. Critical validation that stage-to-crew mapping actually works end-to-end.',
    architecture_references: [
      'lib/evaTaskContracts.ts - getCrewForStage() function',
      'lib/evaTaskContracts.ts - dispatchStageTask() function',
      'lib/evaTaskContracts.ts - STAGE_CREW_MAP constant',
      'tests/integration/ - Integration test directory'
    ],
    example_code_patterns: {
      integration_test_template: `// tests/integration/stage-crew-dispatch.test.ts
import { describe, it, expect } from 'vitest';
import { getCrewForStage, dispatchStageTask, STAGE_CREW_MAP, CREW_REGISTRY } from '@/lib/evaTaskContracts';

describe('Stage Crew Dispatch - Stages 7-25', () => {
  describe('getCrewForStage() - All Stages', () => {
    it('should return valid crew for all stages 1-25', () => {
      for (let stage = 1; stage <= 25; stage++) {
        const crewId = getCrewForStage(stage);

        expect(crewId).toBeDefined();
        expect(crewId).not.toBeNull();
        expect(CREW_REGISTRY[crewId]).toBeDefined();

        console.log(\`Stage \${stage} → \${crewId}\`);
      }
    });

    it('should map THE_ENGINE stages correctly', () => {
      expect(getCrewForStage(7)).toBe('BUSINESS_MODEL');
      expect(getCrewForStage(8)).toBe('TECHNICAL_VALIDATION');
      expect(getCrewForStage(9)).toBe('OPERATIONS_DESIGN');
    });

    it('should map THE_IDENTITY stages correctly', () => {
      expect(getCrewForStage(10)).toBe('BRAND_DEVELOPMENT');
      expect(getCrewForStage(11)).toBe('BRAND_DEVELOPMENT');
      expect(getCrewForStage(12)).toBe('MARKET_POSITIONING');
      expect(getCrewForStage(13)).toBe('MARKET_POSITIONING');
    });

    it('should map THE_BLUEPRINT stages correctly', () => {
      expect(getCrewForStage(14)).toBe('PRODUCT_DESIGN');
      expect(getCrewForStage(15)).toBe('PRODUCT_DESIGN');
      expect(getCrewForStage(16)).toBe('ENGINEERING_SPEC');
      expect(getCrewForStage(17)).toBe('ENGINEERING_SPEC');
      expect(getCrewForStage(18)).toBe('ARCHITECTURE');
    });

    it('should map THE_BUILD_LOOP stages correctly', () => {
      expect(getCrewForStage(19)).toBe('DEVELOPMENT');
      expect(getCrewForStage(20)).toBe('DEVELOPMENT');
      expect(getCrewForStage(21)).toBe('QA_VALIDATION');
      expect(getCrewForStage(22)).toBe('QA_VALIDATION');
      expect(getCrewForStage(23)).toBe('DEPLOYMENT');
    });

    it('should map LAUNCH_LEARN stages correctly', () => {
      expect(getCrewForStage(24)).toBe('LAUNCH_PREP');
      expect(getCrewForStage(25)).toBe('MONITORING_ITERATION');
    });
  });

  describe('dispatchStageTask() - Integration', () => {
    it('should dispatch tasks for stages 7-25', async () => {
      const testVenture = {
        id: 'test-venture-001',
        current_stage: 7
      };

      for (let stage = 7; stage <= 25; stage++) {
        const result = await dispatchStageTask(testVenture.id, stage);

        expect(result.success).toBe(true);
        expect(result.crew_id).toBe(getCrewForStage(stage));
        expect(result.error).toBeUndefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid stage numbers', () => {
      expect(getCrewForStage(0)).toBeNull();
      expect(getCrewForStage(26)).toBeNull();
      expect(getCrewForStage(-1)).toBeNull();
    });
  });
});`,
      crew_config_validation_test: `// tests/unit/crew-configs.test.ts
import { describe, it, expect } from 'vitest';
import { CREW_REGISTRY } from '@/lib/evaTaskContracts';

describe('Crew Config Validation', () => {
  const newCrews = [
    'BUSINESS_MODEL',
    'TECHNICAL_VALIDATION',
    'OPERATIONS_DESIGN',
    'BRAND_DEVELOPMENT',
    'MARKET_POSITIONING',
    'PRODUCT_DESIGN',
    'ENGINEERING_SPEC',
    'ARCHITECTURE',
    'DEVELOPMENT',
    'QA_VALIDATION',
    'DEPLOYMENT',
    'LAUNCH_PREP',
    'MONITORING_ITERATION'
  ];

  newCrews.forEach(crewId => {
    describe(\`\${crewId} crew config\`, () => {
      const crew = CREW_REGISTRY[crewId];

      it('should exist in CREW_REGISTRY', () => {
        expect(crew).toBeDefined();
      });

      it('should have required fields', () => {
        expect(crew.crew_id).toBe(crewId);
        expect(crew.responsibility).toBeDefined();
        expect(crew.capabilities).toBeInstanceOf(Array);
        expect(crew.capabilities.length).toBeGreaterThan(0);
        expect(crew.required_agents).toBeInstanceOf(Array);
        expect(crew.required_agents.length).toBeGreaterThan(0);
      });

      it('should have valid capabilities', () => {
        crew.capabilities.forEach(capability => {
          expect(typeof capability).toBe('string');
          expect(capability.length).toBeGreaterThan(0);
        });
      });
    });
  });
});`
    },
    e2e_test_path: 'tests/e2e/SD-FOUNDATION-V3-006-US-008-integration-tests.spec.ts',
    e2e_test_status: 'not_created'
  }
];

async function addStories() {
  const client = await createSupabaseServiceClient('engineer');

  console.log(`Adding ${stories.length} user stories for ${SD_ID}...\n`);

  for (const story of stories) {
    const { error } = await client
      .from('user_stories')
      .upsert(story, { onConflict: 'story_key' });

    if (error) {
      console.log('❌ Error adding', story.story_key, ':', error.message);
    } else {
      console.log('✅', story.story_key, '-', story.title);
    }
  }

  console.log('\n✅ Done! Added', stories.length, 'user stories for SD-FOUNDATION-V3-006');
  console.log('\nSummary:');
  console.log('- US-001: THE_ENGINE Phase Crews (Stages 7-9) - 5 points');
  console.log('- US-002: THE_IDENTITY Phase Crews (Stages 10-13) - 5 points');
  console.log('- US-003: THE_BLUEPRINT Phase Crews (Stages 14-18) - 8 points');
  console.log('- US-004: THE_BUILD_LOOP Phase Crews (Stages 19-23) - 8 points');
  console.log('- US-005: LAUNCH_LEARN Phase Crews (Stages 24-25) - 5 points');
  console.log('- US-006: STAGE_CREW_MAP Extension - 5 points');
  console.log('- US-007: Co-Execution Patterns - 3 points');
  console.log('- US-008: Integration Tests - 5 points');
  console.log('\nTotal Story Points: 44');
}

addStories().catch(console.error);
