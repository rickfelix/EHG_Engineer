// FR-1 — the lane-key contract is a shared constant, not prose in a COMMENT ON COLUMN.
// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { DRIVE_REPORT_LANES, ALL_DRIVE_REPORT_LANES } = require_('../../../lib/drive-loop/lanes.cjs');

describe('FR-1 — DRIVE_REPORT_LANES', () => {
  it('carries the three lanes -B named in its column comment', () => {
    expect(DRIVE_REPORT_LANES.COORDINATOR).toBe('coordinator');
    expect(DRIVE_REPORT_LANES.ADAM).toBe('adam');
    expect(DRIVE_REPORT_LANES.CHAIRMAN_BRIEF).toBe('chairman-brief');
  });

  it('enumerates all three, so a caller can iterate without re-listing them', () => {
    expect([...ALL_DRIVE_REPORT_LANES].sort()).toEqual(['adam', 'chairman-brief', 'coordinator']);
  });

  it('is FROZEN — a consumer cannot mutate the shared contract at runtime', () => {
    // Both arms: the write must not take effect, whether or not it throws. In sloppy mode a write
    // to a frozen object fails SILENTLY, so asserting only `toThrow` would pass on an unfrozen
    // object under some module settings.
    expect(Object.isFrozen(DRIVE_REPORT_LANES)).toBe(true);
    try { DRIVE_REPORT_LANES.COORDINATOR = 'hijacked'; } catch { /* strict mode throws; sloppy is silent */ }
    expect(DRIVE_REPORT_LANES.COORDINATOR).toBe('coordinator');
  });

  it('does NOT collide with the unrelated LANES in receipt-ledger.cjs', () => {
    // receipt-ledger exports a frozen `LANES` with a different vocabulary for a different table.
    // If these ever agree by accident, a later reader importing the wrong one gets a receipt that
    // writes cleanly into a key nothing consumes — the silent-absence failure this SD is about.
    const ledger = require_('../../../lib/coordination/receipt-ledger.cjs');
    if (ledger && ledger.LANES) {
      expect(Object.values(ledger.LANES)).not.toEqual([...ALL_DRIVE_REPORT_LANES]);
    }
  });
});
