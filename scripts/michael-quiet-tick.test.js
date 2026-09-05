// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A / FR-5, TS-10 (inert before child B) + the line contract.
import { describe, it, expect } from 'vitest';
import { runQuietTick, renderLines, countRows, inWindow, hhmmToMinutes, etStamp } from './michael-quiet-tick.mjs';
import { MICHAEL_TICK_TOKENS } from './michael-startup-check.mjs';

// A supabase stub whose every count query resolves through `answer(table)`.
function stub(answer) {
  const chain = (table) => {
    const q = {
      select: () => q, eq: () => q, is: () => q, in: () => q,
      then: (res, rej) => Promise.resolve(answer(table)).then(res, rej),
    };
    return q;
  };
  return { from: (table) => chain(table) };
}

const MISSING = { count: null, error: { code: '42P01', message: 'relation does not exist' } };
// 05:00 ET on a September morning (EDT = UTC-4) -> 09:00Z.
const FIVE_AM_ET = new Date('2026-09-06T09:00:00.000Z');
// 02:00 ET -> 06:00Z.
const TWO_AM_ET = new Date('2026-09-06T06:00:00.000Z');

describe('pure helpers', () => {
  it('hhmmToMinutes / inWindow honour the 04:30-07:30 ET window', () => {
    expect(hhmmToMinutes('04:30')).toBe(270);
    expect(inWindow(hhmmToMinutes('05:00'))).toBe(true);
    expect(inWindow(hhmmToMinutes('02:00'))).toBe(false);
    expect(inWindow(hhmmToMinutes('07:30'))).toBe(true);
    expect(inWindow(hhmmToMinutes('07:31'))).toBe(false);
  });
  it('etStamp is space-free ISO-8601 with an ET suffix', () => {
    expect(etStamp(FIVE_AM_ET)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}ET$/);
    expect(etStamp(FIVE_AM_ET)).not.toMatch(/\s/);
  });
});

describe('countRows', () => {
  it('treats a missing relation as count:null WITHOUT an error field (table-absent is not failure)', async () => {
    const r = await countRows(stub(() => MISSING), 'michael_brief_runs');
    expect(r).toEqual({ count: null });
  });
  it('treats the canonical client factory THROW (code COUNT_UNMEASURABLE, lib/supabase-client-schema-drift.cjs) as a missing relation too', async () => {
    const thrower = { from: () => ({ select: () => ({ eq: () => ({ then: (_res, rej) => rej(Object.assign(new Error('Supabase schema drift detected (count unmeasurable): ...'), { code: 'COUNT_UNMEASURABLE' })) }) }) }) };
    const r = await countRows(thrower, 'michael_brief_runs', (q) => q.eq('x', 1));
    expect(r).toEqual({ count: null });
  });
  it('treats a null count with no error as a missing relation on a non-throwing client', async () => {
    const r = await countRows(stub(() => ({ count: null, error: null })), 'michael_brief_runs');
    expect(r).toEqual({ count: null });
  });
  it('surfaces a genuine query error distinctly', async () => {
    const r = await countRows(stub(() => ({ count: null, error: { code: '57014', message: 'statement timeout' } })), 'michael_brief_runs');
    expect(r.count).toBeNull();
    expect(r.error).toMatch(/statement timeout/);
  });
});

describe('TS-10: inert before child B', () => {
  it('prints exactly one QUIET_TICK line with ? counts and ZERO action lines when every michael_* table is absent', async () => {
    const r = await runQuietTick({ sb: stub(() => MISSING), now: FIVE_AM_ET, env: { CLAUDE_SESSION_ID: 'sess-m' } });
    const lines = renderLines(r);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^QUIET_TICK=michael mode=ACTIVE et_now=\S+ classify=\? grade=\? brief=\? feeder=\? inbox=\? rulings=\? errors=0 nextWakeSeconds=900 :: /);
    expect(r.errors).toBe(0);
  });
  it('is QUIET outside the window and still emits no action lines', async () => {
    const r = await runQuietTick({ sb: stub(() => MISSING), now: TWO_AM_ET, env: {} });
    expect(r.mode).toBe('QUIET');
    expect(renderLines(r)).toHaveLength(1);
  });
});

describe('line contract', () => {
  it('emits one action line per non-zero queue and the brief state, each with a token the startup check consumes', async () => {
    const counts = { michael_gmail_triage_items: 3, michael_todoist_snapshot: 2, michael_brief_runs: 1, michael_feeder_runs: 1, michael_staged_items: 1, session_coordination: 4 };
    const r = await runQuietTick({ sb: stub((t) => ({ count: counts[t] ?? 0, error: null })), now: FIVE_AM_ET, env: { CLAUDE_SESSION_ID: 'sess-m' } });
    const lines = renderLines(r);
    expect(lines[0]).toMatch(/classify=3 grade=2 brief=finalize feeder=1 inbox=4 rulings=1 errors=0/);
    const tokens = lines.slice(1).map((l) => l.split('=')[0]);
    expect(tokens).toEqual(['QUIET_TICK_CLASSIFY_QUEUE', 'QUIET_TICK_GRADE_QUEUE', 'QUIET_TICK_BRIEF_FINALIZE', 'QUIET_TICK_FEEDER_FAILED', 'QUIET_TICK_INBOX_DIRECTIVE', 'QUIET_TICK_RULING_UNENCODED']);
    for (const t of tokens) expect(MICHAEL_TICK_TOKENS).toContain(t);
  });
  it('reports a missing brief after 05:45 ET inside the window, never before', async () => {
    const none = stub((t) => (t === 'michael_brief_runs' ? { count: 0, error: null } : MISSING));
    const early = await runQuietTick({ sb: none, now: FIVE_AM_ET, env: {} });
    expect(early.brief).toBe('pending');
    const late = await runQuietTick({ sb: none, now: new Date('2026-09-06T10:00:00.000Z'), env: {} }); // 06:00 ET
    expect(late.brief).toBe('missing');
    expect(renderLines(late).some((l) => l.startsWith('QUIET_TICK_BRIEF_MISSING='))).toBe(true);
  });
  it('a genuine error fires QUIET_TICK_ERROR with errors= plural numeric', async () => {
    const r = await runQuietTick({ sb: stub(() => ({ count: null, error: { code: '57014', message: 'timeout' } })), now: FIVE_AM_ET, env: {} });
    expect(r.errors).toBeGreaterThan(0);
    const lines = renderLines(r);
    expect(lines[0]).toMatch(/errors=\d+ /);
    expect(lines.at(-1)).toMatch(/^QUIET_TICK_ERROR=michael count=\d+ detail="/);
  });
});
