#!/usr/bin/env node

/**
 * One-time script: Create all 33 EVA Phase A-E SDs
 *
 * Creates:
 * - 6 orchestrator SDs (Phase A, Template Gap-Fill, Phase B, C, D, E)
 * - 27 leaf SDs (children of orchestrators)
 * - Correct parent-child relationships
 * - Phase B-E blocked by predecessor phase orchestrator
 *
 * Run: node scripts/one-time/create-eva-phase-a-e-sds.js
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================================
// SD Definitions
// ============================================================================

function buildSD(overrides) {
  const type = overrides.sd_type || 'feature';
  const title = overrides.title || 'Untitled SD';
  const id = randomUUID();

  return {
    id,
    sd_key: overrides.sd_key,
    title,
    description: overrides.description || title,
    scope: overrides.scope || overrides.description || title,
    rationale: overrides.rationale || 'EVA Phase A-E implementation plan',
    sd_type: type,
    status: 'draft',
    priority: overrides.priority || 'medium',
    category: overrides.category || (type === 'orchestrator' ? 'Orchestrator' : 'Feature'),
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    created_by: 'Claude',
    parent_sd_id: overrides.parent_sd_id || null,
    success_criteria: overrides.success_criteria || [
      'All implementation items from scope are complete',
      'Code passes lint and type checks',
      'PR reviewed and approved'
    ],
    success_metrics: overrides.success_metrics || [
      { metric: 'Implementation completeness', target: '100% of scope items implemented' },
      { metric: 'Test coverage', target: '≥80% code coverage for new code' },
      { metric: 'Zero regressions', target: '0 existing tests broken' }
    ],
    strategic_objectives: overrides.strategic_objectives || [
      `Implement ${title} as specified in the SD scope`,
      'Maintain backward compatibility with existing functionality'
    ],
    key_changes: overrides.key_changes || [`Implement core changes for: ${title}`],
    smoke_test_steps: type === 'orchestrator' ? [] : overrides.smoke_test_steps || [
      { step_number: 1, instruction: `Navigate to the relevant area for: ${title}`, expected_outcome: 'System loads without errors' },
      { step_number: 2, instruction: 'Verify the primary functionality works as expected', expected_outcome: 'Core feature operates correctly' },
      { step_number: 3, instruction: 'Test an edge case or error scenario', expected_outcome: 'Appropriate error handling' }
    ],
    key_principles: overrides.key_principles || [
      'Follow LEO Protocol for all changes',
      'Ensure backward compatibility'
    ],
    risks: overrides.risks || [],
    metadata: {
      source: 'manual',
      created_via: 'create-eva-phase-a-e-sds',
      created_at: new Date().toISOString(),
      eva_phase: overrides.eva_phase || 'A',
      ...(overrides.metadata || {})
    }
  };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  EVA Phase A-E SD Creation (33 SDs)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check for existing SDs to prevent duplicates
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .like('sd_key', 'SD-EVA-%');

  const existingKeys = new Set((existing || []).map(s => s.sd_key));
  console.log(`Found ${existingKeys.size} existing SD-EVA-* SDs\n`);

  const allSDs = [];
  const idMap = {}; // sd_key -> uuid for parent references

  // ========================================================================
  // PHASE A: First Venture End-to-End (P0)
  // ========================================================================

  // Phase A Orchestrator
  const phaseA = buildSD({
    sd_key: 'SD-EVA-ORCH-PHASE-A-001',
    title: 'EVA Phase A: First Venture End-to-End',
    description: 'One venture progresses from Stage 0 through all 25 stages via CLI, with Chairman decisions at 4 blocking gates (0, 10, 22, 25). Validates the complete venture lifecycle pipeline.',
    scope: 'Chairman Decision API, stage template gap-fill (25 templates), event bus wiring, return path (LEO→stages), CLI task dispatcher, end-to-end integration test.',
    sd_type: 'orchestrator',
    priority: 'critical',
    eva_phase: 'A',
    success_criteria: [
      'Chairman initiates venture via "eva ideate", Stage 0 runs synthesis + forecast',
      'Chairman reviews and approves via CLI, venture created at Stage 1',
      '"eva run <id>" progresses through Stages 2-25 with DFE evaluation at each stage',
      'Chairman submits decisions via CLI at Stages 10, 22, 25',
      'SD Bridge creates LEO SDs at Stage 18, return path advances Stage 19',
      'All 25 stage templates have active analysisSteps',
      'Architecture Section 13 15-step test scenario passes end-to-end'
    ],
    success_metrics: [
      { metric: 'Stage coverage', target: 'All 25 stages traversed by one venture' },
      { metric: 'Chairman gates', target: '4 blocking decisions (0, 10, 22, 25) resolved via CLI' },
      { metric: 'SD Bridge integration', target: 'LEO SDs created at Stage 18 and return path works' },
      { metric: 'Template completeness', target: '25/25 templates have active analysisSteps' }
    ],
    strategic_objectives: [
      'Prove the complete venture lifecycle pipeline works end-to-end',
      'Wire all existing dormant infrastructure into a functioning system',
      'Establish the CLI as the authoritative interface for venture progression'
    ]
  });
  idMap[phaseA.sd_key] = phaseA.id;
  allSDs.push(phaseA);

  // Child A: Chairman Decision API + Interactive Review
  const childA = buildSD({
    sd_key: 'SD-EVA-FEAT-CHAIRMAN-API-001',
    title: 'Chairman Decision API + Interactive Review',
    description: 'CLI commands (eva decisions list/view/approve/reject). Wire conductChairmanReview() to chairman_decisions table. Supabase Realtime subscription for decision status changes. Unblocks Stages 0, 10, 22, 25 — without this, Phase A deadlocks.',
    scope: 'CLI commands for chairman decisions, conductChairmanReview() wiring to chairman_decisions table, Supabase Realtime subscription, decision status tracking.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      'eva decisions list — shows pending decisions with venture context',
      'eva decisions view <id> — shows full decision details + venture brief',
      'eva decisions approve <id> — approves and unblocks venture progression',
      'eva decisions reject <id> — rejects with required feedback',
      'conductChairmanReview() writes to chairman_decisions table',
      'Supabase Realtime subscription fires on decision status change',
      'Stage 0, 10, 22, 25 blocking gates correctly create and wait for decisions'
    ],
    success_metrics: [
      { metric: 'CLI commands', target: '4 commands (list/view/approve/reject) functional' },
      { metric: 'Realtime subscription', target: 'Decision changes detected within 2 seconds' },
      { metric: 'Gate integration', target: '4 blocking gates (0, 10, 22, 25) create decisions correctly' }
    ]
  });
  idMap[childA.sd_key] = childA.id;
  allSDs.push(childA);

  // Child B: Stage Template Gap-Fill (nested orchestrator)
  const childB = buildSD({
    sd_key: 'SD-EVA-ORCH-TEMPLATE-GAPFILL-001',
    title: 'Stage Template Gap-Fill: Active analysisSteps for All 25 Stages',
    description: 'Nested orchestrator. All 25 stage templates are passive containers (validate-only). Each needs active analysisSteps with execute() functions. The orchestrator (eva-orchestrator.js lines 157-163) already has machinery to invoke these. Each step uses the LLM Client Factory (sonnet tier) and loads upstream artifacts from venture_artifacts. Grouped into 6 children by lifecycle phase.',
    scope: 'Add analysisSteps[] arrays with execute() functions to all 25 stage templates. 6 phase-grouped children (Stages 1-5, 6-9, 10-12, 13-16, 17-22, 23-25).',
    sd_type: 'orchestrator',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      'All 25 stage templates have active analysisSteps arrays',
      'Each analysisStep has an execute() function that invokes LLM Client Factory',
      'Each stage consumes upstream artifacts from venture_artifacts table',
      'Kill gates at Stages 3, 5 use hybrid scoring (50% deterministic + 50% AI)',
      'Reality gates at Stages 9, 12 evaluate generated data',
      'Promotion gate at Stage 16 checks financial viability',
      'Chairman decision gates at Stages 10, 22, 25 create chairman_decisions records'
    ],
    success_metrics: [
      { metric: 'Template coverage', target: '25/25 templates with active analysisSteps' },
      { metric: 'Upstream consumption', target: 'Each stage reads from venture_artifacts' },
      { metric: 'Gate types', target: 'Kill, Reality, Promotion, and Decision gates all functional' }
    ],
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-CHAIRMAN-API-001'] }
  });
  idMap[childB.sd_key] = childB.id;
  allSDs.push(childB);

  // Child B-1: Stages 1-5 (THE TRUTH)
  const childB1 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-TRUTH-001',
    title: 'Stage Templates: THE TRUTH (Stages 1-5)',
    description: 'Active analysisSteps for Stages 1-5. Stage 1: hydration from Stage 0 synthesis. Stage 2: multi-persona analysis with 0-100 scoring. Stage 3: hybrid scoring (50% deterministic + 50% AI) kill gate. Stage 4: competitive landscape with pricing per competitor. Stage 5: financial model generation with unit economics (CAC, LTV, payback). Kill gates at 3 and 5.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 1: Hydrates from Stage 0 synthesis output, adds problemStatement (required)',
      'Stage 2: Multi-persona analysis with 0-100 integer scale, aligns to Stage 3 kill metrics',
      'Stage 3: Hybrid scoring (50% deterministic + 50% AI), kill threshold above 40',
      'Stage 4: Competitor discovery with pricing model per competitor, feeds Stage 5',
      'Stage 5: Financial model with CAC, LTV, LTV:CAC, payback period, ROI 25% with bands',
      'Kill gates at 3 and 5 auto-resolve based on generated metrics'
    ]
  });
  idMap[childB1.sd_key] = childB1.id;
  allSDs.push(childB1);

  // Child B-2: Stages 6-9 (THE ENGINE)
  const childB2 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-ENGINE-001',
    title: 'Stage Templates: THE ENGINE (Stages 6-9)',
    description: 'Active analysisSteps for Stages 6-9. Stage 6: risk generation seeded from Stage 5 financials, 2-factor scoring (probability x consequence). Stage 7: pricing strategy consuming Stages 4-6, pricingModel enum. Stage 8: 9-block BMC generation from Stages 1-7 with evidence fields. Stage 9: exit strategy with valuation (revenue multiple range). Reality Gate at Stage 9.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 6: Risk generation seeded from Stage 5, probability x consequence scoring',
      'Stage 7: Pricing strategy consuming Stages 4-6, 6-value pricingModel enum',
      'Stage 8: 9-block BMC from Stages 1-7, structured items with evidence field',
      'Stage 9: Exit type enum (acquisition/ipo/merger/mbo/liquidation), lightweight valuation',
      'Reality Gate at Stage 9 evaluates exit viability'
    ]
  });
  idMap[childB2.sd_key] = childB2.id;
  allSDs.push(childB2);

  // Child B-3: Stages 10-12 (THE IDENTITY)
  const childB3 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-IDENTITY-001',
    title: 'Stage Templates: THE IDENTITY (Stages 10-12)',
    description: 'Active analysisSteps for Stages 10-12. Stage 10: brand genome + name generation, narrative extension (vision/mission/brand_voice), Chairman decision (approved/revise/working_title). Stage 11: 8-channel GTM strategy with persona + pain_points per tier. Stage 12: sales logic wired to Stage 7 pricing + Stage 11 channels, conversion_rate_estimate. Reality Gate at Stage 12.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 10: Brand genome + name generation, Chairman decision gate',
      'Stage 11: Exactly 8 GTM channels ($0 budget = backlog), persona + pain_points',
      'Stage 12: Sales model wired to Stage 7 pricing + Stage 11 channels',
      'Reality Gate at Stage 12 evaluates sales-identity completeness'
    ]
  });
  idMap[childB3.sd_key] = childB3.id;
  allSDs.push(childB3);

  // Child B-4: Stages 13-16 (THE BLUEPRINT)
  const childB4 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001',
    title: 'Stage Templates: THE BLUEPRINT (Stages 13-16)',
    description: 'Active analysisSteps for Stages 13-16. Stage 13: roadmap generation consuming Stages 1-12, sales_model drives feature generation, priority (now/next/later). Stage 14: architecture generation, map deliverable types to architecture layers, security section, Schema-Lite entities. Stage 15: agent allocation from Stages 12-14, service/tool requirements, compute budget. Stage 16: "Startup Standard" P&L consuming 7 prior stages. Promotion gate at 16.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 13: Roadmap with now/next/later priorities, driven by sales model',
      'Stage 14: Architecture with security section, Schema-Lite data entities',
      'Stage 15: Agent allocation with compute budget per phase',
      'Stage 16: Startup Standard P&L with phase-variable costs from Stage 15',
      'Promotion gate at Stage 16 checks financial viability'
    ]
  });
  idMap[childB4.sd_key] = childB4.id;
  allSDs.push(childB4);

  // Child B-5: Stages 17-22 (THE BUILD LOOP)
  const childB5 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001',
    title: 'Stage Templates: THE BUILD LOOP (Stages 17-22)',
    description: 'Active analysisSteps for Stages 17-22. Stage 17: pre-build checklist from Blueprint stages, build_readiness decision. Stage 18: sprint planning from Stage 13 "now" deliverables, SD Bridge enrichment. Stage 19: task initialization from Stage 18, sprint_completion decision. Stage 20: QA scoping, quality_decision (pass/conditional_pass/fail). Stage 21: build review (approve/conditional/reject). Stage 22: release readiness + Chairman decision (release/hold/cancel).',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 17: Pre-build checklist, build_readiness decision (go/conditional_go/no_go)',
      'Stage 18: Sprint items from Stage 13, SD Bridge creates LEO SDs',
      'Stage 19: Tasks initialized 1:1 from Stage 18, sprint_completion decision',
      'Stage 20: QA scoped from Stage 18/19, quality_decision enum',
      'Stage 21: Build review consuming Stages 14/19/20, review_decision enum',
      'Stage 22: Release readiness with Chairman decision (release/hold/cancel)'
    ]
  });
  idMap[childB5.sd_key] = childB5.id;
  allSDs.push(childB5);

  // Child B-6: Stages 23-25 (LAUNCH & LEARN)
  const childB6 = buildSD({
    sd_key: 'SD-EVA-FEAT-TEMPLATES-LAUNCH-001',
    title: 'Stage Templates: LAUNCH & LEARN (Stages 23-25)',
    description: 'Active analysisSteps for Stages 23-25. Stage 23: launch brief synthesized from Stage 22, success_criteria as contract with Stage 24. Stage 24: launch scorecard with AARRR metrics, success_criteria_evaluation. Stage 25: venture_decision (continue/pivot/expand/sunset/exit) — THE capstone output. Financial comparison, venture health score, Chairman decision.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: childB.id,
    eva_phase: 'A',
    success_criteria: [
      'Stage 23: Launch brief from Stage 22, success_criteria defined for Stage 24',
      'Stage 24: AARRR metrics scorecard, success_criteria_evaluation maps targets to actuals',
      'Stage 25: venture_decision (continue/pivot/expand/sunset/exit) produced',
      'Stage 25: Financial comparison + venture health score synthesized',
      'Chairman decision at Stage 25 determines venture future'
    ]
  });
  idMap[childB6.sd_key] = childB6.id;
  allSDs.push(childB6);

  // Child C: Event Bus Handler Wiring
  const childC = buildSD({
    sd_key: 'SD-EVA-FEAT-EVENT-BUS-001',
    title: 'Event Bus Handler Wiring',
    description: 'Connect dormant event bus infrastructure to service invocations. The event bus (eva_event_log, evaEventBus.ts) publishes events but nothing currently subscribes. Wire event handlers that trigger service actions when events are emitted.',
    scope: 'Event bus subscriber registration, handler functions for key events (stage.completed, decision.submitted, gate.evaluated), service invocation on event receipt.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      'Event bus has registered subscribers for key event types',
      'stage.completed event triggers next-stage evaluation',
      'decision.submitted event triggers venture unblocking',
      'gate.evaluated event triggers appropriate action (proceed/block/kill)',
      'Dead letter queue captures failed event processing'
    ],
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-CHAIRMAN-API-001'] }
  });
  idMap[childC.sd_key] = childC.id;
  allSDs.push(childC);

  // Child D: Return Path (LEO → Stage 19)
  const childD = buildSD({
    sd_key: 'SD-EVA-FEAT-RETURN-PATH-001',
    title: 'Return Path: LEO SD Completion → Stage 19 Progress Sync',
    description: 'SD Bridge sends work out to LEO at Stage 18 but no return event handler exists. Build the return path: when LEO SDs complete, the event handler updates Stage 19 build execution progress. Maps SD status to sprint task status.',
    scope: 'SD completion event handler, Stage 19 progress sync, SD status to sprint task mapping, error handling for partial SD completion.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      'sd.completed event handler exists and processes LEO SD completions',
      'Stage 19 build_tasks updated when corresponding LEO SDs complete',
      'Partial SD completion (some tasks done, some pending) handled correctly',
      'Failed SDs create issues in Stage 19 with severity classification',
      'sprint_completion decision auto-evaluates when all SDs resolve'
    ],
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-EVENT-BUS-001'] }
  });
  idMap[childD.sd_key] = childD.id;
  allSDs.push(childD);

  // Child E: CLI Task Dispatcher
  const childE = buildSD({
    sd_key: 'SD-EVA-FEAT-CLI-DISPATCHER-001',
    title: 'Unified eva run <venture_id> [--stage N] Command',
    description: 'Individual scripts exist for new/evaluate/status/sync but no unified runner. Build the unified "eva run <venture_id> [--stage N]" command that orchestrates venture progression through all stages, respecting gates, decisions, and dependencies.',
    scope: 'Unified CLI entry point, stage sequencing logic, gate checking, decision waiting, progress reporting.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      '"eva run <id>" progresses venture through all stages sequentially',
      '"eva run <id> --stage N" starts/resumes from specific stage',
      'Gates (kill, reality, promotion, decision) are checked at correct boundaries',
      'Venture blocks at decision gates until Chairman approves',
      'Progress displayed in CLI with stage name, status, and elapsed time',
      'Ctrl+C gracefully pauses (can resume with same command)'
    ],
    metadata: {
      depends_on_sd_keys: [
        'SD-EVA-FEAT-CHAIRMAN-API-001',
        'SD-EVA-ORCH-TEMPLATE-GAPFILL-001'
      ]
    }
  });
  idMap[childE.sd_key] = childE.id;
  allSDs.push(childE);

  // Child F: End-to-End Integration Test
  const childF = buildSD({
    sd_key: 'SD-EVA-FEAT-PHASE-A-VALIDATION-001',
    title: 'Phase A End-to-End Integration Test (15-Step Scenario)',
    description: 'Architecture Section 13 defines a 15-step test scenario that validates the entire Phase A capability. This SD implements that scenario as an automated integration test. All Phase A children must be complete first.',
    scope: '15-step integration test: ideate → Stage 0 → Chairman approve → Stage 1-9 auto → Stage 10 decision → Stage 11-17 auto → Stage 18 SD Bridge → return path → Stage 20-21 auto → Stage 22 decision → Stage 23-24 auto → Stage 25 decision → ops cycle.',
    sd_type: 'feature',
    priority: 'critical',
    parent_sd_id: phaseA.id,
    eva_phase: 'A',
    success_criteria: [
      'Automated test covers all 15 steps from architecture Section 13',
      'Test creates a real venture and progresses through all 25 stages',
      'Chairman decisions are auto-approved in test mode',
      'SD Bridge creates mock LEO SDs and return path processes them',
      'Test validates gate behavior (kill, reality, promotion, decision)',
      'Test completes without manual intervention',
      'Test cleanup removes test venture and artifacts'
    ],
    metadata: {
      depends_on_sd_keys: [
        'SD-EVA-FEAT-CHAIRMAN-API-001',
        'SD-EVA-ORCH-TEMPLATE-GAPFILL-001',
        'SD-EVA-FEAT-EVENT-BUS-001',
        'SD-EVA-FEAT-RETURN-PATH-001',
        'SD-EVA-FEAT-CLI-DISPATCHER-001'
      ]
    }
  });
  idMap[childF.sd_key] = childF.id;
  allSDs.push(childF);

  // ========================================================================
  // PHASE B: Automated Scheduling + Chairman Dashboard (P1)
  // ========================================================================

  const phaseB = buildSD({
    sd_key: 'SD-EVA-ORCH-PHASE-B-001',
    title: 'EVA Phase B: Automated Scheduling + Chairman Dashboard',
    description: 'Ventures progress automatically. Chairman uses dashboard instead of CLI for decision management. Conditional on Phase A validation (15-step test passes).',
    scope: 'EVA Master Scheduler, Chairman Dashboard, notification service, DFE escalation presentation.',
    sd_type: 'orchestrator',
    priority: 'high',
    eva_phase: 'B',
    success_criteria: [
      'Create 3 ventures; scheduler auto-advances them',
      'Chairman receives notifications (immediate + digest)',
      'Chairman reviews decisions in dashboard',
      'Ventures unblock automatically after dashboard approval',
      'DFE escalation context + mitigations rendered in dashboard'
    ],
    success_metrics: [
      { metric: 'Auto-scheduling', target: '3 ventures auto-advance without manual "eva run"' },
      { metric: 'Dashboard decisions', target: 'Chairman approves/rejects via dashboard UI' },
      { metric: 'Notification delivery', target: 'Immediate + daily digest notifications working' }
    ],
    metadata: {
      conditional_note: 'Phase B activates after Phase A validates (15-step test passes)',
      blocked_by_sd_key: 'SD-EVA-ORCH-PHASE-A-001'
    }
  });
  idMap[phaseB.sd_key] = phaseB.id;
  allSDs.push(phaseB);

  // Phase B Children
  const childB7 = buildSD({
    sd_key: 'SD-EVA-FEAT-SCHEDULER-001',
    title: 'EVA Master Scheduler: Priority Queue + Cadence Management',
    description: 'Portfolio-level scheduling that replaces manual "eva run". Ventures auto-advance when unblocked. Priority queue processing based on venture urgency, stage readiness, and portfolio balance.',
    sd_type: 'feature',
    priority: 'high',
    parent_sd_id: phaseB.id,
    eva_phase: 'B'
  });
  idMap[childB7.sd_key] = childB7.id;
  allSDs.push(childB7);

  const childB8 = buildSD({
    sd_key: 'SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001',
    title: 'Chairman Dashboard: Decision Queue + Health Heatmap + Event Feed',
    description: 'Visual dashboard for Chairman governance. Decision queue shows pending decisions with venture context. Health heatmap shows portfolio status across all ventures/stages. Event feed shows recent activity. Phase A Step 8 wireframes become the design input.',
    sd_type: 'feature',
    priority: 'high',
    parent_sd_id: phaseB.id,
    eva_phase: 'B'
  });
  idMap[childB8.sd_key] = childB8.id;
  allSDs.push(childB8);

  const childB9 = buildSD({
    sd_key: 'SD-EVA-FEAT-NOTIFICATION-001',
    title: 'Chairman Notification Service: Immediate + Daily Digest + Weekly Push',
    description: 'Notification batching and delivery for Chairman. Immediate notifications for blocking decisions. Daily digest for non-urgent updates. Weekly summary push for portfolio overview.',
    sd_type: 'feature',
    priority: 'high',
    parent_sd_id: phaseB.id,
    eva_phase: 'B',
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001'] }
  });
  idMap[childB9.sd_key] = childB9.id;
  allSDs.push(childB9);

  const childB10 = buildSD({
    sd_key: 'SD-EVA-FEAT-DFE-PRESENTATION-001',
    title: 'DFE Escalation Presentation: Context + Mitigations in Dashboard',
    description: 'Render Decision Filter Engine escalation context and suggested mitigations in the Chairman Dashboard. Shows why a decision was escalated, what the DFE evaluated, and recommended actions.',
    sd_type: 'feature',
    priority: 'high',
    parent_sd_id: phaseB.id,
    eva_phase: 'B',
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001'] }
  });
  idMap[childB10.sd_key] = childB10.id;
  allSDs.push(childB10);

  // ========================================================================
  // PHASE C: Platform Capabilities + Marketing Engine (P2)
  // ========================================================================

  const phaseC = buildSD({
    sd_key: 'SD-EVA-ORCH-PHASE-C-001',
    title: 'EVA Phase C: Platform Capabilities + Marketing Engine',
    description: 'EVA becomes an always-on, reactive+scheduled platform with intelligent agent management, semantic cross-venture learning, and automated marketing distribution. Conditional on Phase B validation (3-venture auto-scheduling test passes).',
    scope: 'Event-driven monitor, dashboard wiring, tool policy profiles, skill packaging, semantic search, marketing data foundation + publisher, marketing AI feedback loop + assets.',
    sd_type: 'orchestrator',
    priority: 'medium',
    eva_phase: 'C',
    success_criteria: [
      'Supabase Realtime detects Chairman decision → venture auto-advances',
      'Cron runs nightly portfolio sweep',
      'Sub-agent spawned with readonly profile cannot write files',
      'Skill injected only when task context matches skill requirements',
      'Semantic search returns related issue patterns across ventures',
      'Marketing publisher posts to X via direct API',
      'Thompson Sampling selects content variants',
      'Metrics ingested hourly, daily rollup triggers variant promotion'
    ],
    metadata: {
      conditional_note: 'Phase C activates after Phase B validates (3-venture auto-scheduling test passes)',
      blocked_by_sd_key: 'SD-EVA-ORCH-PHASE-B-001'
    }
  });
  idMap[phaseC.sd_key] = phaseC.id;
  allSDs.push(phaseC);

  const childC11 = buildSD({
    sd_key: 'SD-EVA-FEAT-EVENT-MONITOR-001',
    title: 'Event-Driven Venture Monitor: Realtime + Cron Scheduler',
    description: 'Supabase Realtime listener for chairman_decisions, venture_artifacts, orchestration_metrics changes → immediate venture advancement. Cron scheduler for planned batch runs: ops cycles, portfolio health sweeps, release scheduling. Implements hybrid runtime model (Vision Section 3).',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C'
  });
  idMap[childC11.sd_key] = childC11.id;
  allSDs.push(childC11);

  const childC12 = buildSD({
    sd_key: 'SD-EVA-FEAT-DASHBOARD-WIRING-001',
    title: 'Chairman Dashboard Wiring: EHG App → CLI Governance Plane',
    description: 'Wire existing DecisionsInbox approve/reject to chairman_decisions table. Wire EscalationPanel to DFE escalation events. Add stale-context detection (reject decisions on changed venture state). Remove 25-stage GUI components (CLI handles all stage progression).',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C'
  });
  idMap[childC12.sd_key] = childC12.id;
  allSDs.push(childC12);

  const childC13 = buildSD({
    sd_key: 'SD-EVA-FEAT-TOOL-POLICIES-001',
    title: 'Per-Agent Tool Policy Profiles: Full/Coding/Readonly/Minimal',
    description: 'Define full/coding/readonly/minimal profiles in agent_sub_agents table. Agent compiler enforces profile at .md generation time. Runtime validation: sub-agent tool calls checked against profile.',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C'
  });
  idMap[childC13.sd_key] = childC13.id;
  allSDs.push(childC13);

  const childC14 = buildSD({
    sd_key: 'SD-EVA-FEAT-SKILL-PACKAGING-001',
    title: 'Skill Packaging System: SKILL.md Format + Context-Based Injection',
    description: 'Evolve current .partial.md files to versioned SKILL.md bundles. Each skill declares requirements (tools, context, memory access). Agent compiler selectively injects skills per turn based on task context. Skills are versioned and can be shared across agents.',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C',
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-TOOL-POLICIES-001'] }
  });
  idMap[childC14.sd_key] = childC14.id;
  allSDs.push(childC14);

  const childC15 = buildSD({
    sd_key: 'SD-EVA-FEAT-SEMANTIC-SEARCH-001',
    title: 'Hybrid Semantic Search: SQLite Vector Index + BM25 Fallback',
    description: 'SQLite vector index over issue_patterns + venture_artifacts. Local Ollama embeddings (reuse existing LLM factory infrastructure). BM25 keyword matching as fallback/complement. Enhances cross-venture-learning.js with similarity-based retrieval.',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C'
  });
  idMap[childC15.sd_key] = childC15.id;
  allSDs.push(childC15);

  const childC16 = buildSD({
    sd_key: 'SD-EVA-FEAT-MARKETING-FOUNDATION-001',
    title: 'Marketing Engine: Data Foundation + Publisher',
    description: 'Database schema (marketing_events, marketing_content, marketing_content_variants, marketing_experiments, marketing_daily_rollups, bandit_state, bandit_arms). Content generator service (LLM + venture context → variants). Publisher abstraction layer (direct API + Late aggregator). Platform integrations: X API ($200/mo), YouTube Data API v3, Late ($33-49/mo), Bluesky/Mastodon/Threads (free). Rate limiting via BullMQ. UTM attribution + PostHog Cloud analytics.',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C'
  });
  idMap[childC16.sd_key] = childC16.id;
  allSDs.push(childC16);

  const childC17 = buildSD({
    sd_key: 'SD-EVA-FEAT-MARKETING-AI-001',
    title: 'Marketing Engine: AI Feedback Loop + Assets',
    description: 'Thompson Sampling optimizer (Beta distributions, composite reward). Three cadences: hourly (channel allocation), daily (variant promotion via Champion-Challenger), weekly (cross-venture intelligence transfer). Nano Banana Pro image generation (Gemini API) + Sharp.js brand overlays. I2V video: Kling 3.0 primary, Veo 3.1 secondary, Runway Gen-4 Turbo fallback. Resend email integration + custom SQL drip campaigns. Metrics ingestor (platform API polling + webhook receiver).',
    sd_type: 'feature',
    priority: 'medium',
    parent_sd_id: phaseC.id,
    eva_phase: 'C',
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-MARKETING-FOUNDATION-001'] }
  });
  idMap[childC17.sd_key] = childC17.id;
  allSDs.push(childC17);

  // ========================================================================
  // PHASE D: Portfolio Intelligence (P3)
  // ========================================================================

  const phaseD = buildSD({
    sd_key: 'SD-EVA-ORCH-PHASE-D-001',
    title: 'EVA Phase D: Portfolio Intelligence',
    description: 'Multi-venture intelligence: template extraction from successful ventures, inter-venture dependency management. Conditional on Phase C validation (platform capabilities + marketing engine operational).',
    scope: 'Venture template system, inter-venture dependency manager.',
    sd_type: 'orchestrator',
    priority: 'low',
    eva_phase: 'D',
    success_criteria: [
      'Successful venture generates a template',
      'New venture uses template to bootstrap stages',
      'Dependency between ventures correctly blocks/unblocks progression'
    ],
    metadata: {
      conditional_note: 'Phase D activates after Phase C validates (platform capabilities + marketing engine operational)',
      blocked_by_sd_key: 'SD-EVA-ORCH-PHASE-C-001'
    }
  });
  idMap[phaseD.sd_key] = phaseD.id;
  allSDs.push(phaseD);

  const childD18 = buildSD({
    sd_key: 'SD-EVA-FEAT-VENTURE-TEMPLATES-001',
    title: 'Venture Template System: Extract + Apply Patterns from Successful Ventures',
    description: 'Extract patterns from successful ventures (cross-venture-learning.js provides analysis). Generate templates from success patterns. Apply templates to bootstrap new ventures with proven stage configurations.',
    sd_type: 'feature',
    priority: 'low',
    parent_sd_id: phaseD.id,
    eva_phase: 'D'
  });
  idMap[childD18.sd_key] = childD18.id;
  allSDs.push(childD18);

  const childD19 = buildSD({
    sd_key: 'SD-EVA-FEAT-DEPENDENCY-MANAGER-001',
    title: 'Inter-Venture Dependency Manager: Graph + Auto-Blocking',
    description: 'Dependency graph with auto-blocking. venture_dependencies schema already defined; manager code needed. When venture A depends on venture B output, venture A blocks until B reaches the required stage.',
    sd_type: 'feature',
    priority: 'low',
    parent_sd_id: phaseD.id,
    eva_phase: 'D'
  });
  idMap[childD19.sd_key] = childD19.id;
  allSDs.push(childD19);

  // ========================================================================
  // PHASE E: Optimization (P4)
  // ========================================================================

  const phaseE = buildSD({
    sd_key: 'SD-EVA-ORCH-PHASE-E-001',
    title: 'EVA Phase E: Optimization',
    description: 'Optimization layer: shared services abstraction, expand-vs-spinoff evaluator, advanced portfolio optimization. Not critical for MVP. Conditional on Phase D validation (portfolio intelligence operational).',
    scope: 'Shared services abstraction, expand-vs-spinoff evaluator, advanced portfolio optimization.',
    sd_type: 'orchestrator',
    priority: 'low',
    eva_phase: 'E',
    success_criteria: [
      'Two ventures contend for same resource → optimizer re-ranks',
      'Stage 25 venture evaluated for expand vs spinoff',
      'Shared services interface (load context, execute, emit) used by all services'
    ],
    metadata: {
      conditional_note: 'Phase E activates after Phase D validates (portfolio intelligence operational). Optimization layer — not critical for MVP.',
      blocked_by_sd_key: 'SD-EVA-ORCH-PHASE-D-001'
    }
  });
  idMap[phaseE.sd_key] = phaseE.id;
  allSDs.push(phaseE);

  const childE20 = buildSD({
    sd_key: 'SD-EVA-FEAT-SHARED-SERVICES-001',
    title: 'Shared Services Abstraction: Common Service Interface',
    description: 'Common service interface (load context, execute, emit). DRY pattern across all EVA services. Each service uses the same lifecycle: load venture context → execute service logic → emit results/events.',
    sd_type: 'feature',
    priority: 'low',
    parent_sd_id: phaseE.id,
    eva_phase: 'E'
  });
  idMap[childE20.sd_key] = childE20.id;
  allSDs.push(childE20);

  const childE21 = buildSD({
    sd_key: 'SD-EVA-FEAT-EXPAND-SPINOFF-001',
    title: 'Expand-vs-Spinoff Evaluator: DFE-Based Scope Assessment at Stage 25',
    description: 'DFE-based scope assessment at Stage 25. Determines if venture should expand within existing entity or spin off into a new entity. Uses financial, market, and operational criteria.',
    sd_type: 'feature',
    priority: 'low',
    parent_sd_id: phaseE.id,
    eva_phase: 'E'
  });
  idMap[childE21.sd_key] = childE21.id;
  allSDs.push(childE21);

  const childE22 = buildSD({
    sd_key: 'SD-EVA-FEAT-PORTFOLIO-OPT-001',
    title: 'Advanced Portfolio Optimization: Resource Contention + Priority Re-Ranking',
    description: 'Resource contention resolution and priority re-ranking across active ventures. When multiple ventures compete for the same resources (compute, API quotas, attention), the optimizer allocates based on urgency, ROI potential, and portfolio balance.',
    sd_type: 'feature',
    priority: 'low',
    parent_sd_id: phaseE.id,
    eva_phase: 'E',
    metadata: { depends_on_sd_keys: ['SD-EVA-FEAT-SHARED-SERVICES-001'] }
  });
  idMap[childE22.sd_key] = childE22.id;
  allSDs.push(childE22);

  // ========================================================================
  // INSERT ALL SDs
  // ========================================================================

  console.log(`\nPrepared ${allSDs.length} SDs for insertion.\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const sd of allSDs) {
    if (existingKeys.has(sd.sd_key)) {
      console.log(`  SKIP  ${sd.sd_key} (already exists)`);
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('strategic_directives_v2')
      .insert(sd);

    if (error) {
      console.log(`  FAIL  ${sd.sd_key}: ${error.message}`);
      failed++;
    } else {
      console.log(`  OK    ${sd.sd_key} — ${sd.title}`);
      created++;
    }
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n⚠️  Some SDs failed to create. Check errors above.');
    process.exit(1);
  }

  console.log('\n  Phase A: 13 SDs (1 orchestrator + 1 nested orchestrator + 11 leaves)');
  console.log('  Phase B:  5 SDs (1 orchestrator + 4 leaves)');
  console.log('  Phase C:  8 SDs (1 orchestrator + 7 leaves)');
  console.log('  Phase D:  3 SDs (1 orchestrator + 2 leaves)');
  console.log('  Phase E:  4 SDs (1 orchestrator + 3 leaves)');
  console.log('  Total:   33 SDs\n');

  console.log('📋 Next: Run "npm run sd:next" to verify Phase A is at top of queue.\n');
}

// Cross-platform entry point
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
