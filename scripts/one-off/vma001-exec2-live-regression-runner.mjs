#!/usr/bin/env node
/**
 * LIVE regression runner for SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001 @ b91f578dc9a.
 *
 * Discharges PRD TS-5 (the live-DB integration scenario the earlier EXEC evidence row left
 * UNBOUND) and proves the three SECURITY-review fixes hold against the REAL database, not a
 * fixture. `npm run migration:apply-state` is a read-only advisory verifier -- it issues only
 * SELECTs against pg_proc/pg_class and writes nothing -- so running it live is safe.
 *
 * This script MEASURES; it does not accept any expected value as input. It writes one JSON
 * artifact which the evidence writer hashes and re-parses.
 *
 * Checks:
 *   (a) gaps[] contains ZERO entries with status BODY_MISMATCH
 *   (b) bodyMismatches[] is non-empty and every entry has status BODY_MISMATCH
 *   (c) no entry in files[].missing[] or gaps[].missing[] carries a `body` key
 *  (c+) the serialized payload contains no `"body":` key anywhere
 *   (d) seed-migration-dispositions.mjs --gaps=<fixed output> reports seeded: 0
 *   (e) COUNTERFACTUAL: the same seeder, fed a reconstructed PRE-FIX gaps array
 *       (gaps + bodyMismatches merged, i.e. what commit 1b175452b9c produced), seeds > 0 --
 *       demonstrating the HIGH-severity bug was real and is now closed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(REPO_ROOT, '.artifacts', 'test-results');
const TMP = path.join(REPO_ROOT, 'scripts', 'temp');
const ARTIFACT = path.join(OUT_DIR, 'vma001-exec2-live-regression.json');

const fixedJson = path.join(TMP, 'apply-state-out.json');
const buggyJson = path.join(TMP, 'apply-state-BUGGY-SHAPE.json');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const node = process.execPath;
const run = (args, opts = {}) => {
  try {
    return { ok: true, out: execFileSync(node, args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`, code: e.status };
  }
};

// ---------------- 1. Live run of the verifier against the real DB ----------------
const verifier = run([path.join(REPO_ROOT, 'scripts', 'verify-migration-apply-state.mjs'), '--json']);
const rawStdout = verifier.out;
fs.writeFileSync(fixedJson, rawStdout);
// Anchor on a line-start brace: invoking via node emits a dotenvx `{ override: true }`
// preamble, so a naive indexOf('{') captures the wrong object.
const jsonStart = rawStdout.search(/^\{$/m);
if (jsonStart < 0) throw new Error('no line-start JSON object found in verifier stdout');
const report = JSON.parse(rawStdout.slice(jsonStart));

// ---------------- 2. The three shape checks ----------------
const gaps = Array.isArray(report.gaps) ? report.gaps : null;
const bmKey = ['bodyMismatches', 'body_mismatches'].find((k) => Array.isArray(report[k]));
const bm = bmKey ? report[bmKey] : null;

const bodyMismatchInGaps = (gaps || []).filter((g) => g.status === 'BODY_MISMATCH');
const bmWrongStatus = (bm || []).filter((e) => e.status !== 'BODY_MISMATCH');

const leaks = [];
let missingEntriesScanned = 0;
for (const [label, arr] of [['files', report.files], ['gaps', report.gaps]]) {
  for (const f of arr || []) {
    for (const m of f.missing || []) {
      missingEntriesScanned += 1;
      if (Object.prototype.hasOwnProperty.call(m, 'body')) leaks.push(`${label}:${f.file}:${m.name ?? '?'}`);
    }
  }
}
const serialized = JSON.stringify(report);
const bodyKeyHits = (serialized.match(/"body"\s*:/g) || []).length;

// ---------------- 3. Seeder against the FIXED output ----------------
const seederFixed = run([path.join(REPO_ROOT, 'scripts', 'seed-migration-dispositions.mjs'), `--gaps=${fixedJson}`]);
const seededFixedMatch = seederFixed.out.match(/^\s*seeded:\s*(\d+)/m);
const seededFixed = seededFixedMatch ? Number(seededFixedMatch[1]) : null;

// ---------------- 4. COUNTERFACTUAL: seeder against the reconstructed PRE-FIX shape ----------------
const preFix = JSON.parse(serialized);
preFix.gaps = [...(gaps || []), ...(bm || [])];
fs.writeFileSync(buggyJson, JSON.stringify(preFix, null, 2));
const seederBuggy = run([path.join(REPO_ROOT, 'scripts', 'seed-migration-dispositions.mjs'), `--gaps=${buggyJson}`]);
const seededBuggyMatch = seederBuggy.out.match(/^\s*seeded:\s*(\d+)/m);
const seededBuggy = seededBuggyMatch
  ? Number(seededBuggyMatch[1])
  : (seederBuggy.out.match(/^\s+DEFERRED\s+/gm) || []).length;
const buggyDeferredFiles = [...seederBuggy.out.matchAll(/^\s+DEFERRED\s+(\S+)/gm)].map((m) => m[1]);

// ---------------- 5. Derived check results ----------------
const checks = {
  verifier_ran_live: verifier.ok || /MIGRATION_APPLY_STATE_GAPS_FOUND/.test(rawStdout),
  a_no_body_mismatch_in_gaps: gaps !== null && bodyMismatchInGaps.length === 0,
  b_body_mismatches_array_populated_and_correctly_statused:
    Array.isArray(bm) && bm.length > 0 && bmWrongStatus.length === 0,
  c_no_body_key_in_any_missing_entry: leaks.length === 0,
  c_plus_no_body_key_anywhere_in_payload: bodyKeyHits === 0,
  d_seeder_seeds_zero_on_fixed_output: seededFixed === 0,
  e_counterfactual_prefix_shape_would_have_seeded: seededBuggy > 0,
};

const artifact = {
  generated_at: new Date().toISOString(),
  sd_key: 'SD-LEO-INFRA-VERIFY-MIGRATION-APPLY-001',
  head_sha: 'b91f578dc9afb64621ae0cd58d15b743641db823',
  runner: 'scripts/one-off/vma001-exec2-live-regression-runner.mjs',
  target: 'REAL database (read-only advisory verifier; SELECT-only, no writes)',
  summary_counters: report.summary,
  measurements: {
    gaps_length: gaps ? gaps.length : null,
    body_mismatch_entries_in_gaps: bodyMismatchInGaps.length,
    body_mismatches_key: bmKey,
    body_mismatches_length: bm ? bm.length : null,
    body_mismatches_with_wrong_status: bmWrongStatus.length,
    files_scanned: (report.files || []).length,
    missing_entries_scanned: missingEntriesScanned,
    body_key_leaks: leaks,
    body_key_hits_in_serialized_payload: bodyKeyHits,
    seeder_fixed_seeded: seededFixed,
    seeder_prefix_counterfactual_seeded: seededBuggy,
    seeder_prefix_counterfactual_deferred_files: buggyDeferredFiles,
  },
  checks,
  all_checks_passed: Object.values(checks).every(Boolean),
  seeder_fixed_stdout_tail: seederFixed.out.trim().split('\n').slice(-8).join('\n'),
  seeder_prefix_stdout_tail: seederBuggy.out.trim().split('\n').slice(-12).join('\n'),
};

fs.writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ checks, all_checks_passed: artifact.all_checks_passed, measurements: artifact.measurements }, null, 2));
console.log(`\nartifact: ${path.relative(REPO_ROOT, ARTIFACT)}`);
process.exit(artifact.all_checks_passed ? 0 : 1);
