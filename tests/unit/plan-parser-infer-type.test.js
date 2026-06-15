/**
 * SD-LEO-INFRA-ADAM-CREATION-PROCESS-001 (FR-1 regression).
 *
 * inferSDType keyword inference used to mis-type an infrastructure plan as 'bugfix' when
 * the plan merely mentioned "fix" (the bug/fix check fired before the weaker infra
 * signals). The fix adds a HIGH-CONFIDENCE infra check (literal "infrastructure" word or
 * an SD-LEO-INFRA-* token) AFTER the security check but BEFORE the bug/fix check. These
 * tests lock BOTH directions: explicit infra wins over an incidental "fix", AND a genuine
 * bugfix (no infra declaration) still classifies 'bugfix' — no false infra promotion.
 *
 * Note: an explicit `## Type` header or the --type flag still wins over inference entirely
 * (handled in scripts/leo-create-sd.js); this covers ONLY the no-explicit-type fallback.
 */
import { describe, it, expect } from 'vitest';
import { inferSDType } from '../../scripts/modules/plan-parser.js';

describe('inferSDType — FR-1 infra-vs-fix precedence', () => {
  it('infers infrastructure when an SD-LEO-INFRA-* key token appears alongside "fix" (the regression — high-confidence token wins)', () => {
    // The original mis-typed plan was child F of SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001;
    // the canonical key token is the high-confidence signal that beats the incidental "fix".
    const plan = 'Child F of SD-LEO-INFRA-ADAM-AUTONOMY-HARDENING-001. Fix the canonical create path so child linkage is wired automatically.';
    expect(inferSDType(plan)).toBe('infrastructure');
  });

  it('infers the actual ADAM-CREATION-PROCESS plan title as infrastructure (word check, no bug keyword)', () => {
    expect(inferSDType('# Adam SD-creation process hardening infrastructure: governed canonical create path with correct type and key')).toBe('infrastructure');
  });

  // ── Over-promotion guard (adversarial review HIGH): the BARE word "infrastructure" is
  //    NOT high-confidence — a genuine bugfix that merely names an infra component must
  //    stay 'bugfix' (the bug/fix check wins over the lower-priority bare-word infra check). ──
  it('does NOT over-promote a bugfix that merely mentions the word "infrastructure" (no token)', () => {
    expect(inferSDType('Fix the infrastructure deployment bug that causes errors in CI')).toBe('bugfix');
    expect(inferSDType('Patch the infrastructure worker that is broken and failing on startup')).toBe('bugfix');
  });

  it('does NOT promote a genuine bugfix to infrastructure (no infra declaration)', () => {
    // "fix the deploy script" mentions a weak infra signal ("script") but no explicit
    // infrastructure declaration — must stay 'bugfix' (the bug/fix check still wins).
    expect(inferSDType('Fix the broken deploy script that is failing on release.')).toBe('bugfix');
  });

  it('still maps a security plan to bugfix even when it mentions infrastructure (security check is first)', () => {
    expect(inferSDType('Patch the security vulnerability in the CI infrastructure and fix the exposure.')).toBe('bugfix');
  });

  it('still classifies a weak-signal infra plan (no "fix") as infrastructure via the existing check', () => {
    expect(inferSDType('Add CI/CD pipeline automation tooling for the build.')).toBe('infrastructure');
  });

  it('defaults a plain feature plan to feature', () => {
    expect(inferSDType('Add a new dashboard widget that shows venture growth metrics to users.')).toBe('feature');
  });

  it('empty content defaults to feature', () => {
    expect(inferSDType('')).toBe('feature');
    expect(inferSDType(null)).toBe('feature');
  });
});
