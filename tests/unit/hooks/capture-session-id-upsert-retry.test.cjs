// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR2): capture-session-id.cjs
// upsertSessionRow retry behavior.
//
// Covers:
//   R-1: single 2xx success on first attempt — no retries
//   R-2: transient 5xx + 2xx — retries until success
//   R-3: abort/timeout error + 2xx — retries
//   R-4: 4xx client error — bails immediately (no retry)
//   R-5: 408/429 retryable 4xx — retries
//   R-6: total failure — swallows error, returns without throw
//   R-7: missing env — no-op, no fetch call
//   R-8: backoff timing — first retry is ~500ms, second ~1500ms

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { upsertSessionRow } = require(path.resolve(__dirname, '../../../scripts/hooks/capture-session-id.cjs'));

// Save + restore env + fetch across tests
let originalFetch;
let originalEnv;

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
}

function teardownTest() {
  global.fetch = originalFetch;
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test('R-1: single 2xx success — no retries', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return { ok: true, status: 201 };
    };
    await upsertSessionRow('test-session-1', 1234, 'test');
    assert.equal(calls, 1);
  } finally {
    teardownTest();
  }
});

test('R-2: transient 503 + 2xx — retries once', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 503 };
      return { ok: true, status: 201 };
    };
    await upsertSessionRow('test-session-2', 1234, 'test');
    assert.equal(calls, 2);
  } finally {
    teardownTest();
  }
});

test('R-3: abort/timeout error then 2xx — retries', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async (_url, opts) => {
      calls++;
      if (calls === 1) {
        // Simulate AbortController timing out
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return { ok: true, status: 201 };
    };
    await upsertSessionRow('test-session-3', 1234, 'test');
    assert.equal(calls, 2);
  } finally {
    teardownTest();
  }
});

test('R-4: 401 client error — bails immediately (no retry)', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return { ok: false, status: 401 };
    };
    await upsertSessionRow('test-session-4', 1234, 'test');
    // 401 is non-retryable 4xx — should stop after 1 call
    assert.equal(calls, 1);
  } finally {
    teardownTest();
  }
});

test('R-5: 429 rate-limited — retries (retryable 4xx)', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 429 };
      return { ok: true, status: 201 };
    };
    await upsertSessionRow('test-session-5', 1234, 'test');
    assert.equal(calls, 3);
  } finally {
    teardownTest();
  }
});

test('R-6: total failure after 3 attempts — swallows error, does not throw', async () => {
  setupTest();
  try {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw new Error('network down');
    };
    // Must NOT throw
    await upsertSessionRow('test-session-6', 1234, 'test');
    assert.equal(calls, 3);
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
    global.fetch = async () => { calls++; return { ok: true, status: 201 }; };
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
    let calls = 0;
    global.fetch = async () => {
      timestamps.push(Date.now());
      calls++;
      throw new Error('always fails');
    };
    await upsertSessionRow('test-session-8', 1234, 'test');
    assert.equal(calls, 3);
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

test('R-9: sends correct payload on each attempt (session_id, status=active, metadata.source)', async () => {
  setupTest();
  try {
    let payload;
    global.fetch = async (_url, opts) => {
      payload = JSON.parse(opts.body);
      return { ok: true, status: 201 };
    };
    await upsertSessionRow('test-session-9', 4321, 'tool-hook');
    assert.equal(payload.session_id, 'test-session-9');
    assert.equal(payload.status, 'active');
    assert.equal(payload.pid, 4321);
    assert.equal(payload.metadata.source, 'tool-hook');
    assert.equal(payload.metadata.cc_pid, 4321);
    assert.ok(payload.heartbeat_at, 'heartbeat_at should be set');
  } finally {
    teardownTest();
  }
});
