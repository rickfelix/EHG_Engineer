/**
 * Mutation testing for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001 (FR-6 / TS-8).
 *
 * "909 of 910 green" demonstrates that tests PASS. It does not demonstrate that they can
 * DETECT. Each mutant below restores one facet of the defect this SD removes; a mutant that
 * survives means the corresponding test coverage is decorative.
 *
 * Restores the original file content in a finally block, and verifies the restore.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const CLASSIFIER = 'scripts/modules/handoff/gates/fr-delivery-classifier.js';
const SUITES = [
  'tests/unit/handoff/gates/fr-delivery-classifier.test.js',
  'tests/unit/handoff/gates/fr-delivery-traceability-gate.test.js',
  'tests/unit/handoff/lead-final-gate-results-persistence.test.js',
];

const MUTANTS = [
  {
    name: 'M1 restore the warn-only score:100 pin',
    detail: 'The original defect: report a perfect score whenever not enforcing.',
    file: CLASSIFIER,
    find: '  const score = total === 0 ? NOT_MEASURED_SCORE : Math.round((satisfied / total) * 100);',
    replace: '  const score = enforced ? (total === 0 ? NOT_MEASURED_SCORE : Math.round((satisfied / total) * 100)) : 100;',
  },
  {
    name: 'M2 collapse UNVERIFIABLE back into UNDELIVERED',
    detail: 'Removes the distinction between blindness and absence.',
    file: CLASSIFIER,
    find: '  const unmeasurable = !conventionInUse && hasWorkProduct;',
    replace: '  const unmeasurable = false;',
  },
  {
    name: 'M3 decide the convention PER-FR instead of PER-SD',
    detail: 'Makes every unreferenced FR unverifiable, so UNDELIVERED becomes unreachable.',
    file: CLASSIFIER,
    find: '  const conventionInUse = resolved.some((r) => r.deliveredBy);',
    replace: '  const conventionInUse = resolved.every((r) => r.deliveredBy);',
  },
];

function runSuites() {
  // Parse the summary line, NOT the exit code: vitest can exit non-zero for reasons unrelated
  // to assertions (the repo's DB-guard preamble, unhandled warnings), and a -1 "unparsed"
  // reading would be indistinguishable from a surviving mutant.
  let out;
  try {
    out = execSync(`npx vitest run ${SUITES.join(' ')}`, {
      encoding: 'utf8', stdio: 'pipe', maxBuffer: 40 * 1024 * 1024,
    });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const failed = /Tests\s+(\d+)\s+failed/.exec(out);
  const passed = /Tests\s+.*?(\d+)\s+passed/.exec(out);
  if (failed) return { out, failed: Number(failed[1]) };
  if (passed) return { out, failed: 0 };
  return { out, failed: -1 };   // could not read the summary at all
}

const original = readFileSync(CLASSIFIER, 'utf8');
const results = [];
try {
  console.log('=== BASELINE (unmutated) ===');
  const base = runSuites();
  const basePass = /Tests\s+(\d+)\s+passed/.exec(base.out);
  console.log(`baseline: ${basePass ? basePass[1] : '?'} passed, ${base.failed} failed\n`);
  if (base.failed !== 0) {
    console.log('BASELINE IS NOT GREEN — mutation results would be meaningless. Aborting.');
    process.exit(1);
  }

  for (const mut of MUTANTS) {
    const src = readFileSync(mut.file, 'utf8');
    if (!src.includes(mut.find)) {
      console.log(`${mut.name}: ANCHOR NOT FOUND — mutation did not apply. Treating as INVALID.`);
      results.push({ name: mut.name, failed: null, applied: false });
      continue;
    }
    writeFileSync(mut.file, src.replace(mut.find, mut.replace));
    // Confirm the mutation is actually on disk: an unapplied mutant is indistinguishable
    // from one the tests survived, and would silently read as "coverage is fine".
    const applied = readFileSync(mut.file, 'utf8').includes(mut.replace);
    const r = runSuites();
    console.log(`${mut.name}\n   ${mut.detail}\n   applied=${applied}  ->  ${r.failed} test(s) FAILED`);
    results.push({ name: mut.name, failed: r.failed, applied });
    writeFileSync(mut.file, original);
  }
} finally {
  writeFileSync(CLASSIFIER, original);
  const restored = readFileSync(CLASSIFIER, 'utf8') === original;
  console.log(`\nrestore verified: ${restored}`);
  if (!restored) console.log('!!! FILE NOT RESTORED — restore by hand before committing');
}

console.log('\n=== MUTANT SUMMARY ===');
let survivors = 0;
for (const r of results) {
  const verdict = r.applied === false ? 'INVALID (not applied)' : r.failed > 0 ? `FALSIFIED (${r.failed} failing)` : 'SURVIVED — coverage gap';
  if (r.applied !== false && r.failed === 0) survivors++;
  console.log(`  ${r.name}: ${verdict}`);
}
console.log(survivors === 0
  ? '\nAll mutants falsified — the suite DETECTS, it does not merely pass.'
  : `\n${survivors} mutant(s) SURVIVED — that coverage is decorative and must be strengthened.`);
