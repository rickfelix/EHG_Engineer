import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

let app, server;

async function req(path) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}${path}`);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

before(async () => {
  process.env.MOCK_PORT = '0';
  const mod = await import('../src/index.js');
  app = mod.app;
  server = mod.server;
});

after(() => { server?.close(); });

describe('Mock Data Module', () => {
  it('exports repos, orgs, findings, and utility functions', async () => {
    const data = await import('../ui/js/mock-data.js');
    assert.ok(Array.isArray(data.orgs), 'orgs is array');
    assert.ok(data.orgs.length >= 3, '3+ orgs');
    assert.ok(Array.isArray(data.repos), 'repos is array');
    assert.ok(data.repos.length >= 5, '5+ repos');
    assert.ok(Array.isArray(data.findings), 'findings is array');
    assert.ok(data.findings.length >= 20, '20+ findings');
    assert.equal(typeof data.getMetrics, 'function');
    assert.equal(typeof data.getFindingsForRepo, 'function');
    assert.equal(typeof data.getReposForOrg, 'function');
  });

  it('getMetrics returns correct counts', async () => {
    const { getMetrics } = await import('../ui/js/mock-data.js');
    const m = getMetrics();
    assert.ok(m.total > 0);
    assert.equal(m.passing + m.failing + m.pending, m.total);
    assert.ok(m.totalFindings > 0);
  });

  it('getFindingsForRepo returns findings for a known repo', async () => {
    const { getFindingsForRepo } = await import('../ui/js/mock-data.js');
    const f = getFindingsForRepo('r2');
    assert.ok(f.length > 0, 'r2 has findings');
    assert.ok(f.every(item => item.repo_id === 'r2'));
  });

  it('getReposForOrg returns repos for a known org', async () => {
    const { getReposForOrg } = await import('../ui/js/mock-data.js');
    const r = getReposForOrg('org-1');
    assert.ok(r.length > 0, 'org-1 has repos');
    assert.ok(r.every(item => item.org_id === 'org-1'));
  });
});

describe('UI Static Files', () => {
  it('serves dashboard.html', async () => {
    const res = await req('/ui/dashboard.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Dashboard'));
    assert.ok(res.text.includes('CodeGuardian CI'));
  });

  it('serves onboarding.html', async () => {
    const res = await req('/ui/onboarding.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Get Started'));
  });

  it('serves results.html', async () => {
    const res = await req('/ui/results.html');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('Scan Results'));
  });

  it('serves CSS file', async () => {
    const res = await req('/ui/css/styles.css');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('--bg:'));
  });

  it('serves mock-data.js', async () => {
    const res = await req('/ui/js/mock-data.js');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('export const repos'));
  });
});

describe('Findings Data Quality', () => {
  it('all findings have required fields', async () => {
    const { findings } = await import('../ui/js/mock-data.js');
    for (const f of findings) {
      assert.ok(f.id, 'finding has id');
      assert.ok(f.repo_id, 'finding has repo_id');
      assert.ok(['critical', 'high', 'medium', 'low'].includes(f.severity), `valid severity: ${f.severity}`);
      assert.ok(f.title, 'finding has title');
      assert.ok(f.file, 'finding has file');
      assert.ok(typeof f.line === 'number', 'finding has line number');
      assert.ok(f.description, 'finding has description');
    }
  });

  it('findings cover all severity levels', async () => {
    const { findings } = await import('../ui/js/mock-data.js');
    const severities = new Set(findings.map(f => f.severity));
    assert.ok(severities.has('critical'));
    assert.ok(severities.has('high'));
    assert.ok(severities.has('medium'));
    assert.ok(severities.has('low'));
  });
});
