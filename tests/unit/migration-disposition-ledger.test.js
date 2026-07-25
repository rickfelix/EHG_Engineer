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
  suppressedBasenames,
  applyDispositions,
  undispositionedBasenames,
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

  it('still counts APPLIED as a real DECISION for the undispositioned tally', () => {
    // APPLIED is a legitimate disposition — it just is not grounds for
    // suppression. Conflating the two would force a false choice between
    // "cannot record an apply" and "an apply hides drift".
    const gaps = [{ file: 'a.sql' }];
    const ledger = new Map([['a.sql', entry({ disposition: 'APPLIED' })]]);
    expect(undispositionedBasenames(gaps, ledger)).toEqual([]);
    expect(applyDispositions(gaps, ledger).suppressed).toHaveLength(0);
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
    const ledger = new Map([['a.sql', entry()], ['b.sql', entry({ disposition: 'APPLIED' })]]);
    expect(undispositionedBasenames(gaps, ledger)).toEqual([]);
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
