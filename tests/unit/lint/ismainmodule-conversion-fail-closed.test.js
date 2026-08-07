// SD-LEO-INFRA-FIVE-GUARDS-WIRED-001 (FR-5).
//
// WHY THIS FILE EXISTS. Converting a raw `import.meta.url === file://+argv[1]` comparison to
// isMainModule() is usually cosmetic. For three of the seven sites in this SD it was not: the
// raw comparison NEVER matches on Windows, so those main-blocks had never executed. Fixing
// the guard makes previously-unreachable code run for the first time, and two of the three
// WRITE to the database when they run:
//
//   apa-fixture-ratification-capture.mjs  → INSERT into system_events
//   consult-answer-bind.mjs               → INSERT into system_events
//                                           + service-role UPDATE of strategic_directives_v2.metadata
//
// Dormancy was established by exact full-population counts, not sampling: 0 of 274
// dispositions carry decision_type='ratification', and 0 of 5537 SDs carry the metadata key
// consult-answer-bind writes. Neither script is referenced by any workflow or npm script, so
// neither ran on Linux either.
//
// The behaviour change is an INVERSION, not new risk. Both fail closed when invoked bare.
// What they did BEFORE the fix was print nothing and exit 0 — an operator running a fully
// argued command read success while zero rows moved. The fix makes a lying command honest.
// These tests pin the fail-closed half so that claim is enforced rather than believed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// The two scripts that (a) take required arguments and (b) can therefore be safely spawned
// bare. Safety here rests on VALIDATION ORDERING, not on environment isolation: the vitest
// unit project does not load .env, but a SPAWNED child runs its own `import 'dotenv/config'`
// and loads repo-root .env regardless of the parent. So the argument check MUST come before
// the first DB call, which is asserted structurally below as well as behaviourally.
const SPAWNABLE = [
  {
    file: 'scripts/apa-fixture-ratification-capture.mjs',
    expectedStderr: '--fixture-set is required',
  },
  {
    file: 'scripts/consult-answer-bind.mjs',
    expectedStderr: 'sdKey is required',
  },
];

describe('converted main-blocks fail closed when invoked bare', () => {
  for (const { file, expectedStderr } of SPAWNABLE) {
    it(`${file} exits non-zero with its required-argument message`, () => {
      const res = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 60_000 });
      const output = `${res.stdout || ''}${res.stderr || ''}`;

      // Assert the MESSAGE, not just the code. A bare exit-code check would also pass if the
      // process died for an unrelated reason — a missing module, a bad credential, a syntax
      // error — and would therefore be green for a reason that has nothing to do with the
      // guard. The message is what ties the result to the code path under test.
      expect(output).toContain(expectedStderr);
      expect(res.status).not.toBe(0);
    });
  }

  it('the guarded block really is reachable now — the raw comparison is gone from all 7', () => {
    // The companion to the above: proving they fail closed is only meaningful if the block
    // can actually be entered. Before this SD these files exited 0 in silence because the
    // guard never matched, and a fail-closed test would have been vacuously... failing.
    const converted = [
      'scripts/apa-fixture-ratification-capture.mjs',
      'scripts/audit/control-seed-test.mjs',
      'scripts/consult-answer-bind.mjs',
      'scripts/dispatch-auth-would-deny-report.mjs',
      'scripts/fleet-kill.mjs',
      'scripts/guard-firing-characterization.mjs',
      'scripts/solomon-judgment-expiry-run.mjs',
    ];
    for (const f of converted) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} still contains the Windows-broken raw comparison`)
        .not.toMatch(/import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/);
      expect(src, `${f} does not use the canonical guard`).toContain('isMainModule(import.meta.url)');
    }
  });

  it('the required-argument check precedes the first DB call in both spawned scripts', () => {
    // Structural backstop for the ordering the spawn tests depend on. If someone later moves
    // a query above the validation, the spawn tests would start performing real reads/writes
    // and would still pass — this is the assertion that would fail instead.
    const apa = readFileSync('scripts/apa-fixture-ratification-capture.mjs', 'utf8');
    expect(apa.indexOf("throw new Error('--fixture-set is required')"))
      .toBeLessThan(apa.indexOf('recordDisposition('));

    const consult = readFileSync('scripts/consult-answer-bind.mjs', 'utf8');
    expect(consult.indexOf('sdKey is required')).toBeLessThan(consult.indexOf('recordDisposition('));
  });
});

describe('dispatch-auth-would-deny-report is deliberately NOT spawn-tested', () => {
  // It takes NO arguments — bare invocation is its documented happy path, and it performs a
  // live fully-paginated read of system_events before exiting 0. A "exits non-zero with no
  // args" test on it would pass ONLY when Supabase credentials are absent, and so could never
  // distinguish "the guard now works" from "the secret is missing" — a test that is green for
  // the wrong reason is worse than no test, and this SD is entirely about checks whose green
  // means nothing. It gets a static assertion instead.
  it('uses the canonical guard', () => {
    const src = readFileSync('scripts/dispatch-auth-would-deny-report.mjs', 'utf8');
    expect(src).toContain('isMainModule(import.meta.url)');
    expect(src).toContain("from '../lib/utils/is-main-module.js'");
  });

  it('is read-only, so first execution cannot write — the reason it needs no containment', () => {
    const src = readFileSync('scripts/dispatch-auth-would-deny-report.mjs', 'utf8');
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
});
