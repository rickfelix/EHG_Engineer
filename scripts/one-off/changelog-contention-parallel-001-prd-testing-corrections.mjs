#!/usr/bin/env node
// SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001 PLAN phase: corrects the PRD content based on
// PLAN-phase TESTING sub-agent findings, each independently re-verified by PLAN with a decisive
// isolated-repo git reproduction before being accepted (not taken on the sub-agent's word alone):
//   C1: the "merge-base precondition" is factually wrong -- git reads .gitattributes from the
//       CHECKED-OUT ("ours") side's working tree/history at merge time, not the merge-base.
//   C2: TS-3 was ambiguous (two readings give opposite outcomes) -- split into TS-3a/TS-3b.
//   C3: "self-resolving" sync framing was wrong -- one real conflict on first sync, then clean.
//   W1: "correctly ordered" is undefined for union output (order tracks merge direction).
//   W3/W4: fixture must use the repo's existing realgit pattern (mkdtempSync + realpathSync +
//       per-repo identity + explicit core.autocrlf=false + GIT_DIR/env-leakage guard).
//   W7: the "zero conflicts" success criterion only covers local merge/rebase, not GitHub's
//       server-side PR-merge button (which does not apply .gitattributes merge drivers).
// A concrete verification path is also added for FR-1 AC-4 (previously unfalsifiable).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHANGELOG-CONTENTION-PARALLEL-001';

export async function correctPRD() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const functional_requirements = [
    {
      id: 'FR-1',
      title: 'Add CHANGELOG.md merge=union to .gitattributes',
      priority: 'P0',
      description: "Add a `CHANGELOG.md merge=union` rule to the repo's .gitattributes, with a code comment explaining the mechanism (git's built-in union merge driver unions non-conflicting textual changes instead of raising a conflict) and the REAL precondition (git reads .gitattributes from the CHECKED-OUT/\"ours\" side's working tree/history AT MERGE TIME -- NOT the merge-base. A branch forked before this change lands on main gets ONE final conflict on its first sync with main, since its own checked-out history still lacks the attribute at that moment; clean thereafter once that sync brings the attribute into its own tip), and the accepted residual risk (two sessions editing/rewording the SAME existing entry, rather than each appending a new one, will silently keep both copies instead of conflicting -- low frequency, explicitly out of scope to solve further).",
      acceptance_criteria: [
        '`.gitattributes` contains a `CHANGELOG.md merge=union` line',
        'The line is accompanied by a comment explaining the REAL precondition (checked-out/"ours" side history at merge time, not the merge-base)',
        'The line is accompanied by a comment naming the accepted residual risk (same-entry-reword silent duplication)',
        "No other file's merge behavior is altered by this change (the rule is scoped to CHANGELOG.md only)",
        'Verified via `git ls-files -z | git check-attr --stdin -z merge`: before/after snapshot shows exactly ONE line changes (CHANGELOG.md: merge unspecified -> union); the pre-existing `*.png/*.webm/*.pptx/*.docx/*.gz binary` block already yields merge=unset for those paths, so the baseline is not empty -- the check is "exactly one net change", not "zero merge attributes existed before"',
      ],
    },
    {
      id: 'FR-2',
      title: 'Regression fixture proving the fix, not just asserting the config',
      priority: 'P0',
      description: "Add an isolated-temp-repo test (no live DB, no shared worktree state) using this repo's existing realgit fixture pattern (see tests/unit/fleet/source-tree-identity-realgit.test.js: fs.mkdtempSync(path.join(os.tmpdir(), ...)) + fs.realpathSync to avoid Windows 8.3-short-path / macOS-symlink path-comparison breakage, per-repo `git config user.email`/`user.name`/`init.defaultBranch` since a bare `git init` temp repo has none of these, explicit `core.autocrlf=false` per repo since a fresh temp repo can inherit a Windows/Git-for-Windows system default of `true` even when the real repo's local config is `false`, and a guard against GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE env leakage redirecting the fixture's git calls at the real repo -- reuse scrubGitEnv/GIT_REDIRECT_ENV_KEYS from lib/fleet/source-tree-refresh.cjs, written after a near-identical fixture actually created stray branches in the live repo) that: (a) TS-1: reproduces the exact reported failure -- two branches from a common base each append a distinct entry under the same `## YYYY-MM-DD` / `### Category` section; confirms the DEFAULT git merge strategy produces a CONFLICT; (b) TS-2: reproduces the identical scenario with `CHANGELOG.md merge=union` present in the CHECKED-OUT branch's history at merge time; confirms the merge succeeds automatically with BOTH entries present under the correct heading and zero conflict markers (NOT asserting a fixed order -- union output order tracks merge direction, not date or SD key); (c) TS-3a: the attribute present ONLY on the incoming (\"theirs\") side, absent from the checked-out (\"ours\") side, STILL CONFLICTS -- proves ours-side presence is what actually matters; (d) TS-3b: the attribute present ONLY on the checked-out (\"ours\") side (added after divergence from a common ancestor that never had it), merging in an incoming branch that never had it either, resolves CLEANLY -- the decisive sensitivity check that would catch a future change silently breaking the real mechanism.",
      acceptance_criteria: [
        'Test creates an isolated temp git repo per run using the realgit fixture pattern (mkdtempSync + realpathSync + explicit identity + explicit core.autocrlf=false + env-leakage guard), never touches the real repo\'s git state',
        'TS-1 asserts a CONFLICT outcome under the default merge strategy on the reproduced scenario',
        'TS-2 asserts a clean merge with both entries present under the correct heading and zero conflict markers -- NOT a fixed order',
        'TS-3a asserts the merge STILL conflicts when the attribute exists only on the incoming/theirs side',
        'TS-3b asserts the merge resolves CLEANLY when the attribute exists only on the checked-out/ours side (added after divergence, absent from the common ancestor and from theirs)',
        'Test passes when run standalone (npx vitest run <path>) without any live DB or network dependency',
        'Test file lives under tests/unit/ per this repo\'s DB-test guard conventions',
      ],
    },
    {
      id: 'FR-3',
      title: 'Confirm changelog-writing guidance remains accurate (no migration needed)',
      priority: 'P2',
      description: "Update `.claude/commands/document.md`'s changelog-writing guidance (the \"Release Documentation (GStack Patterns)\" / \"CHANGELOG Voice Polish\" section, ~L125-145, plus routing references at L54-55, L119, L810) with a brief note that CHANGELOG.md concurrent-merge conflicts are now resolved via the `.gitattributes merge=union` rule (FR-1) -- workers continue hand-editing CHANGELOG.md exactly as before; no fragment-file path or new write mechanism is introduced.",
      acceptance_criteria: [
        ".claude/commands/document.md's CHANGELOG-writing guidance mentions the merge=union protection",
        'No new fragment-path instruction is added (would misrepresent the corrected, unchanged write mechanism)',
        'The pre-existing hand-edit CHANGELOG.md workflow instructions remain otherwise unchanged',
      ],
    },
  ];

  const test_scenarios = [
    { id: 'TS-1', type: 'regression', test_type: 'unit', scenario: 'Default merge strategy on concurrent same-date/same-category CHANGELOG.md appends', expected: 'Merge reports CONFLICT (content) in CHANGELOG.md' },
    { id: 'TS-2', type: 'functional', test_type: 'unit', scenario: 'merge=union present in the checked-out (ours) branch\'s history at merge time, identical concurrent-append scenario', expected: 'Merge succeeds automatically; resulting file contains both entries under the correct heading, zero conflict markers (order not asserted -- tracks merge direction)' },
    { id: 'TS-3a', type: 'regression', test_type: 'unit', scenario: 'merge=union present ONLY on the incoming (theirs) side, absent from the checked-out (ours) side', expected: 'Merge STILL conflicts -- proves ours-side presence is what actually matters, not mere existence anywhere in the merge' },
    { id: 'TS-3b', type: 'functional', test_type: 'unit', scenario: 'merge=union present ONLY on the checked-out (ours) side, added after divergence from a common ancestor that never had it; incoming (theirs) side never had it either', expected: 'Merge resolves CLEANLY -- the decisive sensitivity check for the real mechanism' },
  ];

  const risks = [
    {
      risk: 'Union merge silently keeps both copies when two sessions edit/reword the SAME existing entry (rather than each appending a distinct new one), instead of conflicting to force a human decision',
      severity: 'low',
      mitigation: 'Explicitly documented as an accepted, out-of-scope residual risk in both the .gitattributes comment and this PRD; changelog entries are rarely edited post-hoc, and this is far less costly than the every-merge conflict rate being fixed. Revisit with a fragment/assembler design only if this is ever actually observed in practice.',
      rollback_plan: 'Remove the single .gitattributes line; behavior reverts to the pre-fix default merge strategy with no other side effects, since no write mechanism or file location changed.',
    },
    {
      risk: "Already-open branches forked before this .gitattributes change lands on main will not get union behavior until they merge/sync main first",
      severity: 'low',
      mitigation: 'One final conflict on the first sync per already-open branch (that branch\'s own checked-out history still lacks the attribute at that moment), then clean thereafter once that sync brings the attribute into its own tip. This matches the existing, already-required pre-ship main-sync workflow -- one extra conflict resolution per open branch, not an ongoing burden. (Corrected from an earlier, wrong "self-resolving with zero conflicts" claim.)',
      rollback_plan: 'N/A -- branches naturally converge as each does its next main-sync.',
    },
    {
      risk: "GitHub's server-side PR-merge button does not apply .gitattributes merge drivers to its own conflict detection, so it will not benefit from this fix the way local git merge/rebase does",
      severity: 'low',
      mitigation: "Scoped success criterion to the local-merge/rebase path, which is where the reported pain actually originates (shipping prep, main-sync before /ship). Confirmed by TESTING sub-agent measurement across ort/recursive strategies and rebase, all honoring the attribute; the GitHub server-side path was not tested and is explicitly out of scope.",
      rollback_plan: 'N/A -- no code path depends on this assumption; only informs the stated scope of the success criterion.',
    },
  ];

  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('directive_id', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...prd.metadata,
    plan_testing_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'PLAN (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'PLAN-phase TESTING sub-agent evidence (12 real isolated-repo git scenarios) + PLAN\'s own independent decisive reproduction of the two most consequential findings (merge-base precondition was wrong; first-sync-conflicts, not self-resolving) before accepting them',
    },
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements, test_scenarios, risks, metadata })
    .eq('id', prd.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected PRD content for ${SD_KEY} (id=${prd.id}).`);
  return { prdId: prd.id };
}

if (isMainModule(import.meta.url)) {
  correctPRD().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
