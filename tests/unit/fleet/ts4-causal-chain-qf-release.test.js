/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E — FR-4 AC #2 / TS-4, the SECOND half of the causal chain.
 *
 * tests/unit/fleet/session-liveness.test.js's "TS-4 end-to-end" describe block already proves the
 * FIRST half: the real holderRows SELECT in scripts/stale-session-sweep.cjs includes `status`, and
 * against that exact column set the e60956f5 specimen (released, is_alive stuck true, 8h-stale
 * heartbeat, no PID/tick/silence) reads {alive:false} through the real isSessionAlive().
 *
 * That alone does not prove the incident is closed -- isSessionAlive() returning {alive:false} is
 * only useful if the caller ACTS on it by releasing the QF rows the dead holder was stranding. This
 * file is that second half: it takes the same specimen construction, then feeds it through the real
 * clearAndReopenQf() (lib/fleet/best-effort-release.mjs) for BOTH claim-holding statuses the
 * incident actually involved -- an 'in_progress' QF and a claimed-'open' QF (FR-3's fix) -- and
 * asserts both are released. This is the exact assertion FR-4's own acceptance criterion names:
 * "the QF stale-claim sweep releases both an in_progress and a claimed-open QF held by that
 * session."
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { clearAndReopenQf } from '../../../lib/fleet/best-effort-release.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { isSessionAlive } = require_('../../../lib/fleet/session-liveness.cjs');

const NOW = Date.parse('2026-09-05T12:00:00Z');

/** Build the e60956f5 specimen against the REAL holderRows column list, not a hand-picked one. */
function buildSpecimen() {
  const src = readFileSync(path.join(__dirname, '../../../scripts/stale-session-sweep.cjs'), 'utf8');
  const m = src.match(/holderRows = await fapPaginate\(\(\) => supabase[\s\S]{0,800}?\.select\('([^']+)'\)/);
  expect(m, 'could not locate the holderRows .select(...) in scripts/stale-session-sweep.cjs').toBeTruthy();
  const columns = m[1].split(',').map((c) => c.trim());
  const specimen = {
    session_id: 'e60956f5-specimen', heartbeat_at: new Date(NOW - 8 * 60 * 60 * 1000).toISOString(),
    is_alive: true, status: 'released', terminal_id: null, process_alive_at: null, expected_silence_until: null,
  };
  const row = {};
  for (const col of columns) row[col] = specimen[col] ?? null;
  return row;
}

/** Same in-memory quick_fixes double as tests/unit/fleet/qf-clear-and-reopen.test.js. */
function fakeDb(row) {
  function makeBuilder() {
    const preds = [];
    let patch = null;
    const builder = {
      update(p) { patch = p; return builder; },
      select() { return builder; },
      eq(col, val) { preds.push((r) => r[col] === val); return builder; },
      in(col, vals) { preds.push((r) => Array.isArray(vals) && vals.includes(r[col])); return builder; },
      filter(col, op, val) {
        if (op !== 'eq') throw new Error(`fake supports only eq, got ${op}`);
        preds.push((r) => r[col] === val);
        return builder;
      },
      is(col, val) { preds.push((r) => r[col] === val); return builder; },
      not(col, op, val) {
        if (op !== 'is') throw new Error(`fake supports only not/is, got ${op}`);
        preds.push((r) => r[col] !== val);
        return builder;
      },
      then(resolve, reject) {
        const matched = preds.every((p) => p(row));
        if (!matched) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        if (patch) Object.assign(row, patch);
        return Promise.resolve({ data: [{ id: row.id }], error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return { from: () => makeBuilder() };
}

describe('FR-4 TS-4 (second half): the dead-holder causal chain actually releases held QFs', () => {
  it('the e60956f5 specimen reads dead, then both an in_progress and a claimed-open QF it holds are released', async () => {
    const specimen = buildSpecimen();
    const liveness = isSessionAlive(specimen, { nowMs: NOW });
    expect(liveness).toEqual({ alive: false, reason: null });

    const inProgressQf = {
      id: 'QF-e60956f5-in-progress', status: 'in_progress', claiming_session_id: specimen.session_id,
      pr_url: null, commit_sha: null,
    };
    const openClaimedQf = {
      id: 'QF-e60956f5-open', status: 'open', claiming_session_id: specimen.session_id,
      pr_url: null, commit_sha: null,
    };

    const r1 = await clearAndReopenQf(fakeDb(inProgressQf), inProgressQf.id, { expectedHolder: specimen.session_id });
    const r2 = await clearAndReopenQf(fakeDb(openClaimedQf), openClaimedQf.id, { expectedHolder: specimen.session_id });

    expect(r1.changed).toBe(true);
    expect(r2.changed).toBe(true);
    expect(inProgressQf.status).toBe('open');
    expect(inProgressQf.claiming_session_id).toBeNull();
    expect(openClaimedQf.status).toBe('open');
    expect(openClaimedQf.claiming_session_id).toBeNull();
  });
});
