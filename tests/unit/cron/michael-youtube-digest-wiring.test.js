// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J / FR-4 — forked from michael-todoist-brief-wiring.test.js:
// this is the ONE v1.1 feeder that runs credential-free (public RSS), so the secret set must be even
// narrower than todoist-brief's — the Supabase pair only, no Google, no Todoist token either.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'michael-youtube-digest-cron.yml'), 'utf8');

describe('michael-youtube-digest-cron.yml wiring', () => {
  it('references EXACTLY the Supabase pair — no Google credential, no Todoist token, no encryption key', () => {
    const secrets = [...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']));
    const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(code).not.toMatch(/GOOGLE|OAUTH|ENCRYPTION|LEO_KEYS|ANTHROPIC|CLIENT_SECRET|REFRESH_TOKEN|TODOIST/i);
  });
  it('job env keys are exactly the Supabase trio (URL, its NEXT_PUBLIC alias, service role key)', () => {
    const envBlock = wf.slice(wf.indexOf('    env:'), wf.indexOf('    steps:'));
    const keys = [...envBlock.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  it('carries the EDT and EST cron pair with the ET window in a trailing comment, dispatch, read-only contents, single-flight, a 10-minute timeout', () => {
    expect(wf).toMatch(/cron: '\*\/15 9-10 \* \* \*'\s+#.*EDT.*06:00-06:30 ET/);
    expect(wf).toMatch(/cron: '\*\/15 10-11 \* \* \*'\s+#.*EST.*06:00-06:30 ET/);
    expect((wf.match(/- cron:/g) || []).length).toBe(2);
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(wf).toMatch(/concurrency:\s*\n\s*group: \$\{\{ github\.workflow \}\}\s*\n\s*cancel-in-progress: true/);
    expect(wf).toMatch(/timeout-minutes: 10/);
  });
  it('installs with npm ci --ignore-scripts on node 22 with the npm cache and invokes youtube-digest.mjs --apply by repo-relative path with no cd', () => {
    expect(wf).toMatch(/node-version: '22'/);
    expect(wf).toMatch(/cache: 'npm'/);
    expect(wf).toContain('run: npm ci --ignore-scripts');
    expect(wf).toContain('run: node scripts/michael/youtube-digest.mjs --apply');
    expect(wf).not.toMatch(/\bcd\s+\S+\s*&&/);
  });
  it('no workflow in the repo references the Google client or the Michael encryption key (AC-3 grep)', () => {
    const dir = path.join(ROOT, '.github', 'workflows');
    const hits = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).filter((f) => /MICHAEL_ENCRYPTION_KEY|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
