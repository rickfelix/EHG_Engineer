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
 *   4. .claude/settings.json -- CONTENT-level check (QF-20260830-283, chairman ratification
 *      0daf3bd8/iii): hook command strings are worker-editable; the Stop-hook array and any hook
 *      entry whose command references the completion/post-completion enforcement scripts stay
 *      chairman-locked, as do the "permissions"/"statusLine" top-level keys and any hook entry
 *      added/removed. See evaluateSettingsJsonChange in lib/governance/ceremony-scope-lock.js.
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
 * KNOWN LIMITATION (VALIDATION evidence b1dbe3ce): the settings.json content check names exactly
 * one file, `.claude/settings.json`. A hook registered instead through `.claude/settings.local.json`
 * (a real, supported override file for this exact tool) or a brand-new dispatcher file this lint
 * has never heard of would disable the ceremony without touching any checked surface. Separately, the
 * witness-marker check is a bare occurrence COUNT (`hasNetWitnessMarkerLoss`), not a semantic
 * check: a rewrite that swaps `completion_flag_witness` for a differently-spelled but
 * functionally-identical marker, at the same call site, leaves the count net-zero and passes
 * silently. Both are name/count-shaped detection, not behavior-shaped, and neither is closed by
 * this SD -- flagged here rather than left implicit.
 *
 * Usage: node scripts/lint/capture-channel-ceremony-scope-lock-lint.mjs [--base <ref>]
 * Exit: 1 if any ceremony surface is touched, 0 otherwise.
 */
import { makeHardenedGitRunner, VALID_BASE_REF } from '../../lib/git/hardened-runner.cjs';
import {
  evaluateCeremonyScopeLock, WITNESS_CONTENT_FILE, SETTINGS_JSON_PATH,
  extractRatificationId, ratificationNamesSettingsPath,
} from '../../lib/governance/ceremony-scope-lock.js';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

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

function settingsJsonTexts(base, files) {
  if (!files.includes(SETTINGS_JSON_PATH)) return null;
  try {
    const oldText = runGit(['show', `${base}:${SETTINGS_JSON_PATH}`]);
    const newText = runGit(['show', `HEAD:${SETTINGS_JSON_PATH}`]);
    return { oldText, newText };
  } catch {
    return null; // fails closed inside evaluateCeremonyScopeLock
  }
}

// QF-20260905-229: PR 8296/8491 both carried a chairman-keystroked, ratified permissions.allow
// change and both merged with this lint red -- the sanctioned path had no pass path. main() below
// only attempts a citation lookup (and, if one is found, a DB read) when the commit range
// actually cites a ratification id -- the two pre-existing CLI seed tests never do, so this is a
// pure addition with zero behavior change on every diff that isn't citing a ratification.
async function fetchRatificationRow(supabase, ratificationId) {
  // Ratification ids are cited as an 8-hex short form OR a full UUID (extractRatificationId
  // accepts both) -- a short form is a PREFIX of the primary key's text. `id` is typed UUID, and
  // Postgres has no ilike/~~* operator for that type (measured: "operator does not exist: uuid
  // ~~* unknown" -- PostgREST's embedded id::text cast syntax did not help either), so this reads
  // the small (append-only, ~100-row) ledger and does the prefix match client-side instead of
  // fighting a cast in the query string.
  const { data, error } = await supabase.from('chairman_ratifications').select('id, quote, source');
  if (error) {
    console.error(`⚠️  ceremony-scope-lock-lint: chairman_ratifications read failed (${error.message}) -- treating citation as unverified`);
    return null;
  }
  const needle = ratificationId.toLowerCase();
  return (data || []).find((row) => typeof row.id === 'string' && row.id.toLowerCase().startsWith(needle)) || null;
}

async function main() {
  let files;
  try {
    files = changedFiles(base);
  } catch (e) {
    console.error(`⚠️  ceremony-scope-lock-lint: could not diff against ${base} (${e.message.split('\n')[0]}) -- failing closed`);
    process.exit(1);
  }

  let ratVerified = false;
  if (files.includes(SETTINGS_JSON_PATH)) {
    let commitLog = '';
    try {
      commitLog = runGit(['log', '--format=%B', `${base}...HEAD`]);
    } catch {
      commitLog = '';
    }
    const ratificationId = extractRatificationId(commitLog);
    if (ratificationId) {
      try {
        const supabase = createSupabaseServiceClient();
        const row = await fetchRatificationRow(supabase, ratificationId);
        ratVerified = ratificationNamesSettingsPath(row);
        if (ratVerified) {
          console.log(`ℹ️  ceremony-scope-lock-lint: permissions change ratification-verified (id ${ratificationId})`);
        } else {
          console.error(`⚠️  ceremony-scope-lock-lint: cited ratification ${ratificationId} does not name ${SETTINGS_JSON_PATH} -- not treating as verified`);
        }
      } catch (e) {
        console.error(`⚠️  ceremony-scope-lock-lint: ratification ${ratificationId} cited but Supabase unreachable (${e.message.split('\n')[0]}) -- treating as unverified`);
      }
    }
  }

  const result = evaluateCeremonyScopeLock(files, witnessDiffText(base, files), settingsJsonTexts(base, files), { ratificationVerified: ratVerified });

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
  if (result.settingsJsonProtectedKey) {
    console.error(`  ${SETTINGS_JSON_PATH}: refused on protected key "${result.settingsJsonProtectedKey}" (ratification 0daf3bd8/iii permits hook command-string edits only).`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(`⚠️  ceremony-scope-lock-lint: unexpected error (${e && e.message}) -- failing closed`);
  process.exit(1);
});
