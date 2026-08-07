#!/usr/bin/env node
/**
 * One-off: write VALIDATION LEAD-phase evidence for
 * SD-LEO-INFRA-THREE-REFUSAL-TESTS-001, independently verifying the worker's
 * DETERMINATION (not a fix — binding coordinator ruling forbids editing the
 * three tests) that all three red tests are environment-dependent, the
 * refusal/isolation logic is INTACT, and there is NO fail-open.
 *
 * Independently re-ran both the baseline and the neutralized reproduction,
 * read the two `??` fallback sites named in the claim, and adversarially
 * checked whether restart() reaching ok:true with a resolvable profile dir
 * constitutes a loss of isolation (it does not — CLAUDE_CONFIG_DIR is set to
 * the real profiles-dir subpath, sourced from process.env instead of failing
 * loud, and that directory genuinely exists on this host).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 — no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '581a0da1-331a-4429-9969-a45667df076f';
const SD_KEY = 'SD-LEO-INFRA-THREE-REFUSAL-TESTS-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings: [
      {
        id: 'F1-baseline-reproduced-3-failed-66-passed',
        severity: 'INFO',
        summary: "Independently re-ran `npx vitest run tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js tests/unit/fleet/spawn-control.test.js` against this worktree's real, unmodified .env (which sets FLEET_SPAWN_CONTROL_LIVE=true at line 186 and FLEET_ACCOUNT_PROFILES_DIR=C:\\Users\\rickf\\.claude-fleet-profiles at line 183). Result: 3 failed / 66 passed — matches the worker's reported baseline exactly (same 2 files, same test names: the two 'WITHOUT opts.live' cp3 propagation tests, and spawn-control.test.js's 'FR-6: restarting a profile-stamped session with NO profiles dir configured FAILS LOUD').",
      },
      {
        id: 'F2-neutralized-69-passed-confirmed',
        severity: 'INFO',
        summary: 'Independently re-ran the same command with FLEET_SPAWN_CONTROL_LIVE=false and FLEET_ACCOUNT_PROFILES_DIR= exported ahead of dotenvx injection (dotenvx does not override already-set shell vars by default, confirmed by the tool\'s own "injected env (0)" output). Result: 69 passed / 69 total, 2 test files passed. Matches the worker\'s reported neutralized count exactly.',
      },
      {
        id: 'F3-mechanism-confirmed-at-both-cited-line-numbers',
        severity: 'INFO',
        summary: "Read lib/fleet/spawn-control.js directly. Line 227: `const live = opts.live ?? isLiveEnabled();` — isLiveEnabled() is called with zero arguments. Its signature at line 115 is `export function isLiveEnabled(env = process.env)`, so the no-arg call defaults to reading process.env directly, NOT the opts.env (GUARD_ENV = {FLEET_CANARY_KILL_ENABLED:'true'}) the two cp3 tests thread through canaryRestart/canaryRelaunchUnderProfile. Line 103: `const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null;` — an explicit `baseDir: null` from a caller (as spawn-control.test.js:882's FR-6 case supplies) is nullish and therefore falls through to process.env.FLEET_ACCOUNT_PROFILES_DIR rather than staying null. Both `??` chains match the claim's description exactly; this is one root-cause class (env-var fallback shadowing an explicit test-supplied absence), not two independent defects.",
      },
      {
        id: 'F4-code-idiom-corroborates-the-env-var-is-a-known-narrow-carrier-not-general-override',
        severity: 'INFO',
        summary: "spawn-control.js:302-317 (the tree-currency check inside spawn()) carries an explicit, on-the-record comment explaining why opts.env is deliberately NOT read there: 'callers such as canaryRestart/relaunchUnderProfile pass a NARROW opts.env carrying one unrelated feature flag..., and because that value REPLACES process.env wholesale rather than extending it, keying the currency check off it made [the bypass] silently unreachable on every canary path.' This independently corroborates that opts.env in this codebase is a narrow, single-purpose carrier (not a general environment override plumbed into every env-reading helper) and that isLiveEnabled() reading real process.env instead of the narrow opts.env is consistent with an established, deliberate idiom elsewhere in the same file — not an isolated oversight invented for this claim.",
      },
      {
        id: 'F5-adversarial-check-fr6-restart-still-applies-real-isolation-not-fail-open',
        severity: 'INFO',
        summary: "Directly inspected the FR-6 test's actual (not expected) result under the real .env: restart('Canary-1', {..., baseDir: null}) resolves and returns ok:true with spawnFn's captured env.CLAUDE_CONFIG_DIR === 'C:\\\\Users\\\\rickf\\\\.claude-fleet-profiles\\\\canary' — i.e. the profile-isolation directory IS applied, sourced from process.env.FLEET_ACCOUNT_PROFILES_DIR instead of throwing as the test (which assumes a totally unconfigured host) expects. Verified C:\\Users\\rickf\\.claude-fleet-profiles\\canary genuinely exists on this host (not a dangling/fabricated path). This directly answers the SD title's fail-open framing ('a profile-stamped restart can launch without its isolation and report success'): the restart here launches WITH its isolation (env-resolved profiles dir) and reports success; nothing launches unisolated. No regression found under this reading — the only defect is that resolveProfileDir treats caller-supplied `baseDir: null` as absent (falls through to env) rather than as an explicit deliberate-unconfigured signal, which is a test-fixture/production-env mismatch, not a live isolation loss.",
      },
      {
        id: 'F6-adversarial-check-cp3-is-live-true-here-actually-wrong',
        severity: 'INFO',
        summary: "For the two cp3 propagation tests: isLiveEnabled()'s own doc comment (spawn-control.js:114) states 'True only when the operator has explicitly enabled the live OS spawn/relaunch surface.' This repo's operator (this developer) HAS explicitly set FLEET_SPAWN_CONTROL_LIVE=true in their local, gitignored .env (confirmed untracked via `git check-ignore`/`git ls-files`) — so honoring that as 'live' is the function's documented contract working as designed, not a defect. The tests' own header comment (line 96) states they reproduce 'the exact real-world condition (drill process without the env var exported)' — an assumption about a DIFFERENT process's environment (the CP3 drill runner) that does not hold for this developer's persistent local shell. Additionally, in both failing cp3 cases spawnFn is a vi.fn() mock (never a real OS spawn), so 'live=true here' produces zero real side effects in the test process — the failure is purely an assertion mismatch (spawnFn WAS called when the test expected it NOT to be), not evidence of an unguarded real launch.",
      },
    ],
    warnings: [
      "The determination is sound but exposes a real (non-blocking) test-fragility class worth flagging for a future SD/QF, NOT for this one under the binding no-edit ruling: these 3 tests silently change verdict based on the developer's local, gitignored .env rather than an isolated/controlled env, which is a general hazard for reproducibility across machines/CI. Recommend a follow-up (separate from this SD, which is scoped to the DETERMINATION only) to either (a) have isLiveEnabled()/resolveProfileDir consistently read the SAME env carrier callers already thread through opts.env, or (b) have the test harness explicitly clear FLEET_SPAWN_CONTROL_LIVE/FLEET_ACCOUNT_PROFILES_DIR for this suite. Not raised as a finding against the current determination — the determination correctly identifies the CURRENT behavior as environment-dependent and non-fail-open.",
    ],
    recommendations: [
      'Accept the DETERMINATION as CONFIRMED: the live restart/relaunch/spawn refusal and profile-isolation logic is intact on origin/main; the 3 red tests are caused by this developer\'s local .env supplying values the tests assumed absent, not by a fail-open code defect.',
      'Do not edit the three tests per the binding coordinator ruling; any follow-on hardening (env-carrier consistency or test-env isolation) belongs in a separate SD/QF, not this one.',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      verification_method: 'Independent re-run of both cited vitest commands against this worktree, direct read of lib/fleet/spawn-control.js lines 97-234, git check-ignore/ls-files check on .env, and a filesystem existence check on the resolved profiles directory.',
      baseline_measured: { command: 'npx vitest run tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js tests/unit/fleet/spawn-control.test.js', result: '3 failed / 66 passed', matches_claim: true },
      neutralized_measured: { command: 'FLEET_SPAWN_CONTROL_LIVE=false FLEET_ACCOUNT_PROFILES_DIR= <same command>', result: '69 passed (69)', matches_claim: true },
      env_dot_file: { tracked: false, gitignored: true, FLEET_SPAWN_CONTROL_LIVE: 'true (line 186)', FLEET_ACCOUNT_PROFILES_DIR: 'C:\\Users\\rickf\\.claude-fleet-profiles (line 183, directory exists with a canary/ subdir)' },
      code_sites: {
        'spawn-control.js:227': "const live = opts.live ?? isLiveEnabled(); -- isLiveEnabled() called with no arg, defaults to process.env per its own signature (line 115).",
        'spawn-control.js:103': "const baseDir = opts.baseDir ?? process.env.FLEET_ACCOUNT_PROFILES_DIR ?? null; -- caller's explicit baseDir:null is nullish, falls through to env.",
      },
      fr6_actual_result_under_real_env: { ok: true, 'spawnResult.env.CLAUDE_CONFIG_DIR': 'C:\\Users\\rickf\\.claude-fleet-profiles\\canary', interpretation: 'profile isolation IS applied via env fallback; no unisolated launch occurs' },
    }),
    metadata: {
      verified_claims: {
        baseline_3_failed_66_passed: 'CONFIRMED (independently re-run, exact match)',
        neutralized_69_passed: 'CONFIRMED (independently re-run, exact match)',
        root_cause_single_class_nullish_coalescing_env_fallback: 'CONFIRMED (read both cited lines, both match)',
        refusal_logic_intact_no_fail_open: 'CONFIRMED — adversarial check on FR-6 shows restart() reaching ok:true still applies real, existing-on-disk profile isolation via the env fallback, not a bypass of isolation',
      },
      binding_ruling_honored: 'Did not edit tests/unit/fleet/cp3-restart-relaunch-live-flag-propagation.test.js or tests/unit/fleet/spawn-control.test.js; validation-only.',
    },
    phase: 'LEAD',
    validation_mode: 'retrospective',
    summary: "PASS for LEAD-TO-PLAN. Independently re-ran both cited vitest commands and got identical counts to the worker's report (3 failed/66 passed baseline; 69 passed neutralized). Read spawn-control.js:103 and :227 directly and confirmed the described `opts.X ?? process.env.Y` nullish-coalescing pattern at both sites, one root-cause class. Adversarially checked the strongest counter-reading (does restart() reaching ok:true under FR-6's baseDir:null actually skip isolation?) and found it does not: CLAUDE_CONFIG_DIR is still set to the real, on-disk, env-resolved profile subdirectory — the profile-stamped restart launches WITH isolation and reports success, contradicting the possibility of the title's fail-open framing being literally true in the current codebase. The determination that all three failures are environment-dependent (this developer's persistent, gitignored .env), the refusal/isolation logic is intact, and there is no fail-open is CONFIRMED with high confidence. One non-blocking observation logged as a warning for a future, separate SD/QF: the tests' verdict is sensitive to an uncontrolled local env, which is a reproducibility hazard independent of today's determination.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('VALIDATION result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
