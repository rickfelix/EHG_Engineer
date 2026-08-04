#!/usr/bin/env node
/**
 * Control Seed-Test Merge Gate
 * SD-FDBK-INFRA-CONTROL-MERGE-WITHOUT-001 — FR-2 (committed seed-test), FR-3 (observed
 * FIRING, not present), FR-4 (declared blind spot).
 *
 * Fifteen controls in one day emitted output that did not correspond to what they
 * certified, and every one was found by INCIDENT. Nothing at merge time asked a control
 * to prove it could detect anything. This does.
 *
 * *** WHY THIS DOES NOT CHECK THAT A SEED-TEST EXISTS ***
 * The obvious implementation — assert a seed-test FILE is present, or that some test named
 * *seed* passes — is ITSELF BLIND. It cannot tell a seed-test that fires from one that
 * cannot fail, so a deliberately blind gauge shipped with a rubber-stamp seed-test would
 * sail through. That implementation would pass review and become census instance eighteen:
 * a control that certifies by its own presence, with the added harm that everyone would
 * believe the problem was solved. So the gate RUNS the control against a real seeded defect
 * and requires it to FIRE. A blind gauge cannot fire on any fixture, which is what makes
 * this refuse one structurally rather than by inspection.
 *
 * *** SCOPE IS A PARAMETER, DELIBERATELY ***
 * The SD makes "every new control" contingent on FR-1's measured fire-rate: at >=80% the
 * requirement narrows to high-blast-radius surfaces. FR-1 is run (census of all 7 scopable
 * lints: BLOCKS 4/6, DETECTS 1/6, SILENT 1/6) but the threshold reading is undecided,
 * because the SD never defines whether ADVISORY counts as firing — detects gives 83% and
 * narrows, blocks gives 67% and stays broad. Rather than guess, CONTROL_GLOBS is the single
 * place that changes when that is ruled. Nothing else in this file depends on the answer.
 *
 * KNOWN LIMITATIONS (FR-4 applies to this gate too — a control that will not state its
 * blind spot cannot be trusted past it):
 *   - Only controls that can be POINTED AT a fixture are enforceable, and one that can be
 *     aimed at nothing is unverifiable without mutating the repo. Such a control is reported
 *     UNENFORCEABLE and asked to add a scoping mechanism, never silently exempted.
 *     THE TEST IS "CAN IT BE AIMED", NOT "DOES IT TAKE A FLAG" — cwd is equally a scoping
 *     mechanism, since these lints declare RELATIVE scan dirs that resolve against
 *     process.cwd(). HOW BIG THE UNAIMABLE SET IS, THIS DOES NOT CLAIM: an earlier draft
 *     judged by flags alone and put it at half the family, which was wrong. The class is
 *     real; its population is unmeasured.
 *   - It verifies a control catches ITS OWN SEED, not that it covers its class. That is
 *     deliberate: the census instances failed at "can it fire at all", not at completeness.
 *   - A registry entry is required, so a control can evade this by not registering. The
 *     diff check below is what closes that: a new control file with no spec entry FAILS.
 *   - It cannot detect a fixture that is not really a defect. A reviewer still has to read
 *     the seed. This gate makes blindness expensive, not impossible.
 *   - The `seedTest` form (a committed test rather than a fixture) is WEAKER in TWO ways.
 *     (1) The gate can confirm the test passes but cannot prove it would FAIL if the control
 *     were neutered. (2) It shells out to the test runner, so it takes a dependency on
 *     node_modules being installed and can fail for reasons unrelated to detection — this
 *     gate's own first CI run failed exactly that way, on a workflow with no npm ci step.
 *     Prefer `fixtures`; `seedTest` exists for controls that cannot be aimed at one.
 *
 * Usage:
 *   node scripts/lint/control-seed-test-lint.mjs [--json] [--advisory]
 *
 * ENFORCING IS THE DEFAULT (SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001, FR-1). It used to require
 * --enforce, and the workflow never passed it — so for the whole life of this gate every
 * failure path, INCLUDING the honest "refusing to report a pass on an unknown set" refusal,
 * exited 0. Requiring a flag makes the safe behaviour something each workflow author has to
 * REMEMBER; inverting it makes the omission UNEXPRESSIBLE. Pass --advisory to opt out
 * deliberately, which is a thing a reader can see in the diff.
 *
 * --enforce is still accepted as a no-op so an existing caller cannot break; it is redundant.
 *
 * FR-5: [--diff|--all] USED TO BE DOCUMENTED HERE AND NEITHER FLAG WAS EVER READ. main()
 * parsed only --enforce and --json, and changedFiles() ignores argv entirely — running --all
 * and --diff produced byte-identical output. A documented flag that no code reads is a false
 * statement in the help text, so the claim is removed rather than the behaviour invented.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runTrial, VERDICT } from '../audit/control-seed-test.mjs';

// THE SINGLE POINT THAT CHANGES WHEN THE FR-1 THRESHOLD IS RULED. Broad reading (blocks,
// 67% < 80%) = all of these. Narrow reading (detects, 83% >= 80%) = trim to the
// high-blast-radius surfaces the SD names: chairman-facing, dispatch, liveness.
const CONTROL_GLOBS = [/^scripts\/lint\/.+\.(mjs|js|cjs)$/, /^scripts\/audit\/.+\.(mjs|js|cjs)$/];

const SPEC_PATH = 'scripts/audit/control-seed-specs.json';
// FR-4: the declaration must name a concrete undetected condition. A generic disclaimer
// ("may not catch everything") is not a blind spot; it is a shrug.
const KNOWN_LIMITATION_RE = /KNOWN LIMITATION/i;

function changedFiles(repoRoot) {
  for (const base of ['origin/main...HEAD', 'HEAD~1']) {
    try {
      // FR-4: AMR, not A. `--diff-filter=A` sees ADDED files only, so it evaluates the FIRST
      // EVENT IN A CONTROL'S LIFE AND NO LATER EDIT — a control MODIFIED into blindness, or
      // RENAMED, was invisible to this gate. Measured over 30 days on scripts/lint +
      // scripts/audit: 15 files added vs 15 modified, so roughly half the population was
      // unreachable. Not novel: five in-repo lints already use ACMR
      // (diagnostic-gauge-citation, session-coordination-insert-classguard,
      // rls-anon-tenant-predicate, schema-reference, stage-advancement-chokepoint).
      const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AMR', base], { cwd: repoRoot, encoding: 'utf8' });
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch { /* try next base */ }
  }
  // A gate that cannot establish its diff base must SAY SO, not quietly pass. The
  // session-coordination lint degrading to "advisory: not blocking" on exactly this
  // condition is finding #2 of the FR-1 census.
  return null;
}

function isControl(p) {
  const rel = p.replace(/\\/g, '/');
  return CONTROL_GLOBS.some((re) => re.test(rel));
}

// isControlFn is INJECTABLE, and that is not a testing convenience — it is the same defect
// this SD is about. The first version hardcoded the classifier, which made the gate itself
// unscopable: TS-5 could not point a blind-gauge fixture at it, so the gate silently reported
// zero failures and "passed". A control whose own scope predicate cannot be aimed cannot be
// seed-tested — exactly the UNENFORCEABLE verdict it hands out to others.
export function evaluate(repoRoot, files, specs, isControlFn = isControl) {
  const failures = [];
  const byName = new Map(specs.map((s) => [s.script?.replace(/\\/g, '/'), s]));

  for (const f of files.filter(isControlFn)) {
    const rel = f.replace(/\\/g, '/');
    const spec = byName.get(rel);

    // FR-2: a new control must ship with a committed seed-test spec.
    if (!spec) {
      failures.push({ file: rel, reason: 'NO_SEED_TEST', detail: `no entry in ${SPEC_PATH}. A new control must commit a seeded defect proving it can fire.` });
      continue;
    }

    // FR-4: it must declare what it cannot see.
    const src = existsSync(join(repoRoot, rel)) ? readFileSync(join(repoRoot, rel), 'utf8') : '';
    if (!KNOWN_LIMITATION_RE.test(src)) {
      failures.push({ file: rel, reason: 'NO_KNOWN_LIMITATION', detail: 'no KNOWN LIMITATION declaration naming a concrete undetected condition. All fifteen census instances were controls that did not say what they could not see.' });
    }

    // *** SECOND SEED FORM: A COMMITTED TEST — AND IT IS THE WEAKER ONE ***
    // Found by running this gate on its own PR: it failed BOTH of my new controls with
    // NO_SEED_TEST, and it was right to. But their seed-test genuinely exists — it is the
    // committed TS-5 vitest that plants a blind gauge and asserts refusal. The registry simply
    // could not express "the seed lives in a test". Some controls (an audit harness whose
    // certified behaviour is a VERDICT, not a code pattern) cannot be seeded with a fixture file
    // at all, so refusing that form would force a real seed-test to be reported as absent.
    // HONEST LIMIT, stated because this path is weaker than the fixture path: the gate runs the
    // test and requires it to PASS, but it CANNOT prove the test would FAIL if the control were
    // neutered. A fixture trial proves firing; a passing test only proves the test passes. Prefer
    // `fixtures`. Use `seedTest` only when the control cannot be aimed at a fixture, and expect a
    // reviewer to read the test.
    if (spec.seedTest) {
      const r = spawnSync('npx', ['vitest', 'run', spec.seedTest], { cwd: repoRoot, encoding: 'utf8', timeout: 300000, shell: process.platform === 'win32' });
      if (r.status !== 0) {
        failures.push({ file: rel, reason: 'SEED_TEST_FAILED', detail: `its committed seed-test ${spec.seedTest} does not pass.`, evidence: `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').filter(Boolean).slice(-3) });
      }
      continue;
    }

    // FR-3: the seed-test must be OBSERVED FIRING. This is the whole gate.
    const trial = runTrial(spec, repoRoot);
    if (trial.verdict === VERDICT.SILENT) {
      // An accusation ships with the evidence to refute it (FR-1 finding: four false
      // negatives, all accusing working controls of blindness).
      const suspect = trial.scannedZero ? ' NOTE: the control reported scanning nothing, so the SEED is the likely fault, not the control — fix the fixture before treating this as blindness.' : '';
      failures.push({ file: rel, reason: 'SEED_DID_NOT_FIRE', detail: `ran clean against its own seeded defect.${suspect}`, evidence: trial.evidence });
    } else if (trial.verdict === VERDICT.UNTESTABLE) {
      failures.push({ file: rel, reason: 'UNENFORCEABLE', detail: `${trial.reason} — add a --root/--dir scoping flag so the control can be pointed at a fixture.` });
    } else if (trial.verdict === VERDICT.ERROR) {
      failures.push({ file: rel, reason: 'CONTROL_CRASHED', detail: 'did not run to completion against its seed, so it produced no verdict at all.', evidence: trial.evidence });
    }
    if (trial.treeClean === false) {
      failures.push({ file: rel, reason: 'HARNESS_DIRTIED_TREE', detail: 'the working tree changed during the seed trial (TR-3 violation).' });
    }
  }
  return failures;
}

function main() {
  const argv = process.argv.slice(2);
  const repoRoot = process.cwd();
  // FR-1: ENFORCING IS THE DEFAULT. Opting OUT must be explicit and visible in a diff;
  // opting IN was invisible by omission, which is how this gate spent its whole life
  // unable to fail. `--enforce` stays accepted as a redundant no-op so existing callers
  // keep working — it no longer grants anything.
  const enforce = !argv.includes('--advisory');

  const files = changedFiles(repoRoot);
  if (files === null) {
    console.error('❌ control-seed-test-lint: diff base unavailable — cannot determine which controls are new.');
    console.error('   Refusing to report a pass on an unknown set. Re-run with a reachable base.');
    process.exitCode = enforce ? 1 : 0;
    return;
  }

  const specs = existsSync(join(repoRoot, SPEC_PATH)) ? JSON.parse(readFileSync(join(repoRoot, SPEC_PATH), 'utf8')) : [];
  const failures = evaluate(repoRoot, files, specs);

  if (argv.includes('--json')) { console.log(JSON.stringify({ failures }, null, 2)); return; }

  const controls = files.filter(isControl);
  if (!controls.length) { console.log('✅ control-seed-test-lint: no new controls in this diff.'); return; }
  if (!failures.length) {
    console.log(`✅ control-seed-test-lint: ${controls.length} new control(s), each proved it FIRES on its own seeded defect.`);
    return;
  }
  console.error(`\n❌ control-seed-test-lint: ${failures.length} issue(s) across ${controls.length} new control(s)\n`);
  for (const f of failures) {
    // FR-3: SURFACE THE EXIT CODE. The harness records it and prints it in its own report, but
    // this lint dropped it — so in the output a developer actually reads, the one field that
    // separates a control that DIED from one that ran and saw nothing was absent.
    const exit = typeof f.exitCode === 'number' ? ` (exit ${f.exitCode})` : '';
    console.error(`  ${f.reason.padEnd(20)} ${f.file}${exit}`);
    console.error(`    ${f.detail}`);
    if (f.evidence?.length) f.evidence.forEach((e) => console.error(`      | ${e}`));
  }
  console.error('\n  A control that cannot catch its own seeded defect does not merge.\n');
  process.exitCode = enforce ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('control-seed-test-lint.mjs')) main();
