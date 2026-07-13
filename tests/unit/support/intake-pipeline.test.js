/**
 * Unit pins for the support intake->triage->route pipeline.
 * SD-LEO-INFRA-SUPPORT-INTAKE-TRIAGE-001 — FR-1/FR-2/FR-3/FR-6.
 * Re-scoped per-venture by SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 — FR-1..FR-6, TS-1..TS-6.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  normalizeSupportTicket, triageSupportTicket, disposeSupportTicket, resolveVentureContext,
  runSupportPipeline, SUPPORT_CATEGORIES,
} from '../../../lib/support/intake-pipeline.js';

/**
 * Minimal supabase mock: records venture_support_tickets inserts (can fail the first N, to exercise
 * downgrade); simulates a real Postgres unique-violation (code 23505) when a row with the same
 * (ticket_id, venture_id) already exists (seed via `preExisting`), and the post-conflict lookup
 * `writeSupportTicketRow` performs to recover idempotently; resolves ventures lookups (by id or
 * support_rail_address) from a fixture list.
 */
export function makeSb({ failInsert = false, failFirstNInserts = 0, ventures = [], preExisting = [] } = {}) {
  const inserted = [...preExisting];
  let attempts = 0;
  const sb = {
    inserted,
    from(table) {
      const b = { _t: table, _op: null, _payload: null, _filters: {} };
      b.insert = (row) => { b._op = 'insert'; b._payload = row; return b; };
      b.update = (obj) => { b._op = 'update'; b._payload = obj; return b; };
      b.select = () => b;
      b.eq = (col, val) => { b._filters[col] = val; return b; };
      b.is = (col, val) => { b._filters[col] = val; return b; }; // val is always null (venture_id IS NULL)
      b.neq = () => b; b.order = () => b; b.limit = () => b;
      b.single = () => {
        if (b._t === 'venture_support_tickets' && b._op === 'insert') {
          attempts += 1;
          const conflict = inserted.some((r) => r.ticket_id === b._payload.ticket_id && r.venture_id === (b._payload.venture_id ?? null));
          if (conflict) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
          if (failInsert || attempts <= failFirstNInserts) return Promise.resolve({ data: null, error: { message: 'insert failed' } });
          const id = `vst-${inserted.length + 1}`; inserted.push({ ...b._payload, id }); return Promise.resolve({ data: { id }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      b.maybeSingle = () => {
        if (b._t === 'ventures') {
          const match = ventures.find((v) =>
            (b._filters.id !== undefined && v.id === b._filters.id) ||
            (b._filters.support_rail_address !== undefined && v.support_rail_address === b._filters.support_rail_address));
          return Promise.resolve({ data: match || null, error: null });
        }
        if (b._t === 'venture_support_tickets') {
          const match = inserted.find((r) => r.ticket_id === b._filters.ticket_id && r.venture_id === (b._filters.venture_id ?? null));
          return Promise.resolve({ data: match || null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
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
  it('captures venture_id when the caller already knows it (FR-4)', () => {
    const t = normalizeSupportTicket({ subject: 'x', body: 'y', venture_id: 'v-1' });
    expect(t.venture_id).toBe('v-1');
  });
  it('captures rail_address from rail_address or "to" for downstream resolution (FR-4); defaults null', () => {
    const t1 = normalizeSupportTicket({ subject: 'x', body: 'y', rail_address: 'billing@acme.example' });
    expect(t1.rail_address).toBe('billing@acme.example');
    const t2 = normalizeSupportTicket({ subject: 'x', body: 'y', to: 'support@acme.example' });
    expect(t2.rail_address).toBe('support@acme.example');
    const t3 = normalizeSupportTicket({ subject: 'x', body: 'y' });
    expect(t3.venture_id).toBeNull();
    expect(t3.rail_address).toBeNull();
  });
});

describe('resolveVentureContext (FR-4/FR-5)', () => {
  it('resolves directly by venture_id and returns the support_is_armed flag', async () => {
    const sb = makeSb({ ventures: [{ id: 'v-1', support_is_armed: true }] });
    const ctx = await resolveVentureContext(sb, { venture_id: 'v-1' });
    expect(ctx).toEqual({ venture_id: 'v-1', venture_armed: true, resolved: true });
  });
  it('PRECEDENCE (adversarial-review fix): rail_address wins over a caller-supplied venture_id when both are present', async () => {
    // ticket claims venture_id='v-spoofed' (fully attacker-controllable on raw channel-neutral
    // input), but arrived via a rail_address that legitimately resolves to a DIFFERENT venture --
    // the physical channel signal must win, not the unauthenticated claim.
    const sb = makeSb({ ventures: [
      { id: 'v-real', support_is_armed: false, support_rail_address: 'help@acme.example' },
      { id: 'v-spoofed', support_is_armed: false },
    ] });
    const ctx = await resolveVentureContext(sb, { venture_id: 'v-spoofed', rail_address: 'help@acme.example' });
    expect(ctx.venture_id).toBe('v-real');
  });
  it('resolves via rail_address when venture_id is not already known', async () => {
    const sb = makeSb({ ventures: [{ id: 'v-2', support_is_armed: false, support_rail_address: 'billing@acme.example' }] });
    const ctx = await resolveVentureContext(sb, { rail_address: 'billing@acme.example' });
    expect(ctx.venture_id).toBe('v-2');
    expect(ctx.venture_armed).toBe(false);
    expect(ctx.resolved).toBe(true);
  });
  it('unresolvable (no venture_id, no matching rail_address) => venture_id null, resolved false', async () => {
    const sb = makeSb({ ventures: [] });
    const ctx = await resolveVentureContext(sb, { rail_address: 'nobody@nowhere.example' });
    expect(ctx).toEqual({ venture_id: null, venture_armed: false, resolved: false });
  });
  it('FAIL-OPEN: a lookup error never throws, degrades to unresolved', async () => {
    const hostileSb = { from() { throw new Error('db down'); } };
    const ctx = await resolveVentureContext(hostileSb, { venture_id: 'v-1' });
    expect(ctx).toEqual({ venture_id: null, venture_armed: false, resolved: false });
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
  it('DB VOCABULARY PIN: emitted severities stay within venture_support_tickets_severity_check ' +
     "('low','medium','high','critical') — a mismatch here would throw a CHECK violation on insert " +
     'once the chairman-gated migration is applied (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 VALIDATION finding)', () => {
    const DB_ALLOWED_SEVERITIES = ['low', 'medium', 'high', 'critical'];
    const fixtures = [
      { subject: 'how do i reset my password', body: 'account login reset' }, // low
      { subject: 'important: still waiting for a refund', body: 'blocked frustrated' }, // medium
      { subject: 'URGENT: charged twice, service down', body: 'billing refund' }, // high
    ];
    for (const raw of fixtures) {
      const t = triageSupportTicket(normalizeSupportTicket(raw));
      expect(DB_ALLOWED_SEVERITIES).toContain(t.severity);
    }
  });
});

describe('disposeSupportTicket (FR-3)', () => {
  it('auto_resolve with a resolved venture_id => records a venture_support_tickets row, status auto_resolved', async () => {
    const sb = makeSb();
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide', venture_id: 'v-1' });
    const triage = triageSupportTicket(ticket);
    const d = await disposeSupportTicket(sb, ticket, triage);
    expect(d.status).toBe('auto_resolved');
    expect(sb.inserted.some((r) => r.venture_id === 'v-1' && r.status === 'auto_resolved')).toBe(true);
  });
  it('escalate => writes a surfaced venture_support_tickets row, status escalated (never dropped)', async () => {
    const sb = makeSb();
    const ticket = normalizeSupportTicket({ subject: 'URGENT down', body: 'breach', venture_id: 'v-1' });
    const d = await disposeSupportTicket(sb, ticket, triageSupportTicket(ticket));
    expect(d.status).toBe('escalated');
    expect(sb.inserted.some((r) => r.venture_id === 'v-1' && r.status === 'escalated')).toBe(true);
  });
  it('UNATTRIBUTED: no venture_id forces escalate even when triage says auto_resolve, but is still persisted (venture_id null)', async () => {
    const sb = makeSb();
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide' }); // no venture_id/rail_address
    const triage = triageSupportTicket(ticket);
    expect(triage.routing_decision).toBe('auto_resolve'); // triage itself is confident...
    const d = await disposeSupportTicket(sb, ticket, triage);
    expect(d.status).toBe('escalated'); // ...but disposition forces escalate: never auto-resolve unattributed
    expect(d.reason).toMatch(/no venture_id resolved/);
    expect(sb.inserted.some((r) => r.venture_id === null && r.status === 'escalated')).toBe(true);
  });
  it('DOWNGRADE: an auto_resolve whose record fails ESCALATES instead (re-routed, not dropped)', async () => {
    const sb = makeSb({ failFirstNInserts: 1 }); // the auto-resolution record fails; the escalation write succeeds
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide', venture_id: 'v-1' });
    const triage = triageSupportTicket(ticket);
    expect(triage.routing_decision).toBe('auto_resolve');
    const d = await disposeSupportTicket(sb, ticket, triage);
    expect(d.status).toBe('escalated'); // re-routed, NOT silently dropped
    expect(d.reason).toMatch(/downgraded/);
    expect(sb.inserted.some((r) => r.status === 'escalated')).toBe(true);
  });
  it('FAIL-LOUD: a total DB outage (every write fails) throws rather than silently dropping', async () => {
    const sb = makeSb({ failInsert: true });
    const ticket = normalizeSupportTicket({ subject: 'URGENT down', body: 'breach', venture_id: 'v-1' });
    await expect(disposeSupportTicket(sb, ticket, triageSupportTicket(ticket))).rejects.toBeTruthy();
  });
  it('IDEMPOTENT REDELIVERY (adversarial-review fix): re-processing an already-persisted attributed ' +
     'ticket recovers via the existing row instead of crashing on the unique-violation', async () => {
    const ticket = normalizeSupportTicket({ subject: 'URGENT down', body: 'breach', venture_id: 'v-1' });
    const sb = makeSb({ preExisting: [{ id: 'vst-existing', ticket_id: ticket.ticket_id, venture_id: 'v-1', status: 'escalated' }] });
    const d = await disposeSupportTicket(sb, ticket, triageSupportTicket(ticket));
    expect(d.status).toBe('escalated');
    expect(d.escalation_id).toBe('vst-existing'); // recovered the existing row, no duplicate/no throw
  });
  it('IDEMPOTENT REDELIVERY: an unattributed ticket redelivery also recovers via the NULL-venture_id row', async () => {
    const ticket = normalizeSupportTicket({ subject: 'how to setup', body: 'account login guide' }); // no venture_id
    const sb = makeSb({ preExisting: [{ id: 'vst-existing-null', ticket_id: ticket.ticket_id, venture_id: null, status: 'escalated' }] });
    const d = await disposeSupportTicket(sb, ticket, triageSupportTicket(ticket));
    expect(d.status).toBe('escalated');
    expect(d.escalation_id).toBe('vst-existing-null');
  });
});

describe('runSupportPipeline venture threading (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 TS-1..TS-5)', () => {
  it('TS-1/TS-2: full run with a resolvable venture rail address => venture_id populated, zero feedback-table writes', async () => {
    const sb = makeSb({ ventures: [{ id: 'v-3', support_is_armed: false, support_rail_address: 'help@acme.example' }] });
    const result = await runSupportPipeline(sb, { subject: 'how to setup', body: 'account login guide', rail_address: 'help@acme.example' });
    expect(result.ticket.venture_id).toBe('v-3');
    expect(sb.inserted.length).toBeGreaterThan(0);
    expect(sb.inserted.every((r) => !('category' in r) || r.category !== 'support_auto_resolved')).toBe(true); // no legacy feedback-shaped rows
  });
  it('TS-4: unresolvable venture_id escalates rather than auto-resolving', async () => {
    const sb = makeSb({ ventures: [] });
    const result = await runSupportPipeline(sb, { subject: 'how to setup', body: 'account login guide' });
    expect(result.ticket.venture_id).toBeNull();
    expect(result.disposition.status).toBe('escalated');
  });
  it('TS-5: support_is_armed=false still processes the ticket correctly (informational only, not a hard gate)', async () => {
    const sb = makeSb({ ventures: [{ id: 'v-4', support_is_armed: false }] });
    const result = await runSupportPipeline(sb, { subject: 'how to setup', body: 'account login guide', venture_id: 'v-4' });
    expect(result.ticket.venture_armed).toBe(false);
    expect(result.disposition.status).toBe('auto_resolved'); // armed flag does not block a normal auto-resolve
  });
});

describe('venture-scoped persistence guard (SD-FDBK-FIX-SCOPE-VENTURE-SUPPORT-001 TS-6, was FR-6)', () => {
  it('persistence targets the dedicated venture_support_tickets table, NEVER the shared feedback table; classifier reuse intact', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib/support/intake-pipeline.js'), 'utf8');
    // still reuses the EVA intake-classifier — no greenfield duplicate (FR-6 original intent preserved)
    expect(src).toMatch(/from '\.\.\/integrations\/intake-classifier\.js'/);
    expect(src).toMatch(/keywordClassify/);
    // venture-SCOPED now (this SD's whole point): venture_id threading is expected and required
    expect(src).toMatch(/venture_id/);
    // zero direct writes to the shared harness feedback table
    expect(src).not.toMatch(/\.from\('feedback'\)/);
    expect(src).toMatch(/\.from\('venture_support_tickets'\)/);
  });
});
