// Registers the two new controls this SD introduced under scripts/lint/ with
// scripts/audit/control-seed-specs.json, closing control-seed-test-lint's NO_SEED_TEST
// finding (SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (d)).
//
// Both use the `seedTest` form, not `fixtures`: wall-clock-test-lint.mjs resolves its scan
// roots from import.meta.url (REPO_ROOT), not from cwd or a --root flag, so the harness
// cannot aim it at a scratch fixture tree without dirtying the real repo (the exact TR-3
// violation control-seed-test.mjs's runTrial forbids). The committed test file's own fixtures
// are the seed instead -- mirroring schema-lint-exit and scanner-convention-lint, the other
// registered controls with the identical "resolves from module location, not cwd" shape.
import { readFileSync, writeFileSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SPEC_PATH = 'scripts/audit/control-seed-specs.json';

const newEntries = [
  {
    name: 'wall-clock-test-lint',
    script: 'scripts/lint/wall-clock-test-lint.mjs',
    seedTest: 'scripts/lint/wall-clock-test-lint.test.js',
    neuter: {
      find: 'return ENTRY_POINT_RE.test(text) && !FAKE_CLOCK_TOKEN_RE.test(text);',
      replace: 'return false;',
      why: 'isViolation always returns false, so the "flags a file calling an entry point with no fake-clock token" and "every declared entry point is individually detectable" assertions (both expect true) go RED -- proving the detection predicate is what makes those tests pass, not the tests asserting their own premise. Hand-verified pre-registration via runSeedTestTrial: PROVEN_RED.',
    },
    note: 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 piece (d). Cannot use a fixture trial: REPO_ROOT is resolved from import.meta.url, not process.cwd() or a --root flag, so the control always scans the REAL repo tests/ tree regardless of where it is invoked from -- pointing it at a scratch fixture dir is not possible without editing the real tree, which control-seed-test.mjs\'s TR-3 check forbids. seedTest points at the committed unit suite instead.',
    observability_proof: {
      input: 'The source text of each test file touched in mergeBase..HEAD (git diff --name-status -M, via lib/git/hardened-runner.cjs), scanned for TIME_SENSITIVE_ENTRY_POINTS call sites and fake-clock tokens; in --all mode, every file under tests/ matching TEST_FILE_RE. Consumes no DB columns and no environment variables besides the optional WALL_CLOCK_TEST_LINT_BASE override.',
      seen: 'Not yet observed in a live CI run: this control ships as a standalone script this increment (LEAD risk assessment on this SD) and is not wired into any GitHub Actions workflow -- promoting it to an advisory or blocking CI step is a separate, later decision named explicitly in the file\'s own docstring. Real-environment exercise to date: the committed --all census run locally against the actual tests/ tree measured 2 genuine violations (both independently confirmed as bare reconcileOutboundSms(sb, { ...new Date() }) call sites with no now:/DAY_NOW/FAKE_NOW/useFakeTimers token anywhere in the file), and the diff-mode CLI run manually against this SD\'s own real PR diff during EXEC correctly reported 0 new violations for the files this SD itself changed.',
    },
  },
  {
    name: 'wall-clock-test-lint-test-fixtures',
    script: 'scripts/lint/wall-clock-test-lint.test.js',
    seedTest: 'scripts/lint/wall-clock-test-lint.test.js',
    neuter: {
      find: "const VIOLATING = 'await reconcileOutboundSms(sb, { provider: stubProvider });';",
      replace: "const VIOLATING = 'await reconcileOutboundSms(sb, { provider: stubProvider, now: Date.now() });';",
      why: 'VIOLATING is redefined to include a now: token (identical in shape to CLEAN), so it no longer actually violates -- every runDiffMode test that seeds VIOLATING as the defect (new/pre-existing/regressed/renamed) goes RED because the file it names is now silently skipped as clean, not reported in newViolations/preExisting -- proving the VIOLATING fixture is what makes those tests pass, not the tests asserting their own premise. Hand-verified pre-registration via runSeedTestTrial: PROVEN_RED.',
    },
    note: 'This test file itself matches CONTROL_GLOBS (scripts/lint/**/*.js) and was NEW in this diff, so control-seed-test-lint required its own entry despite being a test file rather than a detection script (precedent: no-cd-and-run-recipe-lint-test-fixtures). seedTest points at itself since its own assertions are what is being certified; neuter mutates its own fixture literal (VIOLATING), the only file NEUTER_FILE_NOT_SCRIPT permits touching.',
    observability_proof: {
      input: 'Consumes no external input -- a pure vitest unit test asserting isViolation/parseRenameMap/runDiffMode return values against inline string fixtures and an injected fake git runner it defines itself.',
      seen: 'Real positive observed 2026-09-13: npx vitest run scripts/lint/wall-clock-test-lint.test.js against the shipped wall-clock-test-lint.mjs passed 17/17 locally, exercising the same isViolation/runDiffMode code paths this SD ships (not yet wired into CI as a blocking job -- see the sibling wall-clock-test-lint spec entry).',
    },
  },
];

function run() {
  const raw = readFileSync(SPEC_PATH, 'utf8');
  const specs = JSON.parse(raw);
  const existingNames = new Set(specs.map((s) => s.name));
  for (const entry of newEntries) {
    if (existingNames.has(entry.name)) throw new Error(`spec name collision: ${entry.name} already registered`);
    specs.push(entry);
  }
  writeFileSync(SPEC_PATH, `${JSON.stringify(specs, null, 1)}\n`, 'utf8');
  console.log(`Added ${newEntries.length} spec entries: ${newEntries.map((e) => e.name).join(', ')}`);
}

if (isMainModule(import.meta.url)) run();
