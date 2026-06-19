// SD-LEO-INFRA-VISION-GAUGE-CRON-EHG-CHECKOUT-001 (FR-1/FR-2/FR-3/FR-4) — pin the cron wiring that
// lets the VDR gauge probe all 25 capabilities. The grep seam's VDR_EHG_REPO_ROOT override is already
// covered by tests/unit/vdr-grep-seam.test.js; this guards the WORKFLOW half (the ehg checkout + the
// env export + the fail-soft + the loud coverage diagnostic) so a future edit can't silently revert it
// and drop the automated vision % back to 22/25 without anyone noticing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const YML = readFileSync(path.join(REPO_ROOT, '.github/workflows/adam-exec-email-cron.yml'), 'utf8');

describe('adam-exec-email cron — cross-repo VDR gauge coverage wiring', () => {
  it('FR-1: checks out rickfelix/ehg into the workspace (path: ehg)', () => {
    expect(YML).toMatch(/repository:\s*rickfelix\/ehg/);
    expect(YML).toMatch(/path:\s*ehg\b/);
    // a second actions/checkout (the EHG_Engineer one plus the ehg one)
    expect((YML.match(/actions\/checkout@v4/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('FR-2: the ehg checkout reuses the established GH_TOKEN_CROSS_REPO secret (with EHG_RO_PAT fallback)', () => {
    // Reuse the org cross-repo secret the other rickfelix/ehg workflows already use, so the gauge can
    // reach 25/25 on merge without provisioning a brand-new secret; EHG_RO_PAT is the documented fallback.
    expect(YML).toMatch(/token:\s*\$\{\{\s*secrets\.GH_TOKEN_CROSS_REPO\s*\|\|\s*secrets\.EHG_RO_PAT\s*\}\}/);
  });

  it('FR-2: the ehg checkout is FAIL-SOFT (continue-on-error) so a missing PAT never breaks the cron', () => {
    // Anchor on the actual `repository: rickfelix/ehg` config (NOT a comment mention of the repo) so
    // continue-on-error is checked against the real checkout step's window.
    const cfgIdx = YML.indexOf('repository: rickfelix/ehg');
    expect(cfgIdx).toBeGreaterThanOrEqual(0);
    const window = YML.slice(Math.max(0, cfgIdx - 400), cfgIdx + 200);
    expect(window).toMatch(/continue-on-error:\s*true/);
  });

  it('FR-3: exports VDR_EHG_REPO_ROOT at the workspace ehg path (the grep seam honors it)', () => {
    expect(YML).toMatch(/VDR_EHG_REPO_ROOT:\s*\$\{\{\s*github\.workspace\s*\}\}\/ehg/);
    // and does NOT use the wrong knob (repo-paths EHG_REPO_PATH never reaches the grep seam)
    expect(YML).not.toMatch(/EHG_REPO_PATH/);
  });

  it('FR-4: a loud, NON-blocking coverage diagnostic warns when the ehg checkout is missing', () => {
    expect(YML).toMatch(/::warning title=VDR gauge coverage/);
    // the ehg checkout step carries an id, and the diagnostic gates on its outcome (precedent pattern)
    expect(YML).toMatch(/id:\s*ehg_checkout/);
    expect(YML).toMatch(/steps\.ehg_checkout\.outcome/);
  });
});
