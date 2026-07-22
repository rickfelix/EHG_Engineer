/**
 * @wire-check-exempt: one-off GROUND-TRUTH live-run verifier for SD-0b
 *   (SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B). No permanent static import
 *   chain by design — run on demand from the CLI to prove the real emission path,
 *   then it stays as the anti-test-masking witness. scripts/verify/ is NOT in the
 *   wire-check EXCLUSION_PATTERNS, so this marker is required.
 *
 * ANTI-TEST-MASKING GROUND-TRUTH PROOF (FR-4). This does NOT mock the insert. It:
 *   1. Inserts a SAFE fixture venture (TEST- name → fixture-excluded; is_demo=true;
 *      launch_mode='simulated'; deployment_url/repo_url/workflow_started_at all null →
 *      build_kind MUST derive to 'simulated').
 *   2. Instantiates the REAL StageExecutionWorker and calls its REAL
 *      _createStageExecution(ventureId, stageNumber) — the actual code path that carries
 *      the tag (a partial invocation of the worker: the exact insert method, not a
 *      re-implemented insert, and not the full queue-driven poll loop).
 *   3. Reads the emitted stage_executions row back FROM THE DB and asserts
 *      metadata.build_kind === 'simulated'. Prints the actual row (ground truth).
 *   4. Exercises the EXIT path: finalizes the row via the REAL _finalizeStageExecution
 *      and re-asserts the tag survives (additive + idempotent).
 *   5. Flips a real-build signal (deployment_url) on the fixture and re-emits via the
 *      REAL insert to assert 'real' — demonstrating BOTH branches through live code.
 *   6. TEARS DOWN: deletes emitted stage_executions rows + the fixture venture (reusing
 *      the shared loud-teardown helper). Leaves the DB clean.
 *
 * NEVER touches the protected real ventures (Alt-Text / ApexNiche) — teardown deletes
 * ONLY by the explicitly captured fixture id, guarded against the protected id set.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { StageExecutionWorker } from '../../lib/eva/stage-execution-worker.js';
import { teardownFixtureVentures } from '../../tests/helpers/venture-fixture-teardown.mjs';

// Protected real ventures — NEVER delete / mutate these (Alt-Text, ApexNiche).
const PROTECTED_PREFIXES = ['50763b6a', '809ec7e7'];

const FIXTURE_NAME = 'TEST-build-kind-emission-fixture';
const STAGE_ENTRY = 5;
const STAGE_REAL = 6;

// Quiet logger so the worker's non-fatal warnings don't drown the ground-truth output.
const quietLogger = { log: () => {}, warn: (m) => console.error(`  [worker.warn] ${m}`), error: (m) => console.error(`  [worker.error] ${m}`) };

function assertNotProtected(id) {
  if (typeof id === 'string' && PROTECTED_PREFIXES.some((p) => id.startsWith(p))) {
    throw new Error(`REFUSING to touch protected venture ${id}`);
  }
}

async function deleteStageExecutions(supabase, ventureId) {
  assertNotProtected(ventureId);
  const { error } = await supabase.from('stage_executions').delete().eq('venture_id', ventureId);
  if (error) throw new Error(`stage_executions teardown failed: ${error.message}`);
}

/**
 * Teardown ONE fixture venture. Primary path: the shared LOUD helper
 * (tests/helpers/venture-fixture-teardown.mjs). RESILIENT fallback: that helper hard-
 * references FK child tables via a fixed list, and one of them (venture_analysis_artifacts)
 * is NOT present in this DB's PostgREST schema cache — the helper is designed to THROW on a
 * missing child table (so a real FK blocker can't hide). To honor the anti-leak invariant
 * regardless of that schema drift, on helper failure we fall back to a direct venture delete
 * (this minimal fixture has no FK children other than stage_executions, already deleted).
 */
async function teardownFixtureVenture(supabase, ventureId) {
  assertNotProtected(ventureId);
  try {
    await teardownFixtureVentures(supabase, [ventureId]);
  } catch (helperErr) {
    console.error(`  [teardown] shared helper failed (${helperErr.message}) — direct-delete fallback`);
    const { error } = await supabase.from('ventures').delete().eq('id', ventureId);
    if (error) throw new Error(`fallback venture delete failed: ${error.message}`);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  const supabase = createClient(url, key);

  let ventureId = null;
  let failed = false;

  try {
    // ── Pre-clean any leftover fixture from a prior failed run (by exact name only). ──
    const { data: leftovers } = await supabase.from('ventures').select('id').eq('name', FIXTURE_NAME);
    for (const v of leftovers ?? []) {
      assertNotProtected(v.id);
      await deleteStageExecutions(supabase, v.id);
      await teardownFixtureVenture(supabase, v.id);
    }

    // ── 1. Create the SAFE simulated fixture venture. ──
    const { data: created, error: insErr } = await supabase
      .from('ventures')
      .insert([{
        name: FIXTURE_NAME,
        description: 'SD-0b ground-truth build_kind emission fixture (auto-torn-down)',
        problem_statement: 'SD-0b fixture — verifies build_kind emission (auto-torn-down)',
        // 'paused' (a valid venture_status_enum) so no live worker poll loop can pick up
        // this short-lived fixture; _createStageExecution does not gate on venture status.
        status: 'paused',
        is_demo: true,
        launch_mode: 'simulated',
        deployment_url: null,
        repo_url: null,
        workflow_started_at: null,
        current_lifecycle_stage: STAGE_ENTRY,
      }])
      .select('id, name, launch_mode, deployment_url, repo_url, workflow_started_at')
      .single();
    if (insErr) throw new Error(`fixture venture insert failed: ${insErr.message}`);
    ventureId = created.id;
    assertNotProtected(ventureId);
    console.log(`\n[1] Created fixture venture ${ventureId} (${created.name}, launch_mode=${created.launch_mode}, all real-build signals null)`);

    // ── 2. Invoke the REAL worker insert path. ──
    const worker = new StageExecutionWorker({ supabase, logger: quietLogger });
    const execId = await worker._createStageExecution(ventureId, STAGE_ENTRY);
    if (!execId) throw new Error('REAL _createStageExecution returned null — insert did not land (cannot prove ground truth)');
    console.log(`[2] REAL worker._createStageExecution(${ventureId}, ${STAGE_ENTRY}) → stage_executions.id=${execId}`);

    // ── 3. Read the emitted row back from the DB and assert 'simulated'. ──
    const { data: row, error: readErr } = await supabase
      .from('stage_executions')
      .select('id, venture_id, lifecycle_stage, status, metadata')
      .eq('id', execId)
      .single();
    if (readErr) throw new Error(`read-back failed: ${readErr.message}`);
    console.log('[3] GROUND-TRUTH emitted row (read back from DB):');
    console.log(JSON.stringify(row, null, 2));
    if (row?.metadata?.build_kind !== 'simulated') {
      throw new Error(`ASSERTION FAILED: expected metadata.build_kind='simulated', got ${JSON.stringify(row?.metadata?.build_kind)}`);
    }
    console.log(`    ✅ ASSERT metadata.build_kind === 'simulated' (and operating_mode preserved: ${JSON.stringify(row.metadata.operating_mode)})`);

    // ── 4. EXIT path: finalize via the REAL method, tag must survive (additive/idempotent). ──
    await worker._finalizeStageExecution(execId, 'succeeded', null);
    const { data: finalized } = await supabase
      .from('stage_executions')
      .select('status, metadata')
      .eq('id', execId)
      .single();
    console.log(`[4] REAL worker._finalizeStageExecution → status=${finalized?.status}, metadata=${JSON.stringify(finalized?.metadata)}`);
    if (finalized?.metadata?.build_kind !== 'simulated') {
      throw new Error(`ASSERTION FAILED (exit): expected build_kind='simulated' after finalize, got ${JSON.stringify(finalized?.metadata?.build_kind)}`);
    }
    console.log(`    ✅ ASSERT build_kind survives finalize (additive + idempotent), operating_mode preserved: ${JSON.stringify(finalized.metadata.operating_mode)}`);

    // ── 5. Flip a real-build signal and re-emit → 'real' (both branches, live). ──
    const { error: updErr } = await supabase
      .from('ventures')
      .update({ deployment_url: 'https://fixture.example.app' })
      .eq('id', ventureId);
    if (updErr) throw new Error(`fixture deployment_url flip failed: ${updErr.message}`);
    const execId2 = await worker._createStageExecution(ventureId, STAGE_REAL);
    const { data: row2 } = await supabase
      .from('stage_executions')
      .select('id, metadata')
      .eq('id', execId2)
      .single();
    console.log(`[5] After deployment_url flip → REAL re-emit row: ${JSON.stringify(row2?.metadata)}`);
    if (row2?.metadata?.build_kind !== 'real') {
      throw new Error(`ASSERTION FAILED (real branch): expected build_kind='real', got ${JSON.stringify(row2?.metadata?.build_kind)}`);
    }
    console.log(`    ✅ ASSERT metadata.build_kind === 'real' on real-signal fixture`);

    console.log('\n✅ GROUND-TRUTH PROOF PASSED: real worker emitted metadata.build_kind for both simulated and real branches.\n');
  } catch (err) {
    failed = true;
    console.error(`\n❌ VERIFY FAILED: ${err.message}\n`);
  } finally {
    // ── 6. Teardown — delete emitted rows + fixture venture, by explicit id only. ──
    if (ventureId) {
      try {
        await deleteStageExecutions(supabase, ventureId);
        await teardownFixtureVenture(supabase, ventureId);
        console.log(`[6] Teardown complete: stage_executions + fixture venture ${ventureId} deleted. DB clean.`);
      } catch (teardownErr) {
        console.error(`⚠️  TEARDOWN FAILED (fixture may leak): ${teardownErr.message}`);
        failed = true;
      }
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
