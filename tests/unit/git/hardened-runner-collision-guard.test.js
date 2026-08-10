// SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001 (SEC-4): the hardened git runner refuses caller argv that
// re-enables a hardening-disabled vector via git's last-wins duplicate resolution. Measured through
// runHardenedGit in the parent SECURITY assessment: --no-literal-pathspecs, --ext-diff, --textconv,
// and a pre-verb -c core.fsmonitor=<cmd> all survived to the git process. Two-sided: a clean argv
// is unaffected and the runner's own prepended -c core.fsmonitor= (empty RHS) never self-flags.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { assertNoHardeningCollision, makeHardenedGitRunner } = require('../../../lib/git/hardened-runner.cjs');

describe('assertNoHardeningCollision — the four measured collisions throw', () => {
  it('--no-literal-pathspecs', () => {
    expect(() => assertNoHardeningCollision(['diff', '--no-literal-pathspecs'])).toThrow(/HARDENING_COLLISION/);
  });
  it('--ext-diff', () => {
    expect(() => assertNoHardeningCollision(['diff', '--ext-diff'])).toThrow(/HARDENING_COLLISION/);
  });
  it('--textconv', () => {
    expect(() => assertNoHardeningCollision(['diff', '--textconv'])).toThrow(/HARDENING_COLLISION/);
  });
  it('pre-verb -c core.fsmonitor=<cmd> (non-empty value)', () => {
    expect(() => assertNoHardeningCollision(['-c', 'core.fsmonitor=/tmp/evil', 'status'])).toThrow(/HARDENING_COLLISION/);
  });
  it('single-token -ccore.hooksPath=<dir>', () => {
    expect(() => assertNoHardeningCollision(['-ccore.hooksPath=/tmp/hooks', 'status'])).toThrow(/HARDENING_COLLISION/);
  });
  it('diff.external= override', () => {
    expect(() => assertNoHardeningCollision(['-c', 'diff.external=/tmp/x', 'diff'])).toThrow(/HARDENING_COLLISION/);
  });
});

describe('assertNoHardeningCollision — two-sided: clean and disable-form argv pass', () => {
  it('a normal diff argv does not throw', () => {
    expect(() => assertNoHardeningCollision(['diff', '--stat', 'origin/main..HEAD'])).not.toThrow();
  });
  it('an EMPTY-value -c core.fsmonitor= (a disable, the runner\'s own shape) does not throw', () => {
    expect(() => assertNoHardeningCollision(['-c', 'core.fsmonitor=', 'status'])).not.toThrow();
  });
  it('an unrelated -c (user.name) does not throw', () => {
    expect(() => assertNoHardeningCollision(['-c', 'user.name=x', 'log'])).not.toThrow();
  });
});

describe('makeHardenedGitRunner integrates the guard before composing argv', () => {
  it('a colliding caller argv is refused at the runner boundary', () => {
    const run = makeHardenedGitRunner(process.cwd());
    expect(() => run(['diff', '--ext-diff'])).toThrow(/HARDENING_COLLISION/);
  });
  it('allowHardeningCollision:true is the reviewed escape hatch', () => {
    const run = makeHardenedGitRunner(process.cwd());
    // Does not throw on the collision check; may fail later on the actual git call, so we only
    // assert the guard itself did not reject (no HARDENING_COLLISION).
    let threw = null;
    try { run(['--version'], { allowHardeningCollision: true }); } catch (e) { threw = e; }
    if (threw) expect(String(threw.message)).not.toMatch(/HARDENING_COLLISION/);
  });
});
