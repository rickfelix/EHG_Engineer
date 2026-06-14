/**
 * Unit pins for the support intake->triage->route pipeline.
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 — FR-1/FR-2/FR-3/FR-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeSupportTicket, triageSupportTicket, disposeSupportTicket, SUPPORT_CATEGORIES,
} from '../../../lib/support/intake-pipeline.js';

/** Minimal supabase mock: records feedback inserts; can fail the first N inserts (to exercise downgrade). */
export function makeSb({ failFeedbackInsert = false, failFirstNInserts = 0 } = {}) {
  const inserted = [];
  let attempts = 0;
  const sb = {
    inserted,
    from(table) {
      const b = { _t: table, _op: null, _payload: null };
      b.insert = (row) => { b._op = 'insert'; b._payload = row; return b; };
      b.update = (obj) => { b._op = 'update'; b._payload = obj; return b; };
      b.select = () => b; b.eq = () => b; b.neq = () => b; b.order = () => b; b.limit = () => b;
      b.single = () => {
        if (b._t === 'feedback' && b._op === 'insert') {
          attempts += 1;
          if (failFeedbackInsert || attempts <= failFirstNInserts) return Promise.resolve({ data: null, error: { message: 'insert failed' } });
          const id = `fb-${inserted.length + 1}`; inserted.push({ ...b._payload, id }); return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return b;
    },
  };
  return sb;
}

describe('normalizeSupportTicket (FR-1)', () => {
  it('normalizes a channel-neutral raw input to a ticket with required fields', () => {
    const t = normalizeSupportTicket({ channel: 'email', subject: 'Help', body: 'hi', email: 'a@b.com' });
    expect(t.channel).toBe('email');
    expect(t.subject).toBe('Help');
    expect(t.customer_ref).toBe('a@b.com');
    expect(t.status).toBe('new');
    expect(typeof t.ticket_id).toBe('string');
    expect(t.ticket_id.startsWith('tkt_')).toBe(true);
  });
  it('is tolerant of missing fields (no throw; channel defaults to unknown); ticket_id is deterministic', () => {
    const a = normalizeSupportTicket({ subject: 'x', body: 'y' });
    const b = normalizeSupportTicket({ subject: 'x', body: 'y' });
    expect(a.channel).toBe('unknown');
    expect(a.ticket_id).toBe(b.ticket_id); // content-derived, stable
    expect(() => normalizeSupportTicket(null)).not.toThrow();
    expect(() => normalizeSupportTicket(undefined)).not.toThrow();
  });
});

describe('triageSupportTicket (FR-2)', () => {
  it('a confident known low/med-severity ticket => auto_resolve', () => {
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'How do I reset my password', body: 'account login reset' }));
    expect(t.category).toBe('account');
    expect(t.routing_decision).toBe('auto_resolve');
    expect(t.confidence).toBeGreaterThanOrEqual(0.6);
  });
  it('high-severity => escalate even with a known category', () => {
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'URGENT: charged twice, service down', body: 'billing refund' }));
    expect(t.severity).toBe('high');
    expect(t.routing_decision).toBe('escalate');
  });
  it('abuse => escalate', () => {
    expect(triageSupportTicket(normalizeSupportTicket({ subject: 'spam fraud scam', body: '' })).routing_decision).toBe('escalate');
  });
  it('ABUSE VETO: an abuse keyword forces escalate even when a benign category outscores it (no auto-resolve)', () => {
    // billing keywords (refund/charge/invoice/billing/payment/subscription) outscore abuse on count,
    // but the fraud/scam signal must VETO auto-resolve — never send a canned FAQ to a fraud complaint.
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'refund my charge', body: 'this is a scam and fraud, refund the double charge invoice billing payment subscription' }));
    expect(t.category).toBe('abuse');
    expect(t.routing_decision).toBe('escalate');
  });
  it('WORD-BOUNDARY: "download"/"recharge" do NOT trigger the down/charge keywords (no false high-severity)', () => {
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'how do i download the recharge guide', body: 'where is the setup tutorial' }));
    expect(t.severity).toBe('low'); // 'down' in download / 'charge' in recharge must NOT match
  });
  it('unknown category => escalate (fail-loud default)', () => {
    expect(triageSupportTicket(normalizeSupportTicket({ subject: 'hello there', body: 'nice day' })).routing_decision).toBe('escalate');
  });
  it('REUSE: a ticket the EVA intake-classifier reads as a new-venture pitch => escalate (out-of-scope)', () => {
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'startup idea', body: 'launch a new saas business venture for this market revenue' }));
    expect(t.routing_decision).toBe('escalate');
    expect(t.rationale).toMatch(/new-venture|out-of-scope/);
  });
  it('FAIL-OPEN: never throws; an error degrades to escalate', () => {
    const hostile = {}; Object.defineProperty(hostile, 'subject', { get() { throw new Error('boom'); } });
    const t = triageSupportTicket(hostile);
    expect(t.routing_decision).toBe('escalate');
  });
  it('only emits taxonomy categories', () => {
    const t = triageSupportTicket(normalizeSupportTicket({ subject: 'bug error broken crash', body: '' }));
    expect(SUPPORT_CATEGORIES).toContain(t.category);
  });
});

describe('disposeSupportTicket (FR-3)', () => {
  it('auto_resolve => records a resolved feedback row, status auto_resolved', async () => {
    const sb = makeSb();
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide' });
    const triage = triageSupportTicket(ticket);
    const d = await disposeSupportTicket(sb, ticket, triage);
    expect(d.status).toBe('auto_resolved');
    expect(sb.inserted.some((r) => r.category === 'support_auto_resolved' && r.status === 'resolved')).toBe(true);
  });
  it('escalate => writes a surfaced support_escalation feedback row (never dropped)', async () => {
    const sb = makeSb();
    const ticket = normalizeSupportTicket({ subject: 'URGENT down', body: 'breach' });
    const d = await disposeSupportTicket(sb, ticket, triageSupportTicket(ticket));
    expect(d.status).toBe('escalated');
    expect(sb.inserted.some((r) => r.category === 'support_escalation' && r.status === 'new')).toBe(true);
  });
  it('DOWNGRADE: an auto_resolve whose record fails ESCALATES instead (re-routed, not dropped)', async () => {
    const sb = makeSb({ failFirstNInserts: 1 }); // the auto-resolution record fails; the escalation write succeeds
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide' });
    const triage = triageSupportTicket(ticket);
    expect(triage.routing_decision).toBe('auto_resolve');
    const d = await disposeSupportTicket(sb, ticket, triage);
    expect(d.status).toBe('escalated'); // re-routed, NOT silently dropped
    expect(d.reason).toMatch(/downgraded/);
    expect(sb.inserted.some((r) => r.category === 'support_escalation')).toBe(true);
  });
  it('FAIL-LOUD: a total DB outage (every write fails) throws rather than silently dropping', async () => {
    const sb = makeSb({ failFeedbackInsert: true });
    const ticket = normalizeSupportTicket({ subject: 'URGENT down', body: 'breach' });
    await expect(disposeSupportTicket(sb, ticket, triageSupportTicket(ticket))).rejects.toBeTruthy();
  });
});

describe('single-canonical reuse guard (FR-6)', () => {
  it('the triage classifier REUSES intake-classifier.js (imports keywordClassify) — no greenfield duplicate', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib/support/intake-pipeline.js'), 'utf8');
    expect(src).toMatch(/from '\.\.\/integrations\/intake-classifier\.js'/);
    expect(src).toMatch(/keywordClassify/);
    // venture-agnostic: no venture-specific branching baked into the pipeline
    expect(src).not.toMatch(/venture_id|first_venture|venture-specific/i);
  });
});
