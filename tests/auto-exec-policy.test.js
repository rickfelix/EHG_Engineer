/**
 * Unit tests (no DB) for the auto-exec policy gates.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001B.
 */
import { describe, it, expect } from 'vitest';
import {
  REQUIRED_POLICY_FACETS,
  DEFAULT_GUARDRAIL_PATHS,
  classifyReversibility,
  checkPathOverlap,
  validatePolicyShape,
  decideAutoExecEligibility,
} from '../lib/auto-exec-policy.js';

const FORBIDDEN = ['hard_delete', 'prod_purge_no_soft_delete', 'external_email', 'repo_delete', 'force_push'];

describe('classifyReversibility (FM-C)', () => {
  it('soft-delete with a rollback window is reversible (near-miss vs hard_delete)', () => {
    const r = classifyReversibility({ action_class: 'soft_delete', reversible: true, rollback_window_ms: 600000 }, { forbiddenClasses: FORBIDDEN });
    expect(r.eligible).toBe(true);
    expect(r.verdict).toBe('reversible');
  });
  it('hard-delete is FORBIDDEN (in the forbidden set)', () => {
    const r = classifyReversibility({ action_class: 'hard_delete', reversible: true, rollback_window_ms: 600000 }, { forbiddenClasses: FORBIDDEN });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/forbidden set/);
  });
  it('internal notify reversible vs external email FORBIDDEN (outward-facing)', () => {
    expect(classifyReversibility({ action_class: 'internal_notify', reversible: true, rollback_window_ms: 1000 }, { forbiddenClasses: FORBIDDEN }).eligible).toBe(true);
    const ext = classifyReversibility({ action_class: 'external_email', outward_facing: true, reversible: true, rollback_window_ms: 1000 }, { forbiddenClasses: FORBIDDEN });
    expect(ext.eligible).toBe(false);
    expect(ext.reason).toMatch(/forbidden set|outward-facing/);
  });
  it('outward-facing alone is FORBIDDEN even if class is not listed', () => {
    const r = classifyReversibility({ action_class: 'novel_broadcast', outward_facing: true, reversible: true, rollback_window_ms: 1000 }, { forbiddenClasses: FORBIDDEN });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/outward-facing/);
  });
  it('reversible=true but no rollback window → FORBIDDEN (default-safe)', () => {
    expect(classifyReversibility({ action_class: 'x', reversible: true, rollback_window_ms: 0 }).eligible).toBe(false);
  });
  it('unknown/ambiguous action → FORBIDDEN (fail-safe)', () => {
    expect(classifyReversibility({ action_class: 'mystery' }).eligible).toBe(false);
  });
  it('missing action_class / garbage → FORBIDDEN', () => {
    expect(classifyReversibility(null).eligible).toBe(false);
    expect(classifyReversibility({}).eligible).toBe(false);
  });
});

describe('checkPathOverlap (FM-D, file side)', () => {
  it('blocks settings.json', () => expect(checkPathOverlap('.claude/settings.json').blocked).toBe(true));
  it('blocks a guardrail table identifier', () => expect(checkPathOverlap('leo_feature_flags').blocked).toBe(true));
  it('blocks a path INSIDE a guardrail dir', () => expect(checkPathOverlap('.claude/settings.json/nested').blocked).toBe(true));
  it('blocks a parent of a guardrail path', () => expect(checkPathOverlap('.claude').blocked).toBe(true));
  it('allows an unrelated target', () => expect(checkPathOverlap('src/components/Foo.tsx').blocked).toBe(false));
  it('normalizes backslashes and ./ prefix', () => expect(checkPathOverlap('.\\.claude\\settings.json').blocked).toBe(true));
  it('blocks empty target (default-safe)', () => expect(checkPathOverlap('').blocked).toBe(true));
  it('respects a custom guardrail set', () => {
    expect(checkPathOverlap('secret.env', { guardrailPaths: ['secret.env'] }).blocked).toBe(true);
  });
});

describe('validatePolicyShape (fail-closed)', () => {
  const complete = Object.fromEntries(REQUIRED_POLICY_FACETS.map((f) => [f, { x: 1 }]));
  it('ok when every facet present', () => expect(validatePolicyShape(complete).ok).toBe(true));
  it('not-ok and lists the missing facet', () => {
    const partial = { ...complete }; delete partial.rollback;
    const r = validatePolicyShape(partial);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('rollback');
  });
  it('not-ok for null', () => expect(validatePolicyShape(null).ok).toBe(false));
  it('exposes the canonical 6 facets', () => expect(REQUIRED_POLICY_FACETS).toHaveLength(6));
  it('default guardrails include settings.json and the 4 guardrail tables', () => {
    expect(DEFAULT_GUARDRAIL_PATHS).toEqual(expect.arrayContaining(['.claude/settings.json', 'leo_feature_flags', 'leo_kill_switches', 'leo_auto_exec_policy', 'leo_auto_exec_forbidden']));
  });
});

describe('decideAutoExecEligibility (composed)', () => {
  const policy = Object.fromEntries(REQUIRED_POLICY_FACETS.map((f) => [f, {}]));
  const goodAction = { action_class: 'checkout_sync', target: 'git-stash', reversible: true, rollback_window_ms: 600000 };
  it('eligible when all gates pass', () => {
    const d = decideAutoExecEligibility(goodAction, { policy, forbiddenClasses: FORBIDDEN });
    expect(d.eligible).toBe(true);
  });
  it('blocked at reversibility for a forbidden class', () => {
    const d = decideAutoExecEligibility({ ...goodAction, action_class: 'hard_delete' }, { policy, forbiddenClasses: FORBIDDEN });
    expect(d).toMatchObject({ eligible: false, gate: 'reversibility' });
  });
  it('blocked at path-overlap when targeting a guardrail', () => {
    const d = decideAutoExecEligibility({ ...goodAction, target: '.claude/settings.json' }, { policy, forbiddenClasses: FORBIDDEN });
    expect(d).toMatchObject({ eligible: false, gate: 'path-overlap' });
  });
  it('blocked at policy when the policy is incomplete', () => {
    const partial = { ...policy }; delete partial.canary;
    const d = decideAutoExecEligibility(goodAction, { policy: partial, forbiddenClasses: FORBIDDEN });
    expect(d).toMatchObject({ eligible: false, gate: 'policy' });
  });
});
