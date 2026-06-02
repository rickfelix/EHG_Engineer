import { describe, it, expect } from 'vitest';
import {
  isContractCompatible,
  buildOkRow,
  pullVenture,
  persistResult,
  main,
  EXPECTED_CONTRACT_MAJOR,
  validateKpis,
  deriveVenturePortfolio,
} from '../../scripts/venture-telemetry-pull.mjs';

const NOW = new Date('2026-05-29T06:00:00.000Z');

const APP = {
  id: 'app-uuid-1',
  name: 'CronGenius',
  venture_id: 'venture-uuid-1',
  kind: 'venture',
  status: 'active',
  metrics_base_url: 'https://crongenius.example.workers.dev',
  metrics_api_key_ref: 'CRONGENIUS_METRICS_API_KEY',
};

const VALID_PAYLOAD = {
  contract_version: '1.0',
  window_days: 7,
  since: '2026-05-22T06:00:00.000Z',
  generated_at: NOW.toISOString(),
  total: 42,
  by_verdict: { valid: 30, invalid: 8, not_applicable: 4 },
  by_mode: { nl_to_cron: 40, cron_to_nl: 2 },
  by_model: { 'deterministic-v1': 42 },
  avg_confidence: 0.91,
  dry_run_count: 3,
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('isContractCompatible', () => {
  it('accepts the same major version, rejects others/missing', () => {
    expect(EXPECTED_CONTRACT_MAJOR).toBe('1');
    expect(isContractCompatible('1.0')).toBe(true);
    expect(isContractCompatible('1.7')).toBe(true);
    expect(isContractCompatible('2.0')).toBe(false);
    expect(isContractCompatible(undefined)).toBe(false);
    expect(isContractCompatible('')).toBe(false);
    expect(isContractCompatible(null)).toBe(false);
  });
});

describe('buildOkRow', () => {
  it('maps the MetricsAggregate contract into the telemetry row', () => {
    const row = buildOkRow(APP, VALID_PAYLOAD, { httpStatus: 200, sourceUrl: 'u' }, NOW);
    expect(row.application_id).toBe('app-uuid-1');
    expect(row.venture_id).toBe('venture-uuid-1');
    expect(row.ingest_status).toBe('ok');
    expect(row.total).toBe(42);
    expect(row.by_verdict).toEqual({ valid: 30, invalid: 8, not_applicable: 4 });
    expect(row.contract_version).toBe('1.0');
    // FR-2: raw_payload is no longer the verbatim payload — it is a SANITIZED snapshot of
    // recognized contract fields + the validated KPI subset (here no kpis block -> {}).
    expect(row.raw_payload).toEqual({
      contract_version: '1.0', window_days: 7, since: VALID_PAYLOAD.since,
      generated_at: VALID_PAYLOAD.generated_at, total: 42,
      by_verdict: { valid: 30, invalid: 8, not_applicable: 4 },
      by_mode: { nl_to_cron: 40, cron_to_nl: 2 }, by_model: { 'deterministic-v1': 42 },
      avg_confidence: 0.91, dry_run_count: 3, kpis: {},
    });
    expect(row.kpis).toEqual({});
    expect(row.pulled_at).toBe(NOW.toISOString());
  });
});

// SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001 (FR-1/FR-2): product-KPI allowlist + data-minimization.
describe('validateKpis — allowlist + type/range, drops everything else', () => {
  it('keeps allowlisted, type/range-valid aggregates', () => {
    const { kpis, dropped } = validateKpis({ signups: 120, active_users: 80, revenue: 4200.5, usage_volume: 1e6, health: 0.98, churn: 0.03 });
    expect(kpis).toEqual({ signups: 120, active_users: 80, revenue: 4200.5, usage_volume: 1e6, health: 0.98, churn: 0.03 });
    expect(dropped).toEqual([]);
  });

  it('drops unknown / non-allowlisted keys (e.g. PII, raw rows)', () => {
    const { kpis, dropped } = validateKpis({ signups: 10, email: 'a@b.com', rows: [{ id: 1 }], customer_name: 'Acme' });
    expect(kpis).toEqual({ signups: 10 });
    expect(dropped.sort()).toEqual(['customer_name', 'email', 'rows']);
  });

  it('drops malformed values that fail type/range assertions', () => {
    const { kpis, dropped } = validateKpis({ signups: 'lots', churn: 1.7, revenue: -5, active_users: 3.5, health: { nested: true } });
    expect(kpis).toEqual({}); // signups non-int, churn>1, revenue<0, active_users non-int, health non-number
    expect(dropped.sort()).toEqual(['active_users', 'churn', 'health', 'revenue', 'signups']);
  });

  it('returns empty for a missing / non-object kpis block (never throws)', () => {
    expect(validateKpis(undefined)).toEqual({ kpis: {}, dropped: [] });
    expect(validateKpis(null)).toEqual({ kpis: {}, dropped: [] });
    expect(validateKpis([1, 2, 3])).toEqual({ kpis: {}, dropped: [] });
    expect(validateKpis('nope')).toEqual({ kpis: {}, dropped: [] });
  });
});

describe('buildOkRow — persists ONLY the validated KPI subset (no verbatim passthrough)', () => {
  it('stores allowlisted KPIs and drops an injected raw/PII field', () => {
    const payload = { ...VALID_PAYLOAD, kpis: { signups: 50, revenue: 999, churn: 0.1, secret_email: 'leak@x.com' } };
    const row = buildOkRow(APP, payload, { httpStatus: 200, sourceUrl: 'u' }, NOW);
    expect(row.kpis).toEqual({ signups: 50, revenue: 999, churn: 0.1 }); // secret_email dropped
    expect(row.raw_payload.kpis).toEqual({ signups: 50, revenue: 999, churn: 0.1 });
    // The injected raw/PII field never appears anywhere in the persisted row.
    expect(JSON.stringify(row)).not.toContain('secret_email');
    expect(JSON.stringify(row)).not.toContain('leak@x.com');
  });

  it('drops TOP-LEVEL junk/PII keys (allowlist-by-construction, not blocklist)', () => {
    const payload = { ...VALID_PAYLOAD, pii_dump: { ssn: '123-45-6789' }, api_key: 'sk-leak', customer_records: [{ email: 'a@b.com' }] };
    const row = buildOkRow(APP, payload, { httpStatus: 200, sourceUrl: 'u' }, NOW);
    const blob = JSON.stringify(row);
    expect(blob).not.toContain('pii_dump');
    expect(blob).not.toContain('api_key');
    expect(blob).not.toContain('sk-leak');
    expect(blob).not.toContain('customer_records');
    // raw_payload is rebuilt from a FIXED named field set — only recognized contract keys + kpis.
    expect(Object.keys(row.raw_payload).sort()).toEqual([
      'avg_confidence', 'by_mode', 'by_model', 'by_verdict', 'contract_version',
      'dry_run_count', 'generated_at', 'kpis', 'since', 'total', 'window_days',
    ]);
  });
});

describe('deriveVenturePortfolio — maps KPIs onto EXISTING ventures columns (no parallel fields)', () => {
  it('derives health_score / projected_revenue / risk_score from KPIs', () => {
    expect(deriveVenturePortfolio({ health: 0.95, revenue: 1000, churn: 0.2, signups: 5 }))
      .toEqual({ health_score: 0.95, projected_revenue: 1000, risk_score: 0.2 });
  });
  it('returns only derivable columns (omits absent KPIs)', () => {
    expect(deriveVenturePortfolio({ signups: 5 })).toEqual({});
    expect(deriveVenturePortfolio()).toEqual({});
  });
});

describe('pullVenture — one-way GET + fail-soft classification', () => {
  it('OK: valid versioned payload -> outcome ok with the full row', async () => {
    const calls = [];
    const fetchFn = (url, opts) => { calls.push({ url, opts }); return Promise.resolve(jsonResponse(200, VALID_PAYLOAD)); };
    const res = await pullVenture(APP, { fetchFn, env: { CRONGENIUS_METRICS_API_KEY: 'secret' }, now: NOW });
    expect(res.outcome).toBe('ok');
    expect(res.okRow.total).toBe(42);
    // ONE-WAY: exactly one outbound call, a GET to /v1/metrics with Bearer auth, no body.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://crongenius.example.workers.dev/v1/metrics');
    expect(calls[0].opts.method).toBe('GET');
    expect(calls[0].opts.body).toBeUndefined();
    expect(calls[0].opts.headers.authorization).toBe('Bearer secret');
  });

  it('skips when no metrics_base_url is configured (no fetch at all)', async () => {
    let called = 0;
    const res = await pullVenture({ ...APP, metrics_base_url: null }, { fetchFn: () => { called++; }, env: {}, now: NOW });
    expect(res.outcome).toBe('skipped');
    expect(called).toBe(0);
    expect(res.meta.ingest_status).toBe('skipped');
  });

  it('skips when the api key ref cannot be resolved from env', async () => {
    let called = 0;
    const res = await pullVenture(APP, { fetchFn: () => { called++; }, env: {}, now: NOW });
    expect(res.outcome).toBe('skipped');
    expect(called).toBe(0);
  });

  it('version_mismatch on an unsupported contract_version (no metric overwrite)', async () => {
    const fetchFn = () => Promise.resolve(jsonResponse(200, { ...VALID_PAYLOAD, contract_version: '2.0' }));
    const res = await pullVenture(APP, { fetchFn, env: { CRONGENIUS_METRICS_API_KEY: 'secret' }, now: NOW });
    expect(res.outcome).toBe('version_mismatch');
    expect(res.meta.total).toBeUndefined(); // metadata-only; no metric columns to clobber a prior row
  });

  it('error on non-200', async () => {
    const fetchFn = () => Promise.resolve(jsonResponse(503, {}));
    const res = await pullVenture(APP, { fetchFn, env: { CRONGENIUS_METRICS_API_KEY: 'secret' }, now: NOW });
    expect(res.outcome).toBe('error');
    expect(res.meta.http_status).toBe(503);
  });

  it('error (never throws) when fetch rejects', async () => {
    const fetchFn = () => Promise.reject(new Error('ECONNREFUSED'));
    const res = await pullVenture(APP, { fetchFn, env: { CRONGENIUS_METRICS_API_KEY: 'secret' }, now: NOW });
    expect(res.outcome).toBe('error');
    expect(res.meta.ingest_note).toContain('ECONNREFUSED');
  });
});

describe('persistResult — fail soft never clobbers a prior good rollup', () => {
  function fakeDb({ updateReturns }) {
    const ops = [];
    return {
      ops,
      from(table) {
        return {
          upsert(row, opts) { ops.push({ op: 'upsert', table, row, opts }); return Promise.resolve({ error: null }); },
          update(row) { ops.push({ op: 'update', table, row }); return { eq() { return { select() { return Promise.resolve({ data: updateReturns, error: null }); } }; } }; },
          insert(row) { ops.push({ op: 'insert', table, row }); return Promise.resolve({ error: null }); },
        };
      },
    };
  }

  it('ok -> full upsert by application_id', async () => {
    const db = fakeDb({ updateReturns: [] });
    await persistResult(db, APP, { outcome: 'ok', okRow: buildOkRow(APP, VALID_PAYLOAD, { httpStatus: 200, sourceUrl: 'u' }, NOW) });
    expect(db.ops).toEqual([{ op: 'upsert', table: 'venture_telemetry', row: expect.objectContaining({ application_id: 'app-uuid-1', total: 42 }), opts: { onConflict: 'application_id' } }]);
  });

  it('failure WITH a prior row -> updates metadata only (no upsert, no insert)', async () => {
    const db = fakeDb({ updateReturns: [{ id: 'existing' }] });
    await persistResult(db, APP, { outcome: 'version_mismatch', meta: { application_id: APP.id, ingest_status: 'version_mismatch' } });
    const opNames = db.ops.map(o => o.op);
    expect(opNames).toEqual(['update']);            // metric columns preserved
    expect(opNames).not.toContain('upsert');
    expect(opNames).not.toContain('insert');
  });

  it('failure with NO prior row -> inserts a metadata marker', async () => {
    const db = fakeDb({ updateReturns: [] });
    await persistResult(db, APP, { outcome: 'skipped', meta: { application_id: APP.id, ingest_status: 'skipped' } });
    expect(db.ops.map(o => o.op)).toEqual(['update', 'insert']);
  });
});

describe('main — lists active ventures, one-way writes only to venture_telemetry', () => {
  function fakeDb({ ventures }) {
    const ops = [];
    const tablesTouched = new Set();
    return {
      ops,
      tablesTouched,
      from(table) {
        tablesTouched.add(table);
        if (table === 'applications') {
          const chain = { select() { return chain; }, eq() { return chain; }, then(resolve) { resolve({ data: ventures, error: null }); } };
          return chain;
        }
        return {
          upsert(row, opts) { ops.push({ op: 'upsert', table, row }); return Promise.resolve({ error: null }); },
          update(row) { ops.push({ op: 'update', table, row }); return { eq() { return { select() { return Promise.resolve({ data: [{ id: 'x' }], error: null }); } }; } }; },
          insert(row) { ops.push({ op: 'insert', table, row }); return Promise.resolve({ error: null }); },
        };
      },
    };
  }

  it('processes ventures, summarizes, and only ever touches applications (read) + venture_telemetry (write)', async () => {
    const db = fakeDb({ ventures: [APP, { ...APP, id: 'app-2', name: 'NoEndpoint', metrics_base_url: null }] });
    const fetchFn = () => Promise.resolve(jsonResponse(200, VALID_PAYLOAD));
    const summary = await main({ supabase: db, env: { CRONGENIUS_METRICS_API_KEY: 'secret' }, fetchFn, now: NOW });
    expect(summary).toMatchObject({ total: 2, ok: 1, skipped: 1 });
    // ONE-WAY: no table other than applications + venture_telemetry is ever accessed.
    expect([...db.tablesTouched].sort()).toEqual(['applications', 'venture_telemetry']);
    // The OK venture got a full upsert; the no-endpoint one got metadata update (existing row).
    expect(db.ops.find(o => o.op === 'upsert')?.row.application_id).toBe('app-uuid-1');
  });
});
