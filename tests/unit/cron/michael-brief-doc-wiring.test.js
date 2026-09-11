// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E / FR-7 — pins that this is the ONLY workflow in the
// repo referencing GOOGLE_SERVICE_ACCOUNT_JSON alongside the Michael Supabase pair.
//
// QF-20260911-110 / ratification 00f696f1: the original cross-check here ("michael-brief-assemble-
// cron.yml stays credential-free") is removed, not just no-longer-true -- that workflow file no
// longer exists at all (brief-assemble moved from the 'gha' venue to 'task_scheduler', ratification
// 00f696f1), so there is nothing left to read or cross-check against.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'michael-brief-doc-cron.yml'), 'utf8');

describe('michael-brief-doc-cron.yml wiring', () => {
  it('references EXACTLY the Supabase pair plus GOOGLE_SERVICE_ACCOUNT_JSON', () => {
    const secrets = [...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_SERVICE_ACCOUNT_JSON']));
  });
  it('carries the EDT/EST cron pair matching brief-assemble\'s 05:15-06:00 ET window, dispatch, single-flight, a 10-minute timeout', () => {
    expect(wf).toMatch(/cron: '\*\/15 9-10 \* \* \*'\s+#.*EDT.*05:15-06:00 ET/);
    expect(wf).toMatch(/cron: '\*\/15 10-11 \* \* \*'\s+#.*EST.*05:15-06:00 ET/);
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(wf).toMatch(/concurrency:\s*\n\s*group: \$\{\{ github\.workflow \}\}\s*\n\s*cancel-in-progress: true/);
    expect(wf).toMatch(/timeout-minutes: 10/);
  });
  it('installs with npm ci --ignore-scripts on node 22 and invokes brief-doc.mjs --apply by repo-relative path with no cd', () => {
    expect(wf).toMatch(/node-version: '22'/);
    expect(wf).toContain('run: npm ci --ignore-scripts');
    expect(wf).toContain('run: node scripts/michael/brief-doc.mjs --apply');
    expect(wf).not.toMatch(/\bcd\s+\S+\s*&&/);
  });
  it('is the ONLY workflow file in the repo (besides the pre-existing daily-review path) referencing GOOGLE_SERVICE_ACCOUNT_JSON among michael-*.yml files', () => {
    const dir = path.join(ROOT, '.github', 'workflows');
    const michaelFiles = fs.readdirSync(dir).filter((f) => /^michael-.*\.ya?ml$/.test(f));
    const withGoogle = michaelFiles.filter((f) => /GOOGLE_SERVICE_ACCOUNT_JSON/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(withGoogle).toEqual(['michael-brief-doc-cron.yml']);
  });
});
