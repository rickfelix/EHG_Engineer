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

describe('Full OAuth Flow Integration', () => {
  let authCode, installationId, internalId, accessToken;

  it('Step 1: Authorize returns code and URL', async () => {
    const res = await req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' });
    assert.equal(res.status, 200);
    assert.ok(res.body.authorization_url);
    assert.ok(res.body.code);
    authCode = res.body.code;
  });

  it('Step 2: Callback creates installation', async () => {
    const res = await req('GET', `/oauth/callback?code=${authCode}&tenant_id=default-tenant`);
    assert.equal(res.status, 200);
    assert.ok(res.body.installation);
    assert.equal(res.body.installation.status, 'active');
    installationId = res.body.installation.installation_id;
    internalId = res.body.installation.id;
  });

  it('Step 3: Token issued for installation', async () => {
    const res = await req('POST', '/oauth/token', { installation_id: installationId });
    assert.equal(res.status, 200);
    assert.ok(res.body.access_token);
    assert.equal(res.body.token_type, 'bearer');
    assert.equal(res.body.expires_in, 3600);
    accessToken = res.body.access_token;
  });

  it('Step 4: Token can be refreshed', async () => {
    const res = await req('POST', '/oauth/refresh', { access_token: accessToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.access_token);
    assert.notEqual(res.body.access_token, accessToken);
  });

  it('Step 5: Permissions readable for installation', async () => {
    const res = await req('GET', `/oauth/permissions/${internalId}`);
    assert.equal(res.status, 200);
    assert.ok(res.body.permissions.includes('read'));
    assert.ok(res.body.permissions.includes('write'));
    assert.ok(res.body.repos.length > 0);
  });
});

describe('OAuth Error Scenarios', () => {
  it('authorize with missing tenant_id returns 400', async () => {
    const res = await req('POST', '/oauth/authorize', {});
    assert.equal(res.status, 400);
  });

  it('authorize with unknown tenant returns 404', async () => {
    const res = await req('POST', '/oauth/authorize', { tenant_id: 'fake' });
    assert.equal(res.status, 404);
  });

  it('callback without params returns 400', async () => {
    const res = await req('GET', '/oauth/callback');
    assert.equal(res.status, 400);
  });

  it('token for unknown installation returns 401', async () => {
    const res = await req('POST', '/oauth/token', { installation_id: 99999 });
    assert.equal(res.status, 401);
  });

  it('permissions for unknown install returns 404', async () => {
    const res = await req('GET', '/oauth/permissions/nonexistent');
    assert.equal(res.status, 404);
  });

  it('service remains healthy after errors', async () => {
    const health = await req('GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
  });
});

describe('Cross-Layer: OAuth API + UI', () => {
  it('OAuth API and UI pages coexist', async () => {
    const [api, ui] = await Promise.all([
      req('POST', '/oauth/authorize', { tenant_id: 'default-tenant' }),
      fetch(`http://localhost:${server.address().port}/ui/connect.html`)
    ]);
    assert.equal(api.status, 200);
    assert.equal(ui.status, 200);
  });
});
