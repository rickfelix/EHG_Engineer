/**
 * QF-20260720-638 — coordinator-idle-qf-hint.mjs: idle-worker QF auto-hint core.
 *
 * SAFETY-CRITICAL: the belt-and-suspenders chairman-gated exclusion is the load-bearing
 * guard of this whole feature (2026-07-20 near-miss: a chairman-gated QF slipped past
 * isChairmanGatedQF() alone during a manual hint, caught before the worker acted). The tests
 * here specifically replicate that near-miss to prove it cannot recur even when the DB columns
 * (owner/release_condition) that isChairmanGatedQF reads are unset/stale.
 */
import { describe, it, expect } from 'vitest';
import {
  isHintExcludedGated,
  tierFitOk,
  eligibleIdleWorkers,
  eligibleQfCandidates,
  runIdleQfHintCore,
  SPIN_UP_GRACE_MS,
  KNOWN_GATED_QF_IDS,
} from '../../../scripts/coordinator-idle-qf-hint.mjs';

const NOW = Date.parse('2026-07-20T12:00:00Z');

const qf = (over = {}) => ({
  id: 'QF-20260720-001', title: 'fix a small thing', description: 'a routine bug fix',
  severity: 'medium', status: 'open', pr_url: null, commit_sha: null,
  created_at: '2026-07-20T11:00:00Z', routing_tier: 1, not_before: null,
  owner: null, release_condition: null, ...over,
});

const worker = (over = {}) => ({
  session_id: 'sess-1', sd_key: null, status: 'active',
  heartbeat_at: new Date(NOW - 60_000).toISOString(),
  created_at: new Date(NOW - SPIN_UP_GRACE_MS - 60_000).toISOString(),
  claimed_at: '2026-07-01T00:00:00Z', metadata: { model: 'sonnet' }, ...over,
});

describe('isHintExcludedGated — belt-and-suspenders governance (near-miss regression)', () => {
  it('excludes the exact QF that slipped through the 2026-07-20 near-miss, via the explicit list, even with clean owner/release_condition', () => {
    const gated = qf({ id: 'QF-20260719-281', title: 'Apply 5 committed-but-unapplied migrations', owner: null, release_condition: null });
    expect(KNOWN_GATED_QF_IDS.has('QF-20260719-281')).toBe(true);
    expect(isHintExcludedGated(gated)).toBe(true);
  });

  it('excludes via the text heuristic (layer 2) when owner/release_condition are unset (the exact near-miss shape)', () => {
    const gated = qf({ id: 'QF-99999999-999', title: 'Apply a CHAIRMAN-GATED migration', owner: null, release_condition: null });
    expect(isHintExcludedGated(gated)).toBe(true);
  });

  it('does NOT exclude a genuinely routine QF', () => {
    expect(isHintExcludedGated(qf())).toBe(false);
  });

  it('text heuristic matches on description too, not just title', () => {
    const gated = qf({ title: 'small fix', description: 'requires @approved-by chairman before apply' });
    expect(isHintExcludedGated(gated)).toBe(true);
  });
});

describe('eligibleQfCandidates — full pipeline exclusion (isAutoStartableQF + governance)', () => {
  it('the near-miss QF is excluded from the ranked list even as the ONLY open QF', () => {
    const gated = qf({ id: 'QF-20260719-281', title: 'Apply 5 committed-but-unapplied migrations (CHAIRMAN-GATED DDL)' });
    expect(eligibleQfCandidates([gated], NOW)).toEqual([]);
  });

  it('a routine QF passes through', () => {
    const routine = qf();
    expect(eligibleQfCandidates([routine], NOW).map((q) => q.id)).toEqual([routine.id]);
  });

  it('excludes a not_before-in-future row (layer 1, via isAutoStartableQF)', () => {
    const parked = qf({ not_before: '2027-01-01T00:00:00Z' });
    expect(eligibleQfCandidates([parked], NOW)).toEqual([]);
  });

  it('excludes a row carrying the canonical chairman-gated columns (layer 4, via isAutoStartableQF)', () => {
    const columnGated = qf({ owner: 'chairman', release_condition: 'EU-send-planned' });
    expect(eligibleQfCandidates([columnGated], NOW)).toEqual([]);
  });
});

describe('tierFitOk — conservative routing_tier vs worker-rank heuristic', () => {
  it('a routing_tier-1 QF is fine for any worker', () => {
    expect(tierFitOk(qf({ routing_tier: 1 }), worker({ metadata: {} }))).toBe(true);
  });

  it('a routing_tier-2 QF requires the top capability rung', () => {
    const bottomRung = worker({ metadata: { tier_rank: 5 } });
    expect(tierFitOk(qf({ routing_tier: 2 }), bottomRung)).toBe(false);
    const topRung = worker({ metadata: { tier_rank: 1 } });
    expect(tierFitOk(qf({ routing_tier: 2 }), topRung)).toBe(true);
  });
});

describe('eligibleIdleWorkers — sd_key + spin-up grace', () => {
  it('excludes a worker already claiming something', () => {
    expect(eligibleIdleWorkers([worker({ sd_key: 'SD-X-001' })], NOW)).toEqual([]);
  });

  it('excludes a session that just (re)started (inside the spin-up grace)', () => {
    const fresh = worker({ created_at: new Date(NOW - 30_000).toISOString() });
    expect(eligibleIdleWorkers([fresh], NOW)).toEqual([]);
  });

  it('includes an idle worker past the spin-up grace', () => {
    const w = worker();
    expect(eligibleIdleWorkers([w], NOW).map((x) => x.session_id)).toEqual([w.session_id]);
  });
});

// QF-20260830-885: claude_sessions.sd_key is a MIRROR nothing clears on SD completion (measured:
// Hotel-3, directive dac88a87 — completed QF-20260830-795, both authoritative claim tables read
// zero, yet sd_key still named the finished item and line 207's mirror-only check called him
// busy). The coordinator's own acceptance bar: a fixture where sd_key is non-null AND that key
// is completed/unclaimed on the authoritative table must yield idle=true.
describe('eligibleIdleWorkers — sd_key staleness against the authoritative table (Hotel-3 regression)', () => {
  it('a non-null sd_key whose session is NOT in sdHolderSessionIds (completed/unclaimed) still counts idle', () => {
    const w = worker({ session_id: 'hotel-3', sd_key: 'SD-COMPLETED-001' });
    const sdHolders = new Set(); // authoritative table: nothing claimed by hotel-3
    expect(eligibleIdleWorkers([w], NOW, new Set(), new Set(), sdHolders).map((x) => x.session_id)).toEqual(['hotel-3']);
  });

  it('[TWO-SIDED] a non-null sd_key whose session IS in sdHolderSessionIds still excludes (genuinely busy)', () => {
    const w = worker({ session_id: 'hotel-3', sd_key: 'SD-LIVE-001' });
    const sdHolders = new Set(['hotel-3']);
    expect(eligibleIdleWorkers([w], NOW, new Set(), new Set(), sdHolders)).toEqual([]);
  });

  it('fail-open: sdHolderSessionIds=null (authoritative read failed) falls back to the OLD mirror-only check', () => {
    const w = worker({ session_id: 'hotel-3', sd_key: 'SD-X-001' });
    expect(eligibleIdleWorkers([w], NOW, new Set(), new Set(), null)).toEqual([]);
  });

  it('a null sd_key is unaffected by the authoritative set either way', () => {
    const w = worker({ session_id: 'w-idle', sd_key: null });
    expect(eligibleIdleWorkers([w], NOW, new Set(), new Set(), new Set()).map((x) => x.session_id)).toEqual(['w-idle']);
    expect(eligibleIdleWorkers([w], NOW, new Set(), new Set(), null).map((x) => x.session_id)).toEqual(['w-idle']);
  });
});

// QF-20260830-454: a seat executing dispatched work has no sd_key/qf-holder row, so it must be
// excludable on the seat_busy_reservation kind alone (Hotel-5 specimen, directive 98f2a4b5).
describe('eligibleIdleWorkers — seat_busy_reservation exclusion (Hotel-5 dispatched-work regression)', () => {
  it('excludes a session with a live seat_busy_reservation even with no sd_key and no QF hold', () => {
    const w = worker({ session_id: 'hotel-5' });
    const seatBusy = new Set(['hotel-5']);
    expect(eligibleIdleWorkers([w], NOW, new Set(), seatBusy)).toEqual([]);
  });

  it('[TWO-SIDED] includes a session NOT in seatBusySessionIds — unaffected by the new gate', () => {
    const w = worker({ session_id: 'w-idle' });
    const seatBusy = new Set(['some-other-session']);
    expect(eligibleIdleWorkers([w], NOW, new Set(), seatBusy).map((x) => x.session_id)).toEqual(['w-idle']);
  });

  it('defaults to an empty seatBusySessionIds when omitted — backward compatible', () => {
    const w = worker();
    expect(eligibleIdleWorkers([w], NOW).map((x) => x.session_id)).toEqual([w.session_id]);
  });
});

// SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001: recently-released shells must not receive a claim
// hint mid-wind-down. Named regression fixture for the forcing incident (07:56:44Z, Hotel-5):
// released, heartbeat fresh, no sd_key, past spin-up grace — everything else about the shape
// looks like idle capacity except the recent release.
describe('eligibleIdleWorkers — release-recency exclusion (07:56:44Z Hotel-5 shell-window regression)', () => {
  it('excludes a session released within the recency window (the incident specimen)', () => {
    const shell = worker({ session_id: 'hotel-5', released_at: new Date(NOW - 7 * 60 * 1000).toISOString() });
    expect(eligibleIdleWorkers([shell], NOW)).toEqual([]);
  });

  it('includes a session released long ago (outside the window) — genuinely idle, still hintable', () => {
    const longIdle = worker({ session_id: 'w-idle', released_at: new Date(NOW - 60 * 60 * 1000).toISOString() });
    expect(eligibleIdleWorkers([longIdle], NOW).map((x) => x.session_id)).toEqual(['w-idle']);
  });

  it('includes a session that was never released (released_at null) — unaffected by the new gate', () => {
    const neverReleased = worker({ session_id: 'w-fresh', released_at: null });
    expect(eligibleIdleWorkers([neverReleased], NOW).map((x) => x.session_id)).toEqual(['w-fresh']);
  });
});

describe('runIdleQfHintCore — end-to-end decision (dry-run seam, no live insert)', () => {
  function qfsForSelect(qfs, selectedCols) {
    if (selectedCols.includes('verified_at')) return qfs;
    return (qfs || []).map(({ verified_at: _verified_at, ...rest }) => rest);
  }

  // verifiedAtMissing simulates the staged (not-yet-applied) verified_at column
  // (SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 FR-6): the pre-flight probe
  // (.select('verified_at').limit(1)) resolves 42703 when true, null-error otherwise.
  function makeFakeSupabase({ sessions, qfs, verifiedAtMissing = false, sdHolders = [] }) {
    return {
      from(table) {
        let selectedCols = '';
        return {
          select(cols) { selectedCols = cols || ''; return this; },
          eq() { return this; },
          is() { return this; },
          order() { return this; },
          gt() { return this; }, // QF-20260830-454: seat_busy_reservation expires_at filter
          not() { return this; }, // QF-20260830-885: strategic_directives_v2 claiming_session_id filter
          // The verified_at pre-flight probe's terminal call.
          limit() {
            if (table === 'quick_fixes' && selectedCols === 'verified_at') {
              return Promise.resolve(verifiedAtMissing
                ? { data: null, error: { code: '42703', message: 'column quick_fixes.verified_at does not exist' } }
                : { data: [], error: null });
            }
            // QF-20260830-885: the authoritative SD-holder read (.select('claiming_session_id')
            // .not(...).limit(500)) terminates here, not at .then()/.range().
            if (table === 'strategic_directives_v2' && selectedCols === 'claiming_session_id') {
              return Promise.resolve({ data: sdHolders, error: null });
            }
            return Promise.resolve({ data: [], error: null });
          },
          // fetchAllPaginated's terminal call (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6
          // batch 9: runIdleQfHintCore now paginates both reads) — resolve the same {data, error}
          // the implicit-await path below produces; both fixtures are single short pages.
          // Mirrors real PostgREST: strip verified_at from returned rows when the resolved
          // select column list didn't ask for it, so a test can prove the probe's outcome
          // actually changed what the main query returns (not just that it ran without crashing).
          range() {
            if (table === 'claude_sessions') return Promise.resolve({ data: sessions, error: null });
            if (table === 'quick_fixes') return Promise.resolve({ data: qfsForSelect(qfs, selectedCols), error: null });
            return Promise.resolve({ data: [], error: null });
          },
          then(resolve) {
            if (table === 'claude_sessions') return resolve({ data: sessions, error: null });
            if (table === 'quick_fixes') return resolve({ data: qfsForSelect(qfs, selectedCols), error: null });
            resolve({ data: [], error: null });
          },
        };
      },
    };
  }

  it('hints one idle worker with one eligible QF (dry-run counts, no insert)', async () => {
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf()],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(1);
    expect(summary.hinted).toBe(1);
  });

  it('the near-miss QF is never hinted even as the only open QF, idle worker present', async () => {
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf({ id: 'QF-20260719-281', title: 'Apply 5 committed-but-unapplied migrations (CHAIRMAN-GATED DDL)' })],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(1);
    expect(summary.hinted).toBe(0);
    expect(summary.skippedGated).toBe(1);
  });

  // SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-6): heldSkipped is a NAMED SUBSET of skippedGated,
  // reported even when a batch hold fences 100% of open QFs (ranked.length === 0).
  it('a batch-held oracle_read_pending QF is reported via heldSkipped, not just the generic skippedGated total', async () => {
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf({ id: 'QF-20260901-001', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=2026-09-01T00:00:00Z :: awaiting Solomon' })],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.hinted).toBe(0);
    expect(summary.skippedGated).toBe(1);
    expect(summary.heldSkipped).toBe(1);
  });

  it('a genuine chairman-gated QF (not this SD\'s oracle marker) does not inflate heldSkipped', async () => {
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf({ owner: 'chairman', release_condition: 'EU-send-planned' })],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.skippedGated).toBe(1);
    expect(summary.heldSkipped).toBe(0);
  });

  it('no idle workers -> zero hints, short-circuits before the QF query', async () => {
    const sb = makeFakeSupabase({ sessions: [], qfs: [qf()] });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(0);
    expect(summary.hinted).toBe(0);
  });

  // QF-20260830-885 end-to-end: the Hotel-3 specimen reproduced through the full core, not just
  // the pure predicate — a worker whose sd_key mirror still names a completed item, but who
  // holds zero rows on the authoritative strategic_directives_v2 table, must read idle and be
  // hinted like any other free seat.
  it('a completed worker whose sd_key mirror is stale still counts idle and gets hinted', async () => {
    const staleMirrorWorker = worker({ session_id: 'hotel-3', sd_key: 'SD-COMPLETED-001' });
    const sb = makeFakeSupabase({ sessions: [staleMirrorWorker], qfs: [qf()], sdHolders: [] });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(1);
    expect(summary.hinted).toBe(1);
  });

  it('[TWO-SIDED] a worker genuinely holding the SD on the authoritative table stays excluded', async () => {
    const liveHolder = worker({ session_id: 'hotel-3', sd_key: 'SD-LIVE-001' });
    const sb = makeFakeSupabase({
      sessions: [liveHolder], qfs: [qf()],
      sdHolders: [{ claiming_session_id: 'hotel-3' }],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(0);
    expect(summary.hinted).toBe(0);
  });

  // SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 FR-6: this was the third reader of
  // isAutoStartableQF (after qf-auto-start.cjs's other 2 known call sites) missing verified_at
  // from its column list, found post-review -- the pre-flight probe fix must actually change
  // what reaches isAutoStartableQF, not merely avoid crashing.
  describe('FR-6: verified_at pre-flight probe (staged, not-yet-applied column)', () => {
    const oldCreatedAt = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10d old, past the 3d fence
    const recentVerifiedAt = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h ago

    it('verified_at selectable: a stale-by-created_at QF re-verified recently is hinted (clock reset)', async () => {
      const sb = makeFakeSupabase({
        sessions: [worker()],
        qfs: [qf({ created_at: oldCreatedAt, verified_at: recentVerifiedAt })],
        verifiedAtMissing: false,
      });
      const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
      expect(summary.hinted).toBe(1);
    });

    it('verified_at NOT selectable (migration unapplied): same QF stays excluded via created_at alone, no crash, no zeroed-out candidate set', async () => {
      const sb = makeFakeSupabase({
        sessions: [worker()],
        qfs: [qf({ created_at: oldCreatedAt, verified_at: recentVerifiedAt })],
        verifiedAtMissing: true,
      });
      const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
      expect(summary.idleWorkers).toBe(1); // proves qfs/sessions still loaded -- not a blanket fail-open to []
      expect(summary.hinted).toBe(0); // created_at alone is still 10d stale -> correctly excluded
    });

    it('verified_at NOT selectable: an unrelated fresh QF in the same run is still hinted normally', async () => {
      const sb = makeFakeSupabase({
        sessions: [worker()],
        qfs: [qf({ created_at: oldCreatedAt, verified_at: recentVerifiedAt }), qf({ id: 'QF-20260720-002' })],
        verifiedAtMissing: true,
      });
      const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
      expect(summary.hinted).toBe(1); // the fresh routine QF, not the stale one
    });
  });

  // QF-20260821-032: a stale-but-otherwise-eligible QF is not hinted (staleness still gates
  // delivery), but must be visible on summary.claimableWithVerify — distinct from skippedGated,
  // which also counts rows excluded for reasons that are NOT "just needs a verify".
  it('a stale-but-otherwise-eligible QF is not hinted, but is counted in summary.claimableWithVerify', async () => {
    const oldCreatedAt = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10d old, past the 3d fence
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf({ created_at: oldCreatedAt })],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.hinted).toBe(0);
    expect(summary.claimableWithVerify).toBe(1);
  });

  it('the near-miss (governance-gated) QF is NOT counted in claimableWithVerify, even though it is also skippedGated', async () => {
    const sb = makeFakeSupabase({
      sessions: [worker()],
      qfs: [qf({ id: 'QF-20260719-281', title: 'Apply 5 committed-but-unapplied migrations (CHAIRMAN-GATED DDL)' })],
    });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.skippedGated).toBe(1);
    expect(summary.claimableWithVerify).toBe(0);
  });
});
