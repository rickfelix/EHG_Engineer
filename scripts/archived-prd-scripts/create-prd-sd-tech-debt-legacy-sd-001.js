#!/usr/bin/env node

/**
 * PRD Creation Script for SD-TECH-DEBT-LEGACY-SD-001
 * Investigation: Legacy strategic_directives Table Cleanup
 *
 * This PRD documents the completed investigation findings.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_KEY = 'SD-TECH-DEBT-LEGACY-SD-001';
const PRD_TITLE = 'Investigation Report: Legacy strategic_directives Table Dependencies';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_KEY}`);
  console.log('='.repeat(70));

  // Fetch SD using sd_key or legacy_id
  console.log('\n1️⃣  Fetching Strategic Directive...');
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, category, priority, exploration_summary')
    .or(`sd_key.eq.${SD_KEY},legacy_id.eq.${SD_KEY}`)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_KEY} not found`);
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   UUID: ${sdData.id}`);
  console.log(`   Key: ${sdData.sd_key}`);

  // Build PRD with investigation findings
  console.log('\n2️⃣  Building PRD with investigation findings...');

  const prdId = `PRD-${SD_KEY}`;
  const exploration = sdData.exploration_summary || {};

  const prdData = {
    id: prdId,
    sd_id: sdData.id,           // Use actual UUID
    directive_id: sdData.id,    // Backward compatibility

    title: PRD_TITLE,
    version: '1.0',
    status: 'approved',         // Investigation complete
    category: 'infrastructure',
    priority: 'low',

    executive_summary: `
## Investigation Complete

This PRD documents the dependency audit of the legacy \`strategic_directives\` table (non-v2).

### Key Findings
- **2 active code files** require migration before table deprecation
- **1 GitHub workflow** needs update
- **5 utility scripts** are safe to remove
- **Risk Level**: MEDIUM-HIGH if table dropped without code migration

### Recommendation
Fix the 2 active code paths and 1 workflow before any table deprecation. The migration effort is small (~30 min) but critical to prevent silent failures.
    `.trim(),

    business_context: `
## Technical Debt Context

The system migrated to \`strategic_directives_v2\` as the primary SD table. The old \`strategic_directives\` table creates:
- Maintenance confusion (similarly named tables)
- Risk of queries hitting wrong table
- Orphaned infrastructure consuming resources

## Business Value
Cleanup enables:
- Clearer codebase for future development
- Reduced confusion for developers
- Smaller schema surface area
    `.trim(),

    technical_context: `
## Tables Involved
- \`strategic_directives\` (legacy, to be deprecated)
- \`strategic_directives_v2\` (current, active)

## Investigation Scope
1. Script dependencies (grep for .from('strategic_directives'))
2. SQL file references (migrations, schema, views, functions)
3. RLS policy references
4. Application code queries
5. GitHub workflows

## Files Explored (8 total)
${(exploration.files_explored || []).map(f => `- ${f}`).join('\n')}
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Audit all script dependencies on legacy table',
        description: 'Search all JavaScript files for queries to strategic_directives (non-v2)',
        priority: 'CRITICAL',
        status: 'COMPLETE',
        acceptance_criteria: [
          'All scripts with .from("strategic_directives") identified',
          'Each reference categorized as active/legacy/test'
        ],
        findings: exploration.key_findings?.active_code_requiring_migration || []
      },
      {
        id: 'FR-2',
        requirement: 'Audit SQL file references',
        description: 'Check migrations, schema files, views, and functions for table references',
        priority: 'HIGH',
        status: 'COMPLETE',
        acceptance_criteria: [
          'All SQL files with table references identified',
          'Migration impact assessed'
        ],
        findings: exploration.key_findings?.schema_files || []
      },
      {
        id: 'FR-3',
        requirement: 'Document cleanup recommendation',
        description: 'Provide clear guidance on whether to drop, archive, or migrate',
        priority: 'HIGH',
        status: 'COMPLETE',
        acceptance_criteria: [
          'Risk assessment for each option',
          'Migration steps if applicable',
          'Rollback plan documented'
        ],
        recommendation: exploration.recommendation || 'Fix active code before deprecation'
      }
    ],

    non_functional_requirements: [
      {
        type: 'safety',
        requirement: 'No production data loss',
        target_metric: 'Investigation only - no destructive changes'
      },
      {
        type: 'documentation',
        requirement: 'Complete dependency audit',
        target_metric: 'All references documented with risk levels'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Comprehensive grep search',
        details: 'Search patterns: .from("strategic_directives"), strategic_directives[^_v]'
      }
    ],

    // Test scenarios (investigation verification)
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Verify all dependencies documented',
        type: 'verification',
        steps: ['Run grep for table references', 'Compare to documented list'],
        expected_result: 'All references accounted for'
      }
    ],

    acceptance_criteria: [
      'All script dependencies identified and categorized',
      'All SQL file references documented',
      'Risk assessment completed for each dependency',
      'Cleanup recommendation provided with migration steps',
      'Active code paths identified with specific file:line references'
    ],

    risks: [
      {
        risk: 'Missed dependency causes production failure',
        likelihood: 'LOW',
        impact: 'HIGH',
        mitigation: 'Comprehensive grep search + manual code review',
        status: 'MITIGATED'
      },
      {
        risk: 'Scope creep into actual cleanup',
        likelihood: 'MEDIUM',
        impact: 'LOW',
        mitigation: 'Explicit scope: investigation only',
        status: 'CONTROLLED'
      }
    ],

    // Investigation results metadata
    metadata: {
      investigation_complete: true,
      exploration_files_count: (exploration.files_explored || []).length,
      active_dependencies: {
        scripts: exploration.key_findings?.active_code_requiring_migration || [],
        safe_to_remove: exploration.key_findings?.utility_scripts_safe_to_remove || []
      },
      deliverables: [
        { id: 'D-1', title: 'Dependency Audit Report', status: 'COMPLETE', location: 'SD exploration_summary field' },
        { id: 'D-2', title: 'Risk Assessment', status: 'COMPLETE', assessment: exploration.risk_assessment || 'MEDIUM-HIGH' },
        { id: 'D-3', title: 'Cleanup Recommendation', status: 'COMPLETE', recommendation: 'Fix 2 active code files + 1 workflow, then safe to deprecate table' }
      ],
      recommendation: exploration.recommendation,
      risk_assessment: exploration.risk_assessment,
      next_steps: [
        'Create follow-up SD for actual cleanup if desired',
        'Fix scripts/create-handoff-retrospective.js:96',
        'Fix .github/workflows/sd-completion-check.yml:143'
      ]
    }
  };

  // Check for existing PRD
  console.log('\n3️⃣  Checking for existing PRD...');
  const { data: existingPrd } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', prdId)
    .single();

  if (existingPrd) {
    console.log('⚠️  PRD already exists, updating...');
    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update(prdData)
      .eq('id', prdId);

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      process.exit(1);
    }
    console.log('✅ PRD updated successfully');
  } else {
    console.log('📝 Creating new PRD...');
    const { error: insertError } = await supabase
      .from('product_requirements_v2')
      .insert(prdData);

    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      process.exit(1);
    }
    console.log('✅ PRD created successfully');
  }

  console.log(`\n✅ PRD ${prdId} ready`);
  console.log('\n📝 Investigation Summary:');
  console.log('   Files explored:', (exploration.files_explored || []).length);
  console.log('   Active code to fix:', (exploration.key_findings?.active_code_requiring_migration || []).length);
  console.log('   Risk assessment:', exploration.risk_assessment || 'N/A');
  console.log('   Recommendation:', exploration.recommendation || 'N/A');

  console.log('\n🎯 Next Steps:');
  console.log('   1. Review PRD in database');
  console.log('   2. Since investigation is complete, run PLAN-TO-LEAD for final approval');
  console.log('   3. Or create cleanup SD: SD-TECH-DEBT-LEGACY-SD-CLEANUP-001');
}

createPRD().catch(console.error);
