#!/usr/bin/env node
// LEAD-phase spine for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const update = {
    key_changes: [
      {
        type: 'docs',
        change: "Document the 2 real, previously-undocumented CHECK constraints on user_stories (confirmed live 2026-09-15 via database/schema-reference-snapshot.json and a live sample row): valid_story_key CHECK (story_key ~ '^[A-Z0-9-]+:US-[0-9]{3,}$') and user_stories_priority_check CHECK (priority IN ('critical','high','medium','low','minimal')), in docs/reference/database-agent-patterns.md alongside the file's own established Anti-Pattern-4 'Manual SQL Trial-and-Error' and PRD-Workflow-Integration sections.",
        impact: 'A future session inserting a user_stories row can find the exact required format BEFORE attempting an INSERT, instead of discovering it only via a constraint-violation error.',
      },
      {
        type: 'fix',
        change: "Extend the existing PLAN-TO-EXEC checklist hint in scripts/modules/handoff/cli/cli-main.js (line ~595) -- which already prints a partial user_stories creation hint but omits the required 'priority' field entirely and gives only a loose story_key example, not the exact regex -- to name both constraints explicitly and point at the new doc section.",
        impact: 'Closes the exact gap the retrospective observed: the hint fires at precisely the moment a session needs this information (PLAN-TO-EXEC gate failure), but was previously incomplete.',
      },
    ],
    strategic_objectives: [
      'Reduce PAT-LES-455c48ba7d65 occurrences from 1 to 0 by making the two undocumented user_stories CHECK constraints discoverable without trial-and-error INSERT failures.',
      'Fix at the actual root cause (missing documentation + an incomplete inline hint), not by loosening or removing the constraints themselves -- the constraints are correct and should remain enforced.',
    ],
    risks: [
      {
        risk: 'The pattern row\'s own proven_solutions field describes an unrelated fix (a retrospective-quality trigger bug), not this issue -- a data-quality mismatch in the source row, not a real solution to apply.',
        mitigation: 'Verified the real root cause directly: fetched the origin SD (SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001) retrospective\'s own what_needs_improvement text, which names the actual finding, and independently confirmed both CHECK constraints exist live in database/schema-reference-snapshot.json plus a live user_stories sample row.',
        severity: 'low',
        rollback: 'Revert the doc addition and the cli-main.js hint text -- both are additive, no behavior change to any gate or constraint.',
      },
    ],
    smoke_test_steps: [
      {
        instruction: 'Read docs/reference/database-agent-patterns.md and confirm the new section states the exact story_key regex and the 5 valid priority values.',
        expected_outcome: 'Both constraints are documented with a working example INSERT, discoverable without triggering a live constraint-violation error.',
      },
      {
        instruction: "Run a PLAN-TO-EXEC precheck against an SD with zero user_stories rows and read the printed CLI hint.",
        expected_outcome: "The hint lists 'priority' among the required fields and the exact story_key format, not just a loose example.",
      },
    ],
    success_criteria: [
      { criterion: 'PAT-LES-455c48ba7d65 root cause addressed', measure: 'Pattern occurrence drops from 1 to 0; verified by querying issue_patterns table', verification: 'Automated: check issue_patterns WHERE pattern_id = X AND created_at > SD completion date' },
      { criterion: 'SD completes LEO workflow without manual metadata patching', measure: 'PLAN-TO-LEAD handoff passes RETROSPECTIVE_QUALITY_GATE ≥55% on first attempt', verification: 'Automated: handoff gate score logged in sd_phase_handoffs' },
    ],
    metadata: {
      ...(sdRow.metadata || {}),
      lead_scoping_decision: {
        decision: 'Root-cause fix is documentation + inline-hint completeness, not a constraint or code-logic change. The 2 CHECK constraints (valid_story_key, user_stories_priority_check) are correct and stay enforced as-is.',
        evidence: 'Origin SD retrospective (SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001, retro id 86a8de12-0dc8-4cd8-8e45-74bdfaf2a882) what_needs_improvement[2]: "User story format constraints (NNN:US-NNN pattern, \'critical\' priority keyword) in product_requirements_v2 check constraints are undocumented and only discoverable through trial-and-error INSERT failures." Confirmed live via database/schema-reference-snapshot.json: user_stories.valid_story_key and user_stories.user_stories_priority_check.',
        note_on_source_row_mismatch: "issue_patterns.proven_solutions for this pattern_id describes an unrelated retrospective-quality-trigger bug fix -- a data-quality mismatch in the source row (likely copy-paste from a sibling pattern during /learn's auto-generation), not evidence for THIS pattern. Not applying that unrelated proven_solution.",
      },
    },
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2').update(update).eq('id', sdRow.id);
  if (updErr) throw updErr;
  console.log('LEAD spine populated for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
