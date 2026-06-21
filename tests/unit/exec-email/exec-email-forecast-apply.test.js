// SD-LEO-INFRA-EXEC-EMAIL-FORECAST-APPLY-001 — the hourly forecast-historize cron step must PERSIST a
// row, not run dry. build-completion-forecast.mjs writes ONLY with --apply (else {written:false,
// reason:dry_run}), so the cron must invoke the :apply npm script. Without this the un-freeze fix
// (FROZEN-001) was a no-op: every run computed+printed but wrote no row → the chairman ETA stayed
// frozen. This wiring test catches a regression that drops --apply / reverts to the bare script.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const YML = readFileSync(path.join(REPO_ROOT, '.github/workflows/adam-exec-email-cron.yml'), 'utf8');
const PKG = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
const FORECASTER = readFileSync(path.join(REPO_ROOT, 'scripts/vision/build-completion-forecast.mjs'), 'utf8');

describe('exec-email cron — forecast historize PERSISTS (not dry-run)', () => {
  it('the forecast-historize step runs an --apply path (the :apply npm script)', () => {
    expect(YML).toMatch(/run:\s*npm run vision:build-forecast:apply\b/);
    // and NOT the bare dry-run script as the cron command
    expect(YML).not.toMatch(/run:\s*npm run vision:build-forecast\s*$/m);
  });

  it('the :apply npm script passes --apply to the forecaster', () => {
    expect(PKG.scripts['vision:build-forecast:apply']).toBeDefined();
    expect(PKG.scripts['vision:build-forecast:apply']).toMatch(/build-completion-forecast\.mjs\s+--apply\b/);
  });

  it('the bare vision:build-forecast script stays DRY (no --apply) so manual runs do not persist', () => {
    expect(PKG.scripts['vision:build-forecast']).toBeDefined();
    expect(PKG.scripts['vision:build-forecast']).not.toMatch(/--apply/);
  });

  it('the forecaster genuinely gates persistence on --apply (the reason this matters)', () => {
    // pins the contract the fix depends on: APPLY=args.includes('--apply') + dry_run short-circuit
    expect(FORECASTER).toMatch(/APPLY\s*=\s*args\.includes\(\s*['"]--apply['"]\s*\)/);
    expect(FORECASTER).toMatch(/dry_run/);
  });
});
