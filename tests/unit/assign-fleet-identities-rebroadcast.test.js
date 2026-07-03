// QF-20260703-040: SET_IDENTITY was only ever sent to a NEWLY-assigning worker, so a session
// whose identity changed via some OTHER path (e.g. a dedupeAssignedCallsigns demotion whose
// resulting message a dead/dormant session never consumed) kept a stale local statusline file
// forever — the chairman saw 3x "Charlie" on live windows. identityNeedsRebroadcast compares the
// CURRENTLY-desired identity against metadata.fleet_identity_last_sent (what was actually
// broadcast last), so a re-affirm is due whenever they drift, regardless of the cause.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { identityNeedsRebroadcast } = require('../../scripts/assign-fleet-identities.cjs');

describe('QF-20260703-040: identityNeedsRebroadcast', () => {
  it('is true when no identity has ever been broadcast', () => {
    const worker = { metadata: {} };
    expect(identityNeedsRebroadcast(worker, { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | idle' })).toBe(true);
  });

  it('is false when the last-sent identity matches exactly', () => {
    const identity = { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | idle' };
    const worker = { metadata: { fleet_identity_last_sent: identity } };
    expect(identityNeedsRebroadcast(worker, identity)).toBe(false);
  });

  it('is true when the callsign drifted since the last broadcast (the stranded-window case)', () => {
    const worker = { metadata: { fleet_identity_last_sent: { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | idle' } } };
    expect(identityNeedsRebroadcast(worker, { callsign: 'Hotel-5', color: 'blue', display_name: 'Hotel-5 | idle' })).toBe(true);
  });

  it('is true when only display_name (SD label) changed', () => {
    const worker = { metadata: { fleet_identity_last_sent: { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | idle' } } };
    expect(identityNeedsRebroadcast(worker, { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | SD-FOO-001' })).toBe(true);
  });

  it('is true when only color changed', () => {
    const worker = { metadata: { fleet_identity_last_sent: { callsign: 'Charlie', color: 'blue', display_name: 'Charlie | idle' } } };
    expect(identityNeedsRebroadcast(worker, { callsign: 'Charlie', color: 'purple', display_name: 'Charlie | idle' })).toBe(true);
  });
});
