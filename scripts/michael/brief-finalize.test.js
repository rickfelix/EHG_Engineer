// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-5, TS-6 — the seat's enrichment overlay.
import { describe, it, expect } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import { runBriefFinalize } from './brief-finalize.mjs';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const ASSEMBLED_ROW = { id: 'row-1', et_date: '2026-09-06', assembled_at: '2026-09-06T09:45:00Z', data_json: { schema: 2 } };
const UNASSEMBLED_ROW = { id: 'row-2', et_date: '2026-09-06', assembled_at: null, data_json: null };

function db({ briefRow = ASSEMBLED_ROW, calendarRows = [], triageRows = [{ thread_id: 't1', class: 'archive', action_taken_at: '2026-09-06T05:00:00Z' }], snapshotRows = [], feederRuns = [], absent = false, updateAnswer = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'update') return updateAnswer ? updateAnswer(ops) : { data: [{ id: 'row-1' }], error: null };
    if (ops[0].op !== 'select') return { data: null, error: null };
    if (table === 'michael_brief_runs') return { data: briefRow ? [briefRow] : [], error: null };
    if (table === 'michael_calendar_day') return { data: calendarRows, error: null };
    if (table === 'michael_gmail_triage_items') return { data: triageRows, error: null };
    if (table === 'michael_todoist_snapshot') return { data: snapshotRows, error: null };
    if (table === 'michael_feeder_runs') return { data: feederRuns, error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('runBriefFinalize', () => {
  it('happy path: updates lede/Today via a fresh rebuild, sets enriched_at, re-renders and re-verifies', async () => {
    const { sb, calls } = db();
    const r = await runBriefFinalize({ sb, argv: ['--apply'], now: NOW });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.enriched).toBe(true);
    const updateCall = calls.find((c) => c.table === 'michael_brief_runs' && c.kind === 'update');
    expect(updateCall.ops[0].args[0].enriched_at).toBe(NOW.toISOString());
    expect(updateCall.ops[0].args[0].verified).toBe(true);
    expect(typeof updateCall.ops[0].args[0].rendered_html).toBe('string');
    expect(updateCall.ops[0].args[0].data_json.enrichment.signals).toContain('overnight enrichment applied by the seat');
  });

  it('refuses (no write) when no row exists for the ET date', async () => {
    const { sb, calls } = db({ briefRow: null });
    const r = await runBriefFinalize({ sb, argv: ['--apply'], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('NO_ROW');
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('refuses (no write) when the row was not assembled (assembled_at unset)', async () => {
    const { sb, calls } = db({ briefRow: UNASSEMBLED_ROW });
    const r = await runBriefFinalize({ sb, argv: ['--apply'], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('NOT_ASSEMBLED');
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });

  it('is inert on a missing relation, never throws', async () => {
    const { sb } = db({ absent: true });
    const r = await runBriefFinalize({ sb, argv: ['--apply'], now: NOW });
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('TABLES_ABSENT');
  });

  it('dry-run (no --apply) previews without writing', async () => {
    const { sb, calls } = db();
    const r = await runBriefFinalize({ sb, argv: [], now: NOW });
    expect(r.action).toBe('dry_run');
    expect(r.preview.data_json.schema).toBe(2);
    expect(calls.some((c) => c.kind === 'update')).toBe(false);
  });
});
