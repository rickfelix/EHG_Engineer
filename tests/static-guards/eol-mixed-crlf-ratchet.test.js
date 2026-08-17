/**
 * The eol=lf-managed, renormalization-dirty class (i/crlf OR i/mixed) must not GROW.
 * SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001, test scenario R1.
 *
 * WHY THIS GUARD EXISTS SEPARATELY FROM eol-crlf-ratchet.test.js. That guard (QF-20260804-647) is
 * scoped to i/crlf only. It is MUTATION-PROVEN BLIND to i/mixed files: a PLAN-phase adversarial
 * TESTING sub-agent review (evidence sub_agent_execution_results id a7c730d9-652f-4e20-8e73-45e1faa41fd3)
 * temporarily added a rule covering 31 known i/mixed victims and the crlf-only ratchet stayed 6/6
 * GREEN. 195 of the 369 files in the full dangerous population (files that become permanently,
 * irreducibly dirty if eol=lf lands over their current blob) are i/mixed, not i/crlf. A guard that
 * only sees crlf is not sufficient acceptance evidence for any PR that adds new .gitattributes
 * eol=lf rules -- including this SD's own Phase 1 diff.
 *
 * Reuses evaluate()/DIRTY_INDEX_STATES from scripts/lint/eol-renormalization-lint.mjs rather than a
 * second hand-rolled parser (PLAN-phase correction mandate: that script's own header cites a prior
 * testing-agent evidence id documenting that naive git-output parsing is wrong twice over -- a
 * `grep crlf` over the whole line over-reports ~339x, and `grep -v lf` never fires because the attr
 * field's "eol=lf" always contains the substring "lf"). DIRTY_INDEX_STATES = {crlf, mixed} already
 * covers both axes; this file only adds the ratchet (baseline + shrink-only) on top of it.
 *
 * BASELINE, MEASURED AT EXEC TIME (not carried over from LEAD/PLAN phase without re-checking):
 * exactly 4 un-allowlisted violations today -- lib/agents/venture-ceo-factory.js (crlf, held by a
 * live FR-6 scope fence per eol-crlf-ratchet.test.js's own docblock) and 3 scripts/archive/one-time
 * files (mixed). This SD's own Phase 1 .gitattributes diff (15 new eol=lf extension pins + 5 binary
 * marks + 2 NUL-byte escapes) was independently re-measured to add ZERO new members to this class --
 * see docs/audits/SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001-census.md.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { evaluate } from '../../scripts/lint/eol-renormalization-lint.mjs';

const REPO = process.cwd();
const BASELINE = path.join(REPO, 'tests/fixtures/eol-mixed-crlf-baseline.txt');

const gitEolLines = () =>
  execFileSync('git', ['ls-files', '--eol'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);

const currentViolationPaths = () => evaluate(gitEolLines()).violations.map((v) => v.path);

const baseline = () =>
  new Set(fs.readFileSync(BASELINE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));

describe('eol=lf-managed renormalization-dirty class (crlf+mixed) is frozen (R1, SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001)', () => {
  it('the measurement finds files to inspect (guard is not vacuous)', () => {
    // If ls-files --eol or evaluate()'s parsing ever silently breaks, every assertion below would
    // pass against an empty set and this guard would be inert without any test failure to show it.
    const result = evaluate(gitEolLines());
    expect(result.managedCount).toBeGreaterThan(0);
  });

  it('the baseline file EXISTS (an empty baseline is the success state, a missing one is not)', () => {
    expect(fs.existsSync(BASELINE)).toBe(true);
  });

  it('NO NEW member has joined the class', () => {
    const added = currentViolationPaths().filter((f) => !baseline().has(f));
    expect(
      added,
      'These files are eol=lf-managed (via some .gitattributes rule) but stored crlf or mixed in '
      + 'the index, so a fresh checkout will show them modified with a content-identical diff. Fix '
      + 'by storing them LF (git add --renormalize <file>) BEFORE adding/extending an eol=lf rule '
      + 'over them, or add them to ALLOWLIST in scripts/lint/eol-renormalization-lint.mjs with a '
      + 'documented rationale (e.g. hash-bound migrations) -- never by widening this baseline.'
    ).toEqual([]);
  });

  it('the class only ever SHRINKS -- the baseline cannot be padded to admit an offender', () => {
    expect(currentViolationPaths().length).toBeLessThanOrEqual(baseline().size);
  });

  it('CONTROL: the detector is NOT blind to i/mixed (the defect this guard exists to fix)', () => {
    // Synthetic input to the PURE evaluate() function -- no live repo mutation, matching how
    // eol-crlf-ratchet.test.js's own CONTROL tests exercise parsing logic on synthetic lines rather
    // than temporarily editing real files. Shape must match EOL_LINE_RE exactly:
    // "i/<state> w/<state> attr/<attrs>\t<path>".
    const syntheticMixedViolation = 'i/mixed w/lf  attr/text eol=lf\tsynthetic/mixed-probe.yml';
    const result = evaluate([syntheticMixedViolation], []); // empty allowlist: nothing suppresses it
    expect(result.violations.map((v) => v.path)).toContain('synthetic/mixed-probe.yml');
  });

  it('CONTROL: the detector still catches i/crlf too (parity with eol-crlf-ratchet.test.js)', () => {
    const syntheticCrlfViolation = 'i/crlf w/lf  attr/text eol=lf\tsynthetic/crlf-probe.yml';
    const result = evaluate([syntheticCrlfViolation], []);
    expect(result.violations.map((v) => v.path)).toContain('synthetic/crlf-probe.yml');
  });

  it('CONTROL: a file WITHOUT the eol=lf attribute is not counted a violation, even if crlf/mixed', () => {
    // Two-sided, same shape as eol-crlf-ratchet.test.js's own parity check: being stored crlf/mixed
    // alone is legal (most of the repo's crlf/mixed files carry no eol=lf rule at all). Only the
    // combination -- managed AND dirty -- is a violation.
    const syntheticUnmanaged = 'i/mixed w/lf  attr/\tsynthetic/unmanaged-mixed.bin';
    const result = evaluate([syntheticUnmanaged], []);
    expect(result.violations.map((v) => v.path)).not.toContain('synthetic/unmanaged-mixed.bin');
  });
});
