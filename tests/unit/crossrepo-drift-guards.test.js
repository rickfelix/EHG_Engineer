/**
 * SD-LEO-INFRA-CROSSREPO-DRIFT-GUARDS-EHG-PAT-001 — config-coherence regression guard for the two
 * cross-repo drift workflows. Pins: (FR-1/FR-2) the sibling checkout uses the scoped EHG_RO_PAT, not
 * the default GITHUB_TOKEN; (FR-3) the job-level continue-on-error is removed so a configured-token
 * checkout FAILURE actually fails the job, while the DIVERGENCE/DRIFT compare stays advisory at the
 * step level. Parses the YAML so a future revert (re-adding GITHUB_TOKEN or job-level
 * continue-on-error) is caught here, not silently after a 12-day green-mask.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const WORKFLOWS = [
  { file: '.github/workflows/design-prompts-cross-repo.yml', compareStepId: 'compare_prompts' },
  { file: '.github/workflows/venture-stages-drift-guard.yml', compareStepId: 'drift_check' },
];

function loadJob(file) {
  const doc = yaml.load(readFileSync(join(repoRoot, file), 'utf8'));
  return Object.values(doc.jobs)[0];
}

describe.each(WORKFLOWS)('cross-repo drift workflow $file', ({ file, compareStepId }) => {
  const job = loadJob(file);
  const steps = job.steps;
  const sibling = steps.find((s) => s.id === 'sibling_checkout');
  const gate = steps.find((s) => s.name === 'Sibling checkout outcome gate');
  const compare = steps.find((s) => s.id === compareStepId);

  it('FR-1/FR-2: the sibling checkout token falls back to EHG_RO_PAT, NOT GITHUB_TOKEN', () => {
    expect(sibling).toBeTruthy();
    const token = sibling.with.token;
    expect(token).toContain('EHG_RO_PAT');
    expect(token).not.toContain('GITHUB_TOKEN');
  });

  it('FR-3: job-level continue-on-error is REMOVED (a token-lapse checkout failure fails the job)', () => {
    expect('continue-on-error' in job).toBe(false);
  });

  it('FR-3: an outcome gate fails LOUD (exit 1) only when a token is configured', () => {
    expect(gate).toBeTruthy();
    expect(gate.if).toContain("steps.sibling_checkout.outcome != 'success'");
    // maps both token secrets to env so a configured-but-failed checkout is distinguishable
    expect(gate.env).toHaveProperty('EHG_RO_PAT');
    expect(gate.env).toHaveProperty('GH_TOKEN_CROSS_REPO');
    expect(gate.run).toContain('exit 1');     // configured token + failure -> hard fail
    expect(gate.run).toContain('::error');     // loud annotation
    expect(gate.run).toContain('::warning');   // no token -> advisory skip
  });

  it('FR-3: the divergence/drift compare stays ADVISORY at the step level', () => {
    expect(compare).toBeTruthy();
    expect(compare['continue-on-error']).toBe(true);
    expect(compare.if).toContain("steps.sibling_checkout.outcome == 'success'");
  });
});
