// SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001 — the tier axis was silently inert on two live
// acquisition lanes (recoverStrandedFinal, adoptOrphanInProgress): both called
// classifyDispatchIneligibility(sd, {cwd}) with no worker_tier_rank/tiering_active, so a tier-2
// seat could recover/adopt a tier-4 SD. Confirmed LIVE via traced call chain (both reachable
// through CHECKIN_HELPERS + the lib/checkin/steps/*.cjs pipeline), unlike the originally-named
// selfClaimDraftSd, which is confirmed dead code and removed by this SD.
//
// THE FIX REUSES lib/fleet/tier-claimable.cjs tierBlocks() rather than hand-threading raw
// {worker_tier_rank, tiering_active} into classifyDispatchIneligibility: tierBlocks already
// honors a scored SD's explicit min_tier_rank floor even when GLOBAL tiering is off (the
// precedent SD-LEO-INFRA-BELT-CLAIMABLE-ACCURACY-FLOOR-001 established), which a raw ctx spread
// would not provide (classifyDispatchIneligibility's tierAxes short-circuits to null the instant
// ctx.tiering_active !== true, with no scored/unscored distinction at that gate).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require_ = createRequire(import.meta.url);
const checkin = require_('../../../scripts/worker-checkin.cjs');
const { recoverStrandedFinal, adoptOrphanInProgress } = checkin;
const { tierBlocks } = require_('../../../lib/fleet/tier-claimable.cjs');

const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString();

/** Same permissive chainable-stub shape as tests/unit/checkin/resume-final-reads-holds.test.js —
 * only the rows returned for strategic_directives_v2 and whether a claim reaches claim_sd are
 * pinned; every other table/query defaults to an empty, non-blocking result. */
function fakeSb({ rows = [], claimed = [] }) {
  const payloads = { strategic_directives_v2: rows };
  const make = (table) => {
    const b = {
      select: () => b, eq: () => b, is: () => b, lt: () => b, gt: () => b,
      order: () => b, limit: () => b, in: () => b, neq: () => b, not: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      update: () => b, insert: () => b, upsert: () => b,
      then: (res) => res({ data: payloads[table] ?? [], error: null }),
    };
    return b;
  };
  return {
    from: (t) => make(t),
    rpc: async (fn, args) => {
      if (fn === 'claim_sd') { claimed.push(args.p_sd_id); return { data: { success: true }, error: null }; }
      return { data: null, error: null };
    },
  };
}

const strandedRow = (sd_key, minTierRank) => ({
  sd_key, status: 'pending_approval', current_phase: 'LEAD_FINAL',
  updated_at: OLD, metadata: minTierRank == null ? null : { min_tier_rank: minTierRank },
  sd_type: 'infrastructure', target_application: 'EHG_Engineer', parent_sd_id: null,
});

const orphanRow = (sd_key, minTierRank) => ({
  sd_key, sd_type: 'infrastructure', status: 'draft', current_phase: 'LEAD',
  metadata: minTierRank == null ? null : { min_tier_rank: minTierRank },
  updated_at: OLD, target_application: 'EHG_Engineer', parent_sd_id: null,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('TS-1/TS-2 — a below-rung seat is refused a tier-restricted stranded/orphaned SD (tiering active)', () => {
  it('recoverStrandedFinal skips a tier-4 SD for a tier-2 seat', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-TIER4-001', 4)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: 2, tiering_active: true });
    expect(claimed).not.toContain('SD-TIER4-001');
    expect(r?.action).not.toBe('resume_final');
  });

  it('adoptOrphanInProgress skips a tier-4 SD for a tier-2 seat', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [orphanRow('SD-TIER4-002', 4)], claimed });
    const r = await adoptOrphanInProgress(sb, 'sess-1', {}, { worker_tier_rank: 2, tiering_active: true });
    expect(claimed).not.toContain('SD-TIER4-002');
    expect(r?.action).not.toBe('resume_orphan');
  });
});

describe('TS-3a — an UNSCORED SD stays reachable regardless of tiering state', () => {
  it('recoverStrandedFinal recovers an unscored SD for a low-rung seat, tiering active', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-UNSCORED-001', null)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: 1, tiering_active: true });
    expect(r?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-UNSCORED-001']);
  });

  it('adoptOrphanInProgress adopts an unscored SD for a low-rung seat, tiering active', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [orphanRow('SD-UNSCORED-002', null)], claimed });
    const r = await adoptOrphanInProgress(sb, 'sess-1', {}, { worker_tier_rank: 1, tiering_active: true });
    expect(r?.action).toBe('resume_orphan');
    expect(claimed).toEqual(['SD-UNSCORED-002']);
  });
});

describe('TS-3b — a SCORED SD\'s explicit floor is honored even when GLOBAL tiering is OFF', () => {
  // This is the precedent SD-LEO-INFRA-BELT-CLAIMABLE-ACCURACY-FLOOR-001 established for the belt
  // gauge and the exact reason FR-2 reuses tierBlocks() instead of a raw ctx spread: a naive
  // {worker_tier_rank, tiering_active} spread into classifyDispatchIneligibility would NOT block
  // here, because tierAxes short-circuits to null the instant tiering_active !== true.
  it('recoverStrandedFinal still refuses a tier-4 SD for a tier-2 seat when tiering_active=false', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-FLOOR-001', 4)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: 2, tiering_active: false });
    expect(claimed).not.toContain('SD-FLOOR-001');
    expect(r?.action).not.toBe('resume_final');
  });

  it('adoptOrphanInProgress still refuses a tier-4 SD for a tier-2 seat when tiering_active=false', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [orphanRow('SD-FLOOR-002', 4)], claimed });
    const r = await adoptOrphanInProgress(sb, 'sess-1', {}, { worker_tier_rank: 2, tiering_active: false });
    expect(claimed).not.toContain('SD-FLOOR-002');
    expect(r?.action).not.toBe('resume_orphan');
  });
});

describe('TS-4 — a SCORED SD is refused when tierCtx.worker_tier_rank is missing (fail-closed, no new axis)', () => {
  it('recoverStrandedFinal refuses a scored SD when tierCtx carries no worker_tier_rank at all', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-NOSTAMP-001', 4)], claimed });
    // Simulates a tier-context producer failure: ctx.tierCtx = {} (no worker_tier_rank key).
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, {});
    expect(claimed).not.toContain('SD-NOSTAMP-001');
    expect(r?.action).not.toBe('resume_final');
  });

  it('adoptOrphanInProgress refuses a scored SD when tierCtx carries no worker_tier_rank at all', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [orphanRow('SD-NOSTAMP-002', 4)], claimed });
    const r = await adoptOrphanInProgress(sb, 'sess-1', {}, {});
    expect(claimed).not.toContain('SD-NOSTAMP-002');
    expect(r?.action).not.toBe('resume_orphan');
  });

  it('but an UNSCORED SD is unaffected by a missing tierCtx (matches TS-3a)', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-NOSTAMP-003', null)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, {});
    expect(r?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-NOSTAMP-003']);
  });
});

describe('TS-6 — structural guard against the identified inflight_git_state regression', () => {
  // The risk this discriminates: a naive fix would spread merged-pool-self-claim.cjs's FULL
  // 8-field tierCtx (which includes inflight_git_state) into recoverStrandedFinal, which would
  // incorrectly refuse recovering a LEAD_FINAL SD whose PR is already merged -- the exact
  // population that lane exists to recover. Source-pinned rather than scenario-simulated: the
  // actual fix (tierBlocks(sd, workerTierRank, tieringActive), a 3-arg call) structurally cannot
  // read inflight_git_state at all, so this proves the regression is impossible by construction,
  // not merely untriggered by one test's fixture data.
  it('the tierBlocks call site in worker-checkin.cjs never references inflight_git_state', () => {
    const src = readFileSync(new URL('../../../scripts/worker-checkin.cjs', import.meta.url), 'utf8');
    const tierBlocksCallSites = src.match(/tierBlocks\([^)]*\)/g) || [];
    expect(tierBlocksCallSites.length).toBeGreaterThanOrEqual(2); // recoverStrandedFinal + adoptOrphanInProgress
    for (const call of tierBlocksCallSites) {
      expect(call).not.toMatch(/inflight_git_state/);
    }
  });
});

describe('TS-6/TS-9 — negative control: an eligible seat is NOT over-blocked by the tier check', () => {
  it('recoverStrandedFinal still recovers a tier-eligible stranded SD (regression guard)', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-ELIGIBLE-001', 2)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: 3, tiering_active: true });
    expect(r?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-ELIGIBLE-001']);
  });

  it('adoptOrphanInProgress still adopts a tier-eligible orphan for a higher-rung seat', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [orphanRow('SD-ELIGIBLE-002', 2)], claimed });
    const r = await adoptOrphanInProgress(sb, 'sess-1', {}, { worker_tier_rank: 3, tiering_active: true });
    expect(r?.action).toBe('resume_orphan');
    expect(claimed).toEqual(['SD-ELIGIBLE-002']);
  });

  it('a seat AT its own rung claims unconditionally (minRank === workerRank falls through)', async () => {
    const claimed = [];
    const sb = fakeSb({ rows: [strandedRow('SD-ATRUNG-001', 2)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: 2, tiering_active: true });
    expect(r?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-ATRUNG-001']);
  });
});

describe('recoverStrandedFinal/adoptOrphanInProgress reuse tierBlocks exactly — no re-derived logic', () => {
  // Cross-checks the two lanes against the SAME shared helper with a spread of inputs, so a
  // future edit that reimplements the comparison inline (instead of calling tierBlocks) is caught
  // even if it happens to get one specific case right.
  const cases = [
    { worker: 1, min: 4, tiering: true, blocked: true },
    { worker: 4, min: 4, tiering: true, blocked: false },
    { worker: 5, min: 4, tiering: true, blocked: false },
    { worker: 1, min: 4, tiering: false, blocked: true }, // floor honored off
    { worker: 4, min: null, tiering: true, blocked: false }, // unscored
    { worker: undefined, min: 4, tiering: true, blocked: true }, // missing stamp, scored
  ];
  for (const c of cases) {
    it(`tierBlocks(worker=${c.worker}, min=${c.min}, tiering=${c.tiering}) => blocked=${c.blocked}`, async () => {
      const sd = strandedRow('SD-MATRIX', c.min);
      expect(tierBlocks(sd, c.worker, c.tiering)).toBe(c.blocked);
      const claimed = [];
      const sb = fakeSb({ rows: [sd], claimed });
      await recoverStrandedFinal(sb, 'sess-1', {}, { worker_tier_rank: c.worker, tiering_active: c.tiering });
      expect(claimed.includes('SD-MATRIX')).toBe(!c.blocked);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// TS-8 — THE WIRE, NOT JUST THE ENDS. Everything above calls recoverStrandedFinal/
// adoptOrphanInProgress directly with a hand-built tierCtx object. That proves the FUNCTIONS are
// correct but nothing above proves ctx.tierCtx, as computed by the REAL tier-context.cjs step and
// read by the REAL recover-stranded-final.cjs/adopt-orphan.cjs step wrappers, actually reaches
// them through the real pipeline. Drives the REAL runSteps + REAL step modules; only
// resolveWorkerTierRank/isTieringActive are faked (to control the input precisely without
// replicating isTieringActive's live-fleet-counting DB query).
describe('TS-8 — the hoisted tier-context step wires ctx.tierCtx into the real pipeline', () => {
  const { runSteps } = require_('../../../lib/checkin/pipeline.cjs');
  const tierContextStep = require_('../../../lib/checkin/steps/tier-context.cjs');
  const recoverStep = require_('../../../lib/checkin/steps/recover-stranded-final.cjs');
  const adoptStep = require_('../../../lib/checkin/steps/adopt-orphan.cjs');

  async function runLadder(rows, { workerTierRank, tieringActive }) {
    const claimed = [];
    const resolveWorkerTierRank = vi.fn(() => workerTierRank);
    const isTieringActive = vi.fn(async () => tieringActive);
    const ctx = {
      sb: fakeSb({ rows, claimed }),
      sessionId: 'sess-1',
      base: {},
      sessionMetadata: {},
      helpers: { recoverStrandedFinal, adoptOrphanInProgress, resolveWorkerTierRank, isTieringActive },
    };
    const steps = [tierContextStep, recoverStep, adoptStep];
    const resolution = await runSteps(steps, ctx);
    return { claimed, resolution, tierCtx: ctx.tierCtx, resolveWorkerTierRank, isTieringActive };
  }

  it('ctx.tierCtx is populated before recover-stranded-final runs, and BLOCKS a tier-4 row for a tier-2 seat', async () => {
    const { claimed, resolution, tierCtx, resolveWorkerTierRank, isTieringActive } = await runLadder(
      [strandedRow('SD-WIRE-001', 4)],
      { workerTierRank: 2, tieringActive: true },
    );
    expect(tierCtx).toEqual({ worker_tier_rank: 2, tiering_active: true });
    expect(claimed).not.toContain('SD-WIRE-001');
    expect(resolution?.action).not.toBe('resume_final');
    // FR-1 AC-3 (relocate, not duplicate): the hoisted producer is the ONLY caller across the
    // whole ladder run -- if recover-stranded-final or adopt-orphan resolved their own tier rank
    // independently, these counts would exceed 1.
    expect(resolveWorkerTierRank).toHaveBeenCalledTimes(1);
    expect(isTieringActive).toHaveBeenCalledTimes(1);
  });

  it('the SAME hoisted ctx.tierCtx also reaches adopt-orphan (step 9) for a tier-4 orphan', async () => {
    const { claimed, resolution } = await runLadder(
      [orphanRow('SD-WIRE-002', 4)],
      { workerTierRank: 2, tieringActive: true },
    );
    expect(claimed).not.toContain('SD-WIRE-002');
    expect(resolution?.action).not.toBe('resume_orphan');
  });

  it('a tier-eligible seat still reaches a real claim through the full wired ladder', async () => {
    const { claimed, resolution } = await runLadder(
      [strandedRow('SD-WIRE-003', 2)],
      { workerTierRank: 3, tieringActive: true },
    );
    expect(resolution?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-WIRE-003']);
  });

  it('a hoisted-producer failure (fail-open ctx.tierCtx={}) still fails CLOSED on a scored SD via tierBlocks', async () => {
    const claimed = [];
    const ctx = {
      sb: fakeSb({ rows: [strandedRow('SD-WIRE-004', 4)], claimed }),
      sessionId: 'sess-1',
      base: {},
      sessionMetadata: {},
      helpers: {
        recoverStrandedFinal,
        resolveWorkerTierRank: () => { throw new Error('producer boom'); },
        isTieringActive: async () => true,
      },
    };
    const resolution = await runSteps([tierContextStep, recoverStep], ctx);
    expect(ctx.tierCtx).toEqual({}); // the hoisted step's own fail-open contract
    // The behavioral claim in this test's title: the empty tierCtx must not read as "unrestricted" --
    // tierBlocks(sd, undefined, undefined) still blocks a SCORED SD via tier_stamp_missing.
    expect(claimed).not.toContain('SD-WIRE-004');
    expect(resolution?.action).not.toBe('resume_final');
  });

  it('an unscored SD is UNAFFECTED by the same hoisted-producer failure (two-sided control)', async () => {
    const claimed = [];
    const ctx = {
      sb: fakeSb({ rows: [strandedRow('SD-WIRE-005', null)], claimed }),
      sessionId: 'sess-1',
      base: {},
      sessionMetadata: {},
      helpers: {
        recoverStrandedFinal,
        resolveWorkerTierRank: () => { throw new Error('producer boom'); },
        isTieringActive: async () => true,
      },
    };
    const resolution = await runSteps([tierContextStep, recoverStep], ctx);
    expect(resolution?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-WIRE-005']);
  });

  // TR-2 (relocate, not duplicate): source-pinned, so a future edit that reintroduces a direct
  // resolveWorkerTierRank/isTieringActive call inside merged-pool-self-claim.cjs -- instead of
  // reading the hoisted ctx.tierCtx -- is caught even before any call-count spy would notice.
  it('merged-pool-self-claim.cjs no longer calls resolveWorkerTierRank/isTieringActive directly', () => {
    const src = readFileSync(new URL('../../../lib/checkin/steps/merged-pool-self-claim.cjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/resolveWorkerTierRank\(/);
    expect(src).not.toMatch(/isTieringActive\(/);
    expect(src).toMatch(/ctx\.tierCtx && ctx\.tierCtx\.worker_tier_rank/);
    expect(src).toMatch(/ctx\.tierCtx && ctx\.tierCtx\.tiering_active/);
  });
});
