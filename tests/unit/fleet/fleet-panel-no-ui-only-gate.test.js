/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — "the button and the route agree".
 *
 * WHAT THE SD ASSUMED VS WHAT IS THERE. FR-4 says to "generalise the existing
 * deriveCoordinatorState into deriveRoleState and pendingCoordinatorSessionId into pendingByRole".
 * NEITHER SYMBOL EXISTS ANYWHERE IN THIS REPO — verified by a repo-wide grep. The fleet panel is a
 * minimal prompt()-based form with NO role-aware button state at all. Generalising them would have
 * meant inventing the UI the SD assumed, against buttons that do not exist. (Same class as the
 * SD's spawn-control line numbers, which were stale by +25 and pointed at the wrong verb.)
 *
 * SO THE INVARIANT HOLDS TODAY BY CONSTRUCTION, and that is worth LOCKING rather than rebuilding:
 *   - there is NO client-side role gate, so no UI-only enforcement can exist; the route is the
 *     only enforcement, which is the direction FR-4 demands;
 *   - the panel renders the route's `reason` VERBATIM, so the 400 the addSession route now returns
 *     actually reaches the operator.
 *
 * These tests fail loudly if someone later adds a client-side role gate without a matching route
 * refusal — which is precisely the regression that already happened once on this page
 * (FLEET_WORKER_ROLE with zero readers: the UI reported success while the session came up wrong).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANEL = readFileSync(path.resolve(HERE, '../../../server/public/fleet-ui/fleet-panel.js'), 'utf8');

describe('FR4-UI: the route reason reaches the operator', () => {
  it('extracts payload.reason from a non-ok response', () => {
    expect(PANEL).toMatch(/payload\.message\s*\|\|\s*payload\.reason/);
  });

  it('renders the failure text rather than a generic message', () => {
    // A generic "action failed" would swallow the named holder the route puts in `reason`,
    // which is the whole point of refusing WITH a reason.
    expect(PANEL).toMatch(/Action failed: \$\{err\.message\}/);
  });
});

describe('FR4-UI: there is NO client-side role gate — the route is the only enforcement', () => {
  it('the panel does not disable buttons by ROLE', () => {
    // The only `disabled` writes are the generic in-flight toggle, which is restored in a
    // finally block. If a role-keyed disable appears here without a matching route refusal,
    // this SD regresses to the exact failure it documents.
    const disables = PANEL.match(/\.disabled\s*=\s*[^;]+/g) || [];
    expect(disables.length).toBeGreaterThan(0);
    for (const d of disables) {
      expect(d).toMatch(/\.disabled\s*=\s*(true|false)\b/);
    }
  });

  it('does not disable buttons via setAttribute/classList either -- the .disabled PROPERTY is the only disabling mechanism this panel may use', () => {
    // UAT-agent finding, traced to feedback a64a6807 (2026-07-28): the .disabled-PROPERTY check
    // above is a source-text grep that only sees ONE of several ways JS can disable a DOM element.
    // A role-based gate expressed via setAttribute('disabled', ...) or classList.add('disabled')
    // would slip past it entirely -- so THAT test cannot fail on this alternate route. Rather than
    // writing a similarly-permissive-but-checked regex for every possible disabling mechanism,
    // this asserts the additional mechanisms are simply ABSENT -- true today, and a deliberate
    // constraint: this panel has exactly ONE disabling mechanism, so a second one appearing via any
    // means is itself worth a human's attention, disabling-logic or not.
    expect(PANEL).not.toMatch(/setAttribute\(\s*['"]disabled['"]/);
    expect(PANEL).not.toMatch(/classList\.(add|remove|toggle)\(\s*['"]disabled/);
  });

  it('does not re-derive singleton/role state client-side', () => {
    // Any of these appearing client-side means the button is deciding for itself instead of
    // rendering what the route would answer.
    for (const forbidden of ['isSingletonRole', 'decideSingletonSpawn', 'getActiveAdamId', 'getActiveSolomonId']) {
      expect(PANEL).not.toContain(forbidden);
    }
  });

  it('the SD-named symbols genuinely do not exist, so nothing was "generalised" away', () => {
    expect(PANEL).not.toContain('deriveCoordinatorState');
    expect(PANEL).not.toContain('pendingCoordinatorSessionId');
  });
});
