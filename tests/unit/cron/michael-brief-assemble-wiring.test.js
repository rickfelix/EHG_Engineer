// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-2, FR-4, TS-5 — forked from
// michael-todoist-brief-wiring.test.js: pin the exact secret set (the Supabase pair, nothing else —
// no Google credential, since the Drive-doc copy is its own, separately-credentialed workflow).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'michael-brief-assemble-cron.yml'), 'utf8');

describe('michael-brief-assemble-cron.yml wiring', () => {
  it('references EXACTLY the Supabase pair — no Google credential, no Todoist token, no encryption key', () => {
    const secrets = [...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']));
    const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(code).not.toMatch(/GOOGLE|OAUTH|ENCRYPTION|LEO_KEYS|ANTHROPIC|CLIENT_SECRET|REFRESH_TOKEN|TODOIST/i);
  });
  it('job env keys are the Supabase trio only, no fourth key', () => {
    const envBlock = wf.slice(wf.indexOf('    env:'), wf.indexOf('    steps:'));
    const keys = [...envBlock.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  it('carries the EDT and EST cron pair with the 05:15-06:00 ET window in a trailing comment, dispatch, read-only contents, single-flight, a 10-minute timeout', () => {
    expect(wf).toMatch(/cron: '\*\/15 9-10 \* \* \*'\s+#.*EDT.*05:15-06:00 ET/);
    expect(wf).toMatch(/cron: '\*\/15 10-11 \* \* \*'\s+#.*EST.*05:15-06:00 ET/);
    expect((wf.match(/- cron:/g) || []).length).toBe(2);
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(wf).toMatch(/concurrency:\s*\n\s*group: \$\{\{ github\.workflow \}\}\s*\n\s*cancel-in-progress: true/);
    expect(wf).toMatch(/timeout-minutes: 10/);
  });
  it('installs with npm ci --ignore-scripts on node 22 with the npm cache and invokes brief-assemble.mjs --apply by repo-relative path with no cd', () => {
    expect(wf).toMatch(/node-version: '22'/);
    expect(wf).toMatch(/cache: 'npm'/);
    expect(wf).toContain('run: npm ci --ignore-scripts');
    expect(wf).toContain('run: node scripts/michael/brief-assemble.mjs --apply');
    expect(wf).not.toMatch(/\bcd\s+\S+\s*&&/);
  });
  it('no Google or Todoist credential appears anywhere in this workflow file (AC-3-style grep)', () => {
    expect(wf).not.toMatch(/MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|GOOGLE_SERVICE_ACCOUNT_JSON|TODOIST_API_TOKEN/);
  });
});
