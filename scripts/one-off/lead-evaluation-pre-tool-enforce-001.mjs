// SD-LEO-FIX-PRE-TOOL-ENFORCE-001 — LEAD-phase evaluation write.
//
// Escalated from QF-20260912-292 (routing_tier=3, net source LOC 146 > 75 cap) AND separately
// hard-refused by the QF eligibility preflight (scripts/hooks/** is a sensitive path with no
// bypass flag — CLAUDE.md-adjacent enforcement-hook changes always require full SD review).
// The fix itself (ENF-20 in scripts/hooks/pre-tool-enforce.cjs + scripts/hooks/lib/shallow-
// fetch-guard.cjs + tests/unit/hooks/shallow-fetch-guard.test.js) was already written, unit
// tested (14/14), and verified end-to-end against the real hook binary on branch
// qf/QF-20260912-292 (PR #8773, auto-merge disabled pending this SD's own review). This script
// replaces the /leo-create template placeholders with the actual LEAD evaluation content.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-PRE-TOOL-ENFORCE-001';

const update = {
  key_changes: [
    {
      change:
        'New ENF-20 rule in scripts/hooks/pre-tool-enforce.cjs: refuse git fetch/pull/clone carrying ' +
        '--depth, --shallow-since, --shallow-exclude, or --unshallow when the command\'s effective ' +
        'target (cwd, or an explicit -C/--git-dir override, resolved via git\'s own CLI) shares the ' +
        'fleet\'s git-common-dir.',
      impact:
        'A shallow-affecting fetch/pull/clone against the shared fleet object store is blocked before ' +
        'execution, preventing the 2026-09-12 05:06-05:28Z incident class (one worktree\'s --depth=1 ' +
        'fetch loop broke every other seat\'s ff-only merge for ~20 minutes).'
    },
    {
      change:
        'New pure decision module scripts/hooks/lib/shallow-fetch-guard.cjs (parseGitShallowCommand + ' +
        'decideShallowFetchGuard), mirroring the established pure-lib/hook split already used by ' +
        'ENF-17/18/19 in the same file.',
      impact: 'Unit-testable without shelling out to git; the hook owns cwd/coordinator resolution + audit + exit only.'
    },
    {
      change:
        '--unshallow (the repair) remains allowed from the active coordinator session only; a --git-dir/-C ' +
        'redirect to a separate repository (a scratch clone) is never operative, since a different ' +
        'common-dir means a different, unaffected shallow file.',
      impact: 'The repair path and legitimate scratch-clone usage stay unblocked.'
    }
  ],
  success_criteria: [
    {
      criterion: 'A git fetch/pull/clone carrying a shallow-affecting flag against the fleet\'s shared object store is refused (exit 2) before execution',
      measure: 'End-to-end smoke test against the real hook binary: exact incident shape (git fetch --depth=1 --no-tags origin main) exits 2 with an ENF-20 message'
    },
    {
      criterion: 'The guard does not false-positive on ordinary fetches, unrelated commands, or a genuinely different repository target',
      measure: 'End-to-end smoke test: plain git fetch --no-tags, git status, and a --git-dir redirect to a real separate git repo all exit 0'
    },
    {
      criterion: '--unshallow (the repair) stays usable by the coordinator role',
      measure: 'tests/unit/hooks/shallow-fetch-guard.test.js: ALLOWS --unshallow from a coordinator-tagged session; BLOCKS it from a non-coordinator session'
    },
    {
      criterion: 'No regression to the sibling ENF-17/18/19 guards in the same hook file',
      measure: 'npx vitest run tests/unit/hooks/ -- 369/369 pass (32 test files)'
    }
  ],
  risks: [
    {
      risk:
        'pre-tool-enforce.cjs is the single choke point every Bash tool call passes for the whole fleet -- ' +
        'a bug in ENF-20 (e.g. a false-positive block on a legitimate command, or a fail-open leak) has ' +
        'fleet-wide blast radius, which is exactly why the QF eligibility preflight refuses autonomous ' +
        'completion for any scripts/hooks/** change.',
      impact: 'high',
      likelihood: 'low',
      mitigation:
        'Mirrors the already-shipped ENF-17/18/19 pattern in the same file (pure lib + fail-open on any ' +
        'internal error, off-switch env var LEO_SHALLOW_FETCH_GUARD=off). Verified end-to-end against the ' +
        'real hook binary (not just the pure lib) for all 4 named cases in the original ticket\'s fix shape, ' +
        'plus 14 unit assertions covering fail-closed-on-unresolved-common-dir and mixed-flag edge cases.'
    },
    {
      risk:
        'The guard shells out to `git rev-parse --git-common-dir` (via execFileSync) only after a cheap, ' +
        'pure regex pre-check finds a shallow-affecting flag present -- an unexpectedly slow or hanging ' +
        'git invocation could add latency to every matching Bash call.',
      impact: 'low',
      likelihood: 'low',
      mitigation:
        'execFileSync calls carry a 2000ms timeout and are wrapped in try/catch (fail closed on error, per ' +
        'the guard\'s own "unresolved common-dir fails closed" design) -- this only fires on commands that ' +
        'already contain a shallow-affecting flag, not on every Bash call.'
    },
    {
      risk:
        'Original QF filer estimated "Tier 1, ~30 LOC"; actual necessary source came to 146 LOC (60 hook ' +
        'wiring + 86 new lib module), forcing this escalation.',
      impact: 'low',
      likelihood: 'low',
      mitigation:
        'The overshoot is fully accounted for: cwd/-C/--git-dir resolution + a coordinator check + the ' +
        'pure-lib/hook split + full unit coverage matching the ticket\'s own named test list, all things ' +
        'the ticket\'s own fix shape explicitly asked for. No scope beyond the ticket was added.'
    }
  ],
  scope_reduction_percentage: 0,
  smoke_test_steps: [
    {
      step_number: 1,
      instruction: 'Run: npx vitest run tests/unit/hooks/shallow-fetch-guard.test.js',
      expected_outcome: 'All 14 assertions pass (incident shape, --git-dir exemption, plain-fetch/no-git allow, coordinator-unshallow allow, non-coordinator-unshallow block, fail-closed-on-unresolved-common-dir)'
    },
    {
      step_number: 2,
      instruction: 'Run: npx vitest run tests/unit/hooks/ (the full hooks suite)',
      expected_outcome: 'All 369 assertions across 32 test files pass -- no regression to sibling ENF-17/18/19 guards'
    },
    {
      step_number: 3,
      instruction:
        'Pipe a simulated PreToolUse payload for `git fetch --depth=1 --no-tags origin main` into ' +
        'scripts/hooks/pre-tool-enforce.cjs via stdin (session_id/tool_name/tool_input JSON shape)',
      expected_outcome: 'Process exits 2 with an [ENF-20] SHALLOW-FETCH BLOCKED message on stderr'
    },
    {
      step_number: 4,
      instruction:
        'Repeat step 3 with `git --git-dir=<a real separate repo>/.git fetch --depth=1 --no-tags origin main`',
      expected_outcome: 'Process exits 0 (different object store, not operative)'
    }
  ]
};

async function main() {
  const { error } = await supabase.from('strategic_directives_v2').update(update).eq('sd_key', SD_KEY);
  if (error) throw new Error(`write failed: ${error.message}`);
  const { data: after, error: verifyErr } = await supabase
    .from('strategic_directives_v2')
    .select('key_changes, success_criteria, risks, scope_reduction_percentage, smoke_test_steps')
    .eq('sd_key', SD_KEY)
    .single();
  if (verifyErr) throw new Error(`verify failed: ${verifyErr.message}`);
  if (!Array.isArray(after.smoke_test_steps) || after.smoke_test_steps.length !== update.smoke_test_steps.length) {
    throw new Error('VERIFY FAILED: smoke_test_steps did not persist');
  }
  console.log(`OK: ${SD_KEY} LEAD evaluation fields written and verified.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
}
