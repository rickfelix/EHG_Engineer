// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-4, tracks.js half).
//
// tracks.js:93-95 used to compute isClaimedByOther as
//   claimedBySession && currentSession && claimedBySession !== currentSession.session_id
// which evaluates FALSY (not-claimed-by-other) whenever currentSession is null, regardless of
// whether the row is genuinely claimed by someone else. An indeterminate caller identity was
// treated as "available" (fail OPEN) instead of "can't confirm it's mine, so don't offer it"
// (fail CLOSED). This test pins the corrected direction.

import { describe, it, expect, vi } from 'vitest';
import { displayTrackSection } from '../../../scripts/modules/sd-next/display/tracks.js';

const baseItem = (overrides) => ({
  sd_key: overrides.sd_key,
  sequence_rank: 1,
  is_working_on: false,
  title: overrides.title || 'Some SD',
  metadata: {},
  parent_sd_id: null,
  status: 'draft',
  kind: 'sd',
});

async function runTrack(item, sessionContext) {
  const logs = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  try {
    await displayTrackSection('A', 'Infrastructure/Safety', [item], sessionContext);
  } finally {
    spy.mockRestore();
  }
  return logs.join('\n');
}

describe('FR-4: tracks.js claim classification fails CLOSED on an indeterminate caller', () => {
  it('shows CLAIMED for a row held by another session when currentSession is null (fail closed)', async () => {
    const item = baseItem({ sd_key: 'SD-CLAIMED-001' });
    const claimedSDs = new Map([['SD-CLAIMED-001', 'session-OTHER']]);

    const output = await runTrack(item, { claimedSDs, currentSession: null, activeSessions: [] });

    expect(output).toMatch(/CLAIMED/);
  });

  it('does NOT show CLAIMED for an unclaimed row when currentSession is null (no false positive)', async () => {
    const item = baseItem({ sd_key: 'SD-OPEN-001' });
    const claimedSDs = new Map(); // nobody claims this row

    const output = await runTrack(item, { claimedSDs, currentSession: null, activeSessions: [] });

    expect(output).not.toMatch(/CLAIMED/);
  });

  it('shows CLAIMED for a row held by another session when currentSession IS known (unchanged behavior)', async () => {
    const item = baseItem({ sd_key: 'SD-CLAIMED-002' });
    const claimedSDs = new Map([['SD-CLAIMED-002', 'session-OTHER']]);

    const output = await runTrack(item, {
      claimedSDs,
      currentSession: { session_id: 'session-ME' },
      activeSessions: [],
    });

    expect(output).toMatch(/CLAIMED/);
  });

  it('does NOT show CLAIMED for the caller\'s own claim (unchanged behavior)', async () => {
    const item = baseItem({ sd_key: 'SD-MINE-001' });
    const claimedSDs = new Map([['SD-MINE-001', 'session-ME']]);

    const output = await runTrack(item, {
      claimedSDs,
      currentSession: { session_id: 'session-ME' },
      activeSessions: [],
    });

    expect(output).not.toMatch(/CLAIMED/);
  });
});
