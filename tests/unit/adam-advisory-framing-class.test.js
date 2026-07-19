/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B — payload.framing_class consumption in adam-advisory.cjs's
 * drainInbox. Wire-plumbing scope only: this SD does not implement fail-closed pick-vs-instrument
 * ROUTING (a sibling FW-3 child SD's job) — it makes the field visible/consumable instead of silently
 * dropped, and loudly flags pick-class rows so they are never mistaken for an already-handled case.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/adam-advisory.cjs');

function makeRecordingMock(selectRows = []) {
  const updates = [];
  function chain() {
    const state = { op: 'select', updatePayload: null };
    const c = {
      select: () => c,
      update: (payload) => { state.op = 'update'; state.updatePayload = payload; return c; },
      eq: () => c,
      in: () => c,
      is: () => c,
      gte: () => c,
      order: () => c,
      limit: () => c,
      then: (res, rej) => finish().then(res, rej),
    };
    async function finish() {
      if (state.op === 'update') { updates.push(state); return { data: [], error: null }; }
      return { data: selectRows, error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, updates };
}

describe('SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B: drainInbox surfaces payload.framing_class', () => {
  it('renders framing:pick/instrument in the surfaced line — never silently dropped', async () => {
    const rows = [
      { id: 'p1', payload: { kind: 'adam_advisory', oracle: true, framing_class: 'pick', body: 'thesis reversal' }, created_at: new Date().toISOString() },
      { id: 'i1', payload: { kind: 'adam_advisory', oracle: true, framing_class: 'instrument', body: 'routine finding' }, created_at: new Date().toISOString() },
    ];
    const { supabase } = makeRecordingMock(rows);
    const logs = []; const warns = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(a.join(' ')));
    await m.drainInbox(supabase, 'adam-sess', { quiet: false });
    log.mockRestore(); warn.mockRestore();
    expect(logs.join(' ')).toMatch(/framing:pick/);
    expect(logs.join(' ')).toMatch(/framing:instrument/);
  });

  it('flags a pick-class row with an explicit do-not-auto-source warning', async () => {
    const rows = [
      { id: 'p2', payload: { kind: 'adam_advisory', oracle: true, framing_class: 'pick', body: 'kill/scale decision' }, created_at: new Date().toISOString() },
    ];
    const { supabase } = makeRecordingMock(rows);
    const warns = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(a.join(' ')));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await m.drainInbox(supabase, 'adam-sess', { quiet: false });
    warn.mockRestore();
    expect(warns.join(' ')).toMatch(/PICK-CLASS FRAMING/);
    expect(warns.join(' ')).toMatch(/do not auto-source/i);
  });

  it('a row with no framing_class renders exactly as before (no tag, no warning)', async () => {
    const rows = [
      { id: 'n1', payload: { kind: 'adam_advisory', oracle: true, body: 'plain advisory' }, created_at: new Date().toISOString() },
    ];
    const { supabase } = makeRecordingMock(rows);
    const logs = []; const warns = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    const warn = vi.spyOn(console, 'warn').mockImplementation((...a) => warns.push(a.join(' ')));
    await m.drainInbox(supabase, 'adam-sess', { quiet: false });
    warn.mockRestore();
    expect(logs.join(' ')).not.toMatch(/framing:/);
    expect(warns.join(' ')).not.toMatch(/PICK-CLASS/);
  });
});
