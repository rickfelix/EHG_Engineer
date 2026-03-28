import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

let server;
before(async () => {
  process.env.MOCK_PORT = '0';
  const mod = await import('../src/index.js');
  server = mod.server;
});
after(() => { server?.close(); });

async function getPage(path) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}${path}`);
  return { status: res.status, text: await res.text() };
}

describe('OAuth UI Pages', () => {
  it('serves connect.html', async () => {
    const res = await getPage('/ui/connect.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Connect GitHub'));
    assert.ok(res.text.includes('CodeGuardian CI'));
  });

  it('serves manage.html', async () => {
    const res = await getPage('/ui/manage.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Manage Installations'));
    assert.ok(res.text.includes('CodeGuardian CI'));
  });

  it('connect page has install button', async () => {
    const res = await getPage('/ui/connect.html');
    assert.ok(res.text.includes('Install GitHub App'));
  });

  it('manage page shows permissions', async () => {
    const res = await getPage('/ui/manage.html');
    assert.ok(res.text.includes('Permissions'));
    assert.ok(res.text.includes('read'));
    assert.ok(res.text.includes('write'));
  });

  it('manage page shows connected repos', async () => {
    const res = await getPage('/ui/manage.html');
    assert.ok(res.text.includes('Connected Repositories'));
    assert.ok(res.text.includes('demo-org/main-repo'));
  });

  it('pages use shared CSS', async () => {
    const css = await getPage('/ui/css/styles.css');
    assert.equal(css.status, 200);
    // Both pages link to the same stylesheet
    const connect = await getPage('/ui/connect.html');
    const manage = await getPage('/ui/manage.html');
    assert.ok(connect.text.includes('css/styles.css'));
    assert.ok(manage.text.includes('css/styles.css'));
  });

  it('navigation links exist on both pages', async () => {
    const connect = await getPage('/ui/connect.html');
    const manage = await getPage('/ui/manage.html');
    assert.ok(connect.text.includes('href="manage.html"'));
    assert.ok(manage.text.includes('href="connect.html"'));
  });
});
