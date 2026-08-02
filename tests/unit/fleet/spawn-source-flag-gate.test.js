/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-2 — the flag gate.
 *
 * The safety claim of this change is "default OFF means byte-identical behaviour", so that is
 * what gets pinned hardest. A flag-gated change whose OFF path drifted would be worse than no
 * flag at all: it would carry the reassurance of being disabled while behaving differently.
 */
import { describe, it, expect } from 'vitest';
import { isSpawnSourceTreeEnabled } from '../../../lib/fleet/spawn-control.js';

describe('FR-2: isSpawnSourceTreeEnabled — default OFF', () => {
  it('is OFF when the flag is unset — absent reads as the CONSERVATIVE direction', () => {
    // Unlike the bypass-reason channel documented at the top of spawn-control.js (where an
    // absent read wrongly meant "inert"), absent here leaves the pre-existing guard fully in
    // force rather than silently disabling it.
    expect(isSpawnSourceTreeEnabled({})).toBe(false);
  });

  it('is OFF for every falsy spelling', () => {
    for (const v of ['', '0', 'false', 'off', 'no', '   ', 'nonsense']) {
      expect(isSpawnSourceTreeEnabled({ FLEET_SPAWN_SOURCE_TREE: v }), `value: ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('is ON only for the explicit affirmative spellings, case-insensitively', () => {
    for (const v of ['1', 'true', 'on', 'yes', 'TRUE', 'On', 'YES']) {
      expect(isSpawnSourceTreeEnabled({ FLEET_SPAWN_SOURCE_TREE: v }), `value: ${JSON.stringify(v)}`).toBe(true);
    }
  });

  it('does NOT read any neighbouring flag — a set FLEET_SPAWN_CONTROL_LIVE must not enable this', () => {
    // These two flags gate different things. Conflating them would turn "spawns are live" into
    // "spawns also relocate their currency target", which no operator asked for.
    expect(isSpawnSourceTreeEnabled({ FLEET_SPAWN_CONTROL_LIVE: 'true' })).toBe(false);
    expect(isSpawnSourceTreeEnabled({ LEO_FR_TRACEABILITY_ENFORCE: 'true' })).toBe(false);
  });

  it('is total on a nullish env rather than throwing on the spawn path', () => {
    expect(isSpawnSourceTreeEnabled({ FLEET_SPAWN_SOURCE_TREE: null })).toBe(false);
    expect(isSpawnSourceTreeEnabled({ FLEET_SPAWN_SOURCE_TREE: undefined })).toBe(false);
  });
});
