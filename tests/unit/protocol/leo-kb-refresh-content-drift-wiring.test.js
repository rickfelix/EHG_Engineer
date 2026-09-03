// SD-LEO-ORCH-CAPA-CONTRACT-TRUTH-001-A (FR-1/FR-3/FR-6), Phase 3.
//
// THE PREMISE THIS SD SHIPPED WITH WAS WRONG, and measuring the workflow is what caught it. The
// SD said no regen-on-write existed. leo-kb-refresh.yml DID already regenerate and push to main
// on push + cron + workflow_dispatch — but it gated ONLY on check-leo-version.js, i.e. PROTOCOL
// VERSION drift. A write to leo_protocol_sections that changed section CONTENT without bumping
// the version left that job doing nothing, so the rendered contracts stayed stale while a
// workflow named "KB refresh" reported success. Version consistency and content freshness are
// different predicates, and the fix was to add the missing one rather than to build a new trigger.
//
// These assertions exist because the failure mode is a SILENT REVERT: dropping the content-drift
// clause from that `if` would restore the original blind spot while leaving a green workflow that
// still looks like it refreshes the contracts. Nothing else in the repo would notice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const WORKFLOW = '.github/workflows/leo-kb-refresh.yml';

const load = () => yaml.load(fs.readFileSync(path.join(repoRoot, WORKFLOW), 'utf8'));
const steps = () => {
  const doc = load();
  return doc.jobs[Object.keys(doc.jobs)[0]].steps;
};
const stepNamed = (re) => steps().find((s) => re.test(s.name || ''));

describe('leo-kb-refresh: regeneration fires on CONTENT drift, not only version drift', () => {
  it('has a content-drift check step that runs the shared drift checker', () => {
    const step = steps().find((s) => s.id === 'content-check');
    expect(step, 'the content-check step must exist').toBeTruthy();
    // Must reuse the SAME checker CI and the pre-commit hook enforce — one definition of drift,
    // not a third hand-rolled comparison.
    expect(step.run).toMatch(/check-claude-md-drift\.cjs/);
  });

  it('gates regeneration on content drift OR version drift — never version alone', () => {
    const regen = stepNamed(/Regenerate CLAUDE files/);
    expect(regen).toBeTruthy();
    expect(regen.if, 'content_drift must be part of the condition').toMatch(/content-check\.outputs\.content_drift/);
    // The original predicate must survive: this ADDS a trigger, it does not replace one.
    expect(regen.if, 'version_drift must still trigger regeneration').toMatch(/version-check\.outputs\.version_drift/);
  });

  it('captures the checker exit code instead of letting it kill the step', () => {
    // Actions runs these shells with -eo pipefail, so a non-zero exit aborts the step before $?
    // can be read — and the drift checker's exit code IS the signal. Without `set +e` the whole
    // wiring silently never reports drift. This is the bug this test was written after hitting.
    const step = steps().find((s) => s.id === 'content-check');
    expect(step.run).toMatch(/set \+e/);
    expect(step.run).toMatch(/EXIT_CODE=\$\?/);
  });

  it('treats exit 2 as fail-open, so an unavailable detector cannot cause a blind push to main', () => {
    const step = steps().find((s) => s.id === 'content-check');
    // Exit 2 is the checker's documented internal-error code. Regenerating and pushing on it
    // would mean acting on a measurement that was never taken.
    expect(step.run).toMatch(/content_drift=false/);
    expect(step.run).toMatch(/internal error/i);
  });
});

describe('leo-kb-refresh: the regeneration proves its own work converged (FR-3 second site)', () => {
  it('re-runs the drift checker AFTER regenerating', () => {
    // Parent SC#1 requires the drift check at two invocation sites: "in CI and on the regen hook".
    // This is the regen-side one — the step that regenerates verifies itself rather than leaving
    // CI to discover later that it did not converge.
    const regen = stepNamed(/Regenerate CLAUDE files/);
    const occurrences = (regen.run.match(/check-claude-md-drift\.cjs/g) || []).length;
    expect(occurrences, 'the regenerate step must verify drift after regenerating').toBeGreaterThanOrEqual(1);
  });

  it('FAILS the job when drift persists after regenerating', () => {
    // Pushing here would ship a change that claims to fix drift while leaving it in place.
    const regen = stepNamed(/Regenerate CLAUDE files/);
    expect(regen.run).toMatch(/VERIFY_CODE/);
    expect(regen.run).toMatch(/exit 1/);
    expect(regen.run).toMatch(/non-convergent/i);
  });

  it('wraps the post-regen check in set +e too, for the same -e reason', () => {
    const regen = stepNamed(/Regenerate CLAUDE files/);
    expect(regen.run).toMatch(/set \+e[\s\S]*check-claude-md-drift\.cjs[\s\S]*VERIFY_CODE=\$\?/);
  });
});

describe('leo-kb-refresh: FR-6 — the preventive is enforcing, not advisory', () => {
  it('has no continue-on-error anywhere in the workflow', () => {
    // An advisory wiring reports pass regardless of findings. eol-renormalization-lint.yml is the
    // live example in this repo of a check that stayed green over a real violation for weeks
    // because of exactly that, so FR-6 explicitly excludes it as satisfaction.
    expect(JSON.stringify(load())).not.toMatch(/continue-on-error/);
  });

  it('still targets this workflow and not the advisory drift workflow', () => {
    // leo-drift-check.yml is similarly named, IS continue-on-error, and checks an unrelated
    // subject (PRD/handoff filesystem drift). Wiring contract regeneration there would be a
    // check that cannot fail.
    expect(fs.existsSync(path.join(repoRoot, WORKFLOW))).toBe(true);
  });
});
