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
 * modification never produces a false pass or false fail for this lint.
 *
 * Usage: node scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs [--base <ref>]
 * Exit: 1 if any ceremony surface is touched, 0 otherwise.
 */
import { execSync } from 'node:child_process';
import { evaluateCeremonyScopeLock, WITNESS_CONTENT_FILE } from '../../lib/governance/ceremony-scope-lock.js';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : (process.env.CEREMONY_LINT_BASE || 'origin/main');

function changedFiles(base) {
  const out = execSync(`git diff --name-only --diff-filter=ACMRD ${base}...HEAD`, { encoding: 'utf8', timeout: 30000 });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function witnessDiffText(base, files) {
  if (!files.includes(WITNESS_CONTENT_FILE)) return null;
  try {
    return execSync(`git diff -U0 ${base}...HEAD -- ${WITNESS_CONTENT_FILE}`, { encoding: 'utf8', timeout: 30000 });
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
