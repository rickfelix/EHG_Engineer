/**
 * REAL, DB-backed regression tests for lib/eva/post-build-verdict-engine.js.
 *
 * SD: SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B
 *
 * Proves, against the LIVE post_build_verdicts constraint, exactly the property
 * Child A's own retrospective flagged as a required-before-EXEC check: the
 * verdict-table grain (one row per venture_id+artifact_type+claim_ref) survives
 * a repeated write via a real UPSERT, never colliding — directly applying the
 * lesson from Child A's adversarially-caught idx_unique_current_artifact bug.
 *
 * Also proves the is_current=true completeness filter (TR-3) against a real
 * stale-duplicate scenario, and a full artifact-walk run against the real
 * MarketLens venture (retrodiction smoke check — the full pre/post-recovery
 * proof is Child D's job, this is an early sanity confirmation).
 *
 * Uses real Supabase service-role connection (requires .env). Skipped if no
 * real DB. Creates a disposable venture; all rows cleaned up in afterAll.
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { describeDb } from '../../helpers/db-available.js';
import {
  upsertVerdict,
  checkCompleteness,
  runArtifactWalk,
  resolveVentureRepoPath,
} from '../../../lib/eva/post-build-verdict-engine.js';
import { recordDeviation } from '../../../lib/eva/deviation-ledger.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MARKETLENS_VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
const ts = Date.now();
let ventureId;

describeDb('post-build-verdict-engine (real DB)', () => {
  beforeAll(async () => {
    const { data, error } = await supabase
      .from('ventures')
      .insert({
        name: `__e2e_verdict_engine_${ts}__`,
        problem_statement: 'Disposable venture for SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-B real-DB grain test',
        current_lifecycle_stage: 19,
        is_demo: true,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to create venture: ${error.message}`);
    ventureId = data.id;
  });

  afterAll(async () => {
    if (!ventureId) return;
    await supabase.from('post_build_verdicts').delete().eq('venture_id', ventureId);
    await supabase.from('venture_artifacts').delete().eq('venture_id', ventureId);
    await supabase.from('ventures').delete().eq('id', ventureId);
  });

  it('a SECOND upsertVerdict() for the SAME key updates in place — no collision (TS-5)', async () => {
    const opts = { ventureId, artifactType: 'blueprint_user_story_pack', claimRef: 'blueprint_user_story_pack:regression-claim', disposition: 'MISSING' };
    const id1 = await upsertVerdict(supabase, opts);
    const id2 = await upsertVerdict(supabase, { ...opts, disposition: 'BUILT', evidenceRefs: [{ path: 'src/x.js', line: 1 }] });
    expect(id1).toBe(id2); // same row, updated in place

    const { data } = await supabase.from('post_build_verdicts').select('disposition, evidence_refs').eq('id', id1).single();
    expect(data.disposition).toBe('BUILT');
    expect(data.evidence_refs).toEqual([{ path: 'src/x.js', line: 1 }]);
  });

  it('a stale is_current=false row does NOT satisfy completeness (TS-6)', async () => {
    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: 14,
      artifact_type: 'blueprint_data_model',
      title: 'Stale non-current row',
      content: 'stale',
      is_current: false,
    });

    const { present } = await checkCompleteness(supabase, { ventureId, artifactType: 'blueprint_data_model' });
    expect(present).toBe(false);

    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: 14,
      artifact_type: 'blueprint_data_model',
      title: 'Current row',
      content: 'current',
      is_current: true,
    });

    const { present: presentAfter } = await checkCompleteness(supabase, { ventureId, artifactType: 'blueprint_data_model' });
    expect(presentAfter).toBe(true);
  });

  it('runArtifactWalk produces 100% coverage for a venture with zero artifacts (all MISSING)', async () => {
    const results = await runArtifactWalk(supabase, { ventureId, throughStage: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.disposition === 'MISSING' || r.artifactType === 'blueprint_data_model')).toBe(true);
  });

  it('claimRef disambiguates by index — two stories sharing a long identical prefix do not collide (adversarial-review fix)', async () => {
    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: 19,
      artifact_type: 'blueprint_user_story_pack',
      title: 'Prefix-collision story pack',
      is_current: true,
      artifact_data: {
        epics: [{
          name: 'Shared Prefix Epic',
          stories: [
            { as_a: 'user', i_want_to: 'do the exact same very long shared action prefix but then diverge into outcome A', so_that: 'A happens' },
            { as_a: 'user', i_want_to: 'do the exact same very long shared action prefix but then diverge into outcome B', so_that: 'B happens' },
          ],
        }],
      },
    });

    const results = await runArtifactWalk(supabase, { ventureId, throughStage: 19 });
    const storyResults = results.filter((r) => r.artifactType === 'blueprint_user_story_pack' && r.claimRef !== 'blueprint_user_story_pack');
    expect(storyResults.length).toBe(2);
    expect(new Set(storyResults.map((r) => r.claimRef)).size).toBe(2); // no collision on the upsert key

    const { data: rows } = await supabase
      .from('post_build_verdicts')
      .select('claim_ref')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'blueprint_user_story_pack');
    const distinctRefs = new Set((rows || []).map((r) => r.claim_ref));
    expect(distinctRefs.size).toBeGreaterThanOrEqual(2); // both persisted as separate rows, not overwritten
  });

  it('deviation_artifact_id points to the QUALIFYING record, not blindly the chronologically-first one (adversarial-review fix)', async () => {
    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: 14,
      artifact_type: 'blueprint_data_model',
      title: 'Deviation-attribution artifact',
      content: 'placeholder',
      is_current: true,
    });

    // Discover the real claimRef runArtifactWalk derives for this artifact-level claim.
    const firstPass = await runArtifactWalk(supabase, { ventureId, throughStage: 19 });
    const target = firstPass.find((r) => r.artifactType === 'blueprint_data_model');
    expect(target).toBeTruthy();
    const claimRef = target.claimRef;

    const thinId = await recordDeviation(supabase, { ventureId, artifactRef: claimRef, why: 'skip', weight: 'minor' });
    const substantiveId = await recordDeviation(supabase, {
      ventureId, artifactRef: claimRef,
      why: 'Deliberately deferred to Child D per chairman-ratified scope sequencing decision',
      weight: 'declared-descope',
    });

    await runArtifactWalk(supabase, { ventureId, throughStage: 19 });

    const { data: verdictRow } = await supabase
      .from('post_build_verdicts')
      .select('disposition, deviation_artifact_id')
      .eq('venture_id', ventureId)
      .eq('claim_ref', claimRef)
      .single();
    expect(verdictRow.disposition).toBe('DEVIATED_WITH_DOCUMENTED_REASON');
    expect(verdictRow.deviation_artifact_id).toBe(substantiveId);
    expect(verdictRow.deviation_artifact_id).not.toBe(thinId);
  });

  it('runArtifactWalk against the REAL MarketLens venture completes and returns dispositions for every required artifact (smoke check)', async () => {
    // This run necessarily WRITES real verdict rows via runArtifactWalk. post_build_verdicts
    // has zero consumers today, but Child C's scoring/convergence loop will read it as
    // authoritative input, so this test must never leave permanent side effects on the
    // flagship venture — snapshot the pre-test state and restore it in `finally`, even on
    // assertion failure or a mid-walk throw. (Adversarial /ship review CRITICAL finding,
    // PR #5555 — confirmed live: 47 stale rows had already accumulated from prior dev runs
    // before this fix, since the table was previously never restored.)
    const { data: snapshot, error: snapshotError } = await supabase
      .from('post_build_verdicts')
      .select('*')
      .eq('venture_id', MARKETLENS_VENTURE_ID);
    if (snapshotError) throw new Error(`Failed to snapshot MarketLens verdicts: ${snapshotError.message}`);

    try {
      const results = await runArtifactWalk(supabase, { ventureId: MARKETLENS_VENTURE_ID, throughStage: 19 });
      expect(results.length).toBeGreaterThan(0);
      const validDispositions = new Set(['BUILT', 'PARTIAL', 'MISSING', 'DEVIATED_WITH_DOCUMENTED_REASON', 'DEVIATED_UNDOCUMENTED']);
      for (const r of results) {
        expect(validDispositions.has(r.disposition), `unexpected disposition: ${r.disposition}`).toBe(true);
      }

      // The full pre/post-recovery retrodiction proof is Child D's job (it runs against
      // a pinned commit, not whatever happens to be checked out locally). This is only an
      // early sanity confirmation, and it is ENVIRONMENT-DEPENDENT: applications.local_path
      // points to a path on the machine that seeded it (e.g. this dev machine), which does
      // NOT exist on a CI runner. Only assert real-evidence-found when that local repo path
      // genuinely exists as a directory here and now -- otherwise every claim legitimately
      // resolves to no-evidence-found, which is correct behavior, not a defect.
      const repoPath = await resolveVentureRepoPath(supabase, { ventureId: MARKETLENS_VENTURE_ID });
      const repoAvailableLocally = Boolean(repoPath) && existsSync(repoPath) && statSync(repoPath).isDirectory();
      if (repoAvailableLocally) {
        const userStoryResults = results.filter((r) => r.artifactType === 'blueprint_user_story_pack');
        if (userStoryResults.length > 0) {
          const anyEvidenced = userStoryResults.some((r) => r.disposition === 'BUILT' || r.disposition === 'PARTIAL');
          expect(anyEvidenced).toBe(true);
        }
      }
    } finally {
      // Restore: delete whatever this run wrote, then re-insert the pre-test snapshot exactly
      // (including original id/created_at/updated_at) so MarketLens's real state is untouched.
      await supabase.from('post_build_verdicts').delete().eq('venture_id', MARKETLENS_VENTURE_ID);
      if (snapshot && snapshot.length > 0) {
        const { error: restoreError } = await supabase.from('post_build_verdicts').insert(snapshot);
        if (restoreError) {
          throw new Error(`CRITICAL: failed to restore MarketLens post_build_verdicts snapshot: ${restoreError.message}. Manual recovery required — snapshot: ${JSON.stringify(snapshot)}`);
        }
      }
    }
  }, 60000);
});
