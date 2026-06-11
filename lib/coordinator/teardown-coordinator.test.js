// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 — unit tests for the unified teardown helper.
// NFR-1: no live pointer/cron/DB is touched — tmp pointer files + null/throwing supabase only.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  FLAG,
  COORDINATOR_CRONS,
  isEnabled,
  listCoordinatorCrons,
  selectCoordinatorCronJobs,
  clearCoordinatorPointer
} = require('./teardown-coordinator.cjs');

const FLAG_NAME = 'COORD_TEARDOWN_SAFETY_V2';
let tmpPointer;

function writePointer(sessionId) {
  fs.writeFileSync(tmpPointer, JSON.stringify({ session_id: sessionId, started_at: 'x', host: 'h' }), 'utf8');
}

beforeEach(() => {
  delete process.env[FLAG_NAME];
  tmpPointer = path.join(os.tmpdir(), 'teardown-test-' + process.pid + '-' + Math.floor(performance.now() * 1000) + '.json');
});
afterEach(() => {
  delete process.env[FLAG_NAME];
  try { if (fs.existsSync(tmpPointer)) fs.unlinkSync(tmpPointer); } catch { /* ignore */ }
});

describe('teardown-coordinator: inventory + matcher', () => {
  it('listCoordinatorCrons enumerates all 8 coordinator crons incl the pointer-re-asserting inbox loop', () => {
    const crons = listCoordinatorCrons();
    expect(crons.length).toBe(8); // +scripts-reachability (SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001, QF-20260611-405 pin bump)
    const inbox = crons.find((c) => c.key === 'inbox');
    expect(inbox).toBeTruthy();
    expect(inbox.re_asserts_pointer).toBe(true); // the crux: missing this cron self-reverses teardown
    expect(crons.map((c) => c.key)).toEqual(['sweep', 'dashboard', 'identity', 'inbox', 'email', 'row-growth', 'review-rotation', 'scripts-reachability']);
  });

  it('TS-6: selectCoordinatorCronJobs matches coordinator crons (incl inbox via fleet-dashboard.cjs marker) and excludes non-coordinator jobs', () => {
    const jobs = [
      { id: 'a', prompt: 'node scripts/stale-session-sweep.cjs' },
      { id: 'b', prompt: 'node scripts/fleet-dashboard.cjs all' },
      { id: 'c', prompt: 'node scripts/fleet-dashboard.cjs inbox' }, // critical: same basename as dashboard
      { id: 'd', prompt: 'node scripts/assign-fleet-identities.cjs' },
      { id: 'f', prompt: 'COORD_EMAIL_TICK=27801 node scripts/coordinator-email-summary.mjs' }, // email loop (coordinator-confirmed)
      { id: 'e', prompt: 'node scripts/some-worker-loop.cjs' } // NOT a coordinator cron
    ];
    const matched = selectCoordinatorCronJobs(jobs);
    expect(matched.map((j) => j.id).sort()).toEqual(['a', 'b', 'c', 'd', 'f']);
    expect(matched.find((j) => j.prompt.includes('inbox'))).toBeTruthy();
    expect(matched.find((j) => j.prompt.includes('coordinator-email-summary'))).toBeTruthy();
    expect(selectCoordinatorCronJobs(null)).toEqual([]);
  });
});

describe('teardown-coordinator: clearCoordinatorPointer', () => {
  it('TS-4: flag-OFF is a no-op passthrough (byte-identical legacy behavior, pointer untouched)', async () => {
    writePointer('me');
    const res = await clearCoordinatorPointer(null, { sessionId: 'me', pointerFile: tmpPointer });
    expect(res.enabled).toBe(false);
    expect(res.action).toBe('noop');
    expect(res.pointer_cleared).toBe(false);
    expect(fs.existsSync(tmpPointer)).toBe(true); // not cleared when flag off
  });

  it('TS-1: flag-ON owner teardown clears the pointer and returns the cron inventory', async () => {
    process.env[FLAG_NAME] = 'true';
    writePointer('me');
    const res = await clearCoordinatorPointer(null, { sessionId: 'me', pointerFile: tmpPointer });
    expect(res.enabled).toBe(true);
    expect(res.refused).toBe(false);
    expect(res.pointer_cleared).toBe(true);
    expect(res.crons_to_delete.length).toBe(8); // +scripts-reachability (SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001, QF-20260611-405 pin bump)
    expect(fs.existsSync(tmpPointer)).toBe(false); // pointer file removed
  });

  it('TS-2: session-scope guard refuses a non-owner (pointer left intact) — protects the LIVE coordinator', async () => {
    process.env[FLAG_NAME] = 'on';
    writePointer('SOMEONE-ELSE');
    const res = await clearCoordinatorPointer(null, { sessionId: 'me', pointerFile: tmpPointer });
    expect(res.refused).toBe(true);
    expect(res.pointer_cleared).toBe(false);
    expect(res.owner).toBe('SOMEONE-ELSE');
    expect(fs.existsSync(tmpPointer)).toBe(true); // untouched
  });

  it('TS-3: force=true overrides the session-scope guard', async () => {
    process.env[FLAG_NAME] = 'on';
    writePointer('SOMEONE-ELSE');
    const res = await clearCoordinatorPointer(null, { sessionId: 'me', force: true, pointerFile: tmpPointer });
    expect(res.refused).toBe(false);
    expect(res.forced).toBe(true);
    expect(res.pointer_cleared).toBe(true);
    expect(fs.existsSync(tmpPointer)).toBe(false);
  });

  it('TS-2b: fail-safe refuses when pointer cannot be read and force is not set', async () => {
    process.env[FLAG_NAME] = 'on';
    const throwingReader = () => { throw new Error('boom'); };
    const res = await clearCoordinatorPointer(null, { sessionId: 'me', pointerFile: tmpPointer, readPointer: throwingReader });
    expect(res.refused).toBe(true);
    expect(res.pointer_cleared).toBe(false);
    expect(res.errors.some((e) => e.includes('pointer-read'))).toBe(true);
  });

  it('TS-5: fail-open — a throwing supabase does NOT throw; returns a structured error result', async () => {
    process.env[FLAG_NAME] = 'on';
    writePointer('me');
    const throwingSupabase = { from() { throw new Error('db-down'); } };
    let threw = false;
    let res;
    try {
      res = await clearCoordinatorPointer(throwingSupabase, { sessionId: 'me', pointerFile: tmpPointer });
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(false); // never throws (fail-open)
    expect(res).toBeTruthy();
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
