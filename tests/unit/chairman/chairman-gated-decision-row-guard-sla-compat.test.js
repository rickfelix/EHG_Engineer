/**
 * SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001 — TS-10.
 * Proves this module's inserts are compatible with the EXISTING, UNMODIFIED
 * chairman-decision-sla-sweep.mjs re-surfacing mechanism, without reimplementing it.
 */
import { describe, it, expect } from 'vitest';
import { selectBlockingSweepRows } from '../../../scripts/cron/chairman-decision-sla-sweep.mjs';
import { buildDecisionEnvelope } from '../../../lib/chairman/chairman-gated-decision-row-guard.mjs';

const CUTOFF = '2026-07-10T00:00:00Z';
const GRACE = 30 * 60 * 1000;

describe('TS-10: a row whose creation-time escalation was suppressed is picked up by the existing SLA sweep after its grace period', () => {
  it('a fixture row shaped exactly like this module\'s insert, past the grace period, with escalation_email_sent_at unset, is selected', () => {
    const sd = { sd_key: 'SD-SLA-001', created_at: new Date('2026-08-01T00:00:00Z').toISOString(), metadata: {} };
    const envelope = buildDecisionEnvelope(sd);
    const now = Date.parse('2026-08-16T12:00:00Z');
    const row = {
      id: 'dec-sla-1',
      status: 'pending',
      decision_type: envelope.decisionType,
      blocking: envelope.blocking,
      venture_id: null,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2h old — past the 30min grace
      brief_data: { context: envelope.context }, // no escalation_email_sent_at — creation-time email was never confirmed sent
    };

    const due = selectBlockingSweepRows([row], { cutoffIso: CUTOFF, graceMs: GRACE, nowMs: now });

    expect(due).toHaveLength(1);
    expect(due[0].id).toBe('dec-sla-1');
  });

  it('a row that already has escalation_email_sent_at is NOT re-selected (no duplicate re-escalation)', () => {
    const sd = { sd_key: 'SD-SLA-002', created_at: new Date('2026-08-01T00:00:00Z').toISOString(), metadata: {} };
    const envelope = buildDecisionEnvelope(sd);
    const now = Date.parse('2026-08-16T12:00:00Z');
    const row = {
      id: 'dec-sla-2',
      status: 'pending',
      decision_type: envelope.decisionType,
      blocking: envelope.blocking,
      venture_id: null,
      created_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      brief_data: { context: envelope.context, escalation_email_sent_at: new Date(now - 60 * 60 * 1000).toISOString() },
    };

    const due = selectBlockingSweepRows([row], { cutoffIso: CUTOFF, graceMs: GRACE, nowMs: now });

    expect(due).toHaveLength(0);
  });

  it('a row still within its grace period is not yet due', () => {
    const sd = { sd_key: 'SD-SLA-003', created_at: new Date('2026-08-01T00:00:00Z').toISOString(), metadata: {} };
    const envelope = buildDecisionEnvelope(sd);
    const now = Date.parse('2026-08-16T12:00:00Z');
    const row = {
      id: 'dec-sla-3',
      status: 'pending',
      decision_type: envelope.decisionType,
      blocking: envelope.blocking,
      venture_id: null,
      created_at: new Date(now - 5 * 60 * 1000).toISOString(), // 5min old — inside the 30min grace
      brief_data: { context: envelope.context },
    };

    const due = selectBlockingSweepRows([row], { cutoffIso: CUTOFF, graceMs: GRACE, nowMs: now });

    expect(due).toHaveLength(0);
  });
});
