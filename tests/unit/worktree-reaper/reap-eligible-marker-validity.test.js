/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-3 — a marker must still HOLD authority.
 *
 * The two expiry predicates are tested ONE AT A TIME on purpose. The original plan set
 * age-expired AND sd_key-mismatched simultaneously, which a half-implementation checking
 * only one of them would pass. Each case below isolates a single reason.
 *
 * Each refusal also carries an ARMING ASSERTION that hasReapEligibleMarker is still true —
 * i.e. the OLD predicate WOULD have authorised. Without it, a future change that stops
 * writing the marker at all would make these tests pass while proving nothing.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writeReapEligibleMarker,
  hasReapEligibleMarker,
  isReapEligibleMarkerValid,
  canonicalWorkKey,
  DEFAULT_MARKER_TTL_MIN,
} from '../../../lib/worktree-reaper/reap-eligible-marker.js';

const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;
let dir;

/** Write a marker with an explicit age, bypassing writeReapEligibleMarker's own clock. */
function markerAged({ minutesAgo, sd_key }) {
  writeReapEligibleMarker(dir, { sd_key });
  const p = path.join(dir, '.reap-eligible.json');
  const payload = JSON.parse(fs.readFileSync(p, 'utf8'));
  payload.marked_at = new Date(NOW - minutesAgo * MIN).toISOString();
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3-marker-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

describe('FR-3 — the 21:34:48Z incident, replayed', () => {
  test('FRESH marker naming a DIFFERENT SD than the tree does not authorise', () => {
    // The incident shape verbatim: marker sd_key SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001
    // on the tree that was actually holding scribe/rls-receipts work.
    markerAged({ minutesAgo: 5, sd_key: 'SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001' });
    expect(hasReapEligibleMarker(dir)).toBe(true); // ARMING: the old predicate said yes
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-OTHER-001' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('marker_sd_key_mismatch');
  });

  test('AGED marker whose sd_key MATCHES does not authorise — age alone is disqualifying', () => {
    markerAged({ minutesAgo: DEFAULT_MARKER_TTL_MIN + 60, sd_key: 'SD-FDBK-SAME-001' });
    expect(hasReapEligibleMarker(dir)).toBe(true); // ARMING
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('marker_expired_age');
  });

  test('OPPOSITE POLARITY: fresh AND matching still authorises — the post-merge handoff keeps working', () => {
    // Without this, FR-3 would silently break the reap handoff every merge depends on.
    markerAged({ minutesAgo: 5, sd_key: 'SD-FDBK-SAME-001' });
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' });
    expect(v.valid).toBe(true);
    expect(v.detail.matched_key).toBe('SD-FDBK-SAME-001');
  });
});

describe('FR-3 — the producer shapes that actually exist in the repo', () => {
  test('a PATH-shaped sd_key resolves to its key and MATCHES (worktree-merge.js writes this)', () => {
    // Treating this as unparseable would refuse legitimate markers — the exact
    // false-expiry FR-3 exists to avoid. It reduces to a real key, so it authorises.
    markerAged({ minutesAgo: 5, sd_key: '.worktrees/SD-FDBK-SAME-001' });
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' });
    expect(v.valid).toBe(true);
  });

  test('sd_key === null is CANNOT-VALIDATE, not mismatch, and does not authorise', () => {
    markerAged({ minutesAgo: 5, sd_key: null });
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('marker_key_unverifiable'); // distinct from a real mismatch
  });

  test('a non-key basename (post-merge fallback shape) is cannot-validate, NOT a spurious mismatch', () => {
    markerAged({ minutesAgo: 5, sd_key: 'wt-abc123' });
    expect(isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' }).reason)
      .toBe('marker_key_unverifiable');
  });

  test('a keyless TREE (ceremony worktree) cannot be validated against either', () => {
    markerAged({ minutesAgo: 5, sd_key: 'SD-FDBK-SAME-001' });
    expect(isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'scribe-rls-receipts' }).reason)
      .toBe('marker_key_unverifiable');
  });

  test('a CORRUPT marker file is cannot-validate and does not throw', () => {
    fs.writeFileSync(path.join(dir, '.reap-eligible.json'), '{ not json');
    expect(hasReapEligibleMarker(dir)).toBe(true); // ARMING: presence still true
    const v = isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-FDBK-SAME-001' });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('marker_unreadable');
  });

  test('an absent marker is reported as absent, not as an expiry', () => {
    expect(isReapEligibleMarkerValid(dir, { nowMs: NOW, treeKey: 'SD-X-001' }).reason).toBe('marker_absent');
  });
});

describe('FR-3 — contract details that break callers if wrong', () => {
  test('nowMs and ttlMin default INTERNALLY — the reaper ctx supplies neither', () => {
    // A destructure-and-assume signature would make every existing caller pass undefined.
    markerAged({ minutesAgo: 1, sd_key: 'SD-FDBK-SAME-001' });
    const p = path.join(dir, '.reap-eligible.json');
    const payload = JSON.parse(fs.readFileSync(p, 'utf8'));
    payload.marked_at = new Date().toISOString(); // real clock, so the internal default applies
    fs.writeFileSync(p, JSON.stringify(payload));
    expect(isReapEligibleMarkerValid(dir, { treeKey: 'SD-FDBK-SAME-001' }).valid).toBe(true);
  });

  test('hasReapEligibleMarker KEEPS its pure-presence contract', () => {
    // Folding validation into it would break existing assertions that expect `true`
    // on a branchless tmpdir.
    markerAged({ minutesAgo: 10_000, sd_key: 'SD-WRONG-001' });
    expect(hasReapEligibleMarker(dir)).toBe(true);
  });

  test('canonicalWorkKey normalizes case and path shape, and rejects non-keys', () => {
    expect(canonicalWorkKey('sd-foo-001')).toBe('SD-foo-001');
    expect(canonicalWorkKey('.worktrees/qf/QF-20260710-432')).toBe('QF-20260710-432');
    expect(canonicalWorkKey('wt-abc')).toBeNull();
    expect(canonicalWorkKey(null)).toBeNull();
    expect(canonicalWorkKey('   ')).toBeNull();
  });
});
