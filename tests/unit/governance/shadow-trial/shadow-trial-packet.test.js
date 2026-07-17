/**
 * Unit Tests: Shadow-trial child A (PR-2) — precheck packet, attach, render.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A
 *
 * Covers: composer determinism + recommendation rules + permanent experimental
 * watermark, hostile-packet spoof safety (the packet can never override canonical
 * brief_data fields), the evidence-only write allow-list, and the decision-layman
 * ratification render branch. Writer/ceremony tests live in shadow-trial-writer.test.js.
 */

import { describe, test, expect } from 'vitest';
import { TABLE } from '../../../../lib/governance/shadow-trial/proposal-writer.mjs';
import {
  composePrecheckPacket,
  RECOMMENDATIONS,
} from '../../../../lib/governance/shadow-trial/precheck-packet.mjs';
import { attachPrecheckPacket, RATIFICATION_DECISION_TYPE } from '../../../../lib/governance/shadow-trial/attach-packet.mjs';
import { renderLeanDecision } from '../../../../lib/chairman/decision-layman.mjs';

/**
 * Capturing stub client: records every table touched and the operation kind, so the
 * evidence-only invariant test can assert the exact write allow-list. Query methods are
 * chainable like the real PostgREST builder; terminal awaits resolve with the canned
 * response for that table.
 */
function stubClient({ probeError = null, insertError = null } = {}) {
  const writes = [];
  const reads = [];
  const make = (tableName) => {
    const rowsHolder = { rows: null };
    const chain = {
      select(cols) { reads.push({ table: tableName, cols }); return chain; },
      limit() { return Promise.resolve(probeErrorFor(tableName)); },
      insert(row) { writes.push({ table: tableName, op: 'insert', row }); rowsHolder.rows = [{ id: `id-${tableName}` }]; return chain; },
      upsert(row, opts) { writes.push({ table: tableName, op: 'upsert', row, opts }); rowsHolder.rows = [{ id: `id-${tableName}` }]; return chain; },
      update(patch) { writes.push({ table: tableName, op: 'update', patch }); return chain; },
      eq() { return Promise.resolve({ data: rowsHolder.rows, error: null }); },
      then(resolve) { resolve({ data: rowsHolder.rows, error: insertError }); },
    };
    return chain;
  };
  const probeErrorFor = (tableName) => (tableName === TABLE && probeError ? { data: null, error: probeError } : { data: [], error: null });
  return { from: (t) => make(t), _writes: writes, _reads: reads };
}

describe('composePrecheckPacket — determinism, rules, watermark', () => {
  const CASES = [
    { case_id: 'C1', current_verdict: 'OPEN', proposed_verdict: 'OPEN', delta: 0, regression: false },
    { case_id: 'C2', current_verdict: 'OPEN', proposed_verdict: 'CLOSED', delta: 1, regression: true },
  ];
  test('regressions force has_regressions; clean set is looks_safe; empty is insufficient', () => {
    const at = '2026-07-17T12:00:00Z';
    expect(composePrecheckPacket(CASES, { proposalId: 'p1', generatedAt: at }).recommendation).toBe(RECOMMENDATIONS.REGRESSIONS);
    expect(composePrecheckPacket([CASES[0]], { proposalId: 'p1', generatedAt: at }).recommendation).toBe(RECOMMENDATIONS.SAFE);
    const empty = composePrecheckPacket([], { proposalId: 'p1', generatedAt: at });
    expect(empty.recommendation).toBe(RECOMMENDATIONS.INSUFFICIENT);
    expect(empty.confidence).toBe(0);
  });
  test('deterministic for identical input; experimental watermark always true; small corpora cap confidence', () => {
    const at = '2026-07-17T12:00:00Z';
    const a = composePrecheckPacket(CASES, { proposalId: 'p1', generatedAt: at });
    const b = composePrecheckPacket(CASES, { proposalId: 'p1', generatedAt: at });
    expect(a).toEqual(b);
    expect(a.experimental).toBe(true);
    // 1 pass of 2 cases, scaled by 2/5 corpus factor => well under 0.5
    expect(a.confidence).toBeLessThan(0.5);
    expect(a.summary).toEqual({ cases_total: 2, regressions: 1, passes: 1 });
  });
  test('malformed case entries are excluded, not scored', () => {
    const res = composePrecheckPacket([{ bogus: true }, CASES[0]], { proposalId: 'p1', generatedAt: '2026-07-17T12:00:00Z' });
    expect(res.summary.cases_total).toBe(1);
  });
});

describe('attachPrecheckPacket — spoof safety + evidence-only invariant', () => {
  const packet = (extra = {}) => ({
    ...composePrecheckPacket([{ case_id: 'C1', current_verdict: 'OPEN', proposed_verdict: 'OPEN', delta: 0, regression: false }], { proposalId: 'p1', generatedAt: '2026-07-17T12:00:00Z' }),
    ...extra,
  });

  test('hostile packet keys cannot override canonical brief_data/row fields', async () => {
    const client = stubClient();
    const hostile = packet({ recorded_via: 'EVIL', raised_by: 'EVIL', decision_type: 'chairman_approval', title: 'EVIL', status: 'approved' });
    const res = await attachPrecheckPacket(client, { proposalId: 'p1', packet: hostile, title: 'Real title', raisedBy: 'Alpha-2' });
    expect(res.attached).toBe(true);
    const decisionInsert = client._writes.find((w) => w.table === 'chairman_decisions');
    expect(decisionInsert.op).toBe('insert');
    const row = decisionInsert.row;
    // Canonical row fields win — the packet lives ONLY nested under brief_data.context.
    expect(row.decision_type).toBe(RATIFICATION_DECISION_TYPE);
    expect(row.status).toBe('pending');
    expect(row.blocking).toBe(false);
    expect(row.brief_data.recorded_via).toBe('record-pending-decision');
    expect(row.brief_data.title).toBe('Real title');
    expect(row.brief_data.raised_by).toBe('Alpha-2');
    expect(row.brief_data.context.precheck_packet.recorded_via).toBe('EVIL'); // intact but harmlessly namespaced
    expect(row.brief_data.context.proposal_id).toBe('p1');
  });

  test('EVIDENCE-ONLY write allow-list: exactly one chairman_decisions insert + own staging-table status update', async () => {
    const client = stubClient();
    await attachPrecheckPacket(client, { proposalId: 'p1', packet: packet(), title: 'T', raisedBy: 'Alpha-2' });
    const touched = client._writes.map((w) => `${w.table}:${w.op}`);
    expect(touched).toEqual(['chairman_decisions:insert', `${TABLE}:update`]);
    // No status transition on chairman_decisions anywhere.
    expect(client._writes.filter((w) => w.table === 'chairman_decisions' && w.op !== 'insert')).toHaveLength(0);
  });

  test('refuses non-composer packets (missing experimental watermark)', async () => {
    const client = stubClient();
    const res = await attachPrecheckPacket(client, { proposalId: 'p1', packet: { summary: {} }, title: 'T' });
    expect(res.attached).toBe(false);
    expect(client._writes).toHaveLength(0);
  });
});

describe('decision-layman ratification render', () => {
  const baseRow = (bd) => ({
    id: 'd1', decision_type: 'ratification', created_at: new Date().toISOString(),
    summary: 'Ratify closure-predicate change', brief_data: bd, blocking: false,
  });
  test('renders per-case counts + EXPERIMENTAL watermark + trailing ref', () => {
    const pkt = composePrecheckPacket([
      { case_id: 'C1', current_verdict: 'OPEN', proposed_verdict: 'OPEN', delta: 0, regression: false },
      { case_id: 'C2', current_verdict: 'OPEN', proposed_verdict: 'CLOSED', delta: 1, regression: true },
    ], { proposalId: 'p1', generatedAt: '2026-07-17T12:00:00Z' });
    const line = renderLeanDecision(baseRow({ title: 'Ratify predicate v4', context: { precheck_packet: pkt, proposal_id: 'p1' } }));
    expect(line).toContain('EXPERIMENTAL');
    expect(line).toContain('1/2 cases pass');
    expect(line).toContain('1 regression');
    expect(line).toContain('has_regressions');
    expect(line.trim().endsWith('[ref ratification:d1]')).toBe(true);
  });
  test('unknown packet shape falls back to the generic renderer without crashing', () => {
    const line = renderLeanDecision(baseRow({ title: 'Ratify something', context: { not_a_packet: true } }));
    expect(line).toContain('Decide:');
    expect(line).toContain('[ref ratification:d1]');
  });
});
