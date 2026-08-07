/**
 * SD-LEO-INFRA-RECLAIMSAFE-CANNOT-TELL-001 / FR-2 + FR-3 — the two consumers that call the
 * claim-health evidence gate WITHOUT a self-ownership override.
 *
 * Both consumers were handed one boolean built from a question neither of them asked:
 *   - sd-start.js asks "may I take this", and was blocked from reclaiming its OWN claim
 *     because its own branch counts as somebody's evidence of life.
 *   - stale-session-sweep.cjs asks "may I release someone ELSE's", and was held open by
 *     evidence that names nobody, even when the session under evaluation is verifiably dead.
 *
 * These tests pin the DECISION LOGIC of each consumer against the attribution FR-1 added.
 * They deliberately test the predicate rather than spawning the CLIs: the failure mode being
 * guarded is a wrong decision, and asserting on the decision keeps the test honest instead of
 * asserting that some helper was called.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// IMPORT THE SHIPPED PREDICATES — do not re-implement them here.
// The first cut of this file defined local copies. They were logically identical to the real
// code and all green, and a negative control showed that reverting stale-session-sweep.cjs
// produced ZERO failures while reverting sd-start.js failed only a string-grep. Testing a copy
// of the logic proves the copy works; it says nothing about what ships.
import {
  selfOwnedOverridesEvidenceGate,
  sweepShouldHoldRelease,
} from '../../lib/claim/evidence-attribution-decisions.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const sdStartOverrides = ({ selfOwned, attribution }) =>
  selfOwnedOverridesEvidenceGate({ selfOwned, evidenceAttribution: attribution });

const sweepHolds = ({ evaluatedSessionId, attribution }) =>
  sweepShouldHoldRelease({ evaluatedSessionId, evidenceAttribution: attribution });

const UNATTRIBUTED_ONLY = {
  attributed: [], unattributed: ['branch_present', 'recent_sub_agent_activity'],
  sessionIds: [], allUnattributed: true,
};
const LIVE_PEER = {
  attributed: ['sibling_session_on_branch'], unattributed: ['branch_present'],
  sessionIds: ['peer-session'], allUnattributed: false,
};
const NO_EVIDENCE = { attributed: [], unattributed: [], sessionIds: [], allUnattributed: false };

describe('FR-2: sd-start reclaims its own claim, but never a live peer\'s', () => {
  it('TS-1/TS-3: overrides the gate when self-ownership is proven and evidence names nobody', () => {
    expect(sdStartOverrides({ selfOwned: true, attribution: UNATTRIBUTED_ONLY })).toBe(true);
  });

  it('TS-2: does NOT override when evidence is attributed to a live foreign holder', () => {
    // The single most important assertion in this SD: the strand fix must not become a steal.
    expect(sdStartOverrides({ selfOwned: true, attribution: LIVE_PEER })).toBe(false);
  });

  it('TS-4: does NOT override when self-ownership cannot be proven', () => {
    // The honest limit. sd-start usually runs from the main repo, so the worktree witness
    // rarely fires; without a prior sd_key stamp the fallback does not resolve either, and
    // the gate must behave exactly as it did before this SD.
    expect(sdStartOverrides({ selfOwned: false, attribution: UNATTRIBUTED_ONLY })).toBe(false);
  });

  it('requires BOTH conditions — neither alone is sufficient', () => {
    expect(sdStartOverrides({ selfOwned: false, attribution: LIVE_PEER })).toBe(false);
    expect(sdStartOverrides({ selfOwned: true, attribution: NO_EVIDENCE })).toBe(false);
  });
});

describe('FR-3: the sweep releases a dead session\'s own residue, but holds for a live peer', () => {
  it('TS-6: releases when the only evidence is unattributed', () => {
    expect(sweepHolds({ evaluatedSessionId: 'dead-session', attribution: UNATTRIBUTED_ONLY })).toBe(false);
  });

  it('TS-5: holds when evidence is attributed to a live peer', () => {
    expect(sweepHolds({ evaluatedSessionId: 'dead-session', attribution: LIVE_PEER })).toBe(true);
  });

  it('does NOT hold when the only attributed session IS the dead one under evaluation', () => {
    // A zombie tick from the dead session must not keep its own claim alive. This is the
    // per-evaluated-session question the old undifferentiated boolean could not express.
    const selfAttributed = {
      attributed: ['tick_recent'], unattributed: [],
      sessionIds: ['dead-session'], allUnattributed: false,
    };
    expect(sweepHolds({ evaluatedSessionId: 'dead-session', attribution: selfAttributed })).toBe(false);
  });

  it('holds when a live peer is named alongside the dead session', () => {
    const mixed = {
      attributed: ['tick_recent', 'sibling_session_on_branch'], unattributed: [],
      sessionIds: ['dead-session', 'peer-session'], allUnattributed: false,
    };
    expect(sweepHolds({ evaluatedSessionId: 'dead-session', attribution: mixed })).toBe(true);
  });
});

describe('TS-16: the sweep must not reach for the self-ownership primitive', () => {
  it('stale-session-sweep.cjs never calls resolveSelfOwnership', () => {
    // resolveSelfOwnership answers "am I the owner". The sweep iterates OTHER sessions'
    // claims, so its own cwd has no relationship to the SDs it evaluates — applying it here
    // is a category error, and the familiar helper is exactly what an implementer would
    // reach for. This pins that it stays out.
    const src = readFileSync(path.join(repoRoot, 'scripts/stale-session-sweep.cjs'), 'utf8');
    const callSites = src
      .split('\n')
      .filter(l => l.includes('resolveSelfOwnership') && !l.trimStart().startsWith('//'));
    expect(callSites).toEqual([]);
  });

  it('sd-start.js DOES use it — the same helper, where the question fits', () => {
    // Negative control for the assertion above: proves the check discriminates rather than
    // trivially passing because the symbol appears nowhere in the repo.
    const src = readFileSync(path.join(repoRoot, 'scripts/sd-start.js'), 'utf8');
    expect(src).toContain('resolveSelfOwnership');
  });
});

describe('the shipped consumers are actually WIRED to these decisions', () => {
  // Testing the predicates proves the predicates work. These assertions prove the two
  // consumers still CALL them — the gap a negative control exposed, where reverting
  // stale-session-sweep.cjs wholesale broke no test at all. Deleting either call site now
  // fails here instead of passing silently.
  it('sd-start.js calls selfOwnedOverridesEvidenceGate', () => {
    const src = readFileSync(path.join(repoRoot, 'scripts/sd-start.js'), 'utf8');
    expect(src).toContain('selfOwnedOverridesEvidenceGate');
    expect(src).toContain('lib/claim/evidence-attribution-decisions.mjs');
  });

  it('stale-session-sweep.cjs calls sweepShouldHoldRelease', () => {
    const src = readFileSync(path.join(repoRoot, 'scripts/stale-session-sweep.cjs'), 'utf8');
    expect(src).toContain('sweepShouldHoldRelease');
    expect(src).toContain('lib/claim/evidence-attribution-decisions.mjs');
  });

  it('the sweep consumes evidenceAttribution, not a bare allowReclaim boolean', () => {
    // The defect was consuming one undifferentiated boolean. Pin that the sweep reads the
    // attribution, so a revert to `if (!evidence.allowReclaim) { hold }` fails here.
    const src = readFileSync(path.join(repoRoot, 'scripts/stale-session-sweep.cjs'), 'utf8');
    expect(src).toContain('evidenceAttribution');
  });
});
