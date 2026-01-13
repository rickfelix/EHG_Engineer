#!/usr/bin/env node

/**
 * Create SD-RAID-VENTURES-001: RAID Tracking & Category-Based Progress Visualization
 * Target Application: EHG (business app) - NOT EHG_Engineer!
 * Database: liapbndqlqxdcgpwntbv (EHG Supabase)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating SD-RAID-VENTURES-001: RAID Tracking & Category-Based Progress Visualization...\n');

  const sdData = {
    id: 'SD-RAID-VENTURES-001',
    sd_key: 'SD-RAID-VENTURES-001',
    title: 'RAID Tracking & Category-Based Progress Visualization for Ventures',
    description: `Add RAID (Risks, Actions, Issues, Decisions) tracking and 6-category workflow progress visualization to the Ventures page. Leverage existing raid_log table and WORKFLOW_STAGES/STAGE_CATEGORIES infrastructure. New list view displays venture name, category progress bars (6 mini bars for ideation, validation, planning, development, launch, growth), RAID indicator badges with color coding, and overall progress.`,

    status: 'draft',
    priority: 'high', // User requested HIGH priority
    category: 'Venture Management',

    target_application: 'EHG', // CRITICAL: Implementation in EHG app, NOT EHG_Engineer!

    strategic_intent: 'Improve portfolio oversight through better risk visibility and granular progress tracking',

    rationale: `Chairman Dashboard currently shows portfolio-level RAID risks, but individual ventures page lacks RAID visibility. Users cannot see which ventures have critical risks, pending actions, or recent decisions without drilling into details. Additionally, current single progress bar (stage X/40) doesn't show progress within each workflow category (ideation, validation, planning, etc.). This limits ability to identify bottlenecks or assess venture health at a glance.`,

    scope: {
      included: [
        'Leverage EXISTING raid_log table (DO NOT create new RAID tables!)',
        'Create venture_raid_summary database view for aggregation',
        'New React hook: useVentureRAIDSummary(ventureId)',
        'Extend useVentures.ts to optionally include RAID summary',
        'CategoryProgressBars.tsx component (6 mini progress bars)',
        'RAIDIndicatorBadge.tsx component (R:3 A:5 I:0 D:2 with color coding)',
        'VenturesListView.tsx component (new view mode for VenturesPage)',
        'Add "list" to VenturesPage viewMode type union',
        'Category progress calculation utility using WORKFLOW_STAGES',
        'Extract severity/status helpers from PortfolioRisksCard.tsx',
        'Sample RAID data for existing ventures (testing)',
        'RLS policy validation (company-based access)',
        'Performance testing (50+ ventures)',
        'Mobile responsive design'
      ],
      excluded: [
        'Creating new RAID database tables (raid_log ALREADY EXISTS!)',
        'Modifying existing grid/card/kanban views',
        'RAID entry/editing UI (focus on read-only display)',
        'Decision log integration (separate system for chairman analytics)',
        'Real-time WebSocket subscriptions (polling sufficient)',
        'Advanced filtering by RAID status (phase 2)',
        'Export/reporting features (separate SD)'
      ],
      database_changes: {
        new_tables: [],
        new_views: ['venture_raid_summary'],
        modified_tables: [],
        leverage_existing: ['raid_log', 'ventures']
      }
    },

    strategic_objectives: [
      'Surface RAID indicators on ventures list for at-a-glance health assessment',
      'Show category-based progress (6 categories) instead of single overall progress',
      'Achieve <500ms load time for 50 ventures with RAID data',
      'Make list view the default view mode for 60%+ of users within 2 weeks',
      'Zero database schema changes (100% reuse of existing raid_log table)',
      'Reuse 80% of existing code patterns (PortfolioRisksCard, WorkflowProgress, useVentures)'
    ],

    success_criteria: [
      '100% of ventures display accurate RAID counts (R, A, I, D)',
      'Category progress bars accurately reflect stage completion per category',
      '<500ms load time for 50 ventures with RAID data',
      'RAID color coding intuitive: 🟢 0-2 (low), 🟡 3-5 (moderate), 🔴 6+ (high attention)',
      'List view responsive on mobile (6 progress bars stack appropriately)',
      'Click interactions allow drill-down to detailed RAID views',
      'Zero new database tables created (uses raid_log)',
      'RLS policies enforce company-based access (no data leakage)',
      'List view becomes default for 60%+ of users within 2 weeks'
    ],

    key_principles: [
      'REUSE existing infrastructure (raid_log table, WORKFLOW_STAGES, PortfolioRisksCard patterns)',
      'SIMPLICITY: No new schemas, 80% code reuse, proven UI patterns',
      'PERFORMANCE: Materialized view or summary table if needed',
      'EXTENSIBILITY: List view integrates with existing view mode infrastructure',
      'USER-CENTRIC: Scannable layout, at-a-glance health assessment'
    ],

    implementation_guidelines: [
      'Phase 1: Backend Integration (3-4 hours)',
      '  - Create venture_raid_summary view (aggregate RAID counts per venture)',
      '  - Create useVentureRAIDSummary(ventureId) React Query hook',
      '  - Extend useVentures.ts to join with raid_log summary',
      '',
      'Phase 2: UI Components (3-4 hours)',
      '  - Extract severity/status helpers from PortfolioRisksCard.tsx',
      '  - Create CategoryProgressBars.tsx using WORKFLOW_STAGES',
      '  - Create RAIDIndicatorBadge.tsx with color coding',
      '',
      'Phase 3: VenturesPage List View (2-3 hours)',
      '  - Add "list" to viewMode type union',
      '  - Create VenturesListView.tsx using Shadcn Table component',
      '  - Integrate CategoryProgressBars + RAIDIndicatorBadge components',
      '  - Add TabsTrigger for list view',
      '',
      'Phase 4: Testing & Refinement (1-2 hours)',
      '  - Add sample RAID data for ventures',
      '  - Test RLS policies with multi-company scenarios',
      '  - Performance test with 50+ ventures',
      '  - Mobile responsive validation'
    ],

    dependencies: [
      'EXISTING raid_log table (database/migrations/_archive/create-raid-log-table.sql)',
      'EXISTING PortfolioRisksCard.tsx (src/components/chairman/PortfolioRisksCard.tsx)',
      'EXISTING WORKFLOW_STAGES / STAGE_CATEGORIES (src/constants/workflows.ts)',
      'EXISTING useVentures.ts (src/hooks/useVentures.ts)',
      'EXISTING VenturesPage viewMode infrastructure',
      'React Query (already in use)',
      'Shadcn UI components (already installed)',
      'Supabase client (already configured)'
    ],

    risks: [
      {
        description: 'Query performance degradation with JOINs across ventures + raid_log for 50+ ventures',
        mitigation: 'Use materialized view or summary table with triggers; Add database indexes on venture_id',
        severity: 'medium',
        probability: 0.4
      },
      {
        description: 'Category progress calculation inaccuracy if WORKFLOW_STAGES structure changes',
        mitigation: 'Unit tests for all 40 stages across 6 categories; Validate against known test cases',
        severity: 'low',
        probability: 0.2
      },
      {
        description: 'Mobile layout issues with 6 progress bars + RAID badges',
        mitigation: 'Responsive design with stacking/collapsing; Test on multiple screen sizes',
        severity: 'low',
        probability: 0.3
      },
      {
        description: 'RLS policy complexity causing unexpected access denials',
        mitigation: 'Reuse exact pattern from existing ventures table; Test multi-company scenarios',
        severity: 'low',
        probability: 0.1
      }
    ],

    success_metrics: [
      'RAID visibility: 100% ventures show accurate counts',
      'Performance: <500ms for 50 ventures',
      'Accuracy: Category progress matches stage completion',
      'Adoption: List view default for 60%+ users in 2 weeks',
      'Reuse: 80% code reuse achieved',
      'Zero new tables created'
    ],

    metadata: {
      created_by: 'PLAN Agent - Codebase Analysis',
      sequence_rank: 20,
      sub_agents_required: [
        'Senior Design Sub-Agent (UI/UX for list view)',
        'Principal Database Architect (view optimization)',
        'QA Engineering Director (testing strategy)',
        'Performance Engineering Lead (query performance)'
      ],
      acceptance_testing_required: true,
      database_changes: false, // No schema changes, only views!
      estimated_effort: '9-13 hours (~1.5-2 sprints)',
      code_reuse_percentage: 80,

      // CRITICAL: Codebase analysis findings
      codebase_analysis: {
        existing_infrastructure: {
          raid_log_table: {
            location: '../ehg/database/migrations/_archive/create-raid-log-table.sql',
            status: 'ALREADY EXISTS - DO NOT RECREATE',
            schema: 'raid_log with type (Risk, Action, Issue, Decision), severity_index, status, venture_id FK',
            usage: 'PortfolioRisksCard.tsx already queries this table'
          },
          workflow_stages: {
            location: '../ehg/src/constants/workflows.ts',
            lines: '582-912 (913 total lines)',
            categories: {
              ideation: 'stages 1-2 (2 stages)',
              validation: 'stages 3-6 (4 stages)',
              planning: 'stages 7-13 (7 stages)',
              development: 'stages 14-30 (17 stages)',
              launch: 'stage 31 (1 stage)',
              growth: 'stages 32-40 (9 stages)'
            },
            colors_icons_defined: true,
            usage_confirmed: 'WorkflowProgress.tsx, VentureStageNavigation.tsx, LiveWorkflowMap.tsx'
          },
          ventures_page: {
            location: '../ehg/src/pages/VenturesPage.tsx',
            view_modes: ['table', 'grid', 'kanban', 'stages', 'distribution', 'timeline'],
            extensibility: 'HIGHLY EXTENSIBLE - just add "list" to type union',
            url_sync: true,
            current_gap: 'No list view with RAID + category progress'
          },
          reusable_components: [
            {
              name: 'PortfolioRisksCard.tsx',
              location: '../ehg/src/components/chairman/PortfolioRisksCard.tsx',
              pattern: 'RAID query + severity color coding (HIGH/MED/LOW)',
              reuse: 'Extract severity/status badge logic'
            },
            {
              name: 'useVentures.ts',
              location: '../ehg/src/hooks/useVentures.ts',
              pattern: 'Simple React Query hook returning Venture[]',
              reuse: 'Extension point for RAID summary'
            },
            {
              name: 'WorkflowProgress.tsx',
              location: '../ehg/src/components/workflow/WorkflowProgress.tsx',
              pattern: 'Category-based status calculation',
              reuse: 'Category progress calculation pattern'
            }
          ],
          hooks_available: [
            'useVentures.ts', 'useWorkflowData.ts', 'useLiveWorkflowProgress.ts',
            'useVentureData.ts', 'useRealTimeVentures.ts'
          ]
        },

        alignment_gaps: [
          {
            gap: 'Dual decision tracking systems (decision_log vs raid_log type=Decision)',
            impact: 'Keep separate - different purposes (chairman analytics vs project RAID)',
            action: 'Document clearly in implementation'
          },
          {
            gap: 'VenturesPage uses 4-group categorization vs actual 6 categories',
            impact: 'Replace getStageRange() logic with STAGE_CATEGORIES',
            action: 'Update to use actual 6-category structure'
          },
          {
            gap: 'No venture-level RAID summary view',
            impact: 'Performance concern for 50+ ventures',
            action: 'Create venture_raid_summary view'
          }
        ],

        technical_risks: [
          {
            risk: 'Query performance with JOINs (ventures + raid_log)',
            likelihood: 'Medium',
            mitigation: 'Materialized view with indexes'
          },
          {
            risk: 'RLS policy complexity',
            likelihood: 'Low',
            mitigation: 'Reuse existing ventures pattern'
          }
        ],

        simplicity_validation: {
          new_schemas: 0,
          code_reuse: '80%',
          proven_patterns: ['PortfolioRisksCard RAID display', 'WorkflowProgress category calc', 'VenturesPage view modes'],
          complexity_level: 'Low - aggregation view + list layout'
        }
      },

      target_application_context: {
        implementation_path: '../ehg/',
        database: 'liapbndqlqxdcgpwntbv',
        github_repo: 'rickfelix/ehg.git',
        port: 8080,
        critical_check: 'MUST verify pwd shows ../ehg before ANY code changes!'
      }
    }
  };

  // Insert SD into database
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating SD:', error);
    process.exit(1);
  }

  console.log('✅ SD-RAID-VENTURES-001 Created Successfully!\n');
  console.log('📋 Strategic Directive Details:');
  console.log('   ID:', data.id);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Priority:', data.priority, '(HIGH)');
  console.log('   Target Application:', data.target_application);
  console.log('   Estimated Effort:', data.metadata.estimated_effort);
  console.log('   Code Reuse:', data.metadata.code_reuse_percentage + '%');
  console.log('\n🎯 Key Insights from Codebase Analysis:');
  console.log('   ✅ raid_log table ALREADY EXISTS (no new schemas needed!)');
  console.log('   ✅ 80% code reuse from existing patterns');
  console.log('   ✅ WORKFLOW_STAGES/STAGE_CATEGORIES ready to use');
  console.log('   ✅ VenturesPage view mode infrastructure highly extensible');
  console.log('\n📍 CRITICAL: Implementation Target');
  console.log('   Application: EHG (../ehg/)');
  console.log('   Database: liapbndqlqxdcgpwntbv');
  console.log('   GitHub: rickfelix/ehg.git');
  console.log('\n🚀 Next Steps:');
  console.log('   1. LEAD review and approval');
  console.log('   2. PLAN creates comprehensive PRD');
  console.log('   3. PLAN→EXEC handoff with codebase analysis findings');
  console.log('   4. EXEC implements in ../ehg/ (NOT EHG_Engineer!)');
}

createStrategicDirective().catch(console.error);
