// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — singleton-aware spawn.

import { describe, it, expect } from 'vitest';
import {
  decideSingletonSpawn,
  buttonAgreesWithRoute,
  isSingletonRole,
  GUARD_FRESHNESS_MS,
  PANEL_LIVE_WINDOW_MS,
} from './singleton-spawn-decision.mjs';

const holder = (ageMs, kind, id = 'abcdef12-3456') => ({ session_id: id, identity_kind: kind, heartbeat_age_ms: ageMs });

describe('FR4-REFUSE: a second Adam or Solomon is refused AT THE ROUTE, holder named', () => {
  for (const role of ['adam', 'solomon']) {
    it(`refuses a second ${role} with HTTP 400 naming the holder`, () => {
      const d = decideSingletonSpawn({ role, holder: holder(10_000, role) });
      expect(d.allowed).toBe(false);
      expect(d.httpStatus).toBe(400);
      expect(d.reason).toMatch(/already holds this role/);
      expect(d.reason).toMatch(/abcdef12/); // the client renders reason verbatim
    });
  }

  it('allows the spawn when no holder exists', () => {
    expect(decideSingletonSpawn({ role: 'adam', holder: null }).allowed).toBe(true);
  });
});

describe('FR4-COORDINATOR: never refused — refusing would break succession', () => {
  it('allows a coordinator spawn even with a fresh live holder', () => {
    const d = decideSingletonSpawn({ role: 'coordinator', holder: holder(5_000, 'coordinator') });
    expect(d.allowed).toBe(true);
    expect(d.httpStatus).toBe(200);
    expect(d.uiEnabled).toBe(true);
  });

  it('relabels rather than blocking — takeover is the designed behaviour', () => {
    const d = decideSingletonSpawn({ role: 'coordinator', holder: holder(5_000, 'coordinator') });
    expect(d.uiLabel).toMatch(/Take over/);
  });
});

describe('FR4-WINDOW: the 600s/3600s mismatch is load-bearing', () => {
  it('the two windows are genuinely different — gating on the wrong one is the bug', () => {
    expect(GUARD_FRESHNESS_MS).toBe(600_000);
    expect(PANEL_LIVE_WINDOW_MS).toBe(3_600_000);
  });

  it('a holder in the 600s-3600s band is NOT refused — the spawn would have succeeded', () => {
    // Gating on the PANEL's window here would block for up to fifty minutes during which
    // registration would have allowed the spawn.
    const d = decideSingletonSpawn({ role: 'adam', holder: holder(30 * 60_000, 'adam') });
    expect(d.allowed).toBe(true);
    expect(d.uiEnabled).toBe(true);
  });

  it('and is labelled "Replace the stale Adam" rather than disabled', () => {
    const d = decideSingletonSpawn({ role: 'adam', holder: holder(30 * 60_000, 'adam') });
    expect(d.uiLabel).toBe('Replace the stale Adam');
  });

  it('refuses exactly at the guard boundary and allows just past it', () => {
    expect(decideSingletonSpawn({ role: 'adam', holder: holder(GUARD_FRESHNESS_MS, 'adam') }).allowed).toBe(false);
    expect(decideSingletonSpawn({ role: 'adam', holder: holder(GUARD_FRESHNESS_MS + 1, 'adam') }).allowed).toBe(true);
  });
});

describe('FR4-IDENTITY: identity_kind must match the role', () => {
  it('a row holding a DIFFERENT role does not block this one', () => {
    // Gating on a stale stamp would block a spawn the guard would have allowed.
    const d = decideSingletonSpawn({ role: 'adam', holder: holder(1_000, 'coordinator') });
    expect(d.allowed).toBe(true);
  });
});

describe('FR4-INVARIANT: the button and the route always agree', () => {
  it('holds across every combination of role, holder age and identity kind', () => {
    const ages = [0, 1_000, GUARD_FRESHNESS_MS - 1, GUARD_FRESHNESS_MS, GUARD_FRESHNESS_MS + 1,
      30 * 60_000, PANEL_LIVE_WINDOW_MS, PANEL_LIVE_WINDOW_MS + 1];
    const roles = ['adam', 'solomon', 'coordinator', 'worker'];
    const kinds = ['adam', 'solomon', 'coordinator', undefined];
    for (const role of roles) {
      for (const age of ages) {
        for (const kind of kinds) {
          for (const h of [null, holder(age, kind)]) {
            const d = decideSingletonSpawn({ role, holder: h });
            // No UI-only gate, ever: a disabled button implies a refusing route.
            expect(buttonAgreesWithRoute(d), `${role}/${age}/${kind}/${h ? 'holder' : 'none'}`).toBe(true);
            if (!d.allowed) expect(d.httpStatus).toBe(400);
            else expect(d.httpStatus).toBe(200);
          }
        }
      }
    }
  });

  it('a non-singleton role is never gated', () => {
    expect(isSingletonRole('worker')).toBe(false);
    expect(decideSingletonSpawn({ role: 'worker', holder: holder(0, 'worker') }).allowed).toBe(true);
  });
});
