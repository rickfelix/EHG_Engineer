/**
 * reconciliation-packet-apply — freeze-then-ratify apply path (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 FR-4)
 *
 * Consumes a packet produced by reconciliation-packet-generator.mjs and, for each venture, ratifies
 * a one-stage advance (frozen_stage -> frozen_stage+1) via the canonical advance_venture_stage RPC --
 * NEVER a raw write. Reuses advance_venture_stage's own p_from_stage check as the optimistic-lock CAS:
 * ventures has no separate version column, so CAS is directly on current_lifecycle_stage.
 *
 * THREE distinct outcomes per venture (not two -- outcome 3 must not be folded into outcome 2):
 *   1. clean_apply             -- current_lifecycle_stage still equals the packet's frozen value AND
 *                                  the RPC succeeds.
 *   2. stage_diverged_requeue  -- current_lifecycle_stage no longer equals the packet's frozen value
 *                                  (the venture advanced/changed legitimately mid-window).
 *   3. content_gate_refusal    -- the stage value still matches, but the RPC's own internal checks
 *                                  (artifact-completeness precondition, or an unresolved chairman
 *                                  gate) refuse the apply. A content/governance problem, not a timing
 *                                  problem -- the corrective action differs from outcome 2.
 *
 * Usage:
 *   node scripts/reconciliation-packet-apply.mjs <packet.json> [--requeue-out <path>] [--json]
 *
 * Exit Codes:
 *   0  Ran to completion (individual venture outcomes are reported, not a process failure)
 *   1  Usage/env/packet-read error
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { isMainModule } from '../lib/utils/is-main-module.js';

export const OUTCOME = Object.freeze({
  CLEAN_APPLY: 'clean_apply',
  STAGE_DIVERGED_REQUEUE: 'stage_diverged_requeue',
  CONTENT_GATE_REFUSAL: 'content_gate_refusal',
});

// A refusal from advance_venture_stage that represents a KNOWN CONTENT/GOVERNANCE problem, not a
// timing problem. stage_mismatch is deliberately excluded here -- a stage_mismatch surfacing from
// the RPC itself (rather than our own pre-check below) is a late-detected divergence and belongs
// to outcome 2. Any error NOT in this set still lands in outcome 3 (FR-4 is exactly 3 outcomes,
// not 4), but is tagged `known: false` so an unrecognized refusal -- e.g. the canonical-writer
// choke's own SVCW1 firing because this script's registered self-stamp broke -- stays visible as
// a distinct, unexpected case rather than reading identically to an ordinary content-gate refusal.
const CONTENT_GATE_ERRORS = new Set(['artifact_precondition_unmet', 'gate_not_approved']);

/**
 * Classify a single venture's apply attempt into one of the three outcomes. Pure function --
 * `liveStage` and `rpcResult` are both supplied by the caller so this is testable without a DB.
 */
export function classifyOutcome({ frozenStage, liveStage, rpcResult }) {
  if (liveStage !== frozenStage) {
    return { outcome: OUTCOME.STAGE_DIVERGED_REQUEUE, detail: { frozenStage, liveStage } };
  }
  if (rpcResult?.success) {
    return { outcome: OUTCOME.CLEAN_APPLY, detail: rpcResult };
  }
  if (rpcResult?.error === 'stage_mismatch') {
    // Race: diverged between our pre-check read and the RPC's own FOR UPDATE read.
    return { outcome: OUTCOME.STAGE_DIVERGED_REQUEUE, detail: rpcResult };
  }
  return {
    outcome: OUTCOME.CONTENT_GATE_REFUSAL,
    detail: { ...rpcResult, known: CONTENT_GATE_ERRORS.has(rpcResult?.error) },
  };
}

export async function applyPacket(supabase, packet, { transitionType = 'reconciliation_ratify' } = {}) {
  const results = [];
  for (const v of packet.ventures) {
    const { data: live, error: readError } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', v.id)
      .maybeSingle();

    if (readError) {
      // A genuine transient read failure -- retryable next window, same class as a stage race.
      results.push({
        ventureId: v.id,
        outcome: OUTCOME.STAGE_DIVERGED_REQUEUE,
        detail: { reason: 'read_failed', error: readError.message },
      });
      continue;
    }
    if (!live) {
      // The venture record no longer exists. Requeuing this forever would retry indefinitely
      // against a row that will never reappear -- this is a content/governance problem (the
      // packet itself is stale), not a timing one, so it does not land in --requeue-out.
      results.push({
        ventureId: v.id,
        outcome: OUTCOME.CONTENT_GATE_REFUSAL,
        detail: { reason: 'venture_gone', known: false },
      });
      continue;
    }

    const liveStage = live.current_lifecycle_stage;
    const frozenStage = v.frozen_stage;

    if (liveStage !== frozenStage) {
      results.push({ ventureId: v.id, ...classifyOutcome({ frozenStage, liveStage, rpcResult: null }) });
      continue;
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('advance_venture_stage', {
      p_venture_id: v.id,
      p_from_stage: frozenStage,
      p_to_stage: frozenStage + 1,
      p_transition_type: transitionType,
    });

    if (rpcError) {
      // rpcError.code === 'SVCW1' here would mean the canonical-writer choke rejected THIS
      // script's own registered self-stamp -- an infrastructure misconfiguration, not an
      // ordinary content refusal. Tagged distinctly so it doesn't read as routine in the summary.
      results.push({
        ventureId: v.id,
        outcome: OUTCOME.CONTENT_GATE_REFUSAL,
        detail: { reason: 'rpc_error', error: rpcError.message, known: false, choke_rejection: rpcError.code === 'SVCW1' },
      });
      continue;
    }

    results.push({ ventureId: v.id, ...classifyOutcome({ frozenStage, liveStage, rpcResult }) });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const packetPath = args[0];
  if (!packetPath || packetPath.startsWith('--')) {
    console.error('Usage: node scripts/reconciliation-packet-apply.mjs <packet.json> [--requeue-out <path>] [--json]');
    process.exit(1);
  }
  const requeueIdx = args.indexOf('--requeue-out');
  const requeueOut = requeueIdx >= 0 ? args[requeueIdx + 1] : null;
  const jsonOnly = args.includes('--json');

  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  } catch (err) {
    console.error(`Error: failed to read/parse packet at ${packetPath}: ${err.message}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = await applyPacket(supabase, packet);

  const summary = {
    stamped_at: packet.stamped_at,
    total: results.length,
    clean_apply: results.filter((r) => r.outcome === OUTCOME.CLEAN_APPLY).length,
    stage_diverged_requeue: results.filter((r) => r.outcome === OUTCOME.STAGE_DIVERGED_REQUEUE).length,
    content_gate_refusal: results.filter((r) => r.outcome === OUTCOME.CONTENT_GATE_REFUSAL).length,
    results,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Reconciliation apply: ${summary.clean_apply} clean, ${summary.stage_diverged_requeue} re-queued (diverged), ${summary.content_gate_refusal} content-gate refusals (of ${summary.total} total).`);
  }

  if (requeueOut) {
    const requeueVentures = results
      .filter((r) => r.outcome === OUTCOME.STAGE_DIVERGED_REQUEUE)
      .map((r) => packet.ventures.find((v) => v.id === r.ventureId))
      .filter(Boolean);
    fs.writeFileSync(
      requeueOut,
      JSON.stringify({ stamped_at: new Date().toISOString(), venture_count: requeueVentures.length, ventures: requeueVentures }, null, 2),
    );
    if (!jsonOnly) console.log(`Re-queue packet written: ${requeueOut} (${requeueVentures.length} venture(s))`);
  }

  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main();
}
