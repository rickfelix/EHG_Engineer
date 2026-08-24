#!/usr/bin/env node
/**
 * Capture-channel ceremony scope-lock lint.
 * SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001, FR-5.
 *
 * THE RULE (this SD's LEAD-phase ceremony-boundary determination): this SD's own build must never
 * modify the completion_flag capture ceremony -- the one Stop-hook-encoded mandate in its scope.
 * FR-3/FR-4 explicitly reserve any ACTUAL ceremony change (retire/soften a mandate) to a separate
 * chairman ruling; this lint is the mechanical guarantee that a PR claiming to satisfy that
 * reservation actually does, rather than trusting a one-time LEAD-phase assertion that could drift
 * silently during EXEC.
 *
 * TESTING evidence (8c4733fd) found the original 3-file list had a real gap: deleting/reordering
 * the Stop-hook array entry in .claude/settings.json, or editing the dispatcher script, disables
 * the ceremony without touching either named file. The full surface (pure logic in
 * lib/governance/ceremony-scope-lock.js):
 *   1. scripts/hooks/post-completion-tail-enforcement.cjs (the tail-enforcement Stop hook itself)
 *   2. scripts/hooks/stop-subagent-enforcement/post-completion-validator.js (the witness check)
 *   3. scripts/hooks/stop-subagent-enforcement.js (the dispatcher that invokes #2)
 *   4. .claude/settings.json (path-level: any touch is flagged -- a full JSON diff to isolate a
 *      single Stop-hook array entry is more machinery than this guardrail needs; conservative
 *      over-flagging is preferred to silently missing a targeted entry removal)
 *   5. scripts/capture-completion-flags.js -- CONTENT check, not a path-touch ban (legitimately
 *      edited for unrelated reasons in future SDs); fails only on a NET LOSS of the
 *      completion_flag_witness marker string in the diff.
 *
 * Diffs against origin/main (not the local working tree) so an unrelated pre-existing local
 * modification never produces a false pass or false fail for this lint. Uses the repo's ONE
 * hardened git runner (lib/git/hardened-runner.cjs, SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A) --
 * argv-array spawn, no shell, base-ref shape validated before any process spawn (SECURITY review
 * evidence 40c35949: a hand-rolled execSync string-interpolation call here would have reproduced
 * the exact shell-injection sink class 5 prior SDs/QFs already closed elsewhere in this repo).
 *
 * Usage: node scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs [--base <ref>]
 * Exit: 1 if any ceremony surface is touched, 0 otherwise.
 */
import { makeHardenedGitRunner, VALID_BASE_REF } from '../../lib/git/hardened-runner.cjs';
import { evaluateCeremonyScopeLock, WITNESS_CONTENT_FILE } from '../../lib/governance/ceremony-scope-lock.js';

const runGit = makeHardenedGitRunner(process.cwd(), { timeout: 30000, maxBuffer: 32 * 1024 * 1024 });

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : (process.env.CEREMONY_LINT_BASE || 'origin/main');

if (!VALID_BASE_REF.test(base)) {
  console.error(`⚠️  ceremony-scope-lock-lint: refusing base ref with option-like or unsafe shape: ${JSON.stringify(base)}`);
  process.exit(1);
}

function changedFiles(base) {
  const out = runGit(['diff', '--name-only', '--diff-filter=ACMRD', `${base}...HEAD`]);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function witnessDiffText(base, files) {
  if (!files.includes(WITNESS_CONTENT_FILE)) return null;
  try {
    return runGit(['diff', '-U0', `${base}...HEAD`, '--', WITNESS_CONTENT_FILE]);
  } catch {
    return null;
  }
}

function main() {
  let files;
  try {
    files = changedFiles(base);
  } catch (e) {
    console.error(`⚠️  ceremony-scope-lock-lint: could not diff against ${base} (${e.message.split('\n')[0]}) -- failing closed`);
    process.exit(1);
  }

  const result = evaluateCeremonyScopeLock(files, witnessDiffText(base, files));

  if (result.pass) {
    console.log(`✅ capture-channel-ceremony-scope-lock-lint: no ceremony surface touched (base=${base})`);
    process.exit(0);
  }

  console.error('❌ capture-channel-ceremony-scope-lock-lint FAILED');
  console.error('This PR touches the completion_flag capture ceremony, which SD-LEO-INFRA-CAPTURE-CHANNEL-DISPOSITION-001');
  console.error('explicitly reserves to a separate chairman ruling (FR-3/FR-4). If this is a deliberate,');
  console.error('chairman-approved ceremony change, it belongs in its own SD, not folded into this one.');
  if (result.bannedTouches.length) {
    console.error('  Touched ceremony file(s):');
    for (const f of result.bannedTouches) console.error(`    - ${f}`);
  }
  if (result.witnessMarkerLost) {
    console.error(`  ${WITNESS_CONTENT_FILE}: the completion_flag_witness marker string was removed/reduced in this diff.`);
  }
  process.exit(1);
}

main();
