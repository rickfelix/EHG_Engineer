import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { buildStripeSignatureHeader, buildEventRawBody } from '../../../lib/test-helpers/stripe-signature.js';

/**
 * End-to-end wiring proof for SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001.
 *
 * Unlike tests/integration/payments/webhook-capture.test.js (which calls
 * handleStripeWebhook directly, bypassing Express entirely), this test boots
 * the REAL server entrypoint (server/index.js) as a child process and drives
 * real HTTP requests through it — proving both webhook routes are actually
 * mounted, and that the Stripe route's express.raw() middleware is correctly
 * ordered ahead of the global express.json() parser in the running app.
 */
const TEST_PORT = 34519;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const WHSEC = 'whsec_test_wiring_e2e';
const RUN = 'evt_wiring_e2e_' + Date.now();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

let child;

let bootOutput = '';

async function waitForServer(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Stripe route rejects GET with 405 — reachable at all == server is up
      // AND the route is registered (not a generic 404 catch-all).
      const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, { method: 'GET' });
      if (res.status === 405) return;
    } catch {
      // ECONNREFUSED while booting — keep polling
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not become ready on port ${TEST_PORT} within ${timeoutMs}ms. Boot output:\n${bootOutput}`);
}

async function countRows(eventId) {
  const { count } = await sb
    .from('ops_payment_events')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_event_id', eventId);
  return count || 0;
}

beforeAll(async () => {
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      STRIPE_WEBHOOK_SECRET: WHSEC,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
        ? process.env.STRIPE_SECRET_KEY
        : 'sk_test_wiring_e2e_dummy',
      // Exercises github-ci-status.js's documented dev-mode signature bypass
      // (api/webhooks/github-ci-status.js:300) so the wiring test does not
      // need a live ci_cd_monitoring_config row to prove reachability.
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { bootOutput += d.toString(); });
  child.stderr.on('data', (d) => { bootOutput += d.toString(); });
  await waitForServer();
}, 50000);

afterAll(async () => {
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
  await sb.from('ops_payment_events').delete().like('stripe_event_id', RUN + '%');
});

describe('Webhook route mounting (real Express app, real HTTP)', () => {
  it('FR-1/FR-4: a validly-signed Stripe event reaches handleStripeWebhook with the raw body intact and is captured', async () => {
    const id = RUN + '_valid';
    const body = buildEventRawBody({ id });
    const sig = buildStripeSignatureHeader(body, WHSEC);

    const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
      body,
    });

    expect(res.status).toBe(200);
    expect(await countRows(id)).toBe(1);
  });

  it('FR-1/FR-4: an invalid signature is rejected with 400 — proves the raw body reached the handler unmodified', async () => {
    const id = RUN + '_invalid';
    const body = buildEventRawBody({ id });

    const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
      body,
    });

    expect(res.status).toBe(400);
    expect(await countRows(id)).toBe(0);
  });

  it('FR-2/FR-3: github-ci-status route is mounted and reachable (not 404) after the ESM conversion', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/github-ci-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-github-event': 'check_suite' },
      body: JSON.stringify({ repository: { full_name: 'rickfelix/wiring-e2e-nonexistent' }, check_suite: { conclusion: 'success' } }),
    });

    // Reachability is the contract here: a 404 would mean the route is
    // unmounted. Any other status proves the request reached handleGitHubWebhook.
    expect(res.status).not.toBe(404);
  });

  it('non-POST to the Stripe route returns 405 (proves the handler, not a generic router, answered)', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/stripe`, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});
