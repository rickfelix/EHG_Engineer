// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-2, TS-2, TS-3 — the GHA assembler feeder.
import { describe, it, expect } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runBriefAssemble } from './brief-assemble.mjs';

// 05:20 ET (EDT = UTC-4) -> 09:20Z, inside the 05:15-06:00 window but before the 05:45 deadline.
const BEFORE_DEADLINE = new Date('2026-09-06T09:20:00.000Z');
// 05:50 ET -> 09:50Z, inside the window and past the deadline.
const AFTER_DEADLINE = new Date('2026-09-06T09:50:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

const OK_RUNS = [
  { feeder: 'tasks-classifier', attempt: 1, status: 'ok', id: 'r1', counts: {} },
  { feeder: 'calendar-read', attempt: 1, status: 'ok', id: 'r2', counts: {} },
  { feeder: 'gmail-triage', attempt: 1, status: 'ok', id: 'r3', counts: {} },
  { feeder: 'todoist-brief', attempt: 1, status: 'ok', id: 'r4', counts: { ehg_pointer: 1 } },
];
const DEGRADED_RUNS = OK_RUNS.map((r) => (r.feeder === 'gmail-triage' ? { ...r, status: 'failed' } : r));

function db({ runs = OK_RUNS, absent = false, upsertAnswer = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'upsert') return upsertAnswer ? upsertAnswer(ops) : { data: [{ id: 'brief-row-1' }], error: null };
    if (ops[0].op !== 'select') return { data: null, error: null };
    // runFeeder's own single-flight read filters by feeder ('brief-assemble' itself) — no prior
    // attempts exist for it in these fixtures. Our OWN readiness read (below) filters by et_date
    // only, and must see the OTHER feeders' statuses — the two selects share a table and must be
    // told apart by their filters, not by call order.
    if (table === 'michael_feeder_runs' && ops.some((o) => o.op === 'eq' && o.args[0] === 'feeder')) return { data: [], error: null };
    if (table === 'michael_feeder_runs') return { data: runs, error: null };
    if (table === 'michael_calendar_day') return { data: [{ et_date: '2026-09-06', event_id: 'e1', coded_marker: true }], error: null };
    if (table === 'michael_gmail_triage_items') return { data: [], error: null };
    if (table === 'michael_todoist_snapshot') return { data: [], error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('runBriefAssemble', () => {
  it('before the deadline with a required feeder missing: inert wait, no row written', async () => {
    const { sb, calls } = db({ runs: DEGRADED_RUNS });
    const r = await runBriefAssemble({ sb, argv: ['--apply'], now: BEFORE_DEADLINE });
    expect(r.status).toBe('ok');
    expect(r.counts.decision).toBe('wait');
    expect(calls.some((c) => c.table === 'michael_brief_runs')).toBe(false);
  });

  it('at/after the deadline with a required feeder missing: assembles degraded, headsUp names the missing feeder', async () => {
    const { sb, calls } = db({ runs: DEGRADED_RUNS });
    const r = await runBriefAssemble({ sb, argv: ['--apply'], now: AFTER_DEADLINE });
    expect(r.status).toBe('degraded');
    expect(r.counts.decision).toBe('assemble_degraded');
    expect(r.counts.missing).toEqual(['gmail-triage']);
    const upsertCall = calls.find((c) => c.table === 'michael_brief_runs' && c.kind === 'upsert');
    expect(upsertCall).toBeTruthy();
    expect(upsertCall.ops[0].args[1]).toEqual({ onConflict: 'et_date' });
    expect(upsertCall.ops[0].args[0].data_json.headsUp.some((h) => h.includes('gmail-triage'))).toBe(true);
    expect(upsertCall.ops[0].args[0].assembled_at).toBe(AFTER_DEADLINE.toISOString());
    expect(upsertCall.ops[0].args[0].rendered_at).toBe(AFTER_DEADLINE.toISOString());
    expect(upsertCall.ops[0].args[0].verified).toBe(true);
    expect(typeof upsertCall.ops[0].args[0].rendered_html).toBe('string');
    expect(upsertCall.ops[0].args[0].rendered_html).toContain('<!DOCTYPE html>');
  });

  it('with all four required feeders ok: assembles clean (not degraded)', async () => {
    const { sb, calls } = db({ runs: OK_RUNS });
    const r = await runBriefAssemble({ sb, argv: ['--apply'], now: BEFORE_DEADLINE });
    expect(r.status).toBe('ok');
    expect(r.counts.decision).toBe('assemble');
    expect(r.counts.degraded).toBe(false);
    const upsertCall = calls.find((c) => c.table === 'michael_brief_runs' && c.kind === 'upsert');
    expect(upsertCall.ops[0].args[0].data_json.schema).toBe(2);
  });

  it('upserts by et_date (idempotent per date) — same onConflict key every time', async () => {
    const { sb, calls } = db({ runs: OK_RUNS });
    await runBriefAssemble({ sb, argv: ['--apply'], now: BEFORE_DEADLINE });
    const upsertCall = calls.find((c) => c.table === 'michael_brief_runs' && c.kind === 'upsert');
    expect(upsertCall.ops[0].args[0].et_date).toBe('2026-09-06');
  });

  it('missing relation (migration unapplied): inert tables_absent before any write, no throw', async () => {
    const { sb } = db({ absent: true });
    const r = await runBriefAssemble({ sb, argv: ['--apply'], now: BEFORE_DEADLINE });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('inert');
    expect(r.reason).toBe('tables_absent');
  });

  it('dry-run (no --apply) previews the built data_json and writes no row', async () => {
    const { sb, calls } = db({ runs: OK_RUNS });
    const r = await runBriefAssemble({ sb, argv: [], now: BEFORE_DEADLINE });
    expect(r.action).toBe('dry_run');
    expect(r.preview.data_json.schema).toBe(2);
    expect(calls.some((c) => c.table === 'michael_brief_runs')).toBe(false);
  });

  it('outside the 05:15-06:00 ET window: inert outside_et_window before any read', async () => {
    const { sb, calls } = db({ runs: OK_RUNS });
    const midnight = new Date('2026-09-06T04:00:00.000Z'); // 00:00 ET
    const r = await runBriefAssemble({ sb, argv: ['--apply'], now: midnight });
    expect(r.reason).toBe('outside_et_window');
    expect(calls.length).toBe(0);
  });
});
