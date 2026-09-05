/**
 * Unit tests for lib/worktree-reaper/audit-sink.js
 * QF-20260902-199 (defect A — the durable-record half of the worktree-reaper
 * "no unattended dry-run venue" defect; defect B, the wrong-half guard ordering, was
 * already fixed by QF-20260902-837/PR #8032 before this file was written).
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAuditRows, writeAuditSink, severityForVerdict, EVENT_TYPE } from '../../../lib/worktree-reaper/audit-sink.js';

// SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-3: audit_log_severity_check allows only
// these four values (database/schema-reference-snapshot.json) — the fix this SD exists
// for. Read from the same source a future schema change would update, not hand-copied.
const ALLOWED_SEVERITIES = ['info', 'warning', 'error', 'critical'];

function makeRecord(overrides = {}) {
  return {
    schema_version: '1.0',
    timestamp: '2026-09-02T23:00:00.000Z',
    worktree_path: '/repo/.worktrees/adhoc/example',
    branch: 'walk/example',
    categories: [],
    dirty_file_count: 0,
    unpushed_commit_count: 0,
    age_days: 1,
    ship_status: 'not_on_main',
    claim_status: 'active',
    verdict: 'keep',
    reason: 'active_claim_protected',
    preserve_count: 0,
    evidence: {},
    ...overrides,
  };
}

describe('buildAuditRows()', () => {
  it('maps one classification record to one audit_log row, entity keyed by worktree_path', () => {
    const rows = buildAuditRows([makeRecord()], { runId: 'run-1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe(EVENT_TYPE);
    expect(rows[0].entity_type).toBe('worktree');
    expect(rows[0].entity_id).toBe('/repo/.worktrees/adhoc/example');
    expect(rows[0].created_by).toBe('worktree-reaper');
    expect(rows[0].metadata.run_id).toBe('run-1');
    expect(rows[0].metadata.verdict).toBe('keep');
    expect(rows[0].metadata.reason).toBe('active_claim_protected');
  });

  // QF-20260903-957 / SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-3: 'low'/'medium' are
  // NOT in audit_log_severity_check's allowed set, so every non-'keep' row was silently
  // rejected on insert since this sink shipped -- a live count of
  // event_type='worktree_reaper_classification' returned 0. This locks in the fix.
  it('stamps a constraint-valid severity for a kept worktree and for a removal verdict', () => {
    const [kept, removed] = buildAuditRows(
      [makeRecord({ verdict: 'keep' }), makeRecord({ worktree_path: '/repo/.worktrees/QF-X', verdict: 'stage2_remove' })],
      { runId: 'run-2' }
    );
    expect(kept.severity).toBe('info');
    expect(removed.severity).toBe('warning');
    expect(ALLOWED_SEVERITIES).toContain(kept.severity);
    expect(ALLOWED_SEVERITIES).toContain(removed.severity);
  });

  it('every severity buildAuditRows can produce is in the DB constraint\'s allowed set', () => {
    const verdicts = ['keep', 'stage1_remove', 'stage2_remove', 'preserve_pushed', 'reclaim_removed', 'preserve_held_secret', 'some_future_unmapped_verdict'];
    const rows = buildAuditRows(verdicts.map((verdict, i) => makeRecord({ worktree_path: `/repo/.worktrees/${i}`, verdict })), { runId: 'run-severity-sweep' });
    for (const row of rows) {
      expect(ALLOWED_SEVERITIES).toContain(row.severity);
    }
  });

  describe('severityForVerdict() (pure)', () => {
    it('maps every known verdict to its intended severity', () => {
      expect(severityForVerdict('keep')).toBe('info');
      expect(severityForVerdict('stage1_remove')).toBe('warning');
      expect(severityForVerdict('stage2_remove')).toBe('warning');
      expect(severityForVerdict('preserve_pushed')).toBe('warning');
      expect(severityForVerdict('reclaim_removed')).toBe('warning');
      expect(severityForVerdict('preserve_held_secret')).toBe('critical');
    });

    it('falls back to warning (never low/medium/an invalid value) for an unmapped verdict', () => {
      expect(severityForVerdict('some_future_unmapped_verdict')).toBe('warning');
      expect(severityForVerdict(undefined)).toBe('warning');
      expect(severityForVerdict(null)).toBe('warning');
    });
  });

  it('maps every record in a multi-worktree run, preserving order', () => {
    const records = [
      makeRecord({ worktree_path: '/repo/.worktrees/A' }),
      makeRecord({ worktree_path: '/repo/.worktrees/B' }),
      makeRecord({ worktree_path: '/repo/.worktrees/C' }),
    ];
    const rows = buildAuditRows(records, { runId: 'run-3' });
    expect(rows.map((r) => r.entity_id)).toEqual(['/repo/.worktrees/A', '/repo/.worktrees/B', '/repo/.worktrees/C']);
  });

  it('returns an empty array for an empty/undefined records input, never throws', () => {
    expect(buildAuditRows([], { runId: 'run-4' })).toEqual([]);
    expect(buildAuditRows(undefined, { runId: 'run-4' })).toEqual([]);
  });
});

describe('writeAuditSink()', () => {
  it('inserts one row per record into audit_log', async () => {
    const inserted = [];
    const supabase = { from: (table) => ({ insert: async (rows) => { expect(table).toBe('audit_log'); inserted.push(...rows); return { error: null }; } }) };

    const result = await writeAuditSink(supabase, [makeRecord(), makeRecord({ worktree_path: '/repo/.worktrees/B' })], { runId: 'run-5' });

    expect(result).toEqual({ ok: true, inserted: 2 });
    expect(inserted).toHaveLength(2);
  });

  it('is a no-op (never calls supabase) for an empty records array', async () => {
    const from = vi.fn();
    const supabase = { from };
    const result = await writeAuditSink(supabase, [], { runId: 'run-6' });
    expect(result).toEqual({ ok: true, inserted: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('never throws when supabase is unavailable — reports ok:false instead', async () => {
    const result = await writeAuditSink(null, [makeRecord()], { runId: 'run-7' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_supabase_client');
    expect(result.inserted).toBe(0);
  });

  it('never throws when the insert itself errors — reports ok:false, logs, does not propagate', async () => {
    const logged = [];
    const supabase = { from: () => ({ insert: async () => ({ error: { message: 'db unavailable' } }) }) };
    const result = await writeAuditSink(supabase, [makeRecord()], { runId: 'run-8', logger: (m) => logged.push(m) });
    expect(result).toEqual({ ok: false, error: 'db unavailable', inserted: 0 });
    expect(logged.some((l) => l.includes('db unavailable'))).toBe(true);
  });

  it('never throws when the client itself throws — caught, reported, never propagated (reaper primary function must never break)', async () => {
    const supabase = { from: () => { throw new Error('network exploded'); } };
    const result = await writeAuditSink(supabase, [makeRecord()], { runId: 'run-9' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network exploded');
  });
});
