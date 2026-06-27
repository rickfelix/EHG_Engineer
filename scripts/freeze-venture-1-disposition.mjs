#!/usr/bin/env node
/**
 * Freeze venture-1 disposition — SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-C
 *
 * Records the DURABLE chairman decision that venture-1 ("Market Modeling SaaS",
 * 849cd2bd-cd6e-4a5e-870d-e21a47b71393) is dogfood-complete and FROZEN at
 * lifecycle stage 19, superseded by the fully-grounded clean clone as the real
 * build vehicle, and sets the durable freeze marker that the stage-execution
 * worker honors (lib/eva/stage-execution-worker.js isVentureFrozen / FR-3) so
 * the venture can never be accidentally advanced or unblocked past S19.
 *
 * IDEMPOTENT: safe to re-run. A second run does not create a duplicate
 * venture_disposition decision and leaves the freeze marker correct.
 *
 *   node scripts/freeze-venture-1-disposition.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const VENTURE_ID = '849cd2bd-cd6e-4a5e-870d-e21a47b71393';
const FROZEN_STAGE = 19;
const SUPERSEDED_BY = 'SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001';
const DISPOSITION_TYPE = 'venture_disposition';

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // ── FR-1: durable chairman disposition decision (idempotent) ──
  const { data: existing, error: exErr } = await supabase
    .from('chairman_decisions')
    .select('id, status')
    .eq('venture_id', VENTURE_ID)
    .eq('decision_type', DISPOSITION_TYPE)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(`disposition lookup failed: ${exErr.message}`);

  let decisionId = existing?.id || null;
  if (existing) {
    console.log(`✓ FR-1: venture_disposition decision already exists (${existing.id}, status=${existing.status}) — no duplicate created`);
  } else {
    const rationale =
      'Venture-1 (Market Modeling SaaS) is dogfood-complete and FROZEN at Stage 19. '
      + 'Its upstream S0-S15 predate the grounding fixes, so it advances no further; the '
      + 'fully-grounded clean clone (SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001) supersedes it as '
      + 'the real build vehicle. Recorded as a durable governance decision; the stage-execution '
      + 'worker is guarded (metadata.frozen) against accidental resume past S19.';
    const { data: created, error: insErr } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: VENTURE_ID,
        lifecycle_stage: FROZEN_STAGE,
        decision_type: DISPOSITION_TYPE,
        decision: 'sunset',
        status: 'approved',
        decided_by: 'chairman',
        blocking: false,
        rationale,
        summary: 'venture-1 dogfood-complete, frozen at S19; superseded by clean clone',
      })
      .select('id')
      .single();
    if (insErr) throw new Error(`disposition insert failed: ${insErr.message}`);
    decisionId = created.id;
    console.log(`✓ FR-1: recorded venture_disposition decision ${created.id} (decision=sunset, stage=19, status=approved)`);
  }

  // ── FR-2: durable freeze marker on venture-1 (additive merge, idempotent) ──
  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('id, name, metadata')
    .eq('id', VENTURE_ID)
    .single();
  if (vErr) throw new Error(`venture fetch failed: ${vErr.message}`);

  const prevMeta = venture.metadata || {};
  const mergedMeta = {
    ...prevMeta,
    frozen: true,
    frozen_reason: 'dogfood-complete; superseded by clean clone',
    frozen_at: prevMeta.frozen_at || new Date().toISOString(),
    frozen_at_stage: FROZEN_STAGE,
    disposition: 'dogfood_complete',
    superseded_by: SUPERSEDED_BY,
    disposition_decision_id: decisionId,
  };
  const { error: upErr } = await supabase
    .from('ventures')
    .update({ metadata: mergedMeta })
    .eq('id', VENTURE_ID);
  if (upErr) throw new Error(`freeze marker update failed: ${upErr.message}`);

  const preservedKeys = Object.keys(prevMeta).filter((k) => !['frozen', 'frozen_reason', 'frozen_at', 'frozen_at_stage', 'disposition', 'superseded_by', 'disposition_decision_id'].includes(k));
  console.log(`✓ FR-2: venture-1 (${venture.name}) metadata.frozen=true set (preserved ${preservedKeys.length} existing key(s): ${preservedKeys.join(', ') || 'none'})`);
  console.log('✅ venture-1 disposition complete — frozen at S19, accidental-resume guarded.');
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
