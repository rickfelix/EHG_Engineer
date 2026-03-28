import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DataRepository } from '../src/data/repository.js';
import { seed } from '../src/data/seed.js';
import { orgs, repos, findings, getMetrics, getFindingsForRepo } from '../ui/js/mock-data.js';

let app, server;

async function req(method, path, body, headers = {}) {
  const port = server.address().port;
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, opts);
  return { status: res.status, body: await res.json() };
}

const WEBHOOK = {
  action: 'opened',
  pull_request: { number: 99, title: 'Integration Test PR' },
  repository: { full_name: 'test/integration' }
};
const HEADERS = { 'x-github-event': 'pull_request', 'x-github-delivery': 'int-test-1' };

before(async () => {
  process.env.MOCK_PORT = '0';
  const mod = await import('../src/index.js');
  app = mod.app;
  server = mod.server;
});

after(() => { server?.close(); });

describe('Cross-Layer: Webhook → Store → API', () => {
  it('webhook creates analysis retrievable via API', async () => {
    const webhook = await req('POST', '/webhooks/github', WEBHOOK, HEADERS);
    assert.equal(webhook.status, 200);
    const id = webhook.body.analysis_id;

    await new Promise(r => setTimeout(r, 200));

    const analysis = await req('GET', `/api/analyses/${id}`);
    assert.equal(analysis.status, 200);
    assert.equal(analysis.body.status, 'completed');
    assert.equal(analysis.body.pr_number, 99);
    assert.equal(analysis.body.repository, 'test/integration');
  });

  it('analysis list grows with each webhook', async () => {
    const before = await req('GET', '/api/analyses');
    const countBefore = before.body.analyses.length;

    await req('POST', '/webhooks/github', WEBHOOK, HEADERS);

    const after = await req('GET', '/api/analyses');
    assert.equal(after.body.analyses.length, countBefore + 1);
  });
});

describe('Cross-Layer: Data Layer ↔ UI Mock Data', () => {
  it('seed data matches UI mock-data module counts', () => {
    const repo = new DataRepository();
    seed(repo);
    assert.equal(repo.listOrgs().length, orgs.length);
    assert.equal(repo.listRepos().length, repos.length);
    assert.equal(repo.listFindings().length, findings.length);
  });

  it('seed data org names match UI mock-data', () => {
    const repo = new DataRepository();
    seed(repo);
    const seededNames = repo.listOrgs().map(o => o.name).sort();
    const uiNames = orgs.map(o => o.name).sort();
    assert.deepEqual(seededNames, uiNames);
  });

  it('seed data finding counts match UI getMetrics', () => {
    const repo = new DataRepository();
    seed(repo);
    const metrics = getMetrics();
    assert.equal(repo.listFindings().length, metrics.totalFindings);
  });

  it('getFindingsForRepo matches DataRepository filter', () => {
    const repo = new DataRepository();
    seed(repo);
    const uiFindings = getFindingsForRepo('r2');
    const repoFindings = repo.listFindings({ repo_id: 'r2' });
    assert.equal(uiFindings.length, repoFindings.length);
    assert.deepEqual(
      uiFindings.map(f => f.id).sort(),
      repoFindings.map(f => f.id).sort()
    );
  });
});

describe('Cross-Layer: API + Static UI', () => {
  it('health endpoint available alongside UI', async () => {
    const [health, dashboard] = await Promise.all([
      req('GET', '/health'),
      fetch(`http://localhost:${server.address().port}/ui/dashboard.html`)
    ]);
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    assert.equal(dashboard.status, 200);
  });
});

describe('Error Scenarios', () => {
  it('invalid webhook returns 400 while API still works', async () => {
    const bad = await req('POST', '/webhooks/github', {});
    assert.equal(bad.status, 400);

    const health = await req('GET', '/health');
    assert.equal(health.status, 200);
  });

  it('non-existent analysis returns 404', async () => {
    const res = await req('GET', '/api/analyses/nonexistent');
    assert.equal(res.status, 404);
  });
});
