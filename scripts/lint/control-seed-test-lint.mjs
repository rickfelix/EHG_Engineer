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
import { runTrial, VERDICT, runSeedTestTrial, SEED_TRIAL } from '../audit/control-seed-test.mjs';

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

// The spec file as of the diff base, so evaluate() can tell WHICH entry moved. Returns null
// when the base cannot be read — the caller re-trials everything and says so out loud, since
// the one thing this must never do is quietly select nothing.
function previousSpecs(repoRoot) {
  for (const rev of ['origin/main', 'HEAD~1']) {
    try {
      const base = rev === 'origin/main'
        ? execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
        : rev;
      return JSON.parse(execFileSync('git', ['show', `${base}:${SPEC_PATH}`], { cwd: repoRoot, encoding: 'utf8' }));
    } catch { /* try next base */ }
  }
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
export function evaluate(repoRoot, files, specs, isControlFn = isControl, prevSpecs = null) {
  const failures = [];
  // FR-8 (SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001): THE ACCEPTANCE METRIC.
  // `trials` records controls a seeded-defect trial ACTUALLY RAN on; `skipped` records
  // controls that were MATCHED but never trialled. Keeping both is what makes
  // matched != trialsRun expressible — with only a match count, "how many controls were
  // actually exercised" is unanswerable, and any trial count would be satisfiable as an
  // alias of `matched` while measuring nothing.
  const trials = [];
  const skipped = [];
  const byName = new Map(specs.map((s) => [s.script?.replace(/\\/g, '/'), s]));

  // FR-6: A CHANGED SEED SPEC MUST RE-TRIAL ITS CONTROL.
  // The spec file is where the seeded defect ITSELF lives, so weakening a fixture is exactly as
  // dangerous as neutering the control — and it was completely invisible. SPEC_PATH is a .json
  // while CONTROL_GLOBS match /\.(mjs|js|cjs)$/, so it can NEVER be selected by widening a glob;
  // it needs this explicit branch. The workflow's `paths:` filter already lists scripts/audit/**
  // AND the spec file by name (verified), so such a PR always TRIGGERED the job — it then
  // reported "no new controls in this diff" and exited green. The trigger fired and the
  // evaluation was empty: this SD's own absence-as-pass shape, inside the gate built to stop it.
  //
  // Done HERE rather than in main() so it has a test seam. Putting selection logic in main()
  // would make it unreachable from a unit test — which is how a rule ends up asserted only by
  // the comment above it.
  //
  // ONLY THE ENTRIES THAT ACTUALLY CHANGED — AND THE FIRST VERSION OF THIS GOT IT WRONG.
  // That version re-trialled EVERY control the spec names, justified as "a conservative
  // over-trial only costs CI time". MEASURED IN CI (run 30950096609): it surfaced 14 issues
  // across 13 controls, of which exactly ONE belonged to the diff. The real cost is not CI
  // time — it is that ANY PR touching this file INHERITS THE WHOLE CORPUS'S HEALTH, so under
  // enforcement an unrelated PR is blocked by failures it did not cause. That is how a gate
  // teaches people to ignore it. Compare entries against the merge base and re-trial only
  // what moved.
  //
  // FALLING BACK IS DELIBERATE AND MUST BE LOUD: if the previous spec cannot be read we
  // re-trial ALL of them rather than NONE. Selecting nothing on an unreadable base would be
  // an empty evaluation reported as a pass — this SD's own defect, in the code fixing it.
  const specChanged = files.some((f) => f.replace(/\\/g, '/') === SPEC_PATH);
  let specBaseUnavailable = false;
  let fromSpec = [];
  if (specChanged) {
    if (Array.isArray(prevSpecs)) {
      const prev = new Map(prevSpecs.map((s) => [s.name, JSON.stringify(s)]));
      fromSpec = specs.filter((s) => prev.get(s.name) !== JSON.stringify(s));
    } else {
      specBaseUnavailable = true;
      fromSpec = specs;
    }
    fromSpec = fromSpec.map((s) => s.script?.replace(/\\/g, '/')).filter((s) => s && isControlFn(s));
  }
  const selected = [...new Set([...files, ...fromSpec])];

  for (const f of selected.filter(isControlFn)) {
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
      // FR-7 (SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001): THIS FORM NOW REQUIRES AN OBSERVED RED.
      // It used to run the test and require it to PASS — which proves only that it passes,
      // never that it would notice if the control stopped working. A `neuter` declaration is
      // mandatory so that omitting the proof is UNEXPRESSIBLE rather than merely discouraged;
      // the alternative (treat a missing neuter as "nothing to check") would reproduce this
      // SD's exact defect — an empty evaluation reported as a pass.
      if (!spec.neuter) {
        failures.push({ file: rel, reason: 'NO_NEUTER_DECLARED', detail: `uses the seedTest form but declares no \`neuter\` {find, replace, why}. Without one the gate can only observe that ${spec.seedTest} passes, which is not evidence it can fail.` });
        skipped.push({ file: rel, why: 'seedTest form with no neuter declaration — no observed-RED trial was possible' });
        continue;
      }

      const st = runSeedTestTrial(spec, repoRoot);
      // FR-8: this IS a trial — the control was exercised against a deliberate defect, which
      // is the same thing runTrial does, by a different route. Recording it here keeps the
      // acceptance metric a count of controls actually exercised.
      trials.push({ file: rel, form: 'seedTest', verdict: st.verdict, code: st.code });

      if (st.code === 'RED_BEFORE_NEUTER') {
        failures.push({ file: rel, reason: 'SEED_TEST_FAILED', detail: `its committed seed-test ${spec.seedTest} does not pass at HEAD.`, evidence: st.evidence });
      } else if (st.verdict === SEED_TRIAL.CANNOT_FAIL) {
        failures.push({ file: rel, reason: 'SEED_TEST_CANNOT_FAIL', detail: st.reason, evidence: st.evidence });
      } else if (st.verdict === SEED_TRIAL.HARNESS_ERROR) {
        // Loud, but NOT an accusation. The harness could not reach a verdict, and reporting
        // that as blindness would be the false-positive shape FR-1 catalogued four times.
        // Staying silent instead would be the absence-as-pass shape this SD exists to stop —
        // so it blocks, and says plainly which of the two it is.
        failures.push({ file: rel, reason: 'SEED_TRIAL_HARNESS_ERROR', detail: `${st.reason} — this is a HARNESS failure, not a finding that the control is blind.`, evidence: st.evidence });
      }
      continue;
    }

    // FR-3: the seed-test must be OBSERVED FIRING. This is the whole gate.
    const trial = runTrial(spec, repoRoot);
    // FR-8: a TRIAL ACTUALLY RAN. This is the acceptance metric of
    // SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — recorded here, at the only place a trial happens,
    // so the count cannot drift from the thing it counts.
    trials.push({ file: rel, verdict: trial.verdict, exitCode: trial.exitCode, treeClean: trial.treeClean });
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
  // FR-8: BREAKING CHANGE, made deliberately rather than smuggled in. This returned a bare
  // array; it now returns {failures, trials, skipped}. Returning an array with the counts
  // bolted on as properties would have kept every existing caller working — and that is
  // precisely the identity-preserving shape this SD exists to refuse, because nothing would
  // ever have had to acknowledge the new information. The 4 tests this breaks are updated in
  // the same commit; both seedTest specs point at that test file, so leaving it broken would
  // make the gate fail itself.
  return { failures, trials, skipped, selected, specChanged, specBaseUnavailable };
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

  const { failures, trials, skipped, selected, specChanged, specBaseUnavailable } = evaluate(repoRoot, files, specs, isControl, previousSpecs(repoRoot));

  const controls = selected.filter(isControl);
  if (specChanged) {
    console.log(specBaseUnavailable
      ? `⚠️  ${SPEC_PATH} changed but its previous version could not be read, so this run re-trials ALL ${controls.length} control(s) it names rather than only the changed entries. Conservative on purpose: selecting none on an unreadable base would be an empty evaluation reported as a pass.`
      : `ℹ️  ${SPEC_PATH} changed — re-trialling the ${controls.length} control(s) whose spec entry actually moved, because a weakened fixture is as dangerous as a neutered control.`);
  }
  // FR-8: THE ACCEPTANCE METRIC, ON EVERY PATH. `matched` counts controls the diff selected;
  // `trialsRun` counts controls a seeded-defect trial ACTUALLY RAN on. They are DIFFERENT
  // numbers — a seedTest spec is matched and never trialled — and printing only `matched`
  // is what let this gate report "each proved it FIRES" about controls it never exercised.
  // This line prints on EVERY return path INCLUDING the no-controls path, so a run where
  // trialsRun is 0 says so out loud instead of being inferred from silence.
  const byVerdict = trials.reduce((acc, t) => ({ ...acc, [t.verdict]: (acc[t.verdict] || 0) + 1 }), {});
  const summary = { matched: controls.length, trialsRun: trials.length, skipped: skipped.length, byVerdict };
  const summaryLine = `control-seed-test-lint: matched ${summary.matched}, TRIALS RUN ${summary.trialsRun}`
    + (summary.skipped ? `, skipped ${summary.skipped} (matched but never trialled)` : '')
    + (trials.length ? ` — ${Object.entries(byVerdict).map(([k, v]) => `${k}:${v}`).join(' ')}` : '');

  if (argv.includes('--json')) { console.log(JSON.stringify({ failures, trials, skipped, summary }, null, 2)); return; }

  console.log(summaryLine);
  for (const s of skipped) console.log(`   ⚠️  NO TRIAL: ${s.file} — ${s.why}`);

  if (!controls.length) { console.log('✅ control-seed-test-lint: no new controls in this diff.'); return; }
  if (!failures.length) {
    // The old wording claimed every matched control "proved it FIRES", which was untrue for
    // any seedTest spec — those are matched, skipped, and were counted as proven anyway.
    console.log(`✅ control-seed-test-lint: ${summary.trialsRun} of ${summary.matched} new control(s) proved they FIRE on their own seeded defect.`);
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
