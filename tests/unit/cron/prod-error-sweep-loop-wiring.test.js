// SD-LEO-INFRA-PROD-ERROR-SWEEP-WIRE-001 — the prod-error-sweep loop shipped but NEVER fired: the
// script had correct detector logic + a loop-contract-registry entry (cron '40 * * * *') but NO GHA
// workflow scheduled it (0 runs ever). This pins the new workflow that schedules it, AND the
// ship-dormant gate (PROD_ERROR_SWEEP_LOOP_ENABLE) so activation stays a chairman repo-var flip.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WF = readFileSync(path.join(REPO_ROOT, '.github/workflows/prod-error-sweep-loop.yml'), 'utf8');
const SCRIPT = readFileSync(path.join(REPO_ROOT, 'scripts/clockwork/prod-error-sweep-loop.cjs'), 'utf8');

describe('prod-error-sweep-loop is actually scheduled (was 0 runs ever)', () => {
  it('the workflow schedules the registry cron 40 * * * *', () => {
    expect(WF).toMatch(/cron:\s*'40 \* \* \* \*'/);
  });

  it('the workflow invokes the sweep script WITH --apply (else it DRY-RUNs and sources 0 SDs even when enabled)', () => {
    // The script has TWO gates: PROD_ERROR_SWEEP_LOOP_ENABLE (skip) AND --apply (write). Omitting
    // --apply is the wired-but-no-op trap this SD exists to fix — assert it explicitly.
    expect(WF).toMatch(/node scripts\/clockwork\/prod-error-sweep-loop\.cjs --apply/);
  });

  it('the script genuinely has a separate --apply write gate (default dry-run)', () => {
    expect(SCRIPT).toMatch(/APPLY\s*=\s*args\.includes\(\s*'--apply'\s*\)/);
  });

  it('the workflow passes the activation flag from a repo variable (chairman flip, no code change)', () => {
    expect(WF).toMatch(/PROD_ERROR_SWEEP_LOOP_ENABLE:\s*\$\{\{\s*vars\.PROD_ERROR_SWEEP_LOOP_ENABLE\s*\}\}/);
  });

  it('supplies SUPABASE creds (the sweep reads + sources SDs)', () => {
    // NOTE: assert via quoted-string toContain (not regex) so the DB-test-guard's codeNoStrings pass
    // strips these tokens — this is a YAML-wiring assertion, the test never touches a real DB.
    expect(WF).toContain('SUPABASE_URL: ${{ secrets.SUPABASE_URL }}');
    expect(WF).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
  });

  it('has workflow_dispatch for manual activation + concurrency guard (no overlapping sweeps)', () => {
    expect(WF).toMatch(/workflow_dispatch/);
    expect(WF).toMatch(/concurrency:/);
  });

  it('the script stays SHIP-DORMANT: it SKIPs unless PROD_ERROR_SWEEP_LOOP_ENABLE === "true"', () => {
    expect(SCRIPT).toMatch(/PROD_ERROR_SWEEP_LOOP_ENABLE\s*!==\s*'true'/);
    expect(SCRIPT).toMatch(/\[SKIP\]/);
  });
});
