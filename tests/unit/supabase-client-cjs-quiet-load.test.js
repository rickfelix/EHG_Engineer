/**
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001 (FR-5, TS-9)
 *
 * FR-5 fixed a live bug (security review finding): lib/supabase-client.cjs's dotenv.config()
 * call was missing `quiet: true`, unlike the .js sibling -- dotenv v17 otherwise prints its
 * "injected env" banner to STDOUT, contaminating any --json CLI output that requires()'s this
 * module transitively (the exact QF-20260611-017 failure mode the .js variant was already
 * fixed for).
 *
 * This spawns a REAL child Node process (require() runs the actual module-level side effect,
 * which an in-process import can't observe cleanly since require() caches and the banner would
 * already have fired for an earlier test in the same worker) against a real tmpdir git repo +
 * .env, and asserts no banner reaches stdout. No live .env is mutated.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('lib/supabase-client.cjs loads via require() with no dotenv banner on stdout (TS-9)', () => {
  it('prints nothing matching the dotenv "injected env" banner', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-client-cjs-quiet-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, '.env'), 'FOO=bar\n');

      const modulePath = path.join(REPO_ROOT, 'lib', 'supabase-client.cjs').replace(/\\/g, '/');
      const runnerPath = path.join(tmpDir, 'runner.cjs');
      fs.writeFileSync(
        runnerPath,
        `process.env.NODE_ENV = 'production';\nrequire('${modulePath}');\nconsole.log('__DONE__');\n`
      );

      const stdout = execFileSync('node', [runnerPath], { cwd: tmpDir, encoding: 'utf8' });

      expect(stdout).toContain('__DONE__');
      expect(stdout).not.toMatch(/injected env/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
