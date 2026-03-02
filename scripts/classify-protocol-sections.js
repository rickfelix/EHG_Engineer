#!/usr/bin/env node
/**
 * Classify 69 protocol sections into context tiers
 * ROUTER, CORE, PHASE_LEAD, PHASE_PLAN, PHASE_EXEC, REFERENCE
 */

import dotenv from 'dotenv';
import { createDatabaseClient } from './lib/supabase-connection.js';

dotenv.config();

// Classification mapping based on analysis
const CLASSIFICATION_MAP = {
  // CORE tier (9 sections) - Essential for all sessions
  CORE: {
    target_file: 'CLAUDE_CORE.md',
    sections: [
      'session_prologue',
      'application_architecture',
      'execution_philosophy',
      'git_commit_guidelines',
      'communication_context',
      'quick_reference',
      'development_workflow',
      'database',
      'parallel_execution'
    ]
  },

  // PHASE_LEAD tier (8 sections) - LEAD operations
  PHASE_LEAD: {
    target_file: 'CLAUDE_LEAD.md',
    sections: [
      'lead_operations',
      'directive_submission_review',
      'process', // over-engineering evaluation
      'simplicity_first_enforcement',
      'lead_pre_approval_simplicity_gate',
      'lead_code_review_requirement',
      'sd_evaluation',
      'PHASE_4_VERIFICATION' // stubbed code detection for LEAD approval
    ]
  },

  // PHASE_PLAN tier (10 sections) - PLAN operations
  PHASE_PLAN: {
    target_file: 'CLAUDE_PLAN.md',
    sections: [
      'plan_pre_exec_checklist',
      'testing_tier_strategy',
      'plan_cicd_verification',
      'exec_component_sizing_guidelines',
      'bmad_enhancements',
      'multi_application_testing_architecture',
      'qa_engineering_enhanced',
      'pr_size_guidelines',
      'database_migration_validation',
      'context_management_upfront'
    ]
  },

  // PHASE_EXEC tier (8 sections) - EXEC operations
  PHASE_EXEC: {
    target_file: 'CLAUDE_EXEC.md',
    sections: [
      'exec_implementation_requirements',
      'exec_dual_test_requirement',
      'exec_todo_comment_standard',
      'strategic_directive_execution_protocol',
      'five_phase_workflow',
      'testing_tier_strategy_updated',
      'testing_tools', // Playwright MCP
      'subagent_parallel_execution'
    ]
  },

  // REFERENCE tier (33+ sections) - Detailed patterns, load on demand
  REFERENCE: {
    target_file: 'docs/reference/*.md',
    patterns: [
      'quick-reference', // All quick-reference sections
      'guide', // Various guides
      'best_practices',
      'sub_agents', // Native sub-agent integration
      'unified_handoff_system',
      'database_schema_overview',
      'supabase_operations',
      'e2e_testing_mode_configuration',
      'handoff-rls-bypass-pattern',
      'retrospective-schema-reference',
      'trigger-disable-pattern',
      'context_monitoring',
      'database_query_best_practices',
      'sub_agent_compression',
      'database_first_enforcement_expanded',
      'documentation_platform',
      'file_warning',
      'agents',
      'handoffs',
      'subagents'
    ]
  }
};

async function classifySections() {
  console.log('🔄 Classifying 69 protocol sections into context tiers...\n');

  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true });

    // Get all sections
    const { rows: sections } = await client.query(
      'SELECT id, section_type, title FROM leo_protocol_sections ORDER BY order_index'
    );

    console.log(`Found ${sections.length} sections to classify\n`);

    let stats = {
      CORE: 0,
      PHASE_LEAD: 0,
      PHASE_PLAN: 0,
      PHASE_EXEC: 0,
      REFERENCE: 0,
      UNCLASSIFIED: 0
    };

    // Classify each section
    for (const section of sections) {
      let tier = null;
      let targetFile = null;

      // Check CORE
      if (CLASSIFICATION_MAP.CORE.sections.includes(section.section_type)) {
        tier = 'CORE';
        targetFile = CLASSIFICATION_MAP.CORE.target_file;
      }
      // Check PHASE_LEAD
      else if (CLASSIFICATION_MAP.PHASE_LEAD.sections.includes(section.section_type)) {
        tier = 'PHASE_LEAD';
        targetFile = CLASSIFICATION_MAP.PHASE_LEAD.target_file;
      }
      // Check PHASE_PLAN
      else if (CLASSIFICATION_MAP.PHASE_PLAN.sections.includes(section.section_type)) {
        tier = 'PHASE_PLAN';
        targetFile = CLASSIFICATION_MAP.PHASE_PLAN.target_file;
      }
      // Check PHASE_EXEC
      else if (CLASSIFICATION_MAP.PHASE_EXEC.sections.includes(section.section_type)) {
        tier = 'PHASE_EXEC';
        targetFile = CLASSIFICATION_MAP.PHASE_EXEC.target_file;
      }
      // Check REFERENCE (patterns match)
      else {
        // Check if section_type matches any REFERENCE pattern
        const isReference = CLASSIFICATION_MAP.REFERENCE.patterns.some(pattern =>
          section.section_type.includes(pattern) || pattern.includes(section.section_type)
        );

        if (isReference) {
          tier = 'REFERENCE';
          // Create specific target file based on section type
          const cleanType = section.section_type.replace(/_/g, '-');
          targetFile = `docs/reference/${cleanType}.md`;
        }
      }

      // Update section with classification
      if (tier) {
        await client.query(
          'UPDATE leo_protocol_sections SET context_tier = $1, target_file = $2 WHERE id = $3',
          [tier, targetFile, section.id]
        );

        stats[tier]++;
        console.log(`✓ ${tier.padEnd(12)} | ${section.section_type.padEnd(40)} → ${targetFile}`);
      } else {
        stats.UNCLASSIFIED++;
        console.log(`⚠ UNCLASSIFIED | ${section.section_type.padEnd(40)} → NEEDS MANUAL REVIEW`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Classification Summary:');
    console.log('='.repeat(80));
    console.log(`   CORE:         ${stats.CORE} sections → CLAUDE_CORE.md`);
    console.log(`   PHASE_LEAD:   ${stats.PHASE_LEAD} sections → CLAUDE_LEAD.md`);
    console.log(`   PHASE_PLAN:   ${stats.PHASE_PLAN} sections → CLAUDE_PLAN.md`);
    console.log(`   PHASE_EXEC:   ${stats.PHASE_EXEC} sections → CLAUDE_EXEC.md`);
    console.log(`   REFERENCE:    ${stats.REFERENCE} sections → docs/reference/*.md`);
    if (stats.UNCLASSIFIED > 0) {
      console.log(`   ⚠ UNCLASSIFIED: ${stats.UNCLASSIFIED} sections → NEED MANUAL REVIEW`);
    }
    console.log('='.repeat(80));

    const total = stats.CORE + stats.PHASE_LEAD + stats.PHASE_PLAN + stats.PHASE_EXEC + stats.REFERENCE;
    console.log(`\n✅ Classified ${total} of ${sections.length} sections successfully!`);

    if (stats.UNCLASSIFIED > 0) {
      console.log('\n⚠️  Some sections need manual classification. Review and update manually.');
    }

  } catch (error) {
    console.error('❌ Error classifying sections:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  classifySections()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { classifySections };
