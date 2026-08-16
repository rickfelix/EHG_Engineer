#!/usr/bin/env node
/**
 * control-seed-test — run the seeded-defect test against a control.
 * SD-FDBK-INFRA-CONTROL-MERGE-WITHOUT-001 (FR-1).
 *
 * The shape, per the SD: (a) deliberately break the certified thing, (b) assert the
 * control FIRES, (c) restore. A control that cannot catch its own seeded defect does
 * not merge.
 *
 * *** WHY IT SEEDS INTO A SCRATCH DIR AND NEVER THE WORKING TREE (TR-3) ***
 * Seed-testing is deliberate breakage. A harness that mutates in place risks leaving a
 * dirty repo or, worse, committing the seeded defect. Every fixture is written under
 * os.tmpdir() and the control is pointed at it with its own --root flag. The harness
 * asserts `git status --porcelain` is byte-identical before and after each trial; a
 * difference is a HARNESS failure, reported separately from the control's verdict, and
 * is never silently folded into the fire-rate.
 *
 * *** DETECTS IS NOT BLOCKS, AND THE DIFFERENCE IS THE POINT ***
 * A control can report a violation and still `exit 0` — advisory-first / warn-only modes
 * are common and legitimate as a rollout stage. But an advisory control BLOCKS NOTHING at
 * merge time, so collapsing the two into one "fired" boolean would overstate the fleet's
 * actual protection. Each trial therefore records BOTH, and the report never emits a
 * single blended number.
 *
 * KNOWN LIMITATIONS (FR-4 — a control that does not state its blind spot cannot be
 * trusted past it):
 *   - Only SCOPABLE controls can be tested, and a control that can be aimed at NOTHING is
 *     genuinely unverifiable — its correctness is not merely unknown but unknowable without
 *     mutating the repo. Such controls are reported UNTESTABLE: never a pass, never a failure.
 *     THE CRITERION IS "CAN IT BE AIMED", NOT "DOES IT TAKE A FLAG". Two scoping mechanisms
 *     exist: an explicit --root/--dir, and cwd — most of these lints declare RELATIVE scan
 *     dirs (SCAN_DIRS = ['scripts','lib']) that resolve against process.cwd(), so running
 *     them from a fixture tree aims them exactly. THE SIZE OF THE TRULY-UNAIMABLE SET IS
 *     UNMEASURED and deliberately not estimated here: an earlier draft judged scopability by
 *     flags alone, called it half the family, and was wrong — including about both
 *     control-about-control gates, which turned out to be aimable via cwd. An unmeasured
 *     class honestly labelled beats a rate nobody can defend.
 *   - DETECTED is inferred from the control's own output naming the seeded path. A control
 *     that detects but prints nothing identifying is scored NOT-DETECTED. This is
 *     deliberately conservative: silence is not evidence of detection.
 *   - A single seed proves the control catches THAT defect, not that it catches its whole
 *     class. This measures whether a control can fire at all — which is what the census
 *     instances failed — not detection completeness.
 *   - Controls requiring DB or network are out of scope here; the harness is offline.
 *
 * Usage:
 *   node scripts/audit/control-seed-test.mjs --spec <specfile.json> [--json]
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
// FR-5 chokepoint (SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001). This module became a
// worktree-handling file the moment runSeedTestTrial started creating one, and the static guard
// in tests/unit/worktree-delete-primitive-static-guard.test.js flagged both raw deletes here
// immediately -- correctly.
//
// THE REASON IS REUSE, NOT A WIPE THREAT FROM node's rmSync, and that distinction is load-bearing
// enough that the guard's own rationale carries a SECURITY correction saying so: a raw recursive
// delete was NOT reproducible as following a nested junction on Node v24. What it IS, is a second
// unreviewed implementation of a delete policy that is maintained in exactly one place here.
//
// Worth recording because this SD nearly learned it the expensive way: the first US-007 draft
// junctioned node_modules into a scratch worktree, and `git worktree remove --force` -- git's own
// removal, not node's -- deleted 557 packages through that junction. The shipped design needs no
// link at all, so that hazard is gone; routing through safeRecursiveRm is about not maintaining a
// private copy of the policy.
import { safeRecursiveRm } from '../../lib/worktree-manager.js';

const VERDICT = Object.freeze({
  BLOCKS: 'BLOCKS',        // detected AND non-zero exit — actually stops a merge
  DETECTS: 'DETECTS',      // reported it, but exit 0 — advisory; blocks nothing
  SILENT: 'SILENT',        // ran clean against a real seeded defect — the census shape
  UNTESTABLE: 'UNTESTABLE', // cannot be scoped to a fixture; not a pass and not a failure
  ERROR: 'ERROR'            // control did not run to completion; not a verdict at all
});

// A control that dies mid-run exits non-zero without having judged anything. Reading that
// as a clean pass is how a harness invents a blind control that does not exist.
const CRASH_RE = /Node\.js v\d|at ModuleJob|Unhandled|ERR_MODULE_NOT_FOUND|throw er;/;

function gitStatus(repoRoot) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Run one control against one seeded defect. Never touches the working tree. */
export function runTrial(spec, repoRoot) {
  // *** CWD IS A SCOPING MECHANISM TOO, AND MISSING IT UNDER-COUNTS TESTABILITY ***
  // diagnostic-gauge-citation-lint has no --root, but it enumerates via `git diff` /
  // `git ls-files` calls that inherit process.cwd(). Judging scopability by FLAGS ALONE
  // marked it untestable when it can in fact be aimed — the same shape as scoring a control
  // SILENT because the harness could not see what it did. A spec may declare cwdScope:true.
  if (!spec.rootFlag && !spec.cwdScope) {
    return { name: spec.name, verdict: VERDICT.UNTESTABLE, reason: spec.untestableReason || 'no scoping flag — cannot be pointed at a fixture without planting the defect in the real tree' };
  }

  const before = gitStatus(repoRoot);
  const dir = mkdtempSync(join(tmpdir(), 'seedtest-'));
  let out = '', code = 0;
  // FR-3 (SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001): spawnSync's STRUCTURAL failure channel, hoisted
  // so the verdict logic below can consult it. Previously r.error was never read anywhere in
  // this file, so a control that could not be launched at all was scored by its OUTPUT.
  let spawnError = null;

  try {
    for (const f of spec.fixtures) {
      const p = join(dir, f.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.content, 'utf8');
    }

    // *** THE SCRATCH DIR MUST BE A REAL GIT REPO, AND THIS WAS A FALSE NEGATIVE I SHIPPED ***
    // Several controls enumerate their scan set with `git ls-files` rather than walking the
    // filesystem (session-coordination-insert-classguard-lint.mjs:108 is one). Pointed at a
    // plain tmpdir, `git ls-files` returns NOTHING, the control scans zero files, exits 0, and
    // the harness scores it SILENT — accusing a perfectly working control of being blind.
    // That is this SD's own class committed in reverse, by the very tool built to detect it.
    // So: init a repo and stage the fixtures, making them visible to both enumeration styles.
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
    } catch {
      // Non-fatal: filesystem-walking controls still work without it.
    }

    const args = spec.cwdScope
      ? [join(repoRoot, spec.script), ...(spec.extraArgs || [])]
      : [spec.script, spec.rootFlag, dir, ...(spec.extraArgs || [])];
    const runCwd = spec.cwdScope ? dir : repoRoot;
    // *** BOTH STREAMS, ALWAYS — THE ASYMMETRY WAS A FALSE NEGATIVE I SHIPPED ***
    // The first version used execFileSync, which RETURNS STDOUT ONLY on success and only
    // merged stderr in the catch branch. Controls print their findings to stderr and many
    // exit 0 while doing so (advisory mode), so on exactly the interesting path the harness
    // read an empty string, saw no match, and scored a control SILENT that had in fact
    // reported the violation by name. spawnSync gives both streams on both paths.
    const r = spawnSync('node', args, { cwd: runCwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...safeSpecEnv(spec.env) } });
    code = typeof r.status === 'number' ? r.status : 1;
    out = `${r.stdout || ''}${r.stderr || ''}`;
    // FR-3: capture the STRUCTURAL failure. Note `r.status` is null on a timeout/ENOENT, which
    // the line above silently coerces to 1 — indistinguishable from a control that ran and
    // exited 1. r.error is the only field that says WHY.
    spawnError = r.error || null;
  } finally {
    safeRecursiveRm(dir);
  }

  const after = gitStatus(repoRoot);
  // TR-3: a harness that dirties the tree is a harness failure, reported separately and
  // never folded into the control's verdict.
  const treeClean = before === after;

  // *** A NON-ZERO EXIT IS NOT A VERDICT — IT MIGHT BE A CRASH ***
  // rls-anon-tenant-predicate-lint died on a git revision error against the scratch repo and
  // exited 1. Reading that as "ran and found nothing" would have recorded a control as SILENT
  // that never executed at all. A control that could not run is ERROR: not a pass, not a
  // failure, and never counted in the rate.
  // *** STRUCTURE BEFORE TEXT — FR-3, SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 ***
  // CRASH_RE below decides ERROR by MATCHING THE OUTPUT, which cannot see a control that
  // produced no output because it never started. spawnSync reports that in `r.error`, and
  // this file never read it: a 120s TIMEOUT or an ENOENT yields status:null -> code 1 -> no
  // crash text -> the control fell through and was published as SILENT, i.e. AS ONE THAT RAN
  // CLEAN AGAINST A REAL SEEDED DEFECT. Probed during PLAN: a control that DIED (exit 1,
  // "could not connect to database") and one that genuinely RAN BLIND (exit 0, "scan
  // complete") produced the SAME row.
  //
  // The tempting fix was to add timeout/ENOENT alternatives to CRASH_RE. That is the INSTANCE
  // fix — it would need extending for every future failure shape, and each omission is silent.
  // Reading the structural channel is the CLASS fix: it is true for every way a spawn can fail,
  // including ones not yet invented.
  if (spawnError) {
    return {
      name: spec.name,
      verdict: VERDICT.ERROR,
      exitCode: code,
      treeClean,
      reason: `control could not be executed (${spawnError.code || spawnError.name || 'spawn failure'}): ${spawnError.message}`,
      evidence: [
        `spawnSync error: ${spawnError.code || spawnError.name || 'unknown'} — ${spawnError.message}`,
        `exit code ${code} here is COERCED, not reported: r.status was null because the process never returned one`,
        out.trim() ? `output captured before failure: ${out.trim().split('\n').slice(-1)[0]}` : 'no output at all — the control produced nothing to match against',
      ].filter(Boolean),
    };
  }

  if (CRASH_RE.test(out)) {
    return { name: spec.name, verdict: VERDICT.ERROR, exitCode: code, treeClean, reason: 'control did not run to completion (crash/unhandled error)', evidence: out.trim().split('\n').filter(Boolean).slice(-2) };
  }

  // *** DETECTION IS NOT ALWAYS REPORTED BY FILENAME ***
  // metadata-flag-lint fired correctly — "ORPHAN is_seeded_orphan w=1 r=0 FAIL" — but names the
  // SYMBOL, not the file. Keying detection on the filename alone scored a firing control SILENT.
  // Specs may therefore declare additional tokens the control is expected to emit.
  const tokens = [
    ...(spec.fixtures || []).map((f) => f.path.split('/').pop()),
    ...(spec.detectTokens || [])
  ];
  const detected = tokens.some((t) => out.includes(t));
  const verdict = detected ? (code !== 0 ? VERDICT.BLOCKS : VERDICT.DETECTS) : VERDICT.SILENT;

  // A SILENT verdict is an ACCUSATION and must carry the evidence to check it. If the control
  // reports scanning zero files, the seed never reached it and the seed is the suspect, not the
  // control. Never publish SILENT without reading this field.
  const scannedZero = /0 file\(s\) scanned|no files/i.test(out);

  return { name: spec.name, verdict, exitCode: code, detected, treeClean, scannedZero, evidence: out.trim().split('\n').filter(Boolean).slice(-3) };
}

// ===========================================================================================
// SD-PAT-FIX-FIX-ABSENCE-SIGNAL-001 — FR-7. THE seedTest FORM MUST REQUIRE AN OBSERVED RED.
//
// Until now `seedTest` ran the committed test and required it to PASS. A passing test proves
// only that it passes; it cannot distinguish a test that CHECKS something from one that
// checks nothing. Both seedTest specs are this gate's OWN machinery, so the control that
// certifies every other control was itself certified by the form it declares insufficient.
//
// The fix: neuter the control and require the test to go RED. Which means the harness now
// performs deliberate breakage on the control's own source — and the three ways that goes
// wrong are all silent, so each gets a structural defence rather than a promise.
// ===========================================================================================

export const SEED_TRIAL = Object.freeze({
  PROVEN_RED: 'PROVEN_RED',       // green when whole, red when neutered — the test genuinely fires
  CANNOT_FAIL: 'CANNOT_FAIL',     // neutered and STILL green — the test asserts nothing
  HARNESS_ERROR: 'HARNESS_ERROR', // the harness failed. NEVER a verdict about the control.
});

// A vitest run can go red for reasons that prove nothing about the control. Telling those
// apart requires reading WHY it was red, not merely THAT it was red.
const ASSERTION_RE = /AssertionError|expected .+ to |Tests\s+\d+ failed/i;
const LOAD_CRASH_RE = /ERR_MODULE_NOT_FOUND|Failed to load url|Cannot find (module|package)|SyntaxError|ReferenceError/i;

// PAT-LES-c4ec7d0aab94 (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-143): the two evidence sites below
// used to diverge -- one filtered for failure-vocabulary content, the other took the raw last-3
// lines (frequently vitest's boilerplate summary footer, not the actual assertion). One shared
// helper closes the asymmetry. Falls back to the raw last-3-lines when nothing matches the
// vocabulary, so a real failure whose wording this regex doesn't cover is never silently
// reported as empty evidence -- strictly additive over the old raw-slice behavior, never worse.
const SEED_TEST_EVIDENCE_RE = /FAIL|AssertionError|expected|Tests\s/i;
export function extractSeedTestEvidence(out) {
  const lines = String(out || '').trim().split('\n').filter(Boolean);
  const matched = lines.filter((l) => SEED_TEST_EVIDENCE_RE.test(l));
  return (matched.length ? matched : lines).slice(-3);
}

/**
 * The whole decision, as a pure function — no spawning, no filesystem.
 *
 * It lives apart from the I/O deliberately: every rule below is a way this check could
 * silently degrade into a rubber stamp, and rules that can only be exercised by building a
 * git worktree are rules nothing will ever test. A unit test drives this directly.
 */
export function classifySeedTrial({ cleanExit, mutationLanded, mutantExit, mutantOut = '', neuterWhy }) {
  // (1) POSITIVE CONTROL, AND IT MUST COME FIRST. If the test is already red before we touch
  // anything, the scratch tree is broken (or the test does not pass at HEAD) and EVERY later
  // observation is uninterpretable — a red mutant would then "prove" firing when the truth is
  // the harness never worked. This is the same trap as reading a crash as a verdict, one level
  // up: without it the harness is most confident exactly when it is most broken.
  if (cleanExit !== 0) {
    return { verdict: SEED_TRIAL.HARNESS_ERROR, code: 'RED_BEFORE_NEUTER', reason: 'the seed-test is RED before any neutering, so nothing measured after this point means anything (scratch tree mis-wired, or the test does not pass at HEAD)' };
  }

  // (2) PROVE THE MUTATION LANDED. A no-op edit leaves the test green, which is
  // INDISTINGUISHABLE from a test that cannot fail — this SD's own defect class, inside its
  // own remedy. It fired for real during PLAN: a mutation attempt was a silent no-op sed and
  // would have been published as a surviving mutant. So this is an ERROR, never a verdict:
  // a verdict absorbs the failure, an error cannot be mistaken for a measurement.
  if (!mutationLanded) {
    return { verdict: SEED_TRIAL.HARNESS_ERROR, code: 'MUTATION_NO_OP', reason: 'the neutering edit did not change the file — its `find` string no longer matches the control (a no-op mutation is indistinguishable from a test that cannot fail, so it is refused rather than scored)' };
  }

  // (3) A NEUTERED CONTROL THAT LEAVES THE TEST GREEN IS THE FINDING.
  if (mutantExit === 0) {
    return {
      verdict: SEED_TRIAL.CANNOT_FAIL,
      code: 'SURVIVED',
      reason: `the control was neutered (${neuterWhy || 'see spec.neuter'}) and its seed-test still passed — the test does not detect the thing it certifies`,
    };
  }

  // (4) RED IS NOT ENOUGH: IT MUST BE RED FOR THE RIGHT REASON. Breaking a module's syntax
  // also turns a test red, while proving only that an unparseable file cannot be imported.
  // Accepting any non-zero exit would let the weakest possible neutering pass as proof.
  if (LOAD_CRASH_RE.test(mutantOut) && !ASSERTION_RE.test(mutantOut)) {
    return { verdict: SEED_TRIAL.HARNESS_ERROR, code: 'LOAD_CRASH', reason: 'the neutered control failed to LOAD rather than failing an assertion — that proves the file was broken, not that the test detects behaviour. Use a neutering that keeps the module valid.' };
  }
  if (!ASSERTION_RE.test(mutantOut)) {
    return { verdict: SEED_TRIAL.HARNESS_ERROR, code: 'UNEXPLAINED_RED', reason: 'the seed-test exited non-zero but produced no recognisable assertion failure, so WHY it went red is unknown — refusing to score an unexplained red as proof' };
  }

  return { verdict: SEED_TRIAL.PROVEN_RED, code: 'PROVEN', reason: `neutering the control (${neuterWhy || 'see spec.neuter'}) turned its seed-test RED on an assertion` };
}

/**
 * Run the observed-RED trial for one `seedTest` spec. Never touches the working tree.
 *
 * *** WHY A NESTED WORKTREE UNDER .worktrees/ AND NO node_modules LINK ***
 * Requiring an observed RED means editing the control's source and re-running vitest, and
 * doing that in place would violate the invariant at the top of this file. So the trial runs
 * in a throwaway `git worktree` at HEAD, which git creates without touching the real tree.
 *
 * It goes under `.worktrees/` — already in .gitignore — for two independent reasons, and the
 * second was learned the hard way. First, an ignored path keeps `git status --porcelain`
 * byte-identical, so the trial cannot trip the lint's own HARNESS_DIRTIED_TREE check. Second,
 * node resolves `node_modules` by walking UP, so a worktree nested inside the repo finds the
 * real one with NO symlink. The first draft put the worktree in os.tmpdir() and junctioned
 * node_modules into it — and `git worktree remove --force` DELETED THE 557-PACKAGE
 * node_modules THROUGH THE JUNCTION. Nesting removes the need for the link, which removes the
 * hazard entirely: there is no longer a destructive cleanup to get right.
 *
 * KNOWN LIMITATION (FR-4): the trial evaluates HEAD, not uncommitted working-tree edits, so
 * running it locally on a dirty tree measures the last commit. In CI — the venue where it
 * enforces — HEAD is the PR's merge commit, which is exactly the content under review.
 */
// *** EVERY VALUE IN THE SPEC FILE IS ATTACKER-AUTHORED, BECAUSE THE SPEC FILE IS EDITABLE IN A
// PULL REQUEST. *** SECURITY live-proved three reachable primitives here; the guards below close
// them. The workflow uses `pull_request`, NOT `pull_request_target`, so a fork PR runs with a
// read-only token and no secrets -- that BOUNDS the blast radius to an ephemeral job, it does not
// remove it, and the bound is a property of the WORKFLOW TRIGGER rather than of this code. If the
// trigger is ever changed, these guards are what stands between a spec edit and a writable token.

// SEC-6, PRE-EXISTING (commit d89f4dfea3c0, predates this SD): `spec.env` was spread into the
// child unfiltered, so `NODE_OPTIONS: "--require <file>"` preloads arbitrary code on any control
// trial -- proved live, platform-independent. Nothing in-repo uses spec.env today, but an unused
// hole is still a hole, and it sits a few lines from code this SD rewrote.
const UNSAFE_ENV_RE = /^(NODE_OPTIONS|NODE_V8_COVERAGE|NODE_REPL_EXTERNAL_MODULE|LD_PRELOAD|LD_AUDIT|DYLD_)/i;
function safeSpecEnv(env) {
  return Object.fromEntries(Object.entries(env || {}).filter(([k]) => !UNSAFE_ENV_RE.test(k)));
}

// A refusal, never a verdict: these are harness/config faults, and scoring them as findings about
// the control would be an accusation the evidence does not support.
function harnessError(spec, code, reason) {
  return { name: spec.name, verdict: SEED_TRIAL.HARNESS_ERROR, code, reason, evidence: [] };
}

export function runSeedTestTrial(spec, repoRoot, deps = {}) {
  const { spawn = spawnSync, exec = execFileSync } = deps;
  // SEC-2: an EMPTY `find` is the sharpest edge here and it does not look like one. String
  // .replace('') matches at index 0 ALWAYS, so `replace` is prepended unconditionally whatever
  // the file contains -- and the mutation-landed check then confirms the file changed. Since the
  // harness's very next step re-runs vitest inside that same worktree, prepended text is
  // EXECUTED. Refuse it: a neuter must name real text it expects to find.
  if (typeof spec.neuter?.find !== 'string' || spec.neuter.find.length === 0) {
    return harnessError(spec, 'NEUTER_FIND_EMPTY', 'the neuter declares no non-empty `find` string; an empty find matches at position 0 unconditionally, which prepends arbitrary content rather than replacing anything');
  }

  // SEC-1: `neuter.file` was joined to the worktree root with NO containment, so `../../..`
  // escaped into the real repo -- and, with the above, wrote code the follow-up vitest run would
  // then import. Constraining it to the control's OWN script closes the traversal and the
  // write-then-execute gadget together, and costs nothing: a neuter that edits some other file
  // is not neutering the control under test anyway.
  const declared = (spec.neuter?.file || spec.script).replace(/\\/g, '/');
  const target = spec.script.replace(/\\/g, '/');
  if (declared !== target) {
    return harnessError(spec, 'NEUTER_FILE_NOT_SCRIPT', `the neuter targets ${declared}, which is not the control under test (${target}). A neuter may only edit the control it certifies.`);
  }
  const wtParent = join(repoRoot, '.worktrees');
  const wt = join(wtParent, `.seedtrial-${spec.name.replace(/[^a-z0-9-]/gi, '_')}-${process.pid}`);
  const runVitest = (cwd) => {
    const r = spawn('npx', ['vitest', 'run', '--project', 'unit', spec.seedTest], { cwd, encoding: 'utf8', timeout: 600000, shell: process.platform === 'win32' });
    return { code: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout || ''}${r.stderr || ''}` };
  };

  try {
    mkdirSync(wtParent, { recursive: true });
    exec('git', ['worktree', 'add', '--detach', '-q', wt, 'HEAD'], { cwd: repoRoot, stdio: 'pipe' });

    const clean = runVitest(wt);
    // Short-circuit: with the positive control already failing there is nothing to learn from
    // mutating, and running anyway would only produce a red we could not interpret.
    if (clean.code !== 0) {
      const c = classifySeedTrial({ cleanExit: clean.code, mutationLanded: false, mutantExit: 1 });
      return { ...c, name: spec.name, evidence: extractSeedTestEvidence(clean.out) };
    }

    const p = join(wt, target);
    // Second, INDEPENDENT containment check. The equality test above already bounds `target`,
    // so reaching this means `spec.script` itself carried traversal -- a different door to the
    // same room. A guard resting on another guard's correctness is one refactor from useless.
    //
    // realpathSync, NOT resolve(). The first version compared LEXICAL paths, which never touch
    // the filesystem, so a symlink/junction committed by the same PR at an entirely ordinary
    // looking path escaped it with no `..` anywhere in the diff -- SECURITY defeated it with a
    // real Windows junction and the write landed outside the worktree. realpath dereferences,
    // so the check now measures where the write ACTUALLY goes rather than what the string says.
    let realP, realWt;
    try {
      realP = realpathSync(p);
      realWt = realpathSync(wt);
    } catch (e) {
      return harnessError(spec, 'NEUTER_PATH_UNRESOLVABLE', `could not resolve the neuter target on disk: ${e.message}`);
    }
    if (!realP.startsWith(realWt + sep)) {
      return harnessError(spec, 'NEUTER_PATH_ESCAPE', `the neuter target resolves OUTSIDE the trial worktree: ${realP} is not under ${realWt}`);
    }
    const before = readFileSync(p, 'utf8');
    const after = before.replace(spec.neuter.find, spec.neuter.replace);
    writeFileSync(p, after, 'utf8');
    // Read BACK from disk rather than comparing the strings we just built: this must prove the
    // FILE changed, not that our replace() returned something different.
    const mutationLanded = readFileSync(p, 'utf8') !== before;

    const mutant = mutationLanded ? runVitest(wt) : { code: 1, out: '' };
    const c = classifySeedTrial({ cleanExit: clean.code, mutationLanded, mutantExit: mutant.code, mutantOut: mutant.out, neuterWhy: spec.neuter.why });
    return { ...c, name: spec.name, evidence: extractSeedTestEvidence(mutant.out) };
  } catch (e) {
    return { name: spec.name, verdict: SEED_TRIAL.HARNESS_ERROR, code: 'HARNESS_THREW', reason: `the observed-RED harness itself failed: ${e.message}`, evidence: [] };
  } finally {
    try { exec('git', ['worktree', 'remove', '--force', wt], { cwd: repoRoot, stdio: 'ignore' }); } catch {}
    try { safeRecursiveRm(wt); } catch {}
    try { exec('git', ['worktree', 'prune'], { cwd: repoRoot, stdio: 'ignore' }); } catch {}
  }
}

function main() {
  const argv = process.argv.slice(2);
  const specIdx = argv.indexOf('--spec');
  if (specIdx === -1 || !argv[specIdx + 1]) {
    console.error('Usage: node scripts/audit/control-seed-test.mjs --spec <specfile.json> [--json]');
    process.exitCode = 2;
    return;
  }
  const specs = JSON.parse(readFileSync(argv[specIdx + 1], 'utf8'));
  const repoRoot = process.cwd();
  const results = specs.map((s) => runTrial(s, repoRoot));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  const tested = results.filter((r) => r.verdict !== VERDICT.UNTESTABLE && r.verdict !== VERDICT.ERROR);
  const errored = results.filter((r) => r.verdict === VERDICT.ERROR);
  const blocks = tested.filter((r) => r.verdict === VERDICT.BLOCKS);
  const detects = tested.filter((r) => r.verdict === VERDICT.DETECTS);
  const silent = tested.filter((r) => r.verdict === VERDICT.SILENT);
  const untestable = results.filter((r) => r.verdict === VERDICT.UNTESTABLE);
  const dirty = tested.filter((r) => r.treeClean === false);

  console.log('\n=== SEEDED-DEFECT TEST RESULTS ===');
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(11)} ${r.name}${r.reason ? ` — ${r.reason}` : ''}${r.exitCode !== undefined ? ` (exit ${r.exitCode})` : ''}`);
  }
  // The denominator is mandatory. A rate without it is the count-truncation form of the
  // very class this SD exists to eliminate.
  console.log('\n--- RATE (denominator mandatory) ---');
  console.log(`  sampled:    ${results.length}`);
  console.log(`  testable:   ${tested.length}   (untestable: ${untestable.length}, errored: ${errored.length} — none counted as pass OR fail)`);
  console.log(`  BLOCKS:     ${blocks.length}/${tested.length}`);
  console.log(`  DETECTS:    ${detects.length}/${tested.length}   (advisory — blocks nothing at merge time)`);
  console.log(`  SILENT:     ${silent.length}/${tested.length}   (ran clean against a real seeded defect)`);
  if (dirty.length) console.log(`  ⚠ HARNESS FAILURE — working tree changed during: ${dirty.map((d) => d.name).join(', ')}`);
  const suspectSeeds = silent.filter((r) => r.scannedZero);
  if (suspectSeeds.length) console.log(`  ⚠ SEED SUSPECT (control reported scanning nothing — blame the seed, not the control): ${suspectSeeds.map((s2) => s2.name).join(', ')}`);
  console.log('\n  NOTE: BLOCKS and DETECTS are reported separately and never blended. An advisory');
  console.log('  control that reports but exits 0 stops no merge, so a combined rate would overstate');
  console.log('  actual protection.');

  // *** POPULATION LIMIT — TRAVELS WITH THE NUMBER, NEVER IN A FOOTNOTE ***
  // Coordinator ruling 274335fa. scripts/lint/ is a defensible frame and is the population the
  // lint/guard workflows execute — but EVERY blind control the fleet actually FOUND today lives
  // OUTSIDE it, and the lint family is plausibly the CLEANEST subpopulation precisely because it
  // is uniform, callable and workflow-executed. Printed with the rate so a later reader cannot
  // generalise it to "controls" without seeing this in the same breath.
  console.log('\n  *** SCOPE LIMIT — THIS IS THE LINT FAMILY FIRE-RATE, NOT THE CONTROL FIRE-RATE ***');
  console.log('  NONE of the blind controls found today lives in scripts/lint/: subagent-evidence-gate');
  console.log('  (fetched the verdict, discarded it); coordinator-fleet-retro (magic-string scrape, blind');
  console.log('  5 days); retention-ack-marker (absorbing state, no writer clears it); the GHA liveness');
  console.log('  registry (a run 40min old reported 370h overdue); venture-capture-completeness (184');
  console.log('  where the true value is 0); the retrospective scorer (identical 90 before and after a');
  console.log('  content rewrite); the CI documentation validator (6 violations in CI, 0 locally).');
  console.log('  This frame is measurable, which is why it was chosen — and that same uniformity is');
  console.log('  why it is probably the cleanest slice. DO NOT generalise this rate to controls.\n');

  process.exitCode = 0;
}

if (isMainModule(import.meta.url)) main();

export { VERDICT };
