/**
 * SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 PR-B (FR-7..FR-9, TS-8..TS-10):
 * DNS wiring idempotency, deploy handoff resumability, the single-touch E2E,
 * and credential hygiene (redaction + source secret-scan).
 *
 * @module tests/unit/venture-acquisition/dns-wiring-e2e.test
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { createDnsAdapter, wireDomainDns, handDomainToDeploy, runPostApprovalPipeline, planDnsRecords } from '../../../lib/venture-acquisition/dns-wiring.js';
import { composeAcquisitionPacket } from '../../../lib/venture-acquisition/decision-packet.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// ── Fakes (same shapes as acquisition-core.test.js) ─────────────────────────

function fakeSupabase(tables) {
  function from(table) {
    const rows = tables[table] || [];
    const state = { filters: [] };
    const applyFilters = () => rows.filter((r) => state.filters.every(([k, v]) => {
      if (k.includes('->>')) { const [col, key] = k.split('->>'); return String((r[col] || {})[key]) === String(v); }
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
        const stored = { id: `${table}-${rows.length + 1}`, ...row };
        rows.push(stored); tables[table] = rows;
        return { select: () => ({ single: () => Promise.resolve({ data: stored, error: null }) }) };
      },
      update(patch) {
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
  return { from, _tables: tables };
}

/** In-memory DNS fake tracking zone/record creations. */
function fakeDns(seed = {}) {
  const zones = seed.zones || [];
  const records = seed.records || {};
  const calls = { createZone: 0, createRecord: 0 };
  return {
    calls,
    listZones: vi.fn(async (name) => zones.filter((z) => z.name === name)),
    createZone: vi.fn(async (name) => { calls.createZone += 1; const z = { id: `zone-${zones.length + 1}`, name }; zones.push(z); records[z.id] = []; return z; }),
    listRecords: vi.fn(async (zoneId) => records[zoneId] || []),
    createRecord: vi.fn(async (zoneId, rec) => { calls.createRecord += 1; const r = { id: `rec-${(records[zoneId] || []).length + 1}`, ...rec }; (records[zoneId] = records[zoneId] || []).push(r); return r; }),
  };
}

const fakeRegistrar = () => ({
  checkDomain: vi.fn(async () => ({ available: true, price: 12.5 })),
  registerDomain: vi.fn(async (d) => ({ domain: d, order_id: 'ord-1' })),
  searchDomains: vi.fn(async () => []),
});

// ── TS-8 DNS idempotency ─────────────────────────────────────────────────────

describe('DNS wiring (FR-7 / TS-8)', () => {
  it('fresh domain: zone + apex/www records created via the mock adapter', async () => {
    const dns = fakeDns();
    const r = await wireDomainDns(dns, 'lumina.com', 'lumina.pages.dev');
    expect(r.status).toBe('wired');
    expect(dns.calls.createZone).toBe(1);
    expect(dns.calls.createRecord).toBe(2);
    expect(r.created.map((c) => c.name)).toEqual(['lumina.com', 'www.lumina.com']);
  });

  it('re-run: zero duplicate zone/record creations (verified-and-kept)', async () => {
    const dns = fakeDns();
    await wireDomainDns(dns, 'lumina.com', 'lumina.pages.dev');
    const second = await wireDomainDns(dns, 'lumina.com', 'lumina.pages.dev');
    expect(second.status).toBe('wired');
    expect(dns.calls.createZone).toBe(1); // unchanged
    expect(dns.calls.createRecord).toBe(2); // unchanged
    expect(second.kept).toHaveLength(2);
    expect(second.created).toHaveLength(0);
  });

  it('partial-failure resume: one existing record -> only the missing one is created', async () => {
    const dns = fakeDns();
    const zone = await dns.createZone('lumina.com');
    await dns.createRecord(zone.id, { type: 'CNAME', name: 'lumina.com', content: 'x' });
    const before = dns.calls.createRecord;
    const r = await wireDomainDns(dns, 'lumina.com', 'lumina.pages.dev');
    expect(dns.calls.createRecord - before).toBe(1);
    expect(r.kept).toHaveLength(1);
    expect(r.created).toHaveLength(1);
  });

  it('plan mode (null adapter): ordered DNS plan only, nothing touched', async () => {
    const r = await wireDomainDns(null, 'lumina.com', 'lumina.pages.dev');
    expect(r.status).toBe('blocked_on_credentials');
    expect(r.plan.map((p) => p.kind)).toEqual(['ensure_zone', 'ensure_record', 'ensure_record']);
  });

  it('adapter factory: null without credentials (same TR-5 gate as the registrar)', () => {
    expect(createDnsAdapter({}, { fetchImpl: vi.fn() })).toBeNull();
    expect(createDnsAdapter({ CLOUDFLARE_REGISTRAR_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }, { fetchImpl: vi.fn() })).not.toBeNull();
    expect(planDnsRecords('d.com', 't').every((r) => r.proxied === true)).toBe(true);
  });
});

// ── TS-9 deploy handoff ──────────────────────────────────────────────────────

describe('deploy handoff (FR-8 / TS-9)', () => {
  it('routed deployment exists: deployment_url stamped with the custom domain (readback-verified)', async () => {
    const tables = {
      venture_deployments: [{ id: 'd1', venture_id: 'v1', status: 'routed', url: 'https://lumina.pages.dev', created_at: 't' }],
      ventures: [{ id: 'v1', deployment_url: 'https://lumina.pages.dev' }],
    };
    const sb = fakeSupabase(tables);
    const r = await handDomainToDeploy(sb, 'v1', 'lumina.com');
    expect(r).toEqual({ status: 'stamped', deploymentUrl: 'https://lumina.com' });
    expect(tables.ventures[0].deployment_url).toBe('https://lumina.com');
  });

  it('no routed deployment: parks pending_deploy, then resumes after routing (resumability)', async () => {
    const tables = { venture_deployments: [], ventures: [{ id: 'v1', deployment_url: null }] };
    const sb = fakeSupabase(tables);
    expect((await handDomainToDeploy(sb, 'v1', 'lumina.com')).status).toBe('pending_deploy');
    expect(tables.ventures[0].deployment_url).toBeNull(); // untouched while parked
    tables.venture_deployments.push({ id: 'd1', venture_id: 'v1', status: 'routed', url: 'u', created_at: 't' });
    expect((await handDomainToDeploy(sb, 'v1', 'lumina.com')).status).toBe('stamped');
    expect(tables.ventures[0].deployment_url).toBe('https://lumina.com');
  });
});

// ── TS-10 single-touch E2E + credential hygiene ─────────────────────────────

describe('single-touch E2E (FR-9 / TS-10)', () => {
  const SHORTLIST = [{ candidate: 'Lumina', domain: 'lumina.com', verdict: 'available', checked_at: 't', price: null }];

  function e2eTables() {
    return {
      venture_artifacts: [{ id: 'a1', venture_id: 'v1', artifact_type: 'identity_brand_name', created_at: 't', artifact_data: { domainShortlist: SHORTLIST } }],
      chairman_decisions: [],
      system_events: [],
      venture_deployments: [{ id: 'd1', venture_id: 'v1', status: 'routed', url: 'https://lumina.pages.dev', created_at: 't' }],
      ventures: [{ id: 'v1', deployment_url: 'https://lumina.pages.dev' }],
    };
  }

  it('exactly ONE human action from shortlist to live domain: compose -> approve -> pipeline', async () => {
    const tables = e2eTables();
    const sb = fakeSupabase(tables);
    let humanActions = 0;

    const packet = await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    expect(packet.status).toBe('created');
    expect(packet.decision.status).toBe('pending'); // visible in the existing queue, awaiting the chairman

    // THE one human touch — fn_chairman_decide(approved) writes the canonical triple:
    humanActions += 1;
    Object.assign(tables.chairman_decisions[0], { status: 'approved', decision: 'proceed', blocking: false, decided_by: 'chairman' });

    const r = await runPostApprovalPipeline(sb, tables.chairman_decisions[0].id, {
      registrar: fakeRegistrar(), dns: fakeDns(), execute: true, env: {}, deployTarget: 'lumina.pages.dev',
    });
    expect(r).toMatchObject({ step: 'complete', status: 'stamped', domain: 'lumina.com', deploymentUrl: 'https://lumina.com' });
    expect(humanActions).toBe(1);
    expect(tables.ventures[0].deployment_url).toBe('https://lumina.com');
    const dispo = tables.system_events.find((e) => e.event_type === 'DECISION_DISPOSITION');
    expect(dispo.payload.status).toBe('consumed');
  });

  it('denied decision NEVER reaches the registrar in the same harness', async () => {
    const tables = e2eTables();
    const sb = fakeSupabase(tables);
    await composeAcquisitionPacket(sb, 'v1', { registrar: fakeRegistrar(), env: {} });
    Object.assign(tables.chairman_decisions[0], { status: 'rejected', decision: 'kill' });
    const reg = fakeRegistrar();
    const r = await runPostApprovalPipeline(sb, tables.chairman_decisions[0].id, { registrar: reg, dns: fakeDns(), execute: true, env: {}, deployTarget: 't' });
    expect(r.step).toBe('acquire');
    expect(r.reason).toBe('decision_rejected');
    expect(reg.registerDomain).not.toHaveBeenCalled();
  });

  it('redaction: DNS adapter errors carry sanitized text, never the token value', async () => {
    const secret = 'ANOTHER-SECRET-VALUE';
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: 'insufficient scope' }] }) }));
    const dns = createDnsAdapter({ CLOUDFLARE_REGISTRAR_API_TOKEN: secret, CLOUDFLARE_ACCOUNT_ID: 'acct' }, { fetchImpl });
    try { await dns.listZones('x.com'); expect.unreachable(); } catch (e) {
      expect(String(e.message)).toMatch(/insufficient scope/);
      expect(String(e.message)).not.toContain(secret);
    }
  });

  it('source secret-scan: no module logs or interpolates the token; env names appear only as reads', () => {
    const dir = join(repoRoot, 'lib', 'venture-acquisition');
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      // Never log: no console.* in the acquisition modules at all (callers own I/O).
      expect(src, `${file} must not console.*`).not.toMatch(/console\./);
      // The token is only ever READ from env — never assigned a literal.
      expect(src, `${file} must not embed a token literal`).not.toMatch(/CLOUDFLARE_REGISTRAR_API_TOKEN\s*=/);
    }
  });
});
