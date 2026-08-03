/**
 * FR-3 POST-MERGE VALIDATION for SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001.
 *
 * Condition 2 of the coordinator ruling (2026-08-02T22:41:52Z) gates SD COMPLETION on this: the SD
 * is not done when the PR merges, it is done when the demonstration is captured. This script
 * produces that record, in the shape SD-FDBK-INFRA-LESSONS-CONVERSION-WIRING-001 established
 * (how / status, evidence captured ONCE to a file, against code verified byte-identical to merged
 * main).
 *
 * IT IS BUILT TO BE UNSATISFIABLE WITHOUT THE REAL DEMONSTRATION. FR-3 exists precisely to stop
 * fixture-only evidence passing for the real thing, and this SD already deferred AC-1 once (to
 * post-merge) — so the validator that closes it must be the hardest thing to fool in the SD, not
 * the easiest. It refuses to emit SATISFIED unless a real spawn was observed succeeding, and it
 * will not accept its own precondition capture as a substitute.
 *
 * Usage (post-merge, on a tree at merged main):
 *   node scripts/one-off/_alpha-fr3-post-merge-validate.mjs --spawn-evidence <path-to-json>
 *
 * The spawn-evidence file must be produced by whoever ran the live spawn and must contain:
 *   {
 *     observed_at_utc, spawn_succeeded: true, session_or_handle, invoked_by, notes,
 *     flag_state,              // FLEET_SPAWN_SOURCE_TREE in force at spawn time — must be affirmative
 *     currency_bypass_reason,  // FLEET_TREE_CURRENCY_BYPASS_REASON — must be present and empty/null
 *   }
 *
 * The last two are not bookkeeping. "A spawn succeeded" is compatible with the flag being OFF (the
 * shipped default, under which this SD is entirely inert) and with the currency bypass being set
 * (which makes the guard return ok without establishing currency). Both produce the same observation
 * as a genuine fix, so the run conditions are part of the evidence, not context around it.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const evidencePath = get('--spawn-evidence');
const outPath = get('--out') || 'fr3-post-merge-record.json';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const root = path.dirname(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], process.cwd()));

/** The files this SD changed. Byte-identity is asserted per-file, not by a bare "we merged it". */
const CHANGED = [
  'lib/fleet/spawn-control.js',
  'server/routes/fleet-actions.js',
  '.gitignore',
];

const failures = [];

// ---- CHECK 1: the running code IS the merged code -------------------------------------------
// A validation run against a tree that merely LOOKS current proves nothing about what the fleet
// executes. Diff each changed file against origin/main and require empty.
git(['fetch', 'origin', 'main'], root);
const notIdentical = [];
for (const f of CHANGED) {
  if (!existsSync(path.join(root, f))) { notIdentical.push(`${f} (missing)`); continue; }
  const d = git(['diff', 'origin/main', '--', f], root);
  if (d) notIdentical.push(f);
}
if (notIdentical.length) {
  failures.push(`code is NOT byte-identical to origin/main for: ${notIdentical.join(', ')}`);
}

// ---- CHECK 2: the fix is actually PRESENT in the merged code ---------------------------------
// Byte-identity to main is necessary but not sufficient: it would also hold if the SD had never
// merged at all. Assert the shipped symbols exist, so "identical" cannot mean "identically absent".
const spawnControl = existsSync(path.join(root, 'lib/fleet/spawn-control.js'))
  ? readFileSync(path.join(root, 'lib/fleet/spawn-control.js'), 'utf8') : '';
for (const sym of ['ensureSpawnSourceWorktree', 'isSpawnSourceTreeEnabled', 'SPAWN_SOURCE_BRANCH', 'buildSpawnSourceUpdateArgs']) {
  if (!spawnControl.includes(sym)) failures.push(`merged code is missing ${sym} — the SD is not actually in main`);
}
if (spawnControl.includes("'worktree', 'add', '--detach'")) {
  failures.push('merged code still creates the spawn source --detach — the FR-2 fix is not in main');
}

// ---- CHECK 3: the preconditions, captured ONCE -------------------------------------------------
// Re-running an instrument for display re-runs its side effects and lets the numbers drift between
// the check and the record. One capture, reused for both.
// Resolved beside THIS script, not under the repo root: the two ship together, so a run from the
// feature worktree pre-merge finds it exactly as a run from the root post-merge does. Resolving
// against the root made a pre-merge run die on MODULE_NOT_FOUND instead of reporting why.
const CAPTURE = path.join(HERE, '_alpha-fr3-precondition-capture.mjs');
let capture = {};
try {
  if (!existsSync(CAPTURE)) throw new Error(`capture script not found at ${CAPTURE}`);
  capture = JSON.parse(
    execFileSync('node', [CAPTURE, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  );
} catch (e) {
  // A crash here must become a RECORDED FAILURE, never a stack trace. An exception exits non-zero
  // with no record written, which is indistinguishable from "nobody ran the validation" — and this
  // whole SD is about states that cannot be told apart.
  failures.push(`precondition capture failed to run: ${String(e.message).split('\n')[0]}`);
}
if (!capture.window_open) {
  failures.push(`window was CLOSED or unmeasured at validation time: ${(capture.why_not_open || ['no capture']).join('; ')}`);
}

// ---- CHECK 4: a REAL spawn was observed succeeding ---------------------------------------------
// The half that cannot be automated, and therefore the half most likely to be quietly skipped.
// Absent or malformed evidence is a HARD failure, never a warning.
let spawnEvidence = null;
if (!evidencePath) {
  failures.push('NO --spawn-evidence supplied. AC-1 requires a spawn observed SUCCEEDING; a precondition capture alone is exactly the fixture-only pass FR-3 forbids.');
} else if (!existsSync(evidencePath)) {
  failures.push(`--spawn-evidence file not found: ${evidencePath}`);
} else {
  spawnEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  if (spawnEvidence.spawn_succeeded !== true) failures.push('spawn evidence does not assert spawn_succeeded === true');
  for (const k of ['observed_at_utc', 'invoked_by']) {
    if (!spawnEvidence[k]) failures.push(`spawn evidence missing required field: ${k}`);
  }

  // THE HOLE THIS CLOSES, found after the merge and before this validator was ever used in anger.
  // "A spawn succeeded" is NOT evidence that THIS SD's fix worked — there are two other ways to get
  // the same observation, and the original version of this file could not tell any of them apart:
  //
  //   1. FLEET_SPAWN_SOURCE_TREE was OFF. That is the DEFAULT this SD shipped, so it is the likely
  //      state, and under it spawn() never touches the spawn-source tree at all — the currency check
  //      still points at the spawning tree and the whole SD is inert. A spawn observed succeeding
  //      that way proves only that the root happened to be current.
  //   2. FLEET_TREE_CURRENCY_BYPASS_REASON was set. That is a documented escape hatch which makes
  //      enforceTreeCurrency return ok WITHOUT establishing currency ("UNKNOWN-AND-DECLARED, never
  //      CURRENT" — tree-currency.cjs). A bypassed spawn succeeds identically to a fixed one.
  //
  // Either would have produced a SATISFIED record for an SD whose fix was never exercised. That is
  // precisely the class of defect this SD exists to eliminate, reproduced inside the instrument
  // built to certify it — so the evidence must now carry the run conditions, not just the outcome.
  const flag = String(spawnEvidence.flag_state ?? '').trim().toLowerCase();
  if (!['1', 'true', 'on', 'yes'].includes(flag)) {
    failures.push(
      `spawn evidence must record flag_state = the FLEET_SPAWN_SOURCE_TREE value in force at spawn time, ` +
      `and it must be affirmative (got: ${JSON.stringify(spawnEvidence.flag_state ?? null)}). With the flag OFF ` +
      `the spawn-source path is never taken, so a successful spawn demonstrates nothing about this SD.`,
    );
  }
  const bypass = String(spawnEvidence.currency_bypass_reason ?? '').trim();
  if (bypass) {
    failures.push(
      `spawn evidence reports FLEET_TREE_CURRENCY_BYPASS_REASON=${JSON.stringify(bypass)}. A bypassed spawn ` +
      `succeeds without currency ever being established, so it cannot demonstrate AC-1.`,
    );
  } else if (!('currency_bypass_reason' in spawnEvidence)) {
    failures.push(
      'spawn evidence must record currency_bypass_reason explicitly (empty string or null if unset). ' +
      'An ABSENT field is not the same as an observed-unset one, and only the latter rules out a bypassed spawn.',
    );
  }
}

const record = {
  sd: 'SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001',
  fr: 'FR-3',
  ruling: 'coordinator 2026-08-02T22:41:52Z — option (a) post-merge acceptance, condition 2',
  validated_at_utc: new Date().toISOString(),
  status: failures.length === 0 ? 'SATISFIED' : 'NOT SATISFIED',
  how: failures.length === 0
    ? 'One live spawn observed succeeding against the real shared root, executed against code ' +
      'verified byte-identical to merged origin/main on every changed file AND verified to actually ' +
      'contain the shipped symbols (so "identical" cannot mean "identically absent"). Preconditions ' +
      'captured ONCE to this record by _alpha-fr3-precondition-capture.mjs and formatted from that ' +
      'single capture, never by re-running the instrument.'
    : 'NOT SATISFIED — see failures[]. This record is deliberately emitted on failure too, so an ' +
      'absent validation is distinguishable from a failed one.',
  failures,
  preconditions: {
    behind_origin_main: capture.behind_origin_main,
    tracked_dirty_count: capture.tracked_dirty_count,
    untracked_count: capture.untracked_count,
    window_open: capture.window_open,
    guard_verdict: capture.guard_assessment,
    spawn_refused_in_this_state: capture.spawn_refused_in_this_state,
  },
  code_identity: { changed_files: CHANGED, not_identical_to_origin_main: notIdentical },
  spawn_evidence: spawnEvidence,
  fixture_only_is_not_sufficient:
    'Stated explicitly per FR-3 AC-3. This record is invalid without spawn_evidence asserting a real ' +
    'spawn succeeded; the precondition capture alone never satisfies AC-1.',
};

writeFileSync(outPath, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
console.log(`\nrecord written to ${outPath}`);
console.log(record.status === 'SATISFIED'
  ? '\nSATISFIED — write this to strategic_directives_v2.metadata.post_merge_verification_result, then LEAD-FINAL may run.'
  : `\nNOT SATISFIED (${failures.length} failure(s)) — LEAD-FINAL stays blocked per condition 2.`);
process.exit(record.status === 'SATISFIED' ? 0 : 1);
