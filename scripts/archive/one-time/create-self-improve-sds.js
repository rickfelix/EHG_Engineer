#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Common principle for all SDs
  const commonPrinciples = [
    { principle: 'Systematic Improvement', description: 'Use data-driven processes for all improvement decisions' },
    { principle: 'Database-First', description: 'All schemas defined before implementation' },
    { principle: 'Constitution-Based', description: 'All agents use AEGIS constitution enforcement' }
  ];

  // Parent Orchestrator
  const parent = {
    id: 'SD-LEO-SELF-IMPROVE-001',
    sd_key: 'SD-LEO-SELF-IMPROVE-001',
    sd_code_user_facing: 'SD-LEO-SELF-IMPROVE-001',
    title: 'Self-Improving LEO Protocol - Orchestrator',
    sd_type: 'orchestrator',
    category: 'infrastructure',
    priority: 'high',
    target_application: 'EHG_Engineer',
    description: 'Coordinates the implementation of a closed-loop self-improvement system for LEO Protocol. This orchestrator manages 13 child SDs corresponding to each implementation phase.',
    rationale: 'Enable LEO Protocol to systematically discover, prioritize, and execute its own improvements through feedback analysis, vetting, prioritization, and self-audit mechanisms.',
    scope: 'Includes all 13 implementation phases from Phase 0 (infrastructure verification) through Phase 7b (observability). Orchestrates sequential execution with defined dependencies.',
    success_criteria: [
      { criterion: 'All 13 child SDs complete', measure: '13/13 children marked COMPLETED' },
      { criterion: 'Full pipeline runs end-to-end', measure: 'Smoke test feedback → proposal → prioritization → execution' },
      { criterion: 'MTTI tracked', measure: 'MTTI metric < 24 hours target achieved' }
    ],
    success_metrics: [
      { metric: 'Child SD completion rate', target: '100%', actual: 'TBD' },
      { metric: 'Pipeline integration test pass rate', target: '100%', actual: 'TBD' },
      { metric: 'Mean Time To Improvement (MTTI)', target: '<24 hours', actual: 'TBD' }
    ],
    key_principles: commonPrinciples,
    status: 'draft',
    current_phase: 'LEAD_APPROVAL',
    is_active: true,
    progress: 0,
    progress_percentage: 0,
    phase_progress: 0,
    parent_sd_id: null,
    relationship_type: 'parent',
    sequence_rank: 1
  };

  console.log('Creating parent orchestrator...');
  const { data: parentData, error: parentError} = await supabase
    .from('strategic_directives_v2')
    .insert(parent)
    .select()
    .single();

  if (parentError) {
    console.error('❌ Error creating parent:', parentError.message);
    process.exit(1);
  }

  console.log('✅ Created parent orchestrator:', parentData.id);

  // Child SDs with proper structure
  const children = [
    {
      id: 'SD-LEO-SELF-IMPROVE-001A',
      sd_key: 'SD-LEO-SELF-IMPROVE-001A',
      sd_code_user_facing: 'SD-LEO-SELF-IMPROVE-001A',
      title: 'Phase 0: Verify Existing Infrastructure',
      sd_type: 'infrastructure',
      category: 'infrastructure',
      priority: 'high',
      target_application: 'EHG_Engineer',
      description: 'Verify issue_patterns integration, AEGIS enforcement, rate limiting (CONST-007), document current /learn and /leo assist capabilities, create dependency graph, add version check to session_prologue, add pre-commit hook rejecting edits to CLAUDE*.md files.',
      rationale: 'Establish baseline understanding of existing infrastructure before adding new self-improvement capabilities.',
      scope: 'Infrastructure verification only - no new features. Deliverables: evidence report, dependency map, pre-commit hook.',
      success_criteria: [
        { criterion: 'Evidence report proves AEGIS coverage', measure: 'All 11 constitution rules verified active' },
        { criterion: 'Rate limit enforcement verified', measure: 'Rate limit tests pass for CONST-007' },
        { criterion: 'Dependency map complete', measure: 'Dependency graph generated and documented' }
      ],
      success_metrics: [
        { metric: 'AEGIS rule coverage', target: '100%', actual: 'TBD' },
        { metric: 'Documentation completeness', target: '100%', actual: 'TBD' }
      ],
      key_principles: commonPrinciples,
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      is_active: true,
      progress: 0,
      progress_percentage: 0,
      phase_progress: 0,
      parent_sd_id: 'SD-LEO-SELF-IMPROVE-001',
      relationship_type: 'child',
      sequence_rank: 2
    }
    // Additional children will be added in batches
  ];

  // Create first child as test
  console.log('\nCreating child SD 001A...');
  const { data: childData, error: childError } = await supabase
    .from('strategic_directives_v2')
    .insert(children[0])
    .select()
    .single();

  if (childError) {
    console.error('❌ Error creating child:', childError.message);
    process.exit(1);
  }

  console.log('✅ Created child SD:', childData.id);
  console.log('\n✅ Test successful - parent and first child created');
  console.log('\nNext step: Create remaining 12 children using same pattern');
})();
