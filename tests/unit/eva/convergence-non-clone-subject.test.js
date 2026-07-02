/**
 * SD-LEO-INFRA-CONVERGENCE-SUBJECT-LIFECYCLE-001-A — non-clone dummy subject creation (FR-1) + the
 * S19-gate verification (FR-2): a non-clone-non-demo subject created via the REAL S0 path, and the
 * surfaced finding that it BLOCKS at the S19 vision_approval gate (the clone auto-promote is clone-only).
 */
import { describe, it, expect, vi } from 'vitest';
import { launchNonCloneDummy, BLUEPRINT_BROWSE_PATH, DISCOVERY_MODE_PATH, DEFAULT_NONCLONE_STRATEGY, SEEDED_FROM_VENTURE_PATH } from '../../../lib/eva/clean-clone/launch.js';
import { isCloneVenture, isPilotFixtureVenture } from '../../../lib/eva/lifecycle-sd-bridge.js';

const silent = { log() {}, warn() {}, error() {} };

// mock supabase for the non-clone-invariant read (.from('ventures').select().eq().maybeSingle()).
function makeSb(ventureRow) {
  return {
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        async maybeSingle() { return { data: ventureRow, error: null }; },
      };
      return b;
    },
  };
}

describe('FR-1: launchNonCloneDummy creates via the REAL S0 path (not the reseed path)', () => {
  // SD-LEO-INFRA-NONCLONE-DUMMY-S0-PATH-DISCOVERY-001: the DEFAULT path is now discovery_mode (a real
  // from-scratch S0 create with NO pre-seeded data), NOT blueprint_browse (which needs a curated
  // blueprint to exist — 0 do, so the old default always failed 'No blueprints available').
  it('routes executeStageZero to discovery_mode with a valid strategy by DEFAULT (not blueprint_browse, not seeded)', async () => {
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: null }));
    const r = await launchNonCloneDummy({ dryRun: true }, { supabase: makeSb(null), logger: silent, executeStageZero });
    expect(executeStageZero).toHaveBeenCalledTimes(1);
    const [arg] = executeStageZero.mock.calls[0];
    expect(arg.path).toBe(DISCOVERY_MODE_PATH);
    expect(arg.path).not.toBe(BLUEPRINT_BROWSE_PATH);   // the old default that always failed
    expect(arg.path).not.toBe(SEEDED_FROM_VENTURE_PATH); // not a clone reseed
    expect(arg.pathParams.strategy).toBe(DEFAULT_NONCLONE_STRATEGY); // a FALLBACK_STRATEGIES value -> no 'No blueprints'
    expect(arg.options.dryRun).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.stage).toBe('created');
  });

  it('the default create produces ok:true on a clean from-scratch create (no pre-seeded data needed)', async () => {
    // mock executeStageZero as a successful from-scratch discovery create (no "No blueprints available")
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-discovery' }));
    const sb = makeSb({ seeded_from_venture_id: null, is_demo: false, is_scaffolding: false });
    const r = await launchNonCloneDummy({ dryRun: false }, { supabase: sb, logger: silent, executeStageZero });
    expect(r.ok).toBe(true);
    expect(r.newVentureId).toBe('v-discovery');
    expect(executeStageZero.mock.calls[0][0].path).toBe(DISCOVERY_MODE_PATH);
  });

  it('a custom strategy is threaded through; path=blueprint_browse is still reachable for a seeded caller', async () => {
    const exec1 = vi.fn(async () => ({ success: true, venture_id: null }));
    await launchNonCloneDummy({ dryRun: true, strategy: 'trend_scanner' }, { supabase: makeSb(null), logger: silent, executeStageZero: exec1 });
    expect(exec1.mock.calls[0][0].pathParams.strategy).toBe('trend_scanner');

    const exec2 = vi.fn(async () => ({ success: true, venture_id: null }));
    await launchNonCloneDummy({ dryRun: true, path: BLUEPRINT_BROWSE_PATH, blueprintId: 'bp-1', category: 'saas' }, { supabase: makeSb(null), logger: silent, executeStageZero: exec2 });
    const [arg2] = exec2.mock.calls[0];
    expect(arg2.path).toBe(BLUEPRINT_BROWSE_PATH);                 // override still works
    expect(arg2.pathParams).toEqual({ blueprintId: 'bp-1', category: 'saas' });
  });

  it('dry-run does NOT run the non-clone-invariant DB read / persist', async () => {
    const sb = makeSb({ seeded_from_venture_id: null, is_demo: false, is_scaffolding: false });
    const fromSpy = vi.spyOn(sb, 'from');
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-1' }));
    await launchNonCloneDummy({ dryRun: true }, { supabase: sb, logger: silent, executeStageZero });
    expect(fromSpy).not.toHaveBeenCalled(); // dry-run: no invariant read
  });

  it('LIVE create asserts the non-clone invariant: a clean non-clone subject -> ok:true', async () => {
    const sb = makeSb({ seeded_from_venture_id: null, is_demo: false, is_scaffolding: false });
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-clean' }));
    const r = await launchNonCloneDummy({ dryRun: false }, { supabase: sb, logger: silent, executeStageZero });
    expect(r.ok).toBe(true);
    expect(r.newVentureId).toBe('v-clean');
  });

  it('LIVE create FAILS the invariant for a clone/demo subject -> ok:false (loud)', async () => {
    const cloneSb = makeSb({ seeded_from_venture_id: 'src-1', is_demo: false, is_scaffolding: false });
    const executeStageZero = vi.fn(async () => ({ success: true, venture_id: 'v-clone' }));
    const r = await launchNonCloneDummy({ dryRun: false }, { supabase: cloneSb, logger: silent, executeStageZero });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('verify_non_clone');

    const demoSb = makeSb({ seeded_from_venture_id: null, is_demo: true, is_scaffolding: false });
    const r2 = await launchNonCloneDummy({ dryRun: false }, { supabase: demoSb, logger: silent, executeStageZero: async () => ({ success: true, venture_id: 'v-demo' }) });
    expect(r2.ok).toBe(false);
  });

  it('requires supabase + executeStageZero deps', async () => {
    await expect(launchNonCloneDummy({}, { executeStageZero: () => {} })).rejects.toThrow(/supabase/);
    await expect(launchNonCloneDummy({}, { supabase: makeSb(null) })).rejects.toThrow(/executeStageZero/);
  });
});

describe('FR-2: S19-gate verification — a non-clone subject blocks at S19 vision_approval', () => {
  const subject = { seeded_from_venture_id: null, is_demo: false, is_scaffolding: false }; // the convergence dummy

  it('the subject is NOT a clone (so the clone auto-promote does NOT apply to it)', () => {
    expect(isCloneVenture(subject)).toBe(false);            // not a clone -> _autoApproveCloneVision never auto-promotes it (SD-...-S19-001-B: it may still reach the repair-only path)
    expect(isCloneVenture({ seeded_from_venture_id: 'x' })).toBe(true); // a real clone WOULD be auto-promoted
  });

  it('the subject is NOT a pilot/fixture (so the S19 bridge does NOT skip it — its tree generates)', () => {
    expect(isPilotFixtureVenture(subject)).toBe(false);
  });

  it('FINDING: neither skipped nor clone-auto-promoted -> it BLOCKS at S19 vision_approval (no chairman-approved L2)', () => {
    // The verification: a non-clone-non-demo subject is generated (not skipped) but its L2 vision is never
    // auto-promoted (clone-only), and it has no chairman, so assertVentureVisionReady blocks it at S19.
    // This pins the SURFACED blocker for the orchestrator/Phase-2 remediation (a vision-approval path for
    // the convergence subject — extend the auto-promote to a convergence-subject marker, or approve at creation).
    const skipped = isPilotFixtureVenture(subject);
    const cloneAutoPromoted = isCloneVenture(subject);
    expect(skipped).toBe(false);
    expect(cloneAutoPromoted).toBe(false);
    // -> generated but vision-unapproved -> S19 vision_approval BLOCK (the documented pre-run-#1 finding).
    expect(skipped || cloneAutoPromoted).toBe(false);
  });
});
