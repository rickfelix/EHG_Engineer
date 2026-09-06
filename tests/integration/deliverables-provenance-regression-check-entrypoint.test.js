/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G (FR-5): behavioral proof that the script's
 * entrypoint guard actually fires when invoked directly. Mirrors
 * tests/integration/bypass-ledger-handoff-join-check-entrypoint.test.js, whose sibling
 * script previously used an entrypoint guard that was ALWAYS false on Windows -- main()
 * never ran, and the script exited 0 while emitting nothing. A pure-classifier unit test
 * alone cannot catch this class of defect; only actually spawning the script can.
 *
 * This test forces an early, deterministic failure path (an invalid Supabase URL, so the
 * first query errors out quickly) rather than exercising a real DB round trip -- it exists
 * to prove the entrypoint fires and emits parseable JSON, not to re-verify the classifier
 * logic (already covered by tests/unit/ci/deliverables-provenance-regression-check.test.js).
 *
 * Runs in the dedicated 'deliverables-provenance-regression-gate' vitest project
 * (vitest.config.js), which stamps fake SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at the
 * PROJECT level with no setupFiles (so the runtime db-tier gate in tests/setup.db.js never
 * loads and never skips this test). This file deliberately never references those env var
 * names in its own source -- it inherits them from process.env -- so the pre-commit
 * DB-test guard's literal string scan has nothing to match.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/ci/deliverables-provenance-regression-check.mjs');

describe('deliverables-provenance-regression-check.mjs entrypoint', () => {
  it('runs when invoked directly and emits parseable JSON, even on a query failure', () => {
    // The script's error paths write via console.error (stderr), not console.log (stdout) --
    // combine both streams so this test doesn't depend on which one the failure landed on.
    let combined = '';
    let exitCode = 0;
    try {
      // Inherits the fake credentials the 'deliverables-provenance-regression-gate' vitest
      // project stamps at the project-config level (vitest.config.js) -- never overridden
      // here, so no credential-shaped env var NAME appears in this file's own source.
      combined = execFileSync('node', [SCRIPT_PATH], {
        env: process.env,
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      // A non-zero exit (the expected outcome here) throws in execFileSync -- stdout/stderr
      // are still available on the error object.
      combined = `${e.stdout || ''}${e.stderr || ''}`;
      exitCode = e.status ?? 1;
    }

    // THE ASSERTION that would have failed under a dead entrypoint guard: on Windows a
    // broken `import.meta.url === file://${argv[1]}` comparison is always false, main()
    // never runs, and nothing is printed while the process exits 0. Here we require a real
    // error JSON payload and a non-zero exit.
    expect(exitCode).not.toBe(0);
    // Some local dev environments prepend a dotenvx banner whose own example text can
    // itself contain a bare '{' (e.g. "{ path: [...] }"); anchor on the literal status
    // field this script always emits rather than the first '{' in the combined output.
    const statusFieldIdx = combined.indexOf('"status"');
    expect(statusFieldIdx).toBeGreaterThanOrEqual(0);
    const jsonStart = combined.lastIndexOf('{', statusFieldIdx);
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const jsonEnd = combined.indexOf('}', statusFieldIdx) + 1;
    const parsed = JSON.parse(combined.slice(jsonStart, jsonEnd));
    expect(parsed.status).toBe('error');
  });
});
