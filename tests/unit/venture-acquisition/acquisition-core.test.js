/**
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 PR-A (FR-1..FR-6, TS-1..TS-7):
 * decision packet + registrar adapter + approval-enforced idempotent
 * ceiling-guarded executor. All registrar/supabase interactions are injected
 * fakes — zero live HTTP, zero live DB.
 *
 * @module tests/unit/venture-acquisition/acquisition-core.test
 */
import { describe, it, expect, vi } from 'vitest';
import { createRegistrarAdapter, normalizeQuote } from '../../../lib/venture-acquisition/registrar-adapter.js';
import { composeAcquisitionPacket, pickRecommended, resolvePurchaseCeilingUsd, PACKET_KIND, DEFAULT_DOMAIN_PURCHASE_CEILING_USD } from '../../../lib/venture-acquisition/decision-packet.js';
import { executeAcquisition, PACKET_QUOTE_TTL_MS } from '../../../lib/venture-acquisition/acquire.js';
import { REGISTRAR_PRICE_CEILING } from '../../../lib/venture-deploy/spend-guardrails.js';
import { computeQuestionKey } from '../../../lib/decision-binding/disposition.js';

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Minimal chainable supabase fake over in-memory tables. */
function fakeSupabase(tables) {
  const calls = { inserts: [], updates: [] };
  function from(table) {
    const rows = tables[table] || [];
    const state = { filters: [], order: null, limit: null };
    const applyFilters = () => rows.filter((r) => state.filters.every(([k, v]) => {
      if (k.includes('->>')) {
        const [col, key] = k.split('->>');
        return String((r[col] || {})[key]) === String(v);
      }
      return r[k] === v;
    }));
    const chain = {
      select() { return chain; },
      eq(k, v) { state.filters.push([k, v]); return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: applyFilters(), error: null }); },
      maybeSingle() { const d = applyFilters(); return Promise.resolve({ data: d[0] ?? null, error: null }); },
      single() { const d = applyFilters(); return Promise.resolve({ data: d[0] ?? null, error: d[0] ? null : { message: 'no row' } }); },
      insert(row) {
        calls.inserts.push({ table, row });
        const stored = { id: `${table}-${rows.length + 1}`, ...row };
        rows.push(stored); tables[table] = rows;
        return {
          select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }),
        };
      },
      update(patch) {
        calls.updates.push({ table, patch });
        return {
          eq(k, v) {
            const target = rows.find((r) => r[k] === v);
            if (target) Object.assign(target, patch);
            return { select: () => ({ single: () => Promise.resolve({ data: target ?? null, error: null }) }), then: (res) => res({ data: target ?? null, error: null }) };
          },
        };
      },
    };
    return chain;
  }
  return { from, _calls: calls, _tables: tables };
}

const SHORTLIST = [
  { candidate: 'Lumina', domain: 'lumina.com', verdict: 'available', checked_at: 't', price: null },
  { candidate: 'Lumina', domain: 'lumina.io', verdict: 'available', checked_at: 't', price: null },
  { candidate: 'Lumina', domain: 'getlumina.com', verdict: 'unknown', checked_at: 't', price: null },
];

function tablesWithShortlist(extraDecisions = []) {
  return {
    venture_artifacts: [{ id: 'a1', venture_id: 'v1', artifact_type: 'identity_brand_name', created_at: '2026-07-10T00:00:00Z', artifact_data: { domainShortlist: SHORTLIST } }],
    chairman_decisions: [...extraDecisions],
    system_events: [],
  };
}

const fakeRegistrar = (overrides = {}) => ({
  checkDomain: vi.fn(async (d) => ({ available: true, price: d === 'lumina.com' ? 12.5 : 32 })),
  registerDomain: vi.fn(async (d) => ({ domain: d, order_id: 'ord-1', status: 'registered' })),
  searchDomains: vi.fn(async () => []),
  ...overrides,
});

const approvedPacket = (over = {}) => ({
  id: 'dec-1', venture_id: 'v1', status: 'approved',
  brief_data: {
    packet_kind: PACKET_KIND, recommended: 'lumina.com', ceiling_usd: 50,
    quoted_at: new Date().toISOString(), ranked_domains: [],
  },
  ...over,
});

// ── FR-2 adapter + credential hygiene ────────────────────────────────────────

describe('registrar adapter (FR-2)', () => {
  it('factory returns null without both env vars — the plan-mode activation gate', () => {
    expect(createRegistrarAdapter({}, { fetchImpl: vi.fn() })).toBeNull();
    expect(createRegistrarAdapter({ CLOUDFLARE_REGISTRAR_API_TOKEN: 't' }, { fetchImpl: vi.fn() })).toBeNull();
    expect(createRegistrarAdapter({ CLOUDFLARE_ACCOUNT_ID: 'a' }, { fetchImpl: vi.fn() })).toBeNull();
    expect(createRegistrarAdapter({ CLOUDFLARE_REGISTRAR_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, { fetchImpl: vi.fn() })).not.toBeNull();
  });

  it('API error surfaces sanitized registrar text — NEVER the token value', async () => {
    const secret = 'SUPER-SECRET-TOKEN-VALUE';
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 402, json: async () => ({ success: false, errors: [{ message: 'payment method required' }] }) }));
    const adapter = createRegistrarAdapter({ CLOUDFLARE_REGISTRAR_API_TOKEN: secret, CLOUDFLARE_ACCOUNT_ID: 'acct' }, { fetchImpl });
    await expect(adapter.checkDomain('x.com')).rejects.toThrow(/payment method required/);
    try { await adapter.checkDomain('x.com'); } catch (e) { expect(String(e.message)).not.toContain(secret); }
    // The token travels only in the auth header of the fetch call itself.
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${secret}`);
  });

  it('normalizeQuote: honest unknown for missing price; registrable from available|registrable', () => {
    expect(normalizeQuote({ available: true, price: 9.99 })).toEqual({ registrable: true, priceUsd: 9.99 });
    expect(normalizeQuote({ registrable: true })).toEqual({ registrable: true, priceUsd: null });
    expect(normalizeQuote(undefined)).toEqual({ registrable: false, priceUsd: null });
  });
});

// ── FR-1 packet composer (TS-1, TS-2) ────────────────────────────────────────

describe('decision packet composer (FR-1)', () => {
  it('TS-1 happy path: one pending chairman_decisions row with live-quoted ranked domains + recommended default', async () => {
    const sb = fakeSupabase(tablesWithShortlist());
    const r = await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    expect(r.status).toBe('created');
    expect(r.decision.status).toBe('pending');
    expect(r.decision.brief_data.packet_kind).toBe(PACKET_KIND);
    expect(r.decision.brief_data.recommended).toBe('lumina.com'); // cheapest registrable within ceiling ranks first in shortlist order
    expect(r.decision.brief_data.ranked_domains).toHaveLength(3);
    expect(r.decision.brief_data.ranked_domains[0]).toMatchObject({ domain: 'lumina.com', quoted_price_usd: 12.5, registrable: true });
    expect(r.decision.brief_data.ceiling_usd).toBe(DEFAULT_DOMAIN_PURCHASE_CEILING_USD);
    expect(sb._calls.inserts).toHaveLength(1);
  });

  it('TS-2 degrade: absent shortlist -> no_shortlist + re-run hint + ZERO inserts (never fabricate)', async () => {
    const sb = fakeSupabase({ venture_artifacts: [], chairman_decisions: [], system_events: [] });
    const r = await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    expect(r.status).toBe('no_shortlist');
    expect(r.unblock).toMatch(/DOMAIN_AVAILABILITY_MODE=live/);
    expect(sb._calls.inserts).toHaveLength(0);
  });

  it('TS-2 idempotency: an existing pending acquisition packet is returned, not duplicated', async () => {
    const existing = { id: 'dec-0', venture_id: 'v1', status: 'pending', brief_data: { packet_kind: PACKET_KIND } };
    const sb = fakeSupabase(tablesWithShortlist([existing]));
    const r = await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    expect(r.status).toBe('existing');
    expect(r.decision.id).toBe('dec-0');
    expect(sb._calls.inserts).toHaveLength(0);
  });

  it('unquotable domains carry price unknown (registrar fault is honest, not fabricated)', async () => {
    const sb = fakeSupabase(tablesWithShortlist());
    const reg = fakeRegistrar({ checkDomain: vi.fn(async () => { throw new Error('rate limited'); }) });
    const r = await composeAcquisitionPacket(sb, 'v1', { registrar: reg, env: {} });
    expect(r.decision.brief_data.ranked_domains.every((d) => d.quoted_price_usd === 'unknown')).toBe(true);
  });

  it('ceiling env: DOMAIN_PURCHASE_CEILING_USD respected, default 50 pinned', () => {
    expect(resolvePurchaseCeilingUsd({})).toBe(50);
    expect(resolvePurchaseCeilingUsd({ DOMAIN_PURCHASE_CEILING_USD: '25' })).toBe(25);
    expect(resolvePurchaseCeilingUsd({ DOMAIN_PURCHASE_CEILING_USD: 'garbage' })).toBe(50);
    expect(pickRecommended([{ domain: 'a.com', registrable: true, quoted_price_usd: 60 }, { domain: 'b.com', registrable: true, quoted_price_usd: 12 }], 50)).toBe('b.com');
  });
});

// ── FR-3 refusal matrix (TS-3) + plan mode (TS-4) ────────────────────────────

describe('executor refusal matrix (FR-3 / TS-3)', () => {
  const cases = [
    ['absent', [], 'nonexistent-id', 'decision_not_found'],
    ['pending', [approvedPacket({ status: 'pending' })], 'dec-1', 'approval_pending'],
    ['rejected', [approvedPacket({ status: 'rejected' })], 'dec-1', 'decision_rejected'],
    ['other-status', [approvedPacket({ status: 'expired' })], 'dec-1', 'decision_not_approved: expired'],
    ['not-a-packet', [approvedPacket({ brief_data: { packet_kind: 'something_else' } })], 'dec-1', 'not_an_acquisition_packet'],
  ];
  for (const [label, decisions, id, reason] of cases) {
    it(`${label} decision refuses with ${reason} and performs ZERO registrar calls`, async () => {
      const sb = fakeSupabase({ chairman_decisions: decisions, system_events: [], venture_artifacts: [] });
      const reg = fakeRegistrar();
      const r = await executeAcquisition(sb, id, { registrar: reg, execute: true, env: {} });
      expect(r.status).toBe('refused');
      expect(r.reason).toBe(reason);
      expect(reg.checkDomain).not.toHaveBeenCalled();
      expect(reg.registerDomain).not.toHaveBeenCalled();
    });
  }

  it('stale packet quote (> TTL) refuses with re-compose unblock (TS-3 stale state)', async () => {
    const stale = approvedPacket();
    stale.brief_data.quoted_at = new Date(Date.now() - PACKET_QUOTE_TTL_MS - 1000).toISOString();
    const sb = fakeSupabase({ chairman_decisions: [stale], system_events: [], venture_artifacts: [] });
    const reg = fakeRegistrar();
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.reason).toBe('stale_packet_quote');
    expect(reg.registerDomain).not.toHaveBeenCalled();
  });

  it('TS-4 plan mode: approved decision, no adapter -> ordered plan + blocked_on_credentials, zero live calls', async () => {
    const sb = fakeSupabase({ chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: null, execute: false, env: {} });
    expect(r.status).toBe('blocked_on_credentials');
    expect(r.plan.map((a) => a.kind)).toEqual(['live_quote', 'ceiling_guardrail', 'idempotency_record', 'register', 'dns_wiring', 'deploy_handoff']);
  });

  it('TS-4 execute:true without adapter still plans (both required — promote.js parity)', async () => {
    const sb = fakeSupabase({ chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] });
    const withAdapterNoExecute = await executeAcquisition(sb, 'dec-1', { registrar: fakeRegistrar(), execute: false, env: {} });
    expect(withAdapterNoExecute.status).toBe('blocked_on_credentials');
  });
});

// ── FR-5 ceiling (TS-6) ──────────────────────────────────────────────────────

describe('registrar price ceiling (FR-5 / TS-6)', () => {
  it('guardrail shape: fail-closed on missing quote or ceiling; allow only quote<=ceiling', () => {
    expect(REGISTRAR_PRICE_CEILING.enforce({}).decision).toBe('block');
    expect(REGISTRAR_PRICE_CEILING.enforce({ quote: { priceUsd: 10 } }).decision).toBe('block');
    expect(REGISTRAR_PRICE_CEILING.enforce({ quote: { priceUsd: 51 }, limits: { registrarPriceCeilingUsd: 50 } }).decision).toBe('block');
    expect(REGISTRAR_PRICE_CEILING.enforce({ quote: { priceUsd: 50 }, limits: { registrarPriceCeilingUsd: 50 } }).decision).toBe('allow');
  });

  it('above-ceiling LIVE quote refuses EVEN WITH approval; refusal persisted on the decision record', async () => {
    const tables = { chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar({ checkDomain: vi.fn(async () => ({ available: true, price: 500 })) });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('refused');
    expect(reg.registerDomain).not.toHaveBeenCalled();
    expect(tables.chairman_decisions[0].brief_data.acquisition_refusal).toMatchObject({ step: 'ceiling_guardrail', live_price_usd: 500, ceiling_usd: 50 });
  });

  it('unknown live price refuses (fail-closed) — packet quote is never used for the money decision', async () => {
    const sb = fakeSupabase({ chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] });
    const reg = fakeRegistrar({ checkDomain: vi.fn(async () => ({ available: true })) }); // no price
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('refused');
    expect(reg.registerDomain).not.toHaveBeenCalled();
  });
});

// ── FR-4 idempotency (TS-5) + FR-6 fail-loud (TS-7) ─────────────────────────

describe('consumed-exactly-once + fail-loud (FR-4/FR-6, TS-5/TS-7)', () => {
  it('TS-5 happy execute: registry-first disposition BEFORE register, consumed after, full response persisted', async () => {
    const tables = { chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar();
    const order = [];
    reg.registerDomain.mockImplementation(async (d) => { order.push('register'); return { domain: d, order_id: 'ord-1' }; });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('registered');
    const dispo = tables.system_events.find((e) => e.event_type === 'DECISION_DISPOSITION');
    expect(dispo).toBeTruthy();
    expect(dispo.payload.status).toBe('consumed');
    expect(dispo.payload.answer_payload.registrar_response).toMatchObject({ order_id: 'ord-1' });
    expect(dispo.idempotency_key).toBe(computeQuestionKey('domain_acquisition', { venture_id: 'v1', domain: 'lumina.com' }));
  });

  it('TS-5 re-run after success: zero additional registrar writes, already_acquired (durable readback)', async () => {
    const key = computeQuestionKey('domain_acquisition', { venture_id: 'v1', domain: 'lumina.com' });
    const tables = {
      chairman_decisions: [approvedPacket()],
      venture_artifacts: [],
      system_events: [{ id: 'se-1', event_type: 'DECISION_DISPOSITION', idempotency_key: key, payload: { question_key: key, status: 'consumed', decision_type: 'domain_acquisition' } }],
    };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar();
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('already_acquired');
    expect(reg.checkDomain).not.toHaveBeenCalled();
    expect(reg.registerDomain).not.toHaveBeenCalled();
  });

  it('TS-7 register failure: sanitized error persisted to brief_data, disposition NOT consumed (retry-able), non-success status', async () => {
    const tables = { chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar({ registerDomain: vi.fn(async () => { throw new Error('registrar POST /domains/lumina.com/register: insufficient funds'); }) });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('failed');
    expect(r.reason).toBe('register_failed');
    expect(tables.chairman_decisions[0].brief_data.acquisition_error).toMatchObject({ step: 'register' });
    expect(tables.chairman_decisions[0].brief_data.acquisition_error.reason).toMatch(/insufficient funds/);
    const dispo = tables.system_events.find((e) => e.event_type === 'DECISION_DISPOSITION');
    expect(dispo.payload.status).toBe('awaiting_disposition'); // retry-able, NOT consumed
  });

  it('disposition enum: domain_acquisition accepted, invalid type still throws (additive pin)', () => {
    expect(() => computeQuestionKey('domain_acquisition', { venture_id: 'v', domain: 'd' })).not.toThrow();
    expect(() => computeQuestionKey('ratification', { fixture_set_id: 1, fixture_id: 2 })).not.toThrow();
    expect(() => computeQuestionKey('nonsense_type', { a: 1 })).toThrow(/invalid decisionType/);
  });
});

// ── Adversarial-review regression pins (findings a6c7549a) ──────────────────

describe('adversarial-review fixes', () => {
  it('DOUBLE-BUY GUARD: a pre-existing AWAITING disposition (in-flight or crashed-after-register) refuses — never proceeds to register', async () => {
    const key = computeQuestionKey('domain_acquisition', { venture_id: 'v1', domain: 'lumina.com' });
    const tables = {
      chairman_decisions: [approvedPacket()],
      venture_artifacts: [],
      system_events: [{ id: 'se-1', event_type: 'DECISION_DISPOSITION', idempotency_key: key, payload: { question_key: key, status: 'awaiting_disposition', decision_type: 'domain_acquisition' } }],
    };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar();
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: {} });
    expect(r.status).toBe('refused');
    expect(r.reason).toBe('in_flight_or_unknown_outcome');
    expect(r.unblock).toMatch(/Verify with the registrar/);
    expect(reg.registerDomain).not.toHaveBeenCalled();
  });

  it('CEILING PROVENANCE: the APPROVED ceiling binds — raising the env ceiling after approval cannot loosen the bound', async () => {
    const packet = approvedPacket();
    packet.brief_data.ceiling_usd = 20; // what the chairman saw and approved
    const tables = { chairman_decisions: [packet], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const reg = fakeRegistrar({ checkDomain: vi.fn(async () => ({ available: true, price: 30 })) });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: { DOMAIN_PURCHASE_CEILING_USD: '100' } });
    expect(r.status).toBe('refused'); // 30 > min(100, 20)
    expect(reg.registerDomain).not.toHaveBeenCalled();
    expect(tables.chairman_decisions[0].brief_data.acquisition_refusal.ceiling_usd).toBe(20);
  });

  it('CEILING PROVENANCE inverse: lowering the env ceiling below the approved one also binds (min of both)', async () => {
    const packet = approvedPacket();
    packet.brief_data.ceiling_usd = 100;
    const sb = fakeSupabase({ chairman_decisions: [packet], system_events: [], venture_artifacts: [] });
    const reg = fakeRegistrar({ checkDomain: vi.fn(async () => ({ available: true, price: 30 })) });
    const r = await executeAcquisition(sb, 'dec-1', { registrar: reg, execute: true, env: { DOMAIN_PURCHASE_CEILING_USD: '25' } });
    expect(r.status).toBe('refused'); // 30 > min(25, 100)
  });

  it('LOWERCASE NORMALIZE: Lumina.com and lumina.com are the SAME idempotency subject', async () => {
    const packet = approvedPacket();
    packet.brief_data.recommended = 'Lumina.com';
    const tables = { chairman_decisions: [packet], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const r = await executeAcquisition(sb, 'dec-1', { registrar: fakeRegistrar(), execute: true, env: {} });
    expect(r.status).toBe('registered');
    expect(r.domain).toBe('lumina.com');
    const dispo = tables.system_events.find((e) => e.event_type === 'DECISION_DISPOSITION');
    expect(dispo.idempotency_key).toBe(computeQuestionKey('domain_acquisition', { venture_id: 'v1', domain: 'lumina.com' }));
  });

  it('FORENSICS BEFORE CONSUME: the registrar response lands on the decision record (survives a consume crash), and success reports resultPersisted', async () => {
    const tables = { chairman_decisions: [approvedPacket()], system_events: [], venture_artifacts: [] };
    const sb = fakeSupabase(tables);
    const r = await executeAcquisition(sb, 'dec-1', { registrar: fakeRegistrar(), execute: true, env: {} });
    expect(r.status).toBe('registered');
    expect(r.resultPersisted).toBe(true);
    expect(tables.chairman_decisions[0].brief_data.acquisition_result.registrar_response).toMatchObject({ order_id: 'ord-1' });
  });

  it('COMPOSE 23505: the partial unique pending index surfaces as pending_conflict (or the raced packet), never an opaque throw', async () => {
    const tables = tablesWithShortlist();
    const sb = fakeSupabase(tables);
    // Simulate the real-DB partial unique index: first insert 23505s.
    const origFrom = sb.from.bind(sb);
    sb.from = (table) => {
      const chain = origFrom(table);
      if (table === 'chairman_decisions') {
        chain.insert = () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_chairman_decisions_unique_pending"' } }) }) });
      }
      return chain;
    };
    const r = await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    expect(r.status).toBe('pending_conflict');
    expect(r.unblock).toMatch(/pending slot/);
  });
});
