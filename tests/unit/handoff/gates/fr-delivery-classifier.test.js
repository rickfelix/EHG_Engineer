// Tests for SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001
// Real per-FR delivery classification + default-OFF warn-only enforcement + approver descope.

import { describe, it, expect } from 'vitest';
import {
  isFrTraceabilityEnforced,
  frIdOf,
  frReferencesId,
  isValidatedStory,
  descopeFor,
  classifyFrDelivery,
  projectGateResult,
} from '../../../../scripts/modules/handoff/gates/fr-delivery-classifier.js';

describe('FR-2: isFrTraceabilityEnforced — default OFF', () => {
  it('OFF when unset', () => expect(isFrTraceabilityEnforced({})).toBe(false));
  it('OFF for falsey strings', () => {
    for (const v of ['', '0', 'false', 'off', 'no']) expect(isFrTraceabilityEnforced({ LEO_FR_TRACEABILITY_ENFORCE: v })).toBe(false);
  });
  it('ON for truthy strings', () => {
    for (const v of ['1', 'true', 'on', 'YES']) expect(isFrTraceabilityEnforced({ LEO_FR_TRACEABILITY_ENFORCE: v })).toBe(true);
  });
});

describe('FR-1: frReferencesId — real per-FR mapping (word-boundary)', () => {
  it('matches the FR id in title/want/AC/notes', () => {
    expect(frReferencesId({ title: 'Implement FR-004 growth playbook' }, 'FR-004')).toBe(true);
    expect(frReferencesId({ user_want: 'as a user I want FR-005' }, 'FR-005')).toBe(true);
    expect(frReferencesId({ acceptance_criteria: [{ then: 'satisfies FR-001' }] }, 'FR-001')).toBe(true);
    expect(frReferencesId({ technical_notes: '{"fr":"FR-002"}' }, 'FR-002')).toBe(true);
  });
  it('does not false-match a different id (word boundary)', () => {
    expect(frReferencesId({ title: 'FR-0040 something' }, 'FR-004')).toBe(false);
    expect(frReferencesId({ title: 'XFR-004' }, 'FR-004')).toBe(false);
    expect(frReferencesId({ title: 'no fr here' }, 'FR-004')).toBe(false);
  });
  it('handles missing story/id', () => {
    expect(frReferencesId(null, 'FR-1')).toBe(false);
    expect(frReferencesId({ title: 'x' }, null)).toBe(false);
  });
});

describe('isValidatedStory', () => {
  it('true for completed/done/validated status or validation_status=validated', () => {
    for (const s of ['completed', 'done', 'validated']) expect(isValidatedStory({ status: s })).toBe(true);
    expect(isValidatedStory({ status: 'ready', validation_status: 'validated' })).toBe(true);
  });
  it('false for in-progress/draft', () => {
    expect(isValidatedStory({ status: 'ready' })).toBe(false);
    expect(isValidatedStory({ status: 'draft' })).toBe(false);
  });
});

describe('FR-4: descopeFor — approver-gated', () => {
  const md = { descoped_frs: [
    { fr_id: 'FR-005', approved_by: 'chairman', reason: 'deferred' },
    { fr_id: 'FR-006', approved_by: '' },             // no approver -> ignored
    { fr_id: 'FR-007', approved_by: 'me-session' },   // self-approval guarded below
  ] };
  it('honors a descope with a named approver', () => {
    expect(descopeFor(md, 'FR-005')).toBeTruthy();
  });
  it('ignores a descope without an approver', () => {
    expect(descopeFor(md, 'FR-006')).toBeNull();
  });
  it('rejects self-approval (approver == requester)', () => {
    expect(descopeFor(md, 'FR-007', 'me-session')).toBeNull();
    expect(descopeFor(md, 'FR-007', 'other-session')).toBeTruthy();
  });
  it('null when no descope list', () => expect(descopeFor({}, 'FR-1')).toBeNull());
});

// Injectable supabase stub: returns FRs from the PRD query and stories from user_stories.
function stub({ stories = [] } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) {
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

const FRS = [{ id: 'FR-001', requirement: 'a' }, { id: 'FR-002', requirement: 'b' }, { id: 'FR-003', requirement: 'c' }];

describe('FR-1: classifyFrDelivery', () => {
  it('classifies delivered / descoped / undelivered per-FR', async () => {
    const stories = [
      { id: 's1', title: 'do FR-001', status: 'completed' },
      { id: 's2', title: 'do FR-002', status: 'ready' }, // not validated -> not a delivery signal
    ];
    const c = await classifyFrDelivery(stub({ stories }), {
      sdId: 'sd-1', functionalRequirements: FRS,
      sdMetadata: { descoped_frs: [{ fr_id: 'FR-003', approved_by: 'lead-final' }] },
    });
    const byId = Object.fromEntries(c.frs.map((f) => [f.id, f.status]));
    expect(byId['FR-001']).toBe('delivered');     // validated story references it
    expect(byId['FR-002']).toBe('undelivered');   // story exists but not validated
    expect(byId['FR-003']).toBe('descoped');      // approver-gated descope
    expect(c).toMatchObject({ total: 3, delivered: 1, descoped: 1, undelivered: 1 });
  });
});

describe('FR-2: projectGateResult — flag gating', () => {
  const undeliveredClass = { frs: [{ id: 'FR-002', description: 'b', status: 'undelivered' }, { id: 'FR-001', description: 'a', status: 'delivered' }], total: 2, delivered: 1, descoped: 0, undelivered: 1 };
  const allGoodClass = { frs: [{ id: 'FR-001', description: 'a', status: 'delivered' }], total: 1, delivered: 1, descoped: 0, undelivered: 0 };

  it('ON + undelivered -> hard fail (passed:false, required:true)', () => {
    const r = projectGateResult(undeliveredClass, { enforced: true });
    expect(r.passed).toBe(false);
    expect(r.required).toBe(true);
    expect(r.issues.join(' ')).toMatch(/undelivered/i);
  });
  it('OFF + undelivered -> warn-only (passed:true, required:false, FULL score, warning lists FR)', () => {
    const r = projectGateResult(undeliveredClass, { enforced: false });
    expect(r.passed).toBe(true);
    expect(r.required).toBe(false);
    expect(r.score).toBe(100);                 // NOT diluted -> zero blast radius
    expect(r.warnings.join(' ')).toMatch(/FR-002/);
    expect(r.details.raw_score).toBe(50);      // real coverage preserved in details
  });
  it('OFF pass-path is invariant regardless of undelivered count', () => {
    const many = { frs: [], total: 5, delivered: 0, descoped: 0, undelivered: 5 };
    const r = projectGateResult(many, { enforced: false });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });
  it('all delivered -> pass either way; required mirrors the flag', () => {
    expect(projectGateResult(allGoodClass, { enforced: false })).toMatchObject({ passed: true, required: false });
    expect(projectGateResult(allGoodClass, { enforced: true })).toMatchObject({ passed: true, required: true });
  });
  it('no FRs -> pass, required:false', () => {
    const r = projectGateResult({ frs: [], total: 0, delivered: 0, descoped: 0, undelivered: 0 }, { enforced: true });
    expect(r).toMatchObject({ passed: true, required: false });
  });
});

describe('frIdOf', () => {
  it('uses fr.id then falls back to FR-<n>', () => {
    expect(frIdOf({ id: 'FR-009' }, 0)).toBe('FR-009');
    expect(frIdOf({}, 3)).toBe('FR-4');
  });
});
