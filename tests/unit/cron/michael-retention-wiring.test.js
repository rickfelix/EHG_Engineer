// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B / FR-6, TS-14 — the "no credential" claim of
// ratification 0daf3bd8 is otherwise unfalsifiable: pin the exact secret set the workflow references.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'michael-retention-cron.yml'), 'utf8');
const ddl = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'drive-reports-ddl.yml'), 'utf8');

describe('michael-retention-cron.yml wiring', () => {
  it('references EXACTLY the two already-provisioned secrets — no user credential, no encryption key', () => {
    const secrets = [...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']));
    // Non-comment lines only: the header comment names the things the job must NOT carry.
    const code = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(code).not.toMatch(/GOOGLE|OAUTH|TODOIST|ENCRYPTION|LEO_KEYS|ANTHROPIC|CLIENT_SECRET|REFRESH_TOKEN/i);
  });
  it('job env keys are exactly the Supabase trio (URL twice for both readers, service key once)', () => {
    const envBlock = wf.slice(wf.indexOf('    env:'), wf.indexOf('    steps:'));
    const keys = [...envBlock.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  it('runs weekly, read-only contents, single-flight, and invokes retention.mjs --apply by absolute repo path', () => {
    expect(wf).toMatch(/cron: '0 4 \* \* 0'/);
    expect(wf).toContain('workflow_dispatch:');
    expect(wf).toMatch(/permissions:\s*\n\s*contents: read/);
    expect(wf).toMatch(/concurrency:\s*\n\s*group: \$\{\{ github\.workflow \}\}/);
    expect(wf).toContain('run: node scripts/michael/retention.mjs --apply');
    expect(wf).not.toMatch(/\bcd\s+\S+\s*&&/);
  });
  it('the DDL workflow lists the michael_tables migration pair and DDL test literally', () => {
    for (const p of ['database/migrations/20260906_michael_tables.sql', 'database/migrations/20260906_michael_tables_DOWN.sql', 'tests/ddl/michael-tables-ddl.db.test.js']) {
      expect(ddl).toContain(`- '${p}'`);
    }
  });
});
