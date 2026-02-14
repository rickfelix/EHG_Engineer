#!/usr/bin/env node
/**
 * Enrich context engineering fields for SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001 user stories
 * Adds implementation_context, architecture_references, example_code_patterns, testing_scenarios, and given_when_then
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const contextEnrichments = {
  'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001:US-001': {
    implementation_context: 'Modify CLAUDE.md router file to reduce token consumption by condensing instructions while maintaining routing accuracy. Focus on removing redundant explanations and keeping only essential routing logic. Target 50% reduction in file size.',
    architecture_references: 'CLAUDE.md (main router), scripts/generate-claude-md-from-db.js (generator), docs/reference/protocol-file-structure.md',
    example_code_patterns: 'Use markdown tables for routing rules. Replace verbose explanations with concise bullet points. Keep routing keywords intact. Reference pattern: "## Phase Keywords → File\\n| Keywords | Load |\\n|----------|------|"',
    testing_scenarios: 'Verify router still loads correct files for LEAD/PLAN/EXEC phases. Validate all routing keywords trigger expected behavior. Measure token reduction percentage.',
    given_when_then: 'GIVEN a Claude session starting, WHEN CLAUDE.md is loaded, THEN it should consume ≤50% of previous tokens while maintaining routing accuracy'
  },
  'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001:US-002': {
    implementation_context: 'Update generate-claude-md-from-db.js to output condensed format by default. Modify template processing to skip verbose sections and focus on routing tables and essential instructions only.',
    architecture_references: 'scripts/generate-claude-md-from-db.js (generator logic), lib/protocol-section-renderer.js (template processor), database/schema/007_leo_protocol_schema_fixed.sql (source tables)',
    example_code_patterns: 'Add --condensed flag logic. Modify section rendering to detect verbose content. Use template conditionals like {#if condensed}short{:else}verbose{/if}. Reference existing flag patterns in other scripts.',
    testing_scenarios: 'Run generator with --condensed flag. Compare output size vs full version. Verify routing tables intact. Test backward compatibility without flag.',
    given_when_then: 'GIVEN the generator script is run with --condensed flag, WHEN processing protocol sections, THEN output should be ≤50% of full version size'
  },
  'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001:US-003': {
    implementation_context: 'Create new digest versions of CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, and CLAUDE_EXEC.md with only essential instructions. Remove examples, explanations, and redundant sections while keeping all requirements and validation criteria.',
    architecture_references: 'CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md (source files), templates/protocol-digests/ (new digest templates), docs/reference/protocol-file-structure.md',
    example_code_patterns: 'Create CLAUDE_CORE_DIGEST.md with structure: ## Requirements\\n- Bullet points only\\n\\n## Validation\\n- Criteria only\\n\\nSkip all ### Examples, ### Background sections.',
    testing_scenarios: 'Load digest files in test session. Verify all acceptance criteria from full files are present. Measure token reduction. Test phase transitions work correctly.',
    given_when_then: 'GIVEN digest protocol files, WHEN loaded in a session, THEN they should contain all validation criteria while consuming ≤40% of full file tokens'
  },
  'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001:US-004': {
    implementation_context: 'Modify router logic to point to _DIGEST.md versions by default. Add --full flag to opt into verbose versions. Update routing table to prefer digest paths unless explicitly overridden.',
    architecture_references: 'CLAUDE.md (router), scripts/generate-claude-md-from-db.js (generator), lib/protocol-loader.js (if exists)',
    example_code_patterns: 'Update routing table: "| LEAD phase | CLAUDE_LEAD_DIGEST.md |". Add routing logic: const fileName = useFull ? "CLAUDE_LEAD.md" : "CLAUDE_LEAD_DIGEST.md";',
    testing_scenarios: 'Start session without flags - should load digests. Use --full flag - should load full files. Verify routing keywords still trigger correct phase files.',
    given_when_then: 'GIVEN a new Claude session, WHEN router loads phase files, THEN digest versions should be loaded by default unless --full flag is present'
  },
  'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001:US-005': {
    implementation_context: 'Add validation to generator script to verify digest files maintain all essential content from source files. Check that acceptance criteria, validation rules, and routing keywords are preserved in digest versions.',
    architecture_references: 'scripts/generate-claude-md-from-db.js (generator), scripts/verify-protocol-files.js (if exists, or create new), tests/protocol-digest-validation.test.js (new test file)',
    example_code_patterns: 'Parse both full and digest files. Extract AC sections using regex: /##\\s*Acceptance Criteria([\\s\\S]*?)(?=##|$)/. Compare lists. Report missing items. Return exit code 1 if mismatch.',
    testing_scenarios: 'Run generator. Run verification script. Should pass if all AC present. Modify digest to remove AC - should fail. Test with missing routing keyword - should fail.',
    given_when_then: 'GIVEN generated digest files, WHEN verification script runs, THEN it should confirm 100% of acceptance criteria and routing keywords are preserved'
  }
};

async function enrichStories() {
  console.log('Enriching user stories for SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001...\n');

  for (const [storyKey, enrichment] of Object.entries(contextEnrichments)) {
    console.log(`Updating ${storyKey}...`);

    const { error } = await supabase
      .from('user_stories')
      .update({
        implementation_context: enrichment.implementation_context,
        architecture_references: enrichment.architecture_references,
        example_code_patterns: enrichment.example_code_patterns,
        testing_scenarios: enrichment.testing_scenarios,
        given_when_then: enrichment.given_when_then,
        updated_at: new Date().toISOString()
      })
      .eq('story_key', storyKey);

    if (error) {
      console.error(`  ❌ Error updating ${storyKey}:`, error.message);
    } else {
      console.log(`  ✅ Updated`);
    }
  }

  // Verify coverage
  console.log('\nVerifying coverage...');
  const { data, error } = await supabase
    .from('user_stories')
    .select('story_key, implementation_context')
    .eq('sd_id', 'SD-LEO-INFRA-DISTILL-CLAUDE-FILES-001')
    .order('story_key');

  if (error) {
    console.error('Error fetching stories:', error.message);
    return;
  }

  const storiesWithContext = data.filter(s =>
    s.implementation_context && s.implementation_context.length > 50
  ).length;
  const coverage = (storiesWithContext / data.length) * 100;

  console.log(`\nContext Engineering Coverage: ${Math.round(coverage)}% (${storiesWithContext}/${data.length})`);

  if (coverage >= 80) {
    console.log('✅ Coverage meets 80% threshold for PLAN-TO-EXEC handoff');
  } else {
    console.log(`❌ Coverage below 80% threshold (${Math.round(coverage)}%)`);
  }
}

enrichStories().catch(console.error);
