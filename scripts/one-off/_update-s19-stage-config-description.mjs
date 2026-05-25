/**
 * SD-LEO-FEAT-FINALIZE-CLAUDE-CODE-001 / FR-2 — Build-model honesty (DB content).
 *
 * Idempotent UPDATE of the lifecycle_stage_config stage-19 row DESCRIPTION to the honest
 * post-cost-pivot framing ("Claude Code builds from the seeded repo; Replit hosts").
 *
 * CRITICAL: This touches the `description` ONLY. metadata.build_method ('replit_agent') is
 * BEHAVIORAL — the worker (stage-execution-worker.js) branches on it to skip per-venture SD
 * creation and to require the registered repo/deployment URL. It is intentionally LEFT UNCHANGED.
 *
 * Captures the prior description (printed for rollback) and verifies build_method is unchanged.
 * Re-runnable: a second run is a no-op (description already canonical).
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

const NEW_DESCRIPTION =
  'Build the venture MVP. Lovable conduits the Stitch landing page to GitHub; Claude Code builds ' +
  'the remaining features from the Claude-Code-ready seeded repo (CLAUDE.md + docs/build-tasks.md); ' +
  'Replit hosts the running app. The S20 Code Quality Gate validates the built repo.';

const sb = createSupabaseServiceClient();

const { data: before, error: readErr } = await sb
  .from('lifecycle_stage_config')
  .select('stage_number, description, metadata')
  .eq('stage_number', 19)
  .single();

if (readErr) {
  console.error(JSON.stringify({ step: 'read', error: readErr.message }));
  process.exit(1);
}

const priorBuildMethod = before?.metadata?.build_method ?? null;
console.log(JSON.stringify({
  step: 'before',
  prior_description: before.description,
  build_method: priorBuildMethod,
}, null, 2));

if (before.description === NEW_DESCRIPTION) {
  console.log(JSON.stringify({ step: 'noop', message: 'description already canonical' }));
  process.exit(0);
}

const { error: updErr } = await sb
  .from('lifecycle_stage_config')
  .update({ description: NEW_DESCRIPTION })
  .eq('stage_number', 19);

if (updErr) {
  console.error(JSON.stringify({ step: 'update', error: updErr.message }));
  process.exit(1);
}

const { data: after, error: verifyErr } = await sb
  .from('lifecycle_stage_config')
  .select('description, metadata')
  .eq('stage_number', 19)
  .single();

if (verifyErr) {
  console.error(JSON.stringify({ step: 'verify', error: verifyErr.message }));
  process.exit(1);
}

const afterBuildMethod = after?.metadata?.build_method ?? null;
const ok = after.description === NEW_DESCRIPTION && afterBuildMethod === priorBuildMethod;
console.log(JSON.stringify({
  step: 'after',
  description: after.description,
  build_method: afterBuildMethod,
  build_method_unchanged: afterBuildMethod === priorBuildMethod,
  verified: ok,
}, null, 2));
process.exit(ok ? 0 : 1);
