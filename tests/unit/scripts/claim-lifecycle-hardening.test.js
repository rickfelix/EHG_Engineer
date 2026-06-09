/**
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002 — claim-lifecycle hardening.
 *
 * FR-1: sweep co-clears active_session_id at every strategic_directives_v2 release site
 *       (NEW scanner over strategic_directives_v2 — the existing stale-session-sweep-release-payload
 *        test scans claude_sessions UPDATEs, a different table).
 * FR-2: worker-checkin selfHealStaleClaim is CAS-guarded by THIS session_id + co-nulls worktree cols.
 * FR-3: shared NON_RESUMABLE_STATUSES / isResumableStatus / NON_RESUMABLE_IN_LIST.
 * FR-4: park-worker writer cap <= sweep reader cap (one shared constant).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { NON_RESUMABLE_STATUSES, NON_RESUMABLE_IN_LIST, isResumableStatus } from '../../../lib/leo/non-resumable-status.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SWEEP_SRC = readFileSync(resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

const { selfHealStaleClaim } = require('../../../scripts/worker-checkin.cjs');
const { HARD_CAP_MIN } = require('../../../scripts/park-worker.cjs');
const { SILENCE_HARD_CAP_MIN, SILENCE_HARD_CAP_MS } = require('../../../lib/fleet/silence-cap.cjs');

describe('FR-1: sweep co-clears active_session_id at every strategic_directives_v2 release site', () => {
  it('every strategic_directives_v2 UPDATE that nulls claiming_session_id also nulls active_session_id', () => {
    const fromMatches = [...SWEEP_SRC.matchAll(/\.from\(\s*['"]strategic_directives_v2['"]\s*\)/g)];
    expect(fromMatches.length).toBeGreaterThanOrEqual(5);
    let releaseSites = 0;
    for (const m of fromMatches) {
      const window = SWEEP_SRC.slice(m.index, m.index + 700);
      const updateMatch = window.match(/\.update\s*\(\s*\{([\s\S]*?)\}\s*\)/);
      if (!updateMatch) continue; // SELECTs skipped
      const payload = updateMatch[1];
      // A release UPDATE is one that NULLS claiming_session_id. Re-asserts (claiming_session_id: <var>)
      // and phantom resets (no claiming_session_id key) are correctly excluded by this gate.
      if (!/claiming_session_id\s*:\s*null/.test(payload)) continue;
      releaseSites++;
      const offsetInFile = m.index + updateMatch.index;
      const lineNumber = SWEEP_SRC.slice(0, offsetInFile).split('\n').length;
      expect(payload, `strategic_directives_v2 release UPDATE at line ~${lineNumber} missing active_session_id:null`)
        .toMatch(/active_session_id\s*:\s*null/);
    }
    expect(releaseSites).toBeGreaterThanOrEqual(5);
  });

  it('documents the trigger that covers the session-flip sites (the L884 FIX#2 site is the one it cannot)', () => {
    expect(SWEEP_SRC).toMatch(/sync_is_working_on_with_session/);
  });
});

describe('FR-2: selfHealStaleClaim is CAS-guarded by session_id and co-nulls worktree cols', () => {
  function mockSb() {
    const calls = [];
    let cur;
    const chain = {
      from(t) { cur = { table: t, payload: null, eqs: [] }; calls.push(cur); return chain; },
      update(p) { cur.payload = p; return chain; },
      eq(k, v) { cur.eqs.push([k, v]); return chain; },
      then(res, rej) { return Promise.resolve({ error: null }).then(res, rej); },
    };
    return { chain, calls };
  }

  it('clears claude_sessions (sd_key+worktree_path+worktree_branch) guarded by session_id AND sd_key', async () => {
    const { chain, calls } = mockSb();
    await selfHealStaleClaim(chain, 'sess-1', 'SD-X');
    const cs = calls.find(c => c.table === 'claude_sessions');
    expect(cs.payload).toEqual({ sd_key: null, worktree_path: null, worktree_branch: null });
    expect(cs.eqs).toContainEqual(['session_id', 'sess-1']); // CAS: this session
    expect(cs.eqs).toContainEqual(['sd_key', 'SD-X']);        // CAS: still this SD
  });

  it('clears strategic_directives_v2 pointer cols guarded by claiming_session_id = this session', async () => {
    const { chain, calls } = mockSb();
    await selfHealStaleClaim(chain, 'sess-1', 'SD-X');
    const sd = calls.find(c => c.table === 'strategic_directives_v2');
    expect(sd.payload).toEqual({ is_working_on: false, active_session_id: null, claiming_session_id: null });
    expect(sd.eqs).toContainEqual(['sd_key', 'SD-X']);
    expect(sd.eqs).toContainEqual(['claiming_session_id', 'sess-1']); // CAS: never clobber a peer
  });

  it('fail-open: never throws even if the DB rejects', async () => {
    const throwing = { from() { return throwing; }, update() { return throwing; }, eq() { return throwing; }, then(_r, rej) { return Promise.resolve().then(() => { throw new Error('db down'); }).catch(rej); } };
    await expect(selfHealStaleClaim(throwing, 'sess-1', 'SD-X')).resolves.toBeUndefined();
  });
});

describe('FR-3: shared NON_RESUMABLE_STATUSES', () => {
  it('excludes completed, cancelled, deferred, AND pending_approval', () => {
    expect(NON_RESUMABLE_STATUSES).toEqual(expect.arrayContaining(['completed', 'cancelled', 'deferred', 'pending_approval']));
    for (const s of ['completed', 'cancelled', 'deferred', 'pending_approval']) expect(isResumableStatus(s)).toBe(false);
  });
  it('still allows resumable in-flight statuses', () => {
    for (const s of ['draft', 'in_progress', 'active', 'planning']) expect(isResumableStatus(s)).toBe(true);
  });
  it('builds the correct PostgREST IN-list literal', () => {
    expect(NON_RESUMABLE_IN_LIST).toBe('("completed","cancelled","deferred","pending_approval")');
  });
});

describe('FR-4: park-worker writer cap <= sweep reader cap (shared constant)', () => {
  it('park-worker HARD_CAP_MIN never exceeds the sweep reader cap', () => {
    expect(HARD_CAP_MIN).toBeLessThanOrEqual(SILENCE_HARD_CAP_MIN);
  });
  it('the sweep source uses the shared SILENCE_HARD_CAP_MS (no local 30*60*1000 literal)', () => {
    expect(SWEEP_SRC).toMatch(/require\(['"]\.\.\/lib\/fleet\/silence-cap\.cjs['"]\)/);
    expect(SWEEP_SRC).not.toMatch(/SILENCE_HARD_CAP_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
    expect(SILENCE_HARD_CAP_MS).toBe(30 * 60 * 1000);
  });
});
