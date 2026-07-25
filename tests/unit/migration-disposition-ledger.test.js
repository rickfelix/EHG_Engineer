/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 — disposition ledger invariants.
 *
 * Each describe block guards one specific way this SD could ghost-complete or
 * cause harm. TS-6 is the load-bearing one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isSuppressingEntry,
  loadLedger,
  inspectLedger,
  suppressedBasenames,
  applyDispositions,
  undispositionedBasenames,
  contradictoryBasenames,
  hasReadableReason,
  gapBasename,
  SUPPRESSING_DISPOSITIONS,
  KNOWN_DISPOSITIONS
} from '../../scripts/lib/migration-disposition-ledger.mjs';

const GOOD_REASON = 'superseded by 20260801_consolidated.sql; verified no live readers';

function entry(over = {}) {
  return { disposition: 'RETIRED', reason: GOOD_REASON, owner: 'Alpha-2', sd_key: 'SD-X', ...over };
}

let tmpdir;
beforeEach(() => { tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-ledger-')); });
afterEach(() => { try { fs.rmSync(tmpdir, { recursive: true, force: true }); } catch { /* best effort */ } });

function writeLedger(contents) {
  const p = path.join(tmpdir, 'ledger.json');
  fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf8');
  return p;
}

describe('TS-6 GHOST-COMPLETION GUARD — APPLIED can never suppress (FR-2b)', () => {
  // The single highest-risk path in this SD. The failure is auto-seeded and
  // well-formed, so neither the reason-required test nor the fail-open test
  // catches it: FR-2 seeds from reachability buckets whose vocabulary is
  // "REACHABLE = APPLY candidates", and the natural mapping bug writes APPLIED
  // for exactly the recent files that have NOT been applied yet.
  it('does not suppress a file marked APPLIED even with a valid reason', () => {
    expect(isSuppressingEntry(entry({ disposition: 'APPLIED' }))).toBe(false);
  });

  it('leaves an APPLIED-marked file in the reported gap set', () => {
    const gaps = [{ file: 'database/migrations/20260724190000_add_manual_revenue.sql' }];
    const ledger = new Map([['20260724190000_add_manual_revenue.sql', entry({ disposition: 'APPLIED' })]]);
    const { remaining, suppressed } = applyDispositions(gaps, ledger);
    expect(suppressed).toHaveLength(0);
    expect(remaining).toHaveLength(1);
  });

  it('APPLIED on a file still IN gaps counts as UNDISPOSITIONED, not decided', () => {
    // This assertion was originally inverted — it credited APPLIED as a real decision, on the
    // reasoning that APPLIED is legitimate and merely non-suppressing. Two independent
    // adversarial reviews showed that hands over the completion metric: hand-writing APPLIED
    // for all 123 residual files drives "undispositioned" to 0 while suppressing nothing and
    // leaving every gap real. FR-2b guards what the GATE BLOCKS on; this guards what the SD
    // CLAIMS. A file in the gap set is not applied, whatever the ledger says.
    const gaps = [{ file: 'a.sql' }];
    const ledger = new Map([['a.sql', entry({ disposition: 'APPLIED' })]]);
    expect(undispositionedBasenames(gaps, ledger)).toEqual(['a.sql']);
    expect(applyDispositions(gaps, ledger).suppressed).toHaveLength(0);
  });

  it('surfaces the contradiction explicitly rather than discarding it', () => {
    const gaps = [{ file: 'a.sql' }, { file: 'b.sql' }];
    const ledger = new Map([['a.sql', entry({ disposition: 'APPLIED' })], ['b.sql', entry()]]);
    expect(contradictoryBasenames(gaps, ledger)).toEqual(['a.sql']);
  });

  it('APPLIED for a file NOT in the gap set is not a contradiction — that is the normal post-apply fact', () => {
    const ledger = new Map([['applied-and-gone.sql', entry({ disposition: 'APPLIED' })]]);
    expect(contradictoryBasenames([{ file: 'other.sql' }], ledger)).toEqual([]);
  });

  it('a reason-less or unknown-disposition APPLIED entry is malformed, not a contradiction', () => {
    const gaps = [{ file: 'a.sql' }];
    expect(contradictoryBasenames(gaps, new Map([['a.sql', entry({ disposition: 'APPLIED', reason: '  ' })]]))).toEqual([]);
    expect(contradictoryBasenames(gaps, new Map([['a.sql', entry({ disposition: 'APPLY' })]]))).toEqual([]);
  });

  it('excludes APPLIED from the suppressing set but keeps it known', () => {
    expect(SUPPRESSING_DISPOSITIONS).not.toContain('APPLIED');
    expect(KNOWN_DISPOSITIONS).toContain('APPLIED');
  });
});

describe('TS-1 reason-required invariant (FR-1)', () => {
  it('ignores an entry with no reason key', () => {
    const e = entry(); delete e.reason;
    expect(isSuppressingEntry(e)).toBe(false);
  });

  it.each([['empty', ''], ['spaces', '   '], ['tab', '\t'], ['newline', '\n']])(
    'ignores a %s reason — trimmed, so bare truthiness would wrongly pass',
    (_label, reason) => { expect(isSuppressingEntry(entry({ reason }))).toBe(false); }
  );

  it.each([['null', null], ['zero', 0], ['false', false], ['object', {}], ['array', []]])(
    'ignores a non-string reason (%s)',
    (_label, reason) => { expect(isSuppressingEntry(entry({ reason }))).toBe(false); }
  );

  it('POSITIVE CONTROL — suppresses when the reason is genuinely present', () => {
    expect(isSuppressingEntry(entry())).toBe(true);
    expect(isSuppressingEntry(entry({ disposition: 'DEFERRED' }))).toBe(true);
  });

  // String.trim() strips only WhiteSpace/LineTerminator, so these pass a trim-based check
  // while rendering blank in every editor and diff — a reason no human can read, satisfying
  // a rule named "reason required". Found by adversarial review.
  it.each([
    ['zero-width space', '​'],
    ['zero-width non-joiner', '‌'],
    ['zero-width joiner', '‍'],
    ['soft hyphen', '­'],
    ['BOM', '﻿'],
    ['mixed invisibles + spaces', ' ​ ­﻿ '],
  ])('rejects an invisible-only reason (%s)', (_label, reason) => {
    expect(isSuppressingEntry(entry({ reason }))).toBe(false);
    expect(hasReadableReason(reason)).toBe(false);
  });

  it('accepts a reason that merely CONTAINS an invisible character', () => {
    expect(hasReadableReason('superseded​ by 20260801')).toBe(true);
    expect(isSuppressingEntry(entry({ reason: 'superseded​ by 20260801' }))).toBe(true);
  });
});

describe('inspectLedger — fail-open suppression, but an honest status for humans', () => {
  it('distinguishes absent from malformed so a corrupt ledger cannot read as "no decisions yet"', () => {
    expect(inspectLedger(path.join(tmpdir, 'nope.json'))).toMatchObject({ status: 'absent' });
    expect(inspectLedger(writeLedger('{ broken'))).toMatchObject({ status: 'malformed' });
    expect(inspectLedger(writeLedger('[]'))).toMatchObject({ status: 'wrong-shape' });
    expect(inspectLedger(writeLedger({ 'a.sql': entry() }))).toMatchObject({ status: 'ok' });
  });

  it('every non-ok status still yields an EMPTY map — reporting changed, fail-open did not', () => {
    for (const body of ['{ broken', '[]', '"str"', 'null', '']) {
      expect(inspectLedger(writeLedger(body)).ledger.size).toBe(0);
    }
    expect(inspectLedger(path.join(tmpdir, 'nope.json')).ledger.size).toBe(0);
  });

  it('loadLedger stays a thin wrapper returning just the map', () => {
    const p = writeLedger({ 'a.sql': entry() });
    expect(loadLedger(p)).toEqual(inspectLedger(p).ledger);
  });
});

describe('fail-closed enum — unknown dispositions never suppress', () => {
  it.each([['APPLY', 'APPLY'], ['TODO', 'TODO'], ['retired lowercase', 'retired'], ['typo', 'RETIRD'], ['empty', '']])(
    'ignores unrecognised disposition %s',
    (_label, disposition) => { expect(isSuppressingEntry(entry({ disposition }))).toBe(false); }
  );

  it('ignores APPLY specifically — the reachability-bucket wording that causes the mapping bug', () => {
    expect(isSuppressingEntry(entry({ disposition: 'APPLY' }))).toBe(false);
  });
});

describe('TS-2 FAIL OPEN — a broken ledger suppresses nothing (FR-6)', () => {
  it('returns an empty map when the file is absent', () => {
    expect(loadLedger(path.join(tmpdir, 'nope.json')).size).toBe(0);
  });

  it.each([
    ['malformed', '{ not json'],
    ['truncated', '{"a":'],
    ['empty', ''],
    ['whitespace', '   \n  '],
    ['array', '[]'],
    ['scalar string', '"hello"'],
    ['null', 'null']
  ])('returns an empty map for %s content', (_label, body) => {
    expect(loadLedger(writeLedger(body)).size).toBe(0);
  });

  it('returns an empty map for a directory instead of a file', () => {
    const d = path.join(tmpdir, 'adir'); fs.mkdirSync(d);
    expect(loadLedger(d).size).toBe(0);
  });

  it('MASS-SUPPRESSION TRIPWIRE — 126 gaps + corrupt ledger suppresses exactly 0', () => {
    // Asserted as suppressed===0 rather than remaining.length>0, which would
    // pass vacuously even if 125 of 126 were silently suppressed.
    const gaps = Array.from({ length: 126 }, (_, i) => ({ file: `m${i}.sql` }));
    const { remaining, suppressed } = applyDispositions(gaps, loadLedger(writeLedger('{ broken')));
    expect(suppressed).toHaveLength(0);
    expect(remaining).toHaveLength(126);
  });

  it('no-ledger behaviour is identical to empty-ledger behaviour', () => {
    const gaps = [{ file: 'a.sql' }, { file: 'b.sql' }];
    expect(applyDispositions(gaps, new Map()).remaining)
      .toEqual(applyDispositions(gaps, loadLedger(path.join(tmpdir, 'absent.json'))).remaining);
  });

  it('tolerates wrong-shaped entries inside an otherwise valid ledger', () => {
    const ledger = loadLedger(writeLedger({ 'a.sql': 'a string', 'b.sql': null, 'c.sql': [], 'd.sql': entry() }));
    expect(suppressedBasenames(ledger)).toEqual(new Set(['d.sql']));
  });
});

describe('FR-3 undispositioned count — the machine-checkable DoD', () => {
  it('lists gaps carrying no ledger entry', () => {
    const gaps = [{ file: 'a.sql' }, { file: 'b.sql' }, { file: 'c.sql' }];
    const ledger = new Map([['b.sql', entry()]]);
    expect(undispositionedBasenames(gaps, ledger)).toEqual(['a.sql', 'c.sql']);
  });

  it('counts a reason-less entry as UNDISPOSITIONED — a decision nobody can read is not a decision', () => {
    const gaps = [{ file: 'a.sql' }];
    expect(undispositionedBasenames(gaps, new Map([['a.sql', entry({ reason: '  ' })]]))).toEqual(['a.sql']);
  });

  it('counts an unknown-disposition entry as UNDISPOSITIONED', () => {
    const gaps = [{ file: 'a.sql' }];
    expect(undispositionedBasenames(gaps, new Map([['a.sql', entry({ disposition: 'APPLY' })]]))).toEqual(['a.sql']);
  });

  it('reaches zero only when every gap is genuinely decided', () => {
    const gaps = [{ file: 'a.sql' }, { file: 'b.sql' }];
    const ledger = new Map([['a.sql', entry()], ['b.sql', entry({ disposition: 'DEFERRED' })]]);
    expect(undispositionedBasenames(gaps, ledger)).toEqual([]);
  });

  it('CANNOT be driven to zero by marking every gap APPLIED — the metric-spoofing path', () => {
    const gaps = Array.from({ length: 123 }, (_, i) => ({ file: `m${i}.sql` }));
    const ledger = new Map(gaps.map((g) => [g.file, entry({ disposition: 'APPLIED' })]));
    expect(undispositionedBasenames(gaps, ledger)).toHaveLength(123);
    expect(applyDispositions(gaps, ledger).suppressed).toHaveLength(0);
    expect(contradictoryBasenames(gaps, ledger)).toHaveLength(123);
  });

  it('returns sorted, deduplicated output', () => {
    const gaps = [{ file: 'z.sql' }, { file: 'a.sql' }, { file: 'z.sql' }];
    expect(undispositionedBasenames(gaps, new Map())).toEqual(['a.sql', 'z.sql']);
  });
});

describe('basename keying — stable across worktrees', () => {
  it.each([
    ['posix path', 'database/migrations/20260711_x.sql'],
    ['windows path', 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\database\\migrations\\20260711_x.sql'],
    ['worktree path', 'C:/Users/rickf/.worktrees/SD-A/database/migrations/20260711_x.sql'],
    ['bare basename', '20260711_x.sql']
  ])('extracts the same basename from a %s', (_label, file) => {
    expect(gapBasename({ file })).toBe('20260711_x.sql');
  });

  it('accepts a bare string gap as well as a {file} object', () => {
    expect(gapBasename('database/migrations/a.sql')).toBe('a.sql');
  });

  it.each([['null', null], ['undefined', undefined], ['empty object', {}], ['number', 42]])(
    'returns empty string for a malformed gap (%s)',
    (_label, gap) => { expect(gapBasename(gap)).toBe(''); }
  );

  it('does not dereference fields beyond .file — gap objects may carry only {file}', () => {
    expect(() => applyDispositions([{ file: 'a.sql' }], new Map())).not.toThrow();
  });
});

describe('totality — no input shape throws', () => {
  it.each([['null', null], ['undefined', undefined], ['string', 'x'], ['number', 1], ['array', []]])(
    'isSuppressingEntry(%s) returns false rather than throwing',
    (_label, v) => { expect(isSuppressingEntry(v)).toBe(false); }
  );

  it('applyDispositions tolerates a non-array gaps argument', () => {
    expect(applyDispositions(null, new Map())).toEqual({ remaining: [], suppressed: [] });
  });

  it('suppressedBasenames tolerates a non-Map ledger', () => {
    expect(suppressedBasenames({})).toEqual(new Set());
  });
});
