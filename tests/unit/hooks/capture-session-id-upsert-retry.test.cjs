// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR2): capture-session-id.cjs
// upsertSessionRow retry behavior.
//
// SD-ALTIFYAI-LEO-FIX-RAW-MODEL-NULL-001: rewritten for the PATCH-first /
// INSERT-if-zero-rows design (replacing the single-POST-with-merge-duplicates
// design that silently 409'd on every write to a pre-existing row since
// 2026-07-01 — RCA agent ad18bd0a3fde5c499, .artifacts/rca259-*.mjs). Every
// upsertSessionRow call now does: 1 GET (existing metadata, unchanged) + 1
// PATCH (attempt to update an existing row) + optionally 1 POST (INSERT
// fallback, only if the PATCH matched zero rows). The mock below is
// method-aware so PATCH vs POST vs GET can return different outcomes.
//
// Covers:
//   R-1: PATCH matches existing row on first attempt — no INSERT, no retries
//   R-2: transient 503 on PATCH + 2xx PATCH-match — retries until success
//   R-3: abort/timeout error + 2xx PATCH-match — retries
//   R-4: 4xx client error on PATCH — bails immediately (no retry)
//   R-5: 408/429 retryable 4xx on PATCH — retries
//   R-6: total failure — swallows error, returns without throw
//   R-7: missing env — no-op, no fetch call
//   R-8: backoff timing — first retry is ~500ms, second ~1500ms
//   R-9: sends correct PATCH payload (no status key, correct metadata)
//   TS-1/TS-2: PATCH-zero-rows falls back to INSERT; INSERT succeeds
//   TS-3: PATCH body never contains a `status` key
//   TS-4: a 4xx response (PATCH or INSERT-fallback) is logged loudly (not debug-gated)
//   TS-5: existing metadata keys survive the write (merge preserved)

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { upsertSessionRow } = require(path.resolve(__dirname, '../../../scripts/hooks/capture-session-id.cjs'));

// Save + restore env + fetch + console.error across tests
let originalFetch;
let originalEnv;
let originalConsoleError;
let stderrLines;

function setupTest() {
  originalFetch = global.fetch;
  originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    LEO_TELEMETRY_DEBUG: process.env.LEO_TELEMETRY_DEBUG,
  };
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  // Suppress debug logging in tests by default
  process.env.LEO_TELEMETRY_DEBUG = '';
  stderrLines = [];
  originalConsoleError = console.error;
  console.error = (...args) => { stderrLines.push(args.join(' ')); };
}

function teardownTest() {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

// A GET mock that always fails open (no existing metadata) — mirrors production
// fail-open behavior and keeps the GET call out of the assertions below.
function jsonRes(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('R-1: PATCH matches existing row — no INSERT fallback, no retries', async () => {
  setupTest();
  try {
    const calls = [];
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      calls.push(method);
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') return jsonRes(200, [{ session_id: 'test-session-1' }]);
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-1', 1234, 'test');
    assert.deepEqual(calls, ['GET', 'PATCH']);
  } finally {
    teardownTest();
  }
});

test('R-2: transient 503 on PATCH + 2xx PATCH-match — retries once', async () => {
  setupTest();
  try {
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') {
        patchCalls++;
        if (patchCalls === 1) return jsonRes(503, null);
        return jsonRes(200, [{ session_id: 'test-session-2' }]);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-2', 1234, 'test');
    assert.equal(patchCalls, 2);
  } finally {
    teardownTest();
  }
});

test('R-3: abort/timeout error then 2xx PATCH-match — retries', async () => {
  setupTest();
  try {
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') {
        patchCalls++;
        if (patchCalls === 1) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        return jsonRes(200, [{ session_id: 'test-session-3' }]);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-3', 1234, 'test');
    assert.equal(patchCalls, 2);
  } finally {
    teardownTest();
  }
});

test('R-4: 401 client error on PATCH — bails immediately (no retry, no INSERT)', async () => {
  setupTest();
  try {
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') { patchCalls++; return jsonRes(401, { message: 'unauthorized' }); }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-4', 1234, 'test');
    // 401 is non-retryable 4xx — should stop after 1 PATCH call
    assert.equal(patchCalls, 1);
  } finally {
    teardownTest();
  }
});

test('R-5: 429 rate-limited on PATCH — retries (retryable 4xx)', async () => {
  setupTest();
  try {
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') {
        patchCalls++;
        if (patchCalls < 3) return jsonRes(429, null);
        return jsonRes(200, [{ session_id: 'test-session-5' }]);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-5', 1234, 'test');
    assert.equal(patchCalls, 3);
  } finally {
    teardownTest();
  }
});

test('R-6: total PATCH failure after 3 attempts — swallows error, does not throw', async () => {
  setupTest();
  try {
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') { patchCalls++; throw new Error('network down'); }
      throw new Error(`unexpected ${method} call`);
    };
    // Must NOT throw
    await upsertSessionRow('test-session-6', 1234, 'test');
    assert.equal(patchCalls, 3);
  } finally {
    teardownTest();
  }
});

test('R-7: missing env vars — no-op, no fetch call', async () => {
  setupTest();
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    let calls = 0;
    global.fetch = async () => { calls++; return jsonRes(200, []); };
    await upsertSessionRow('test-session-7', 1234, 'test');
    assert.equal(calls, 0);
  } finally {
    teardownTest();
  }
});

test('R-8: backoff timing — second attempt waits ≥400ms, third ≥1400ms (relaxed to allow scheduling jitter)', async () => {
  setupTest();
  try {
    const timestamps = [];
    let patchCalls = 0;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') {
        timestamps.push(Date.now());
        patchCalls++;
        throw new Error('always fails');
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-8', 1234, 'test');
    assert.equal(patchCalls, 3);
    // Attempt 2 should be ≥~500ms after attempt 1 (allow 400ms floor for timer jitter)
    const delta12 = timestamps[1] - timestamps[0];
    assert.ok(delta12 >= 400, `attempt 2 came after ${delta12}ms, expected ≥400ms`);
    // Attempt 3 should be ≥~1500ms after attempt 2
    const delta23 = timestamps[2] - timestamps[1];
    assert.ok(delta23 >= 1400, `attempt 3 came after ${delta23}ms, expected ≥1400ms`);
  } finally {
    teardownTest();
  }
});

test('R-9: sends correct PATCH payload (no status key, correct metadata fields)', async () => {
  setupTest();
  try {
    let patchPayload;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') {
        patchPayload = JSON.parse(opts.body);
        return jsonRes(200, [{ session_id: 'test-session-9' }]);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-9', 4321, 'tool-hook');
    assert.equal(patchPayload.pid, 4321);
    assert.equal(patchPayload.metadata.source, 'tool-hook');
    assert.equal(patchPayload.metadata.cc_pid, 4321);
    assert.ok(patchPayload.heartbeat_at, 'heartbeat_at should be set');
    assert.equal(patchPayload.session_id, undefined, 'PATCH body should not carry session_id (it is the URL filter)');
    assert.equal(patchPayload.status, undefined, 'PATCH body must never contain status (FR-3: never resurrect a released/idle row)');
  } finally {
    teardownTest();
  }
});

test('TS-1/TS-2: PATCH matches zero rows — falls back to INSERT with status=active', async () => {
  setupTest();
  try {
    const calls = [];
    let insertPayload;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      calls.push(method);
      if (method === 'GET') return jsonRes(200, []);
      if (method === 'PATCH') return jsonRes(200, []); // 0 rows matched
      if (method === 'POST') {
        insertPayload = JSON.parse(opts.body);
        return jsonRes(201, null);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-new', 5555, 'startup');
    assert.deepEqual(calls, ['GET', 'PATCH', 'POST']);
    assert.equal(insertPayload.session_id, 'test-session-new');
    assert.equal(insertPayload.status, 'active');
  } finally {
    teardownTest();
  }
});

test('TS-4a: a 4xx PATCH response is logged loudly (not debug-gated)', async () => {
  setupTest();
  try {
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: {} }]);
      if (method === 'PATCH') return jsonRes(422, { message: 'bad request' });
      throw new Error(`unexpected ${method} call`);
    };
    // LEO_TELEMETRY_DEBUG is '' (disabled) via setupTest — the loud log must fire anyway.
    await upsertSessionRow('test-session-loud', 1234, 'test');
    assert.ok(
      stderrLines.some((l) => l.includes('4xx') && l.includes('422')),
      `expected a loud 4xx log line, got: ${JSON.stringify(stderrLines)}`
    );
  } finally {
    teardownTest();
  }
});

test('TS-4b: a 4xx INSERT-fallback response is logged loudly (not debug-gated)', async () => {
  setupTest();
  try {
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, []);
      if (method === 'PATCH') return jsonRes(200, []); // 0 rows matched -> fallback
      if (method === 'POST') return jsonRes(422, { message: 'bad insert' });
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-loud2', 1234, 'test');
    assert.ok(
      stderrLines.some((l) => l.includes('4xx') && l.includes('422')),
      `expected a loud 4xx log line, got: ${JSON.stringify(stderrLines)}`
    );
  } finally {
    teardownTest();
  }
});

test('TS-5: existing metadata keys survive the PATCH (no clobber)', async () => {
  setupTest();
  try {
    let patchPayload;
    global.fetch = async (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method === 'GET') return jsonRes(200, [{ metadata: { callsign: 'Hotel-5', fleet_identity: { color: 'pink' } } }]);
      if (method === 'PATCH') {
        patchPayload = JSON.parse(opts.body);
        return jsonRes(200, [{ session_id: 'test-session-merge' }]);
      }
      throw new Error(`unexpected ${method} call`);
    };
    await upsertSessionRow('test-session-merge', 1234, 'test');
    assert.equal(patchPayload.metadata.callsign, 'Hotel-5');
    assert.deepEqual(patchPayload.metadata.fleet_identity, { color: 'pink' });
  } finally {
    teardownTest();
  }
});
