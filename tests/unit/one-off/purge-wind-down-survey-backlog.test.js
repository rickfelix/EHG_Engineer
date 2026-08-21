// SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-2): unit coverage for
// scripts/one-off/purge-wind-down-survey-backlog.mjs's runOneBatch — the archive-before-delete
// ordering, the id-cursor idempotency guard, and category scoping, per TESTING evidence
// (sub_agent_execution_results 143b8c17-d017-4982-b0ab-02532ec87daa / 7a048e9c-7db3-43a7-a4b2-934d43103301
// TS-3/TS-4/TS-5).
//
// A lightweight in-memory client simulates just enough of the real SQL shapes (SELECT ... FOR
// UPDATE SKIP LOCKED, id-cursor SELECT against retention_archive, the archive INSERT, the
// category-scoped DELETE) to exercise runOneBatch's own ordering/guard logic without a live DB.

import { describe, it, expect } from 'vitest';
import { runOneBatch, BATCH_SIZE, ARCHIVED_BY } from '../../../scripts/one-off/purge-wind-down-survey-backlog.mjs';

function makeMockClient({ feedback, retentionArchive = [], failArchiveInsert = false }) {
  const state = {
    feedback: [...feedback], // [{id, category, created_at}]
    retentionArchive: [...retentionArchive], // [{source_table, source_id, run_id}]
    txn: false,
    committed: [],
    rolledBack: 0,
  };
  const client = {
    state,
    async query(sql, params = []) {
      const s = sql.trim();
      if (s === 'BEGIN') { state.txn = true; return { rows: [], rowCount: 0 }; }
      if (s === 'COMMIT') { state.txn = false; state.committed.push(true); return { rows: [], rowCount: 0 }; }
      if (s === 'ROLLBACK') { state.txn = false; state.rolledBack++; return { rows: [], rowCount: 0 }; }

      if (s.includes('SELECT id FROM public.feedback')) {
        const limit = params[0];
        const rows = state.feedback
          .filter((r) => r.category === 'wind_down_survey')
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, limit)
          .map((r) => ({ id: r.id }));
        return { rows, rowCount: rows.length };
      }

      if (s.includes('SELECT source_id FROM public.retention_archive')) {
        const ids = params[0];
        const rows = state.retentionArchive
          .filter((r) => r.source_table === 'feedback' && ids.includes(r.source_id))
          .map((r) => ({ source_id: r.source_id }));
        return { rows, rowCount: rows.length };
      }

      if (s.includes('INSERT INTO public.retention_archive')) {
        if (failArchiveInsert) throw new Error('simulated archive insert failure');
        const ids = params[0];
        const runId = params[2];
        for (const id of ids) {
          state.retentionArchive.push({ source_table: 'feedback', source_id: String(id), run_id: runId });
        }
        return { rows: [], rowCount: ids.length };
      }

      if (s.includes('DELETE FROM public.feedback')) {
        const ids = params[0].map(String);
        const before = state.feedback.length;
        state.feedback = state.feedback.filter((r) => !ids.includes(String(r.id)));
        const deleted = before - state.feedback.length;
        return { rows: [], rowCount: deleted };
      }

      throw new Error(`mock client: unhandled query: ${s.slice(0, 80)}`);
    },
  };
  return client;
}

describe('runOneBatch (SD-LEO-INFRA-WIND-DOWN-SURVEY-001 FR-2)', () => {
  it('archives before deleting: every deleted row has a corresponding retention_archive row', async () => {
    const client = makeMockClient({
      feedback: [
        { id: '1', category: 'wind_down_survey', created_at: '2026-08-01T00:00:00Z' },
        { id: '2', category: 'wind_down_survey', created_at: '2026-08-02T00:00:00Z' },
      ],
    });
    const result = await runOneBatch(client, 'run-1');
    expect(result).toEqual({ archived: 2, deleted: 2 });
    expect(client.state.feedback).toHaveLength(0);
    expect(client.state.retentionArchive).toHaveLength(2);
    expect(client.state.retentionArchive.map((r) => r.source_id).sort()).toEqual(['1', '2']);
    expect(client.state.retentionArchive.every((r) => r.run_id === 'run-1')).toBe(true);
  });

  it('returns null and commits when the backlog is drained (no matching rows)', async () => {
    const client = makeMockClient({ feedback: [] });
    const result = await runOneBatch(client, 'run-1');
    expect(result).toBeNull();
    expect(client.state.committed).toHaveLength(1);
    expect(client.state.rolledBack).toBe(0);
  });

  it('is idempotent: a row already in retention_archive is not re-archived, but its delete is retried', async () => {
    const client = makeMockClient({
      feedback: [{ id: '1', category: 'wind_down_survey', created_at: '2026-08-01T00:00:00Z' }],
      retentionArchive: [{ source_table: 'feedback', source_id: '1', run_id: 'prior-run' }],
    });
    const result = await runOneBatch(client, 'run-2');
    // archived=0 (already had a retention_archive row from a prior partial run), deleted=1
    // (the delete is still retried — the earlier partial run's delete must have failed).
    expect(result).toEqual({ archived: 0, deleted: 1 });
    expect(client.state.feedback).toHaveLength(0);
    // No duplicate retention_archive row was created for id '1'.
    expect(client.state.retentionArchive.filter((r) => r.source_id === '1')).toHaveLength(1);
  });

  it('never touches a different category — only wind_down_survey rows are selected', async () => {
    const client = makeMockClient({
      feedback: [
        { id: '1', category: 'wind_down_survey', created_at: '2026-08-01T00:00:00Z' },
        { id: '2', category: 'harness_backlog', created_at: '2026-08-01T00:00:01Z' },
        { id: '3', category: 'coordinator_review', created_at: '2026-08-01T00:00:02Z' },
      ],
    });
    const result = await runOneBatch(client, 'run-1');
    expect(result).toEqual({ archived: 1, deleted: 1 });
    const remainingIds = client.state.feedback.map((r) => r.id).sort();
    expect(remainingIds).toEqual(['2', '3']);
  });

  it('aborts the batch (rolls back, throws) if the archive insert fails — no delete is issued', async () => {
    const client = makeMockClient({
      feedback: [{ id: '1', category: 'wind_down_survey', created_at: '2026-08-01T00:00:00Z' }],
      failArchiveInsert: true,
    });
    await expect(runOneBatch(client, 'run-1')).rejects.toThrow('simulated archive insert failure');
    expect(client.state.rolledBack).toBe(1);
    // The row must still be present — the delete was never issued because the archive failed first.
    expect(client.state.feedback).toHaveLength(1);
    expect(client.state.retentionArchive).toHaveLength(0);
  });

  it('respects BATCH_SIZE as the per-run cap passed to the SELECT', async () => {
    const rows = Array.from({ length: BATCH_SIZE + 50 }, (_, i) => ({
      id: String(i),
      category: 'wind_down_survey',
      created_at: `2026-08-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
    }));
    const client = makeMockClient({ feedback: rows });
    const result = await runOneBatch(client, 'run-1');
    expect(result.deleted).toBeLessThanOrEqual(BATCH_SIZE);
    expect(client.state.feedback.length).toBeGreaterThan(0); // more than one batch remains
  });

  it('ARCHIVED_BY is a stable, non-empty identifier', () => {
    expect(typeof ARCHIVED_BY).toBe('string');
    expect(ARCHIVED_BY.length).toBeGreaterThan(0);
  });
});
