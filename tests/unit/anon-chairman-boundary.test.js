// SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-1.
//
// Two-sided per TR-3. The load-bearing direction for assertsUnreachability is the
// NEGATIVE: the honest paragraph in the KNOWN GAPS block talks about anon, reaching, and
// the chairman queue in one breath. A keyword scan flags it, and then the fix for a false
// closure claim is to delete the accurate explanation — strictly worse than doing nothing.

import { describe, it, expect } from 'vitest';
import {
  DECLARED_BOUNDARY,
  HONEST_BOUNDARY_STATEMENT,
  evaluateBoundary,
  assertsUnreachability,
} from '../../lib/policy/anon-chairman-boundary.js';

/** A live reading that matches the declaration (as measured 2026-08-03). */
const LIVE_MATCHING = {
  security_definer: true,
  owner_bypasses_rls: true,
  anon_has_execute: true,
  insert_paths: [
    { path: 'normal', severity: 'medium' },
    { path: 'storm_watermark', severity: 'high' },
  ],
};

describe('evaluateBoundary', () => {
  it('MATCHES on the live configuration measured during this SD', () => {
    const r = evaluateBoundary(LIVE_MATCHING);
    expect(r.verdict).toBe('MATCHES');
    expect(r.drift).toEqual([]);
  });

  it('SEEDED: the grant being dropped is DRIFTED, not silently green', () => {
    // Good news drift — someone constrained the path. It must still fail, because the
    // declaration and every closure claim now describe a boundary that no longer exists.
    const r = evaluateBoundary({ ...LIVE_MATCHING, anon_has_execute: false });
    expect(r.verdict).toBe('DRIFTED');
    expect(r.drift.join(' ')).toMatch(/anon_has_execute/);
    expect(r.detail).toMatch(/CONSTRAINED/);
  });

  it('SEEDED: the storm path severity changing is caught', () => {
    const r = evaluateBoundary({
      ...LIVE_MATCHING,
      insert_paths: [{ path: 'normal', severity: 'medium' }, { path: 'storm_watermark', severity: 'critical' }],
    });
    expect(r.verdict).toBe('DRIFTED');
    expect(r.drift.join(' ')).toMatch(/storm_watermark: declared high, live critical/);
  });

  it('SEEDED: a NEW insert path appearing is caught', () => {
    const r = evaluateBoundary({
      ...LIVE_MATCHING,
      insert_paths: [...LIVE_MATCHING.insert_paths, { path: 'escalation', severity: 'critical' }],
    });
    expect(r.verdict).toBe('DRIFTED');
    expect(r.drift.join(' ')).toMatch(/NEW live path/);
  });

  it('SEEDED: a declared path disappearing is caught', () => {
    const r = evaluateBoundary({ ...LIVE_MATCHING, insert_paths: [{ path: 'normal', severity: 'medium' }] });
    expect(r.verdict).toBe('DRIFTED');
    expect(r.drift.join(' ')).toMatch(/storm_watermark: MISSING live/);
  });

  it('UNREADABLE when severities could not be parsed — never MATCHES', () => {
    const r = evaluateBoundary({ ...LIVE_MATCHING, insert_paths: [] });
    expect(r.verdict).toBe('UNREADABLE');
    expect(r.verdict).not.toBe('MATCHES');
  });

  it('UNREADABLE on a missing field rather than treating undefined as a match', () => {
    const r = evaluateBoundary({ ...LIVE_MATCHING, security_definer: undefined });
    expect(r.verdict).toBe('UNREADABLE');
  });

  it('UNREADABLE on no reading at all', () => {
    expect(evaluateBoundary(null).verdict).toBe('UNREADABLE');
  });

  it('the declaration records BOTH insert paths, not just the quotable one', () => {
    const sevs = DECLARED_BOUNDARY.insert_paths.map((p) => p.severity).sort();
    expect(sevs).toEqual(['high', 'medium']);
  });

  it('only the storm severity intersects the queue arm', () => {
    const arming = DECLARED_BOUNDARY.insert_paths
      .filter((p) => DECLARED_BOUNDARY.queue_arm_severities.includes(p.severity))
      .map((p) => p.path);
    expect(arming).toEqual(['storm_watermark']);
  });

  it('inherited-but-unverified assessments are segregated from measured facts', () => {
    // Keeping these in their own bucket is the point: a future reader must not mistake
    // "the original author assessed this" for "this SD measured it".
    expect(Object.keys(DECLARED_BOUNDARY.inherited_unverified).sort())
      .toEqual(['feedback_force_row_security', 'venture_uuids_anon_enumerable']);
  });
});

describe('assertsUnreachability', () => {
  it('FLAGS a false closure claim', () => {
    expect(assertsUnreachability('anon cannot reach the chairman decision queue.')).toBe(true);
  });

  it('FLAGS softer phrasings of the same claim', () => {
    expect(assertsUnreachability('The anon role is unable to reach the chairman queue.')).toBe(true);
    expect(assertsUnreachability('anon can never reach the chairman decision queue')).toBe(true);
  });

  it('DOES NOT FLAG the honest boundary statement — the load-bearing negative', () => {
    // This paragraph contains anon, reach, and chairman queue. A keyword scan flags it,
    // and "fixing" the flag means deleting the accurate explanation.
    expect(assertsUnreachability(HONEST_BOUNDARY_STATEMENT)).toBe(false);
  });

  it('DOES NOT FLAG the KNOWN GAPS block, which CONCEDES the claim is false', () => {
    const knownGaps = 'G1. "ANON CANNOT REACH THE CHAIRMAN QUEUE" IS NOT ESTABLISHED — a channel bypasses RLS '
      + 'entirely. the stronger claim "anon cannot reach the chairman decision queue" is false as stated, and is '
      + "not this policy's to make.";
    expect(assertsUnreachability(knownGaps)).toBe(false);
  });

  it('DOES NOT FLAG unrelated prose mentioning anon and the chairman queue', () => {
    expect(assertsUnreachability('The chairman queue arms on severity; anon inserts land in feedback.')).toBe(false);
  });

  it('handles empty and non-string input without throwing', () => {
    expect(assertsUnreachability('')).toBe(false);
    expect(assertsUnreachability(null)).toBe(false);
    expect(assertsUnreachability(42)).toBe(false);
  });
});
