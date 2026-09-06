// QF-20260829-976: SET_IDENTITY on a RENAME reads as a fresh assignment — carry the prior
// callsign so a worker can tell. Two-sided: a rename must include BOTH names and
// prior_callsign; a first assignment must NOT gain a phantom prior_callsign or rename wording.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildIdentityMessage } = require('../../scripts/assign-fleet-identities.cjs');

describe('QF-20260829-976: buildIdentityMessage', () => {
  it('first assignment (no prior identity): no prior_callsign key, no rename wording', () => {
    const msg = buildIdentityMessage({
      priorIdentity: null,
      callsign: 'Charlie',
      color: 'blue',
      displayName: 'Charlie | idle',
      tierRank: 4
    });
    expect(msg.subject).toBe('Identity: Charlie (blue)');
    expect(msg.subject).not.toMatch(/CHANGED|->/);
    expect(msg.body).not.toMatch(/RENAMED|stale/i);
    expect(msg.payload).not.toHaveProperty('prior_callsign');
    expect(msg.payload).not.toHaveProperty('renamed_at');
    // SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001 (FR-2): payload.kind is now stamped.
    expect(msg.payload).toEqual({ kind: 'SET_IDENTITY', color: 'blue', callsign: 'Charlie', display_name: 'Charlie | idle', tier_rank: 4 });
  });

  it('rename (prior callsign differs): subject/body carry BOTH names, payload has prior_callsign', () => {
    const msg = buildIdentityMessage({
      priorIdentity: { callsign: 'Alpha' },
      callsign: 'Hotel-5',
      color: 'red',
      displayName: 'Hotel-5 | SD-FOO-001',
      tierRank: 1
    });
    expect(msg.subject).toBe('Identity CHANGED: Alpha -> Hotel-5');
    expect(msg.subject).toMatch(/Alpha/);
    expect(msg.subject).toMatch(/Hotel-5/);
    expect(msg.body).toMatch(/Alpha/);
    expect(msg.body).toMatch(/Hotel-5/);
    expect(msg.body).toMatch(/RENAMED/);
    expect(msg.body).toMatch(/stale/i);
    expect(msg.payload.prior_callsign).toBe('Alpha');
    expect(typeof msg.payload.renamed_at).toBe('string');
    expect(Number.isNaN(Date.parse(msg.payload.renamed_at))).toBe(false);
  });

  it('same-named "rename" (priorIdentity present but callsign unchanged) is NOT treated as a rename', () => {
    // A worker whose callsign is re-affirmed unchanged (e.g. a metadata refresh) must not be
    // told it was renamed — only an ACTUAL callsign change counts.
    const msg = buildIdentityMessage({
      priorIdentity: { callsign: 'Charlie' },
      callsign: 'Charlie',
      color: 'blue',
      displayName: 'Charlie | SD-BAR-001',
      tierRank: 3
    });
    expect(msg.subject).toBe('Identity: Charlie (blue)');
    expect(msg.payload).not.toHaveProperty('prior_callsign');
  });

  it('a bare undefined priorIdentity (not passed at all) behaves identically to null', () => {
    const msg = buildIdentityMessage({ callsign: 'Bravo', color: 'green', displayName: 'Bravo | idle', tierRank: 2 });
    expect(msg.subject).toBe('Identity: Bravo (green)');
    expect(msg.payload).not.toHaveProperty('prior_callsign');
  });
});
