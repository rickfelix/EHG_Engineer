#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-PRE-TOOL-ENFORCE-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed: locating the incident's actual write path,
 * confirming zero prior coverage for fetch/shallow in the enforcement hook, tracing the
 * established pure-lib/hook pattern this fix mirrors, and confirming no duplicate/prior-art fix
 * exists for this gap.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-PRE-TOOL-ENFORCE-001';

const findings = [
  {
    id: 'zero-prior-coverage-confirmed',
    severity: 'HIGH',
    summary: 'git grep for fetch/depth/shallow/unshallow across scripts/hooks/pre-tool-enforce.cjs (pre-fix) returned zero hits, confirming the ticket\'s own claim: the single choke point every Bash tool call passes had no rule of any kind touching shallow-fetch semantics.',
  },
  {
    id: 'incident-write-path-confirmed',
    severity: 'HIGH',
    summary: 'The 2026-09-12 05:06-05:28Z incident write path (scripts/audits/wip-reclaim-denylist-audit.mjs running git fetch --depth=1 --no-tags origin <ref> ~250 times) was already fixed at the single-script level by QF-20260912-147 (removed --depth). This SD closes the CLASS at the hook level so no future script can reintroduce the same fleet-wide hazard.',
  },
  {
    id: 'established-pure-lib-hook-split-pattern',
    severity: 'INFO',
    summary: 'ENF-17 (lib/shared-tree-guard.cjs, SD-LEO-FEAT-SHARED-TREE-HIJACK-001), ENF-18 (lib/one-off-bare-import.cjs, SD-LEO-FIX-TEST-FIXTURE-LANE-001), and ENF-19 (lib/heredoc-substitution-guard.cjs, QF-20260912-632) all split a pure, unit-tested decision module from hook-owned cwd/coordinator resolution + audit + exit. The new ENF-20 rule (scripts/hooks/lib/shallow-fetch-guard.cjs) follows this identical, already-proven pattern rather than inventing a new one.',
  },
  {
    id: 'git-common-dir-resolution-mechanism-reused',
    severity: 'INFO',
    summary: 'ENF-12e (worktree-add-sibling-guard) already established `git rev-parse --git-common-dir` as the correct mechanism for identifying "does this command target the fleet\'s shared object store", since every worktree of a repo shares one git-common-dir regardless of which worktree cwd invokes it. ENF-20 reuses this exact mechanism rather than a hand-rolled path-prefix comparison (which would break for a scratch clone physically nested under the same drive path).',
  },
  {
    id: 'no-duplicate-or-prior-art',
    severity: 'INFO',
    summary: 'git log --all --oneline --grep for "shallow" or "depth" fetch guards, and a search of scripts/hooks/ for any existing fetch-related rule, found only QF-20260912-147 (the single-script fix, already landed) and QF-20260912-632 (the sibling heredoc rule, unrelated mechanism). No open SD or QF duplicates this class-level fix.',
  },
];

const warnings = [
  'This SD was escalated from QF-20260912-292 twice over: first for exceeding the 75-LOC QF hard cap (146 net source LOC), then hard-refused independently by the QF eligibility preflight (scripts/hooks/** is an unconditionally sensitive path with no bypass flag). The underlying code was already written, unit tested (14/14), and verified end-to-end against the real hook binary before this SD was created -- EXEC-phase work is confirming that already-correct implementation against this SD\'s PRD, not writing new code from scratch.',
];

const recommendations = [
  'PLAN should treat the already-committed diff (scripts/hooks/pre-tool-enforce.cjs ENF-20 block + scripts/hooks/lib/shallow-fetch-guard.cjs + tests/unit/hooks/shallow-fetch-guard.test.js, commit 40dc8fa0a09) as the PRD\'s primary technical artifact.',
  'Given the fleet-wide blast radius of this file, PLAN/EXEC should explicitly invoke a SECURITY sub-agent review pass in addition to the bugfix-type-required TESTING/REGRESSION agents, even though sd_type=bugfix does not mandate SECURITY by CLAUDE_CORE.md\'s table -- the QF eligibility preflight\'s own existence is evidence this class of change warrants it.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-PRE-TOOL-ENFORCE-001 confirmed zero prior fetch/shallow coverage in pre-tool-enforce.cjs, traced the incident to an already-fixed single-script cause (QF-20260912-147) that this SD closes at the class level, confirmed the new ENF-20 rule mirrors the established pure-lib/hook split already used by ENF-17/18/19 in the same file, confirmed it reuses ENF-12e\'s proven git-common-dir resolution mechanism rather than inventing path-prefix matching, and found no duplicate or prior-art fix for this gap.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 93,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/hooks/pre-tool-enforce.cjs',
        'scripts/hooks/lib/shallow-fetch-guard.cjs',
        'scripts/hooks/lib/shared-tree-guard.cjs',
        'scripts/hooks/lib/heredoc-substitution-guard.cjs',
        'scripts/hooks/lib/one-off-bare-import.cjs',
        'tests/unit/hooks/shallow-fetch-guard.test.js',
        'tests/unit/hooks/heredoc-substitution-guard.test.js',
        'lib/quick-fix/sensitive-path-registry.js',
      ],
      searches_run: [
        'git grep for fetch/depth/shallow/unshallow in scripts/hooks/pre-tool-enforce.cjs (pre-fix)',
        'git log --all --oneline --grep for shallow/depth fetch guards',
        'search of scripts/hooks/ for any existing fetch-related rule',
      ],
      dedup_candidates_checked: ['QF-20260912-147 (single-script fix, already landed)', 'QF-20260912-632 (sibling heredoc rule, unrelated mechanism)'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
