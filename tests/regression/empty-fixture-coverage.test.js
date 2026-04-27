/**
 * Empty-Fixture Coverage Regression Test
 *
 * SD: SD-LEO-INFRA-TEST-COVERAGE-HYGIENE-001
 * Purpose: Onion-layer canary for the test-coverage CI workflow.
 *
 * Spawns a fresh node child with Supabase env vars stripped, then dynamically
 * imports a representative slice of production modules that previously crashed
 * at module-load time when env was missing. The test passes when the child
 * exits 0 — proving the lazy/factory pattern (or vitest setup-file synthetic
 * env injection) keeps module-load throws contained.
 *
 * The test fails the moment a new production module reintroduces a top-level
 * createSupabaseServiceClient() (or sibling) call path that throws before any
 * test setup can intercept it — i.e., the moment another onion layer surfaces.
 *
 * Layer history (see SD metadata): 1 vitest --json flag, 2 archive coverage,
 * 3 dynamic-import regex, 4 shebang+import order, 5 module-load createClient.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Representative module-load offenders — keep this list small (1 per category)
// so the canary surfaces regressions fast without becoming a full audit.
// Paths resolved against REPO_ROOT then converted to file:// URLs so the
// child process cwd can be a tmpdir (preventing dotenv.config({ path: '.env' })
// in lib/supabase-client.js from re-injecting credentials and masking the
// stripped-env behavior we are validating).
const CANARY_RELATIVE_PATHS = [
  'lib/utils/orchestrator-child-completion.js',
  'lib/learning/issue-knowledge-base.js',
  'lib/heartbeat-manager.mjs',
];

describe('layer-5 regression: module-load with stripped env', () => {
  it('importing canonical production modules with Supabase env stripped does not throw', () => {
    const importStatements = CANARY_RELATIVE_PATHS
      .map(rel => pathToFileURL(path.join(REPO_ROOT, rel)).href)
      .map(href => `await import(${JSON.stringify(href)});`)
      .join('\n      ');

    const script = `
      try {
        ${importStatements}
        process.exit(0);
      } catch (err) {
        console.error('CANARY_FAILURE:', err && err.message ? err.message : err);
        process.exit(1);
      }
    `;

    // Strip Supabase vars from the spawned env so the canary exercises the
    // unset path. Only NODE-essential vars passed through.
    const env = {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
    };
    if (process.platform === 'win32') {
      env.SystemRoot = process.env.SystemRoot;
      env.TEMP = process.env.TEMP;
    }

    // Use a tmpdir as cwd so dotenv.config({ path: '.env' }) — called inside
    // lib/supabase-client.js — finds nothing and cannot resilver the stripped
    // env. Without this, the canary passes locally where REPO_ROOT/.env exists
    // and silently misses regressions.
    const tmpCwd = mkdtempSync(path.join(tmpdir(), 'sd-coverage-canary-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', script],
        {
          cwd: tmpCwd,
          env,
          encoding: 'utf8',
          timeout: 30000,
        }
      );

      if (result.status !== 0) {
        const detail = `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}\n`;
        throw new Error(`Canary expected exit 0, got ${result.status}${detail}`);
      }
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpCwd, { recursive: true, force: true });
    }
  }, 45000);
});
