#!/usr/bin/env node
/**
 * SD-LEO-INFRA-TRIAGE-2026-BULK-001 — the re-triage report.
 *
 * Reads tests/quarantine-manifest.json, separates the 2026-06-11 bulk cohort from the
 * individually-dated entries, and reports drift / regression / undetermined / unprocessed.
 *
 * WHAT THIS TOOL WILL NOT DO, by construction:
 *   - It will not print a single merged figure. Cohorts stay separate, because folding the
 *     individually-dated entries into the bulk manufactures an event that did not happen.
 *   - It will not accept a verdict without a citation (lib/quarantine/retriage.js throws).
 *   - It will not let a shared rationale across the boolean-inversion candidates pass, even when
 *     every verdict in it is correct.
 *   - It will not report `undetermined` and `unprocessed` as one number.
 *
 * --verify-calibration re-derives the ONE known answer from GIT, because the calibration entry is
 * no longer in the manifest (removed by 071758279d1). A method that cannot reproduce the single
 * case whose answer is known is not fit to judge 106 unknowns — so this runs FIRST, not as a spot
 * check afterwards.
 *
 * Exit 0 = report clean. 1 = a guard fired. 2 = unreadable (never a pass).
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  splitCohorts, examinationOrder, signatureRank, summarise,
  findUncitedVerdicts, detectSharedRationale,
  CALIBRATION_SIGNATURE, BULK_DATE, REGRESSION,
} from '../lib/quarantine/retriage.js';

const MANIFEST = 'tests/quarantine-manifest.json';
const CALIBRATION_FILE = 'scripts/modules/handoff/executors/lead-final-approval/gates/pr-merge-verification.test.js';
const REMOVAL_COMMIT = '071758279d1';

const argv = process.argv.slice(2);
const VERIFY_CALIBRATION = argv.includes('--verify-calibration');
const JSON_OUT = argv.includes('--json');

/** Verdicts recorded so far. Empty until entries are discriminated — deliberately not seeded. */
function loadVerdicts() {
  try {
    return JSON.parse(readFileSync('tests/quarantine-retriage-verdicts.json', 'utf8')).verdicts || [];
  } catch { return []; }
}

/**
 * Re-derive the calibration verdict from git. The entry is gone from the manifest, so the proof
 * lives in history plus the test file's own header.
 */
function verifyCalibration() {
  const out = { file: CALIBRATION_FILE, checks: [] };
  const add = (name, ok, detail) => out.checks.push({ name, ok, detail });

  try {
    const log = execFileSync('git', ['log', '--oneline', '-S', 'pr-merge-verification', '--', MANIFEST], { encoding: 'utf8' });
    add('was_in_manifest', /\S/.test(log), log.trim().split('\n').filter(Boolean).length + ' commit(s) touched its manifest entry');
    add('was_un_shelved', log.includes(REMOVAL_COMMIT.slice(0, 9)), `removal commit ${REMOVAL_COMMIT} present in history`);
  } catch (e) { add('was_in_manifest', false, e.message.slice(0, 100)); }

  try {
    const header = readFileSync(CALIBRATION_FILE, 'utf8').split('\n').slice(0, 30).join('\n');
    add('header_records_quarantine_date', header.includes(BULK_DATE), `header cites ${BULK_DATE}`);
    add('header_records_the_label', /assertion-drift/.test(header), 'header names reason_class assertion-drift');
    // The verdict itself: the label said the TEST was stale; the CODE had changed.
    add('header_records_the_verdict', /label asserting the TEST was stale/i.test(header) && /CODE had/i.test(header),
      'header states the label was wrong and the code had changed');
  } catch (e) { add('header_readable', false, e.message.slice(0, 100)); }

  const failed = out.checks.filter((c) => !c.ok);
  out.verdict = failed.length === 0 ? REGRESSION : 'UNVERIFIED';
  out.reproduced = failed.length === 0;
  return out;
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    console.error(`UNREADABLE: cannot read ${MANIFEST}: ${e.message}`);
    process.exit(2);
  }
  const entries = manifest.quarantined;
  if (!Array.isArray(entries)) { console.error(`UNREADABLE: ${MANIFEST} has no quarantined array.`); process.exit(2); }

  const { bulk, individual, totalAssertionDrift } = splitCohorts(entries);
  const verdicts = loadVerdicts();
  const bulkSummary = summarise(bulk, verdicts);
  const indSummary = summarise(individual, verdicts);
  const uncited = findUncitedVerdicts(verdicts);
  const shared = detectSharedRationale(bulk, verdicts);
  const candidates = examinationOrder(bulk).filter((e) => signatureRank(e) <= 1);

  let calibration = null;
  if (VERIFY_CALIBRATION) calibration = verifyCalibration();

  if (JSON_OUT) {
    console.log(JSON.stringify({ bulkSummary, indSummary, uncited, shared, candidates: candidates.length, calibration }, null, 2));
  } else {
    if (calibration) {
      console.log('=== CALIBRATION (the one known answer, re-derived from git) ===');
      for (const c of calibration.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(32)} ${c.detail}`);
      console.log(`  VERDICT: ${calibration.verdict}` + (calibration.reproduced ? ' — method reproduces the known answer' : ' — METHOD DID NOT REPRODUCE THE KNOWN ANSWER'));
      console.log();
    }
    console.log(`=== COHORT: ${BULK_DATE} bulk shelving (the only cohort carrying the bulk argument) ===`);
    console.log(`  total ${bulkSummary.total} | drift ${bulkSummary.drift} | regression ${bulkSummary.regression} | UNDETERMINED ${bulkSummary.undetermined} | unprocessed ${bulkSummary.unprocessed}`);
    console.log(`=== COHORT: individually-dated assertion-drift (NOT part of the bulk event) ===`);
    console.log(`  total ${indSummary.total} | drift ${indSummary.drift} | regression ${indSummary.regression} | UNDETERMINED ${indSummary.undetermined} | unprocessed ${indSummary.unprocessed}`);
    console.log(`  (assertion-drift overall: ${totalAssertionDrift} — deliberately NOT reported as one figure)`);
    console.log(`\n=== LOOK-FIRST ORDER (NOT a verdict) ===`);
    console.log(`  ${candidates.length} entries share the calibration signature "${CALIBRATION_SIGNATURE}" or its inverse.`);
    console.log('  This orders examination. It says NOTHING about what these entries are; each still needs its own discrimination.');
    if (uncited.length) console.log(`\nGUARD FIRED — ${uncited.length} verdict(s) without a citation: ${uncited.map((v) => v.file).join(', ')}`);
    if (shared) console.log(`\nGUARD FIRED — the boolean-inversion candidates share ONE rationale: "${shared}". Verdicts inferred from a shared reason repeat the bulk error, even when each is individually correct.`);
    if (bulkSummary.unprocessed > 0) console.log(`\nINCOMPLETE — ${bulkSummary.unprocessed} of ${bulkSummary.total} bulk entries are UNPROCESSED (distinct from undetermined: not-looked-at, not could-not-determine).`);
  }

  // EXIT CODES. 10 (INCOMPLETE) exists because the first version of this script exited 0 with
  // 106 of 106 entries unprocessed — a green signal on an unstarted job, which is the same
  // false-closure shape this SD exists to remove, committed by the tool built to remove it.
  // An unfinished re-triage is neither a pass nor a guard failure, so it gets its own code.
  if (calibration && !calibration.reproduced) process.exit(1);
  if (uncited.length || shared) process.exit(1);
  if (bulkSummary.unprocessed > 0 || indSummary.unprocessed > 0) process.exit(10);
  process.exit(0);
}

main();
