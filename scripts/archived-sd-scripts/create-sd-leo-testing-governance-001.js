#!/usr/bin/env node

/**
 * Create Master SD: SD-LEO-TESTING-GOVERNANCE-001
 * LEO Protocol Testing Governance Enhancement
 *
 * Origin: Retrospective analysis of 27+ protocol improvement suggestions
 *
 * HIERARCHY:
 * SD-LEO-TESTING-GOVERNANCE-001 (Orchestrator)
 * ├── SD-LEO-TESTING-GOVERNANCE-001A (Mandate TESTING Gate)
 * ├── SD-LEO-TESTING-GOVERNANCE-001B (Test Evidence Auto-Capture)
 * ├── SD-LEO-TESTING-GOVERNANCE-001C (Schema Documentation Loading)
 * └── SD-LEO-TESTING-GOVERNANCE-001D (Retrospective Test Metrics)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// CHILD SD DEFINITIONS
// ============================================================================

const childSDs = [
  // -------------------------------------------------------------------------
  // CHILD A: Mandate TESTING Sub-Agent Gate
  // -------------------------------------------------------------------------
  {
    id: 'SD-LEO-TESTING-GOVERNANCE-001A',
    title: 'Mandate TESTING Sub-Agent Validation Gate',
    priority: 'critical',
    rank: 1,
    purpose: 'Add a mandatory blocking gate to EXEC→PLAN handoff requiring TESTING sub-agent to pass before completion.',
    scope: {
      included: [
        'Add MANDATORY_TESTING_VALIDATION gate to ExecToPlanExecutor',
        'Query sub_agent_execution_results for TESTING verdict',
        'SD type exemption logic via sd_type_validation_profiles',
        'Freshness validation (configurable max age)',
        'Remediation entry with fix instructions'
      ],
      excluded: [
        'Changes to TESTING sub-agent itself',
        'Changes to other handoff types',
        'Coverage threshold enforcement (separate concern)'
      ]
    },
    deliverables: [
      'MANDATORY_TESTING_VALIDATION gate in getRequiredGates()',
      'Query logic for sub_agent_execution_results table',
      'SD type exemptions for documentation/infrastructure/orchestrator',
      'Freshness check with LEO_TESTING_MAX_AGE_HOURS env var',
      'Remediation guidance in getRemediation() method'
    ],
    success_criteria: [
      'Gate blocks missing TESTING - 100%',
      'Gate allows passing TESTING - 100%',
      'Exemptions work for documentation SDs',
      'Freshness enforced - stale results rejected',
      'Remediation helpful - users can fix and retry'
    ],
    acceptance_criteria: [
      { id: 'AC-A-1', scenario: 'Missing TESTING', given: 'SD with no TESTING execution', when: 'Handoff runs', then: 'Handoff fails with blocking message' },
      { id: 'AC-A-2', scenario: 'Failed TESTING', given: 'TESTING verdict is FAIL', when: 'Handoff runs', then: 'Handoff blocked' },
      { id: 'AC-A-3', scenario: 'Passing TESTING', given: 'TESTING verdict is PASS', when: 'Handoff runs', then: 'Handoff proceeds' },
      { id: 'AC-A-4', scenario: 'Documentation exemption', given: 'sd_type is documentation', when: 'Handoff runs', then: 'TESTING not required' }
    ],
    estimated_effort: '10-15 hours',
    estimated_loc: 80,
    dependencies: [],
    blocks: ['SD-LEO-TESTING-GOVERNANCE-001B']
  },

  // -------------------------------------------------------------------------
  // CHILD B: Test Evidence Auto-Capture Gate
  // -------------------------------------------------------------------------
  {
    id: 'SD-LEO-TESTING-GOVERNANCE-001B',
    title: 'Test Evidence Auto-Capture Gate',
    priority: 'high',
    rank: 2,
    purpose: 'Add advisory gate to EXEC→PLAN handoff that auto-detects and ingests test reports before handoff validation.',
    scope: {
      included: [
        'Add TEST_EVIDENCE_AUTO_CAPTURE gate to ExecToPlanExecutor',
        'Scan for test reports in standard locations',
        'Call ingestTestEvidence() from existing module',
        'Populate test_runs, test_results, story_test_mappings',
        'Check for fresh existing evidence to avoid duplicates'
      ],
      excluded: [
        'Changes to test-evidence-ingest.js module',
        'Changes to test report generation',
        'Removal of legacy test capture scripts',
        'UI for viewing test evidence'
      ]
    },
    deliverables: [
      'TEST_EVIDENCE_AUTO_CAPTURE gate (advisory, not blocking)',
      'Report scanning for playwright-report/report.json',
      'Report scanning for test-results/.last-run.json',
      'Report scanning for coverage/coverage-summary.json',
      'Integration with existing ingestTestEvidence()'
    ],
    success_criteria: [
      'Reports detected when present',
      'Evidence ingested - test_runs created - 100%',
      'Tests captured - test_results populated - 100%',
      'Story mappings created - ≥80%',
      'No duplicates - fresh evidence skipped'
    ],
    acceptance_criteria: [
      { id: 'AC-B-1', scenario: 'Playwright report', given: 'playwright-report/report.json exists', when: 'Gate runs', then: 'Report detected and ingested' },
      { id: 'AC-B-2', scenario: 'test_runs created', given: 'Valid report', when: 'Ingestion runs', then: 'test_runs record with correct sd_id' },
      { id: 'AC-B-3', scenario: 'Story mappings', given: 'Tests with US-XXX in names', when: 'Ingestion runs', then: 'story_test_mappings created' },
      { id: 'AC-B-4', scenario: 'Fresh evidence skip', given: 'Evidence <60 min old', when: 'Gate runs', then: 'Re-ingestion skipped' }
    ],
    estimated_effort: '15-20 hours',
    estimated_loc: 120,
    dependencies: ['SD-LEO-TESTING-GOVERNANCE-001A'],
    blocks: ['SD-LEO-TESTING-GOVERNANCE-001C']
  },

  // -------------------------------------------------------------------------
  // CHILD C: Schema Documentation Loading
  // -------------------------------------------------------------------------
  {
    id: 'SD-LEO-TESTING-GOVERNANCE-001C',
    title: 'Schema Documentation Loading in Phase Preflight',
    priority: 'medium',
    rank: 3,
    purpose: 'Add proactive schema documentation loading to phase-preflight.js for PLAN/EXEC phases.',
    scope: {
      included: [
        'Create lib/schema-context-loader.js module',
        'Integrate into scripts/phase-preflight.js',
        'Extract table names from SD title/description',
        'Load schema docs from docs/reference/schema/engineer/tables/',
        'Display schema context in preflight output'
      ],
      excluded: [
        'Live database schema queries',
        'Schema doc generation improvements',
        'RLS policy documentation',
        'Migration impact analysis'
      ]
    },
    deliverables: [
      'lib/schema-context-loader.js module (~200 lines)',
      'extractTableNames(text) function',
      'loadTableSchema(tableName) function',
      'loadSchemaContext(sd, options) main function',
      'formatSchemaContext(context) terminal display',
      'Integration in phase-preflight.js (~35 lines)'
    ],
    success_criteria: [
      'Tables detected from SD description - when present',
      'Schemas loaded from pre-generated docs - 100%',
      'Context displayed in preflight for PLAN/EXEC',
      'No performance impact - preflight increase <500ms',
      'Graceful fallback - missing docs handled'
    ],
    acceptance_criteria: [
      { id: 'AC-C-1', scenario: 'Table extraction', given: 'SD mentions retrospectives table', when: 'Preflight runs', then: 'Table name detected' },
      { id: 'AC-C-2', scenario: 'Schema loading', given: 'Table detected', when: 'Schema loaded', then: 'Column info displayed' },
      { id: 'AC-C-3', scenario: 'PLAN phase', given: 'PLAN preflight', when: 'Runs', then: 'Up to 8 tables loaded' },
      { id: 'AC-C-4', scenario: 'Missing docs', given: 'No schema doc exists', when: 'Load attempted', then: 'Warning not error' }
    ],
    estimated_effort: '10-15 hours',
    estimated_loc: 275,
    dependencies: ['SD-LEO-TESTING-GOVERNANCE-001B'],
    blocks: ['SD-LEO-TESTING-GOVERNANCE-001D']
  },

  // -------------------------------------------------------------------------
  // CHILD D: Test Coverage Metrics in Retrospectives
  // -------------------------------------------------------------------------
  {
    id: 'SD-LEO-TESTING-GOVERNANCE-001D',
    title: 'Test Coverage Metrics in Retrospectives',
    priority: 'medium',
    rank: 4,
    purpose: 'Add quantitative test coverage metrics to retrospectives table with FK to test_runs.',
    scope: {
      included: [
        'Database migration adding columns to retrospectives',
        'Modify RETRO sub-agent to populate new fields',
        'Query v_sd_test_readiness for coverage metrics',
        'Index for efficient test_run lookups'
      ],
      excluded: [
        'UI changes to retrospective display',
        'Historical data backfill',
        'Test threshold enforcement',
        'Changes to test_runs schema'
      ]
    },
    deliverables: [
      'Migration: database/migrations/YYYYMMDD_add_retro_test_metrics.sql',
      'test_run_id FK column to retrospectives',
      'test_pass_rate, test_total_count, test_*_count columns',
      'story_coverage_percent, stories_with_tests columns',
      'extractTestMetrics() function in retro.js',
      'Modified generateRetrospective() with test metrics'
    ],
    success_criteria: [
      'Migration applies - no errors',
      'FK populates - test_run_id linked when evidence exists',
      'Metrics populate - pass_rate, counts filled when evidence exists',
      'Story coverage - story_coverage_percent filled when stories exist',
      'No regressions - historical retros intact with NULL values',
      'Query performance - FK index used <100ms'
    ],
    acceptance_criteria: [
      { id: 'AC-D-1', scenario: 'Migration', given: 'Migration SQL', when: 'Applied', then: 'All columns created without errors' },
      { id: 'AC-D-2', scenario: 'FK constraint', given: 'Valid test_run_id', when: 'Inserted', then: 'Constraint satisfied' },
      { id: 'AC-D-3', scenario: 'Metrics from evidence', given: 'Retro with test evidence', when: 'Generated', then: 'test_pass_rate matches v_latest_test_evidence' },
      { id: 'AC-D-4', scenario: 'Historical retros', given: 'Existing retrospectives', when: 'Migration runs', then: 'NULL values preserved' }
    ],
    estimated_effort: '15-20 hours',
    estimated_loc: 115,
    dependencies: ['SD-LEO-TESTING-GOVERNANCE-001C'],
    blocks: []
  }
];

// ============================================================================
// ORCHESTRATOR SD
// ============================================================================

async function createTestingGovernanceOrchestrator() {
  console.log('Creating Orchestrator SD: SD-LEO-TESTING-GOVERNANCE-001...\n');

  const orchestratorSD = {
    id: 'SD-LEO-TESTING-GOVERNANCE-001',

    title: 'LEO Protocol Testing Governance Enhancement',

    description: 'Master Strategic Directive orchestrating the implementation of strengthened LEO Protocol testing governance. This addresses systemic testing gaps identified in retrospective analysis of 27+ protocol improvement suggestions, including mandatory test validation gates, automated evidence capture, proactive schema documentation, and quantitative retrospective metrics.',

    rationale: `Based on retrospective analysis of 137 completed SDs:
(1) 16 retrospectives cited: "Mandate TESTING sub-agent execution before EXEC→PLAN handoff"
(2) 14.6% of SDs (20/137) completed without test validation
(3) 42-95 hours/year lost to schema mismatches
(4) 4 retrospectives requested: "Add test coverage metrics to retrospectives"

Current state problems:
- TESTING sub-agent optional - SD-TECH-DEBT-DOCS-001 blocking
- Test evidence not captured - story_test_mappings empty
- Schema docs not in preflight - 90+ scripts with mismatches
- Retrospectives lack metrics - No FK to test_runs`,

    scope: JSON.stringify({
      included: [
        'EXEC→PLAN handoff gate additions',
        'Test evidence ingestion automation',
        'Schema context loading in phase-preflight.js',
        'Retrospective schema enhancement',
        'Unit and integration tests for new components'
      ],
      excluded: [
        'UI changes to LEO Dashboard',
        'Changes to other handoff types (LEAD→PLAN, PLAN→EXEC)',
        'Test infrastructure changes (Playwright, Vitest configs)',
        'Coverage threshold policy changes'
      ],
      boundaries: [
        'Each child SD goes through full LEAD→PLAN→EXEC',
        'No breaking changes to existing handoffs',
        'SD type exemptions for non-code SDs'
      ]
    }),

    category: 'protocol',
    priority: 'high',
    status: 'draft',

    sd_key: 'SD-LEO-TESTING-GOVERNANCE-001',
    target_application: 'EHG_Engineer',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',

    strategic_intent: 'Strengthen LEO Protocol testing governance by implementing mandatory test validation gates, automated evidence capture, proactive schema documentation, and quantitative retrospective metrics.',

    strategic_objectives: [
      'SO-1: Achieve 100% TESTING sub-agent execution for code-producing SDs',
      'SO-2: Automate test evidence capture with story-test mapping',
      'SO-3: Reduce schema mismatch incidents by 80%',
      'SO-4: Enable quantitative test trend analysis via retrospective metrics'
    ],

    success_criteria: [
      'TESTING enforcement - % of code SDs with TESTING pass: 100%',
      'Evidence capture - story_test_mappings population rate: ≥90%',
      'Schema loading - Preflight displays schema for DB SDs: 100%',
      'Retro metrics - Retrospectives with test_run_id FK: ≥90%',
      'No regressions - Existing handoffs continue to work: 100%'
    ],

    key_changes: [
      'MANDATORY_TESTING_VALIDATION gate in ExecToPlanExecutor',
      'TEST_EVIDENCE_AUTO_CAPTURE gate (advisory)',
      'lib/schema-context-loader.js module',
      'Database migration for retrospective test metrics',
      'RETRO sub-agent modifications for metrics population'
    ],

    key_principles: [
      'Enforcement-first: Block untested code at handoff',
      'Auto-capture: No manual test evidence entry',
      'Proactive context: Schema docs before implementation',
      'Quantitative: Metrics enable trend analysis',
      'Backward compatible: Existing handoffs unaffected'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'ExecToPlanExecutor.js (existing)',
      'test-evidence-ingest.js (existing)',
      'v_sd_test_readiness view (existing)',
      'docs/reference/schema/engineer/ (existing)',
      'phase-preflight.js (existing)',
      'lib/sub-agents/retro.js (existing)'
    ],

    risks: [
      {
        description: 'Existing SDs blocked unexpectedly',
        mitigation: 'SD type exemptions, clear remediation',
        severity: 'medium'
      },
      {
        description: 'Performance impact on handoffs',
        mitigation: 'Lazy loading, caching',
        severity: 'low'
      },
      {
        description: 'Schema doc parsing errors',
        mitigation: 'Graceful fallback, warnings',
        severity: 'low'
      },
      {
        description: 'Migration breaks retrospectives',
        mitigation: 'IF NOT EXISTS, backward compatible',
        severity: 'low'
      }
    ],

    success_metrics: [
      'TESTING execution rate for code SDs: 100%',
      'story_test_mappings population: ≥90%',
      'Schema context display rate: 100% for DB SDs',
      'Retrospective test metrics population: ≥90%',
      'Handoff regression rate: 0%'
    ],

    implementation_guidelines: [
      'Execute in order: A → B → C → D',
      'Child A blocks handoffs - test thoroughly',
      'Child B is advisory - captures evidence without blocking',
      'Child C is standalone - pure context loading',
      'Child D requires migration - test backward compatibility'
    ],

    metadata: {
      origin: 'Retrospective analysis of 27+ protocol improvement suggestions',

      // Evidence statistics
      retrospective_citations: {
        testing_mandate: 16,
        coverage_metrics: 4,
        schema_mismatches: 3
      },

      // Current state statistics
      current_state: {
        sds_without_testing: '14.6% (20/137)',
        schema_mismatch_hours_per_year: '42-95 hours',
        story_test_mappings_count: 0
      },

      // Child SDs
      child_sds: childSDs.map(c => ({
        id: c.id,
        title: c.title,
        priority: c.priority,
        estimated_effort: c.estimated_effort
      })),
      child_count: childSDs.length,

      // Dependency graph
      dependency_graph: {
        'SD-LEO-TESTING-GOVERNANCE-001A': [],
        'SD-LEO-TESTING-GOVERNANCE-001B': ['SD-LEO-TESTING-GOVERNANCE-001A'],
        'SD-LEO-TESTING-GOVERNANCE-001C': ['SD-LEO-TESTING-GOVERNANCE-001B'],
        'SD-LEO-TESTING-GOVERNANCE-001D': ['SD-LEO-TESTING-GOVERNANCE-001C']
      },

      // Execution order
      execution_order: [
        'SD-LEO-TESTING-GOVERNANCE-001A',
        'SD-LEO-TESTING-GOVERNANCE-001B',
        'SD-LEO-TESTING-GOVERNANCE-001C',
        'SD-LEO-TESTING-GOVERNANCE-001D'
      ],

      // Effort summary
      effort_summary: {
        total_hours: '50-65 hours',
        total_loc: '~590 lines',
        by_child: [
          { id: 'SD-LEO-TESTING-GOVERNANCE-001A', hours: '10-15', loc: 80 },
          { id: 'SD-LEO-TESTING-GOVERNANCE-001B', hours: '15-20', loc: 120 },
          { id: 'SD-LEO-TESTING-GOVERNANCE-001C', hours: '10-15', loc: 275 },
          { id: 'SD-LEO-TESTING-GOVERNANCE-001D', hours: '15-20', loc: 115 }
        ]
      },

      // Related documents
      related_documents: [
        '/home/rickf/.claude/plans/optimized-percolating-lynx.md',
        './docs/sd-proposals/SD-LEO-TESTING-GOVERNANCE-001.md',
        './docs/sd-proposals/SD-LEO-TESTING-GOVERNANCE-001A.md',
        './docs/sd-proposals/SD-LEO-TESTING-GOVERNANCE-001B.md',
        './docs/sd-proposals/SD-LEO-TESTING-GOVERNANCE-001C.md',
        './docs/sd-proposals/SD-LEO-TESTING-GOVERNANCE-001D.md'
      ]
    }
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', orchestratorSD.id)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${orchestratorSD.id} already exists. Updating...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(orchestratorSD)
        .eq('id', orchestratorSD.id)
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ SD ${orchestratorSD.id} updated successfully!`);
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(orchestratorSD)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ SD ${orchestratorSD.id} created successfully!`);
    console.log('\n' + '═'.repeat(80));
    console.log('🛡️  LEO PROTOCOL TESTING GOVERNANCE ENHANCEMENT');
    console.log('═'.repeat(80));
    console.log(`ID:       ${data.id}`);
    console.log(`Title:    ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status:   ${data.status}`);
    console.log('═'.repeat(80));

    console.log('\n📊 EVIDENCE BASE:');
    console.log('   • 16 retrospectives cited TESTING mandate');
    console.log('   • 14.6% of SDs completed without TESTING');
    console.log('   • 42-95 hours/year lost to schema mismatches');
    console.log('   • 4 retrospectives requested coverage metrics');

    console.log('\n🎯 STRATEGIC OBJECTIVES:');
    orchestratorSD.strategic_objectives.forEach(obj => {
      console.log(`   • ${obj}`);
    });

    console.log('\n📋 CHILDREN (4 Child SDs):');
    childSDs.forEach((child, i) => {
      console.log(`\n   ${i+1}. [Rank ${child.rank}] ${child.id}`);
      console.log(`      Title: ${child.title}`);
      console.log(`      Priority: ${child.priority.toUpperCase()}`);
      console.log(`      Effort: ${child.estimated_effort}`);
      console.log(`      LOC: ~${child.estimated_loc} lines`);
    });

    console.log('\n📊 SUMMARY:');
    console.log(`   Children: ${childSDs.length}`);
    console.log('   Total effort: 50-65 hours');
    console.log('   Total LOC: ~590 lines');

    console.log('\n🎯 EXECUTION ORDER:');
    orchestratorSD.metadata.execution_order.forEach((id, i) => {
      const child = childSDs.find(c => c.id === id);
      console.log(`   ${i+1}. ${id} (${child.priority})`);
    });

    console.log('\n🚀 Next Steps:');
    console.log('1. Review this orchestrator SD');
    console.log('2. Approve via LEO Protocol LEAD phase');
    console.log('3. Begin with SD-LEO-TESTING-GOVERNANCE-001A (TESTING gate)');
    console.log('4. Each child SD goes through LEAD→PLAN→EXEC');

    return data;

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }
}

// ============================================================================
// CREATE CHILD SDs
// ============================================================================

async function createChildSDs(parentId) {
  console.log('\n' + '═'.repeat(80));
  console.log('📋 CREATING CHILD SDs');
  console.log('═'.repeat(80));

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const child of childSDs) {
    const childSD = {
      id: child.id,
      title: child.title,
      description: child.purpose,
      rationale: `Part of ${parentId} orchestrator. ${child.purpose}`,
      scope: JSON.stringify(child.scope),
      category: 'protocol',
      priority: child.priority,
      status: 'draft',
      sd_key: child.id,
      target_application: 'EHG_Engineer',
      current_phase: 'LEAD',
      sd_type: 'implementation',
      parent_sd_id: parentId,
      strategic_intent: child.purpose,
      strategic_objectives: child.deliverables.slice(0, 5),
      success_criteria: child.success_criteria,
      key_changes: child.deliverables,
      key_principles: [
        'Part of LEO Protocol Testing Governance',
        'Enforcement-first approach',
        'Backward compatible'
      ],
      created_by: 'LEAD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      uuid_id: randomUUID(),
      version: '1.0',
      phase_progress: 0,
      progress: 0,
      is_active: true,
      dependencies: child.dependencies,
      risks: [],
      success_metrics: child.success_criteria,
      implementation_guidelines: [
        `Execution order: ${child.rank} of ${childSDs.length}`,
        `Dependencies: ${child.dependencies.join(', ') || 'None'}`,
        `Blocks: ${child.blocks.join(', ') || 'None'}`,
        `Estimated LOC: ~${child.estimated_loc} lines`
      ],
      metadata: {
        parent_sd: parentId,
        rank: child.rank,
        estimated_effort: child.estimated_effort,
        estimated_loc: child.estimated_loc,
        acceptance_criteria: child.acceptance_criteria,
        deliverables: child.deliverables,
        blocks: child.blocks,
        proposal_document: `./docs/sd-proposals/${child.id}.md`
      }
    };

    try {
      // Check if child SD already exists
      const { data: existing } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('id', child.id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .update(childSD)
          .eq('id', child.id);

        if (error) throw error;
        console.log(`   ⚠️  Updated: ${child.id}`);
        updated++;
      } else {
        const { error } = await supabase
          .from('strategic_directives_v2')
          .insert(childSD);

        if (error) throw error;
        console.log(`   ✅ Created: ${child.id}`);
        created++;
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${child.id} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`📊 Child SD Summary: ${created} created, ${updated} updated, ${failed} failed`);

  return { created, updated, failed };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═'.repeat(80));
  console.log('🛡️  LEO PROTOCOL TESTING GOVERNANCE - SD CREATION');
  console.log('═'.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  // Create orchestrator
  const orchestrator = await createTestingGovernanceOrchestrator();

  // Create children
  const childResults = await createChildSDs(orchestrator.id);

  console.log('\n' + '═'.repeat(80));
  console.log('🎉 CREATION COMPLETE');
  console.log('═'.repeat(80));
  console.log(`Orchestrator: ${orchestrator.id}`);
  console.log(`Children: ${childResults.created + childResults.updated} successful`);
  console.log(`Total SDs: ${1 + childSDs.length}`);
  console.log('');
  console.log('Next: Run LEO Protocol LEAD phase for approval');
  console.log('Command: npm run sd:next');
}

// Run if executed directly
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
