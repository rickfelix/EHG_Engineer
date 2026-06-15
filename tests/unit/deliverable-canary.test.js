/**
 * SD-LEO-INFRA-STRENGTHEN-COMPLETION-DELIVERABLE-001 (FR-5 / activation test).
 *
 * The PURE core of the live-end-state deliverable canary. The activation invariant: the canary
 * CATCHES a completion whose declared deliverable is absent/empty/hollow at main (the gap the
 * PR/handoff-existence proxy misses), while NEVER false-failing a legitimate completion and NEVER
 * hard-blocking on inconclusive derivation. Every assertion is over the pure classifiers — no DB/IO.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveDeclaredDeliverables,
  classifyExistence,
  classifyFunctionalAdequacy,
  aggregateCanary,
  kindForPath,
  TRIVIAL_BYTES,
  MIN_SUBSTANTIVE_LINES,
} from '../../lib/eva/deliverable-canary.js';

describe('deriveDeclaredDeliverables — auto-derive a declared manifest', () => {
  it('extracts repo paths from key_changes[] + scope, classifies kind, and dedups', () => {
    const sd = {
      key_changes: [
        'lib/eva/deliverable-canary.js (NEW): pure classifiers',
        'lib/eva/post-completion-verifier.js (UPDATE): add a check',
        'tests/unit/deliverable-canary.test.js (NEW): activation test',
      ],
      scope: 'Also touches database/migrations/20260615_x.sql for the audit object.',
    };
    const m = deriveDeclaredDeliverables(sd, []);
    const byRef = Object.fromEntries(m.map((d) => [d.ref, d]));
    expect(byRef['lib/eva/deliverable-canary.js'].kind).toBe('file');
    expect(byRef['tests/unit/deliverable-canary.test.js'].kind).toBe('test');
    expect(byRef['database/migrations/20260615_x.sql'].kind).toBe('migration');
    expect(byRef['lib/eva/post-completion-verifier.js'].declared_from).toBe('key_changes');
  });

  it('merges git-derived changed files (declared_from=git) and dedups against scope paths', () => {
    const sd = { key_changes: ['lib/eva/deliverable-canary.js (NEW)'] };
    const changed = [{ file: 'lib/eva/deliverable-canary.js' }, { file: 'scripts/other.js' }];
    const m = deriveDeclaredDeliverables(sd, changed);
    expect(m).toHaveLength(2); // canary.js deduped (key_changes wins), + scripts/other.js from git
    const other = m.find((d) => d.ref === 'scripts/other.js');
    expect(other.declared_from).toBe('git');
    const canary = m.find((d) => d.ref === 'lib/eva/deliverable-canary.js');
    expect(canary.declared_from).toBe('key_changes'); // declared text outranks git
  });

  it('returns an EMPTY manifest (the inconclusive signal) when nothing is derivable', () => {
    expect(deriveDeclaredDeliverables({ key_changes: ['no paths here'], scope: 'prose only' }, [])).toEqual([]);
    expect(deriveDeclaredDeliverables(null, [])).toEqual([]);
  });

  it('kindForPath classifies migration / test / file', () => {
    expect(kindForPath('database/migrations/x.sql')).toBe('migration');
    expect(kindForPath('tests/unit/x.test.js')).toBe('test');
    expect(kindForPath('lib/eva/x.js')).toBe('file');
  });
});

describe('classifyExistence — present / missing / empty / inconclusive', () => {
  const d = { ref: 'lib/eva/x.js', kind: 'file' };
  it('present + non-empty => pass', () => {
    expect(classifyExistence(d, { exists: true, bytes: 500 })).toMatchObject({ status: 'present', pass: true });
  });
  it('declared but ABSENT at main => fail (the PR-proxy gap)', () => {
    expect(classifyExistence(d, { exists: false, bytes: null })).toMatchObject({ status: 'missing', pass: false });
  });
  it('present but empty (<= trivial floor) => fail', () => {
    expect(classifyExistence(d, { exists: true, bytes: TRIVIAL_BYTES })).toMatchObject({ status: 'empty', pass: false });
  });
  it('probe error / null exists => INCONCLUSIVE and passes (fail-open, no false-missing)', () => {
    expect(classifyExistence(d, { exists: null, error: 'io' })).toMatchObject({ status: 'inconclusive', pass: true });
    expect(classifyExistence(d, {})).toMatchObject({ status: 'inconclusive', pass: true });
  });
});

describe('classifyFunctionalAdequacy — non-hollow (lenient), conservative', () => {
  const d = { ref: 'lib/eva/x.js', kind: 'file' };
  it('substantive content => adequate', () => {
    expect(classifyFunctionalAdequacy(d, { substantiveLines: 40 })).toMatchObject({ status: 'adequate', pass: true });
  });
  it('stub / comment-only (< min substantive lines) => hollow fail', () => {
    expect(classifyFunctionalAdequacy(d, { substantiveLines: MIN_SUBSTANTIVE_LINES - 1 })).toMatchObject({ status: 'hollow', pass: false });
  });
  it('declared symbol named but absent => hollow fail', () => {
    expect(classifyFunctionalAdequacy(d, { substantiveLines: 99, declaredSymbol: 'runCanary', symbolPresent: false })).toMatchObject({ status: 'hollow', pass: false });
  });
  it('unassessable (null lines) => INCONCLUSIVE and passes (no false-fail on small-but-real)', () => {
    expect(classifyFunctionalAdequacy(d, { substantiveLines: null })).toMatchObject({ status: 'inconclusive', pass: true });
  });
});

describe('aggregateCanary — verdict rollup (conservative)', () => {
  it('empty manifest => inconclusive (advisory, never blocks)', () => {
    expect(aggregateCanary([])).toMatchObject({ verdict: 'inconclusive', total: 0 });
  });
  it('any concrete fail => fail (catches the gap)', () => {
    const r = aggregateCanary([
      { ref: 'a', verdicts: [{ pass: true, status: 'present' }] },
      { ref: 'b', verdicts: [{ pass: false, status: 'missing', detail: 'absent' }] },
    ]);
    expect(r.verdict).toBe('fail');
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].ref).toBe('b');
  });
  it('all present + adequate => pass', () => {
    const r = aggregateCanary([
      { ref: 'a', verdicts: [{ pass: true, status: 'present' }, { pass: true, status: 'adequate' }] },
    ]);
    expect(r.verdict).toBe('pass');
  });
  it('all inconclusive => inconclusive (never a false fail or block)', () => {
    const r = aggregateCanary([
      { ref: 'a', verdicts: [{ pass: true, status: 'inconclusive' }] },
      { ref: 'b', verdicts: [{ pass: true, status: 'inconclusive' }] },
    ]);
    expect(r.verdict).toBe('inconclusive');
    expect(r.failed).toHaveLength(0);
  });
});

describe('activation invariant — both directions', () => {
  it('a legitimate completion (present + adequate) PASSES; a hollow/missing one FAILS; ambiguous is INCONCLUSIVE', () => {
    // legitimate
    const good = aggregateCanary([{ ref: 'lib/x.js', verdicts: [classifyExistence({ ref: 'lib/x.js' }, { exists: true, bytes: 900 }), classifyFunctionalAdequacy({ ref: 'lib/x.js' }, { substantiveLines: 50 })] }]);
    expect(good.verdict).toBe('pass');
    // hollow / missing
    const bad = aggregateCanary([
      { ref: 'lib/missing.js', verdicts: [classifyExistence({ ref: 'lib/missing.js' }, { exists: false })] },
      { ref: 'lib/hollow.js', verdicts: [classifyExistence({ ref: 'lib/hollow.js' }, { exists: true, bytes: 200 }), classifyFunctionalAdequacy({ ref: 'lib/hollow.js' }, { substantiveLines: 1 })] },
    ]);
    expect(bad.verdict).toBe('fail');
    expect(bad.failed).toHaveLength(2);
    // ambiguous
    const amb = aggregateCanary([{ ref: 'lib/x.js', verdicts: [classifyExistence({ ref: 'lib/x.js' }, { exists: null, error: 'io' })] }]);
    expect(amb.verdict).toBe('inconclusive');
  });
});
