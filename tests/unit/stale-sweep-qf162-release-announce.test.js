// QF-20260611-162: CLAIM_RELEASED announce-vs-write split.
// Before: the announce loop iterated ALL `dead` sessions, but the release loop
// `continue`s on four hold guards (WIP, MC, hardcap-pid-alive, cross-signal) and
// the UPDATE can fail — so held/failed releases were announced as CLAIM_RELEASED
// every ~5min forever while claiming_session_id persisted (7+ phantom announces
// across 2 SDs on 2026-06-11). After: only write-verified releases announce
// CLAIM_RELEASED; failed writes announce RELEASE_FAILED with the error; both are
// deduped to once per session per 30 minutes.
// Static source assertions per the project convention for this monolithic script
// (see stale-sweep-qf211-claim-guards.test.js).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs');
const src = readFileSync(SCRIPT, 'utf8');

describe('QF-20260611-162: write-checked release tracking', () => {
  it('declares releasedDead and releaseFailedDead trackers next to the dead classification', () => {
    expect(src).toMatch(/const releasedDead = \[\];/);
    expect(src).toMatch(/const releaseFailedDead = \[\];/);
  });

  it('pushes to releasedDead ONLY on the success branch of the release UPDATE', () => {
    const idx = src.indexOf('releasedDead.push(s)');
    expect(idx).toBeGreaterThan(0);
    // the push must sit in the else of `if (error)` — i.e. after the FAILED action line
    const before = src.slice(idx - 400, idx);
    expect(before).toMatch(/if \(error\) \{/);
    expect(before).toMatch(/FAILED to release/);
  });

  it('pushes failed releases (with the error) to releaseFailedDead', () => {
    expect(src).toMatch(/releaseFailedDead\.push\(\{ \.\.\.s, release_error: error\.message \}\)/);
  });
});

describe('QF-20260611-162: announce loop iterates verified releases, not raw dead', () => {
  it('the PID-dead CLAIM_RELEASED announce iterates releasedDead', () => {
    expect(src).toMatch(/for \(const d of releasedDead\)/);
  });

  it('the legacy `for (const d of dead)` announce loop is GONE', () => {
    // `dead` is still used for classification/release, but never as the announce iterator
    expect(src).not.toMatch(/for \(const d of dead\)/);
  });

  it('failed writes announce RELEASE_FAILED carrying the error, never CLAIM_RELEASED', () => {
    const idx = src.indexOf("message_type: 'RELEASE_FAILED'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx - 600, idx + 600);
    expect(block).toMatch(/for \(const d of releaseFailedDead\)/);
    expect(block).toMatch(/PID_DEAD_RELEASE_FAILED/);
    expect(block).toMatch(/error: d\.release_error/);
  });
});

describe('QF-20260611-162: 30-minute announce dedup', () => {
  it('defines a 30-minute dedup window', () => {
    expect(src).toMatch(/const ANNOUNCE_DEDUP_MIN = 30;/);
  });

  it('both announce loops check for a recent same-type message to the same session before inserting', () => {
    // two dedup probes: one for CLAIM_RELEASED, one for RELEASE_FAILED
    const claimDedup = src.match(/\.eq\('message_type', 'CLAIM_RELEASED'\)\s*\n\s*\.gte\('created_at', dedupSinceIso\)/);
    const failDedup = src.match(/\.eq\('message_type', 'RELEASE_FAILED'\)\s*\n\s*\.gte\('created_at', dedupSinceIso\)/);
    expect(claimDedup).toBeTruthy();
    expect(failDedup).toBeTruthy();
  });

  it('dedup skips with continue (no insert) when a recent announce exists', () => {
    const idx = src.indexOf('const ANNOUNCE_DEDUP_MIN');
    const after = src.slice(idx, idx + 2500);
    expect(after).toMatch(/if \(dupes && dupes\.length > 0\) continue;/);
  });
});
