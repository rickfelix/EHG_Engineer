#!/usr/bin/env node
/**
 * Insert SD-RECURSION-ENGINE-001 into strategic_directives_v2
 *
 * Strategic Directive: Dual-Network Recursion Engine
 * Priority: CRITICAL (P0)
 *
 * Purpose: Implement unified recursion engine to support intelligent
 * dependency-driven recursion across 40-stage venture creation workflow.
 * Enables financial validation (Stage 5 hub) and technical validation
 * (Stage 10 hub) networks with Chairman governance.
 *
 * Run: node scripts/insert-sd-recursion-engine-001.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sdData = {
  // PRIMARY KEY and UNIQUE identifier
  id: 'SD-RECURSION-ENGINE-001',
  sd_key: 'SD-RECURSION-ENGINE-001',

  // Required fields
  title: 'Dual-Network Recursion Engine',
  category: 'infrastructure',
  priority: 'critical', // P0 - as requested by Chairman
  status: 'draft',
  version: '1.0',
  sd_type: 'feature',
  target_application: 'EHG',
  current_phase: 'LEAD_APPROVAL',
  created_by: 'human:Chairman',

  // Core content (extracted from outline)
  description: `Implement a unified recursion engine to support intelligent dependency-driven recursion across the 40-stage venture creation workflow. Discovery from Phases 4-7 (Stage Operating Dossiers) revealed dual-network architecture separating financial validation loops (Stage 5 hub) from technical validation loops (Stage 10 hub), with third hub for exit validation (Stage 13), converging at Stage 3 (Comprehensive Validation = ultimate kill/proceed gate).

**Key Innovation:** Dual-network architecture with 8 trigger types (FIN-001, TECH-001, EXIT-001, MKT-001, LEGAL-001, DEV-001, PRICE-001, AI-001), 4 severity levels (CRITICAL/HIGH/MEDIUM/LOW), comprehensive Chairman governance workflows, and loop prevention mechanisms.

**Discovery Context:**
During Stage Operating Dossier generation (Phases 4-7, Stages 5-16), discovered recursion patterns across 16 stages with 3 major validation hubs:
- Financial Hub (Stage 5): 7 total connections (3 outbound + 4 inbound)
- Technical Hub (Stage 10): 5 connections (validates feasibility, blocks critical path)
- Exit Hub (Stage 13): First late-stage → early-stage recursion (EXIT-001 → Stage 5)

**Estimated Effort:** 120-160 hours (24-32 weeks across 5 implementation phases)`,

  rationale: `BUSINESS RATIONALE:
- Ventures currently progress linearly (1→2→3...→40) without quality gates
- Financial/technical issues discovered late (Stages 20-30) waste 10+ stages of effort
- No automation for Chairman intervention when quality thresholds breached
- Lost context when manually restarting ventures (no state preservation)
- 40% milestone achieved (16/40 stages mapped) authorizes full implementation

TECHNICAL RATIONALE:
- Discovery validated across 16 stages (40% of workflow) with 100/100 quality scores
- 8 trigger types discovered with clear patterns and thresholds
- Stage 5 confirmed as central financial validation hub (7 connections)
- Stage 10 confirmed as technical feasibility gate (5 connections)
- Stage 3 convergence point for both networks (ultimate kill/proceed gate)
- Chairman governance workflows required for HIGH severity triggers
- Loop prevention critical (max 3 recursions, 24h cooldown, acyclic graph)

ARCHITECTURAL IMPACT:
- Affects both EHG app (venture execution) and EHG_Engineer (governance)
- Requires new database tables (recursion_events, recursion_snapshots)
- Integrates with stages.yaml (trigger configuration)
- Enables UI components (recursion history, warning indicators, comparison tools)
- Foundation for future predictive recursion (AI-powered risk prediction)

PROBLEM STATEMENT:
Current state: All 40 stages progress linearly without validation
Issues identified:
1. ROI < 15% at Stage 5 → Venture continues despite financial infeasibility
2. Solution technically infeasible at Stage 10 → 10 stages of work wasted
3. No re-validation workflows → Must manually recreate from scratch
4. No Chairman controls → Cannot override thresholds strategically
5. No audit trail → Cannot analyze patterns or improve thresholds`,

  scope: `INCLUDED IN SCOPE:

PHASE 1: Foundation (4-6 weeks)
- Database schema (recursion_events, recursion_snapshots tables)
- Core engine functions (triggerRecursion, checkRecursionTriggers)
- Trigger configuration parser (read stages.yaml recursion definitions)
- Loop prevention logic (max 3 recursions, 24h cooldown, acyclic graph)
- Unit tests for trigger evaluation
- Integration tests for recursion flow

PHASE 2: Financial Network (6-8 weeks)
- FIN-001 trigger implementation (Stage 5 → Stages 3, 4, 2)
- Chairman approval UI for HIGH severity triggers
- Post-execution notification for CRITICAL severity (auto-execute)
- Snapshot creation/restoration (preserve state before recursion)
- E2E test: ROI < 15% triggers recursion to Stage 3
- Chairman approval workflow test

PHASE 3: Technical Network (6-8 weeks)
- TECH-001 trigger implementation (Stage 10 → Stages 8, 7, 5, 3)
- WBS versioning logic (Stage 8 specific substage tracking)
- Technical feasibility scoring (<0.5 = CRITICAL, blocking issues ≥1 = HIGH)
- E2E test: Feasibility < 0.5 triggers CRITICAL recursion
- Blocking issues detection and approval workflow

PHASE 4: Supporting Triggers (4-6 weeks)
- EXIT-001 (Stage 13 → 5): Valuation insufficient
- DEV-001 (Stage 14 → 8/10): Development prep reveals issues
- PRICE-001 (Stage 15 → 5): Pricing misaligned with profitability
- AI-001 (Stage 16 → 16 substages): Model drift detection
- MKT-001, LEGAL-001, QUALITY-001 (various stages)
- E2E test for each trigger type
- Cross-network interaction tests

PHASE 5: Chairman Governance (4-6 weeks)
- Recursion dashboard (history timeline, event cards, analytics)
- Threshold override UI (adjust ROI from 15% → 10% for strategic bets)
- Escalation workflows (max recursions reached → Chairman decision)
- Audit trail reports (all recursion events logged with full context)
- Recursion warning indicator (real-time as user enters data)
- Snapshot comparison tool (side-by-side diff view)

TRIGGER TYPES (8 discovered across 16 stages):
1. FIN-001: Financial viability (Stage 5 hub)
2. TECH-001: Technical feasibility (Stage 10 hub)
3. EXIT-001: Exit readiness (Stage 13 → 5)
4. MKT-001: Market validation (Stages 3, 11, 12)
5. LEGAL-001: Legal compliance (Stage 11 substage)
6. DEV-001: Development readiness (Stage 14 → 8/10)
7. PRICE-001: Pricing validation (Stage 15 → 5)
8. AI-001: AI model drift (Stage 16 internal loops)

EXCLUDED FROM SCOPE:
- Predictive recursion (AI risk prediction, requires 50+ ventures)
- Multi-path recursion (trigger to multiple stages simultaneously)
- Conditional recursion chains (Trigger B only if Trigger A fired)
- Recursion analytics dashboard (aggregate cross-venture insights)
- Visual workflow builder integration (crewai_flows, future work)
- Automated threshold tuning (requires 3-month calibration period)

SYSTEMS AFFECTED:
- ventures table (current_workflow_stage updates)
- stages.yaml (recursion trigger configuration)
- Chairman dashboard (approval workflows, notifications)
- Venture detail pages (recursion history, warning indicators)
- Stage completion screens (real-time recursion risk indicators)`,

  success_criteria: `FUNCTIONAL REQUIREMENTS:
FR-1: FIN-001 triggers when ROI < 15% (auto-execute to Stage 3)
FR-2: TECH-001 triggers when blocking issues ≥1 (requires Chairman approval)
FR-3: Max 3 recursions per trigger type (4th escalates to Chairman)
FR-4: Snapshots created before every recursion (data preservation)
FR-5: Chairman can override thresholds (e.g., ROI 10% for strategic ventures)
FR-6: Acyclic graph enforced (no forward recursion, from_stage > to_stage)
FR-7: EXIT-001 validates late-stage → early-stage recursion (Stage 13 → 5)
FR-8: All 8 trigger types operational with correct severity levels

NON-FUNCTIONAL REQUIREMENTS:
NFR-1: Recursion detection <100ms (performance)
NFR-2: Chairman notification within 5 seconds (latency)
NFR-3: 99.9% uptime for recursion engine (reliability)
NFR-4: All recursion events logged with full audit trail (compliance)
NFR-5: UI indicators update in real-time as user enters data (UX)

BUSINESS OUTCOMES:
BO-1: 80% reduction in wasted effort (detect issues early vs. late)
BO-2: 50% reduction in venture failure rate (quality gates work)
BO-3: 90% Chairman approval rate for HIGH severity (thresholds calibrated)
BO-4: <5% ventures archived due to max recursions (loop prevention works)

QUALITY GATES:
- All 8 trigger types tested with E2E scenarios
- Chairman approval workflow tested for HIGH severity triggers
- Loop prevention tested (max 3 recursions enforced)
- Snapshot restore verified (data preservation works)
- Performance validated (<100ms detection, <5s notification)
- Security review completed (RLS policies for recursion tables)

ACCEPTANCE CRITERIA:
- Database: recursion_events, recursion_snapshots tables created with indexes
- Code: triggerRecursion and checkRecursionTriggers functions operational
- Configuration: stages.yaml enhanced with recursion trigger definitions
- UI: Chairman approval modal, recursion history panel, warning indicators
- Testing: All functional requirements pass E2E tests
- Documentation: Architecture decision doc, API reference, Chairman workflows`,

  dependencies: JSON.stringify([
    {
      type: 'prerequisite',
      sd_id: 'SD-STAGE-DOSSIER-001',
      reason: 'Stage Operating Dossiers discovered recursion patterns (40% complete)',
      status: 'in_progress'
    },
    {
      type: 'parallel',
      sd_id: 'SD-CREWAI-ARCHITECTURE-001',
      reason: 'CrewAI agent registry informs recursion trigger logic',
      status: 'in_progress'
    },
    {
      type: 'sequential',
      sd_id: 'SD-METRICS-FRAMEWORK-001',
      reason: 'Recursion triggers depend on metric values (ROI, feasibility, etc.)',
      status: 'deferred'
    }
  ]),

  risks: JSON.stringify([
    {
      risk: 'Race conditions with concurrent recursion triggers',
      severity: 'high',
      mitigation: 'Transaction locks on ventures table, sequential processing queue'
    },
    {
      risk: 'Infinite loops despite safeguards',
      severity: 'high',
      mitigation: 'Hard cap at 5 total recursions → auto-archive venture'
    },
    {
      risk: 'Performance degradation with 100+ concurrent ventures',
      severity: 'medium',
      mitigation: 'Async recursion queue, rate limiting, Redis caching'
    },
    {
      risk: 'Chairman bottleneck (all HIGH severity requires approval)',
      severity: 'medium',
      mitigation: 'Delegate approval authority, raise CRITICAL threshold to ROI 10%'
    },
    {
      risk: 'False positives (recursion triggered unnecessarily)',
      severity: 'medium',
      mitigation: 'Tunable thresholds, 3-month calibration period with analytics'
    },
    {
      risk: 'User frustration (recursion perceived as failure)',
      severity: 'low',
      mitigation: 'UX messaging emphasizes iterative improvement, snapshot preservation'
    }
  ]),

  success_metrics: JSON.stringify([
    {
      metric: 'Wasted Effort Reduction',
      target: '80%',
      measurement: 'Stages wasted before kill (before vs. after recursion)'
    },
    {
      metric: 'Venture Failure Rate',
      target: '50% reduction',
      measurement: 'Ventures that reach Stage 40 but fail vs. quality-gated ventures'
    },
    {
      metric: 'Chairman Approval Rate',
      target: '90%',
      measurement: 'HIGH severity triggers approved without modification'
    },
    {
      metric: 'Loop Prevention Effectiveness',
      target: '<5%',
      measurement: 'Ventures archived due to max recursions reached'
    },
    {
      metric: 'Recursion Detection Performance',
      target: '<100ms',
      measurement: 'Time from stage completion to recursion trigger evaluation'
    },
    {
      metric: 'Chairman Notification Latency',
      target: '<5 seconds',
      measurement: 'Time from trigger to Chairman dashboard alert'
    }
  ]),

  metadata: JSON.stringify({
    discovery_date: '2025-11-05',
    discovery_phases: 'Phase 4-7 (Stage Operating Dossiers)',
    stages_analyzed: 16,
    completion_percentage: '40%',
    quality_scores: '9 consecutive perfect scores (100/100)',
    trigger_types_discovered: 8,
    validation_hubs_identified: 3,
    outline_location: 'docs/strategic-directives/SD-RECURSION-ENGINE-001_OUTLINE.md',
    outline_size: '586 lines (45 pages)',
    recursion_networks: {
      financial: 'Stage 5 hub, 7 connections (3 outbound + 4 inbound)',
      technical: 'Stage 10 hub, 5 connections (validates feasibility)',
      exit: 'Stage 13 hub, first late-stage → early-stage recursion'
    },
    convergence_point: 'Stage 3 (Comprehensive Validation)',
    implementation_phases: 5,
    estimated_weeks: '24-32 weeks',
    chairman_governance_features: [
      'Approval workflows (HIGH severity)',
      'Post-execution notifications (CRITICAL auto-execute)',
      'Threshold override UI',
      'Escalation workflows (max recursions)',
      'Audit trail reports'
    ],
    ui_components: [
      'Recursion history panel',
      'Warning indicators (real-time)',
      'Snapshot comparison tool',
      'Chairman approval modal'
    ],
    loop_prevention_rules: [
      'Max 3 recursions per trigger type',
      '24-hour cooldown between same-type triggers',
      'Acyclic graph enforcement (no forward recursion)',
      'Auto-archive after 5 total recursions'
    ],
    deferred_features: [
      'Predictive recursion (AI risk prediction)',
      'Multi-path recursion',
      'Conditional recursion chains',
      'Recursion analytics dashboard'
    ]
  })
};

async function insertSD() {
  console.log('📋 Inserting SD-RECURSION-ENGINE-001 into EHG_Engineer database...\n');
  console.log(`🔗 Database: ${supabaseUrl}`);
  console.log('📊 Table: strategic_directives_v2\n');

  try {
    // First check if it already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-RECURSION-ENGINE-001')
      .maybeSingle();

    if (existing) {
      console.log('⚠️  SD-RECURSION-ENGINE-001 already exists in database!');
      console.log('   Skipping insertion to avoid duplicate.');
      process.exit(0);
    }

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }

    console.log('✅ SD-RECURSION-ENGINE-001 inserted successfully!\n');
    console.log('📊 Record Details:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Priority: ${data.priority} (P0 - CRITICAL) ⚠️`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Category: ${data.category}`);
    console.log(`   Target Application: ${data.target_application}`);
    console.log(`   Current Phase: ${data.current_phase}`);
    console.log(`   Created By: ${data.created_by}`);

    console.log('\n🎯 Discovery Context:');
    console.log('   - 16 stages analyzed (40% of 40-stage workflow)');
    console.log('   - 8 trigger types discovered');
    console.log('   - 3 validation hubs identified (Stages 5, 10, 13)');
    console.log('   - 9 consecutive perfect scores (100/100)');

    console.log('\n📝 Next Steps:');
    console.log('1. ✅ SD created in database (LEAD phase initiated)');
    console.log('2. ⏭️  PLAN Phase: Create PRD entry linked to this SD');
    console.log('   Command: node scripts/add-prd-to-database.js SD-RECURSION-ENGINE-001 "Dual-Network Recursion Engine PRD"');
    console.log('3. ⏭️  PLAN Phase: Populate PRD with user stories, acceptance criteria');
    console.log('4. ⏭️  EXEC Phase: Implement Phase 1 (Foundation - 4-6 weeks)');

    console.log('\n📋 Governance Handoff:');
    console.log('   Log in: docs/workflow/dossiers/DELTA_LOG_PHASE7.md (or next phase)');
    console.log('   Entry: "SD-RECURSION-ENGINE-001 created in DB; awaiting PLAN-agent PRD generation"');

    console.log('\n🔗 View in Dashboard:');
    console.log('   http://localhost:3000/dashboard (Strategic Directives section)');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

insertSD();
