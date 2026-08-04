/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — FR-4: capture classification.
 *
 * Pure logic only, no database. The routing decision is the part worth pinning: misclassifying a
 * hold as an RPC apply would RESOLVE a decision the chairman explicitly left held, and
 * misclassifying an RPC apply as a hold would silently drop a decision he actually made.
 */
import { describe, it, expect } from 'vitest';
import { classifyCapture, extractUnparkTrigger } from '../../../scripts/apply-chairman-decision-captures.mjs';

const cap = (metadata, description = '') => ({ id: 'x', title: 't', description, metadata });

describe('classifyCapture — routing', () => {
  it('routes an approve capture to the RPC with the resolved action name', () => {
    expect(classifyCapture(cap({ decided: 'approve', decision_id: 'd1' })))
      .toEqual({ action: 'rpc', decisionId: 'd1', rpcAction: 'approved' });
  });

  it('routes a reject capture to the RPC', () => {
    expect(classifyCapture(cap({ decided: 'reject', decision_id: 'd2' })))
      .toEqual({ action: 'rpc', decisionId: 'd2', rpcAction: 'rejected' });
  });

  it('routes a ratified hold to mark_held, NOT to the RPC', () => {
    // The capture that motivated this: "NO RPC apply needed — the row deliberately stays pending
    // so it re-surfaces on unpark". Resolving it would destroy exactly the property it records.
    const r = classifyCapture(cap({ decided: 'hold_ratified', decision_id: 'd3', no_rpc_apply_needed: true }));
    expect(r.action).toBe('mark_held');
    expect(r.decisionId).toBe('d3');
  });

  it('no_rpc_apply_needed WINS over a decided value that looks like an RPC action', () => {
    // Order-of-checks guard. If the decided-branch were evaluated first, a hold carrying
    // decided:'approve' would be resolved. Asserting the precedence, not just the happy path.
    const r = classifyCapture(cap({ decided: 'approve', decision_id: 'd4', no_rpc_apply_needed: true }));
    expect(r.action).toBe('mark_held');
  });

  it('skips a capture with no decision_id rather than guessing a target', () => {
    expect(classifyCapture(cap({ decided: 'approve' })).action).toBe('skip');
  });

  it('skips an unrecognised decided value instead of defaulting to an action', () => {
    // Defaulting here would apply an action the chairman never chose. The SD's own FR-2 makes the
    // same argument for the SQL mapping: refuse, do not default.
    const r = classifyCapture(cap({ decided: 'maybe_later', decision_id: 'd5' }));
    expect(r.action).toBe('skip');
    expect(r.reason).toMatch(/maybe_later/);
  });
});

describe('extractUnparkTrigger', () => {
  it('prefers structured metadata over prose', () => {
    expect(extractUnparkTrigger(cap({ unpark_trigger: 'from metadata' }, 'text (trigger: from prose)')))
      .toBe('from metadata');
  });

  it('falls back to the documented "(trigger: ...)" clause', () => {
    expect(extractUnparkTrigger(cap({}, 're-surfaces on unpark (trigger: Sessions+Roadmap live in EHG, or explicit chairman direction).')))
      .toBe('Sessions+Roadmap live in EHG, or explicit chairman direction');
  });

  it('returns null when no trigger is recorded — so the caller can say so out loud', () => {
    // A hold with an invisible exit condition is the parked-forever shape. Returning null lets the
    // view render "trigger NOT RECORDED" rather than a bare HELD that looks deliberate.
    expect(extractUnparkTrigger(cap({}, 'no trigger here'))).toBeNull();
  });

  it('treats a whitespace-only metadata trigger as absent, not as a trigger', () => {
    expect(extractUnparkTrigger(cap({ unpark_trigger: '   ' }, 'no clause'))).toBeNull();
  });
});
