/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 FR-6 — canary skip in assignFleetIdentityAtCheckin.
 *
 * THE GAP: QF-20260724-521 added a canary skip to assign-fleet-identities.cjs:401 (the cron writer)
 * but NOT to assignFleetIdentityAtCheckin, which applies the IDENTICAL callsignInTierBand gate. Canary
 * sessions live outside the NATO tier-band scheme entirely -- canary-guard is fail-closed and REQUIRES
 * a callsign starting with 'Canary-' -- so 'Canary-1' is in no NATO band, falls through to re-derive,
 * and the canary gets silently renamed mid-drill. Closing one writer just moves the clobber to the
 * other, which is exactly what happened.
 *
 * WHY THIS FILE AND NOT worker-checkin-fleet-identity.test.js: that file is QUARANTINED
 * (tests/quarantine-manifest.json:1327) and excluded from --project unit, so an assertion added there
 * would not run in CI. This is a new, non-quarantined file alongside the two that do provide real CI
 * protection for this function (worker-checkin-callsign-collision-fix, worker-checkin-metadata-race).
 *
 * ENV-INDEPENDENCE: assignFleetIdentityAtCheckin is called with an injected fake client and an explicit
 * sessionId, so nothing here reads .env, builds a client, or depends on CLAUDE_SESSION_ID.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const { assignFleetIdentityAtCheckin } = require_('../../scripts/worker-checkin.cjs');
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Fake covering only the shapes this function touches. RECORDS every update so a silent rename is
 * detectable -- asserting the return value alone would miss a write that clobbers the stored identity.
 */
function fakeClient(metadata, { live = [], onLiveQuery } = {}) {
  const updates = [];
  return {
    updates,
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        // The slot-picking query over live sessions. Instrumented because REACHING it is what
        // distinguishes "fell through to re-derive" from "short-circuited by the canary branch" --
        // the returned callsign cannot tell those apart.
        gte: async () => { if (onLiveQuery) onLiveQuery(); return { data: live }; },
        maybeSingle: async () => ({ data: { metadata }, error: null }),
        update: (patch) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
        then: (resolve) => { if (onLiveQuery) onLiveQuery(); return Promise.resolve({ data: live, error: null }).then(resolve); },
      };
      return builder;
    },
  };
}

const CANARY_ID = 'sess-canary-1';

describe('FR-6 canary identity skip — the second clobber writer', () => {
  it('keeps a Canary- callsign instead of re-deriving a NATO one', async () => {
    // 'Canary-1' is in no NATO tier band, so without the skip this falls through to re-derive.
    const client = fakeClient({
      fleet_identity: { callsign: 'Canary-1', color: 'yellow' },
      tier_rank: 1,
    });
    const r = await assignFleetIdentityAtCheckin(client, CANARY_ID, null);
    expect(r).toEqual({ callsign: 'Canary-1', color: 'yellow' });
    expect(client.updates).toHaveLength(0); // never rewrote the identity
  });

  it('skips on the account_profile stamp even when the callsign is NOT canary-prefixed', async () => {
    // The OR is deliberate. Once FR-1/FR-3 land, account_profile is the authoritative marker; a canary
    // that has already been renamed by an earlier clobber must still be recognised and left alone.
    const client = fakeClient({
      account_profile: 'canary',
      fleet_identity: { callsign: 'Bravo', color: 'blue' },
      tier_rank: 1,
    });
    const r = await assignFleetIdentityAtCheckin(client, CANARY_ID, null);
    expect(r).toEqual({ callsign: 'Bravo', color: 'blue' });
    expect(client.updates).toHaveLength(0);
  });

  it('is NOT inert before the account_profile stamp is wired — the callsign prefix alone suffices', async () => {
    // FR-6 is sequenced after FR-1, so it would be easy to write a guard that only reads
    // account_profile and therefore does nothing until FR-1 merges. This pins that it works today.
    const client = fakeClient({ fleet_identity: { callsign: 'Canary-7', color: 'red' }, tier_rank: 3 });
    const r = await assignFleetIdentityAtCheckin(client, CANARY_ID, null);
    expect(r.callsign).toBe('Canary-7');
    expect(client.updates).toHaveLength(0);
  });

  it('ORDERING PIN: the canary check runs BEFORE the tier-band idempotency check', async () => {
    // Load-bearing. The tier-band check returns early only for an IN-BAND callsign; 'Canary-1' is in
    // no band, so if the canary guard were placed after it, every canary would reach the re-derive
    // path and the guard would never fire. A guard in the wrong position looks present and does
    // nothing -- indistinguishable from correct unless the ordering itself is asserted.
    const source = fs.readFileSync(path.join(HERE, '../../scripts/worker-checkin.cjs'), 'utf8');
    const fnStart = source.indexOf('async function assignFleetIdentityAtCheckin');
    expect(fnStart).toBeGreaterThan(-1);
    // CODE LINES ONLY. The first version of this assertion scanned raw text and matched
    // "callsignInTierBand" inside the explanatory COMMENT above the guard, reporting the guard as
    // mis-ordered when it was correct. Comments describe the code they sit next to, so any
    // position assertion over raw source will eventually match prose instead of behaviour.
    const codeLines = source
      .slice(fnStart, fnStart + 4000)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
    const canaryLine = codeLines.findIndex((l) => l.includes("startsWith('Canary-')"));
    const tierBandLine = codeLines.findIndex((l) => l.includes('callsignInTierBand('));
    expect(canaryLine, 'canary guard not found in code').toBeGreaterThan(-1);
    expect(tierBandLine, 'tier-band check not found in code').toBeGreaterThan(-1);
    expect(canaryLine).toBeLessThan(tierBandLine);
  });

  it('does NOT skip an ordinary worker — the guard must stay narrow', async () => {
    // THIS CONTROL WAS VACUOUS AND A TESTING REVIEW PROVED IT. The original asserted
    //   expect(r === null || typeof r.callsign === 'string').toBe(true)   // tautology
    //   expect(r?.callsign).not.toBe('Canary-1')                          // never true for a 'Delta' fixture
    // Widening the guard to `if (existing || ...)` — which freezes EVERY worker's identity and disables
    // the tier-band self-heal this function exists to perform — still passed 5/5. A negative control
    // that cannot fail is worse than none: it advertises coverage that does not exist.
    //
    // The real discriminator is REACHABILITY, not the returned value. The canary branch returns BEFORE
    // the live-identity query used to pick a free slot; an ordinary worker must reach that query. So we
    // record whether it happened rather than inspecting the callsign.
    let reachedLiveQuery = false;
    const client = fakeClient(
      { fleet_identity: { callsign: 'Delta', color: 'red' }, tier_rank: 1 },
      { onLiveQuery: () => { reachedLiveQuery = true; } },
    );
    await assignFleetIdentityAtCheckin(client, 'sess-worker-1', null);
    expect(reachedLiveQuery, 'an ordinary worker must NOT be short-circuited by the canary branch').toBe(true);
  });

  it('a CANARY is short-circuited before that same query (the positive half of the control)', async () => {
    // Pairs with the test above: same instrumentation, opposite expectation. Together they pin that the
    // branch is taken for exactly one of the two, which neither test alone establishes.
    let reachedLiveQuery = false;
    const client = fakeClient(
      { fleet_identity: { callsign: 'Canary-1', color: 'yellow' }, tier_rank: 1 },
      { onLiveQuery: () => { reachedLiveQuery = true; } },
    );
    await assignFleetIdentityAtCheckin(client, CANARY_ID, null);
    expect(reachedLiveQuery, 'a canary must return before the slot-picking query').toBe(false);
  });
});
