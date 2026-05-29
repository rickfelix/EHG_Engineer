import { describe, it, expect } from 'vitest';
import {
  isContractCompatible,
  buildOkRow,
  pullVenture,
  persistResult,
  main,
  EXPECTED_CONTRACT_MAJOR,
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
    expect(row.raw_payload).toEqual(VALID_PAYLOAD);
    expect(row.pulled_at).toBe(NOW.toISOString());
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
