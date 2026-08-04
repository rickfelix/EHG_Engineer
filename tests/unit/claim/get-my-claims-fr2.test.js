// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-2 + FR-5) — the ownership predicate, and release
// resolving from the authoritative column.
//
// THE AXIS CONFUSION IS THE BUG. claiming_session_id answers OWNERSHIP ("does this session hold this
// row now"); claude_sessions.sd_key is a MIRROR and answers LIVENESS at best. releaseSD asked the
// ownership question of the mirror, so when the mirror was empty but the authoritative column still
// named the session, it printed "No SD currently claimed" and did nothing — the reported symptom
// where `sd:release` says "no SD claimed" for a QF that is still pinning its seat.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { getMyClaims, ownsClaim, claimsFromRows } = require_(path.join(root, 'lib/claim/get-my-claims.cjs'));
const COORD = fs.readFileSync(path.join(root, 'scripts/claude-session-coordinator.mjs'), 'utf8');

const ME = 'sess-mine';

/** @param sd rows returned for strategic_directives_v2, qf rows for quick_fixes */
const stub = (sd = [], qf = [], errs = {}) => ({
  from: (t) => ({
    select: () => ({
      eq: async () => (t === 'strategic_directives_v2'
        ? { data: sd, error: errs.sd ? { message: errs.sd } : null }
        : { data: qf, error: errs.qf ? { message: errs.qf } : null }),
    }),
  }),
});

describe('FR-2: the ownership predicate reads the AUTHORITATIVE columns', () => {
  it('returns claims from BOTH kinds, not just SDs', async () => {
    const r = await getMyClaims(stub([{ sd_key: 'SD-A', status: 'active' }], [{ id: 'QF-1', status: 'open' }]), ME);
    expect(r.count).toBe(2);
    expect(r.claims.map((c) => c.kind).sort()).toEqual(['QF', 'SD']);
  });

  // NO .limit(1) ANYWHERE. FR-8 must detect a session holding more than one claim, and a limit-1
  // resolver structurally cannot — it returns the same answer for one row or five, which is exactly
  // how a second held SD stays invisible.
  it('reports MULTIPLICITY rather than collapsing to one', async () => {
    const r = await getMyClaims(stub([{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }], []), ME);
    expect(r.count).toBe(2);
    expect(r.multiple).toBe(true);
    expect(r.claims.map((c) => c.key)).toEqual(['SD-A', 'SD-B']);
  });

  it('holding exactly one is not multiplicity', async () => {
    const r = await getMyClaims(stub([{ sd_key: 'SD-A' }], []), ME);
    expect(r.multiple).toBe(false);
  });

  it('a genuinely unheld session reports zero with NO error', async () => {
    const r = await getMyClaims(stub([], []), ME);
    expect(r.count).toBe(0);
    expect(r.error).toBeNull();
  });

  // THE DISTINCTION THAT PREVENTS A FALSE RELEASE. "I found nothing" and "I could not look" must not
  // produce the same verdict — one means the seat is free, the other means unknown.
  it('a partial read reports the error INSTEAD of looking like no claims', async () => {
    const r = await getMyClaims(stub([], [], { sd: 'permission denied' }), ME);
    expect(r.error).toMatch(/permission denied/);
    expect(r.count).toBe(0);
  });

  it('surfaces what it DID find when only one surface fails', async () => {
    const r = await getMyClaims(stub([], [{ id: 'QF-1', status: 'open' }], { sd: 'timeout' }), ME);
    expect(r.count).toBe(1);
    expect(r.error).toMatch(/timeout/);
  });

  it('never throws on missing inputs', async () => {
    await expect(getMyClaims(null, ME)).resolves.toMatchObject({ count: 0 });
    await expect(getMyClaims(stub(), null)).resolves.toMatchObject({ count: 0 });
    expect((await getMyClaims(null, null)).error).toMatch(/missing/);
  });

  it('ownsClaim answers the single-row ownership question', async () => {
    const sb = stub([{ sd_key: 'SD-A' }], [{ id: 'QF-1' }]);
    expect(await ownsClaim(sb, ME, 'SD-A')).toBe(true);
    expect(await ownsClaim(sb, ME, 'QF-1')).toBe(true);
    expect(await ownsClaim(sb, ME, 'SD-NOPE')).toBe(false);
    expect(await ownsClaim(sb, ME, null)).toBe(false);
  });

  it('claimsFromRows is pure and filters on the authoritative column', () => {
    const rows = [{ sd_key: 'SD-A', claiming_session_id: ME }, { sd_key: 'SD-B', claiming_session_id: 'other' }];
    expect(claimsFromRows(rows, ME).map((r) => r.sd_key)).toEqual(['SD-A']);
    expect(claimsFromRows(null, ME)).toEqual([]);
  });
});

describe('FR-5: release resolves from the authoritative column, not the mirror', () => {
  it('falls back to getMyClaims when the in-memory mirror is empty', () => {
    expect(COORD).toMatch(/const \{ getMyClaims \} = await import\('\.\.\/lib\/claim\/get-my-claims\.cjs'\)/);
  });

  // The old code returned early on !session.sd_id and reported no claim. That exact shape must not
  // come back — it is the bug.
  it('no longer returns early on the mirror alone', () => {
    const fn = COORD.slice(COORD.indexOf('async function releaseSD'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).not.toMatch(/if \(!session\.sd_id\) \{\s*\n\s*console\.log\([^\n]*No SD currently claimed[^\n]*\);\s*\n\s*return;/);
    expect(body).toMatch(/mirror empty AND no authoritative claim/);
  });

  // A FAILED READ MUST NOT REPORT "NO CLAIM". Saying so sends an operator away believing the seat is
  // free while it is still pinned — the same misreport this FR exists to end, in a new costume.
  it('refuses to claim "no SD" when the authoritative read failed', () => {
    const fn = COORD.slice(COORD.indexOf('async function releaseSD'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/NOT reporting "no claim" — that would be a guess/);
  });

  it('surfaces multiplicity to the operator rather than releasing one silently', () => {
    const fn = COORD.slice(COORD.indexOf('async function releaseSD'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/claims\.length > 1/);
    expect(body).toMatch(/re-run until this list is empty/);
  });
});
