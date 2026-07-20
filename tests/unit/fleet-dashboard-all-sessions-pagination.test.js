/**
 * QF-20260720-230 — fleet-dashboard.cjs's v_active_sessions "all" read (feeds allSessions,
 * consumed by isDispatchableFleetMember idle/liveness detection) had NO filter and was a raw
 * unpaginated select, silently capped at PostgREST's 1000-row max. Live-verified: v_active_sessions
 * had 5,921 rows, so this read was missing ~83% of sessions. Converted to fapPaginate, matching
 * the pattern already used for every other unfiltered read in this file (PR #6280,
 * SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001). Static source pin — no live DB — so a future
 * edit can't silently revert this one site back to a capped raw select.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('fleet-dashboard.cjs allSessions read — paginated, not capped (QF-20260720-230)', () => {
  it('the v_active_sessions "all" read (feeding allSessions) calls fapPaginate', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../scripts/fleet-dashboard.cjs', import.meta.url)),
      'utf8',
    );
    const idx = src.indexOf('allSessionsPromise');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toContain('fapPaginate');
    expect(block).toContain("select('session_id, sd_key, computed_status, metadata, tty, heartbeat_age_seconds, heartbeat_age_human')");
    // Regression guard against reintroducing the old raw-select variant that fed
    // allSessRes/warnIfCapTruncated instead of the paginated promise.
    expect(src).not.toMatch(/warnIfCapTruncated\(allSessRes\.data/);
    expect(src).toMatch(/allSessions\s*=\s*await allSessionsPromise/);
  });
});
