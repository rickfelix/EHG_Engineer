/**
 * Shared WORK_ASSIGNMENT target resolver.
 * SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (FR-1, FR-4, FR-5, TR-1).
 *
 * The defect being fixed is a writer/reader ASYMMETRY: the dispatch side reads the top-level
 * row.target_sd column, the worker side never did. These tests pin the two properties that make
 * the shared resolver safe to adopt — additivity and refusal-over-guessing — plus the
 * circular-require trap that would make the whole fix silently inert.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const {
  resolveAssignmentTarget, resolveAssignmentTargetKey, PROFILES, SOURCES, NEWLY_TAUGHT
} = require_(path.join(REPO, 'lib/fleet/assignment-target.cjs'));

const row = (over = {}) => ({ subject: '', body: '', payload: {}, ...over });

describe('resolveAssignmentTarget — structured sources', () => {
  it('reads the TOP-LEVEL target_sd column — the location the worker side was blind to', () => {
    // This is the 10-row cohort that motivated the SD: valid to every dispatch guard
    // (assertSdDispatchable reads row.target_sd FIRST), invisible to the worker.
    const r = row({ target_sd: 'QF-20260726-642' });
    const v = resolveAssignmentTarget(r, { profile: 'worker' });
    expect(v.key).toBe('QF-20260726-642');
    expect(v.source).toBe('top.target_sd');
  });

  it('reads payload.target_sd (the fourth field-name variant found live)', () => {
    const v = resolveAssignmentTarget(row({ payload: { target_sd: 'QF-20260726-529' } }), { profile: 'worker' });
    expect(v.key).toBe('QF-20260726-529');
    expect(v.source).toBe('payload.target_sd');
  });

  it('returns a miss, never throws, on junk input', () => {
    for (const bad of [null, undefined, 42, 'nope', {}]) {
      expect(() => resolveAssignmentTarget(bad)).not.toThrow();
      expect(resolveAssignmentTargetKey(bad)).toBeNull();
    }
  });
});

describe('FR-5 — ambiguity is refused, never guessed', () => {
  // The live example. A first-match scan picks the SUPERSEDED key, which converts a visible
  // failure (nothing happens) into an invisible one (the wrong work is claimed).
  const superseding = row({
    subject: 'SUPERSEDES my QF-20260725-630 dispatch — take QF-20260726-459 instead'
  });

  it('does NOT auto-select from multi-key text', () => {
    const v = resolveAssignmentTarget(superseding, { profile: 'worker' });
    expect(v.key).toBeNull();
    expect(v.ambiguous).toBe(true);
  });

  it('surfaces BOTH candidates for human routing without picking one', () => {
    const v = resolveAssignmentTarget(superseding, { profile: 'worker' });
    expect(v.candidates).toEqual(['QF-20260725-630', 'QF-20260726-459']);
    // Explicitly: the superseded key must not be the answer.
    expect(v.key).not.toBe('QF-20260725-630');
  });

  it('resolves from text when exactly ONE distinct key is present', () => {
    const v = resolveAssignmentTarget(row({ subject: 'WORK ASSIGNMENT: QF-20260726-423 re-routed to you' }), { profile: 'worker' });
    expect(v.key).toBe('QF-20260726-423');
    expect(v.source).toBe('text');
  });

  it('treats a key repeated many times as ONE distinct key, not ambiguity', () => {
    const v = resolveAssignmentTarget(row({
      subject: 'QF-20260726-642 is unclaimed',
      body: 'QF-20260726-642 again, and QF-20260726-642 once more'
    }), { profile: 'worker' });
    expect(v.key).toBe('QF-20260726-642');
    expect(v.ambiguous).toBe(false);
  });

  it('matches QF keys in text — the legacy regex was SD-anchored and could never see them', () => {
    // 35 of 46 inert rows named a QF key in text; 0 named an SD key. The scan was QF-blind.
    expect(resolveAssignmentTargetKey(row({ subject: 'take QF-20260726-175' }), { profile: 'worker' }))
      .toBe('QF-20260726-175');
  });

  it('ambiguity STOPS the scan — it must not fall through to a lower-priority source', () => {
    // Falling through to current_sd here would silently re-introduce a guess, just from a
    // different field. The row names two keys; the answer is "refuse", not "use current_sd".
    const v = resolveAssignmentTarget(row({
      subject: 'QF-20260725-630 vs QF-20260726-459',
      payload: { current_sd: 'SD-SOMETHING-ELSE-001' }
    }), { profile: 'worker' });
    expect(v.key).toBeNull();
    expect(v.ambiguous).toBe(true);
  });
});

describe('FR-1 — profiles preserve each call site\'s own precedence', () => {
  it('the newly-taught sources are appended LAST in every profile', () => {
    // This is what makes adoption provably additive: a new source can only ever resolve a row
    // that previously resolved to NOTHING. Measured live: 26 gains, 0 key->different-key.
    for (const [name, order] of Object.entries(PROFILES)) {
      const tail = order.slice(-NEWLY_TAUGHT.length);
      expect(tail, `profile ${name} must end with the newly-taught sources`).toEqual(NEWLY_TAUGHT);
    }
  });

  it('worker profile keeps its historical order: assigned_sd before sd_key before qf_id', () => {
    const o = PROFILES.worker;
    expect(o.indexOf('payload.assigned_sd')).toBeLessThan(o.indexOf('payload.sd_key'));
    expect(o.indexOf('payload.sd_key')).toBeLessThan(o.indexOf('payload.qf_id'));
    expect(o.indexOf('payload.available_sds')).toBeLessThan(o.indexOf('text'));
    expect(o.indexOf('text')).toBeLessThan(o.indexOf('payload.current_sd'));
  });

  it('dispatchGuard reads the top-level column FIRST, matching assertSdDispatchable:219', () => {
    expect(PROFILES.dispatchGuard[0]).toBe('top.target_sd');
    const v = resolveAssignmentTarget(
      row({ target_sd: 'SD-FROM-COLUMN-001', payload: { sd_key: 'SD-FROM-PAYLOAD-001' } }),
      { profile: 'dispatchGuard' }
    );
    expect(v.key).toBe('SD-FROM-COLUMN-001');
  });

  it('dispatchStamp reads assigned_sd FIRST, matching :295/:347/:494/:572', () => {
    expect(PROFILES.dispatchStamp[0]).toBe('payload.assigned_sd');
    const v = resolveAssignmentTarget(
      row({ target_sd: 'SD-FROM-COLUMN-001', payload: { assigned_sd: 'SD-FROM-ASSIGNED-001' } }),
      { profile: 'dispatchStamp' }
    );
    expect(v.key).toBe('SD-FROM-ASSIGNED-001');
  });

  it('the two dispatch profiles genuinely disagree — that is why one global order was wrong', () => {
    // A single shared ORDER changed 26 of 70 already-resolving rows when it was tried.
    // Sharing the REGISTRY removes the asymmetry; sharing an order does not and breaks callers.
    const r = row({ target_sd: 'SD-COLUMN-001', payload: { assigned_sd: 'SD-ASSIGNED-001' } });
    expect(resolveAssignmentTarget(r, { profile: 'dispatchGuard' }).key).toBe('SD-COLUMN-001');
    expect(resolveAssignmentTarget(r, { profile: 'dispatchStamp' }).key).toBe('SD-ASSIGNED-001');
  });
});

describe('TR-2 — the directed profile stays narrow', () => {
  it('ignores queue pointers so a nudge is never mistaken for a directed redirect', () => {
    // The stale-session-sweep sends every busy claim-holder {available_sds, current_sd}.
    // Resolving that as a directed target would yank a worker off its own SD.
    const nudge = row({ payload: { available_sds: ['SD-OTHER-001'], current_sd: 'SD-MINE-001' } });
    expect(resolveAssignmentTargetKey(nudge, { profile: 'directed' })).toBeNull();
    // ...while the full worker profile still surfaces it as a pointer.
    expect(resolveAssignmentTargetKey(nudge, { profile: 'worker' })).toBe('SD-OTHER-001');
  });

  it('ignores text entirely in directed mode', () => {
    expect(resolveAssignmentTargetKey(row({ subject: 'QF-20260726-423' }), { profile: 'directed' })).toBeNull();
  });
});

describe('TR-1 — the circular-require trap that would make this fix silently inert', () => {
  it('the resolver is a FUNCTION at load time, not undefined', () => {
    // Node CJS resolves a circular top-level require to `undefined` rather than throwing. If a
    // future change reaches this module by having dispatch.cjs require worker-checkin.cjs (which
    // already top-level-requires dispatch.cjs), the guard built on it would silently never run —
    // a fix for a silent failure, failing silently. This assertion fails loudly instead.
    expect(typeof resolveAssignmentTarget).toBe('function');
    expect(typeof resolveAssignmentTargetKey).toBe('function');
  });

  it('dispatch.cjs does not require worker-checkin.cjs (the cycle must not exist)', () => {
    const src = fs.readFileSync(path.join(REPO, 'lib/coordinator/dispatch.cjs'), 'utf8');
    expect(src).not.toMatch(/require\([^)]*worker-checkin/);
  });

  it('the shared module requires neither side — it is a leaf', () => {
    const src = fs.readFileSync(path.join(REPO, 'lib/fleet/assignment-target.cjs'), 'utf8');
    expect(src).not.toMatch(/require\([^)]*worker-checkin/);
    expect(src).not.toMatch(/require\([^)]*coordinator\/dispatch/);
  });
});

describe('registry auditability', () => {
  it('every historical source records the incident that introduced it', () => {
    // The list grew by accretion twice. Tagging keeps it auditable rather than mysterious.
    expect(SOURCES['payload.qf_id'].since).toBe('QF-20260704-602');
    expect(SOURCES['payload.qf'].since).toBe('QF-20260707-650');
    expect(SOURCES['payload.qf_id'].historical).toBe(true);
  });

  it('a structured column and single-key text agreed on every live row that had both (6/6)', () => {
    // Because the newly-taught sources are appended last for additivity, single-key TEXT outranks
    // the top-level column in the worker profile. Measured live that is currently harmless — all
    // 6 rows carrying both agreed. This pins the preference so that if a future writer makes them
    // disagree, the choice is a deliberate one someone changed, not an accident.
    const agreeing = row({ target_sd: 'QF-20260726-642', subject: 'take QF-20260726-642' });
    expect(resolveAssignmentTargetKey(agreeing, { profile: 'worker' })).toBe('QF-20260726-642');
    const disagreeing = row({ target_sd: 'QF-AAA-111', subject: 'take QF-BBB-222' });
    expect(resolveAssignmentTargetKey(disagreeing, { profile: 'worker' })).toBe('QF-BBB-222');
  });
});
