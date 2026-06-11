/**
 * tests/unit/chairman-decision-queue.test.js
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-001 — unit tier, fully mocked.
 *
 * No supabase import anywhere in this file or in lib/chairman/decision-queue.mjs
 * (the lib is dependency-free by design; writers are injected), so the db-guards
 * auditor has nothing to flag.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, routeDecision, effectivePriority, sortPending, priorityRank,
} from '../../lib/chairman/decision-queue.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = join(REPO_ROOT, 'database', 'migrations', '20260611_chairman_decision_queue.sql');

const mockWriters = () => ({
  chairmanDecide: vi.fn(async () => ({ ok: true })),
  resolveFeedback: vi.fn(async () => ({ ok: true })),
  recordFlagCall: vi.fn(async () => ({ ok: true })),
  okrAccept: vi.fn(async () => ({ ok: true })),
  okrReject: vi.fn(async () => ({ ok: true })),
  recordDeferral: vi.fn(async () => ({ ok: true })),
});
const writeCount = (w) => Object.values(w).reduce((n, fn) => n + fn.mock.calls.length, 0);

describe('TS-3 never-auto-decide', () => {
  it('decide without an explicit decision argument is a parse error (CLI exits 1 on it)', () => {
    const p = parseArgs(['decide', 'flag_review:abc-123']);
    expect(p.error).toMatch(/explicit decision/i);
    expect(p.command).toBeUndefined();
  });

  it('decide with only --rationale (still no decision) is a parse error', () => {
    const p = parseArgs(['decide', 'flag_review:abc-123', '--rationale', 'because']);
    expect(p.error).toMatch(/explicit decision/i);
  });

  it('routeDecision with no decision performs zero writes', async () => {
    const w = mockWriters();
    const out = await routeDecision({ decisionType: 'flag_review', id: 'x', decision: undefined }, w);
    expect(out.error).toBeTruthy();
    expect(writeCount(w)).toBe(0);
  });

  it('read-only sources (escalation/gate_decision) route to zero writes', async () => {
    const w = mockWriters();
    for (const t of ['escalation', 'gate_decision']) {
      const out = await routeDecision({ decisionType: t, id: 'x', decision: 'approve' }, w);
      expect(out.error).toMatch(/read-only/i);
    }
    expect(writeCount(w)).toBe(0);
  });

  it('parseArgs round-trips a valid decide with rationale', () => {
    const p = parseArgs(['decide', 'okr_acceptance:gen-1', 'approve', '--rationale', 'looks right']);
    expect(p).toMatchObject({ command: 'decide', decisionType: 'okr_acceptance', id: 'gen-1', decision: 'approve', rationale: 'looks right' });
  });
});

describe('TS-4 age escalation (visibility only)', () => {
  const now = new Date('2026-06-11T12:00:00Z');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();

  it('bumps a >72h pending row exactly one class higher', () => {
    expect(effectivePriority({ priority: 'normal', created_at: hoursAgo(73) }, now))
      .toEqual({ rank: 2, label: 'high', escalated: true });
    expect(effectivePriority({ priority: 'high', created_at: hoursAgo(100) }, now))
      .toEqual({ rank: 1, label: 'critical', escalated: true });
  });

  it('does not bump at or under 72h', () => {
    expect(effectivePriority({ priority: 'normal', created_at: hoursAgo(72) }, now).escalated).toBe(false);
    expect(effectivePriority({ priority: 'normal', created_at: hoursAgo(1) }, now))
      .toEqual({ rank: 3, label: 'normal', escalated: false });
  });

  it('critical cannot escalate past critical', () => {
    expect(effectivePriority({ priority: 'critical', created_at: hoursAgo(500) }, now))
      .toEqual({ rank: 1, label: 'critical', escalated: false });
  });

  it('sortPending orders blocking DESC, effective class, then created_at ASC', () => {
    const rows = [
      { id: 'old-normal', priority: 'normal', created_at: hoursAgo(80) },   // escalates to high
      { id: 'fresh-high', priority: 'high', created_at: hoursAgo(1) },
      { id: 'blocking-low', priority: 'low', created_at: hoursAgo(2), blocking: true },
      { id: 'fresh-normal', priority: 'normal', created_at: hoursAgo(3) },
    ];
    const sorted = sortPending(rows, now).map((r) => r.id);
    expect(sorted[0]).toBe('blocking-low'); // blocking always first
    expect(sorted.indexOf('old-normal')).toBeLessThan(sorted.indexOf('fresh-high')); // same class, older first
    expect(sorted.indexOf('fresh-high')).toBeLessThan(sorted.indexOf('fresh-normal'));
  });

  it('unknown priority ranks last', () => {
    expect(priorityRank('bogus')).toBe(5);
  });
});

describe('schema contract — migration view branches pin the normalized columns', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  // Isolate the unified-view body, then split into UNION ALL branches.
  const viewBody = sql.split(/CREATE OR REPLACE VIEW chairman_unified_decisions[^]*?AS/)[1]
    .split(/CREATE OR REPLACE VIEW chairman_pending_decisions/)[0];
  const branches = viewBody.split(/UNION ALL/);
  const PINNED = ['decision_type', 'title', 'priority', 'status', 'recommendation', 'created_at', 'details'];

  it('has exactly 7 branches (4 legacy + feedback + flags + okr)', () => {
    expect(branches.length).toBe(7);
  });

  it.each(PINNED)('every branch selects %s', (col) => {
    for (const b of branches) {
      expect(b, 'branch missing ' + col + ':\n' + b.slice(0, 200)).toMatch(new RegExp('\\b' + col + '\\b'));
    }
  });

  it('every branch carries the trailing blocking column', () => {
    for (const b of branches) expect(b).toMatch(/AS blocking/);
  });

  it('new branches target the probed source tables with the agreed pending predicates', () => {
    expect(sql).toMatch(/FROM feedback f/);
    expect(sql).toMatch(/resolved_at IS NULL/);
    expect(sql).toMatch(/FROM leo_feature_flags ff/);
    expect(sql).toMatch(/interval '7 days'/);
    expect(sql).toMatch(/FROM okr_generation_log ogl/);
    expect(sql).toMatch(/pending_chairman_acceptance/);
  });

  it('pending view implements 72h age escalation and the blocking-first ordering', () => {
    const pending = sql.split(/CREATE OR REPLACE VIEW chairman_pending_decisions/)[1];
    expect(pending).toMatch(/interval '72 hours'/);
    expect(pending).toMatch(/ORDER BY blocking DESC, effective_rank, created_at ASC/);
  });

  it('preserves the security_invoker posture on both views', () => {
    expect(sql.match(/VIEW chairman_\w+ WITH \(security_invoker = on\)/g)?.length).toBe(2);
  });
});

describe('routing — each decision_type maps to exactly one writer', () => {
  const cases = [
    [{ decisionType: 'chairman_approval', id: 'a', decision: 'approve', rationale: 'r' }, 'chairmanDecide'],
    [{ decisionType: 'chairman_approval', id: 'a', decision: 'reject' }, 'chairmanDecide'],
    [{ decisionType: 'flag_review', id: 'b', decision: 'approve' }, 'resolveFeedback'],
    [{ decisionType: 'flag_review', id: 'b', decision: 'reject' }, 'resolveFeedback'],
    [{ decisionType: 'flag_enablement', id: 'c', decision: 'enable' }, 'recordFlagCall'],
    [{ decisionType: 'okr_acceptance', id: 'd', decision: 'approve' }, 'okrAccept'],
    [{ decisionType: 'okr_acceptance', id: 'd', decision: 'reject' }, 'okrReject'],
    [{ decisionType: 'flag_review', id: 'b', decision: 'defer' }, 'recordDeferral'],
    [{ decisionType: 'chairman_approval', id: 'a', decision: 'defer' }, 'recordDeferral'],
  ];

  it.each(cases)('%o -> %s (single write)', async (d, writer) => {
    const w = mockWriters();
    const out = await routeDecision(d, w);
    expect(out.error).toBeUndefined();
    expect(out.writer).toBe(writer);
    expect(w[writer]).toHaveBeenCalledTimes(1);
    expect(writeCount(w)).toBe(1);
  });

  it('chairman_approval RPC actions are approved/rejected', async () => {
    const w = mockWriters();
    await routeDecision({ decisionType: 'chairman_approval', id: 'a', decision: 'approve' }, w);
    expect(w.chairmanDecide).toHaveBeenCalledWith('a', 'approved', undefined);
  });

  it('flag_review reject maps to wont_fix; approve maps to resolved', async () => {
    const w = mockWriters();
    await routeDecision({ decisionType: 'flag_review', id: 'b', decision: 'reject', rationale: 'noise' }, w);
    expect(w.resolveFeedback).toHaveBeenCalledWith('b', 'wont_fix', expect.stringContaining('noise'));
    await routeDecision({ decisionType: 'flag_review', id: 'b', decision: 'approve' }, w);
    expect(w.resolveFeedback).toHaveBeenLastCalledWith('b', 'resolved', expect.any(String));
  });

  it('unknown decision_type routes to zero writes', async () => {
    const w = mockWriters();
    const out = await routeDecision({ decisionType: 'mystery', id: 'z', decision: 'approve' }, w);
    expect(out.error).toMatch(/unknown decision_type/);
    expect(writeCount(w)).toBe(0);
  });
});
