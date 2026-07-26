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
const { classifyWorkerNaming, pickCallsignForTier, callsignInTierBand, NATO } =
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

  it('assign-fleet-identities.cjs batches the markers and FAILS CLOSED', () => {
    const src = readFileSync(CRON, 'utf8');
    expect(src).toMatch(/CANARY_PRE_REGISTRATION_KIND/);
    // Batched, not per-worker: a per-worker await in that loop would be an N+1 against a table the
    // cron already reads in bulk.
    expect(src).toMatch(/\.in\('target_session', ids\)/);
    // On lookup failure it returns rather than naming anyone this run.
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
