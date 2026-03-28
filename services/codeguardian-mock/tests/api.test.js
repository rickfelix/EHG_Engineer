import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// Dynamically import to avoid port conflicts
let app, server;

function makeRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${server.address().port}`);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname, headers: { 'Content-Type': 'application/json', ...headers } };
    const req = createServer === createServer ? require('node:http').request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }) : null;
    // Simplified: use fetch since we're on Node 20+
    reject(new Error('Use fetch'));
  });
}

async function req(method, path, body, headers = {}) {
  const port = server.address().port;
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

const VALID_WEBHOOK = {
  action: 'opened',
  pull_request: { number: 42, title: 'Test PR' },
  repository: { full_name: 'test/repo' }
};

const WEBHOOK_HEADERS = {
  'x-github-event': 'pull_request',
  'x-github-delivery': 'test-delivery-123'
};

before(async () => {
  // Set test port to 0 for random available port
  process.env.MOCK_PORT = '0';
  const mod = await import('../src/index.js');
  app = mod.app;
  server = mod.server;
});

after(() => {
  server?.close();
});

describe('Health Check', () => {
  it('returns ok status', async () => {
    const res = await req('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.version);
  });
});

describe('Webhook - POST /webhooks/github', () => {
  it('accepts valid webhook payload', async () => {
    const res = await req('POST', '/webhooks/github', VALID_WEBHOOK, WEBHOOK_HEADERS);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'pending');
    assert.ok(res.body.analysis_id);
  });

  it('rejects missing headers', async () => {
    const res = await req('POST', '/webhooks/github', VALID_WEBHOOK);
    assert.equal(res.status, 400);
    assert.ok(res.body.missing_headers);
  });

  it('rejects missing fields', async () => {
    const res = await req('POST', '/webhooks/github', { action: 'opened' }, WEBHOOK_HEADERS);
    assert.equal(res.status, 400);
    assert.ok(res.body.missing_fields);
  });
});

describe('Analyses - GET /api/analyses', () => {
  it('lists analyses', async () => {
    const res = await req('GET', '/api/analyses');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.analyses));
  });

  it('returns 404 for non-existent analysis', async () => {
    const res = await req('GET', '/api/analyses/99999');
    assert.equal(res.status, 404);
  });

  it('retrieves created analysis', async () => {
    const webhook = await req('POST', '/webhooks/github', VALID_WEBHOOK, WEBHOOK_HEADERS);
    const id = webhook.body.analysis_id;

    // Wait for async completion
    await new Promise(r => setTimeout(r, 200));

    const res = await req('GET', `/api/analyses/${id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'completed');
    assert.ok(res.body.result);
  });
});

describe('Configurable Responses', () => {
  it('uses MOCK_ANALYSIS_RESULT for analysis outcome', async () => {
    const webhook = await req('POST', '/webhooks/github', VALID_WEBHOOK, WEBHOOK_HEADERS);
    await new Promise(r => setTimeout(r, 200));
    const res = await req('GET', `/api/analyses/${webhook.body.analysis_id}`);
    assert.equal(res.body.result, 'success'); // default is 'success'
  });
});
