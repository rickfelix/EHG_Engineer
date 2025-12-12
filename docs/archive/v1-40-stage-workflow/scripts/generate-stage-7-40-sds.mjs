#!/usr/bin/env node

/**
 * Strategic Directives Generator for Stages 7-40
 *
 * This script generates SDs for the entire 40-stage venture workflow,
 * organized by capability roadmap phases.
 *
 * Generated: 2025-11-29
 * Vision: 2026 Capability Roadmap (EVA L4 Trial Mode)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// SECTION A: STAGE-SPECIFIC SDs (CRITICAL PRIORITY)
// ============================================================================

const stageSDs = [
  // -------------------------------------------------------------------------
  // PHASE A STAGES (Foundations & Wiring) - Stages 7-10
  // -------------------------------------------------------------------------
  {
    id: 'SD-STAGE-07-001',
    title: 'Stage 7: Comprehensive Planning Suite - EVA Integration',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 7 (Comprehensive Planning Suite) to EVA orchestration layer. This stage develops comprehensive business and technical plans for venture execution, transitioning from IDEATION assessment to actionable planning.`,
    rationale: `Stage 7 is the first planning stage after IDEATION completion. It must receive structured outputs from Stages 1-6 and produce planning artifacts that downstream stages (8-10) require. EVA must be able to inject context and receive planning completion events.`,
    scope: `
- EVA→Stage Input Injection: Venture context, IDEATION summary, risk profile from Stage 6
- Stage→EVA Output Contracts: Business plan draft, technical plan draft, resource requirements
- Substage orchestration: 7.1 Business Planning, 7.2 Technical Planning, 7.3 Resource Planning
- Completion events: STAGE_7_COMPLETE with planning artifacts
- Data contract validation: Output schema enforcement`,
    strategic_intent: 'Enable EVA to orchestrate planning workflow and inject context from IDEATION results.',
    key_changes: JSON.stringify([
      'Add EVA context injection endpoint to Stage 7 component',
      'Implement STAGE_7_COMPLETE event emission',
      'Create standardized output data contract for planning artifacts',
      'Wire substage progression (7.1 → 7.2 → 7.3) with EVA awareness'
    ]),
    strategic_objectives: JSON.stringify([
      'EVA can inject IDEATION context into planning workflow',
      'Stage 7 outputs conform to standardized data contracts',
      'Completion events trigger downstream stage readiness'
    ]),
    success_criteria: JSON.stringify([
      'Stage 7 receives and displays EVA-injected context',
      'Output data contract validation passes (100%)',
      'STAGE_7_COMPLETE event fires with correct payload',
      'Substage progression is logged and visible to EVA'
    ]),
    dependencies: JSON.stringify([
      'SD-DATA-CONTRACT-001 (All stage contracts defined)',
      'SD-EVA-AUTH-001 (EVA authority schema)',
      'Stages 1-6 completion (IDEATION baseline)'
    ]),
    risks: JSON.stringify([
      'Planning artifacts may vary significantly by venture type',
      'Substage boundaries may need venture-specific tuning'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'L0 (Advisory) - EVA observes and logs planning decisions',
    upstream_stages: [6],
    downstream_stages: [8]
  },

  {
    id: 'SD-STAGE-08-001',
    title: 'Stage 8: Problem Decomposition - Work Breakdown Structure',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 8 (Problem Decomposition) to EVA orchestration layer. This stage breaks down the venture into work packages and deliverables, creating the WBS that will guide development.`,
    rationale: `Stage 8 transforms high-level plans from Stage 7 into actionable work packages. EVA needs visibility into decomposition decisions to understand venture scope and complexity for downstream orchestration.`,
    scope: `
- EVA→Stage Input Injection: Business/technical plans from Stage 7
- Stage→EVA Output Contracts: Work breakdown structure, deliverable list, dependency graph
- Completion events: STAGE_8_COMPLETE with WBS artifacts
- Data contract validation: WBS schema enforcement`,
    strategic_intent: 'Enable EVA to understand venture scope through structured work breakdown.',
    key_changes: JSON.stringify([
      'Add EVA context injection for Stage 7 outputs',
      'Implement WBS output data contract',
      'Create deliverable tracking schema',
      'Emit STAGE_8_COMPLETE with scope metrics'
    ]),
    strategic_objectives: JSON.stringify([
      'EVA can ingest and reason about work breakdown structure',
      'Deliverables are tracked with clear dependencies',
      'Scope complexity is quantified for timeline estimation'
    ]),
    success_criteria: JSON.stringify([
      'WBS output conforms to data contract',
      'Dependency graph is parseable by EVA',
      'Deliverable count and complexity metrics captured',
      'STAGE_8_COMPLETE event fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-07-001 (Stage 7 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'WBS granularity varies by venture complexity',
      'Dependency graphs may become circular without validation'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'L0 (Advisory) - EVA learns scope patterns',
    upstream_stages: [7],
    downstream_stages: [9]
  },

  {
    id: 'SD-STAGE-09-001',
    title: 'Stage 9: Gap Analysis - Capability Assessment',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 9 (Gap Analysis) to EVA orchestration layer. This stage identifies capability gaps between current state and required state for venture execution.`,
    rationale: `Gap analysis informs resource allocation and skill acquisition. EVA must understand gaps to make informed recommendations about timeline and resource needs.`,
    scope: `
- EVA→Stage Input Injection: WBS from Stage 8, resource constraints
- Stage→EVA Output Contracts: Gap list, priority ranking, mitigation strategies
- Completion events: STAGE_9_COMPLETE with gap assessment
- Data contract validation: Gap schema enforcement`,
    strategic_intent: 'Enable EVA to reason about capability gaps and resource needs.',
    key_changes: JSON.stringify([
      'Add EVA context injection for WBS and constraints',
      'Implement gap assessment output schema',
      'Create gap-to-mitigation mapping',
      'Emit STAGE_9_COMPLETE with gap metrics'
    ]),
    strategic_objectives: JSON.stringify([
      'EVA can identify and prioritize capability gaps',
      'Gap mitigation strategies are standardized',
      'Resource needs are quantified'
    ]),
    success_criteria: JSON.stringify([
      'Gap list conforms to data contract',
      'Priority ranking is consistent',
      'Mitigation strategies are actionable',
      'STAGE_9_COMPLETE event fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-08-001 (Stage 8 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'Gap assessment subjectivity',
      'Mitigation effort estimation variance'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'L0 (Advisory) - EVA learns gap patterns',
    upstream_stages: [8],
    downstream_stages: [10]
  },

  {
    id: 'SD-STAGE-10-001',
    title: 'Stage 10: Technical Review - Architecture Validation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 10 (Technical Review) to EVA orchestration layer. This is the final IDEATION stage, validating technical architecture before transition to PLANNING phase.`,
    rationale: `Stage 10 is the IDEATION exit gate. EVA must capture the technical architecture decision and validate readiness for PLANNING phase. This is a critical GO/NO-GO checkpoint.`,
    scope: `
- EVA→Stage Input Injection: Gap analysis, WBS, technical plans
- Stage→EVA Output Contracts: Architecture decision, technical feasibility score, GO/NO-GO recommendation
- Gate: IDEATION→PLANNING transition gate
- Completion events: STAGE_10_COMPLETE, IDEATION_PHASE_COMPLETE`,
    strategic_intent: 'Enable EVA to validate IDEATION completion and authorize PLANNING transition.',
    key_changes: JSON.stringify([
      'Add EVA context injection for full IDEATION context',
      'Implement architecture validation schema',
      'Create GO/NO-GO recommendation logic',
      'Emit IDEATION_PHASE_COMPLETE gate event'
    ]),
    strategic_objectives: JSON.stringify([
      'EVA can validate IDEATION completion criteria',
      'Architecture decisions are logged and traceable',
      'Phase transition is gated and auditable'
    ]),
    success_criteria: JSON.stringify([
      'Architecture validation passes',
      'GO/NO-GO recommendation is clear',
      'IDEATION_PHASE_COMPLETE event fires',
      'All IDEATION artifacts are captured'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-09-001 (Stage 9 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)',
      'SD-EVA-DECISION-001 (Decision logging)'
    ]),
    risks: JSON.stringify([
      'Technical review may reveal show-stoppers',
      'Architecture decisions may need iteration'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'L0 (Advisory) - EVA recommends GO/NO-GO',
    upstream_stages: [9],
    downstream_stages: [11]
  },

  // -------------------------------------------------------------------------
  // PHASE B STAGES (IDEATION & Selection) - Stages 11-14 (Early PLANNING)
  // -------------------------------------------------------------------------
  {
    id: 'SD-STAGE-11-001',
    title: 'Stage 11: Strategic Naming - Brand Identity Foundation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 11 (Strategic Naming) to EVA orchestration layer. This stage establishes brand identity and naming conventions for the venture.`,
    rationale: `Stage 11 is the first PLANNING phase stage. Brand identity decisions affect all downstream marketing, legal, and customer-facing work. EVA needs to track naming decisions for consistency.`,
    scope: `
- EVA→Stage Input Injection: Venture context, target market from IDEATION
- Stage→EVA Output Contracts: Brand name, tagline, naming rationale
- Completion events: STAGE_11_COMPLETE with brand artifacts`,
    strategic_intent: 'Enable EVA to maintain brand consistency across venture lifecycle.',
    key_changes: JSON.stringify([
      'Add EVA context injection for market context',
      'Implement brand naming output schema',
      'Create naming decision audit trail',
      'Emit STAGE_11_COMPLETE with brand identity'
    ]),
    strategic_objectives: JSON.stringify([
      'Brand decisions are logged and traceable',
      'Naming consistency is enforced downstream',
      'EVA can reference brand context in communications'
    ]),
    success_criteria: JSON.stringify([
      'Brand name and tagline captured',
      'Naming rationale documented',
      'STAGE_11_COMPLETE event fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-10-001 (Stage 10 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'Trademark conflicts may require renaming',
      'Brand identity may evolve during development'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'L1 (Supervised) - EVA can suggest naming alternatives',
    upstream_stages: [10],
    downstream_stages: [12]
  },

  {
    id: 'SD-STAGE-12-001',
    title: 'Stage 12: Adaptive Naming - Domain & Legal Validation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 12 (Adaptive Naming) to EVA orchestration layer. This stage validates domain availability and legal clearance for brand names.`,
    rationale: `Stage 12 ensures brand names are viable for registration. EVA must track domain and trademark status for compliance and planning.`,
    scope: `
- EVA→Stage Input Injection: Brand names from Stage 11
- Stage→EVA Output Contracts: Domain availability, trademark status, legal recommendations
- Completion events: STAGE_12_COMPLETE with legal clearance`,
    strategic_intent: 'Enable EVA to track legal and domain status for brand protection.',
    key_changes: JSON.stringify([
      'Add EVA context injection for brand names',
      'Implement domain/trademark validation schema',
      'Create legal clearance tracking',
      'Emit STAGE_12_COMPLETE with clearance status'
    ]),
    strategic_objectives: JSON.stringify([
      'Domain and trademark status tracked',
      'Legal clearance gates naming decisions',
      'EVA maintains compliance awareness'
    ]),
    success_criteria: JSON.stringify([
      'Domain availability confirmed',
      'Trademark search completed',
      'Legal recommendations documented',
      'STAGE_12_COMPLETE fires with clearance'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-11-001 (Stage 11 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'Domain squatting may require premium purchases',
      'Trademark conflicts may delay naming'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'L1 (Supervised) - EVA can flag legal risks',
    upstream_stages: [11],
    downstream_stages: [13]
  },

  {
    id: 'SD-STAGE-13-001',
    title: 'Stage 13: Exit-Oriented Design - Strategic Value Planning',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 13 (Exit-Oriented Design) to EVA orchestration layer. This stage designs the venture with exit scenarios in mind (acquisition, IPO, lifestyle).`,
    rationale: `Stage 13 is a CHAIRMAN APPROVAL GATE. Exit strategy affects all downstream decisions about scale, burn rate, and growth trajectory. This is a critical strategic checkpoint.`,
    scope: `
- EVA→Stage Input Injection: Venture profile, market analysis
- Stage→EVA Output Contracts: Exit strategy, valuation targets, timeline
- Gate: CHAIRMAN APPROVAL required before Stage 14
- Completion events: STAGE_13_COMPLETE, EXIT_STRATEGY_APPROVED`,
    strategic_intent: 'Enable EVA to align venture operations with exit strategy.',
    key_changes: JSON.stringify([
      'Add EVA context injection for strategic analysis',
      'Implement exit strategy schema',
      'Create Chairman approval gate',
      'Emit EXIT_STRATEGY_APPROVED gate event'
    ]),
    strategic_objectives: JSON.stringify([
      'Exit strategy documented and approved',
      'Valuation targets established',
      'All downstream decisions aligned with exit'
    ]),
    success_criteria: JSON.stringify([
      'Exit strategy clearly defined',
      'Chairman approval captured',
      'EXIT_STRATEGY_APPROVED event fires',
      'Stage 14 unblocked after approval'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-12-001 (Stage 12 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)',
      'SD-EVA-DECISION-001 (Decision logging)'
    ]),
    risks: JSON.stringify([
      'Exit strategy may change based on market conditions',
      'Chairman approval may require iterations'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'L0 (Advisory) - Chairman makes exit decisions',
    upstream_stages: [12],
    downstream_stages: [14]
  },

  {
    id: 'SD-STAGE-14-001',
    title: 'Stage 14: Development Preparation - Build Readiness',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 14 (Development Preparation) to EVA orchestration layer. This stage prepares for the BUILD phase with tooling, environments, and team readiness.`,
    rationale: `Stage 14 is the PLANNING→BUILD transition point. EVA must validate that all prerequisites are met before development begins.`,
    scope: `
- EVA→Stage Input Injection: Exit strategy, technical architecture
- Stage→EVA Output Contracts: Development environment status, tooling checklist, team readiness
- Completion events: STAGE_14_COMPLETE, PLANNING_PHASE_COMPLETE`,
    strategic_intent: 'Enable EVA to validate BUILD phase readiness.',
    key_changes: JSON.stringify([
      'Add EVA context injection for build prerequisites',
      'Implement development readiness schema',
      'Create PLANNING→BUILD transition gate',
      'Emit PLANNING_PHASE_COMPLETE event'
    ]),
    strategic_objectives: JSON.stringify([
      'Development environment validated',
      'Tooling and CI/CD confirmed',
      'Team readiness assessed'
    ]),
    success_criteria: JSON.stringify([
      'Environment setup verified',
      'Tooling checklist complete',
      'PLANNING_PHASE_COMPLETE fires',
      'BUILD phase unblocked'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-13-001 (Stage 13 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'Environment setup delays',
      'Tooling compatibility issues'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'L1 (Supervised) - EVA validates readiness',
    upstream_stages: [13],
    downstream_stages: [15, 22]
  },

  // -------------------------------------------------------------------------
  // PHASE C STAGES (Build & Integrate) - Stages 15-20
  // -------------------------------------------------------------------------
  {
    id: 'SD-STAGE-15-001',
    title: 'Stage 15: Pricing Strategy - Revenue Model Design',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 15 (Pricing Strategy) to EVA orchestration layer. This stage designs pricing models, tiers, and monetization strategies.`,
    rationale: `Pricing decisions affect profitability forecasting from Stage 5 and customer acquisition in later stages. EVA must track pricing decisions for financial modeling.`,
    scope: `
- EVA→Stage Input Injection: Profitability forecasts from Stage 5, competitive pricing
- Stage→EVA Output Contracts: Pricing tiers, monetization model, revenue projections
- Completion events: STAGE_15_COMPLETE with pricing model`,
    strategic_intent: 'Enable EVA to track pricing decisions for financial forecasting.',
    key_changes: JSON.stringify([
      'Add EVA context injection for financial context',
      'Implement pricing model schema',
      'Create pricing-to-forecast linkage',
      'Emit STAGE_15_COMPLETE with revenue model'
    ]),
    strategic_objectives: JSON.stringify([
      'Pricing tiers documented',
      'Monetization strategy clear',
      'Revenue projections validated'
    ]),
    success_criteria: JSON.stringify([
      'Pricing model conforms to schema',
      'Revenue projections generated',
      'STAGE_15_COMPLETE fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-14-001 (Stage 14 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)',
      'Stage 5 (Profitability Forecasting) output'
    ]),
    risks: JSON.stringify([
      'Pricing may need market testing',
      'Competitive pressure may force adjustments'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L2 (Conditional) - EVA can recommend pricing adjustments',
    upstream_stages: [14, 5],
    downstream_stages: [16]
  },

  {
    id: 'SD-STAGE-16-001',
    title: 'Stage 16: AI CEO Agent - Strategic AI Orchestration',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 16 (AI CEO Agent) to EVA orchestration layer. This stage configures the AI CEO agent for venture-specific strategic guidance.`,
    rationale: `The AI CEO agent is EVA's venture-specific persona. This stage configures how EVA behaves for this particular venture context.`,
    scope: `
- EVA→Stage Input Injection: Venture profile, exit strategy, pricing model
- Stage→EVA Output Contracts: AI CEO configuration, personality parameters, decision boundaries
- Completion events: STAGE_16_COMPLETE with AI CEO config`,
    strategic_intent: 'Configure EVA venture personality for consistent strategic guidance.',
    key_changes: JSON.stringify([
      'Add EVA context injection for venture profile',
      'Implement AI CEO configuration schema',
      'Create personality parameter tuning',
      'Emit STAGE_16_COMPLETE with CEO config'
    ]),
    strategic_objectives: JSON.stringify([
      'AI CEO persona configured for venture',
      'Decision boundaries established',
      'Strategic guidance parameters set'
    ]),
    success_criteria: JSON.stringify([
      'AI CEO config captured',
      'Personality parameters validated',
      'STAGE_16_COMPLETE fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-15-001 (Stage 15 integration)',
      'SD-EVA-AUTH-001 (EVA authority schema)'
    ]),
    risks: JSON.stringify([
      'Personality tuning may need iteration',
      'Decision boundaries may need refinement'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L2 (Conditional) - EVA self-configuration',
    upstream_stages: [15],
    downstream_stages: [17]
  },

  {
    id: 'SD-STAGE-17-001',
    title: 'Stage 17: GTM Strategy - Go-To-Market Planning',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 17 (GTM Strategy) to EVA orchestration layer. This stage develops the go-to-market strategy including channels, messaging, and launch plan.`,
    rationale: `GTM strategy connects to AI CEO agent (Stage 16) and drives Stage 35 (GTM Timing). EVA must understand GTM for launch orchestration.`,
    scope: `
- EVA→Stage Input Injection: AI CEO config, pricing, market analysis
- Stage→EVA Output Contracts: GTM plan, channel strategy, launch timeline
- Completion events: STAGE_17_COMPLETE with GTM artifacts`,
    strategic_intent: 'Enable EVA to orchestrate go-to-market execution.',
    key_changes: JSON.stringify([
      'Add EVA context injection for marketing context',
      'Implement GTM strategy schema',
      'Create channel prioritization logic',
      'Emit STAGE_17_COMPLETE with GTM plan'
    ]),
    strategic_objectives: JSON.stringify([
      'GTM plan documented',
      'Channel strategy prioritized',
      'Launch timeline established'
    ]),
    success_criteria: JSON.stringify([
      'GTM artifacts conform to schema',
      'Channel priorities clear',
      'STAGE_17_COMPLETE fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-16-001 (Stage 16 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'GTM strategy may need market testing',
      'Channel effectiveness varies'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L2 (Conditional) - EVA can recommend GTM adjustments',
    upstream_stages: [16],
    downstream_stages: [18, 35]
  },

  {
    id: 'SD-STAGE-18-001',
    title: 'Stage 18: Documentation Sync - Knowledge Base Creation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 18 (Documentation Sync) to EVA orchestration layer. This stage creates and synchronizes venture documentation and knowledge bases.`,
    rationale: `Documentation is critical for EVA context and team coordination. This stage ensures all venture knowledge is captured and accessible.`,
    scope: `
- EVA→Stage Input Injection: All previous stage outputs
- Stage→EVA Output Contracts: Documentation index, knowledge base status, sync state
- Completion events: STAGE_18_COMPLETE with documentation manifest`,
    strategic_intent: 'Enable EVA to maintain comprehensive venture context.',
    key_changes: JSON.stringify([
      'Add EVA context injection for all artifacts',
      'Implement documentation index schema',
      'Create sync state tracking',
      'Emit STAGE_18_COMPLETE with doc manifest'
    ]),
    strategic_objectives: JSON.stringify([
      'Documentation index complete',
      'Knowledge base synchronized',
      'EVA context is comprehensive'
    ]),
    success_criteria: JSON.stringify([
      'All artifacts documented',
      'Sync state validated',
      'STAGE_18_COMPLETE fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-17-001 (Stage 17 integration)',
      'All Stages 1-17 outputs'
    ]),
    risks: JSON.stringify([
      'Documentation may become stale',
      'Sync conflicts possible'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L1 (Supervised) - EVA manages documentation',
    upstream_stages: [17],
    downstream_stages: [19]
  },

  {
    id: 'SD-STAGE-19-001',
    title: 'Stage 19: Integration Verification - Pre-Build Validation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 19 (Integration Verification) to EVA orchestration layer. This stage validates all integrations and dependencies before build begins.`,
    rationale: `Integration verification ensures all components are ready for development. EVA must validate integration health before BUILD phase acceleration.`,
    scope: `
- EVA→Stage Input Injection: Documentation, tooling status, dependencies
- Stage→EVA Output Contracts: Integration health score, dependency status, blocker list
- Completion events: STAGE_19_COMPLETE with integration report`,
    strategic_intent: 'Enable EVA to validate integration readiness.',
    key_changes: JSON.stringify([
      'Add EVA context injection for integration context',
      'Implement integration health schema',
      'Create blocker detection logic',
      'Emit STAGE_19_COMPLETE with health report'
    ]),
    strategic_objectives: JSON.stringify([
      'Integration health validated',
      'Dependencies confirmed',
      'Blockers identified and tracked'
    ]),
    success_criteria: JSON.stringify([
      'Integration health score calculated',
      'No critical blockers',
      'STAGE_19_COMPLETE fires correctly'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-18-001 (Stage 18 integration)',
      'SD-DATA-CONTRACT-001 (Data contracts)'
    ]),
    risks: JSON.stringify([
      'Integration issues may delay build',
      'Dependency conflicts possible'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L1 (Supervised) - EVA validates integrations',
    upstream_stages: [18],
    downstream_stages: [20]
  },

  {
    id: 'SD-STAGE-20-001',
    title: 'Stage 20: Enhanced Context Loading - EVA Context Optimization',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 20 (Enhanced Context Loading) to EVA orchestration layer. This stage optimizes EVA's venture context for BUILD phase execution.`,
    rationale: `Stage 20 is the PLANNING→BUILD transition checkpoint. EVA context must be fully loaded and optimized for development orchestration.`,
    scope: `
- EVA→Stage Input Injection: Full venture context, integration status
- Stage→EVA Output Contracts: Context completeness score, optimization status, readiness flag
- Gate: PLANNING→BUILD transition gate
- Completion events: STAGE_20_COMPLETE, BUILD_PHASE_READY`,
    strategic_intent: 'Optimize EVA context for BUILD phase execution.',
    key_changes: JSON.stringify([
      'Add EVA context injection for full context',
      'Implement context optimization logic',
      'Create BUILD_PHASE_READY gate',
      'Emit BUILD_PHASE_READY event'
    ]),
    strategic_objectives: JSON.stringify([
      'EVA context fully loaded',
      'Context optimized for build',
      'BUILD phase authorized'
    ]),
    success_criteria: JSON.stringify([
      'Context completeness > 95%',
      'Optimization passes',
      'BUILD_PHASE_READY fires',
      'Stage 21 unblocked'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-19-001 (Stage 19 integration)',
      'All Stages 1-19 outputs'
    ]),
    risks: JSON.stringify([
      'Context gaps may delay build',
      'Optimization may surface issues'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'L2 (Conditional) - EVA self-optimization',
    upstream_stages: [19],
    downstream_stages: [21]
  },

  // -------------------------------------------------------------------------
  // PHASE D STAGES (MVP & Strategic) - Stages 21-31
  // -------------------------------------------------------------------------
  {
    id: 'SD-STAGE-21-001',
    title: 'Stage 21: Final Pre-Flight Check - BUILD Gate',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 21 (Final Pre-Flight Check) to EVA orchestration layer. This is the comprehensive validation before development begins.`,
    rationale: `Stage 21 is the BUILD entry gate. All technical and business validation must pass before development resources are committed.`,
    scope: `
- EVA→Stage Input Injection: All PLANNING outputs, Lovable repo URL
- Stage→EVA Output Contracts: Pre-flight checklist, GO/NO-GO decision, risk assessment
- Substages: 21.1 Technical Validation, 21.2 Business Validation, 21.3 Go/No-Go Decision
- Gate: BUILD authorization gate`,
    strategic_intent: 'Enable EVA to authorize BUILD phase with confidence.',
    key_changes: JSON.stringify([
      'Add EVA context injection for full validation',
      'Implement pre-flight checklist schema',
      'Create BUILD authorization gate',
      'Emit BUILD_AUTHORIZED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Technical validation complete',
      'Business validation complete',
      'BUILD authorized or blocked with rationale'
    ]),
    success_criteria: JSON.stringify([
      'Pre-flight checklist 100% complete',
      'GO decision captured',
      'BUILD_AUTHORIZED fires',
      'Development can begin'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-20-001 (Stage 20 integration)',
      'All PLANNING phase outputs'
    ]),
    risks: JSON.stringify([
      'Pre-flight may reveal blockers',
      'Business validation may fail'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA recommends GO/NO-GO',
    upstream_stages: [20],
    downstream_stages: [22]
  },

  {
    id: 'SD-STAGE-22-001',
    title: 'Stage 22: Iterative Development Loop - Sprint Execution',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 22 (Iterative Development Loop) to EVA orchestration layer. This stage manages sprint-based development execution.`,
    rationale: `Stage 22 is the core development engine. EVA must track sprint progress, velocity, and blockers for effective orchestration.`,
    scope: `
- EVA→Stage Input Injection: Development prep from Stage 14, pre-flight status
- Stage→EVA Output Contracts: Sprint metrics, velocity data, blocker status
- Substages: 22.1 Sprint Execution, 22.2 Daily Standups, 22.3 Sprint Review
- Feedback loop: Iterates with Stage 23`,
    strategic_intent: 'Enable EVA to orchestrate development sprints.',
    key_changes: JSON.stringify([
      'Add EVA context injection for sprint context',
      'Implement sprint metrics schema',
      'Create velocity tracking',
      'Emit SPRINT_COMPLETE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Sprint velocity tracked',
      'Blockers surfaced to EVA',
      'Development progress visible'
    ]),
    success_criteria: JSON.stringify([
      'Sprint metrics captured',
      'Velocity established',
      'Blocker tracking operational'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-21-001 (Stage 21 integration)',
      'SD-STAGE-14-001 (Development prep)'
    ]),
    risks: JSON.stringify([
      'Sprint velocity may vary',
      'Blockers may slow progress'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA monitors and recommends',
    upstream_stages: [21, 14],
    downstream_stages: [23]
  },

  {
    id: 'SD-STAGE-23-001',
    title: 'Stage 23: Continuous Feedback Loops - User Feedback Integration',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 23 (Continuous Feedback Loops) to EVA orchestration layer. This stage collects and processes user feedback during development.`,
    rationale: `Feedback loops inform development priorities. EVA must understand user sentiment to guide sprint planning.`,
    scope: `
- EVA→Stage Input Injection: Sprint status, user touchpoints
- Stage→EVA Output Contracts: Feedback volume, sentiment analysis, priority actions
- Substages: 23.1 Feedback Collection, 23.2 Analysis & Prioritization, 23.3 Implementation
- Feedback loop: Iterates with Stage 22 and Stage 24`,
    strategic_intent: 'Enable EVA to incorporate user feedback into development.',
    key_changes: JSON.stringify([
      'Add EVA context injection for feedback context',
      'Implement feedback analysis schema',
      'Create sentiment tracking',
      'Emit FEEDBACK_PROCESSED events'
    ]),
    strategic_objectives: JSON.stringify([
      'Feedback collected and analyzed',
      'Sentiment trends tracked',
      'Priority actions identified'
    ]),
    success_criteria: JSON.stringify([
      'Feedback pipeline operational',
      'Sentiment analysis functional',
      'Priorities surfaced to EVA'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-22-001 (Stage 22 integration)',
      'User touchpoint infrastructure'
    ]),
    risks: JSON.stringify([
      'Feedback volume may overwhelm',
      'Sentiment analysis accuracy'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA prioritizes feedback',
    upstream_stages: [22],
    downstream_stages: [24]
  },

  {
    id: 'SD-STAGE-24-001',
    title: 'Stage 24: MVP Engine Iteration - Automated Feedback Loop',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 24 (MVP Engine Iteration) to EVA orchestration layer. This stage automates the feedback-to-iteration cycle for MVP development.`,
    rationale: `Stage 24 is the MVP acceleration engine. EVA orchestrates automated iteration based on feedback from Stage 23.`,
    scope: `
- EVA→Stage Input Injection: Feedback analysis, sprint status
- Stage→EVA Output Contracts: Iteration velocity, improvement rate, user satisfaction
- Substages: 24.1 Automated Analysis, 24.2 Iteration Planning, 24.3 Execution
- Feedback loop: Drives toward Stage 31 (MVP Launch)`,
    strategic_intent: 'Enable EVA to accelerate MVP iteration.',
    key_changes: JSON.stringify([
      'Add EVA context injection for iteration context',
      'Implement automated iteration logic',
      'Create improvement tracking',
      'Emit MVP_ITERATION_COMPLETE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Iteration velocity maximized',
      'Improvement rate tracked',
      'User satisfaction improving'
    ]),
    success_criteria: JSON.stringify([
      'Automated iteration operational',
      'Velocity metrics established',
      'Satisfaction trending positive'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-23-001 (Stage 23 integration)',
      'Feedback pipeline infrastructure'
    ]),
    risks: JSON.stringify([
      'Automation may miss nuance',
      'Iteration fatigue possible'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L3 (Strategic) - EVA orchestrates MVP iterations',
    upstream_stages: [23],
    downstream_stages: [25, 31]
  },

  {
    id: 'SD-STAGE-25-001',
    title: 'Stage 25: Quality Assurance - MVP Quality Gate',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 25 (Quality Assurance) to EVA orchestration layer. This stage validates MVP quality before launch.`,
    rationale: `Stage 25 is the quality gate before MVP launch. EVA must validate quality metrics before authorizing launch.`,
    scope: `
- EVA→Stage Input Injection: MVP status, iteration metrics
- Stage→EVA Output Contracts: Quality score, test coverage, defect density
- Gate: MVP quality gate (must pass for Stage 31)`,
    strategic_intent: 'Enable EVA to enforce quality standards.',
    key_changes: JSON.stringify([
      'Add EVA context injection for QA context',
      'Implement quality scoring schema',
      'Create MVP quality gate',
      'Emit MVP_QUALITY_PASSED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Quality score calculated',
      'Test coverage validated',
      'Defect density acceptable'
    ]),
    success_criteria: JSON.stringify([
      'Quality score > threshold',
      'Test coverage > 80%',
      'MVP_QUALITY_PASSED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-24-001 (Stage 24 integration)',
      'Testing infrastructure'
    ]),
    risks: JSON.stringify([
      'Quality may require more iteration',
      'Defects may delay launch'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA enforces quality',
    upstream_stages: [24],
    downstream_stages: [26]
  },

  {
    id: 'SD-STAGE-26-001',
    title: 'Stage 26: Security Compliance - Pre-Launch Security',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 26 (Security Compliance) to EVA orchestration layer. This stage validates security before MVP launch.`,
    rationale: `Security compliance is mandatory before launch. EVA must validate security posture using risk evaluation from Stage 6.`,
    scope: `
- EVA→Stage Input Injection: Risk evaluation from Stage 6, current security posture
- Stage→EVA Output Contracts: Security score, compliance status, vulnerability list
- Gate: Security gate (must pass for production)`,
    strategic_intent: 'Enable EVA to enforce security compliance.',
    key_changes: JSON.stringify([
      'Add EVA context injection for security context',
      'Implement security scoring schema',
      'Create security compliance gate',
      'Emit SECURITY_COMPLIANCE_PASSED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Security score calculated',
      'Compliance validated',
      'Vulnerabilities addressed'
    ]),
    success_criteria: JSON.stringify([
      'Security score > threshold',
      'No critical vulnerabilities',
      'SECURITY_COMPLIANCE_PASSED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-25-001 (Stage 25 integration)',
      'Stage 6 (Risk Evaluation) output',
      'Security scanning infrastructure'
    ]),
    risks: JSON.stringify([
      'Security issues may delay launch',
      'Compliance requirements may expand'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA enforces security',
    upstream_stages: [25, 6],
    downstream_stages: [27]
  },

  // Stages 27-31 (Launch Preparation)
  {
    id: 'SD-STAGE-27-001',
    title: 'Stage 27: Actor Model & Saga - Event Architecture (Optional)',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 27 (Actor Model & Saga) to EVA orchestration layer. This optional stage implements event-driven architecture for complex ventures.`,
    rationale: `Stage 27 is optional for ventures requiring event-driven patterns. EVA must track architecture decisions and saga patterns.`,
    scope: `
- EVA→Stage Input Injection: Architecture requirements, complexity indicators
- Stage→EVA Output Contracts: Actor model status, saga patterns, event catalog
- Optional: May be skipped for simpler ventures`,
    strategic_intent: 'Enable EVA to manage event-driven architecture.',
    key_changes: JSON.stringify([
      'Add EVA context injection for architecture context',
      'Implement actor model schema (optional)',
      'Create saga pattern tracking',
      'Emit ARCHITECTURE_CONFIGURED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Actor model configured (if needed)',
      'Saga patterns documented',
      'Event catalog created'
    ]),
    success_criteria: JSON.stringify([
      'Architecture decision documented',
      'If implemented: Actor model functional',
      'Event catalog complete'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-26-001 (Stage 26 integration)',
      'Architecture requirements'
    ]),
    risks: JSON.stringify([
      'Event architecture complexity',
      'Saga pattern debugging difficulty'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA manages events',
    upstream_stages: [26],
    downstream_stages: [28]
  },

  {
    id: 'SD-STAGE-28-001',
    title: 'Stage 28: Development Excellence - Code Quality Gate',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 28 (Development Excellence) to EVA orchestration layer. This stage validates code quality and engineering best practices.`,
    rationale: `Code quality affects maintainability and future development velocity. EVA must enforce excellence standards.`,
    scope: `
- EVA→Stage Input Injection: Codebase metrics, test results
- Stage→EVA Output Contracts: Code quality score, technical debt assessment, excellence metrics
- Gate: Code quality gate`,
    strategic_intent: 'Enable EVA to enforce development excellence.',
    key_changes: JSON.stringify([
      'Add EVA context injection for code context',
      'Implement code quality schema',
      'Create excellence metrics tracking',
      'Emit DEV_EXCELLENCE_PASSED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Code quality score calculated',
      'Technical debt assessed',
      'Excellence metrics met'
    ]),
    success_criteria: JSON.stringify([
      'Code quality > threshold',
      'Technical debt acceptable',
      'DEV_EXCELLENCE_PASSED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-27-001 (Stage 27 integration)',
      'Code analysis infrastructure'
    ]),
    risks: JSON.stringify([
      'Technical debt accumulation',
      'Quality standards enforcement'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L2 (Conditional) - EVA enforces quality',
    upstream_stages: [27],
    downstream_stages: [29]
  },

  {
    id: 'SD-STAGE-29-001',
    title: 'Stage 29: Final Polish - Pre-Production Readiness',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 29 (Final Polish) to EVA orchestration layer. This is the CHAIRMAN APPROVAL GATE before production deployment.`,
    rationale: `Stage 29 is the final checkpoint before production. Chairman approval is required to proceed to Stage 30.`,
    scope: `
- EVA→Stage Input Injection: All quality gates, launch readiness
- Stage→EVA Output Contracts: Production readiness score, Chairman approval status
- Gate: CHAIRMAN APPROVAL required for Stage 30`,
    strategic_intent: 'Enable Chairman to authorize production deployment.',
    key_changes: JSON.stringify([
      'Add EVA context injection for full readiness context',
      'Implement production readiness schema',
      'Create Chairman approval gate',
      'Emit PRODUCTION_APPROVED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Production readiness validated',
      'Chairman approval captured',
      'Production deployment authorized'
    ]),
    success_criteria: JSON.stringify([
      'Readiness score > threshold',
      'Chairman approval received',
      'PRODUCTION_APPROVED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-28-001 (Stage 28 integration)',
      'All quality gates passed'
    ]),
    risks: JSON.stringify([
      'Chairman may require changes',
      'Readiness gaps may delay'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L0 (Advisory) - Chairman decides',
    upstream_stages: [28],
    downstream_stages: [30]
  },

  {
    id: 'SD-STAGE-30-001',
    title: 'Stage 30: Production Deployment - Infrastructure Launch',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 30 (Production Deployment) to EVA orchestration layer. This stage deploys the venture to production infrastructure.`,
    rationale: `Production deployment is the culmination of BUILD phase. EVA must orchestrate deployment and validate success.`,
    scope: `
- EVA→Stage Input Injection: Production approval, deployment config
- Stage→EVA Output Contracts: Deployment status, infrastructure health, rollback plan
- Completion events: STAGE_30_COMPLETE, PRODUCTION_LIVE`,
    strategic_intent: 'Enable EVA to orchestrate production deployment.',
    key_changes: JSON.stringify([
      'Add EVA context injection for deployment context',
      'Implement deployment status schema',
      'Create rollback plan tracking',
      'Emit PRODUCTION_LIVE event'
    ]),
    strategic_objectives: JSON.stringify([
      'Production deployed',
      'Infrastructure health validated',
      'Rollback plan ready'
    ]),
    success_criteria: JSON.stringify([
      'Deployment successful',
      'Health checks pass',
      'PRODUCTION_LIVE fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-29-001 (Stage 29 integration)',
      'Infrastructure provisioning'
    ]),
    risks: JSON.stringify([
      'Deployment failures',
      'Infrastructure issues'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L3 (Strategic) - EVA orchestrates deployment',
    upstream_stages: [29],
    downstream_stages: [31]
  },

  {
    id: 'SD-STAGE-31-001',
    title: 'Stage 31: MVP Launch - Market Entry',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 31 (MVP Launch) to EVA orchestration layer. This stage orchestrates the market launch with coordinated marketing and support.`,
    rationale: `MVP Launch is the market entry point. EVA must coordinate launch activities and track initial metrics.`,
    scope: `
- EVA→Stage Input Injection: GTM plan, production status
- Stage→EVA Output Contracts: Launch metrics, customer acquisition, initial feedback
- Substages: 31.1 Launch Orchestration, 31.2 Launch Execution, 31.3 Launch Telemetry
- Completion events: STAGE_31_COMPLETE, MVP_LAUNCHED`,
    strategic_intent: 'Enable EVA to orchestrate MVP market launch.',
    key_changes: JSON.stringify([
      'Add EVA context injection for launch context',
      'Implement launch metrics schema',
      'Create launch telemetry',
      'Emit MVP_LAUNCHED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Launch executed',
      'Initial metrics captured',
      'Customer feedback flowing'
    ]),
    success_criteria: JSON.stringify([
      'Launch complete',
      'Metrics baseline established',
      'MVP_LAUNCHED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-30-001 (Stage 30 integration)',
      'SD-STAGE-17-001 (GTM Strategy)',
      'SD-STAGE-24-001 (MVP Engine)'
    ]),
    risks: JSON.stringify([
      'Launch may underperform',
      'Initial feedback may be critical'
    ]),
    phase_alignment: 'Phase D (MVP & Strategic)',
    autonomy_relevance: 'L3 (Strategic) - EVA orchestrates launch',
    upstream_stages: [30, 17, 24],
    downstream_stages: [32]
  },

  // -------------------------------------------------------------------------
  // PHASE E STAGES (Trial Orchestrator) - Stages 32-40
  // -------------------------------------------------------------------------
  {
    id: 'SD-STAGE-32-001',
    title: 'Stage 32: Customer Success - Post-Launch Support',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 32 (Customer Success) to EVA orchestration layer. This stage manages customer onboarding and success after MVP launch.`,
    rationale: `Customer success drives retention and expansion. EVA must track customer health and success metrics.`,
    scope: `
- EVA→Stage Input Injection: Launch metrics, customer data
- Stage→EVA Output Contracts: Customer health scores, onboarding status, success metrics
- Feedback loop: Iterates with Stage 31`,
    strategic_intent: 'Enable EVA to manage customer success.',
    key_changes: JSON.stringify([
      'Add EVA context injection for customer context',
      'Implement customer health schema',
      'Create success metrics tracking',
      'Emit CUSTOMER_SUCCESS_UPDATE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Customer health tracked',
      'Onboarding monitored',
      'Success metrics established'
    ]),
    success_criteria: JSON.stringify([
      'Health scores calculated',
      'Onboarding completion tracked',
      'Success metrics trending positive'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-31-001 (Stage 31 integration)',
      'Customer success infrastructure'
    ]),
    risks: JSON.stringify([
      'Customer churn risk',
      'Support capacity constraints'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L3 (Strategic) - EVA manages customer success',
    upstream_stages: [31],
    downstream_stages: [33]
  },

  {
    id: 'SD-STAGE-33-001',
    title: 'Stage 33: Post-MVP Expansion - Feature Growth',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 33 (Post-MVP Expansion) to EVA orchestration layer. This stage manages feature expansion based on customer feedback.`,
    rationale: `Post-MVP expansion drives growth. EVA must prioritize features based on customer feedback and business impact.`,
    scope: `
- EVA→Stage Input Injection: Customer success data, feedback analysis
- Stage→EVA Output Contracts: Feature roadmap, expansion priorities, growth metrics
- Feedback loop: Iterates with Stage 32`,
    strategic_intent: 'Enable EVA to drive post-MVP growth.',
    key_changes: JSON.stringify([
      'Add EVA context injection for growth context',
      'Implement feature roadmap schema',
      'Create expansion tracking',
      'Emit EXPANSION_UPDATE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Feature roadmap established',
      'Expansion priorities clear',
      'Growth metrics tracked'
    ]),
    success_criteria: JSON.stringify([
      'Roadmap documented',
      'Priorities ranked',
      'Growth trending positive'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-32-001 (Stage 32 integration)',
      'Feature planning infrastructure'
    ]),
    risks: JSON.stringify([
      'Feature creep risk',
      'Resource allocation challenges'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L3 (Strategic) - EVA prioritizes features',
    upstream_stages: [32],
    downstream_stages: [34]
  },

  {
    id: 'SD-STAGE-34-001',
    title: 'Stage 34: Creative Media Automation - Marketing Automation',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 34 (Creative Media Automation) to EVA orchestration layer. This stage automates marketing content creation and distribution.`,
    rationale: `Marketing automation drives efficient customer acquisition. EVA must orchestrate content creation and distribution.`,
    scope: `
- EVA→Stage Input Injection: GTM plan, customer segments
- Stage→EVA Output Contracts: Content calendar, distribution metrics, campaign performance
- Integration: Feeds into Stage 35 (GTM Timing)`,
    strategic_intent: 'Enable EVA to automate marketing.',
    key_changes: JSON.stringify([
      'Add EVA context injection for marketing context',
      'Implement content automation schema',
      'Create campaign tracking',
      'Emit CAMPAIGN_UPDATE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Content automation operational',
      'Distribution optimized',
      'Campaign performance tracked'
    ]),
    success_criteria: JSON.stringify([
      'Content pipeline flowing',
      'Distribution metrics captured',
      'Campaign ROI positive'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-33-001 (Stage 33 integration)',
      'Marketing automation infrastructure'
    ]),
    risks: JSON.stringify([
      'Content quality consistency',
      'Distribution channel saturation'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L3 (Strategic) - EVA automates marketing',
    upstream_stages: [33],
    downstream_stages: [35]
  },

  {
    id: 'SD-STAGE-35-001',
    title: 'Stage 35: GTM Timing Intelligence - Market Timing Optimization',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 35 (GTM Timing Intelligence) to EVA orchestration layer. This stage optimizes go-to-market timing based on market signals.`,
    rationale: `Market timing affects campaign effectiveness. EVA must use ESG and market signals to optimize timing.`,
    scope: `
- EVA→Stage Input Injection: GTM plan from Stage 17, ESG signals from Stage 37
- Stage→EVA Output Contracts: Timing recommendations, market windows, ESG blackout periods
- Cross-reference: Stage 37 (ESG Detection) feeds timing decisions`,
    strategic_intent: 'Enable EVA to optimize market timing.',
    key_changes: JSON.stringify([
      'Add EVA context injection for timing context',
      'Implement timing optimization schema',
      'Create ESG blackout tracking',
      'Emit TIMING_UPDATE events'
    ]),
    strategic_objectives: JSON.stringify([
      'Timing recommendations generated',
      'Market windows identified',
      'ESG blackouts respected'
    ]),
    success_criteria: JSON.stringify([
      'Timing model operational',
      'Windows identified',
      'Blackouts enforced'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-34-001 (Stage 34 integration)',
      'SD-STAGE-17-001 (GTM Strategy)',
      'Stage 37 (ESG Detection) output'
    ]),
    risks: JSON.stringify([
      'Timing prediction accuracy',
      'ESG signal reliability'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L4 (Trial) - EVA optimizes timing autonomously',
    upstream_stages: [34, 17],
    downstream_stages: [36, 38]
  },

  {
    id: 'SD-STAGE-36-001',
    title: 'Stage 36: Parallel Exploration - Adaptive WIP Management',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 36 (Parallel Exploration) to EVA orchestration layer. This stage manages work-in-progress across multiple parallel initiatives.`,
    rationale: `Parallel exploration enables option value creation. EVA must manage WIP limits and resource allocation across initiatives.`,
    scope: `
- EVA→Stage Input Injection: Active initiatives, resource constraints
- Stage→EVA Output Contracts: WIP status, initiative health, resource utilization
- Feedback loop: Iterates with Stage 35`,
    strategic_intent: 'Enable EVA to manage parallel initiatives.',
    key_changes: JSON.stringify([
      'Add EVA context injection for WIP context',
      'Implement initiative tracking schema',
      'Create WIP limit enforcement',
      'Emit WIP_UPDATE events'
    ]),
    strategic_objectives: JSON.stringify([
      'WIP limits enforced',
      'Initiative health tracked',
      'Resources optimized'
    ]),
    success_criteria: JSON.stringify([
      'WIP within limits',
      'Initiative metrics captured',
      'Resource utilization optimal'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-35-001 (Stage 35 integration)',
      'Initiative management infrastructure'
    ]),
    risks: JSON.stringify([
      'WIP limit violations',
      'Resource contention'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L4 (Trial) - EVA manages WIP autonomously',
    upstream_stages: [35],
    downstream_stages: [37]
  },

  {
    id: 'SD-STAGE-37-001',
    title: 'Stage 37: Strategic Risk Forecasting - ESG Detection',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 37 (Strategic Risk Forecasting) to EVA orchestration layer. This stage detects ESG and market risks that affect venture timing.`,
    rationale: `ESG and market risks affect venture success. EVA must monitor risks and feed signals to Stage 35 (GTM Timing).`,
    scope: `
- EVA→Stage Input Injection: Risk evaluation from Stage 6, market signals
- Stage→EVA Output Contracts: Risk forecast, ESG alerts, timing blackouts
- Cross-reference: Feeds Stage 35 and Stage 38`,
    strategic_intent: 'Enable EVA to forecast and manage risks.',
    key_changes: JSON.stringify([
      'Add EVA context injection for risk context',
      'Implement risk forecasting schema',
      'Create ESG alert system',
      'Emit RISK_FORECAST events'
    ]),
    strategic_objectives: JSON.stringify([
      'Risk forecasting operational',
      'ESG alerts functional',
      'Timing blackouts identified'
    ]),
    success_criteria: JSON.stringify([
      'Risk model operational',
      'ESG signals captured',
      'Blackouts communicated'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-36-001 (Stage 36 integration)',
      'Stage 6 (Risk Evaluation) output',
      'ESG signal infrastructure'
    ]),
    risks: JSON.stringify([
      'Forecast accuracy',
      'Signal reliability'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L4 (Trial) - EVA forecasts risk autonomously',
    upstream_stages: [36, 6],
    downstream_stages: [35, 38]
  },

  {
    id: 'SD-STAGE-38-001',
    title: 'Stage 38: Timing Optimization - ESG Blackout Enforcement',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 38 (Timing Optimization) to EVA orchestration layer. This stage enforces timing constraints based on ESG and market conditions.`,
    rationale: `Timing enforcement prevents poor market timing decisions. EVA must respect blackout periods and optimize execution timing.`,
    scope: `
- EVA→Stage Input Injection: ESG alerts from Stage 37, GTM timing from Stage 35
- Stage→EVA Output Contracts: Timing decisions, blackout enforcement, optimization results
- Integration: Combines Stage 35 and Stage 37 inputs`,
    strategic_intent: 'Enable EVA to enforce optimal timing.',
    key_changes: JSON.stringify([
      'Add EVA context injection for timing constraints',
      'Implement blackout enforcement schema',
      'Create timing optimization logic',
      'Emit TIMING_DECISION events'
    ]),
    strategic_objectives: JSON.stringify([
      'Blackouts enforced',
      'Timing optimized',
      'Decisions logged'
    ]),
    success_criteria: JSON.stringify([
      'Blackout enforcement functional',
      'Timing optimization operational',
      'Decision audit trail complete'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-37-001 (Stage 37 integration)',
      'SD-STAGE-35-001 (Stage 35 integration)'
    ]),
    risks: JSON.stringify([
      'Timing constraint conflicts',
      'Optimization complexity'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L4 (Trial) - EVA enforces timing autonomously',
    upstream_stages: [37, 35],
    downstream_stages: [39]
  },

  {
    id: 'SD-STAGE-39-001',
    title: 'Stage 39: Multi-Venture Coordination - Portfolio Orchestration',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 39 (Multi-Venture Coordination) to EVA orchestration layer. This is the CHAIRMAN APPROVAL GATE for venture active status.`,
    rationale: `Multi-venture coordination is the final gate before Venture Active. Chairman approval required for Stage 40 transition.`,
    scope: `
- EVA→Stage Input Injection: All venture metrics, portfolio status
- Stage→EVA Output Contracts: Coordination status, portfolio health, Chairman recommendation
- Gate: CHAIRMAN APPROVAL required for Stage 40`,
    strategic_intent: 'Enable Chairman to authorize Venture Active status.',
    key_changes: JSON.stringify([
      'Add EVA context injection for portfolio context',
      'Implement coordination schema',
      'Create Chairman approval gate',
      'Emit VENTURE_ACTIVE_APPROVED event'
    ]),
    strategic_objectives: JSON.stringify([
      'Coordination validated',
      'Portfolio health confirmed',
      'Chairman approval captured'
    ]),
    success_criteria: JSON.stringify([
      'Coordination complete',
      'Chairman approval received',
      'VENTURE_ACTIVE_APPROVED fires'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-38-001 (Stage 38 integration)',
      'All venture metrics'
    ]),
    risks: JSON.stringify([
      'Coordination complexity',
      'Chairman approval delay'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L0 (Advisory) - Chairman decides',
    upstream_stages: [38],
    downstream_stages: [40]
  },

  {
    id: 'SD-STAGE-40-001',
    title: 'Stage 40: Venture Active - Operational Mode Selection',
    category: 'stage-integration',
    sd_type: 'integration',
    target_application: 'EHG',
    priority: 'critical',
    description: `Wire Stage 40 (Venture Active) to EVA orchestration layer. This stage determines operating mode (active, pause, exit) based on growth and economics.`,
    rationale: `Venture Active is the final stage. EVA must continuously evaluate venture health and recommend operating mode.`,
    scope: `
- EVA→Stage Input Injection: Exit strategy from Stage 13, all metrics
- Stage→EVA Output Contracts: Operating mode, health indicators, exit readiness
- Substages: 40.1 Growth Management, 40.2 Exit Preparation, 40.3 Value Realization
- Mode decision: active | pause | exit`,
    strategic_intent: 'Enable EVA to manage venture operating mode.',
    key_changes: JSON.stringify([
      'Add EVA context injection for full context',
      'Implement operating mode schema',
      'Create mode decision logic',
      'Emit OPERATING_MODE_DECISION events'
    ]),
    strategic_objectives: JSON.stringify([
      'Operating mode determined',
      'Health indicators tracked',
      'Exit readiness assessed'
    ]),
    success_criteria: JSON.stringify([
      'Mode decision captured',
      'Health indicators functional',
      'Exit readiness quantified'
    ]),
    dependencies: JSON.stringify([
      'SD-STAGE-39-001 (Stage 39 integration)',
      'SD-STAGE-13-001 (Exit Strategy)',
      'All venture metrics'
    ]),
    risks: JSON.stringify([
      'Mode decision complexity',
      'Exit timing optimization'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'L4 (Trial) - EVA recommends mode, Chairman decides',
    upstream_stages: [39, 13],
    downstream_stages: []
  }
];

// ============================================================================
// SECTION B: FOUNDATIONAL SDs (CRITICAL PRIORITY - Non-Stage Specific)
// ============================================================================

const foundationalSDs = [
  {
    id: 'SD-DATA-CONTRACT-001',
    title: 'Stage Output Data Contract Standard (All 40 Stages)',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    priority: 'critical',
    description: `Define standardized output data contracts for all 40 stages. Each stage must emit outputs conforming to a schema that EVA can ingest.`,
    rationale: `Without standardized data contracts, EVA cannot reliably orchestrate the venture workflow. This is the foundation for all stage integration.`,
    scope: `
- Define JSON schema for each stage's output
- Create validation functions for contract enforcement
- Implement contract versioning
- Document contract migration patterns`,
    strategic_intent: 'Enable EVA to reliably consume stage outputs.',
    key_changes: JSON.stringify([
      'Define 40 stage output schemas',
      'Create validation middleware',
      'Implement contract versioning',
      'Add contract documentation'
    ]),
    strategic_objectives: JSON.stringify([
      'All stages have defined output contracts',
      'Contract validation is enforced',
      'Version migration is supported'
    ]),
    success_criteria: JSON.stringify([
      '40 stage schemas defined',
      'Validation passes for all outputs',
      'Documentation complete'
    ]),
    dependencies: JSON.stringify([]),
    risks: JSON.stringify([
      'Schema evolution complexity',
      'Breaking changes during development'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'Required for all EVA levels'
  },

  {
    id: 'SD-EVA-AUTH-001',
    title: 'EVA Authority Level Schema',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'critical',
    description: `Deploy EVA authority level schema defining L0-L4 permissions, allowed actions, and safety rails.`,
    rationale: `EVA must have clearly defined authority levels that gate what actions it can take autonomously.`,
    scope: `
- Create eva_authority_levels table
- Define L0-L4 level specifications
- Implement graduation criteria
- Create safety rail configuration`,
    strategic_intent: 'Enable safe EVA autonomy progression.',
    key_changes: JSON.stringify([
      'Create authority levels table',
      'Define L0-L4 specifications',
      'Implement graduation logic',
      'Configure safety rails'
    ]),
    strategic_objectives: JSON.stringify([
      'Authority levels defined',
      'Graduation criteria clear',
      'Safety rails enforced'
    ]),
    success_criteria: JSON.stringify([
      'Schema deployed',
      'L0 active by default',
      'Safety rails functional'
    ]),
    dependencies: JSON.stringify([]),
    risks: JSON.stringify([
      'Authority boundary edge cases',
      'Graduation criteria subjectivity'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'Foundation for all autonomy'
  },

  {
    id: 'SD-EVA-DECISION-001',
    title: 'EVA Decision Logging Infrastructure',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'critical',
    description: `Deploy decision logging infrastructure for 100% auditability of EVA recommendations and actions.`,
    rationale: `All EVA decisions must be logged for transparency, debugging, and Chairman oversight.`,
    scope: `
- Create eva_decision_log table
- Implement decision capture middleware
- Create decision query interface
- Add decision rollback tracking`,
    strategic_intent: 'Enable full auditability of EVA decisions.',
    key_changes: JSON.stringify([
      'Create decision log table',
      'Implement logging middleware',
      'Create query interface',
      'Add rollback tracking'
    ]),
    strategic_objectives: JSON.stringify([
      'All decisions logged',
      'Query interface functional',
      'Rollback auditable'
    ]),
    success_criteria: JSON.stringify([
      'Log table deployed',
      '100% decision capture',
      'Query interface operational'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-AUTH-001'
    ]),
    risks: JSON.stringify([
      'Log volume management',
      'Query performance'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'Required for all EVA levels'
  },

  {
    id: 'SD-EVA-CIRCUIT-001',
    title: 'Chairman Circuit Breaker System',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'critical',
    description: `Deploy circuit breaker system that trips after 2 failures, protecting against cascading EVA errors.`,
    rationale: `Circuit breakers prevent EVA from causing systemic failures. This is a critical safety mechanism.`,
    scope: `
- Create eva_circuit_breaker table
- Implement failure detection
- Create trip/reset logic
- Add Chairman notification`,
    strategic_intent: 'Prevent EVA from causing systemic failures.',
    key_changes: JSON.stringify([
      'Create circuit breaker table',
      'Implement failure tracking',
      'Create trip logic (2 failures)',
      'Add notification system'
    ]),
    strategic_objectives: JSON.stringify([
      'Circuit breaker operational',
      'Failure detection functional',
      'Chairman notified on trip'
    ]),
    success_criteria: JSON.stringify([
      'Breaker table deployed',
      'Trip at 2 failures',
      'Notification functional'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-DECISION-001'
    ]),
    risks: JSON.stringify([
      'False positive trips',
      'Recovery timing'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'Required for L1+ autonomy'
  },

  {
    id: 'SD-VERIFY-LADDER-001',
    title: 'Gate 0 Static Analysis Verification',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    priority: 'critical',
    description: `Implement Gate 0 of the verification ladder: static analysis (lint, typecheck, import resolution).`,
    rationale: `Gate 0 catches basic errors before code reaches runtime. This is the foundation of quality gates.`,
    scope: `
- Implement ESLint 0 errors check
- Add TypeScript noEmit validation
- Create import resolution check
- Integrate into CI/CD`,
    strategic_intent: 'Catch basic errors early in the pipeline.',
    key_changes: JSON.stringify([
      'Add ESLint validation',
      'Add TypeScript check',
      'Add import validation',
      'Integrate into CI'
    ]),
    strategic_objectives: JSON.stringify([
      'Gate 0 operational',
      'Static analysis passing',
      'CI integration complete'
    ]),
    success_criteria: JSON.stringify([
      'ESLint 0 errors enforced',
      'TypeScript passes',
      'Import resolution clean'
    ]),
    dependencies: JSON.stringify([]),
    risks: JSON.stringify([
      'False positives',
      'Rule tuning required'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'Required for automated quality gates'
  },

  {
    id: 'SD-VERIFY-LADDER-002',
    title: 'Gate 1 Unit Test Integration',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    priority: 'critical',
    description: `Implement Gate 1 of the verification ladder: unit tests (100% test pass, 80% coverage).`,
    rationale: `Unit tests validate individual components. Required for quality gate scoring.`,
    scope: `
- Implement unit test runner
- Add coverage calculation
- Create test result schema
- Integrate into quality gates`,
    strategic_intent: 'Validate component correctness.',
    key_changes: JSON.stringify([
      'Add unit test runner',
      'Add coverage tracking',
      'Create result schema',
      'Integrate into gates'
    ]),
    strategic_objectives: JSON.stringify([
      'Gate 1 operational',
      'Coverage tracked',
      'Results in quality gate'
    ]),
    success_criteria: JSON.stringify([
      '100% test pass required',
      '80% coverage threshold',
      'Gate integration complete'
    ]),
    dependencies: JSON.stringify([
      'SD-VERIFY-LADDER-001'
    ]),
    risks: JSON.stringify([
      'Test maintenance burden',
      'Coverage gaming'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'Required for L2+ autonomy'
  },

  {
    id: 'SD-QUALITY-GATE-001',
    title: 'Quality Gate Reweighting (35/25/20/20)',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    priority: 'critical',
    description: `Reweight quality gate components: Test Evidence 35%, Diff Minimality 25%, Rollback Safety 20%, Migration Correctness 20%.`,
    rationale: `Quality gate weights affect SD completion validation. These weights reflect Chairman priorities.`,
    scope: `
- Update quality gate scoring function
- Add weight configuration table
- Create scoring audit trail
- Document weight rationale`,
    strategic_intent: 'Align quality gate with Chairman priorities.',
    key_changes: JSON.stringify([
      'Update scoring weights',
      'Create weight config table',
      'Add scoring audit',
      'Document rationale'
    ]),
    strategic_objectives: JSON.stringify([
      'Weights applied correctly',
      'Configuration auditable',
      'Rationale documented'
    ]),
    success_criteria: JSON.stringify([
      'Test Evidence: 35%',
      'Diff Minimality: 25%',
      'Rollback Safety: 20%',
      'Migration Correctness: 20%'
    ]),
    dependencies: JSON.stringify([
      'SD-VERIFY-LADDER-002'
    ]),
    risks: JSON.stringify([
      'Weight tuning needed',
      'Score interpretation'
    ]),
    phase_alignment: 'Phase C (Build & Integrate)',
    autonomy_relevance: 'Required for automated quality assessment'
  },

  {
    id: 'SD-LEO-METRICS-001',
    title: 'Gate Pass Rate Dashboard',
    category: 'feature',
    sd_type: 'feature',
    target_application: 'EHG_Engineer',
    priority: 'high',
    description: `Deploy dashboard showing gate pass rate trends, enabling visibility into quality health.`,
    rationale: `Gate pass rate is a key success metric. Dashboard provides visibility for Chairman and EVA.`,
    scope: `
- Create gate pass rate calculation
- Build dashboard UI
- Add trend visualization
- Implement alerting`,
    strategic_intent: 'Provide visibility into quality health.',
    key_changes: JSON.stringify([
      'Create pass rate calculation',
      'Build dashboard UI',
      'Add trend charts',
      'Implement alerts'
    ]),
    strategic_objectives: JSON.stringify([
      'Pass rate visible',
      'Trends trackable',
      'Alerts functional'
    ]),
    success_criteria: JSON.stringify([
      'Dashboard deployed',
      'Rate calculated correctly',
      'Trends visible'
    ]),
    dependencies: JSON.stringify([
      'SD-QUALITY-GATE-001'
    ]),
    risks: JSON.stringify([
      'Dashboard performance',
      'Alert fatigue'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'Required for EVA monitoring'
  },

  {
    id: 'SD-EFFORT-POLICY-001',
    title: 'Effort Policy Table & Integration',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG_Engineer',
    priority: 'high',
    description: `Deploy effort policy table that controls effort level by phase, SD type, and model tier.`,
    rationale: `Effort policy enables adaptive effort allocation, optimizing for cost and quality.`,
    scope: `
- Create leo_effort_policies table
- Implement policy lookup
- Add phase-based defaults
- Create override mechanism`,
    strategic_intent: 'Enable adaptive effort allocation.',
    key_changes: JSON.stringify([
      'Create policy table',
      'Implement lookup',
      'Add defaults',
      'Create overrides'
    ]),
    strategic_objectives: JSON.stringify([
      'Policies defined',
      'Lookup functional',
      'Overrides work'
    ]),
    success_criteria: JSON.stringify([
      'Table deployed',
      'Phase defaults set',
      'Lookup operational'
    ]),
    dependencies: JSON.stringify([]),
    risks: JSON.stringify([
      'Policy tuning needed',
      'Override complexity'
    ]),
    phase_alignment: 'Phase A (Foundations)',
    autonomy_relevance: 'Required for cost optimization'
  }
];

// ============================================================================
// SECTION C: VISION-ALIGNMENT SDs (HIGH PRIORITY)
// ============================================================================

const visionSDs = [
  {
    id: 'SD-EVA-PERSONALITY-001',
    title: 'EVA Chief-of-Staff Personality Configuration',
    category: 'feature',
    sd_type: 'feature',
    target_application: 'EHG',
    priority: 'high',
    description: `Configure EVA's Chief-of-Staff personality: filter noise, reduce cognitive load, provide clear explanations.`,
    rationale: `EVA should act as a Chief-of-Staff, not a hyperactive agent. This aligns with Chairman profile preferences.`,
    scope: `
- Define filtering thresholds by urgency
- Implement noise reduction logic
- Create explanation templates
- Configure communication rules`,
    strategic_intent: 'Align EVA behavior with Chairman preferences.',
    key_changes: JSON.stringify([
      'Define filtering thresholds',
      'Implement noise reduction',
      'Create templates',
      'Configure rules'
    ]),
    strategic_objectives: JSON.stringify([
      'Noise filtered appropriately',
      'Cognitive load reduced',
      'Explanations clear'
    ]),
    success_criteria: JSON.stringify([
      'Filtering operational',
      'Noise reduction working',
      'Chairman satisfaction'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-AUTH-001',
      'SD-EVA-DECISION-001'
    ]),
    risks: JSON.stringify([
      'Over-filtering risk',
      'Personality tuning'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'Required for L1+ autonomy'
  },

  {
    id: 'SD-EVA-OVERSIGHT-001',
    title: 'Chairman Oversight Dashboard',
    category: 'feature',
    sd_type: 'feature',
    target_application: 'EHG',
    priority: 'high',
    description: `Deploy Chairman oversight dashboard for 1-2 hr/day workflow, showing venture health, EVA decisions, and alerts.`,
    rationale: `Chairman needs efficient oversight interface to reduce cognitive load while maintaining control.`,
    scope: `
- Create oversight dashboard UI
- Add venture health summary
- Implement decision review queue
- Add alert management`,
    strategic_intent: 'Enable efficient Chairman oversight.',
    key_changes: JSON.stringify([
      'Create dashboard UI',
      'Add health summary',
      'Create decision queue',
      'Add alert management'
    ]),
    strategic_objectives: JSON.stringify([
      'Dashboard deployed',
      'Health visible at glance',
      'Decision review efficient'
    ]),
    success_criteria: JSON.stringify([
      'Dashboard functional',
      'Review time < 2 hr/day',
      'Alerts actionable'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-DECISION-001',
      'SD-LEO-METRICS-001'
    ]),
    risks: JSON.stringify([
      'Dashboard complexity',
      'Information overload'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'Required for L4 Trial Mode'
  },

  {
    id: 'SD-EVA-EMERG-001',
    title: 'Emergency Stop Enhancement (10-second Response)',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'high',
    description: `Enhance emergency stop to 10-second response time with full action rollback capability.`,
    rationale: `Fast emergency stop is critical for L4 Trial Mode safety. Chairman must be able to halt EVA instantly.`,
    scope: `
- Implement 10-second SLA
- Add action queue cancellation
- Create rollback orchestration
- Add Chairman notification`,
    strategic_intent: 'Enable instant EVA halt for safety.',
    key_changes: JSON.stringify([
      'Implement 10s SLA',
      'Add queue cancellation',
      'Create rollback',
      'Add notification'
    ]),
    strategic_objectives: JSON.stringify([
      'Stop within 10 seconds',
      'Actions cancelled',
      'Rollback initiated'
    ]),
    success_criteria: JSON.stringify([
      '10-second response verified',
      'Queue cancellation works',
      'Rollback functional'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-CIRCUIT-001'
    ]),
    risks: JSON.stringify([
      'Response time guarantees',
      'Rollback complexity'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'Required for L4 Trial Mode'
  },

  {
    id: 'SD-BANDWIDTH-RISK-001',
    title: 'Chairman Bandwidth Risk Protocol',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'high',
    description: `Implement bandwidth risk detection when Chairman hours exceed target for 2+ weeks, with de-scope options.`,
    rationale: `Chairman bandwidth is a constraint. EVA should surface risk and present options when target exceeded.`,
    scope: `
- Implement hour tracking
- Create 2-week trend detection
- Generate de-scope options
- Add risk alert`,
    strategic_intent: 'Protect Chairman bandwidth.',
    key_changes: JSON.stringify([
      'Add hour tracking',
      'Implement trend detection',
      'Create option generator',
      'Add risk alert'
    ]),
    strategic_objectives: JSON.stringify([
      'Hours tracked',
      'Trend detected',
      'Options presented'
    ]),
    success_criteria: JSON.stringify([
      'Tracking operational',
      'Alert fires at 2 weeks',
      'Options actionable'
    ]),
    dependencies: JSON.stringify([
      'SD-EVA-PERSONALITY-001'
    ]),
    risks: JSON.stringify([
      'Tracking accuracy',
      'Option relevance'
    ]),
    phase_alignment: 'Phase B (IDEATION & Selection)',
    autonomy_relevance: 'Required for sustainable operations'
  },

  {
    id: 'SD-40-STAGE-CONTEXT',
    title: '40-Stage Workflow Context Integration',
    category: 'infrastructure',
    sd_type: 'infrastructure',
    target_application: 'EHG',
    priority: 'high',
    description: `Integrate full 40-stage workflow context into EVA, enabling comprehensive venture awareness.`,
    rationale: `EVA must understand the full workflow to make informed orchestration decisions.`,
    scope: `
- Create workflow context schema
- Implement context loading
- Add stage dependency awareness
- Create context refresh mechanism`,
    strategic_intent: 'Enable EVA full workflow awareness.',
    key_changes: JSON.stringify([
      'Create context schema',
      'Implement loading',
      'Add dependency awareness',
      'Create refresh'
    ]),
    strategic_objectives: JSON.stringify([
      'Context complete',
      'Dependencies understood',
      'Refresh operational'
    ]),
    success_criteria: JSON.stringify([
      'All 40 stages in context',
      'Dependencies mapped',
      'Context current'
    ]),
    dependencies: JSON.stringify([
      'SD-DATA-CONTRACT-001',
      'All Stage SDs'
    ]),
    risks: JSON.stringify([
      'Context size',
      'Refresh latency'
    ]),
    phase_alignment: 'Phase E (Trial Orchestrator)',
    autonomy_relevance: 'Required for L4 Trial Mode'
  }
];

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function insertSDs() {
  console.log('='.repeat(70));
  console.log('Strategic Directives Generator for Stages 7-40');
  console.log('Generated: 2025-11-29');
  console.log('='.repeat(70));

  const allSDs = [
    ...stageSDs.map(sd => ({ ...sd, section: 'A: Stage-Specific' })),
    ...foundationalSDs.map(sd => ({ ...sd, section: 'B: Foundational' })),
    ...visionSDs.map(sd => ({ ...sd, section: 'C: Vision-Alignment' }))
  ];

  console.log(`\nTotal SDs to insert: ${allSDs.length}`);
  console.log(`  - Stage-Specific (7-40): ${stageSDs.length}`);
  console.log(`  - Foundational: ${foundationalSDs.length}`);
  console.log(`  - Vision-Alignment: ${visionSDs.length}`);

  let successCount = 0;
  let errorCount = 0;

  for (const sd of allSDs) {
    try {
      const insertData = {
        id: sd.id,
        sd_key: sd.id,  // sd_key matches id per schema requirements
        title: sd.title,
        version: '1.0',
        status: 'draft',
        category: sd.category,
        priority: sd.priority,
        description: sd.description,
        strategic_intent: sd.strategic_intent || null,
        rationale: sd.rationale,
        scope: sd.scope,
        key_changes: sd.key_changes || '[]',
        strategic_objectives: sd.strategic_objectives || '[]',
        success_criteria: sd.success_criteria || '[]',
        dependencies: sd.dependencies || '[]',
        risks: sd.risks || '[]',
        metadata: JSON.stringify({
          sd_type: sd.sd_type,
          target_application: sd.target_application,
          phase_alignment: sd.phase_alignment,
          autonomy_relevance: sd.autonomy_relevance,
          section: sd.section,
          upstream_stages: sd.upstream_stages || [],
          downstream_stages: sd.downstream_stages || [],
          generated_at: new Date().toISOString(),
          generator_version: '1.0.0'
        }),
        created_by: 'SD-Generator-v1.0'
      };

      const { error } = await supabase
        .from('strategic_directives_v2')
        .upsert(insertData, { onConflict: 'id' });

      if (error) {
        console.error(`[ERROR] ${sd.id}: ${error.message}`);
        errorCount++;
      } else {
        console.log(`[OK] ${sd.id}: ${sd.title}`);
        successCount++;
      }
    } catch (err) {
      console.error(`[EXCEPTION] ${sd.id}: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Insertion Complete: ${successCount} success, ${errorCount} errors`);
  console.log('='.repeat(70));

  return { successCount, errorCount };
}

// Run if executed directly
insertSDs()
  .then(result => {
    console.log('\nDone.');
    process.exit(result.errorCount > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
