/**
 * SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 — FR-4 (seat capability fails DOWN) and
 * FR-5 (unknown capability is loudly observable).
 *
 * THE DIRECTIONAL TRAP THIS FILE EXISTS TO PIN: fail-safe for SEAT CAPABILITY and
 * fail-safe for WORK DEMAND point in OPPOSITE directions. Assuming an unmeasured
 * WORKER is strong hands it work it may not be able to do; assuming unclassified
 * WORK is easy routes it to a seat that cannot handle it. A single shared
 * "unknown resolves to X" helper cannot serve both — that conflation is how a live
 * seat with zero capability evidence came to be rated top-tier and eligible for the
 * hardest work in the fleet.
 *
 * So the two contracts are asserted side by side, in the same file, on the SAME
 * inputs. If a future change ever makes them agree on an unknown model, these fail
 * — which is the entire point. normalizeModel was NOT flipped; a seat-scoped
 * resolver was added beside it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ladder = require('../../../lib/fleet/tier-ladder.cjs');
const {
  normalizeModel, resolveSeatModel, seatCapabilityScore, seatRankForModelEffort,
  capabilityScore, rankForModelEffort, stampRankForWorker, deriveLiveLadder,
  setUnresolvedCapabilitySink, drainUnresolvedCapabilityEvents,
  UNRESOLVED_CAPABILITY_TOKEN, WEAKEST_MODEL, MODEL_STRENGTH,
  __resetLadderCacheForTests,
} = ladder;

// Capture FR-5 events instead of letting them reach stderr during the run.
let events;
beforeEach(() => {
  events = [];
  setUnresolvedCapabilitySink((e) => events.push(e));
  drainUnresolvedCapabilityEvents();
});
afterEach(() => {
  setUnresolvedCapabilitySink(null);
  drainUnresolvedCapabilityEvents();
  if (typeof __resetLadderCacheForTests === 'function') __resetLadderCacheForTests();
});

describe('FR-4: seat capability resolves unknown DOWN, demand still resolves UP', () => {
  it('TS-5: an unrecognized model is WEAKEST for a seat and STRONGEST for demand', () => {
    const unknown = 'gemini-3-5-pro';
    expect(resolveSeatModel(unknown)).toBe(WEAKEST_MODEL);
    expect(normalizeModel(unknown)).not.toBe(WEAKEST_MODEL);
    // The two must genuinely disagree — this is the invariant, not an implementation detail.
    expect(resolveSeatModel(unknown)).not.toBe(normalizeModel(unknown));
  });

  it('TS-5: an empty/missing model is WEAKEST for a seat', () => {
    expect(resolveSeatModel('')).toBe(WEAKEST_MODEL);
    expect(resolveSeatModel(undefined)).toBe(WEAKEST_MODEL);
  });

  it('a RECOGNIZABLE versioned id is never treated as unknown by either resolver', () => {
    // Preserves the QF-20260724-245 fix: "a recognizable id is not an unknown model".
    expect(resolveSeatModel('claude-opus-5[1m]')).toBe('opus');
    expect(normalizeModel('claude-opus-5[1m]')).toBe('opus');
    // And no live seat changes rank as a result of FR-4.
    expect(seatRankForModelEffort('claude-opus-5[1m]', 'high')).toBe(rankForModelEffort('opus', 'high'));
  });

  it('multi-family ids resolve strongest-match in BOTH resolvers (explicit, not accidental)', () => {
    // The SD is silent on ambiguous ids; the direction is decided here rather than
    // inherited by accident. Strongest-match keeps seat and demand agreeing whenever a
    // family IS resolvable — they diverge only on genuinely unknown input.
    expect(resolveSeatModel('claude-opus-and-fable-hybrid')).toBe('fable');
    expect(normalizeModel('claude-opus-and-fable-hybrid')).toBe('fable');
  });

  it('GAP-3: the unknown-model score genuinely MOVED (was top-of-ladder, now bottom)', () => {
    // Before this SD, rankForModelEffort('gemini-3-5-pro','high') === rankForModelEffort('fable','high').
    // The demand-side helper still behaves that way; the seat-side path must not.
    expect(rankForModelEffort('gemini-3-5-pro', 'high')).toBe(rankForModelEffort('fable', 'high'));
    expect(seatRankForModelEffort('gemini-3-5-pro', 'high')).toBeLessThan(rankForModelEffort('fable', 'high'));
    expect(seatCapabilityScore('gemini-3-5-pro', 'high')).toBeLessThan(capabilityScore('gemini-3-5-pro', 'high'));
  });

  it('a seat stamp for an unrecognized model no longer lands at the top rung', () => {
    const session = { session_id: 'w-unknown', metadata: { model: 'gemini-3-5-pro', effort: 'high' } };
    const known = { session_id: 'w-known', metadata: { model: 'opus', effort: 'high' } };
    expect(stampRankForWorker(session, [])).toBeLessThan(stampRankForWorker(known, []));
  });

  it('one unrecognized seat no longer inflates the live ladder for everyone else', () => {
    // deriveLiveLadder dense-ranks the fleet; resolving an unknown seat UP made it
    // outrank every real seat and shifted every rung.
    const { entries } = deriveLiveLadder([
      { model: 'gemini-3-5-pro', effort: 'high' },
      { model: 'opus', effort: 'high' },
    ]);
    const unknownEntry = entries.find((e) => e.model === WEAKEST_MODEL);
    const opusEntry = entries.find((e) => e.model === 'opus');
    expect(unknownEntry).toBeDefined();
    expect(opusEntry).toBeDefined();
    expect(MODEL_STRENGTH[unknownEntry.model]).toBeLessThan(MODEL_STRENGTH[opusEntry.model]);
  });
});

describe('FR-5: capability resolved from absent or unrecognized evidence is observable', () => {
  it('TS-7: an unrecognized model emits an event naming the session and the raw string', () => {
    stampRankForWorker({ session_id: 'w1', metadata: { model: 'gemini-3-5-pro', effort: 'high' } }, []);
    const e = events.find((x) => x.reason === 'unrecognized_model');
    expect(e).toBeDefined();
    expect(e.token).toBe(UNRESOLVED_CAPABILITY_TOKEN);
    expect(e.raw_model).toBe('gemini-3-5-pro');
    expect(e.context).toBe('w1');
    expect(e.resolved_to).toBe(WEAKEST_MODEL);
  });

  it('TS-7: a seat with NO model stamp emits the same class of event', () => {
    // This is the seat-08d7f71d case: an unset model short-circuits before any model
    // resolver, so FR-4 never sees it. It is REPORTED here, not silently re-ranked —
    // the ladderTopRank default is deliberately left unchanged by this SD.
    stampRankForWorker({ session_id: 'w2', metadata: {} }, []);
    const e = events.find((x) => x.reason === 'no_model_stamp');
    expect(e).toBeDefined();
    expect(e.token).toBe(UNRESOLVED_CAPABILITY_TOKEN);
    expect(e.context).toBe('w2');
  });

  it('a fully-stamped seat emits NOTHING (no false positives)', () => {
    stampRankForWorker({ session_id: 'w3', metadata: { model: 'claude-opus-5[1m]', effort: 'high' } }, []);
    expect(events).toHaveLength(0);
  });

  it('events are also buffered for a consumer that installs no sink', () => {
    setUnresolvedCapabilitySink(null);
    drainUnresolvedCapabilityEvents();
    resolveSeatModel('gemini-3-5-pro', 'buffer-check');
    const drained = drainUnresolvedCapabilityEvents();
    expect(drained.some((e) => e.context === 'buffer-check')).toBe(true);
    // Draining is destructive, so a second drain is empty.
    expect(drainUnresolvedCapabilityEvents()).toHaveLength(0);
  });

  it('a throwing sink never breaks ranking (observability is not load-bearing)', () => {
    setUnresolvedCapabilitySink(() => { throw new Error('sink exploded'); });
    expect(() => seatRankForModelEffort('gemini-3-5-pro', 'high')).not.toThrow();
  });
});
