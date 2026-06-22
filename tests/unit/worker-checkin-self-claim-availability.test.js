// SD-REFILL-00BCYOYW: session-level self-claim opt-out. A winding-down worker marked
// metadata.self_claim===false (or metadata.availability==='idle_only') must SKIP the
// self_claim-from-sd:next path (avoiding grab-release churn that blocks fresh-session pickup
// of reserved SDs) while still doing roll_call, resume, directed assignments and recovery.
// These pin the pure predicate that gates the runCheckin step-5.9 guard. STRICT: only
// self_claim===false / availability==='idle_only' disable it — every other/absent value leaves
// self-claim ENABLED (fail-toward-active, never silently park a worker).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSelfClaimDisabled } = require('../../scripts/worker-checkin.cjs');

describe('isSelfClaimDisabled (SD-REFILL-00BCYOYW)', () => {
  it('TS-1: self_claim===false disables self-claim', () => {
    expect(isSelfClaimDisabled({ self_claim: false })).toBe(true);
  });

  it('TS-2: availability===idle_only disables self-claim', () => {
    expect(isSelfClaimDisabled({ availability: 'idle_only' })).toBe(true);
  });

  it('TS-3a: absent flag → enabled (default)', () => {
    expect(isSelfClaimDisabled({})).toBe(false);
  });

  it('TS-3b: self_claim===true → enabled', () => {
    expect(isSelfClaimDisabled({ self_claim: true })).toBe(false);
  });

  it('TS-3c: null metadata → enabled (default)', () => {
    expect(isSelfClaimDisabled(null)).toBe(false);
    expect(isSelfClaimDisabled(undefined)).toBe(false);
  });

  it('TS-4: non-object input → enabled (fail-safe)', () => {
    expect(isSelfClaimDisabled('idle_only')).toBe(false);
    expect(isSelfClaimDisabled(42)).toBe(false);
  });

  it('TS-5: a truthy non-true self_claim does NOT disable (strict ===false only)', () => {
    expect(isSelfClaimDisabled({ self_claim: 1 })).toBe(false);
    expect(isSelfClaimDisabled({ self_claim: 'no' })).toBe(false); // not ===false → still enabled
  });

  it('an unrelated availability value does NOT disable', () => {
    expect(isSelfClaimDisabled({ availability: 'active' })).toBe(false);
  });
});
