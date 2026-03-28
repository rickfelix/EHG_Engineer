import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

let server;
async function req(method, path, body) {
  const port = server.address().port;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

before(async () => {
  process.env.MOCK_PORT = '0';
  const mod = await import('../src/index.js');
  server = mod.server;
});
after(() => { server?.close(); });

describe('POST /oauth/authorize', () => {
  it('returns authorization URL for valid tenant', async () => {
    const res = await req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' });
    assert.equal(res.status, 200);
    assert.ok(res.body.authorization_url.includes('github.com'));
    assert.ok(res.body.code);
  });

  it('returns 400 without tenant_id', async () => {
    const res = await req('POST', '/oauth/authorize', {});
    assert.equal(res.status, 400);
  });

  it('returns 404 for unknown tenant', async () => {
    const res = await req('POST', '/oauth/authorize', { tenant_id: 'nonexistent' });
    assert.equal(res.status, 404);
  });
});

describe('GET /oauth/callback', () => {
  it('creates installation for valid callback', async () => {
    const auth = await req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' });
    const res = await req('GET', `/oauth/callback?code=${auth.body.code}&tenant_id=default-tenant`);
    assert.equal(res.status, 200);
    assert.ok(res.body.installation);
    assert.equal(res.body.installation.tenant_id, 'default-tenant');
    assert.equal(res.body.installation.status, 'active');
  });

  it('returns 400 without required params', async () => {
    const res = await req('GET', '/oauth/callback');
    assert.equal(res.status, 400);
  });
});

describe('POST /oauth/token', () => {
  it('issues token for valid installation', async () => {
    // First create an installation via callback
    const auth = await req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' });
    const callback = await req('GET', `/oauth/callback?code=${auth.body.code}&tenant_id=default-tenant`);
    const installId = callback.body.installation.installation_id;

    const res = await req('POST', '/oauth/token', { installation_id: installId });
    assert.equal(res.status, 200);
    assert.ok(res.body.access_token.startsWith('mock-token-'));
    assert.equal(res.body.token_type, 'bearer');
    assert.equal(res.body.expires_in, 3600);
  });

  it('returns 401 for unknown installation', async () => {
    const res = await req('POST', '/oauth/token', { installation_id: 99999 });
    assert.equal(res.status, 401);
  });

  it('returns 400 without installation_id', async () => {
    const res = await req('POST', '/oauth/token', {});
    assert.equal(res.status, 400);
  });
});

describe('POST /oauth/refresh', () => {
  it('returns refreshed token', async () => {
    const res = await req('POST', '/oauth/refresh', { access_token: 'old-token' });
    assert.equal(res.status, 200);
    assert.ok(res.body.access_token.includes('refreshed'));
  });

  it('returns 400 without access_token', async () => {
    const res = await req('POST', '/oauth/refresh', {});
    assert.equal(res.status, 400);
  });
});

describe('GET /oauth/permissions/:installId', () => {
  it('returns permissions for valid installation', async () => {
    const auth = await req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' });
    const callback = await req('GET', `/oauth/callback?code=${auth.body.code}&tenant_id=default-tenant`);
    const instId = callback.body.installation.id;

    const res = await req('GET', `/oauth/permissions/${instId}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.permissions));
    assert.ok(res.body.permissions.includes('read'));
  });

  it('returns 404 for unknown installation', async () => {
    const res = await req('GET', '/oauth/permissions/nonexistent');
    assert.equal(res.status, 404);
  });
});
