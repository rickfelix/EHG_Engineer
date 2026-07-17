/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-3 — fail-closed LOW/MEDIUM/HIGH classifier.
 */
import { describe, it, expect } from 'vitest';
import { classifyConsequence } from '../../../lib/chairman/consequence-classifier.js';

describe('classifyConsequence — HIGH keyword categories', () => {
  it('venture kill', () => {
    expect(classifyConsequence({ title: 'Should we kill the Alt-Text venture?' })).toBe('high');
  });
  it('large spend (>= $5,000)', () => {
    expect(classifyConsequence({ title: 'Approve a $6,000 ad spend?' })).toBe('high');
    expect(classifyConsequence({ title: 'Approve a $10k contractor invoice?' })).toBe('high');
  });
  it('governance change', () => {
    expect(classifyConsequence({ title: 'Change the governance structure for VP_MARKETING?' })).toBe('high');
  });
  it('secrets/credentials', () => {
    expect(classifyConsequence({ title: 'Rotate the API key credentials now?' })).toBe('high');
  });
  it('contracts', () => {
    expect(classifyConsequence({ title: 'Sign the vendor contract?' })).toBe('high');
  });
  it('irreversible prod change', () => {
    expect(classifyConsequence({ title: 'Drop the prod table, this is irreversible' })).toBe('high');
  });
});

describe('classifyConsequence — fail-closed default', () => {
  it('unrecognized/unmatched input classifies HIGH, not LOW or MEDIUM', () => {
    expect(classifyConsequence({ title: 'xqzplorf frobnicate the widget' })).toBe('high');
    expect(classifyConsequence({})).toBe('high');
  });
});

describe('classifyConsequence — LOW', () => {
  it('plain scheduling/preference questions', () => {
    expect(classifyConsequence({ title: 'Which time works better for the call, 2pm or 4pm?' })).toBe('low');
    expect(classifyConsequence({ title: 'Quick FYI on venture progress' })).toBe('low');
  });
});

describe('classifyConsequence — MEDIUM', () => {
  it('a small, real dollar amount below the HIGH threshold', () => {
    expect(classifyConsequence({ title: 'Approve a $200 tool subscription?' })).toBe('medium');
  });
  it('bounded operational approve/pause/defer without risk keywords', () => {
    expect(classifyConsequence({ title: 'Approve the blog post draft?' })).toBe('medium');
  });
});

// Adversarial review findings (deep-tier PR #6093) — regression coverage for two
// confirmed classifier bypasses.
describe('classifyConsequence — adversarial-review regressions', () => {
  it('venture-shutdown phrased with "venture" BEFORE "shut down" still classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Venture Zeta pivot: shut it down?' })).toBe('high');
  });
  it('a >=$5,000 spend phrased without a $ prefix or "dollars" suffix still classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Approve 5000 USD for the campaign?' })).toBe('high');
    expect(classifyConsequence({ title: 'Approve a 5,000 payment to the vendor?' })).toBe('high');
    expect(classifyConsequence({ title: 'Proceed with a 6000 spend on ads?' })).toBe('high');
  });
});

// SD-LEO-INFRA-ADAM-PRE-SEND-001 FR-2 — Adam's pre-send consult rubric extends this ONE
// shared taxonomy with governance classes. Each must resolve HIGH (fail-toward-consult).
describe('classifyConsequence — SD-1 governance classes (Adam pre-send rubric)', () => {
  it('authority / permission / privilege / role changes classify HIGH', () => {
    expect(classifyConsequence({ title: 'Grant admin access to the new operator?' })).toBe('high');
    expect(classifyConsequence({ title: 'Escalate privileges for the deploy bot?' })).toBe('high');
    expect(classifyConsequence({ title: 'Revoke the service-role authority for venture-2' })).toBe('high');
    expect(classifyConsequence({ decisionType: 'authority_change', title: 'Adjust role authority' })).toBe('high');
  });
  it('new-mechanism / precedent-setting designs classify HIGH', () => {
    expect(classifyConsequence({ title: 'Introduce a new gate in the dispatch path?' })).toBe('high');
    expect(classifyConsequence({ title: 'This is precedent-setting for future ventures' })).toBe('high');
    expect(classifyConsequence({ title: 'Ship a new policy for auto-approval' })).toBe('high');
  });
  it('chairman control-surface changes classify HIGH', () => {
    expect(classifyConsequence({ title: 'Change the chairman approval flow' })).toBe('high');
    expect(classifyConsequence({ title: 'Modify the chairman dashboard config' })).toBe('high');
    expect(classifyConsequence({ title: 'Loosen the kill-gate threshold' })).toBe('high');
  });
  it('security-sensitive webhook-deploy (the origin-miss class) classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Deploy the Stripe webhook endpoint to prod' })).toBe('high');
    expect(classifyConsequence({ title: 'Set the webhook secret for the integration host' })).toBe('high');
  });
  it('does NOT over-broaden: benign sends without a governance keyword keep their prior class', () => {
    expect(classifyConsequence({ title: 'Which time works better for the call, 2pm or 4pm?' })).toBe('low');
    expect(classifyConsequence({ title: 'Approve the blog post draft?' })).toBe('medium');
  });
});

// SD-1 security-review follow-up (adversarial finding #2b): the origin-miss class reworded
// as an approval previously escaped the fail-closed HIGH default via a MEDIUM 'approve'
// keyword because prod<->deploy was one-directional. These must now classify HIGH.
describe('classifyConsequence — finding #2b: prod/deploy/migrate bidirectional escapes', () => {
  it('"the deployment to production" (deploy BEFORE prod) classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Approve the deployment to production' })).toBe('high');
    expect(classifyConsequence({ title: 'Approve config change to production database' })).toBe('high');
    expect(classifyConsequence({ title: 'Proceed with the callback endpoint wiring on prod host' })).toBe('high');
  });
  it('migration rollback/revert classifies HIGH', () => {
    expect(classifyConsequence({ title: 'Approve rollback of the migration' })).toBe('high');
    expect(classifyConsequence({ title: 'Revert the schema migration on staging' })).toBe('high');
  });
});
