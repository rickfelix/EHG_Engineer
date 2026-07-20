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

describe('runIdleQfHintCore — end-to-end decision (dry-run seam, no live insert)', () => {
  function makeFakeSupabase({ sessions, qfs }) {
    return {
      from(table) {
        return {
          select() { return this; },
          eq() { return this; },
          is() { return this; },
          order() { return this; },
          // fetchAllPaginated's terminal call (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6
          // batch 9: runIdleQfHintCore now paginates both reads) — resolve the same {data, error}
          // the implicit-await path below produces; both fixtures are single short pages.
          range() {
            if (table === 'claude_sessions') return Promise.resolve({ data: sessions, error: null });
            if (table === 'quick_fixes') return Promise.resolve({ data: qfs, error: null });
            return Promise.resolve({ data: [], error: null });
          },
          then(resolve) {
            if (table === 'claude_sessions') return resolve({ data: sessions, error: null });
            if (table === 'quick_fixes') return resolve({ data: qfs, error: null });
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

  it('no idle workers -> zero hints, short-circuits before the QF query', async () => {
    const sb = makeFakeSupabase({ sessions: [], qfs: [qf()] });
    const summary = await runIdleQfHintCore(sb, { nowMs: NOW, dryRun: true });
    expect(summary.idleWorkers).toBe(0);
    expect(summary.hinted).toBe(0);
  });
});
