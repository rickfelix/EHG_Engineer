/**
 * SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-E — FR-7: the NATO-callsign clobber.
 *
 * THE DEFECT: both callsign writers skip canaries using two LATE signals — account_profile and
 * fleet_identity.callsign — which are written by the SAME metadata update inside the session-bind
 * loop and are BOTH absent during the 0-10s registration window and on the reboot-respawn path. So an
 * unstamped canary fell through to pickCallsignForTier and was renamed to a NATO callsign. That loss
 * is PERMANENT: stampRespawnedCanary only carries a callsign forward when the incoming one is already
 * canary-shaped, so once renamed the discriminator never comes back.
 *
 * COVERAGE SPLIT, stated honestly because it changed mid-build. This file originally leaned on source
 * regexes for both writers. Mutation testing then showed that was not coverage at all: wrapping the
 * cron's guard in `false &&` left every regex matching and all tests green. So the cron decision was
 * extracted (classifyWorkerNaming) and is now exercised behaviourally below, and the checkin writer's
 * behaviour lives in tests/unit/worker-checkin-canary-identity-skip.test.js. The few remaining source
 * assertions cover only things behaviour cannot see — that the batched lookup is not an N+1, and that
 * the removed inline condition has not crept back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { isCanarySession, CANARY_PRE_REGISTRATION_KIND } from '../../../lib/fleet/canary-session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKIN = resolve(__dirname, '../../../scripts/worker-checkin.cjs');
const CRON = resolve(__dirname, '../../../scripts/assign-fleet-identities.cjs');
const { classifyWorkerNaming, pickCallsignForTier, callsignInTierBand, NATO,
  partitionWorkersForNaming, loadPreRegisteredCanaries, dedupeAssignedCallsigns,
  planNamingRun, reserveCanaryLabels } =
  createRequire(import.meta.url)('../../../scripts/assign-fleet-identities.cjs');

function sbWith(rows, error = null) {
  const api = {
    from() { return api; }, select() { return api; }, eq() { return api; }, in() { return api; },
    limit() { return Promise.resolve({ data: rows, error }); },
  };
  return api;
}

describe('FR-7: an UNSTAMPED canary must be recognised before it can be renamed', () => {
  it('the 0-10s window: empty metadata + pre-registration => canary', async () => {
    // This is the exact state in which the old two-signal skip did NOT fire.
    const out = await isCanarySession(sbWith([{ id: 'pre-1' }]), { sessionId: 's-canary', metadata: {} });
    expect(out.isCanary).toBe(true);
    expect(out.reason).toBe('canary_pre_registration');
  });

  it('the reboot-respawn case: no metadata written EVER + pre-registration => canary', async () => {
    // reboot-respawn-runner.js bypasses spawn() entirely and stamps nothing, so metadata is not
    // merely late here — it never arrives. Only a spawn-time marker can see this session.
    const out = await isCanarySession(sbWith([{ id: 'pre-2' }]), { sessionId: 's-respawned', metadata: null });
    expect(out.isCanary).toBe(true);
  });

  it('NEGATIVE CONTROL: an unstamped ORDINARY worker is NOT protected and can still be named', async () => {
    // Without this the fix could over-fire and silently stop naming the entire fleet — which would
    // look like an idle cron rather than a bug.
    const out = await isCanarySession(sbWith([]), { sessionId: 's-worker', metadata: {} });
    expect(out.isCanary).toBe(false);
  });
});

describe('FR-7: both writers consult the canonical predicate', () => {
  it('worker-checkin.cjs delegates to isCanarySession and FAILS CLOSED', () => {
    const src = readFileSync(CHECKIN, 'utf8');
    expect(src).toMatch(/await import\('\.\.\/lib\/fleet\/canary-session\.js'\)/);
    expect(src).toMatch(/isCanarySession\(sb, \{ sessionId, metadata: myMeta \}\)/);
    // Renaming is irreversible, so an unavailable check must NOT fall through to the rename path for
    // a session that could still be an unstamped canary. The fail-closed is SCOPED to nameless
    // sessions on purpose — see the comment at the call site; a blanket version would stop naming the
    // whole fleet on a transient fault, which looks like an idle cron rather than a bug.
    expect(src).toMatch(/canary_check_unavailable_nameless/);
    expect(src).toMatch(/isCanary: nameless/);
  });

  it('assign-fleet-identities.cjs consults the shared kind constant and can refuse the run', () => {
    const src = readFileSync(CRON, 'utf8');
    expect(src).toMatch(/CANARY_PRE_REGISTRATION_KIND/);
    // The fail-closed BRANCH is asserted here only as "this message still exists"; what actually
    // protects it is the behavioural ok:false case in the loadPreRegisteredCanaries block below. The
    // batching/no-N+1 property used to be pinned by a regex for `.in('target_session', ids)` — that
    // literal is gone now the lookup is chunked, and a regex could not have told a 50-per-request
    // chunk from one oversized query anyway. Both properties moved to real assertions.
    expect(src).toMatch(/skipping all naming this run rather than risk renaming a canary/);
  });

  it('the checkin writer no longer relies on the two LATE signals alone', () => {
    // The old condition was exactly `account_profile === 'canary' || callsign.startsWith('Canary-')`.
    // Its survival as the ONLY gate is the regression this guards.
    expect(readFileSync(CHECKIN, 'utf8')).not.toMatch(/if \(myMeta\.account_profile === 'canary' \|\| \(existing/);
  });
});

/**
 * BEHAVIOURAL, not textual. The cron's guard was previously pinned only by a source regex for
 * `preRegisteredCanaries.has(worker.session_id)` — and a mutation wrapping that very call in
 * `false &&` left the regex matching and all 1087 tests green. The guard was uncovered while looking
 * covered, which is the same defect shape as a stubbed writer or an unasserted counter. These drive
 * the extracted decision directly so the classification itself has to be right.
 */
/**
 * F2 REGRESSION — the fix that was INERT. A TESTING review proved the first version of FR-7's cron half
 * protected nothing: classifyWorkerNaming returned the right canary verdict, the worker went into
 * assignedRaw, and then dedupeAssignedCallsigns — which treats a worker with no
 * metadata.fleet_identity.callsign as "not really assigned" — demoted it back into needsAssignment,
 * where it was renamed and broadcast. An unstamped canary has no callsign by definition, so EVERY newly
 * protected case was demoted; only the case that already worked before FR-7 survived.
 *
 * So the property under test is the BUCKET, not the verdict: a canary must never enter assignedRaw,
 * because everything downstream of that list can undo the decision. Asserting the verdict alone is
 * exactly the mistake that shipped.
 */
describe('F2: a canary must never enter the list that dedupe can demote', () => {
  const canaryMd = (m) => m?.account_profile === 'canary' || !!m?.fleet_identity?.callsign?.startsWith('Canary-');

  it('a pre-registered, CALLSIGN-LESS canary is bucketed away from assignedRaw entirely', () => {
    const w = { session_id: 's-canary', metadata: {} };
    const parts = partitionWorkersForNaming([w], new Set(['s-canary']), false, canaryMd);
    expect(parts.canaryProtected).toHaveLength(1);
    expect(parts.assignedRaw).toHaveLength(0);      // <- the inert version put it HERE
    expect(parts.needsAssignment).toHaveLength(0);
  });

  it('END-TO-END of the regression: running the real dedupe over the buckets cannot demote it', () => {
    // This is the assertion whose absence let the inert version ship. It drives the ACTUAL
    // dedupeAssignedCallsigns over the ACTUAL partition output, rather than trusting the verdict.
    const canary = { session_id: 's-canary', metadata: {} };
    const worker = { session_id: 's-worker', metadata: { fleet_identity: { callsign: 'Zulu', color: 'blue' }, tier_rank: 1 } };
    const parts = partitionWorkersForNaming([canary, worker], new Set(['s-canary']), false, canaryMd);
    const { demoted } = dedupeAssignedCallsigns(parts.assignedRaw);
    expect(demoted.map((d) => d.session_id)).not.toContain('s-canary');
    // And the control: had it been placed in assignedRaw, dedupe WOULD have demoted it — proving the
    // hazard is real and the bucket is what avoids it, not some property of the canary itself.
    expect(dedupeAssignedCallsigns([canary]).demoted.map((d) => d.session_id)).toContain('s-canary');
  });

  it('an account_profile-stamped canary with no callsign is also protected', () => {
    const w = { session_id: 's-c2', metadata: { account_profile: 'canary' } };
    const parts = partitionWorkersForNaming([w], new Set(), false, canaryMd);
    expect(parts.canaryProtected.map((c) => c.session_id)).toEqual(['s-c2']);
    expect(parts.assignedRaw).toHaveLength(0);
  });

  it('NEGATIVE CONTROL — ordinary workers still flow to their normal buckets', () => {
    // Without this the partition could route EVERYTHING to canaryProtected, freezing all naming, and
    // both tests above would still pass.
    const inBandCallsign = pickCallsignForTier(1, new Set());
    const inBand = { session_id: 's-a', metadata: { fleet_identity: { callsign: inBandCallsign, color: 'blue' }, tier_rank: 1 } };
    const unnamed = { session_id: 's-b', metadata: {} };
    const parts = partitionWorkersForNaming([inBand, unnamed], new Set(), false, canaryMd);
    expect(parts.canaryProtected).toHaveLength(0);
    expect(parts.assignedRaw.map((w) => w.session_id)).toEqual(['s-a']);
    expect(parts.needsAssignment.map((w) => w.session_id)).toEqual(['s-b']);
  });
});

/**
 * F3 — the DB→Set path. While this lived inline in main() it had NO reachable assertion: three separate
 * mutations stayed green across the whole suite (deleting the fail-closed return, deleting
 * `if (error) throw error`, and making the Set-population loop a no-op, which disables FR-7's cron
 * protection outright). The only thing pointing at it was a regex matching the console.log STRING.
 */
describe('F3: loadPreRegisteredCanaries — the marker lookup itself', () => {
  function fakeSb({ pages = [[]], error = null } = {}) {
    const calls = [];
    let i = 0;
    const api = {
      from() { return api; },
      select() { return api; },
      in(col, vals) { calls.push(vals); return api; },
      eq() { return Promise.resolve({ data: error ? null : (pages[i++] || []), error }); },
    };
    return { api, calls };
  }

  it('populates the Set from the rows returned', async () => {
    const { api } = fakeSb({ pages: [[{ target_session: 'a' }, { target_session: 'b' }]] });
    const out = await loadPreRegisteredCanaries(api, ['a', 'b', 'c'], 'canary_pre_registration');
    expect(out.ok).toBe(true);
    expect([...out.canaries].sort()).toEqual(['a', 'b']);
  });

  it('CHUNKS the id list so a large fleet cannot 414 into the fleet-wide fail-closed', async () => {
    // Unchunked, the fail-closed quietly becomes fail-ALWAYS as the fleet grows — and it presents as
    // an idle cron, not an error.
    const ids = Array.from({ length: 120 }, (_, n) => `s-${n}`);
    const { api, calls } = fakeSb({ pages: [[], [], []] });
    const out = await loadPreRegisteredCanaries(api, ids, 'k', 50);
    expect(out.ok).toBe(true);
    expect(calls.map((c) => c.length)).toEqual([50, 50, 20]);
  });

  it('reports ok:false on a query error so the caller names NOBODY that run', async () => {
    const { api } = fakeSb({ error: { code: '42501', message: 'permission denied for relation ...' } });
    const out = await loadPreRegisteredCanaries(api, ['a'], 'k');
    expect(out.ok).toBe(false);
    expect(out.error).toBe('42501'); // code, not the driver message
  });

  it('skips falsy ids and makes no query at all for an empty fleet', async () => {
    const { api, calls } = fakeSb();
    const out = await loadPreRegisteredCanaries(api, [null, undefined, ''], 'k');
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

/**
 * R3 — the fail-closed CONSEQUENCE, not the flag. The loader reported ok:false correctly, but nothing
 * proved the caller acted on it: deleting the fail-closed `return` left the whole suite green. That is
 * the same "correct decision, unverified consumer" shape as F2, which is why this SD needed a second
 * review pass. planNamingRun makes the consequence structural — on a failed lookup there are no buckets
 * at all, so there is no list to name anyone from even if a caller ignored `skip`.
 */
describe('R3: a failed marker lookup yields NO nameable buckets', () => {
  const canaryMd = () => false;
  const brokenSb = () => ({
    from() { return this; }, select() { return this; }, in() { return this; },
    eq() { return Promise.resolve({ data: null, error: { code: '42501' } }); },
  });

  it('returns skip:true AND withholds every bucket', async () => {
    const workers = [{ session_id: 's-1', metadata: {} }, { session_id: 's-2', metadata: {} }];
    const plan = await planNamingRun(brokenSb(), workers, 'k', false, canaryMd);
    expect(plan.skip).toBe(true);
    expect(plan.error).toBe('42501');
    // The point: even a caller that ignored `skip` has nothing to iterate.
    expect(plan.assignedRaw).toBeUndefined();
    expect(plan.needsAssignment).toBeUndefined();
  });

  it('NEGATIVE CONTROL — a healthy lookup does produce buckets', async () => {
    // Without this, a planner hardcoded to skip would pass the test above and freeze all naming.
    const okSb = {
      from() { return this; }, select() { return this; }, in() { return this; },
      eq() { return Promise.resolve({ data: [{ target_session: 's-1' }], error: null }); },
    };
    const workers = [{ session_id: 's-1', metadata: {} }, { session_id: 's-2', metadata: {} }];
    const plan = await planNamingRun(okSb, workers, 'k', false, canaryMd);
    expect(plan.skip).toBe(false);
    expect(plan.canaryProtected.map((w) => w.session_id)).toEqual(['s-1']); // marker honoured
    expect(plan.needsAssignment.map((w) => w.session_id)).toEqual(['s-2']); // ordinary still named
  });
});

/**
 * R6 — the duplicate-identity mitigation, which was itself unverified: removing the reservation left the
 * whole suite green. A protected canary never reaches the `assigned` set that seeds usedCallsigns, so
 * without this its held label would be issued to a second session as well.
 */
describe('R6: labels held by a protected canary stay reserved', () => {
  it('reserves the callsign and colour of an already-clobbered canary', () => {
    // The realistic case: an earlier clobber renamed this canary to 'Bravo'. It is still protected
    // (the spawn-time marker survives a rename), so 'Bravo' must not be handed out again.
    const used = new Set(['Alpha']);
    const colors = new Set(['blue']);
    reserveCanaryLabels(used, colors, [
      { session_id: 's-c', metadata: { fleet_identity: { callsign: 'Bravo', color: 'yellow' } } },
    ]);
    expect(used.has('Bravo')).toBe(true);
    expect(colors.has('yellow')).toBe(true);
    expect(used.has('Alpha')).toBe(true); // pre-existing entries untouched
  });

  it('tolerates a canary with NO identity yet (the unstamped case) without polluting the sets', () => {
    // The primary FR-7 target has no callsign at all; reserving `undefined` would poison nextAvailable.
    const used = new Set();
    const colors = new Set();
    reserveCanaryLabels(used, colors, [{ session_id: 's-c', metadata: {} }, null, undefined]);
    expect(used.size).toBe(0);
    expect(colors.size).toBe(0);
  });

  it('END-TO-END: a reserved canary label is not reissued by the real allocator', () => {
    // Drives the ACTUAL pickCallsignForTier, so this fails if the reservation is dropped — rather than
    // asserting only that a Set was mutated.
    const rank = 1;
    const held = pickCallsignForTier(rank, new Set()); // the label the allocator would hand out next
    const used = new Set();
    reserveCanaryLabels(used, new Set(), [
      { session_id: 's-c', metadata: { fleet_identity: { callsign: held, color: 'yellow' } } },
    ]);
    expect(pickCallsignForTier(rank, used)).not.toBe(held);
  });
});

describe('FR-7: classifyWorkerNaming — the cron decision, exercised not grepped', () => {
  const md = (metadata) => ({ session_id: 's-1', metadata });
  const canaryMd = (m) => m?.account_profile === 'canary' || !!m?.fleet_identity?.callsign?.startsWith('Canary-');

  it('a PRE-REGISTERED session is protected even with metadata completely empty', () => {
    // The 0-10s window and the reboot-respawn path. No metadata signal can see this.
    const out = classifyWorkerNaming(md({}), new Set(['s-1']), false, canaryMd);
    expect(out).toBe('canary_marker');
  });

  it('protection survives a metadata shape that would otherwise be renamed', () => {
    // An unstamped canary that an earlier clobber already renamed to a NATO callsign in the WRONG
    // tier band: every other path sends this to needs_assignment. Only the marker saves it.
    const worker = { session_id: 's-1', metadata: { fleet_identity: { callsign: 'Bravo', color: 'blue' }, tier_rank: 3 } };
    expect(classifyWorkerNaming(worker, new Set(['s-1']), false, canaryMd)).toBe('canary_marker');
    // ...and WITHOUT the marker the same worker is renamed — proving the marker is what did it.
    expect(classifyWorkerNaming(worker, new Set(), false, canaryMd)).toBe('needs_assignment');
  });

  it('forceReassign does NOT override the canary marker', () => {
    // --force exists to re-derive drifted NATO callsigns; applying it to a canary would destroy the
    // discriminator the flag was never meant to touch.
    expect(classifyWorkerNaming(md({}), new Set(['s-1']), true, canaryMd)).toBe('canary_marker');
  });

  it('NEGATIVE CONTROL — an in-band ordinary worker is kept, an out-of-band one is renamed', () => {
    // Without both halves the guard could be widened to protect everyone (freezing the tier-band
    // self-heal this cron exists to perform) and still pass.
    //
    // The fixtures are DERIVED from the shipped band helpers, not hardcoded. My first version pinned
    // 'Alpha' as tier-1 and failed: bands are computed from the LIVE ladderTopRank(), which is not 4
    // here, so 'Alpha' sits in a different band than the legacy map implies. A hardcoded callsign in
    // this test asserts the ladder's current shape rather than the classifier's logic, and breaks on
    // any fleet resize — which is exactly the hardcoded-4-rung assumption the ladder module removed.
    const RANK = 1;
    const inBandCallsign = pickCallsignForTier(RANK, new Set());
    const outOfBandCallsign = NATO.find((c) => !callsignInTierBand(c, RANK));
    // Precondition, asserted rather than assumed: if the pool ever collapses to one band there is no
    // out-of-band letter and the second half below would be vacuous.
    expect(callsignInTierBand(inBandCallsign, RANK)).toBe(true);
    expect(outOfBandCallsign, 'no out-of-band callsign exists — control would be vacuous').toBeDefined();

    const inBand = { session_id: 's-2', metadata: { fleet_identity: { callsign: inBandCallsign, color: 'blue' }, tier_rank: RANK } };
    expect(classifyWorkerNaming(inBand, new Set(), false, canaryMd)).toBe('in_band');
    const outOfBand = { session_id: 's-3', metadata: { fleet_identity: { callsign: outOfBandCallsign, color: 'blue' }, tier_rank: RANK } };
    expect(classifyWorkerNaming(outOfBand, new Set(), false, canaryMd)).toBe('needs_assignment');
  });

  it('reports WHICH guard fired, so the pre-registration path cannot rot behind the metadata path', () => {
    // A bare boolean would let the marker check break silently on any session that also happens to
    // carry the late stamp — the majority case once the stamp lands.
    const stamped = md({ account_profile: 'canary' });
    expect(classifyWorkerNaming(stamped, new Set(), false, canaryMd)).toBe('canary_metadata');
    expect(classifyWorkerNaming(stamped, new Set(['s-1']), false, canaryMd)).toBe('canary_marker');
  });

  it('delegates the metadata test to the injected predicate instead of a sixth inline copy', () => {
    // Proves delegation by INJECTING a predicate that disagrees with the old inline logic: a hardcoded
    // startsWith('Canary-') would ignore this and return needs_assignment.
    const worker = { session_id: 's-9', metadata: { some_future_marker: true } };
    expect(classifyWorkerNaming(worker, new Set(), false, () => true)).toBe('canary_metadata');
    const cron = readFileSync(CRON, 'utf8');
    const body = cron.slice(cron.indexOf('function classifyWorkerNaming'));
    expect(body.slice(0, body.indexOf('\n}'))).not.toMatch(/startsWith\(\s*['"]Canary-/);
  });

  it('the pre-registration kind is a single shared constant, not a duplicated literal', () => {
    // Two writers keyed on independently-typed strings is a drift waiting to happen.
    expect(CANARY_PRE_REGISTRATION_KIND).toBe('canary_pre_registration');
    const cron = readFileSync(CRON, 'utf8');
    expect(cron).not.toMatch(/'canary_pre_registration'/); // imported, never re-typed
  });
});
