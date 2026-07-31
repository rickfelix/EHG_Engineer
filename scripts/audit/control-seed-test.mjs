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
 *   - Only SCOPABLE controls can be tested. A control that scans a hardcoded tree with no
 *     --root/--dir flag cannot be pointed at a fixture, and is reported UNTESTABLE rather
 *     than counted as a pass or a failure. Scopability, not callability, is the binding
 *     constraint — see the FR-1 findings.
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
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const VERDICT = Object.freeze({
  BLOCKS: 'BLOCKS',        // detected AND non-zero exit — actually stops a merge
  DETECTS: 'DETECTS',      // reported it, but exit 0 — advisory; blocks nothing
  SILENT: 'SILENT',        // ran clean against a real seeded defect — the census shape
  UNTESTABLE: 'UNTESTABLE' // cannot be scoped to a fixture; not a pass and not a failure
});

function gitStatus(repoRoot) {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return null;
  }
}

/** Run one control against one seeded defect. Never touches the working tree. */
export function runTrial(spec, repoRoot) {
  if (!spec.rootFlag) {
    return { name: spec.name, verdict: VERDICT.UNTESTABLE, reason: spec.untestableReason || 'no scoping flag — cannot be pointed at a fixture without planting the defect in the real tree' };
  }

  const before = gitStatus(repoRoot);
  const dir = mkdtempSync(join(tmpdir(), 'seedtest-'));
  let out = '', code = 0;

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

    const args = [spec.script, spec.rootFlag, dir, ...(spec.extraArgs || [])];
    // *** BOTH STREAMS, ALWAYS — THE ASYMMETRY WAS A FALSE NEGATIVE I SHIPPED ***
    // The first version used execFileSync, which RETURNS STDOUT ONLY on success and only
    // merged stderr in the catch branch. Controls print their findings to stderr and many
    // exit 0 while doing so (advisory mode), so on exactly the interesting path the harness
    // read an empty string, saw no match, and scored a control SILENT that had in fact
    // reported the violation by name. spawnSync gives both streams on both paths.
    const r = spawnSync('node', args, { cwd: repoRoot, encoding: 'utf8', timeout: 120000 });
    code = typeof r.status === 'number' ? r.status : 1;
    out = `${r.stdout || ''}${r.stderr || ''}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const after = gitStatus(repoRoot);
  // TR-3: a harness that dirties the tree is a harness failure, reported separately and
  // never folded into the control's verdict.
  const treeClean = before === after;

  // Conservative: the control must NAME the seeded artifact. Silence is not detection.
  const detected = spec.fixtures.some((f) => out.includes(f.path.split('/').pop()));
  const verdict = detected ? (code !== 0 ? VERDICT.BLOCKS : VERDICT.DETECTS) : VERDICT.SILENT;

  return { name: spec.name, verdict, exitCode: code, detected, treeClean, evidence: out.trim().split('\n').filter(Boolean).slice(-3) };
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

  const tested = results.filter((r) => r.verdict !== VERDICT.UNTESTABLE);
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
  console.log(`  testable:   ${tested.length}   (untestable: ${untestable.length} — not counted as pass OR fail)`);
  console.log(`  BLOCKS:     ${blocks.length}/${tested.length}`);
  console.log(`  DETECTS:    ${detects.length}/${tested.length}   (advisory — blocks nothing at merge time)`);
  console.log(`  SILENT:     ${silent.length}/${tested.length}   (ran clean against a real seeded defect)`);
  if (dirty.length) console.log(`  ⚠ HARNESS FAILURE — working tree changed during: ${dirty.map((d) => d.name).join(', ')}`);
  console.log('\n  NOTE: BLOCKS and DETECTS are reported separately and never blended. An advisory');
  console.log('  control that reports but exits 0 stops no merge, so a combined rate would overstate');
  console.log('  actual protection.\n');

  process.exitCode = 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('control-seed-test.mjs')) main();

export { VERDICT };
