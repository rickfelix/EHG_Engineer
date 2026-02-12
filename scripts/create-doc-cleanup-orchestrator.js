#!/usr/bin/env node

/**
 * Creates the Documentation Organizational Cleanup Orchestrator SD
 * with 7 child SDs for each phase of the cleanup plan.
 *
 * UPDATED: Now uses child-sd-template.js for proper field inheritance
 * This ensures all children have required strategic fields populated.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { inheritStrategicFields, inferSDType } from './modules/child-sd-template.js';
import { enrichChildrenFromPlan } from './modules/plan-to-children-enricher.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createOrchestrator() {
  const parentId = 'SD-LEO-DOC-CLEANUP-001';

  console.log('Creating Documentation Cleanup Orchestrator SD...\n');

  // Create parent orchestrator
  const { data: _parent, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .upsert({
      id: parentId,
      sd_key: parentId, // Same as id
      title: 'Documentation Organizational Assessment & Cleanup',
      sd_type: 'orchestrator',
      category: 'documentation', // Legacy field - deprecated but still required
      status: 'draft',
      current_phase: 'LEAD_APPROVAL',
      priority: 'high',
      description: 'Comprehensive assessment and reorganization of 2,516 documentation files across 58 folders. Current health score: 45/100. Target: >90/100. Includes rubric development, automated cleanup, protocol enhancement, and continuous monitoring setup.',
      strategic_intent: 'Create a well-organized, maintainable documentation structure with clear placement rubrics, automated enforcement, and continuous monitoring to prevent documentation debt accumulation.',
      scope: 'All markdown files in docs/, root directory, and prohibited locations (src/, lib/, scripts/, tests/). Excludes CLAUDE*.md and README.md at root.',
      rationale: 'Documentation has grown organically to 2,516 files with significant organizational issues: 48 files at root, 72 files in prohibited locations, 38+ duplicate database docs, 18+ duplicate testing docs, ~1000+ files missing metadata, and inconsistent naming conventions.',
      key_changes: JSON.stringify([
        { change: 'Create unambiguous file placement rubric', impact: 'Clear decision tree for where every file type belongs' },
        { change: 'Consolidate database docs (38+ → 8)', impact: 'Single source of truth for database documentation' },
        { change: 'Consolidate testing docs (18+ → 6)', impact: 'Unified testing documentation' },
        { change: 'Rename numeric-prefixed files to kebab-case', impact: 'Consistent naming convention across all docs' },
        { change: 'Add enforcement rules to protocol', impact: 'Pre-commit hooks and CI/CD validation prevent drift' },
        { change: 'Inject metadata into ~1000+ files', impact: '100% metadata compliance' }
      ]),
      success_criteria: JSON.stringify([
        { criterion: 'Health score', measure: '>90/100 (from 45/100)' },
        { criterion: 'Files in root', measure: '≤10 (from 53)' },
        { criterion: 'Files in prohibited locations', measure: '0 (from 72)' },
        { criterion: 'Folder count', measure: '~25 (from 58)' },
        { criterion: 'Metadata compliance', measure: '100% (from ~40%)' },
        { criterion: 'Broken links', measure: '0' }
      ]),
      dependencies: JSON.stringify([]),
      risks: JSON.stringify([
        { risk: 'Broken links after file moves', severity: 'medium', mitigation: 'Automated link validation and repair script' },
        { risk: 'Lost content during consolidation', severity: 'low', mitigation: 'Archive originals before merging' },
        { risk: 'Git conflicts from bulk moves', severity: 'low', mitigation: 'Separate commits per phase' }
      ]),
      is_active: true,
      progress_percentage: 0,
      created_by: 'LEAD',
      metadata: JSON.stringify({
        is_orchestrator: true,
        pattern_type: 'orchestrator',
        plan_file: 'docs/planning/documentation-cleanup-master-plan.md',
        assessment_date: '2026-01-26',
        initial_health_score: 45,
        target_health_score: 90,
        total_files: 2516,
        total_folders: 58
      })
    }, { onConflict: 'id' })
    .select();

  if (parentError) {
    console.error('Error creating parent:', parentError.message);
    return;
  }
  console.log('✅ Created orchestrator:', parentId);

  // Create parent context object for template inheritance
  // (The upsert result may not have parsed JSON, so we construct it explicitly)
  const parentContext = {
    id: parentId,
    title: 'Documentation Organizational Assessment & Cleanup',
    description: 'Comprehensive assessment and reorganization of documentation files.',
    strategic_objectives: [
      'Create a well-organized, maintainable documentation structure',
      'Establish automated enforcement to prevent documentation debt'
    ],
    key_principles: [
      'Decision tree approach eliminates file placement ambiguity',
      'Automated validation prevents drift from standards',
      'Archive before delete - no content loss'
    ],
    success_criteria: [
      { criterion: 'Health score', measure: '>90/100 (from 45/100)' },
      { criterion: 'Files in root', measure: '≤10 (from 53)' },
      { criterion: 'Metadata compliance', measure: '100% (from ~40%)' }
    ],
    risks: [
      { risk: 'Broken links after file moves', severity: 'medium', mitigation: 'Automated link validation' },
      { risk: 'Lost content during consolidation', severity: 'low', mitigation: 'Archive originals first' }
    ]
  };

  // Define children
  const children = [
    {
      id: 'SD-LEO-DOC-CLEANUP-001-A',
      title: 'Discovery & Rubric Development',
      sd_type: 'documentation',
      description: 'Create file placement rubric decision tree, duplicate detection script, metadata validation script, and initial assessment reports.',
      scope: 'Create scripts: validate-doc-location.js, validate-doc-metadata.js, validate-doc-naming.js, detect-duplicate-docs.js. Create detailed rubric in DOCUMENTATION_STANDARDS.md.',
      key_changes: [
        { change: 'Create file placement decision tree', impact: 'Unambiguous guidance for all file types' },
        { change: 'Create validation scripts', impact: 'Automated compliance checking' },
        { change: 'Create duplicate detection algorithm', impact: 'Identify consolidation candidates' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-B',
      title: 'Root & Prohibited Location Cleanup',
      sd_type: 'infrastructure',
      description: 'Move 48 files from root directory and 72 files from prohibited locations (src/, lib/, scripts/, tests/) to correct docs/ locations using placement rubric.',
      scope: 'Create cleanup-root-docs.js, cleanup-prohibited-locations.js. Execute dry-run, review, then execute actual moves. Update cross-references.',
      key_changes: [
        { change: 'Move 48 files from root', impact: 'Root directory contains only CLAUDE*.md and README.md' },
        { change: 'Move 72 files from prohibited locations', impact: 'No documentation in src/, lib/, scripts/, tests/' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-C',
      title: 'Database & Testing Documentation Consolidation',
      sd_type: 'documentation',
      description: 'Consolidate 38+ database documentation files to 8 canonical files. Consolidate 18+ testing documentation files to 6 canonical files. Archive duplicates.',
      scope: 'Create consolidate-database-docs.js, consolidate-testing-docs.js. Merge content intelligently, archive originals, update cross-references.',
      key_changes: [
        { change: 'Consolidate database docs (38+ → 8)', impact: 'Single source of truth per database topic' },
        { change: 'Consolidate testing docs (18+ → 6)', impact: 'Unified testing documentation structure' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-D',
      title: 'Naming & Folder Rationalization',
      sd_type: 'infrastructure',
      description: 'Rename 30+ numeric-prefixed files to kebab-case. Merge duplicate folders (architecture/, strategic-directives/). Create sub-categorization for large folders. Reduce folder count from 58 to ~25.',
      scope: 'Create rename-numeric-prefixed-files.js. Merge duplicate folders. Create sub-folders for reference/, guides/, 04_features/. Consolidate underutilized folders (<5 files).',
      key_changes: [
        { change: 'Rename numeric-prefixed files to kebab-case', impact: 'Consistent naming convention' },
        { change: 'Merge duplicate folders', impact: 'Single location per content type' },
        { change: 'Create sub-categorization', impact: 'Navigable structure for large folders' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-E',
      title: 'Metadata Injection & Link Validation',
      sd_type: 'infrastructure',
      description: 'Inject metadata headers into ~1000+ files missing them. Validate and repair all cross-references broken by file moves.',
      scope: 'Create inject-doc-metadata.js, validate-doc-links.js. Auto-detect category and tags from content. Auto-fix broken links where new location is known.',
      key_changes: [
        { change: 'Inject metadata into ~1000+ files', impact: '100% metadata compliance' },
        { change: 'Validate and repair cross-references', impact: '0 broken links' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-F',
      title: 'Protocol Enhancement',
      sd_type: 'documentation',
      description: 'Update DOCUMENTATION_STANDARDS.md with: enforcement rules, sub-categorization guidance, formalized metadata requirements, and cleanup procedures. Update /document command.',
      scope: 'Add sections 7-9 to DOCUMENTATION_STANDARDS.md. Create pre-commit hook. Update .claude/commands/document.md with new validation steps.',
      key_changes: [
        { change: 'Add enforcement rules', impact: 'Pre-commit hooks prevent violations' },
        { change: 'Add sub-categorization guidance', impact: 'Clear thresholds for when to create sub-folders' },
        { change: 'Formalize metadata requirements', impact: 'Strict validation, auto-generation tools' },
        { change: 'Add cleanup procedures', impact: 'Archive policies, obsolescence criteria' }
      ]
    },
    {
      id: 'SD-LEO-DOC-CLEANUP-001-G',
      title: 'Monitoring & Automation Setup',
      sd_type: 'infrastructure',
      description: 'Create documentation health dashboard, GitHub Actions CI/CD validation workflow, and enhanced DOCMON automation for continuous monitoring.',
      scope: 'Create doc-health-report.js. Create .github/workflows/doc-validation.yml. Update scripts/docmon-automated-audit.js with auto-remediation.',
      key_changes: [
        { change: 'Create health dashboard', impact: 'Weekly automated health reports' },
        { change: 'Create CI/CD validation', impact: 'PRs blocked on documentation violations' },
        { change: 'Enhanced DOCMON automation', impact: 'Auto-remediation of simple violations' }
      ]
    }
  ];

  // Create children using proper template inheritance
  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Use template to inherit strategic fields from parent
    const inherited = inheritStrategicFields(parentContext, {
      phaseNumber: i + 1,
      phaseTitle: child.title,
      phaseObjective: child.description.split('.')[0]
    });

    // Infer SD type from title/scope
    const typeInference = inferSDType(child.title, child.scope, child.description);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: child.id,
        sd_key: child.id, // Same as id
        title: child.title,
        sd_type: child.sd_type || typeInference.sdType,
        category: child.sd_type === 'documentation' ? 'documentation' : 'infrastructure', // Legacy field
        status: 'draft',
        current_phase: 'LEAD_APPROVAL',
        priority: 'high',
        parent_sd_id: parentId,
        description: child.description,
        scope: child.scope,
        rationale: 'Part of Documentation Organizational Assessment & Cleanup orchestrator. See parent SD: ' + parentId,
        strategic_intent: child.description.split('.')[0] + '.',
        key_changes: JSON.stringify(child.key_changes),
        // Use inherited strategic fields from template
        strategic_objectives: inherited.strategic_objectives,
        key_principles: inherited.key_principles,
        success_criteria: inherited.success_criteria,
        risks: inherited.risks,
        dependencies: i > 0 ? JSON.stringify([{ dependency: children[i-1].id, type: 'technical', status: 'ready' }]) : JSON.stringify([]),
        is_active: true,
        progress_percentage: 0,
        created_by: 'LEAD',
        sequence_rank: i + 1,
        metadata: JSON.stringify({
          parent_orchestrator: parentId,
          child_index: i + 1,
          total_children: children.length,
          sd_type_inference: typeInference,
          strategic_fields_source: 'child-sd-template'
        })
      }, { onConflict: 'id' });

    if (error) {
      console.error('Error creating child ' + child.id + ':', error.message);
    } else {
      console.log('  ✅ Created child ' + (i+1) + '/' + children.length + ': ' + child.id + ' (' + child.sd_type + ')');
    }
  }

  // CRITICAL: Enrich children with detailed scope from the plan file
  // This prevents the common issue where children have generic scopes
  // that don't include the specific details from the master plan.
  console.log('\n📄 Enriching children with plan details...');

  const planPath = 'docs/planning/documentation-cleanup-master-plan.md';
  const childMapping = [
    { childId: 'SD-LEO-DOC-CLEANUP-001-A', sectionPattern: /Phase 1|Discovery.*Rubric/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-B', sectionPattern: /Phase 2\.1|Phase 2\.2|Root.*Cleanup|Prohibited.*Location/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-C', sectionPattern: /Phase 2\.3|Phase 2\.4|Database.*Consolidation|Testing.*Consolidation/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-D', sectionPattern: /Phase 2\.5|Phase 2\.6|Numeric.*Prefix|Folder.*Rationalization/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-E', sectionPattern: /Phase 2\.7|Phase 2\.8|Metadata.*Injection|Link.*Validation/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-F', sectionPattern: /Phase 3|Protocol.*Enhancement/i },
    { childId: 'SD-LEO-DOC-CLEANUP-001-G', sectionPattern: /Phase 4|Monitoring.*Automation/i }
  ];

  const enrichResult = await enrichChildrenFromPlan(planPath, childMapping);
  console.log(`  ✅ Enriched ${enrichResult.success.length} children with plan details`);
  if (enrichResult.failed.length > 0) {
    console.log(`  ⚠️  Failed to enrich ${enrichResult.failed.length} children`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 Orchestrator SD Created Successfully');
  console.log('='.repeat(60));
  console.log('\nParent: ' + parentId);
  console.log('Title: Documentation Organizational Assessment & Cleanup');
  console.log('Children: ' + children.length);
  console.log('Plan: ' + planPath);
  console.log('\nChild SDs (enriched with plan details):');
  children.forEach((c, i) => {
    console.log('  ' + String.fromCharCode(65 + i) + '. ' + c.id + ' - ' + c.title);
  });
  console.log('\nNext: Run LEAD approval workflow');
  console.log('  Read CLAUDE_LEAD.md for orchestrator approval workflow');
}

createOrchestrator().catch(console.error);
