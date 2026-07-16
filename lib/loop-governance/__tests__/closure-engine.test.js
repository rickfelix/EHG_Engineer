/**
 * Loop-governance closure engine tests (FR-3 CLOSED/OPEN/STARVED, FR-4 predicate
 * validation, FR-5 distance-to-rung).
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001)
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateLoopClosure,
  validateClosurePredicate,
  distanceToRung,
  LOOP_STATUS,
  PREDICATE_TYPES,
} from '../closure-engine.js';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();

describe('evaluateLoopClosure — edge_freshness (FR-3)', () => {
  const loop = { predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600 } };

  it('CLOSED when the closure edge is fresh', () => {
    const r = evaluateLoopClosure(loop, { edgeAt: ago(60), upstreamFiredAt: ago(120) }, NOW);
    expect(r.status).toBe(LOOP_STATUS.CLOSED);
  });

  it('OPEN when it fired but the edge is stale', () => {
    const r = evaluateLoopClosure(loop, { edgeAt: ago(7200), upstreamFiredAt: ago(120) }, NOW);
    expect(r.status).toBe(LOOP_STATUS.OPEN);
  });

  it('OPEN when it fired but the edge is absent', () => {
    const r = evaluateLoopClosure(loop, { edgeAt: null, upstreamFiredAt: ago(120) }, NOW);
    expect(r.status).toBe(LOOP_STATUS.OPEN);
  });

  it('STARVED when upstream never fired and no edge — not the loop fault', () => {
    const r = evaluateLoopClosure(loop, { edgeAt: null, upstreamFiredAt: null }, NOW);
    expect(r.status).toBe(LOOP_STATUS.STARVED);
  });
});

describe('evaluateLoopClosure — backlog_drained (FR-3)', () => {
  const loop = { predicate_type: PREDICATE_TYPES.BACKLOG_DRAINED, closure_predicate: { threshold: 0 } };

  it('CLOSED when backlog is at/below threshold', () => {
    expect(evaluateLoopClosure(loop, { backlogCount: 0, upstreamFiredAt: ago(60) }, NOW).status).toBe(LOOP_STATUS.CLOSED);
  });
  it('OPEN when backlog exceeds threshold and upstream fired', () => {
    expect(evaluateLoopClosure(loop, { backlogCount: 5, upstreamFiredAt: ago(60) }, NOW).status).toBe(LOOP_STATUS.OPEN);
  });
  it('UNKNOWN when the backlog count is unavailable', () => {
    expect(evaluateLoopClosure(loop, { backlogCount: undefined }, NOW).status).toBe(LOOP_STATUS.UNKNOWN);
  });
});

describe('evaluateLoopClosure — witness_recent (FR-3)', () => {
  const loop = { predicate_type: PREDICATE_TYPES.WITNESS_RECENT, closure_predicate: { window_seconds: 90000 } };
  it('CLOSED when the witness is fresh', () => {
    expect(evaluateLoopClosure(loop, { witnessAt: ago(3600) }, NOW).status).toBe(LOOP_STATUS.CLOSED);
  });
  it('OPEN when the witness is stale', () => {
    expect(evaluateLoopClosure(loop, { witnessAt: ago(200000), upstreamFiredAt: ago(60) }, NOW).status).toBe(LOOP_STATUS.OPEN);
  });
});

describe('validateClosurePredicate (FR-4 — required-at-registration)', () => {
  it('accepts a well-formed edge_freshness predicate', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600, authorized_writer: 'reflection-emitter' } });
    expect(r.valid).toBe(true);
  });
  it('rejects a missing predicate_type', () => {
    const r = validateClosurePredicate({ closure_predicate: { window_seconds: 3600, authorized_writer: 'reflection-emitter' } });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/predicate_type/);
  });
  it('rejects edge_freshness without a positive window', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { authorized_writer: 'reflection-emitter' } });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/window_seconds/);
  });
  it('rejects backlog_drained without a threshold', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.BACKLOG_DRAINED, closure_predicate: { authorized_writer: 'reaper-cron' } });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/threshold/);
  });
  it('rejects a non-object closure_predicate', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: null });
    expect(r.valid).toBe(false);
  });

  // QF-20260716-579 (b) EVIDENCE PROVENANCE — a predicate that omits the authorized
  // writer is not machine-checkable: nothing stops a maker from authoring its own
  // closure evidence.
  it('rejects a well-formed edge_freshness predicate that omits authorized_writer', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600 } });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/authorized_writer/);
  });
  it('rejects an authorized_writer that is an empty string', () => {
    const r = validateClosurePredicate({ predicate_type: PREDICATE_TYPES.BACKLOG_DRAINED, closure_predicate: { threshold: 0, authorized_writer: '   ' } });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/authorized_writer/);
  });
});

// QF-20260716-579 (a) FRESHNESS WINDOW DECAY — proven on one real loop (L30's
// edge_freshness shape): a loop that evaluates CLOSED at time T with fresh evidence
// reverts to OPEN once that SAME evidence ages past the window on a later tick. No
// permanent CLOSE survives from a single historical write.
describe('evaluateLoopClosure — freshness-window decay (QF-20260716-579 rule a)', () => {
  const loop = { predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 3600, authorized_writer: 'session-coordination-reaper' } };
  const evidence = { edgeAt: ago(60), upstreamFiredAt: ago(120) }; // fresh relative to NOW

  it('is CLOSED at the tick when the evidence is fresh', () => {
    expect(evaluateLoopClosure(loop, evidence, NOW).status).toBe(LOOP_STATUS.CLOSED);
  });

  it('reverts to OPEN on a LATER tick once the SAME evidence has aged past the window', () => {
    const later = new Date(NOW.getTime() + 2 * 3600 * 1000); // +2h, well past the 1h window
    expect(evaluateLoopClosure(loop, evidence, later).status).toBe(LOOP_STATUS.OPEN);
  });
});

describe('distanceToRung (FR-5)', () => {
  it('counts closed vs open/starved/unknown and computes distance', () => {
    const r = distanceToRung([
      { status: LOOP_STATUS.CLOSED }, { status: LOOP_STATUS.CLOSED },
      { status: LOOP_STATUS.OPEN }, { status: LOOP_STATUS.STARVED }, { status: LOOP_STATUS.UNKNOWN },
    ]);
    expect(r.total).toBe(5);
    expect(r.closed).toBe(2);
    expect(r.distance).toBe(3); // total - closed
  });
});
