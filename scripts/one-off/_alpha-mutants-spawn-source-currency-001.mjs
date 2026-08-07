/**
 * FR-6 mutation testing for SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001.
 *
 * "1737 passing" demonstrates the tests PASS. It does not demonstrate they DETECT. Each mutant
 * below restores one specific defect the shipped code removes; a survivor means that coverage is
 * decorative.
 *
 * Every mutation is CONFIRMED PRESENT ON DISK before its run — an unapplied mutant is
 * indistinguishable from one the suite survived, and would be silently recorded as success. The
 * original is restored in a finally block and the restore is verified.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const SPAWN = 'lib/fleet/spawn-control.js';
const SUITES = [
  'tests/unit/fleet/spawn-source-siting-guard.test.js',
  'tests/unit/fleet/spawn-source-resolve.test.js',
  'tests/unit/fleet/spawn-source-ensure.test.js',
  'tests/unit/fleet/spawn-source-repo-root.test.js',
  'tests/unit/fleet/spawn-source-flag-gate.test.js',
  'tests/unit/fleet/spawn-source-detached-incompatibility.test.js',
  'tests/unit/fleet/spawn-source-flag-on-seam.test.js',
  'tests/unit/fleet/spawn-control.test.js',
];

const MUTANTS = [
  {
    name: 'M1 siting guard never throws',
    detail: 'Restores the silent-exemption hazard: a spawn source under .worktrees/ would be accepted and left unguarded.',
    find: '  if (isWorktreeExemptPath(cwd)) {',
    replace: '  if (false && isWorktreeExemptPath(cwd)) {',
  },
  {
    // ANCHOR REPAIRED 2026-08-02T21:5xZ. The original anchor was the one-line early return
    // `if (exists(dir)) return { dir, created: false };`, which the reuse-refresh change replaced
    // with a block. The harness reported INVALID rather than counting a silent pass — the second
    // time that guard has caught a stale anchor of mine, and the reason it exists.
    name: 'M2 exists-probe ignored, worktree recreated every spawn',
    detail: 'Breaks idempotency. Works exactly once, then fails on every subsequent spawn — a defect that only surfaces under load.',
    find: '  if (exists(dir)) {',
    replace: '  if (false) {',
  },
  {
    name: 'M3 repo root via --show-toplevel instead of --git-common-dir',
    detail: 'The wrong answer I shipped-and-reverted: --show-toplevel returns the WORKTREE root, not the main root, so the spawn source would be sited inside whichever worktree spawned.',
    find: "['rev-parse', '--path-format=absolute', '--git-common-dir']",
    replace: "['rev-parse', '--show-toplevel']",
  },
  {
    name: 'M5 flag gate defaults ON instead of OFF',
    detail: 'Breaks the entire safety claim of the FR-2 rollout: an unset FLEET_SPAWN_SOURCE_TREE would silently relocate the currency target for every spawn in the fleet.',
    find: "  const v = env.FLEET_SPAWN_SOURCE_TREE;\r\n  if (v == null) return false;",
    replace: "  const v = env.FLEET_SPAWN_SOURCE_TREE;\r\n  if (v == null) return true;",
  },
  {
    // Single-line anchor deliberately: the first attempt used a multi-line `} catch {...}` anchor
    // with \n separators and never applied, because the file has CRLF endings. It was reported as
    // INVALID rather than as a survivor — which is the entire reason the applied-on-disk check
    // exists, and it earned its keep here.
    name: 'M4 empty git output yields a bogus path instead of failing soft',
    detail: 'Removes the soft-fail on unreadable git output; callers would receive a fabricated root instead of null.',
    find: '    if (!common) return null;',
    replace: "    if (!common) return '/bogus-root';",
  },
  {
    // THE MUTANT THAT DID NOT EXIST WHEN THE BUG SHIPPED. Every earlier mutant probed the flag's
    // DEFAULT or a pure function; none asked what the guard concludes about the tree we point it
    // at, so reverting to --detach used to be invisible. If this one ever survives again, the
    // seam is untested and the ON path can ship refusing every spawn in the fleet.
    name: 'M6 spawn-source tree created --detach again (the shipped defect, restored)',
    detail: 'assessTreeCurrency rejects any detached worktree as detached_head no matter how pristine, so FLEET_SPAWN_SOURCE_TREE=on would refuse EVERY spawn.',
    find: "  return ['worktree', 'add', '-B', String(branch), String(dir), String(baseRef)];",
    replace: "  return ['worktree', 'add', '--detach', String(dir), String(baseRef)];",
  },
  {
    name: 'M7 reuse stops refreshing — tree is current only at creation',
    detail: 'Self-heal only ever advances a clean tree on main, and the spawn source is deliberately neither, so an unrefreshed tree refuses from the first merge onward. The failure is invisible until origin/main moves.',
    find: '      for (const args of buildSpawnSourceUpdateArgs(dir, baseRef)) runner(args);',
    replace: '      if (false) for (const args of buildSpawnSourceUpdateArgs(dir, baseRef)) runner(args);',
  },
];

function runSuites() {
  let out;
  try {
    out = execSync(`npx vitest run ${SUITES.join(' ')}`, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 40 * 1024 * 1024 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const failed = /Tests\s+(\d+)\s+failed/.exec(out);
  const passed = /Tests\s+.*?(\d+)\s+passed/.exec(out);
  if (failed) return Number(failed[1]);
  if (passed) return 0;
  return -1; // summary unreadable — never treat as "survived"
}

const original = readFileSync(SPAWN, 'utf8');
const results = [];
try {
  console.log('=== BASELINE ===');
  const base = runSuites();
  console.log(`baseline failures: ${base}`);
  if (base !== 0) { console.log('BASELINE NOT GREEN — mutation results would be meaningless. Aborting.'); process.exit(1); }

  for (const m of MUTANTS) {
    const src = readFileSync(SPAWN, 'utf8');
    if (!src.includes(m.find)) {
      console.log(`\n${m.name}: ANCHOR NOT FOUND — mutation did not apply. INVALID, not survived.`);
      results.push({ name: m.name, applied: false, failed: null });
      continue;
    }
    writeFileSync(SPAWN, src.replace(m.find, m.replace));
    const applied = readFileSync(SPAWN, 'utf8').includes(m.replace);
    const failed = runSuites();
    console.log(`\n${m.name}\n   ${m.detail}\n   applied-on-disk=${applied}  ->  ${failed} test(s) FAILED`);
    results.push({ name: m.name, applied, failed });
    writeFileSync(SPAWN, original);
  }
} finally {
  writeFileSync(SPAWN, original);
  console.log(`\nrestore verified: ${readFileSync(SPAWN, 'utf8') === original}`);
}

console.log('\n=== SUMMARY ===');
let survivors = 0, falsified = 0, invalid = 0;
for (const r of results) {
  const verdict = r.applied === false ? 'INVALID (not applied — proves nothing)'
    : r.failed > 0 ? `FALSIFIED (${r.failed} failing)`
    : r.failed === 0 ? 'SURVIVED — coverage gap'
    : 'UNREADABLE — treat as unproven';
  if (r.applied === false) invalid++;
  else if (r.failed === 0) survivors++;
  else if (r.failed > 0) falsified++;
  console.log(`  ${r.name}: ${verdict}`);
}
// An earlier version of this summary printed "All mutants falsified" while one mutant had never
// applied — it counted only survivors, so INVALID silently read as success. That is the exact
// defect class this SD's sibling was filed about: a status reporting more than it earned. The
// verdict now requires falsified === total.
console.log(`\n${falsified} falsified, ${survivors} survived, ${invalid} invalid, of ${results.length} total.`);
if (falsified === results.length) {
  console.log('All mutants falsified — the suite DETECTS, it does not merely pass.');
} else if (survivors > 0) {
  console.log(`${survivors} SURVIVED — that coverage is decorative and must be strengthened.`);
} else {
  console.log(`NOT a clean result: ${invalid} mutant(s) never applied, so their coverage is UNPROVEN. Fix the anchors and re-run before claiming detection.`);
}
