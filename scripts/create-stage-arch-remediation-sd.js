#!/usr/bin/env node

/**
 * Create Stage Architecture Remediation Strategic Directive
 *
 * This SD addresses the "Schrödinger's Stage" crisis identified in the
 * Triangulation Assessment. It is a PREREQUISITE for the Genesis Oath v3.1
 * implementation.
 *
 * Inserts 1 Parent SD + 5 Phase SDs:
 * - SD-STAGE-ARCH-001 (Parent - Orchestrator)
 * - SD-STAGE-ARCH-001-P0 (Audit & Clean Database)
 * - SD-STAGE-ARCH-001-P1 (SSOT Foundation + Delete Legacy)
 * - SD-STAGE-ARCH-001-P2 (Create V2 Stage Shells + Router)
 * - SD-STAGE-ARCH-001-P3 (Implement Safe Stages)
 * - SD-STAGE-ARCH-001-P4 (Rebuild Crisis Zone)
 * - SD-STAGE-ARCH-001-P5 (Governance & Polish)
 *
 * Per LEO Protocol v4.3.3
 * Source: docs/reports/STAGE_ARCHITECTURE_REMEDIATION_PLAN.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// SD DEFINITIONS - Stage Architecture Remediation
// ============================================================================

const REMEDIATION_SDS = {
  // -------------------------------------------------------------------------
  // PARENT SD (Orchestrator)
  // -------------------------------------------------------------------------
  parent: {
    id: 'SD-STAGE-ARCH-001',
    sd_key: 'stage-arch-remediation-001',
    legacy_id: 'SD-STAGE-ARCH-001',
    title: 'Stage Architecture Remediation - Vision V2 Alignment',

    description: 'Resolve the "Schrödinger\'s Stage" crisis where 12 stages exist as TWO completely different files with different purposes. This is the root cause of the "25 vs 40" stage count confusion and represents a fractured foundation that must be resolved before any feature work or Genesis Oath implementation. The remediation will align the codebase to Vision V2\'s 25-stage workflow as defined in GENESIS_RITUAL_SPECIFICATION.md, creating a Single Source of Truth (SSOT) and deleting all legacy/duplicate stage components.',

    scope: 'Clean slate implementation: Delete all test ventures, create SSOT for 25 stages, delete 23 legacy/duplicate stage files, rebuild 14 stages to match Vision V2 naming and gates, implement CI governance to prevent regression. Affects: /src/components/stages/, /src/config/, /src/types/, database triggers.',

    rationale: 'The triangulation assessment (OpenAI, Antigravity, Claude Code) unanimously agreed on Option A: Align Codebase to Vision V2. With no production ventures (only test data), we can execute a clean slate approach - deleting legacy code rather than maintaining dual-support. This is a PREREQUISITE for Genesis Oath v3.1 - the Simulation Chamber cannot generate ventures into a broken 25-stage workflow.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'parent',
    parent_sd_id: null,
    sequence_rank: 0, // Highest priority - blocks Genesis
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Eliminate "Schrödinger\'s Stage" crisis - one file per stage, matching Vision V2',
      'Create Single Source of Truth (SSOT) in /src/config/venture-workflow.ts',
      'Delete all 23 legacy/duplicate stage files',
      'Implement correct gate logic: kill gates at 3, 5, 13, 23; promotion gates at 16, 17, 22',
      'Add CI governance to prevent future stage count drift',
      'Unblock Genesis Oath v3.1 implementation'
    ],

    success_criteria: [
      'All 25 stages load and function correctly with Vision V2 names',
      'SSOT drives all stage displays and routing',
      'Zero hardcoded stage counts in codebase (no "40", "15", or magic numbers)',
      'All kill gates (3, 5, 13, 23) enforce correctly',
      'All promotion gates (16, 17, 22) enforce correctly',
      'All legacy/duplicate stage files deleted',
      'CI governance prevents regression (npm run audit:stages)',
      'E2E test passes for full venture lifecycle 1-25'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V2.0.0',
        primary_spec: 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md',
        supporting_specs: [
          'docs/reports/TRIANGULATION_ASSESSMENT_2025-12-29.md',
          'docs/reports/STAGE_ARCHITECTURE_REMEDIATION_PLAN.md'
        ]
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_RITUAL_SPECIFICATION.md',
        'docs/reports/STAGE_ARCHITECTURE_REMEDIATION_PLAN.md'
      ],
      must_read_before_exec: [
        'docs/reports/STAGE_ARCHITECTURE_REMEDIATION_PLAN.md'
      ],
      implementation_guidance: {
        creation_mode: 'CLEAN_SLATE',
        approach: 'Delete legacy, implement V2 from scratch',
        no_dual_support: true,
        blocks: ['SD-GENESIS-V31-PARENT', 'SD-GENESIS-V31-MASON']
      },
      capacity: {
        phases: 6,
        estimated_days: 26,
        children: [
          'SD-STAGE-ARCH-001-P0',
          'SD-STAGE-ARCH-001-P1',
          'SD-STAGE-ARCH-001-P2',
          'SD-STAGE-ARCH-001-P3',
          'SD-STAGE-ARCH-001-P4',
          'SD-STAGE-ARCH-001-P5'
        ]
      },
      triangulation: {
        date: '2025-12-29',
        models: ['OpenAI GPT-5.2', 'Antigravity', 'Claude Code Opus 4.5'],
        unanimous_decision: 'Option A - Align Codebase to Vision V2',
        confidence: 'HIGH'
      }
    },

    dependencies: [],

    risks: [
      {
        risk: 'Hidden database trigger coupling to stage IDs',
        impact: 'HIGH',
        mitigation: 'Phase 0 includes comprehensive trigger audit'
      },
      {
        risk: 'Timeline slip on stages 11-23 rebuild',
        impact: 'MEDIUM',
        mitigation: 'Parallelize work; add engineer if behind'
      },
      {
        risk: 'Genesis Ritual deadline risk (Feb 14)',
        impact: 'CRITICAL',
        mitigation: 'Complete Phase 4 by Jan 31; 2-week buffer'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // PHASE SDs (Children of Parent)
  // -------------------------------------------------------------------------

  phase0: {
    id: 'SD-STAGE-ARCH-001-P0',
    sd_key: 'stage-arch-remediation-001-p0',
    legacy_id: 'SD-STAGE-ARCH-001-P0',
    title: 'Phase 0: Audit & Clean Database',

    description: 'Understand current state and clear test data. Delete all test ventures from database, audit database triggers for hardcoded stage IDs, audit backend API for stage-specific logic, generate stage mapping report, and apply salvage rubric to existing stages.',

    scope: 'Database cleanup: TRUNCATE ventures and venture_stage_data tables. Audit: Supabase edge functions, database triggers, server code for stage constants.',

    rationale: 'Cannot proceed without understanding the full scope of stage references. Clearing test data enables the clean slate approach with no migration complexity.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Delete all test ventures from database',
      'Audit database triggers for hardcoded stage IDs',
      'Audit backend API for stage-specific logic',
      'Generate stage→file→route mapping report',
      'Apply salvage rubric to stages 1-10, 24-25'
    ],

    success_criteria: [
      'ventures table empty (TRUNCATED)',
      'venture_stage_data table empty (TRUNCATED)',
      'All database triggers documented with stage references',
      'All backend API stage logic documented',
      'Salvage decisions made for all 25 stages'
    ],

    metadata: {
      timeline: { start_day: 1, end_day: 2, duration_days: 2 }
    },

    dependencies: []
  },

  phase1: {
    id: 'SD-STAGE-ARCH-001-P1',
    sd_key: 'stage-arch-remediation-001-p1',
    legacy_id: 'SD-STAGE-ARCH-001-P1',
    title: 'Phase 1: SSOT Foundation + Delete Legacy',

    description: 'Create Single Source of Truth and remove all legacy code. Create /src/config/venture-workflow.ts with full stage registry, create vision-v2-stages.json for CI verification, delete workflowStages.ts, create new workflow.types.ts derived from SSOT, eliminate all "40" and "15" references, and delete all 23 duplicate/legacy stage files.',

    scope: 'New files: venture-workflow.ts, vision-v2-stages.json, workflow.types.ts. Delete: workflowStages.ts, 23 legacy stage files. Refactor: all totalStages references.',

    rationale: 'SSOT must exist before new stages can be wired. Deleting legacy files ensures no accidental imports of wrong stage versions.',

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Create /src/config/venture-workflow.ts with SSOT',
      'Create /src/config/vision-v2-stages.json (machine-readable canonical)',
      'Delete /src/types/workflowStages.ts',
      'Create new /src/types/workflow.types.ts derived from SSOT',
      'Refactor all totalStages references to use SSOT constant',
      'Eliminate all "40" AND "15" references in UI components',
      'Delete all 23 duplicate/legacy stage files'
    ],

    success_criteria: [
      'npm run audit:stages passes',
      'All legacy files deleted (23 files)',
      'No "40" or "15" in codebase (grep returns empty)',
      'venture-workflow.ts exports WORKFLOW_STAGES with 25 entries',
      'Build compiles (may have broken imports temporarily)'
    ],

    metadata: {
      timeline: { start_day: 3, end_day: 5, duration_days: 3 },
      files_to_delete: 23,
      files_to_create: 3
    },

    dependencies: ['SD-STAGE-ARCH-001-P0']
  },

  phase2: {
    id: 'SD-STAGE-ARCH-001-P2',
    sd_key: 'stage-arch-remediation-001-p2',
    legacy_id: 'SD-STAGE-ARCH-001-P2',
    title: 'Phase 2: Create V2 Stage Shells + Router',

    description: 'Create shell components for all 25 stages with Vision V2 names and update router to load stages via SSOT registry. Application should compile and navigate all 25 stages (shells render with placeholder content).',

    scope: 'New directory: /src/components/stages/v2/ with 25 shell components. Router updates to use SSOT for stage loading.',

    rationale: 'Shell components allow incremental implementation. Router must use SSOT to ensure stage numbers match components.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Create /src/components/stages/v2/ directory',
      'Create 25 shell components with Vision V2 names',
      'Update router to load stages via SSOT registry',
      'Application compiles without errors',
      'Can navigate all 25 stages in browser'
    ],

    success_criteria: [
      '25 shell components exist in /src/components/stages/v2/',
      'Component names match Vision V2 (Stage01DraftIdea, etc.)',
      'Router uses WORKFLOW_STAGES from SSOT',
      'Browser can navigate /venture/:id/stage/1 through /venture/:id/stage/25',
      'Each stage renders its shell (placeholder content ok)'
    ],

    metadata: {
      timeline: { start_day: 6, end_day: 8, duration_days: 3 },
      files_to_create: 25
    },

    dependencies: ['SD-STAGE-ARCH-001-P1']
  },

  phase3: {
    id: 'SD-STAGE-ARCH-001-P3',
    sd_key: 'stage-arch-remediation-001-p3',
    legacy_id: 'SD-STAGE-ARCH-001-P3',
    title: 'Phase 3: Implement Safe Stages (1-10, 24-25)',

    description: 'Implement fully functional stages for the "safe" stages that can be salvaged from existing code: stages 1-10 and 24-25. Copy logic from git history, adapt to V2 naming/types, verify loads/saves/validates correctly, add unit tests.',

    scope: '12 stages to implement: 1-10, 24-25. Salvage from existing Stage1DraftIdea.tsx, Stage2AIReview.tsx, etc. Adapt naming and types to V2.',

    rationale: 'These stages have existing implementations that mostly match Vision V2 intent. Salvaging is faster than rebuilding from scratch.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 4,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Implement Stage 1 (Draft Idea Review) from Stage1DraftIdea.tsx',
      'Implement Stage 2 (AI Multi-Model Critique) from Stage2AIReview.tsx',
      'Implement Stages 3-10 from salvageable sources',
      'Implement Stage 24 (Analytics & Feedback) from Stage24GrowthMetrics.tsx',
      'Implement Stage 25 (Optimization & Scale) from Stage25ScalePlanning.tsx',
      'Add unit tests for each stage'
    ],

    success_criteria: [
      'Stages 1-10, 24-25 fully functional',
      'Data loads, saves, validates correctly',
      'Kill gates at 3, 5 enforce correctly',
      'Unit tests pass for all 12 stages',
      'E2E golden path test passes for stages 1-10'
    ],

    metadata: {
      timeline: { start_day: 9, end_day: 13, duration_days: 5 },
      stages_to_implement: 12
    },

    dependencies: ['SD-STAGE-ARCH-001-P2']
  },

  phase4: {
    id: 'SD-STAGE-ARCH-001-P4',
    sd_key: 'stage-arch-remediation-001-p4',
    legacy_id: 'SD-STAGE-ARCH-001-P4',
    title: 'Phase 4: Rebuild Crisis Zone (Stages 11-23)',

    description: 'Rebuild stages 11-23 to Vision V2 spec with correct gate logic. These stages have NO existing implementations that match V2 - they must be built from scratch based on Vision V2 purpose and requirements. Includes 2 kill gates (13, 23) and 3 promotion gates (16, 17, 22).',

    scope: '13 stages to rebuild: 11-23. Design UI/UX based on Vision V2 purpose, implement data models, implement gate logic, salvage reusable UI components from git history.',

    rationale: 'Stages 11-23 are the "crisis zone" where neither duplicate matches Vision V2. Full rebuild is required. Gate logic is critical for Genesis Oath workflow.',

    category: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 5,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Rebuild Stage 11 (Go-to-Market Strategy)',
      'Rebuild Stage 12 (Sales & Success Logic)',
      'Rebuild Stage 13 (Tech Stack Interrogation) with KILL GATE',
      'Rebuild Stage 14 (Data Model & Architecture)',
      'Rebuild Stage 15 (Epic & User Story Breakdown)',
      'Rebuild Stage 16 (Schema Firewall) with PROMOTION GATE',
      'Rebuild Stage 17 (Environment Config) with PROMOTION GATE',
      'Rebuild Stages 18-21',
      'Rebuild Stage 22 (Deployment) with PROMOTION GATE',
      'Rebuild Stage 23 (Production Launch) with KILL GATE'
    ],

    success_criteria: [
      'All 13 stages (11-23) fully functional',
      'Kill gates (13, 23) block advancement when criteria not met',
      'Promotion gates (16, 17, 22) elevate simulation to production',
      'Unit tests pass for all 13 stages',
      'E2E golden path test passes for full workflow 1-25'
    ],

    metadata: {
      timeline: { start_day: 14, end_day: 23, duration_days: 10 },
      stages_to_rebuild: 13,
      gates: {
        kill: [13, 23],
        promotion: [16, 17, 22]
      }
    },

    dependencies: ['SD-STAGE-ARCH-001-P3']
  },

  phase5: {
    id: 'SD-STAGE-ARCH-001-P5',
    sd_key: 'stage-arch-remediation-001-p5',
    legacy_id: 'SD-STAGE-ARCH-001-P5',
    title: 'Phase 5: Governance & Polish',

    description: 'Add permanent CI governance and complete documentation. Implement stage audit test, add no-hardcoded-counts lint rule, create Vision V2 compliance check, run E2E test for full venture lifecycle, document architecture in ADR, update CLAUDE.md.',

    scope: 'CI checks: audit:stages, lint rules. E2E test: full venture lifecycle 1-25. Documentation: ADR, CLAUDE.md updates.',

    rationale: 'Governance prevents future drift. Documentation ensures the architecture is understood and maintained.',

    category: 'infrastructure',
    priority: 'high',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-STAGE-ARCH-001',
    sequence_rank: 6,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Add CI stage audit test (25 stages, correct names)',
      'Add ESLint rule for no hardcoded stage counts',
      'Create Vision V2 compliance check against JSON',
      'Run E2E test for full venture lifecycle 1-25',
      'Document architecture in ADR',
      'Update CLAUDE.md with new stage structure'
    ],

    success_criteria: [
      'npm run audit:stages passes in CI',
      'ESLint fails on hardcoded "25", "40", etc.',
      'E2E golden path test passes',
      'ADR documented in /docs/architecture/',
      'CLAUDE.md updated with stage workflow info'
    ],

    metadata: {
      timeline: { start_day: 24, end_day: 26, duration_days: 3 }
    },

    dependencies: ['SD-STAGE-ARCH-001-P4']
  }
};

// ============================================================================
// DATABASE INSERT FUNCTION
// ============================================================================

async function createRemediationSDs() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  STAGE ARCHITECTURE REMEDIATION - SD CREATION                 ║');
  console.log('║  Per LEO Protocol v4.3.3                                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Order matters: parent first, then children in sequence
  const insertOrder = [
    'parent',
    'phase0',
    'phase1',
    'phase2',
    'phase3',
    'phase4',
    'phase5'
  ];

  let successCount = 0;
  let errorCount = 0;

  for (const key of insertOrder) {
    const sd = REMEDIATION_SDS[key];
    console.log(`📋 Creating ${sd.id}...`);

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert({
          id: sd.id,
          sd_key: sd.sd_key,
          legacy_id: sd.legacy_id,
          title: sd.title,
          description: sd.description,
          scope: sd.scope,
          rationale: sd.rationale,
          category: sd.category,
          priority: sd.priority,
          status: sd.status,
          relationship_type: sd.relationship_type,
          parent_sd_id: sd.parent_sd_id,
          sequence_rank: sd.sequence_rank,
          created_by: sd.created_by,
          version: sd.version,
          strategic_objectives: sd.strategic_objectives,
          success_criteria: sd.success_criteria,
          metadata: sd.metadata,
          dependencies: sd.dependencies || [],
          risks: sd.risks || []
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      } else {
        console.log(`   ✅ Created: ${sd.title}`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Exception: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`Results: ${successCount} created, ${errorCount} errors`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (successCount > 0) {
    console.log('📝 Next Steps:');
    console.log('1. Run: npm run sd:next');
    console.log('2. SD-STAGE-ARCH-001 should appear at top of queue');
    console.log('3. Begin Phase 0 (Audit & Clean Database)');
    console.log('4. This SD blocks Genesis Oath v3.1 - complete first!\n');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// Run
createRemediationSDs();
