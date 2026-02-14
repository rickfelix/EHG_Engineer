#!/usr/bin/env node
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const retro = {
  sd_id: '564859d2-d730-4cf1-96c1-12f2966c5a64',
  retro_type: 'SD_COMPLETION',
  retrospective_type: 'SD_COMPLETION',
  title: 'Stories Sub-Agent Quality Gate Alignment: Wire Auto-Validation Into Handoff Pipeline',
  description: 'Retrospective for SD-LEO-FIX-STORIES-SUB-AGENT-001. Wired two standalone scripts (story auto-validation, E2E test mapping) into the EXEC-TO-PLAN gate pipeline as advisory gates. Fixed heuristicTypes/CATEGORY_THRESHOLDS divergence. Deleted 321-line duplicate script.',
  conducted_date: '2026-02-13',
  generated_by: 'MANUAL',
  auto_generated: false,
  status: 'PUBLISHED',
  target_application: 'EHG',
  learning_category: 'PROCESS_IMPROVEMENT',
  applies_to_all_apps: false,

  what_went_well: [
    'STORY_AUTO_VALIDATION gate successfully wraps existing auto-validate script into gate pipeline with proper parameter injection',
    'E2E_TEST_MAPPING gate correctly skips lightweight SD types (infrastructure, documentation) - avoids false negatives',
    'Identified and deleted 321-line duplicate script (map-e2e-tests-to-user-stories.mjs) - reduces maintenance surface',
    'heuristicTypes array aligned to CATEGORY_THRESHOLDS keys - 6 phantom types removed, 8 real types added',
    'Refactored auto-validate script from CLI-only (process.exit at top level) to importable library with parameterized entry point',
    'Both gates are non-blocking advisory (required: false) - captures validation signal without blocking handoff flow'
  ],

  what_needs_improvement: [
    'Scripts created as standalone CLI tools had no automated check for pipeline registration - integration gap existed silently',
    'heuristicTypes and CATEGORY_THRESHOLDS defined validation type names independently with no shared constant - divergence accumulated over time',
    'process.exit(1) at module top level in auto-validate script prevented import - Windows ESM entry point anti-pattern'
  ],

  success_patterns: [
    'Advisory gates (required: false) capture signal without blocking - safe integration pattern for new quality checks',
    'Wrapping existing scripts into gate pipeline reuses proven logic without rewrite',
    'Deleting duplicate scripts when canonical version exists reduces maintenance burden',
    'Aligning type constants to a single source of truth prevents silent threshold fallthrough'
  ],

  failure_patterns: [
    'Standalone CLI scripts with top-level process.exit() cannot be imported as libraries - must parameterize and guard entry point',
    'Two files defining the same concept (validation type names) independently will diverge over time without shared constants',
    'Scripts created outside the gate pipeline have no registration completeness check - integration gaps are invisible until manually discovered'
  ],

  key_learnings: [
    {
      category: 'INTEGRATION_PATTERN',
      learning: 'When creating scripts that perform validation, always register them in the relevant gate pipeline at creation time. Standalone scripts that are never wired into the pipeline provide zero value to the automated workflow.',
      evidence: 'auto-validate-user-stories-on-exec-complete.js and map-e2e-tests-to-stories.js existed but were never registered in gates/index.js',
      applicability: 'Any new validation script must be registered in the gate pipeline as part of the same PR',
      measurable_outcome: '2 gates registered, 0 integration gaps'
    },
    {
      category: 'CODE_QUALITY',
      learning: 'Scripts designed for CLI use must separate library logic from CLI entry point. Top-level process.exit() prevents import. Pattern: export parameterized functions, move CLI logic inside ESM entry point guard.',
      evidence: 'auto-validate script had process.exit(1) at line 32 - importing it killed the parent process',
      applicability: 'All 165+ scripts with ESM entry point pattern (see MEMORY.md)',
      measurable_outcome: 'auto-validate script now importable as library'
    },
    {
      category: 'TYPE_SAFETY',
      learning: 'When two files reference the same set of type names, extract to a shared constant. Independent definitions will diverge silently - the divergence causes fallthrough to default behavior that looks correct but uses wrong thresholds.',
      evidence: 'heuristicTypes had 6 types (theming, ux, design, ui, layout, state-management) not in CATEGORY_THRESHOLDS - silently fell to 70% default',
      applicability: 'Any validation system with type-based threshold lookup',
      measurable_outcome: 'heuristicTypes now exactly matches CATEGORY_THRESHOLDS keys'
    },
    {
      category: 'DUPLICATE_ELIMINATION',
      learning: 'When a canonical version of a script exists in the module tree, standalone copies in scripts/ root should be deleted. Documentation references can be updated; code imports should already point to the canonical path.',
      evidence: 'map-e2e-tests-to-user-stories.mjs (321 lines) was a duplicate of scripts/modules/handoff/map-e2e-tests-to-stories.js',
      applicability: 'Periodic script deduplication audit',
      measurable_outcome: '321 lines removed, 1 duplicate eliminated'
    }
  ],

  action_items: [
    {
      owner: 'Future Infrastructure SD',
      action: 'Audit all scripts in scripts/ for top-level process.exit() that prevents library import. Parameterize functions and move CLI logic inside entry point guard.',
      deadline: 'Next infrastructure SD cycle',
      priority: 'medium',
      measurable: true,
      smart_format: true,
      success_criteria: '0 scripts with top-level process.exit() outside entry point guard'
    },
    {
      owner: 'CI/Lint Enhancement',
      action: 'Add CATEGORY_THRESHOLDS key validation to CI/lint to prevent future mismatches between heuristicTypes and threshold keys.',
      deadline: 'Next quality SD cycle',
      priority: 'medium',
      measurable: true,
      smart_format: true,
      success_criteria: '0 mismatches detected between heuristicTypes and CATEGORY_THRESHOLDS'
    },
    {
      owner: 'Gate Pipeline',
      action: 'Consider adding a script registration completeness check - when a new validation script is created, verify it has a corresponding gate registration.',
      deadline: 'Next tooling SD cycle',
      priority: 'low',
      measurable: true,
      smart_format: true,
      success_criteria: 'Lint rule or pre-commit hook flags unregistered validation scripts'
    }
  ],

  improvement_areas: [
    JSON.stringify({
      area: 'Script-to-Pipeline Registration Gap',
      observation: 'Standalone validation scripts existed for months without being wired into the gate pipeline',
      root_cause_analysis: {
        why_1: 'Scripts were created as CLI tools, not as gate components',
        why_2: 'No automated check verifies that validation scripts are registered in gates/',
        why_3: 'Gate registration is a manual step in a separate file (gates/index.js)',
        why_4: 'The scripts worked fine standalone - no error signaled the missing integration',
        why_5: 'Integration testing focuses on gates that exist, not gates that should exist',
        root_cause: 'No completeness check for gate pipeline registration when validation scripts are created',
        contributing_factors: ['CLI-first script design', 'Manual gate registration', 'No integration gap detection']
      },
      preventive_measures: [
        'Register gates in the same PR that creates the validation script',
        'Add lint rule to detect validation scripts without gate wrappers',
        'Include gate registration checklist in PR template for validation work'
      ],
      systemic_issue: true
    }),
    JSON.stringify({
      area: 'Type Constant Divergence',
      observation: 'heuristicTypes and CATEGORY_THRESHOLDS defined type names independently, causing silent threshold fallthrough',
      root_cause_analysis: {
        why_1: 'heuristicTypes was added as a convenience array, not derived from CATEGORY_THRESHOLDS',
        why_2: 'New types were added to one but not the other over time',
        why_3: 'No shared constant or validation enforced consistency',
        why_4: 'Fallthrough to default threshold (70%) looked correct - no error surfaced',
        why_5: 'Type name lists are in different files with no cross-reference',
        root_cause: 'Independent definitions of the same concept without shared source of truth',
        contributing_factors: ['Convenience over correctness', 'Silent default behavior', 'No cross-file validation']
      },
      preventive_measures: [
        'Extract type names to shared constant imported by both files',
        'Add CI check comparing heuristicTypes to CATEGORY_THRESHOLDS keys',
        'Use TypeScript or JSDoc to enforce type string literals'
      ],
      systemic_issue: true
    })
  ],

  quality_score: 82,
  velocity_achieved: 80,
  team_satisfaction: 8,
  on_schedule: true,
  within_scope: true,
  objectives_met: true,
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 2,
  bugs_resolved: 2,
  tests_added: 0,

  affected_components: [
    'handoff-gate-pipeline',
    'user-story-quality-validation',
    'auto-validate-user-stories',
    'map-e2e-tests-to-stories',
    'exec-to-plan-gates'
  ],

  related_files: [
    'scripts/modules/handoff/executors/exec-to-plan/gates/story-auto-validation.js',
    'scripts/modules/handoff/executors/exec-to-plan/gates/e2e-test-mapping.js',
    'scripts/modules/user-story-quality-validation.js',
    'scripts/auto-validate-user-stories-on-exec-complete.js'
  ],

  tags: ['gate-pipeline', 'quality-gates', 'story-validation', 'e2e-mapping', 'deduplication'],

  metadata: {
    sd_uuid: '564859d2-d730-4cf1-96c1-12f2966c5a64',
    sd_type: 'infrastructure',
    lines_deleted: 321,
    gates_created: 2,
    types_removed: 6,
    types_added: 8
  }
};

async function main() {
  const { data, error } = await sb.from('retrospectives').insert(retro).select('id, sd_id, title, quality_score, status');
  if (error) {
    console.error('ERROR:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
  console.log('SUCCESS - Retrospective inserted:');
  console.log(JSON.stringify(data, null, 2));
}

main();
