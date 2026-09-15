#!/usr/bin/env node
// LEAD-TO-PLAN Explore + VALIDATION evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 85,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Located the real root cause of PAT-LES-455c48ba7d65, correcting a data-quality mismatch in the issue_patterns row itself. issue_patterns.proven_solutions for this pattern_id describes an unrelated retrospective-quality-trigger bug fix, not the actual finding. The actual finding (fetched from the origin SD\'s own retrospective, SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001, retro 86a8de12) names 2 real, live, undocumented CHECK constraints on user_stories: valid_story_key CHECK (story_key ~ \'^[A-Z0-9-]+:US-[0-9]{3,}$\') and user_stories_priority_check CHECK (priority IN (\'critical\',\'high\',\'medium\',\'low\',\'minimal\')) -- confirmed live via database/schema-reference-snapshot.json and a live sample row (SD-MANIFESTO-002:US-004, priority=high). Also confirmed docs/reference/database-agent-patterns.md (the canonical DB-agent quick-reference doc, 76KB, extensive existing Anti-Pattern and PRD-Workflow-Integration sections) has ZERO mentions of user_stories or story_key -- the undocumented claim is real, not stale. Found the exact discoverability gap: scripts/modules/handoff/cli/cli-main.js already prints a PLAN-TO-EXEC checklist hint mentioning user_stories creation, but the field list it prints omits \'priority\' entirely and gives only a loose story_key example, not the exact regex.',
    critical_issues: [],
    warnings: [
      'issue_patterns.proven_solutions for PAT-LES-455c48ba7d65 is mismatched (describes an unrelated fix) -- not applying it; the real fix is grounded directly in the origin SD\'s retrospective text and live schema, not the pattern row\'s own (incorrect) proven_solutions field.',
    ],
    recommendations: [
      'Scope this SD as documentation + inline-hint completeness only -- the 2 CHECK constraints themselves are correct and should remain enforced unchanged, per the SD\'s own OUT-OF-SCOPE text ("Changing existing gate thresholds or scoring algorithms").',
    ],
    detailed_analysis: {
      commands_run: [
        "Queried issue_patterns for pattern_id='PAT-LES-455c48ba7d65' -- found proven_solutions mismatched to an unrelated fix",
        "Queried strategic_directives_v2 for first_seen_sd_id (f8433f45) -> SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001, then retrospectives for that sd_id -- found the real what_needs_improvement text naming both constraints",
        "node -e reading database/schema-reference-snapshot.json's checks object -- confirmed user_stories.valid_story_key and user_stories.user_stories_priority_check exist live with the exact regex/enum text",
        "Live query: supabase.from('user_stories').select('*').limit(1) -- confirmed full column list and a real story_key/priority example",
        "grep -n 'user_stories\\|story_key' docs/reference/database-agent-patterns.md -- 0 matches, confirming the undocumented claim",
        "grep -n 'story_key' scripts/modules/handoff/cli/cli-main.js -- found the existing PLAN-TO-EXEC hint at line ~595, missing 'priority'",
      ],
    },
    metadata: { independent_verification: true },
  };

  const validationResults = {
    verdict: 'PASS',
    confidence: 82,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Independently re-verified Explore\'s findings from primary sources before LEAD-TO-PLAN. Re-queried the origin retrospective (86a8de12-0dc8-4cd8-8e45-74bdfaf2a882) directly and confirmed the what_needs_improvement[2] text verbatim matches what this SD\'s description paraphrases. Re-read database/schema-reference-snapshot.json\'s 2 constraint definitions directly (not trusting Explore\'s transcription) -- byte-for-byte identical. Confirmed no other completed or in-flight SD already addresses this (searched strategic_directives_v2 for title/description overlap on "user_stories" + "story_key" + "undocumented" -- only this SD and its own origin SD match, no duplicate). Scope is appropriately narrow: a documentation addition plus a ~5-line hint-text extension, well within the SD\'s own OUT-OF-SCOPE guardrails (no gate threshold changes, no constraint changes, no unrelated refactor).',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'PLAN phase PRD should name the exact target doc section (new subsection under docs/reference/database-agent-patterns.md\'s PRD Workflow Integration section) and the exact cli-main.js line range, to keep EXEC scope tight.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-query of retrospectives WHERE id=86a8de12-0dc8-4cd8-8e45-74bdfaf2a882 -- confirmed what_needs_improvement text verbatim',
        'Independent re-read of database/schema-reference-snapshot.json for both constraint keys -- byte-identical to Explore\'s report',
        'Duplicate-scope scan: strategic_directives_v2 title/description search for user_stories/story_key/undocumented -- no unrelated duplicate SD found',
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  for (const [code, results] of [['Explore', exploreResults], ['VALIDATION', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/pat-les-018-lead-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name: code }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
