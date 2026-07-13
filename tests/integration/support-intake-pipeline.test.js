/**
 * Integration pins: end-to-end intake->resolve-venture->triage->route, surfaced escalation queue, KR-flip.
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 — FR-4/FR-5/FR-6.
 * Re-scoped per-venture by SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001.
 */
import { describe, it, expect } from 'vitest';
import {
  runSupportPipeline, getSupportEscalationQueue, markPipelineLive, PIPELINE_LIVE_KR_CODE,
} from '../../lib/support/intake-pipeline.js';

/** Fuller supabase mock: venture_support_tickets insert/select, ventures lookup, key_results read/update. */
function makeSb({ krValue = 0, ventures = [{ id: 'v-1', support_is_armed: false, support_rail_address: 'help@acme.example' }] } = {}) {
  const tickets = [];
  let kr = { id: 'kr-1', current_value: krValue };
  return {
    tickets,
    get kr() { return kr; },
    from(table) {
      const b = { _t: table, _op: null, _payload: null, _filters: {} };
      b.insert = (row) => { b._op = 'insert'; b._payload = row; return b; };
      b.update = (obj) => { b._op = 'update'; b._payload = obj; return b; };
      b.select = () => b;
      b.eq = (col, val) => { b._filters[col] = val; return b; };
      b.neq = () => b; b.order = () => b; b.limit = () => b;
      b.single = () => {
        if (b._t === 'venture_support_tickets' && b._op === 'insert') {
          const id = `vst-${tickets.length + 1}`; tickets.push({ ...b._payload, id }); return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.maybeSingle = () => {
        if (b._t === 'key_results') return Promise.resolve({ data: { ...kr }, error: null });
        if (b._t === 'ventures') {
          const match = ventures.find((v) =>
            (b._filters.id !== undefined && v.id === b._filters.id) ||
            (b._filters.support_rail_address !== undefined && v.support_rail_address === b._filters.support_rail_address));
          return Promise.resolve({ data: match || null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res) => {
        if (b._t === 'key_results' && b._op === 'update') { kr = { ...kr, current_value: b._payload.current_value }; return res({ error: null }); }
        if (b._t === 'venture_support_tickets' && !b._op) {
          return res({ data: tickets.filter((r) => r.status === 'escalated'), error: null });
        }
        return res({ data: [], error: null });
      };
      return b;
    },
  };
}

describe('runSupportPipeline end-to-end (FR-4, venture-scoped)', () => {
  it('happy-path ticket via a resolvable rail address -> auto_resolved, NOT in the escalation queue', async () => {
    const sb = makeSb();
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'How do I reset my password', body: 'account login reset guide', rail_address: 'help@acme.example' });
    expect(result.ticket.venture_id).toBe('v-1');
    expect(result.disposition.status).toBe('auto_resolved');
    const queue = await getSupportEscalationQueue(sb);
    expect(queue.length).toBe(0); // auto-resolved tickets are not escalations
  });

  it('edge-case ticket -> escalated AND surfaced in the escalation queue (never dropped)', async () => {
    const sb = makeSb();
    const result = await runSupportPipeline(sb, { channel: 'email', subject: 'URGENT: service down, charged twice', body: 'billing breach losing money', venture_id: 'v-1' });
    expect(result.disposition.status).toBe('escalated');
    const queue = await getSupportEscalationQueue(sb);
    expect(queue.length).toBe(1);
    expect(queue[0].venture_id).toBe('v-1');
  });

  it('unattributed ticket (no venture_id, no matching rail address) -> forced escalate, surfaced for human triage', async () => {
    const sb = makeSb();
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'How do I reset my password', body: 'account login reset guide' });
    expect(result.ticket.venture_id).toBeNull();
    expect(result.disposition.status).toBe('escalated');
    const queue = await getSupportEscalationQueue(sb);
    expect(queue.some((r) => r.venture_id === null)).toBe(true);
  });

  it('venture_support_tickets rows never bleed into a feedback-shaped queue (zero legacy category field)', async () => {
    const sb = makeSb();
    await runSupportPipeline(sb, { channel: 'email', subject: 'URGENT: service down, charged twice', body: 'billing breach losing money', venture_id: 'v-1' });
    expect(sb.tickets.every((r) => !('source_application' in r))).toBe(true);
  });
});

describe('markPipelineLive — KR-2026-07-01 flip (FR-5)', () => {
  it('flips current_value 0 -> 1 (status achieved) on a real end-to-end run', async () => {
    const sb = makeSb({ krValue: 0 });
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'how to', body: 'account guide', venture_id: 'v-1' });
    const flip = await markPipelineLive(sb, result);
    expect(flip.flipped).toBe(true);
    expect(sb.kr.current_value).toBe(1);
  });
  it('is IDEMPOTENT: a second flip leaves it at 1 (not 2)', async () => {
    const sb = makeSb({ krValue: 1 });
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'how to', body: 'account guide', venture_id: 'v-1' });
    const flip = await markPipelineLive(sb, result);
    expect(flip.flipped).toBe(false);
    expect(flip.already).toBe(true);
    expect(sb.kr.current_value).toBe(1);
  });
  it('does NOT flip on a partial/incomplete run (real-run-gated)', async () => {
    const sb = makeSb({ krValue: 0 });
    const flip = await markPipelineLive(sb, { ticket: { ticket_id: 'x' } }); // no triage/disposition
    expect(flip.flipped).toBe(false);
    expect(sb.kr.current_value).toBe(0);
    expect(PIPELINE_LIVE_KR_CODE).toBe('KR-2026-07-01');
  });
});
