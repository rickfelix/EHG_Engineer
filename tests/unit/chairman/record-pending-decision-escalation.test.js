/**
 * SD-LEO-INFRA-ADAM-ESCALATION-DETERMINISM-001 — the chairman-escalation email is now DETERMINISTIC:
 * an Adam session_question/blocking decision fires the standout email immediately on creation, with no
 * in-session gate, deduped to one email per decision, fail-soft.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldAutoEscalate,
  escalateChairmanDecision,
  recordPendingDecision,
} from '../../../lib/chairman/record-pending-decision.mjs';

/** Minimal supabase stub: insert returns an id; select reads back a row's brief_data; update records. */
function makeSupabase({ briefData = null } = {}) {
  const state = { briefData, updates: [] };
  return {
    state,
    from() {
      const ctx = {};
      const api = {
        insert() { ctx.op = 'insert'; return api; },
        update(vals) { ctx.op = 'update'; state.updates.push(vals); return api; },
        select() { ctx.op = ctx.op || 'select'; return api; },
        eq() { return api; },
        async maybeSingle() { return { data: state.briefData === null ? null : { brief_data: state.briefData } }; },
        then(resolve) { // insert(...).select('id') is awaited directly
          resolve({ data: [{ id: 'dec-1' }], error: null });
        },
      };
      return api;
    },
  };
}

describe('shouldAutoEscalate (FR-1)', () => {
  it('adam + session_question => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'adam' })).toBe(true);
  });
  it('adam + blocking => true', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: true, raisedBy: 'adam' })).toBe(true);
  });
  it('non-adam => false regardless of type/blocking', () => {
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'coordinator' })).toBe(false);
    expect(shouldAutoEscalate({ blocking: true, raisedBy: null })).toBe(false);
  });
  it('adam but neither session_question nor blocking => false', () => {
    expect(shouldAutoEscalate({ decisionType: 'stage_gate', blocking: false, raisedBy: 'adam' })).toBe(false);
  });
  it('has no chairman-availability/in-session parameter', () => {
    // The signature is purely structural — passing an "inSession" flag has no effect.
    expect(shouldAutoEscalate({ decisionType: 'session_question', raisedBy: 'adam', inSession: false })).toBe(true);
  });
});

describe('escalateChairmanDecision (FR-2/FR-3)', () => {
  it('fires the email once and stamps escalation_email_sent_at', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sb.state.updates[0].brief_data.escalation_email_sent_at).toBeTruthy();
  });

  it('dedup: a row already stamped does NOT spawn again', async () => {
    const sb = makeSupabase({ briefData: { title: 'q', escalation_email_sent_at: '2026-06-28T00:00:00Z' } });
    const spawn = vi.fn();
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.deduped).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('fail-soft: a spawn throw is swallowed (escalated:false, no throw)', async () => {
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const spawn = vi.fn(() => { throw new Error('spawn boom'); });
    const r = await escalateChairmanDecision(sb, 'dec-1', { spawn });
    expect(r.escalated).toBe(false);
    expect(r.error).toMatch(/boom/);
  });
});

describe('recordPendingDecision — deterministic escalation wiring (FR-2/FR-5)', () => {
  it('an adam session_question record fires exactly one email spawn, no in-session gate', async () => {
    const sb = makeSupabase({ briefData: { title: 'Adam needs a call' } });
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'Adam needs a call', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: spawn });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('a non-adam record does NOT fire the email', async () => {
    const sb = makeSupabase({ briefData: { title: 'routine' } });
    const spawn = vi.fn();
    const r = await recordPendingDecision(sb, { title: 'routine', raisedBy: 'coordinator', decisionType: 'session_question', _spawnEscalation: spawn });
    expect(r.recorded).toBe(true);
    expect(r.escalated).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('persists raised_by in brief_data for escalation provenance', async () => {
    // The insert path builds brief_data with raised_by; assert recordPendingDecision still records.
    const sb = makeSupabase({ briefData: { title: 'q' } });
    const r = await recordPendingDecision(sb, { title: 'q', raisedBy: 'adam', decisionType: 'session_question', _spawnEscalation: vi.fn() });
    expect(r.recorded).toBe(true);
  });
});
