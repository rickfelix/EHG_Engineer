/**
 * EHG 2026 Deep Research Strategic Directive Pack
 *
 * Creates 9 Strategic Directives (1 parent + 8 children) for the
 * EHG 2026 Deep Research & Architectural Futures program.
 *
 * Each SD includes embedded Deep Research Prompts designed for use
 * with external AI research assistants (Gemini/OpenAI).
 *
 * Usage: node scripts/create-research-program-sds.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// PARENT SD: SD-RESEARCH-000
// ============================================================================

const parentSD = {
  id: 'SD-RESEARCH-000',
  legacy_id: 'SD-RESEARCH-000',
  sd_key: 'RESEARCH-000',
  title: 'EHG 2026 Deep Research & Architectural Futures',
  version: '1.0',
  status: 'draft',
  category: 'strategic',
  priority: 'critical',
  sd_type: 'documentation',
  current_phase: 'LEAD',
  target_application: 'EHG',
  is_active: true,
  progress: 0,
  created_by: 'LEAD',

  description: `Establish the long-term architectural foundation for EHG by running a Deep Research Program across eight complexity domains required for scaling into a multi-venture, AI-governed ecosystem.

This parent SD coordinates 8 child research SDs covering: Cross-Schema Governance, EVA Autonomy Engine, Stage Data Contracts, Unified Interface, Multi-Venture Orchestration, LEO Protocol Evolution, EVA Intent-vs-Reality Analysis, and Security/Compliance.

Each child SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the overview prompt.`,

  rationale: 'EHG is consolidating into a unified platform with three schemas (governance.*, portfolio.*, runtime.*). This research program will identify hard constraints vs. flexible options across all architectural domains before implementation begins.',

  scope: 'Research and architectural planning only. No code implementation. Each child SD defines a specific research domain with a complete Deep Research Prompt for external AI research assistants.',

  strategic_objectives: JSON.stringify([
    'Define long-term architectural foundation for multi-venture EHG platform',
    'Identify hard constraints vs. flexible options across all domains',
    'Produce Deep Research Prompts for external AI research (Gemini/OpenAI)',
    'Align all research to unified governance/portfolio/runtime schema model',
    'Establish EVA autonomy framework (L0-L4) with safety rails',
    'Design 40-stage contract-driven workflow system',
    'Plan LEO Protocol evolution to v5.x'
  ]),

  success_criteria: JSON.stringify([
    'All 8 child SDs created with complete Deep Research Prompts',
    'Each research domain has clear context, goals, constraints, and deliverables',
    'Research outputs can be fed back into Claude Code for PRD generation',
    'All SDs aligned to unified EHG architecture model'
  ]),

  key_principles: JSON.stringify([
    'Research-first: No code implementation until research complete',
    'Dual-agent pipeline: Claude Code ← research → Gemini/OpenAI',
    'Database-first: All governance in database, not markdown',
    'Schema isolation: governance.* | portfolio.* | runtime.*',
    'SD-first governance: Strategic Directives before PRDs'
  ]),

  dependencies: JSON.stringify([]),

  risks: JSON.stringify([
    {
      risk: 'Research scope creep into implementation',
      mitigation: 'Strict sd_type=documentation enforcement, no PRD generation'
    },
    {
      risk: 'Inconsistent research across domains',
      mitigation: 'Standardized Deep Research Prompt structure for all child SDs'
    }
  ]),

  metadata: JSON.stringify({
    program_type: 'deep_research',
    child_sds: [
      'SD-RESEARCH-101',
      'SD-RESEARCH-102',
      'SD-RESEARCH-103',
      'SD-RESEARCH-104',
      'SD-RESEARCH-105',
      'SD-RESEARCH-106',
      'SD-RESEARCH-107',
      'SD-RESEARCH-108'
    ],
    research_domains: 8,
    dual_agent_pipeline: true,
    research_prompt: {
      title: 'EHG 2026 Deep Research Program Overview',
      context: `EHG is being unified into a single Supabase project with three schemas:
- governance.* (SDs, PRDs, policies, LEO, compliance) - immutable, append-only
- portfolio.* (ventures, autonomy settings, signals, aggregated metrics)
- runtime.* (40-stage workflow, EVA actions, logs, stage instances)

This research program spans 8 complexity domains required for scaling EHG into a multi-venture, AI-governed ecosystem. Each domain produces a Deep Research Prompt for external AI assistants.`,
      research_goals: [
        'Identify architectural patterns for multi-schema governance',
        'Define EVA autonomy levels (L0-L4) with safety rails',
        'Design 40-stage contract-driven workflow system',
        'Plan unified interface merging governance + runtime + EVA',
        'Establish multi-venture orchestration strategy',
        'Evolve LEO Protocol to v5.x',
        'Build EVA intent-vs-reality analysis model',
        'Define security, compliance, and audit framework'
      ],
      constraints: [
        'Must support multi-venture scaling (10-50 ventures)',
        'EVA autonomy must be per-venture scoped',
        'Governance must remain immutable and append-only',
        'Runtime must be fully RLS-scoped per venture',
        'All research must identify hard constraints vs. flexible options'
      ],
      deliverables: [
        '8 domain-specific Deep Research Prompts',
        'Architecture recommendations per domain',
        'Risk assessments and trade-off analyses',
        'Input materials for Claude Code PRD generation'
      ]
    }
  })
};

// ============================================================================
// CHILD SDs: SD-RESEARCH-101 through SD-RESEARCH-108
// ============================================================================

const childSDs = [
  // SD-RESEARCH-101: Cross-Schema Governance Architecture
  {
    id: 'SD-RESEARCH-101',
    legacy_id: 'SD-RESEARCH-101',
    sd_key: 'RESEARCH-101',
    title: 'Cross-Schema Governance Architecture',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Determine the best long-term architecture for EHG's three-schema system (governance.*, portfolio.*, runtime.*) inside a single Supabase project, including permissions, boundaries, RLS, auditability, and schema evolution.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'The three-schema model is foundational to EHG. Getting schema boundaries, permissions, and evolution strategy right is critical before any implementation.',

    scope: 'Research multi-schema architecture patterns, RLS design, audit logging, and schema evolution strategies.',

    strategic_objectives: JSON.stringify([
      'Define optimal schema separation strategy',
      'Design RLS policies for agent isolation',
      'Establish audit log architecture',
      'Plan schema evolution without breaking downstream'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Clear recommendations for schema boundaries',
      'RLS policy patterns documented',
      'Schema evolution strategy defined'
    ]),

    key_principles: JSON.stringify([
      'Governance immutable and append-only',
      'Runtime never writes to governance.*',
      'Clear permission boundaries between schemas'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000']),

    risks: JSON.stringify([
      {
        risk: 'Schema coupling creates migration complexity',
        mitigation: 'Research loose coupling patterns from industry leaders'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 1,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: Future-Proof Multi-Schema Architecture for EHG (Governance / Portfolio / Runtime)',
        context: `EHG is consolidating two Supabase databases into ONE unified project using three schemas:

- governance.* → immutable SDs, PRDs, policies, LEO protocol
- portfolio.* → ventures, autonomy settings, signals
- runtime.* → stage instances, artifacts, logs, EVA decisions

Runtime must NEVER write into governance.*
Governance must remain long-lived, auditable, and append-only.`,
        research_goals: [
          'Research best practices for multi-schema separation',
          'Design schema permission boundaries',
          'Define RLS patterns for agent isolation',
          'Establish governance audit log strategies',
          'Plan schema evolution without breaking downstream systems',
          'Study Postgres tenancy & large-scale governance patterns',
          'Analyze how companies like GitHub/Stripe manage schema boundaries'
        ],
        constraints: [
          'Must support multi-venture scaling',
          'Must support EVA autonomy (L0–L4)',
          'Must support 40-stage contract-driven system',
          'Governance must be immutable and append-only',
          'Runtime must be fully RLS-scoped per venture'
        ],
        deliverables: [
          'Detailed architecture recommendation',
          'Risk assessment',
          'Alternative approaches with trade-offs',
          'Best practices from industry',
          'Hard-to-change decisions identified',
          'Flexible decisions identified'
        ],
        expected_output_format: 'Structured report with sections: Executive Summary, Architecture Recommendation, Risk Analysis, Alternatives Considered, Best Practices, Decision Matrix (hard vs flexible), Implementation Considerations.'
      }
    })
  },

  // SD-RESEARCH-102: EVA Autonomy Engine (L0–L4, Per-Venture)
  {
    id: 'SD-RESEARCH-102',
    legacy_id: 'SD-RESEARCH-102',
    sd_key: 'RESEARCH-102',
    title: 'EVA Autonomy Engine (L0–L4, Per-Venture)',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Define a safe, auditable, scalable autonomy model for EVA across all ventures. EVA is the executive AI assistant managing ventures through a 40-stage workflow with autonomy levels from L0 (advisor) to L4 (trial autonomy).

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'EVA autonomy is the core differentiator of EHG. A robust autonomy framework with safety rails is essential before granting any AI decision-making authority.',

    scope: 'Research autonomy frameworks from robotics, automotive, military, and fintech. Define autonomy levels, kill-switches, and oversight patterns.',

    strategic_objectives: JSON.stringify([
      'Define L0-L4 autonomy level specifications',
      'Design safety rails and kill-switch patterns',
      'Establish audit and oversight requirements',
      'Plan per-venture autonomy scoping'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Autonomy level definitions with allowed/denied actions',
      'Safety rail specifications',
      'Human override protocols defined'
    ]),

    key_principles: JSON.stringify([
      'EVA per-venture scoped',
      'EVA obeys RLS isolation',
      'EVA cannot write to governance.* except as Chairman',
      'All decisions logged to runtime.eva_decisions'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101']),

    risks: JSON.stringify([
      {
        risk: 'Autonomy level definitions too vague for enforcement',
        mitigation: 'Research concrete frameworks from robotics/automotive'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 2,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: EVA Autonomy Engine (L0–L4) — Safe AI Governance Model',
        context: `EVA is the executive AI assistant that will manage ventures across a 40-stage workflow. Each venture has its own autonomy level from L0 (advisor) to L4 (trial autonomy). All EVA actions must be logged through governance and runtime schemas.

Current autonomy level definitions:
- L0: Advisor only - no autonomous actions
- L1: Suggest actions, human approves
- L2: Act with human notification
- L3: Act autonomously within guardrails
- L4: Trial full autonomy with monitoring`,
        research_goals: [
          'Identify autonomy frameworks used in robotics, automotive (ADAS), military/HADR automation, high-risk fintech',
          'Define what each autonomy level should allow/deny',
          'Define kill-switch patterns',
          'Define oversight vs override mechanisms',
          'Define max consecutive auto-action rules',
          'Analyze risk windows and escalation triggers',
          'Study how autonomous systems handle edge cases and failures'
        ],
        constraints: [
          'EVA must be per-venture scoped',
          'EVA must obey RLS isolation',
          'EVA must use v_intent_vs_reality view',
          'EVA cannot write to governance.* except "as Chairman"',
          'All decisions logged to runtime.eva_decisions'
        ],
        deliverables: [
          'Autonomy Model Specification',
          'Policy definitions per level (allowed/denied actions)',
          'Safety rails and guardrails',
          'Human override protocols',
          'Kill-switch design patterns',
          'Recommendations for long-term scaling',
          'Risk assessment per autonomy level'
        ],
        expected_output_format: 'Structured specification with: Autonomy Level Matrix, Action Authorization Rules, Safety Rail Specifications, Override Protocols, Monitoring Requirements, Escalation Triggers, Implementation Roadmap.'
      }
    })
  },

  // SD-RESEARCH-103: Stage Data Contracts (JSON Schema + TypeScript)
  {
    id: 'SD-RESEARCH-103',
    legacy_id: 'SD-RESEARCH-103',
    sd_key: 'RESEARCH-103',
    title: 'Stage Data Contracts (JSON Schema + TypeScript)',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Design the long-lived contract system defining all 40 stages, including input/output schemas, validation, TypeScript generation, versioning, and evolution strategy. Contracts will live in governance.stage_data_contracts.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'Contract-driven workflows ensure consistency across ventures and enable automated validation. Schema versioning is critical for long-term evolution.',

    scope: 'Research contract governance models, JSON Schema to TypeScript generation, versioning strategies, and backward compatibility patterns.',

    strategic_objectives: JSON.stringify([
      'Design 40-stage contract schema structure',
      'Plan JSON Schema → TypeScript generation pipeline',
      'Establish versioning and evolution strategy',
      'Define validation pipeline architecture'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Contract structure for all 40 stages defined',
      'Versioning strategy documented',
      'Tooling recommendations provided'
    ]),

    key_principles: JSON.stringify([
      'Contracts universal across ventures',
      'Contracts long-lived in governance schema',
      'EVA reads contracts via view-only routes',
      'Runtime performs validation'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101']),

    risks: JSON.stringify([
      {
        risk: 'Contract evolution breaks existing ventures',
        mitigation: 'Research backward compatibility patterns from API versioning'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 3,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: 40-Stage Data Contract System (JSON Schema + TypeScript)',
        context: `EHG is transitioning to a contract-driven workflow. Each of the 40 venture stages will have:
- Input schema (JSON Schema)
- Output schema (JSON Schema)
- Derived TypeScript interfaces
- Versioning metadata
- Validation requirements

Contracts will live in governance.stage_data_contracts and be immutable once published.`,
        research_goals: [
          'Find best-in-class contract governance models',
          'Research versioning strategies for complex workflows',
          'Evaluate JSON Schema → TypeScript generation tools',
          'Define patterns for handling contract evolution gracefully',
          'Research how to guarantee backward compatibility',
          'Study how to store contract metadata long-term',
          'Analyze how workflow engines evolve contracts (Temporal, Airflow, etc.)'
        ],
        constraints: [
          'Contracts must be universal across ventures',
          'Contracts must be long-lived and versioned',
          'EVA reads contracts via view-only routes',
          'Runtime performs validation against contracts',
          'Must support 40 distinct stages with varying complexity'
        ],
        deliverables: [
          'Contract Governance Strategy',
          'Versioning Plan with migration paths',
          'Validation Pipeline Architecture',
          'Tooling Recommendations (JSON Schema → TS)',
          'Backward compatibility patterns',
          'Contract lifecycle management'
        ],
        expected_output_format: 'Technical specification with: Contract Schema Design, Versioning Model, TypeScript Generation Pipeline, Validation Architecture, Migration Strategy, Tooling Evaluation Matrix.'
      }
    })
  },

  // SD-RESEARCH-104: Unified EHG Interface (Governance + Runtime + EVA)
  {
    id: 'SD-RESEARCH-104',
    legacy_id: 'SD-RESEARCH-104',
    sd_key: 'RESEARCH-104',
    title: 'Unified EHG Interface (Governance + Runtime + EVA)',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Design a unified interface that merges governance features, venture workflows, and EVA orchestration into a single coherent UI. Currently EHG and EHG_Engineer are separate apps; EHG will become the unified platform.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'A unified interface reduces context switching and enables better oversight of governance + runtime + EVA interactions.',

    scope: 'Research role-based UI architecture, cross-application unification, and complex multi-role interfaces.',

    strategic_objectives: JSON.stringify([
      'Design role-based UI architecture',
      'Plan transition from two apps to one platform',
      'Define information architecture for unified views',
      'Establish interaction patterns for EVA decisions'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'UI information architecture documented',
      'Role model defined',
      'Navigation blueprint created'
    ]),

    key_principles: JSON.stringify([
      'Governance UI must not allow runtime writes',
      'EVA UI must show autonomy boundaries',
      'Venture UI must handle multiple active sessions'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101', 'SD-RESEARCH-102']),

    risks: JSON.stringify([
      {
        risk: 'UI complexity overwhelms users',
        mitigation: 'Research progressive disclosure and role-based views'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 4,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: Unified User Interface for Governance, 40-Stage Workflow, and EVA',
        context: `Currently, EHG and EHG_Engineer are two separate applications:
- EHG_Engineer: LEO Protocol dashboard for managing SDs & PRDs
- EHG: The actual customer-facing business application

EHG will become the unified interface hosting:
- Venture workflows (40-stage pipeline)
- EVA orchestration (AI decision-making)
- SD/PRD governance (strategic planning)
- LEO protocol management
- Portfolio views (multi-venture oversight)

Interface must support multiple roles: Chairman, Governance mode, Venture mode, EVA decision view, Compliance views.`,
        research_goals: [
          'Research role-based UI architecture patterns',
          'Study cross-application unification approaches',
          'Design dashboard integration patterns',
          'Plan transition strategy from multiple apps to one platform',
          'Analyze how complex systems manage multi-role interfaces (AWS, Azure, Notion, Linear)',
          'Define progressive disclosure for complex features'
        ],
        constraints: [
          'Governance UI must not allow runtime writes',
          'EVA UI must show autonomy boundaries clearly',
          'Venture UI must handle multiple active sessions',
          'Must support Chairman override at any point',
          'Must maintain clear visual separation between governance and runtime'
        ],
        deliverables: [
          'UI Information Architecture',
          'Navigation Blueprint',
          'Role Model specification',
          'Interaction Patterns guide',
          'Progressive disclosure strategy',
          'Transition plan from two apps to one'
        ],
        expected_output_format: 'UX specification with: Information Architecture Diagram, Navigation Structure, Role-Based Access Matrix, Interaction Patterns, Visual Design Principles, Migration Roadmap.'
      }
    })
  },

  // SD-RESEARCH-105: Multi-Venture Orchestration Strategy
  {
    id: 'SD-RESEARCH-105',
    legacy_id: 'SD-RESEARCH-105',
    sd_key: 'RESEARCH-105',
    title: 'Multi-Venture Orchestration Strategy',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Define how EHG runs multiple ventures in parallel, each with its own 40-stage pipeline and autonomy settings. System must support scaling to 10-50 ventures with independent EVA sessions.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'Multi-venture orchestration is core to EHG as a venture-building platform. Getting isolation, scheduling, and aggregation right is essential.',

    scope: 'Research multi-tenant orchestration, venture isolation, state machine architectures, and portfolio-level dashboards.',

    strategic_objectives: JSON.stringify([
      'Design multi-venture isolation architecture',
      'Plan EVA multi-tenant strategy',
      'Define venture scheduling model',
      'Establish signal aggregation for portfolio view'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Multi-venture architecture documented',
      'Isolation patterns defined',
      'Portfolio aggregation model specified'
    ]),

    key_principles: JSON.stringify([
      'RLS isolation required per venture',
      'EVA per-venture scoped',
      'Governance global, aggregates signals across ventures'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101', 'SD-RESEARCH-102']),

    risks: JSON.stringify([
      {
        risk: 'Venture cross-contamination through shared resources',
        mitigation: 'Research strict isolation patterns from SaaS platforms'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 5,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: Multi-Venture Orchestration for AI-Run Venture Portfolio',
        context: `EHG will run multiple ventures in parallel. Each venture requires:
- Independent EVA session (AI decision-making)
- Independent autonomy level (L0-L4)
- Independent stage progression (40-stage pipeline)
- Independent signals (progress, risks, blockers)
- Independent context windows

System must support future scaling to 10–50 ventures with full isolation.`,
        research_goals: [
          'Research multi-tenant orchestration patterns',
          'Study venture isolation approaches (data, compute, context)',
          'Analyze state machine architectures for parallel workflows',
          'Define how to prevent venture cross-contamination',
          'Assess performance implications of parallel agents',
          'Design portfolio-level dashboards and aggregation',
          'Study how VC portfolio software handles multi-company views'
        ],
        constraints: [
          'RLS isolation required per venture_id',
          'EVA must be per-venture scoped',
          'Governance is global and must aggregate signals',
          'Must support 10-50 concurrent ventures',
          'Must handle ventures at different stages simultaneously'
        ],
        deliverables: [
          'Multi-Venture Architecture Proposal',
          'Scheduling model for parallel ventures',
          'EVA multi-tenant strategy',
          'Signal aggregation model',
          'Portfolio dashboard specifications',
          'Performance and scaling considerations'
        ],
        expected_output_format: 'Architecture document with: Multi-Tenancy Model, Isolation Boundaries, Scheduling Strategy, EVA Instance Management, Signal Aggregation Pipeline, Portfolio Views, Scaling Plan.'
      }
    })
  },

  // SD-RESEARCH-106: LEO Protocol Evolution to v5.x
  {
    id: 'SD-RESEARCH-106',
    legacy_id: 'SD-RESEARCH-106',
    sd_key: 'RESEARCH-106',
    title: 'LEO Protocol Evolution to v5.x',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Define the next generation of the LEO protocol capable of orchestrating child SDs, validating 40-stage alignment, and integrating with EVA + compliance. Current LEO v4.3.3 handles SD/PRD creation; v5.x must handle workflow orchestration.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'LEO Protocol is the governance engine. Evolution to v5.x is required to support stage-aligned orchestration and EVA integration.',

    scope: 'Research governance engines, workflow orchestration, and SD-to-stage alignment patterns.',

    strategic_objectives: JSON.stringify([
      'Define LEO v5.x control flow model',
      'Design SD-to-stage alignment rules',
      'Plan orchestrator SDs for key stages',
      'Integrate compliance pipelines'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'LEO v5.x vision documented',
      'Control flow model defined',
      'Policy integration model specified'
    ]),

    key_principles: JSON.stringify([
      'LEO remains in governance schema',
      'LEO produces immutable audit logs',
      'LEO supports SD-first governance'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101', 'SD-RESEARCH-103']),

    risks: JSON.stringify([
      {
        risk: 'LEO evolution breaks existing SD workflows',
        mitigation: 'Research backward compatibility in workflow engines'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 6,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: LEO Protocol v5.x — Next-Generation Governance Engine',
        context: `Current LEO protocol (v4.3.3) handles:
- SD creation and lifecycle
- PRD generation and validation
- Child SD workflows
- Phase calculation (LEAD → PLAN → EXEC)
- Compliance evaluation

Future LEO v5.x must handle:
- Stage-to-SD alignment (40-stage pipeline)
- Contract-driven execution
- Orchestrator SDs for key stages (20/31/40)
- Large-scale governance across multiple ventures
- EVA integration for autonomous progression`,
        research_goals: [
          'Compare governance engines: Temporal.io, Airflow, Dagster, Prefect',
          'Determine how LEO should manage long-running workflows',
          'Define SD → Stage alignment rules',
          'Design child SD orchestration patterns',
          'Plan compliance pipeline integration',
          'Study how workflow engines handle versioning and migration',
          'Research trigger models for stage transitions'
        ],
        constraints: [
          'LEO must remain in governance schema',
          'LEO must produce immutable audit logs',
          'LEO must support SD-first governance',
          'Must maintain backward compatibility with v4.3.3 SDs',
          'Must integrate with EVA decision-making'
        ],
        deliverables: [
          'LEO v5.x Vision Document',
          'Control Flow Model',
          'Trigger Model for stage transitions',
          'Policy Integration Model',
          'SD-Stage Alignment Rules',
          'Migration path from v4.3.3 to v5.x'
        ],
        expected_output_format: 'Protocol specification with: Vision Statement, Architecture Overview, Control Flow Diagrams, Trigger Definitions, Policy Framework, Migration Strategy, Comparison Matrix (vs Temporal/Airflow).'
      }
    })
  },

  // SD-RESEARCH-107: EVA Intent-vs-Reality Model
  {
    id: 'SD-RESEARCH-107',
    legacy_id: 'SD-RESEARCH-107',
    sd_key: 'RESEARCH-107',
    title: 'EVA Intent-vs-Reality Analysis Model',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Define how EVA interprets the unified view (intent from governance vs reality from runtime) and determines stage alignment. EVA must analyze v_intent_vs_reality view to detect drift and make progression decisions.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'Intent-vs-reality analysis is how EVA determines if a venture is on track. Getting drift detection and escalation right is critical for autonomous operation.',

    scope: 'Research stage alignment heuristics, drift detection, hybrid decision models, and escalation patterns.',

    strategic_objectives: JSON.stringify([
      'Design alignment engine specification',
      'Define drift detection heuristics',
      'Establish risk scoring model',
      'Plan escalation logic'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Alignment engine specified',
      'Drift heuristics documented',
      'Escalation logic defined'
    ]),

    key_principles: JSON.stringify([
      'EVA uses read-only views',
      'EVA decisions logged in runtime.eva_decisions',
      'EVA cannot hallucinate progress (must validate)'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-102', 'SD-RESEARCH-103']),

    risks: JSON.stringify([
      {
        risk: 'EVA misinterprets data quality issues as progress',
        mitigation: 'Research data quality validation patterns'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 7,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: EVA Intent-vs-Reality Decision Intelligence Model',
        context: `EVA must analyze a cross-schema view v_intent_vs_reality which joins:
- Governance intent (SDs & PRDs defining what should happen)
- Stage contracts (defining expected inputs/outputs)
- Runtime progress (actual artifacts and completions)
- Completion thresholds (what % constitutes "done")
- Stage drift signals (variance from expected)

EVA uses this view to determine:
1. Is the venture on track?
2. Is a stage complete?
3. Should EVA take action?
4. Should EVA escalate to human?`,
        research_goals: [
          'Design stage alignment heuristics',
          'Define drift detection algorithms',
          'Research statistical & rule-based hybrid models',
          'Establish risk scoring methodologies',
          'Study how to detect data quality issues vs genuine problems',
          'Define when EVA should pause vs escalate',
          'Research error-handling and recovery patterns',
          'Study decision intelligence models from autonomous systems'
        ],
        constraints: [
          'EVA uses read-only views only',
          'EVA decisions logged in runtime.eva_decisions',
          'EVA cannot hallucinate progress (must validate against artifacts)',
          'Must handle incomplete or ambiguous data gracefully',
          'Must support different confidence thresholds per autonomy level'
        ],
        deliverables: [
          'Alignment Engine Specification',
          'Drift Detection Heuristics',
          'Stage Risk Scoring Model',
          'Escalation Logic flowchart',
          'Data quality validation patterns',
          'Confidence threshold recommendations'
        ],
        expected_output_format: 'Technical specification with: Intent-Reality Mapping Model, Drift Detection Algorithms, Risk Scoring Framework, Escalation Decision Tree, Validation Patterns, Confidence Calibration Guide.'
      }
    })
  },

  // SD-RESEARCH-108: Security, Compliance & AI Auditability
  {
    id: 'SD-RESEARCH-108',
    legacy_id: 'SD-RESEARCH-108',
    sd_key: 'RESEARCH-108',
    title: 'Security, Compliance & AI Auditability',
    version: '1.0',
    status: 'draft',
    category: 'strategic',
    priority: 'critical',
    sd_type: 'documentation',
    current_phase: 'LEAD',
    target_application: 'EHG',
    is_active: true,
    progress: 0,
    created_by: 'LEAD',

    description: `Define the long-term security, compliance, and audit framework for safe AI autonomy across ventures. Governance history must be immutable, venture data isolated, and all EVA actions auditable.

This SD produces a Deep Research Prompt for external AI assistants (Gemini/OpenAI). See metadata.research_prompt for the full prompt to copy/paste.`,

    rationale: 'Security and compliance are foundational for any autonomous AI system. Getting audit trails and access controls right is essential for trust and regulatory readiness.',

    scope: 'Research zero-trust patterns, fine-grained RLS, immutable audit logs, and regulatory compliance frameworks.',

    strategic_objectives: JSON.stringify([
      'Design security architecture',
      'Define audit model for AI decisions',
      'Plan compliance integration',
      'Assess risks for autonomous operations'
    ]),

    success_criteria: JSON.stringify([
      'Complete Deep Research Prompt for Gemini/OpenAI',
      'Security architecture documented',
      'Audit model specified',
      'Compliance roadmap defined'
    ]),

    key_principles: JSON.stringify([
      'EVA cannot escalate privilege',
      'No superuser agents',
      'Governance audit logs append-only',
      'Compliance runs through governance schema'
    ]),

    dependencies: JSON.stringify(['SD-RESEARCH-000', 'SD-RESEARCH-101', 'SD-RESEARCH-102']),

    risks: JSON.stringify([
      {
        risk: 'Regulatory landscape changes faster than implementation',
        mitigation: 'Design for flexibility and modular compliance rules'
      }
    ]),

    metadata: JSON.stringify({
      parent_sd: 'SD-RESEARCH-000',
      relationship_type: 'child_research',
      domain_number: 8,
      research_target: 'gemini_openai',
      research_prompt: {
        title: 'Deep Research: Security & Compliance Framework for Autonomous AI Ventures',
        context: `EHG will operate semi-autonomous and autonomous AI systems (EVA) across multiple ventures. Critical requirements:
- Governance history must be immutable
- Venture data must be fully isolated by venture_id
- All EVA decisions must be auditable
- Auditability must survive system failures
- Must prepare for emerging AI regulations (2026-2030)`,
        research_goals: [
          'Research zero-trust architecture patterns',
          'Design fine-grained RLS for multi-tenant AI',
          'Study multi-tenant access control models',
          'Define immutable audit log frameworks',
          'Research anti-tampering strategies',
          'Plan governance-compliance pipelines',
          'Assess regulatory outlook for autonomous AI (2026–2030)',
          'Study how financial services handle AI audit requirements'
        ],
        constraints: [
          'EVA cannot escalate privilege under any circumstances',
          'No superuser agents allowed',
          'Governance audit logs must be append-only',
          'Compliance must run through governance schema',
          'Must support external audit requirements',
          'Must handle data residency requirements'
        ],
        deliverables: [
          'Security Architecture specification',
          'Audit Model for AI decisions',
          'Compliance Integration roadmap',
          'Risk Assessment for autonomous operations',
          'Anti-tampering design patterns',
          'Regulatory preparedness checklist'
        ],
        expected_output_format: 'Security framework document with: Threat Model, Access Control Architecture, Audit Trail Design, Compliance Mapping, Risk Matrix, Regulatory Roadmap, Implementation Priorities.'
      }
    })
  }
];

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function createResearchSDs() {
  console.log('==========================================');
  console.log('EHG 2026 Deep Research SD Creation');
  console.log('==========================================\n');

  const results = {
    success: [],
    failed: []
  };

  // Create Parent SD first
  console.log('Creating Parent SD: SD-RESEARCH-000...');
  try {
    const { data: parentData, error: parentError } = await supabase
      .from('strategic_directives_v2')
      .insert(parentSD)
      .select('id, title, status, priority')
      .single();

    if (parentError) {
      console.error(`  ❌ Failed: ${parentError.message}`);
      results.failed.push({ id: parentSD.id, error: parentError.message });
    } else {
      console.log(`  ✅ Created: ${parentData.id} - ${parentData.title}`);
      results.success.push(parentData);
    }
  } catch (err) {
    console.error(`  ❌ Exception: ${err.message}`);
    results.failed.push({ id: parentSD.id, error: err.message });
  }

  // Create Child SDs
  console.log('\nCreating Child SDs...\n');

  for (const childSD of childSDs) {
    console.log(`Creating: ${childSD.id}...`);
    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(childSD)
        .select('id, title, status, priority')
        .single();

      if (error) {
        console.error(`  ❌ Failed: ${error.message}`);
        results.failed.push({ id: childSD.id, error: error.message });
      } else {
        console.log(`  ✅ Created: ${data.id} - ${data.title}`);
        results.success.push(data);
      }
    } catch (err) {
      console.error(`  ❌ Exception: ${err.message}`);
      results.failed.push({ id: childSD.id, error: err.message });
    }
  }

  // Summary
  console.log('\n==========================================');
  console.log('CREATION SUMMARY');
  console.log('==========================================');
  console.log(`✅ Successfully created: ${results.success.length}/9 SDs`);
  console.log(`❌ Failed: ${results.failed.length}/9 SDs`);

  if (results.success.length > 0) {
    console.log('\n--- Created SDs ---');
    results.success.forEach(sd => {
      console.log(`  • ${sd.id}: ${sd.title} [${sd.status}/${sd.priority}]`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n--- Failed SDs ---');
    results.failed.forEach(f => {
      console.log(`  • ${f.id}: ${f.error}`);
    });
  }

  console.log('\n==========================================');
  console.log('NEXT STEPS');
  console.log('==========================================');
  console.log('1. Review SDs in EHG_Engineer dashboard');
  console.log('2. Extract Deep Research Prompts from metadata.research_prompt');
  console.log('3. Run prompts in Gemini/OpenAI for external research');
  console.log('4. Feed research outputs back to Claude Code for PRD generation');
  console.log('\nNo PRDs or backlog items created (SD-first governance).');

  return results;
}

// Run
createResearchSDs()
  .then(results => {
    if (results.failed.length > 0) {
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
