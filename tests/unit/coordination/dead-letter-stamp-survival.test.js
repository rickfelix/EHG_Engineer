/**
 * The stamp branch must DISPOSITION a row without ARMING ITS DELETION.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-1d.
 *
 * WHY THIS TEST EXISTS, AND WHY THE EARLIER GUARD COULD NOT HAVE CAUGHT IT.
 * FR-1a removed read_at from the stamp write because setting acknowledged_at AND read_at together
 * blinded four surfaces at once. That fix was correct and is guarded by a mutation-tested static
 * check. But the guard asserts only that the two columns are never set TOGETHER — and the arm
 * FR-1a kept is the one with NO delay:
 *
 *     purge: expires_at < now() AND ( acknowledged_at IS NOT NULL
 *                                     OR read_at <= now() - 7 days )
 *
 * acknowledged_at arms the predicate the instant it is written. read_at buys seven days. Roughly
 * 96% of these rows already have expires_at in the past, so an acknowledged_at stamp means
 * deletion on the next five-minute sweep tick. Removing read_at made the row VISIBLE to the right
 * surfaces; it never made the row SURVIVE, and nothing asserted survival. Fixing the liveness
 * oracle then grew the drain's visible population, taking the blast radius from ~589 rows to
 * ~3,010 — a fix making a latent hazard bigger is exactly why this needs its own assertion.
 *
 * THE DECISION FR-1d ENCODES: the stamp branch writes NO timestamp column. Not acknowledged_at
 * (immediate deletion), and not read_at either (a 7-day fuse this module does not own — the
 * dead-letter PLANNING pass owns the read_at lifecycle, and duplicating it here would mean two
 * writers racing to start the same clock). The drain records that it CONSIDERED a row and found
 * it moot. Retention decides when the row dies, on the schedule it already had.
 */

import { describe, it, expect } from 'vitest';
import { buildStampPatch, isPurgeEligible, PURGE_READ_GRACE_MS } from '../../../lib/coordination/dead-letter-drain.js';

const NOW = Date.parse('2026-08-07T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const ahead = (ms) => new Date(NOW + ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

/** The population this SD is about: expires_at already past, read_at stamped two days ago. */
const typicalDeadLetterRow = () => ({
  id: 'row-1',
  expires_at: ago(3 * DAY),
  read_at: ago(2 * DAY),
  acknowledged_at: null,
  payload: { kind: 'roll_call' }
});

/** Apply a patch the way the CLI would, so the assertion runs against the merged row. */
const applyPatch = (row, patch) => ({ ...row, ...patch });

describe('isPurgeEligible — faithful model of cleanup_expired_coordination()', () => {
  it('is NOT eligible while expires_at is still in the future, whatever the ack state', () => {
    const row = { expires_at: ahead(DAY), acknowledged_at: ago(DAY), read_at: ago(30 * DAY) };
    expect(isPurgeEligible(row, { nowMs: NOW })).toBe(false);
  });

  it('IS eligible the instant acknowledged_at is set on an expired row — the arm with no delay', () => {
    // POSITIVE CONTROL. If this ever returns false the survival test below becomes vacuous,
    // because nothing would distinguish a safe stamp from a fatal one.
    const row = { ...typicalDeadLetterRow(), acknowledged_at: new Date(NOW).toISOString() };
    expect(isPurgeEligible(row, { nowMs: NOW })).toBe(true);
  });

  it('is NOT eligible on read_at alone until the grace window has elapsed', () => {
    expect(isPurgeEligible(typicalDeadLetterRow(), { nowMs: NOW })).toBe(false);
  });

  it('IS eligible once read_at has aged past the grace window', () => {
    const row = { ...typicalDeadLetterRow(), read_at: ago(PURGE_READ_GRACE_MS + DAY) };
    expect(isPurgeEligible(row, { nowMs: NOW })).toBe(true);
  });

  it('is NOT eligible when both timestamps are null — the immunity state', () => {
    const row = { expires_at: ago(30 * DAY), acknowledged_at: null, read_at: null };
    expect(isPurgeEligible(row, { nowMs: NOW })).toBe(false);
  });
});

describe('buildStampPatch — the survival assertion', () => {
  it('THE POINT: a row that is not purge-eligible stays not purge-eligible after being stamped', () => {
    const before = typicalDeadLetterRow();
    expect(isPurgeEligible(before, { nowMs: NOW })).toBe(false);

    const after = applyPatch(before, buildStampPatch(before, { nowMs: NOW, reason: 'moot' }));
    expect(isPurgeEligible(after, { nowMs: NOW })).toBe(false);
  });

  it('writes NO timestamp column — not acknowledged_at, not read_at, not expires_at', () => {
    const patch = buildStampPatch(typicalDeadLetterRow(), { nowMs: NOW, reason: 'moot' });
    expect(patch).not.toHaveProperty('acknowledged_at');
    expect(patch).not.toHaveProperty('read_at');
    expect(patch).not.toHaveProperty('expires_at');
    expect(Object.keys(patch)).toEqual(['payload']);
  });

  it('still records a durable, auditable disposition in the payload', () => {
    const row = typicalDeadLetterRow();
    const patch = buildStampPatch(row, { nowMs: NOW, reason: 'noise kind roll_call to a non-live session' });
    expect(patch.payload.dead_letter_drained).toMatchObject({
      orig_target: row.target_session ?? null,
      reason: 'noise kind roll_call to a non-live session'
    });
    expect(patch.payload.dead_letter_drained.at).toBe(new Date(NOW).toISOString());
  });

  it('preserves existing payload keys rather than clobbering them', () => {
    const row = { ...typicalDeadLetterRow(), payload: { kind: 'roll_call', reroute: { by_sweep: true } } };
    const patch = buildStampPatch(row, { nowMs: NOW, reason: 'moot' });
    expect(patch.payload.kind).toBe('roll_call');
    expect(patch.payload.reroute).toEqual({ by_sweep: true });
  });

  it('is idempotent — re-stamping an already-stamped row does not change eligibility', () => {
    const once = applyPatch(typicalDeadLetterRow(), buildStampPatch(typicalDeadLetterRow(), { nowMs: NOW, reason: 'moot' }));
    const twice = applyPatch(once, buildStampPatch(once, { nowMs: NOW, reason: 'moot' }));
    expect(isPurgeEligible(twice, { nowMs: NOW })).toBe(false);
  });

  it('CONTROL: the OLD behaviour would have failed this test', () => {
    // Proves the survival assertion has teeth. Had the stamp kept writing acknowledged_at, the
    // row would flip to eligible and be deleted on the next five-minute tick.
    const legacyPatch = { acknowledged_at: new Date(NOW).toISOString(), payload: {} };
    const after = applyPatch(typicalDeadLetterRow(), legacyPatch);
    expect(isPurgeEligible(after, { nowMs: NOW })).toBe(true);
  });
});
