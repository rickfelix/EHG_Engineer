/**
 * SD-LEO-FEAT-FLEET-COLD-START-UX-001 FR-3 — formatSessionRow must emit the NUMERIC heartbeat age.
 *
 * The cold-start control has to distinguish a LIVE coordinator from a STALE one. Before this the
 * client received only heartbeat_age_human ('5s ago'), a display string; the numeric value was
 * SELECTed and used for ordering and the 3600s live-window filter but never emitted. A stale-arm
 * test written against the old shape could only assert on a fabricated field — a guaranteed
 * mock-pass. These tests exist so the emitted field cannot be quietly dropped again.
 */
import { describe, it, expect } from 'vitest';
import { formatSessionRow } from '../../../server/routes/fleet-panel.js';

const row = (over = {}) => ({
  session_id: 'sess-1',
  sd_key: null,
  computed_status: 'active',
  heartbeat_age_human: '5s ago',
  metadata: {},
  ...over,
});

describe('formatSessionRow — heartbeat_age_seconds (FR-3)', () => {
  it('emits the numeric age so the client compares a number, not prose', () => {
    expect(formatSessionRow(row({ heartbeat_age_seconds: 5 })).heartbeat_age_seconds).toBe(5);
  });

  it('emits 0 rather than null for a just-heartbeated session', () => {
    // The reason the writer uses `?? null` and not `|| null`. Zero is the freshest possible age;
    // the falsy form would report the LIVEST session as unknown, which would flip the cold-start
    // control to its no-coordinator state at exactly the wrong moment.
    const out = formatSessionRow(row({ heartbeat_age_seconds: 0 }));
    expect(out.heartbeat_age_seconds).toBe(0);
    expect(out.heartbeat_age_seconds).not.toBeNull();
  });

  it('emits an age well past the 3600s live window unchanged, so stale is detectable', () => {
    // The live window admits anything under 3600s and heartbeat is known to keep advancing on
    // dead processes, so the client needs the real number to judge staleness for itself.
    expect(formatSessionRow(row({ heartbeat_age_seconds: 4000 })).heartbeat_age_seconds).toBe(4000);
  });

  it('is present-but-null when the source row carries no age, never absent', () => {
    const out = formatSessionRow(row());
    expect(out.heartbeat_age_seconds).toBeNull();
    expect('heartbeat_age_seconds' in out).toBe(true);
  });

  it('does not disturb the human string it sits beside', () => {
    const out = formatSessionRow(row({ heartbeat_age_seconds: 12, heartbeat_age_human: '12s ago' }));
    expect(out.heartbeat_age_human).toBe('12s ago');
  });
});
