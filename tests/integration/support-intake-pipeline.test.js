/**
 * Integration pins: end-to-end intake->triage->route, surfaced escalation queue, KR-flip.
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 — FR-4/FR-5/FR-6.
 */
import { describe, it, expect } from 'vitest';
import {
  runSupportPipeline, getSupportEscalationQueue, markPipelineLive, PIPELINE_LIVE_KR_CODE,
} from '../../lib/support/intake-pipeline.js';

/** Fuller supabase mock: feedback insert + escalation-queue select + key_results read/update. */
function makeSb({ krValue = 0 } = {}) {
  const feedback = [];
  let kr = { id: 'kr-1', current_value: krValue };
  return {
    feedback,
    get kr() { return kr; },
    from(table) {
      const b = { _t: table, _op: null, _payload: null };
      b.insert = (row) => { b._op = 'insert'; b._payload = row; return b; };
      b.update = (obj) => { b._op = 'update'; b._payload = obj; return b; };
      b.select = () => b; b.eq = () => b; b.neq = () => b; b.order = () => b; b.limit = () => b;
      b.single = () => {
        if (b._t === 'feedback' && b._op === 'insert') {
          const id = `fb-${feedback.length + 1}`; feedback.push({ ...b._payload, id }); return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.maybeSingle = () => {
        if (b._t === 'key_results') return Promise.resolve({ data: { ...kr }, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      b.then = (res) => {
        if (b._t === 'key_results' && b._op === 'update') { kr = { ...kr, current_value: b._payload.current_value }; return res({ error: null }); }
        if (b._t === 'feedback' && !b._op) {
          return res({ data: feedback.filter((r) => r.category === 'support_escalation' && r.status !== 'resolved'), error: null });
        }
        return res({ data: [], error: null });
      };
      return b;
    },
  };
}

describe('runSupportPipeline end-to-end (FR-4)', () => {
  it('happy-path ticket -> auto_resolved, NOT in the escalation queue', async () => {
    const sb = makeSb();
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'How do I reset my password', body: 'account login reset guide' });
    expect(result.disposition.status).toBe('auto_resolved');
    const queue = await getSupportEscalationQueue(sb);
    expect(queue.length).toBe(0); // auto-resolved tickets are not escalations
  });

  it('edge-case ticket -> escalated AND surfaced in the escalation queue (never dropped)', async () => {
    const sb = makeSb();
    const result = await runSupportPipeline(sb, { channel: 'email', subject: 'URGENT: service down, charged twice', body: 'billing breach losing money' });
    expect(result.disposition.status).toBe('escalated');
    const queue = await getSupportEscalationQueue(sb);
    expect(queue.length).toBe(1);
    expect(queue[0].title).toMatch(/Support escalation/);
  });
});

describe('markPipelineLive — KR-2026-07-01 flip (FR-5)', () => {
  it('flips current_value 0 -> 1 (status achieved) on a real end-to-end run', async () => {
    const sb = makeSb({ krValue: 0 });
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'how to', body: 'account guide' });
    const flip = await markPipelineLive(sb, result);
    expect(flip.flipped).toBe(true);
    expect(sb.kr.current_value).toBe(1);
  });
  it('is IDEMPOTENT: a second flip leaves it at 1 (not 2)', async () => {
    const sb = makeSb({ krValue: 1 });
    const result = await runSupportPipeline(sb, { channel: 'web', subject: 'how to', body: 'account guide' });
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
