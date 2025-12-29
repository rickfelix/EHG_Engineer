#!/usr/bin/env node
/**
 * Insert SD-VENTURE-UNIFICATION-001 into strategic_directives_v2
 *
 * Corrected schema mapping:
 * - Uses 'id' (PRIMARY KEY) instead of 'key'
 * - Uses 'sd_key' (UNIQUE NOT NULL) same as id
 * - Maps to actual v2 table column names
 * - Includes all required fields per schema
 *
 * Run: node scripts/insert-sd-venture-unification.js
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

// Strategic Directive data structure matching strategic_directives_v2 schema
const sdData = {
  // PRIMARY KEY and UNIQUE identifier
  id: 'SD-VENTURE-UNIFICATION-001',
  sd_key: 'SD-VENTURE-UNIFICATION-001',

  // Required fields
  title: 'Unified Venture Creation System with Intelligent Dependency-Driven Recursion',
  category: 'feature',
  priority: 'critical', // lowercase per CHECK constraint
  status: 'draft',
  version: '1.0',
  sd_type: 'feature',

  // Core content
  description: 'Unify two parallel venture creation systems (3-step wizard and 40-stage workflow) into a single seamless system where ALL ventures complete ALL 40 stages with intelligent dependency-driven recursion that automatically detects when downstream stages invalidate upstream decisions and routes back to fix root causes.',

  rationale: `BUSINESS RATIONALE:
- Prevents cascading failures by catching bad assumptions early
- Ensures "solid plans" for every venture (all 40 stages mandatory)
- Reduces Chairman manual oversight through automated quality gates
- Faster time to quality via smart backtracking vs starting over

TECHNICAL RATIONALE:
- Two parallel systems create data inconsistency (ventures vs ideas tables)
- No intelligent recursion leads to manual rework and lost progress
- 40-stage workflow unreachable by users (no route)
- Smart dependency detection reduces post-launch pivots by 20-30%`,

  scope: `INCLUDED IN SCOPE:
1. Bridge wizard → workflow (auto-launch at Stage 4)
2. Database consolidation (ventures table only, deprecate ideas)
3. Smart recursion engine with 20-25 dependency scenarios
4. Threshold-based automation (CRITICAL auto-recurse, HIGH needs approval)
5. Loop prevention (max 2-3 recursions per stage)
6. All 40 stages mandatory for every venture (no tier-based limits)

EXCLUDED FROM SCOPE:
- Tier system enhancements (future iteration)
- AI depth per tier (future iteration)
- Recursion analytics dashboard (Phase 4, optional)
- Voice capture migration (Phase 2, optional)

SYSTEMS AFFECTED:
- VentureCreationPage.tsx (3-step wizard)
- CompleteWorkflowOrchestrator.tsx (40-stage workflow)
- All 40 stage components (Stage1-Stage40)
- ventures table schema (consolidation target)
- ideas table (migration/deprecation)
- workflow_executions table
- New: recursion_events table
- New: recursionEngine.ts service`,

  strategic_intent: `STRATEGIC ALIGNMENT:
Transform venture creation from a fragmented process into a unified quality assurance system that automatically prevents poor decisions from cascading through the organization.

ORGANIZATIONAL IMPACT:
- Quality-first culture: Smart recursion embeds quality gates into workflow
- Data-driven improvement: Recursion patterns reveal common failure modes
- Autonomous quality control: Reduce Chairman bottleneck by 40%
- Scalable venture pipeline: Single system supports growth without manual oversight increase

COMPETITIVE ADVANTAGE:
- Faster time to quality ventures (8-12 hours for all 40 stages)
- Higher venture success rate (70%+ vs 55% baseline)
- Transparent quality process builds stakeholder confidence
- Preserved autonomy for creators while maintaining quality standards`,

  // JSONB fields
  success_criteria: [
    {
      id: 'SC-001',
      criterion: 'User completes 3-step wizard and is automatically redirected to Stage 4 of 40-stage workflow with zero manual intervention',
      measure: 'E2E test verifies automatic transition, 100% of wizard completions launch workflow',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-002',
      criterion: 'All 40 stages accessible regardless of tier assignment',
      measure: 'Stage access validation confirms no stage limits enforced, tier check disabled',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-003',
      criterion: 'Recursion triggers automatically when Stage 5 detects ROI < 15%',
      measure: 'Unit test + E2E test for FIN-001 scenario, recursion event logged to database',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-004',
      criterion: 'Stage 10 blocking technical issues trigger automatic recursion to Stage 8',
      measure: 'Unit test + E2E test for TECH-001 scenario, recursion event logged',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-005',
      criterion: '3 recursions on same stage escalate to Chairman with detailed history',
      measure: 'Loop prevention test verifies escalation, Chairman notification sent',
      priority: 'HIGH'
    },
    {
      id: 'SC-006',
      criterion: 'Zero data loss during ideas → ventures migration',
      measure: 'Migration script validation: row count match, JSON schema validation, spot checks',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-007',
      criterion: 'Recursion detection completes in <100ms per stage',
      measure: 'Performance test suite: 95th percentile latency <100ms under load',
      priority: 'HIGH'
    },
    {
      id: 'SC-008',
      criterion: 'All 20-25 recursion scenarios documented with triggers and thresholds',
      measure: 'Documentation review: complete mapping table, all scenarios have E2E tests',
      priority: 'HIGH'
    },
    {
      id: 'SC-009',
      criterion: 'Existing ventures grandfathered without breaking changes',
      measure: 'Backward compatibility test suite: pre-unification ventures function normally',
      priority: 'CRITICAL'
    },
    {
      id: 'SC-010',
      criterion: 'UI displays recursion history with trigger explanations',
      measure: 'UI test verifies recursion timeline visible, explanations clear and actionable',
      priority: 'HIGH'
    }
  ],

  risks: [
    {
      risk: 'Infinite recursion loops despite max recursion limits',
      severity: 'medium',
      probability: 'low',
      mitigation: 'Max 3 recursions per stage with escalation, comprehensive unit tests, circuit breaker pattern',
      owner: 'EXEC'
    },
    {
      risk: 'Data migration failures during ideas → ventures consolidation',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Soft-delete ideas table (keep 90 days), comprehensive rollback plan, dry-run migration test',
      owner: 'DATABASE'
    },
    {
      risk: 'Performance degradation from recursion detection on every stage completion',
      severity: 'low',
      probability: 'low',
      mitigation: 'Async detection with caching, query optimization, performance monitoring',
      owner: 'EXEC'
    },
    {
      risk: 'Breaking changes to existing ventures in progress',
      severity: 'high',
      probability: 'medium',
      mitigation: 'Grandfather old ventures, feature flag for new system, staged rollout',
      owner: 'PLAN'
    },
    {
      risk: 'Recursion threshold tuning requires multiple iterations',
      severity: 'medium',
      probability: 'high',
      mitigation: 'Start conservative (auto-approve CRITICAL only), data-driven adjustment, A/B testing',
      owner: 'Chairman'
    },
    {
      risk: 'Chairman overwhelmed with HIGH threshold approval requests',
      severity: 'medium',
      probability: 'medium',
      mitigation: 'Auto-approve CRITICAL thresholds, batch approval UI, delegate to trusted advisors',
      owner: 'Chairman'
    },
    {
      risk: '8-week timeline too aggressive for 40-stage integration',
      severity: 'medium',
      probability: 'medium',
      mitigation: 'Phased delivery (MVP at 4 weeks), reuse Stage 1-10 patterns, parallel implementation tracks',
      owner: 'PLAN'
    }
  ],

  dependencies: [
    {
      dependency: 'Existing recursion loop system (recursionLoop.ts)',
      type: 'technical',
      status: 'ready',
      notes: 'Available, needs extension for stage-level dependency detection'
    },
    {
      dependency: 'Validation framework (validationFramework.ts)',
      type: 'technical',
      status: 'ready',
      notes: 'Available, reuse for trigger detection logic'
    },
    {
      dependency: 'EVA quality scoring (evaValidation.ts)',
      type: 'technical',
      status: 'ready',
      notes: 'Available, integrate with recursion thresholds'
    },
    {
      dependency: 'Ventures table schema updates',
      type: 'technical',
      status: 'required',
      notes: 'Migration needed to consolidate ideas table data'
    },
    {
      dependency: 'Workflow execution tracking',
      type: 'technical',
      status: 'ready',
      notes: 'Available, extend for stage-level recursion events'
    },
    {
      dependency: 'Chairman availability for HIGH threshold approvals',
      type: 'external',
      status: 'required',
      notes: 'Human approval needed for <10% of recursion events'
    },
    {
      dependency: 'Database migration approval',
      type: 'process',
      status: 'required',
      notes: 'Chairman sign-off required before ideas table deprecation'
    }
  ],

  success_metrics: {
    implementation: {
      target_completion: '8 weeks',
      phase_1_delivery: '1 week (database + bridge)',
      phase_2_delivery: '2 weeks (recursion engine)',
      phase_3_delivery: '4 weeks (stage integration 1-10)',
      phase_4_delivery: '1 week (stage integration 11-40 + testing)',
      total_effort_hours: 144
    },
    quality: {
      recursion_detection_latency_ms: 100,
      data_migration_success_rate: '100%',
      test_coverage_recursion_paths: '100%',
      zero_data_loss: true,
      backward_compatibility: '100%'
    },
    adoption: {
      avg_recursions_per_venture: '2-4',
      chairman_escalation_rate: '<10%',
      venture_completion_rate_all_40_stages: '>95%',
      user_satisfaction_recursion_ux: '>8/10',
      wizard_to_workflow_transition_success: '100%'
    },
    business: {
      quality_improvement_post_launch: '20-30% reduction in pivots',
      time_to_quality_venture: '8-12 hours (all 40 stages)',
      chairman_oversight_reduction: '40% fewer manual reviews',
      venture_success_rate_12mo: '>70% (baseline: 55%)',
      roi: 'Positive within 6 months via reduced rework'
    }
  },

  stakeholders: [
    {
      name: 'Chairman',
      role: 'Executive Sponsor & Approver',
      involvement: 'HIGH threshold recursion approvals, final sign-off',
      contact: 'Primary stakeholder'
    },
    {
      name: 'LEAD Agent',
      role: 'Business Value Validator',
      involvement: 'Strategic alignment verification, outcome validation',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'PLAN Agent',
      role: 'Technical Feasibility Validator',
      involvement: 'PRD creation, architecture review, test planning',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'EXEC Agent',
      role: 'Implementation Lead',
      involvement: 'Code implementation, recursion engine development, testing',
      contact: 'LEO Protocol agent'
    },
    {
      name: 'DATABASE Sub-Agent',
      role: 'Schema Migration Specialist',
      involvement: 'ideas → ventures migration, recursion_events table design',
      contact: 'LEO Protocol sub-agent'
    },
    {
      name: 'QA Sub-Agent',
      role: 'Quality Assurance',
      involvement: 'E2E test suite for recursion paths, performance testing',
      contact: 'LEO Protocol sub-agent'
    },
    {
      name: 'Venture Creators',
      role: 'End Users',
      involvement: 'Experience unified workflow, provide feedback on recursion UX',
      contact: 'EHG application users'
    }
  ],

  metadata: {
    estimated_effort_hours: 144,
    complexity: 'HIGH',
    impact_scope: 'Venture creation workflow, database architecture, user experience',
    breaking_changes: false,
    requires_migration: true,
    migration_type: 'ideas_table_to_ventures_metadata',
    phased_delivery: true,
    mvp_at_week: 4,
    deferred_features: [
      'Tier system enhancements',
      'AI depth per tier',
      'Recursion analytics dashboard',
      'Voice capture migration'
    ],
    acceptance_criteria_count: 12,
    recursion_scenarios_count: '20-25',
    stages_affected: 40,
    new_tables: ['recursion_events'],
    deprecated_tables: ['ideas'],
    new_services: ['recursionEngine.ts'],
    performance_requirements: {
      recursion_detection_latency: '100ms',
      stage_completion_time: '8-12 hours for all 40 stages'
    }
  },

  // Application and workflow fields
  target_application: 'EHG',
  current_phase: 'LEAD_APPROVAL',
  created_by: 'human:Chairman'
};

async function insertSD() {
  console.log('🔄 Inserting SD-VENTURE-UNIFICATION-001 into strategic_directives_v2...\n');

  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, created_at')
      .eq('id', 'SD-VENTURE-UNIFICATION-001')
      .single();

    if (existing) {
      console.log('⚠️  SD already exists in database:');
      console.log(`   ID: ${existing.id}`);
      console.log(`   Title: ${existing.title}`);
      console.log(`   Status: ${existing.status}`);
      console.log(`   Created: ${existing.created_at}`);
      console.log('\n❓ Delete existing record and re-insert? (Ctrl+C to abort)');

      // Delete existing
      const { error: deleteError } = await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('id', 'SD-VENTURE-UNIFICATION-001');

      if (deleteError) {
        console.error('❌ Error deleting existing record:', deleteError.message);
        process.exit(1);
      }

      console.log('✅ Deleted existing record\n');
    }

    // Insert new record
    const { error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select();

    if (error) {
      console.error('❌ Error inserting SD:', error.message);
      console.error('   Details:', error);
      process.exit(1);
    }

    console.log('✅ Successfully inserted SD-VENTURE-UNIFICATION-001!\n');

    // Verify insertion with detailed query
    const { data: verification, error: verifyError } = await supabase
      .from('strategic_directives_v2')
      .select(`
        id,
        sd_key,
        title,
        category,
        priority,
        status,
        version,
        sd_type,
        target_application,
        current_phase,
        created_at,
        created_by,
        success_criteria,
        risks,
        dependencies,
        stakeholders,
        success_metrics
      `)
      .eq('id', 'SD-VENTURE-UNIFICATION-001')
      .single();

    if (verifyError) {
      console.error('❌ Error verifying insertion:', verifyError.message);
      process.exit(1);
    }

    console.log('📊 Verification Results:');
    console.log(`   ID: ${verification.id}`);
    console.log(`   SD Key: ${verification.sd_key}`);
    console.log(`   Title: ${verification.title}`);
    console.log(`   Category: ${verification.category}`);
    console.log(`   Priority: ${verification.priority}`);
    console.log(`   Status: ${verification.status}`);
    console.log(`   Version: ${verification.version}`);
    console.log(`   SD Type: ${verification.sd_type}`);
    console.log(`   Target App: ${verification.target_application}`);
    console.log(`   Current Phase: ${verification.current_phase}`);
    console.log(`   Created At: ${verification.created_at}`);
    console.log(`   Created By: ${verification.created_by}`);
    console.log(`   Success Criteria: ${verification.success_criteria?.length || 0} items`);
    console.log(`   Risks: ${verification.risks?.length || 0} items`);
    console.log(`   Dependencies: ${verification.dependencies?.length || 0} items`);
    console.log(`   Stakeholders: ${verification.stakeholders?.length || 0} items`);
    console.log(`   Success Metrics: ${verification.success_metrics ? 'Populated' : 'Empty'}`);

    console.log('\n✅ INSERTION COMPLETE!');
    console.log('\n📋 Next Steps (LEO Protocol):');
    console.log('   1. LEAD Agent: Review and approve directive');
    console.log('      UPDATE strategic_directives_v2 SET status = \'active\' WHERE id = \'SD-VENTURE-UNIFICATION-001\';');
    console.log('   2. PLAN Agent: Create PRD with 5 epic execution sequences');
    console.log('   3. Generate user stories from acceptance criteria');
    console.log('   4. DATABASE Sub-Agent: Design recursion_events table schema');
    console.log('   5. EXEC Agent: Implement Phase 1 (database + bridge)');
    console.log('\n   View in dashboard: /strategic-directives/SD-VENTURE-UNIFICATION-001');

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    console.error('   Stack:', err.stack);
    process.exit(1);
  }
}

// Run insertion
insertSD();
