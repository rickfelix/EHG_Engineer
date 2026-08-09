// SD-LEO-INFRA-EVERY-CLAIM-WRITE-001 — the reaffirm write must LAND, and its outcome must reach
// the VERDICT rather than a log line.
//
// TWO DEFECTS COMPOSED HERE, and the second is why the first survived:
//  (1) `.update(...).or('claiming_session_id...').select('sd_key')` — on a PostgREST UPDATE an
//      `.or()` resolves its columns against the RETURNING projection, so this 42703'd on EVERY call.
//      Not intermittent, not a schema-cache lag: 100%, deterministic.
//  (2) reaffirmClaimColumns console.warn'd, returned undefined, and all three callers discarded it
//      and returned success:true — so sd-start printed "SD claimed successfully" over a write that
//      never landed, and a claim silently expired at the TTL while its owner was told it held.
//
// THE FAKE RECORDS THE QUERY ON PURPOSE. A fake whose builder methods all return the same object and
// the same fixture cannot tell the fixed code from the broken code — reverting the projection would
// leave every assertion green. That exact blindness shipped (green) on QF-673 earlier this session
// and was only caught by mutation. Here the projection is asserted DIRECTLY.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reaffirmClaimColumns, reaffirmFailureVerdict } from '../../../lib/claim-guard.mjs';
import { findUnprojectedOrFilters, orFilterColumns, projectionColumns } from '../../../scripts/lint/or-filter-must-project.mjs';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const KEY = 'SD-TEST-REAFFIRM-001';
const repoFile = (p) => readFileSync(join(process.cwd(), p), 'utf8');

/** Chainable fake that RECORDS every builder call, so the PROJECTION and FILTER are observable. */
function makeSb({ data = [{ sd_key: KEY, claiming_session_id: ME }], error = null } = {}) {
  const calls = [];
  const o = {
    update: (...a) => { calls.push({ m: 'update', a }); return o; },
    eq: (...a) => { calls.push({ m: 'eq', a }); return o; },
    or: (...a) => { calls.push({ m: 'or', a }); return o; },
    select: (...a) => { calls.push({ m: 'select', a }); return Promise.resolve({ data, error }); }
  };
  return { from: (t) => { calls.push({ m: 'from', a: [t] }); return o; }, calls,
    arg: (m) => calls.find((c) => c.m === m)?.a?.[0] };
}

describe('FR-1: the reaffirm UPDATE projects the column its .or() filters on', () => {
  it('PROJECTS claiming_session_id — the core defect, and the only test that observes it', async () => {
    // THE test. Every other assertion below would stay green with the old broken projection.
    const sb = makeSb();
    await reaffirmClaimColumns(sb, KEY, ME);
    const projection = sb.arg('select');
    const filtered = orFilterColumns(sb.arg('or'));
    expect(filtered).toContain('claiming_session_id');
    for (const col of filtered) expect(projection).toContain(col);
  });

  it('still filters null-OR-self, so reaffirm cannot steal a peer row', async () => {
    const sb = makeSb();
    await reaffirmClaimColumns(sb, KEY, ME);
    expect(sb.arg('or')).toContain('claiming_session_id.is.null');
    expect(sb.arg('or')).toContain(`claiming_session_id.eq.${ME}`);
  });
});

describe('FR-2/FR-3: the outcome reaches the verdict, and the two failure modes stay distinct', () => {
  it('reports OK only when the READBACK shows this session', async () => {
    const r = await reaffirmClaimColumns(makeSb(), KEY, ME);
    expect(r).toEqual({ ok: true, reason: 'OK' });
  });

  it('a WRITE ERROR is a FAULT — never a success', async () => {
    // The exact CODIFY failure mode: the write errored and a success banner printed anyway.
    const r = await reaffirmClaimColumns(makeSb({ data: null, error: { message: 'boom' } }), KEY, ME);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('WRITE_FAULT');
  });

  it('a LOST CAS (zero rows) is NOT_HELD — a peer owns it, which is not our fault', async () => {
    const r = await reaffirmClaimColumns(makeSb({ data: [] }), KEY, ME);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('NOT_HELD');
  });

  it('WRITE_FAULT and NOT_HELD are DISTINCT — collapsing them would hide which one happened', async () => {
    const fault = await reaffirmClaimColumns(makeSb({ data: null, error: { message: 'x' } }), KEY, ME);
    const lost = await reaffirmClaimColumns(makeSb({ data: [] }), KEY, ME);
    expect(fault.reason).not.toBe(lost.reason);
  });

  it('VALUE-EQUALITY READBACK: a row that comes back holding someone else is not success', async () => {
    // Success is asserted from what the database now holds, never from the write we intended.
    const r = await reaffirmClaimColumns(makeSb({ data: [{ sd_key: KEY, claiming_session_id: PEER }] }), KEY, ME);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('READBACK_MISMATCH');
    expect(r.holder).toBe(PEER);
  });

  it('every non-ok outcome becomes a FAILING claim verdict; ok passes through untouched', () => {
    expect(reaffirmFailureVerdict({ ok: true, reason: 'OK' })).toBeNull();
    expect(reaffirmFailureVerdict({ ok: false, reason: 'WRITE_FAULT', error: 'e' }).success).toBe(false);
    expect(reaffirmFailureVerdict({ ok: false, reason: 'NOT_HELD' }).success).toBe(false);
    expect(reaffirmFailureVerdict({ ok: false, reason: 'READBACK_MISMATCH' }).success).toBe(false);
    // A fault must be distinguishable from contention in the message an operator actually reads.
    expect(reaffirmFailureVerdict({ ok: false, reason: 'WRITE_FAULT', error: 'e' }).error).toMatch(/write_failed/);
    expect(reaffirmFailureVerdict({ ok: false, reason: 'NOT_HELD' }).error).toMatch(/held_by_other/);
  });
});

describe('FR-2 (source property): no caller may DISCARD the reaffirm result', () => {
  it('every reaffirmClaimColumns call site routes through the verdict helper', () => {
    // The defect was structural — three call sites awaiting and dropping the value. A behavioural
    // test on one branch would not have caught the other two, so assert the property over all of them.
    // COMMENTS ARE BLANKED FIRST. The first version of this test matched the doc-comment above the
    // helper — which mentions the function by name — and reported a discard that does not exist.
    // A comment is not code; a scan that cannot tell them apart measures prose.
    const src = repoFile('lib/claim-guard.mjs')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/^\s*\/\/.*$/gm, '');
    const lines = src.split('\n');
    const callSites = lines
      .map((text, i) => ({ text, line: i + 1 }))
      .filter(({ text }) => /\breaffirmClaimColumns\s*\(/.test(text) && !/^export async function/.test(text.trim()));
    expect(callSites.length, 'expected the three known call sites').toBeGreaterThanOrEqual(3);
    for (const { text, line } of callSites) {
      expect(text, `line ${line} discards the reaffirm result`).toMatch(/reaffirmFailureVerdict\s*\(/);
    }
  });
});

describe('FR-4 (the lint): an .or() on an UPDATE must project the columns it filters on', () => {
  it('FLAGS the narrowed projection — the shipped defect', () => {
    const broken = "await sb.from('t').update({ a: 1 }).eq('sd_key', k).or(`claiming_session_id.is.null,claiming_session_id.eq.${s}`).select('sd_key');";
    const found = findUnprojectedOrFilters(broken, 'broken.mjs');
    expect(found).toHaveLength(1);
    expect(found[0].missing).toEqual(['claiming_session_id']);
  });

  it('PASSES the real claimQuickFix — the positive control that proves the pattern works', () => {
    // Coordinator-directed: claimQuickFix is already correct and must NOT be touched. If this ever
    // fails, the lint has become over-broad, not the code wrong.
    expect(findUnprojectedOrFilters(repoFile('lib/quick-fix-claim.mjs'), 'quick-fix-claim.mjs')).toEqual([]);
  });

  it('PASSES the fixed claim-guard, and would have FAILED it before the fix', () => {
    const fixed = repoFile('lib/claim-guard.mjs');
    expect(findUnprojectedOrFilters(fixed, 'claim-guard.mjs')).toEqual([]);
    // MUTATION, in-test: narrow the projection back and the lint must catch it. Without this the
    // suite could pass simply because the scanner never matches anything.
    const mutated = fixed.replace(".select('sd_key,claiming_session_id')", ".select('sd_key')");
    expect(mutated).not.toBe(fixed);
    expect(findUnprojectedOrFilters(mutated, 'claim-guard.mjs').length).toBeGreaterThan(0);
  });

  it('does NOT flag .eq() filters — measured unaffected; flagging them would churn working code', () => {
    // lib/claim-lifecycle-release.mjs filters .eq('claiming_session_id') while projecting only 'id'
    // and works fine. The rule is about .or() specifically.
    const eqOnly = "await sb.from('t').update({ a: 1 }).eq('id', i).eq('claiming_session_id', h).select('id');";
    expect(findUnprojectedOrFilters(eqOnly, 'eq.mjs')).toEqual([]);
  });

  it('does NOT flag an UPDATE with no .select(), nor a SELECT chain', () => {
    const noSelect = "await sb.from('t').update({ a: 1 }).eq('id', i).or('pipeline_mode.eq.building,pipeline_mode.is.null');";
    expect(findUnprojectedOrFilters(noSelect, 'no-select.mjs')).toEqual([]);
    const selectChain = "await sb.from('t').select('id').or('claiming_session_id.is.null');";
    expect(findUnprojectedOrFilters(selectChain, 'select.mjs')).toEqual([]);
  });

  it('treats select(*) as projecting everything', () => {
    expect(projectionColumns('*')).toBe('*');
    const star = "await sb.from('t').update({ a: 1 }).or('claiming_session_id.is.null').select('*');";
    expect(findUnprojectedOrFilters(star, 'star.mjs')).toEqual([]);
  });
});
