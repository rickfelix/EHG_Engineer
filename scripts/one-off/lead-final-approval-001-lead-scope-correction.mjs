#!/usr/bin/env node
// SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 LEAD phase: corrects the SD scope based on VALIDATION
// sub-agent findings, each independently re-verified by LEAD with its own reproduction before
// being accepted (not taken on the sub-agent's word alone):
//   - FR-1's argv form for `git rev-list --count` must NOT place '--' before the rev (verified:
//     `git rev-list --count -- origin/main..HEAD` fails, exit 129).
//   - FR-3 as originally scoped ("replay the exact &whoami PoC") is a FALSE GREEN on sink #2 on
//     Windows/cmd.exe -- a bare '&' inside double quotes does not break out (verified directly),
//     only a quote-breakout or backtick/$() payload does. Must be a payload matrix.
//   - FR-1's conversion breaks 5 of 14 currently-passing tests (verified: baseline is 14/14) that
//     mock execSync by string content -- must migrate in the same PR.
//   - FR-4's real inventory is corrected: LEAD's own prior Explore evidence overstated how many
//     sibling sites are hardcoded-safe (lines 763/1015 are registry/provisioner-derived via
//     computeReposForSD, not the hardcoded array line 601 uses -- verified by reading the call
//     site directly), plus two additional genuine DB-string sinks found, plus one explicit
//     by-design exception (smoke-test-gate.js:107).
//   - A second harm (gate fail-open via parseInt(injected-output)=NaN) added to the problem
//     statement.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-LEAD-FINAL-APPROVAL-001';

export async function correctLeadScope() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const description = `LEAD-FINAL-APPROVAL gate: two live command-injection sinks (branch name -> shell) survive the MV fix -- LEAD-corrected scope after VALIDATION sub-agent review, each finding independently re-verified by LEAD before accepting.

## Problem (confirmed by direct reproduction -- both the sub-agent and LEAD, independently, on this host)
scripts/modules/handoff/executors/lead-final-approval/gates.js has two live shell-injection sinks the prior MERGE-VERIFICATION SD did not close (that SD fixed a different sink at :1132 via execFileSync):
- :887 \`execSync(\\\`git rev-list --count origin/main..\${branch}\\\`)\`
- :898 \`execSync(\\\`gh pr list --head "\${cleanBranch}" --state merged --json number --limit 1\\\`)\`
branch/cleanBranch come from \`git branch -r\` filtered ONLY by branchBelongsToSd (lib/git/branch-owner.js) -- no charset constraint on the suffix after the SD key -- then interpolated into shell strings. LEAD independently reproduced injection on this host: a branch name containing a bare '&' does NOT break out of sink #2's double-quote wrapping on Windows/cmd.exe (verified: the '&' is printed literally, not executed) -- but a quote-breakout payload (a literal " followed by &whoami&") DOES execute (verified: whoami ran). Sink #1 has no quoting at all and is trivially exploitable with a bare '&'.

**Second harm, not in the original submission (LEAD-added after VALIDATION review)**: when the injected command's output is not a clean small integer, \`parseInt(commitCount)\` (the return of the compromised execSync call) becomes NaN, and \`NaN > 0\` is false -- the branch is silently dropped from the unmerged-branches list rather than flagged. This is a gate FAIL-OPEN with a non-adversarial trigger (any stderr/stdout pollution reaching the parsed value), not only an adversarial RCE.

Blast radius: any push-access principal; requires push access to origin, not an internet-facing attacker -- realistic vectors are a compromised worker token or an autonomous agent generating a branch name from unsanitized input. Pre-existing (weeks), not a new regression -- escalation not halt, but HIGH.

## Scope (LEAD-corrected)
- FR-1: Convert both sinks to execFileSync with an argv array, reusing the pattern already at gates.js:1132. EXACT forms (verified against real git/gh behavior, not assumed): sink #1 is \`execFileSync('git', ['rev-list', '--count', \\\`origin/main..\${branch}\\\`], opts)\` -- NO leading '--' (verified: \`git rev-list --count -- origin/main..HEAD\` fails with a usage error, exit 129, because '--' before the rev is parsed as "no commits, paths follow"; the argv element can never start with '-' so no separator is needed). Sink #2 is \`execFileSync('gh', ['pr', 'list', '--repo', repo, '--head', cleanBranch, '--state', 'merged', '--json', 'number', '--limit', '1'], opts)\`.
- FR-1a (added): migrate the 5 existing tests in gates/pr-merge-verification.test.js that mock execSync by string-content matching (cmd.includes(...)) to mock execFileSync instead -- verified baseline is 14/14 passing before this SD; these 5 would break on the FR-1 conversion if not migrated in the same PR.
- FR-2: Defense-in-depth ref-charset allowlist guard, positioned as covering FR-4's un-converted sinks and any future sink -- NEVER as an alternative to FR-1 at the two known sinks (execFileSync alone already eliminates the shell there). Log-and-reject on violation (not silent-skip), so a rejected branch stays visible to the caller rather than becoming a new fail-open. Validated cost: a live census of the repo's real remote branches found 0 violating a [A-Za-z0-9._/-] charset -- zero legitimate-branch rejection risk.
- FR-3 (corrected): a PER-SINK PAYLOAD MATRIX, not one shared PoC string -- at minimum a quote-breakout payload AND a backtick/$() substitution payload per sink, since the literal "&whoami" PoC alone is a FALSE GREEN against sink #2 on a Windows/cmd.exe host (verified directly: it does not execute there, only the quote-breakout and backtick/$() forms do). Prefer asserting against a real un-mocked scratch-repo reproduction over a pure mock-call-shape assertion where feasible, so the test observes the actual injection surface rather than only confirming an argv array was constructed.
- FR-4 (corrected inventory, from LEAD's own re-audit): beyond the 2 primary sinks fixed by FR-1, 2 additional genuine DB-string-interpolated shell sinks exist and should be converted or the same pattern applied: gates.js:1016 (\`--search "\${sdId}"\`, unguarded) and cross-sd-file-overlap-temporal-ship.js:62 (\`--grep "\${other.sd_key}"\` + an unquoted \${mainRef}). One site is an EXPLICIT BY-DESIGN EXCEPTION, not a conversion target: smoke-test-gate.js:107 executes a command sourced from a PRD field (smokeTestCmd) -- arbitrary execution by design; FR-4's audit output must record this as an accepted exception with written justification, not silently skip it or attempt to "fix" it. gates.js:602/764/1016's \`--repo \${repo}\` interpolation is corrected from LEAD's own earlier (inaccurate) claim that all sibling sites use a hardcoded repo constant: line 601 does, but lines 763 and 1015 source \`repo\` from computeReposForSD(ctx.sd) -- registry/provisioner-derived via the venture path's resolveGitHubRepo(sd.target_application), not attacker-controlled via branch names, but not a hardcoded literal either. Lower severity than the two primary sinks (different, tighter trust boundary) but should be included in FR-4's convert-or-justify accounting for completeness.

## Explicitly out of scope (LEAD decision)
- smoke-test-gate.js:107's PRD-sourced command execution -- accepted-by-design, documented as an exception in FR-4's output, not converted.
- Push-access control itself (who can create branches) -- out of scope, this SD only hardens the gate against what a push-access principal can already do.
- GitHub's server-side PR-merge path -- the reported sinks are local \`git\`/\`gh\` CLI invocations by the gate itself, not a server-side merge mechanism.`;

  const key_changes = [
    { change: "Convert gates.js:887 to execFileSync('git', ['rev-list','--count',\`origin/main..${branch}\`], opts) -- verified NO leading '--' (that form fails)", type: 'fix', impact: 'Closes the confirmed injection sink for `git rev-list --count`' },
    { change: "Convert gates.js:898 to execFileSync('gh', ['pr','list','--repo',repo,'--head',cleanBranch,...], opts)", type: 'fix', impact: 'Closes the confirmed injection sink for `gh pr list --head`, including its quote-breakout variant' },
    { change: 'Migrate the 5 existing tests that mock execSync by string content to mock execFileSync instead, in the same PR as the FR-1 conversion', type: 'testing', impact: 'Prevents shipping a broken test suite alongside the fix; verified baseline is 14/14 passing' },
    { change: 'Add a ref-charset allowlist guard (log-and-reject) as defense-in-depth for FR-4\'s un-converted sinks and future sinks -- never positioned as an alternative to FR-1', type: 'fix', impact: 'Covers sinks this SD does not directly convert, at verified zero cost to legitimate branch names (0/3532 live branches violate the chosen charset)' },
    { change: 'Per-sink payload matrix regression test (quote-breakout + backtick/$() minimum per sink), replacing a single shared PoC string that was verified to be a false green against sink #2 on Windows', type: 'testing', impact: 'Actually proves both sinks are closed, not just that the literal reported PoC string is inert' },
    { change: 'FR-4 audit: convert or justify gates.js:1016 and cross-sd-file-overlap-temporal-ship.js:62 (genuine DB-string sinks); record smoke-test-gate.js:107 as an explicit accepted-by-design exception', type: 'security', impact: 'Completes the class fix rather than leaving 2 more genuine sinks unaccounted for' },
  ];

  const success_criteria = [
    { criterion: 'Both confirmed sinks (gates.js:887, :898) use execFileSync with the verified-correct argv form; a per-sink payload matrix (quote-breakout + backtick/$() minimum) runs zero injected commands against either sink', measure: 'Regression fixture replays each payload variant per sink and asserts no side-effect command executes for any of them, not just the literal reported PoC string' },
    { criterion: 'The 5 pre-existing tests that mock execSync by string content are migrated to mock execFileSync and the full suite passes', measure: 'npx vitest run scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js reports 14+ passing, 0 broken by the FR-1 conversion' },
    { criterion: 'A malformed ref is rejected before reaching any sink, with zero legitimate-branch false positives', measure: 'Fixture: a branch name with shell metacharacters is rejected/logged before any exec call; separately, the charset allowlist is checked against the repo\'s real live branch population and rejects none of them' },
    { criterion: 'FR-4 audit is complete with an accurate inventory, not just implied', measure: 'A recorded count of all shell-interpolated sinks fed by repo/DB-controlled strings in gates.js and sibling executors: each is either converted to execFileSync-array, or explicitly justified (hardcoded/non-attacker-controlled, or an accepted by-design exception like smoke-test-gate.js) -- target 0 unaccounted-for sinks' },
  ];

  const risks = [
    { risk: "FR-1's argv conversion uses the wrong flag/separator placement for one of the two commands and either breaks legitimate branch handling or fails to actually prevent injection", impact: 'high', likelihood: 'low', mitigation: "Both exact argv forms were verified against real git/gh behavior before being written into scope (git rev-list --count -- <rev> confirmed to fail with '--' leading; gh pr list --head as a plain argv element confirmed behavior-identical to the shell form for legitimate branches). Not assumed." },
    { risk: 'FR-3\'s regression test replays only the originally-reported PoC string and misses a real injection path, certifying an incompletely-fixed sink as safe', impact: 'high', likelihood: 'medium (without this correction)', mitigation: 'Corrected in this scope revision to a per-sink payload matrix after LEAD independently verified the single-string PoC is a false green against sink #2 on Windows -- this was the single most consequential finding of the LEAD review and is now a hard FR-3 requirement, not left to EXEC discretion.' },
    { risk: 'The ref-charset guard is too strict and rejects a legitimate branch name', impact: 'low', likelihood: 'low', mitigation: 'Verified against a live census of the repo\'s real remote branches (3532 branches, 0 violations of [A-Za-z0-9._/-]) before finalizing the allowlist.' },
    { risk: "FR-4's audit finds additional sinks whose fix would expand this SD beyond its now-corrected scope", impact: 'low', likelihood: 'low', mitigation: "LEAD's own re-audit already found and scoped the 2 remaining genuine sinks (gates.js:1016, cross-sd-file-overlap-temporal-ship.js:62) plus the one accepted-by-design exception (smoke-test-gate.js:107) -- the full inventory is now known and bounded, not open-ended." },
  ];

  const success_metrics = [
    { metric: 'Injection sink count', target: '0 remaining shell-interpolation sinks fed by repo/DB-controlled strings in gates.js and sibling LEAD-FINAL-APPROVAL executors, excluding the one documented accepted-by-design exception (smoke-test-gate.js)' },
    { metric: 'Payload matrix replay', target: 'Zero injected commands execute across the full per-sink payload matrix (quote-breakout + backtick/$() minimum per sink) post-fix' },
    { metric: 'Zero regressions', target: '0 existing tests broken; PR merge verification / branch scan behavior unchanged for well-formed branch names; the 5 mock-migrated tests pass' },
  ];

  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const metadata = {
    ...existing.metadata,
    lead_scope_correction: {
      corrected_at: new Date().toISOString(),
      corrected_by: 'LEAD (session 9a78de7f-f379-460a-8a47-b2e5e5c5618f)',
      basis: 'VALIDATION sub-agent evidence a1c1b4d9-ddc5-4a60-bedf-4378923d133c + LEAD\'s own independent reproduction of every critical finding (the rev-list -- ordering, the sink #2 false-green-on-Windows for the literal PoC, the 14/14 test baseline, the repo-provenance correction at lines 763/1015) before accepting any of them',
      reason: 'The vulnerability premise was accurate and required no correction. The PROPOSED FIX MECHANICS needed correction: FR-1\'s implied argv form would have broken git rev-list; FR-3\'s single-PoC-string design was a verified false green on Windows for sink #2; FR-1 as scoped would have broken 5 existing tests unmentioned in the original submission; FR-4\'s premise (from LEAD\'s own prior Explore evidence) overstated how many sibling sites were hardcoded-safe.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description,
      key_changes,
      success_criteria,
      risks,
      success_metrics,
      metadata,
    })
    .eq('id', existing.id);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log(`Corrected LEAD-phase scope for ${SD_KEY} (id=${existing.id}).`);
  return { sdId: existing.id };
}

if (isMainModule(import.meta.url)) {
  correctLeadScope().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
