/**
 * FR-3 lane 4 + TS-12 parity — scripts/modules/sd-next/display/quick-fixes.js topStartableQF.
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-B.
 *
 * This lane had ZERO coverage in the first cut, and it was also INERT: the
 * `!inFlightIds.has(qf.id)` clause read `sessionContext.inFlightQfIds`, which no production code
 * ever set. A test written against a test-supplied context would have passed while the lane did
 * nothing in production — so these tests deliberately assert the CONSUMER CONTRACT, and a
 * separate assertion below pins that a real producer exists.
 *
 * EVERY case starts from a BASELINE assertion that the fixture IS startable without the in-flight
 * set. Without that, "it was withheld" is vacuous — a fixture excluded for some unrelated reason
 * (claimed, deferred, verify-first, tier-3) would satisfy the same expectation while proving
 * nothing about this feature.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyQuickFixes } from '../../../scripts/modules/sd-next/display/quick-fixes.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const IN_FLIGHT_QF = 'QF-20260726-425';
const FREE_QF = 'QF-20260726-999';

/** A quick-fix that is startable: open, unclaimed, no PR/commit, not deferred, not factory-lane. */
const qf = (id) => ({
  id,
  status: 'open',
  severity: 'high',
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // relative, never hardcoded
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  factory_lane: false,
  target_application: 'EHG_Engineer',
});

describe('FR-3 lane 4 — topStartableQF withholds in-flight quick-fixes', () => {
  it('BASELINE: without the in-flight set, the fixture IS the startable pick', () => {
    // The control that makes every assertion below meaningful.
    const { summary } = classifyQuickFixes([qf(IN_FLIGHT_QF)], new Map(), {});
    expect(summary.topStartableQF?.id).toBe(IN_FLIGHT_QF);
  });

  it('withheld once the id is in the in-flight set', () => {
    const ctx = { inFlightQfIds: new Set([IN_FLIGHT_QF]) };
    const { summary } = classifyQuickFixes([qf(IN_FLIGHT_QF)], new Map(), ctx);
    expect(summary.topStartableQF).toBeNull();
  });

  it('falls through to the next startable QF rather than emitting nothing', () => {
    const items = [qf(IN_FLIGHT_QF), qf(FREE_QF)];
    // Baseline: the in-flight one wins when nothing is withheld.
    expect(classifyQuickFixes(items, new Map(), {}).summary.topStartableQF?.id).toBe(IN_FLIGHT_QF);
    // With it withheld, dispatch must still offer the other one — withholding must not
    // collapse the queue, which is the failure mode that makes a false withhold worse than a
    // duplicate build.
    const ctx = { inFlightQfIds: new Set([IN_FLIGHT_QF]) };
    expect(classifyQuickFixes(items, new Map(), ctx).summary.topStartableQF?.id).toBe(FREE_QF);
  });

  it('flags the withheld row as _inFlight so the reason is inspectable', () => {
    const ctx = { inFlightQfIds: new Set([IN_FLIGHT_QF]) };
    const { classified } = classifyQuickFixes([qf(IN_FLIGHT_QF), qf(FREE_QF)], new Map(), ctx);
    expect(classified.find((c) => c.id === IN_FLIGHT_QF)._inFlight).toBe(true);
    expect(classified.find((c) => c.id === FREE_QF)._inFlight).toBeUndefined();
  });
});

describe('TS-12 — ctx parity: absent or malformed input is a byte-identical no-op', () => {
  const items = [qf(IN_FLIGHT_QF), qf(FREE_QF)];
  const baseline = classifyQuickFixes(items, new Map(), {}).summary.topStartableQF?.id;

  it('no sessionContext at all', () => {
    expect(classifyQuickFixes(items, new Map()).summary.topStartableQF?.id).toBe(baseline);
  });

  it('sessionContext without the field', () => {
    expect(classifyQuickFixes(items, new Map(), { currentSession: null }).summary.topStartableQF?.id).toBe(baseline);
  });

  it('an EMPTY set withholds nothing (the fail-open shape a failed probe produces)', () => {
    const ctx = { inFlightQfIds: new Set() };
    expect(classifyQuickFixes(items, new Map(), ctx).summary.topStartableQF?.id).toBe(baseline);
  });

  it('a non-Set value is ignored rather than throwing', () => {
    for (const bad of [null, undefined, ['a'], 'nope', 42]) {
      const ctx = { inFlightQfIds: bad };
      expect(classifyQuickFixes(items, new Map(), ctx).summary.topStartableQF?.id).toBe(baseline);
    }
  });
});

describe('the consumer has a REAL producer (the defect this lane shipped with)', () => {
  it('fallback-queue.js computes and threads inFlightQfIds', () => {
    // The first cut wired this consumer with no producer anywhere in production code, so the
    // clause was a permanent no-op that logged nothing. Pin the producer so deleting it fails
    // here rather than silently disabling the lane again.
    const src = readFileSync(resolve(repoRoot, 'scripts/modules/sd-next/display/fallback-queue.js'), 'utf8');
    expect(src).toMatch(/inFlightQfIds:\s*await computeInFlightQfIds\(/);
    expect(src).toMatch(/async function computeInFlightQfIds/);
  });

  it('merged-pool-self-claim.cjs produces ctx.inflight_git_state for the SD axis', () => {
    const src = readFileSync(resolve(repoRoot, 'lib/checkin/steps/merged-pool-self-claim.cjs'), 'utf8');
    expect(src).toMatch(/tierCtx\.inflight_git_state\s*=/);
  });
});
