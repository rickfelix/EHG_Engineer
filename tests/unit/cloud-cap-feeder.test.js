/**
 * cloud-cap feeder unit tests — SD-LEO-INFRA-CLOUD-CAP-LIVE-FEEDER-001.
 * Pure helpers + feedCloudHealth via INJECTED fake Anthropic client + fake supabase.
 * ZERO live Anthropic calls, ZERO live DB writes.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  categorizeProbeError, computeP95, summarizeBatch, computeNextHealthState,
  runProbeBatch, feedCloudHealth,
} from '../../scripts/continuity/cloud-cap-feeder.mjs';

const errWith = (props) => Object.assign(new Error(props.message || 'probe error'), props);

describe('categorizeProbeError', () => {
  it('429 -> rate_limit', () => expect(categorizeProbeError(errWith({ status: 429 }))).toBe('rate_limit'));
  it('529 / overloaded_error -> overloaded (status + the SDK err.type discriminator)', () => {
    expect(categorizeProbeError(errWith({ status: 529 }))).toBe('overloaded');
    expect(categorizeProbeError(errWith({ type: 'overloaded_error' }))).toBe('overloaded');
  });
  it('5xx -> server', () => expect(categorizeProbeError(errWith({ status: 503 }))).toBe('server'));
  it('REAL Anthropic timeout shapes -> timeout (constructor.name, "Request timed out." message, undici cause)', () => {
    // The real Anthropic.APIConnectionTimeoutError has err.name==='Error', message==='Request timed out.',
    // and no .code — only the CONSTRUCTOR name is distinctive. Cover all three real discriminators.
    class APIConnectionTimeoutError extends Error {}
    expect(categorizeProbeError(new APIConnectionTimeoutError('boom'))).toBe('timeout'); // constructor.name path
    expect(categorizeProbeError(Object.assign(new Error('Request timed out.'), { name: 'Error' }))).toBe('timeout'); // real message ("timed out")
    expect(categorizeProbeError(Object.assign(new Error('x'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }))).toBe('timeout'); // undici connect-timeout cause
    expect(categorizeProbeError(errWith({ code: 'ETIMEDOUT' }))).toBe('timeout');
  });
  it('4xx config (401/400) -> other (NOT a cap signal — never false-PAUSE on a bad key)', () => {
    expect(categorizeProbeError(errWith({ status: 401 }))).toBe('other');
    expect(categorizeProbeError(errWith({ status: 400 }))).toBe('other');
  });
});

describe('computeP95', () => {
  it('null on empty', () => expect(computeP95([])).toBeNull());
  it('p95 of 10 sorted values', () => expect(computeP95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])).toBe(100));
  it('single value', () => expect(computeP95([42])).toBe(42));
});

describe('summarizeBatch', () => {
  it('counts cap failures vs other; error_rate over total; p95 over ok latencies', () => {
    const s = summarizeBatch([
      { ok: true, latencyMs: 100 }, { ok: false, category: 'rate_limit' }, { ok: false, category: 'server' },
      { ok: false, category: 'other' }, { ok: true, latencyMs: 200 },
    ]);
    expect(s.total).toBe(5);
    expect(s.capFailures).toBe(2);
    expect(s.otherErrors).toBe(1);
    expect(s.errorRate).toBe(0.4);
    expect(s.p95LatencyMs).toBe(200);
  });
  it('all healthy -> error_rate 0', () => expect(summarizeBatch([{ ok: true, latencyMs: 50 }]).errorRate).toBe(0));
  it('empty -> null error_rate', () => expect(summarizeBatch([]).errorRate).toBeNull());
});

describe('computeNextHealthState', () => {
  it('bad batch -> rolling + consecutive_failures++ (baseline untouched)', () => {
    const n = computeNextHealthState({ error_rate_threshold: 0.05, consecutive_failures: 2, baseline_latency_p95_ms: 100 }, { errorRate: 0.4, p95LatencyMs: 300 });
    expect(n.status).toBe('rolling');
    expect(n.consecutive_failures).toBe(3);
    expect(n.current_error_rate).toBe(0.4);
    expect(n.baseline_latency_p95_ms).toBe(100);
  });
  it('healthy batch -> paused + reset; stamps baseline once when null', () => {
    const n = computeNextHealthState({ error_rate_threshold: 0.05, consecutive_failures: 5, baseline_latency_p95_ms: null }, { errorRate: 0, p95LatencyMs: 120 });
    expect(n.status).toBe('paused');
    expect(n.consecutive_failures).toBe(0);
    expect(n.baseline_latency_p95_ms).toBe(120);
  });
  it('never overwrites an existing baseline', () => {
    expect(computeNextHealthState({ baseline_latency_p95_ms: 90 }, { errorRate: 0, p95LatencyMs: 500 }).baseline_latency_p95_ms).toBe(90);
  });
  it('null prev -> defaults (threshold 0.05); bad batch rolling+1', () => {
    const n = computeNextHealthState(null, { errorRate: 0.9, p95LatencyMs: null });
    expect(n.status).toBe('rolling');
    expect(n.consecutive_failures).toBe(1);
  });
});

describe('runProbeBatch (injected fake client; no real calls)', () => {
  const noSleep = async () => {}; // inject so jitter/backoff pass zero real time

  it('records ok/latency, categorizes failures, calls list() per probe (maxRetries:0 = no retry)', async () => {
    let i = 0;
    const client = { models: { list: vi.fn(async () => { i++; if (i === 2) throw errWith({ status: 429 }); return { data: [] }; }) } };
    let t = 0; const nowFn = () => (t += 50);
    const results = await runProbeBatch({ client, count: 3, nowFn, maxRetries: 0, sleepFn: noSleep });
    expect(results).toHaveLength(3);
    expect(results[0].ok).toBe(true);
    expect(results[1]).toEqual({ ok: false, category: 'rate_limit' });
    expect(results[2].ok).toBe(true);
    expect(client.models.list).toHaveBeenCalledTimes(3);
  });

  it('retries a TRANSIENT (429) blip with backoff and resolves it to OK (D2)', async () => {
    let i = 0;
    // First probe hits 429 once, then succeeds on retry -> should record ok, not a failure.
    const client = { models: { list: vi.fn(async () => { i++; if (i === 1) throw errWith({ status: 429 }); return { data: [] }; }) } };
    const sleeps = [];
    const results = await runProbeBatch({ client, count: 2, nowFn: () => 0, maxRetries: 2, backoffBaseMs: 250, jitterMs: 0, sleepFn: async (ms) => { sleeps.push(ms); }, randFn: () => 0 });
    expect(results.every((r) => r.ok)).toBe(true);        // blip recovered -> no failure counted
    expect(client.models.list).toHaveBeenCalledTimes(3);  // probe0: 429 + retry; probe1: ok
    expect(sleeps).toContain(250);                         // exponential backoff base applied on retry
  });

  it('does NOT retry a config error (401 -> other) and records the failure', async () => {
    const client = { models: { list: vi.fn(async () => { throw errWith({ status: 401 }); }) } };
    const results = await runProbeBatch({ client, count: 1, nowFn: () => 0, maxRetries: 2, sleepFn: async () => {}, randFn: () => 0 });
    expect(results[0]).toEqual({ ok: false, category: 'other' });
    expect(client.models.list).toHaveBeenCalledTimes(1);  // no retry on non-cap error
  });

  it('exhausts retries on a SUSTAINED transient error and records the failure', async () => {
    const client = { models: { list: vi.fn(async () => { throw errWith({ status: 429 }); }) } };
    const results = await runProbeBatch({ client, count: 1, nowFn: () => 0, maxRetries: 2, jitterMs: 0, sleepFn: async () => {}, randFn: () => 0 });
    expect(results[0]).toEqual({ ok: false, category: 'rate_limit' });
    expect(client.models.list).toHaveBeenCalledTimes(3);  // initial + 2 retries, then recorded
  });

  it('applies inter-probe jitter between probes', async () => {
    const client = { models: { list: async () => ({ data: [] }) } };
    const sleeps = [];
    await runProbeBatch({ client, count: 3, nowFn: () => 0, maxRetries: 0, jitterMs: 100, sleepFn: async (ms) => { sleeps.push(ms); }, randFn: () => 0.5 });
    expect(sleeps).toEqual([50, 50]); // one jitter sleep before each probe after the first (floor(0.5*100))
  });
});

function fakeSupabase(prev, { writeError = null } = {}) {
  let captured = null;
  const api = {
    from() { return api; },
    select() { return api; },
    eq() { return api; },
    maybeSingle: async () => ({ data: prev, error: null }),
    update(payload) { captured = payload; return { eq: async () => ({ error: writeError }) }; },
    captured: () => captured,
  };
  return api;
}

describe('feedCloudHealth (fake client + fake supabase, ZERO live calls/writes)', () => {
  it('mixed-429 batch -> error_rate>0, status rolling, consecutive_failures++', async () => {
    const sb = fakeSupabase({ error_rate_threshold: 0.05, consecutive_failures: 0, baseline_latency_p95_ms: null });
    let i = 0;
    const client = { models: { list: async () => { i++; if (i % 2 === 0) throw errWith({ status: 429 }); return { data: [] }; } } };
    let t = 0;
    const { summary, update } = await feedCloudHealth({ supabase: sb, client, nowFn: () => (t += 10), nowIso: () => '2026-06-14T00:00:00Z', probeCount: 4, maxRetries: 0, sleepFn: async () => {} });
    expect(summary.capFailures).toBe(2);
    expect(update.status).toBe('rolling');
    expect(update.consecutive_failures).toBe(1);
    expect(update.current_error_rate).toBe(0.5);
    expect(update.last_quality_check_at).toBe('2026-06-14T00:00:00Z');
    expect(sb.captured().status).toBe('rolling');
  });
  it('all-healthy batch -> status paused, consecutive_failures reset to 0', async () => {
    const sb = fakeSupabase({ error_rate_threshold: 0.05, consecutive_failures: 3, baseline_latency_p95_ms: null });
    const client = { models: { list: async () => ({ data: [] }) } };
    let t = 0;
    const { update } = await feedCloudHealth({ supabase: sb, client, nowFn: () => (t += 10), nowIso: () => 'T', probeCount: 3, maxRetries: 0, sleepFn: async () => {} });
    expect(update.status).toBe('paused');
    expect(update.consecutive_failures).toBe(0);
  });
  it('read error -> fail-loud throw (no probe, no write)', async () => {
    const list = vi.fn(async () => ({ data: [] }));
    const sb = { from() { return sb; }, select() { return sb; }, eq() { return sb; }, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(feedCloudHealth({ supabase: sb, client: { models: { list } } })).rejects.toThrow(/read failed/i);
    expect(list).not.toHaveBeenCalled();
  });
});
