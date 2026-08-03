// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 (FR-6) — writers stop stomping foreign holders.
//
// reaffirmClaimColumns had TWO branches and only one guard. The QF branch routed through the shared
// fail-closed CAS; the SD branch issued a bare `.update({claiming_session_id}).eq('sd_key', ...)`
// that UNCONDITIONALLY overwrote whoever held the row — including a live peer mid-build.
//
// REAFFIRM IS NOT CLAIM, and that framing decides the guard. Its only legitimate outcomes are
// "re-assert what I already hold" and "take a row nobody holds". Stealing is never one of them, so
// the CAS is null-OR-self — the same rule the QF branch already used, not a second invented one.
//
// THE PART THAT MAKES IT OBSERVABLE: PostgREST reports a lost CAS as ZERO UPDATED ROWS, not an
// error. Without inspecting the returned rows, a stomp-prevented no-op is indistinguishable from a
// successful reaffirm — so the guard would work while nobody could tell whether it had.
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(root, 'lib/claim-guard.mjs'), 'utf8');

const ME = 'sess-mine';

/** Records the filters the SD branch applies, and how many rows the update "hits". */
const stub = (updatedRows) => {
  const calls = { filters: {}, or: null, payload: null };
  return {
    calls,
    client: {
      from: () => ({
        update: (payload) => {
          calls.payload = payload;
          const chain = {
            eq: (col, val) => { calls.filters[col] = val; return chain; },
            or: (expr) => { calls.or = expr; return chain; },
            select: async () => ({ data: updatedRows, error: null }),
          };
          return chain;
        },
      }),
    },
  };
};

const loadFn = async () => (await import(path.join(root, 'lib/claim-guard.mjs'))).reaffirmClaimColumns;

describe('FR-6: the SD branch compare-and-sets', () => {
  it('scopes the update to null-OR-self, so a foreign holder cannot be overwritten', async () => {
    const reaffirm = await loadFn();
    const s = stub([{ sd_key: 'SD-A' }]);
    await reaffirm(s.client, 'SD-A', ME);
    expect(s.calls.or).toBe(`claiming_session_id.is.null,claiming_session_id.eq.${ME}`);
    expect(s.calls.filters.sd_key).toBe('SD-A');
  });

  it('still writes the claim columns when the CAS is won', async () => {
    const reaffirm = await loadFn();
    const s = stub([{ sd_key: 'SD-A' }]);
    await reaffirm(s.client, 'SD-A', ME);
    expect(s.calls.payload).toMatchObject({ claiming_session_id: ME, is_working_on: true });
  });

  // THE OBSERVABILITY HALF. Zero updated rows is not an error, so without this the guard would be
  // silent and a stomp-prevented reaffirm would read exactly like a successful one.
  it('WARNS when the CAS is lost instead of failing silently', async () => {
    const reaffirm = await loadFn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const s = stub([]);                       // zero rows updated => someone else holds it
      await reaffirm(s.client, 'SD-A', ME);
      const said = warn.mock.calls.flat().join(' ');
      expect(said).toMatch(/held by another session/);
      expect(said).toMatch(/not clobbering/);
    } finally { warn.mockRestore(); }
  });

  it('does NOT warn when the reaffirm succeeded', async () => {
    const reaffirm = await loadFn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const s = stub([{ sd_key: 'SD-A' }]);
      await reaffirm(s.client, 'SD-A', ME);
      expect(warn).not.toHaveBeenCalled();      // a warning on a healthy path trains readers to ignore it
    } finally { warn.mockRestore(); }
  });

  // Reaffirm is best-effort defence-in-depth — the authoritative claim decision lives at the claim
  // entrypoint. A lost race must never become an exception that kills the caller.
  it('never throws on a lost CAS', async () => {
    const reaffirm = await loadFn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const s = stub([]);
      await expect(reaffirm(s.client, 'SD-A', ME)).resolves.toBeUndefined();
    } finally { warn.mockRestore(); }
  });

  it('routes QF keys to the shared CAS rather than the SD path', () => {
    const fn = SRC.slice(SRC.indexOf('export async function reaffirmClaimColumns'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/if \(sdKey\.startsWith\('QF-'\)\)/);
    expect(body).toMatch(/claimQuickFix\(supabase, sdKey, sessionId\)/);
  });

  it('the bare unguarded update is gone', () => {
    const fn = SRC.slice(SRC.indexOf('export async function reaffirmClaimColumns'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // The original shape: update -> eq('sd_key') -> end, with nothing between.
    expect(body).not.toMatch(/\.eq\('sd_key', sdKey\);\s*\n\s*\}/);
  });
});
