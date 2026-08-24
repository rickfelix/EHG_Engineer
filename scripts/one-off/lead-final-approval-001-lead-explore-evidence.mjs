#!/usr/bin/env node
// SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 LEAD phase: records Explore evidence (gate
// REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] includes 'Explore'; the Explore agent has no Write tool, so
// its findings are persisted here) from real exploration performed this session: read the two
// confirmed injection sinks directly (gates.js:887, :898), confirmed both use execSync with
// unguarded template-literal branch-name interpolation; read the already-fixed sibling sink at
// gates.js:1132 (from SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001) establishing the exact
// remediation pattern; read branchBelongsToSd (lib/git/branch-owner.js:257) and confirmed it
// imposes no charset constraint on the branch name; audited every other execSync
// template-literal call site in the same file (lines 601-602, 763-764, 1015-1016) and confirmed
// each interpolates a hardcoded repo-name constant, not attacker-controlled input.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-001';

export async function recordExploreEvidence() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const exploreRow = {
    sd_id: sd.id,
    sub_agent_code: 'Explore',
    sub_agent_name: 'Codebase Explorer',
    verdict: 'PASS',
    confidence: 95,
    critical_issues: [],
    warnings: [
      'FR-4\'s audit scope is narrower than the SD text might suggest at first read: the other execSync template-literal sites in this same file (601-602, 763-764, 1015-1016) interpolate a hardcoded repos array (["rickfelix/ehg","rickfelix/EHG_Engineer"]) and/or sdId (DB/session-controlled, not attacker-influenced via branch names) -- not the same attacker-controlled-branch-name class as the two confirmed sinks. FR-4 should still convert or explicitly justify each for defense-in-depth, but should not be scoped as if 5 equally-severe RCEs exist.',
      'No existing ref-charset guard utility exists anywhere under lib/git/ -- FR-2 is genuinely new code, not a reuse of an existing helper.',
    ],
    recommendations: [
      'Reuse the exact remediation pattern already established at gates.js:1132 (execFileSync(\'git\', [...argv, \'--\', branch], opts)) for both confirmed sinks -- same file, same author intent, already proven safe for this exact code style via the prior MV fix.',
      'Base FR-2\'s charset allowlist on this repo\'s actual live branch-naming convention (feat/QF/docs/chore prefixes + SD-key + optional suffix) rather than an arbitrary restrictive regex -- verify against a real branch-name census before finalizing, to avoid rejecting a legitimate branch.',
    ],
    detailed_analysis: JSON.stringify({
      sink_1_confirmed: 'gates.js:887-890: execSync(`git rev-list --count origin/main..${branch}`, {encoding, cwd, timeout}) -- branch is unescaped template-literal interpolation, sourced from `git branch -r` filtered only by branchBelongsToSd, no charset constraint.',
      sink_2_confirmed: 'gates.js:898-901: execSync(`gh pr list --head "${cleanBranch}" --state merged --json number --limit 1`, {...}) -- cleanBranch = branch.replace(\'origin/\', \'\'), same unescaped interpolation, wrapped in double-quotes which does NOT prevent shell metacharacter injection (e.g. `"; whoami; echo "`).',
      established_fix_pattern: 'gates.js:1132: execFileSync(\'git\', [\'ls-remote\', \'--heads\', \'origin\', \'--\', branch], {encoding, cwd, timeout}) -- already proven pattern from SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (comment at :1124-1131 documents the exact same PoC: feat/<KEY>-a&whoami executing whoami when probed via the OLD execSync pattern).',
      charset_guard_absence: 'branchBelongsToSd (lib/git/branch-owner.js:257) calls resolveBranchOwner and checks only owner===sdKey -- no regex/charset validation on the branch string itself anywhere in that module. Grepped lib/git/ for ref-charset/allowlist/isValidRef patterns -- none exist.',
      fr4_scope_narrowing: 'Audited every execSync template-literal call site remaining in gates.js: 601-602 and 763-764 interpolate `repo` from a hardcoded `[\'rickfelix/ehg\',\'rickfelix/EHG_Engineer\']` array literal -- not attacker-controlled. 1015-1016 interpolates both `repo` (same hardcoded array) and `sdId` (passed into the gate function from the DB-resolved SD context, not sourced from any attacker-controlled branch/ref string). Real remaining attack surface for FR-4 to convert-or-justify is narrow.',
    }),
    metadata: {
      files_identified: [
        'scripts/modules/handoff/executors/lead-final-approval/gates.js',
        'lib/git/branch-owner.js',
      ],
    },
    validation_mode: 'prospective',
    source: 'Explore',
    phase: 'LEAD',
    summary: 'Confirmed both cited injection sinks (gates.js:887, :898) are real: execSync with unescaped template-literal branch-name interpolation, no charset guard anywhere in the resolution path. Confirmed the established remediation pattern (execFileSync-array, already proven at gates.js:1132 from a prior sibling SD). Audited the remaining execSync template-literal sites in the same file and found they interpolate hardcoded/DB-controlled values, not attacker-controlled branch names -- narrows FR-4\'s real scope without contradicting the SD\'s call for a full audit.',
  };

  const { data: ev, error: evErr } = await supabase.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
  if (evErr) throw new Error(`insert failed: ${evErr.message}`);
  console.log('EXPLORE_EVIDENCE', ev.id);
  return { evidenceId: ev.id };
}

if (isMainModule(import.meta.url)) {
  recordExploreEvidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
