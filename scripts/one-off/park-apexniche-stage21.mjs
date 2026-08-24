#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001 (FR-2): record the venture-gating PARK for
 * ApexNiche AI's stage-21 runaway retry, in the same shape adam-quiet-tick.js's
 * readVenturePark() reads (ventures.metadata.gating_decision = { decision, by, at,
 * unpark_trigger }), PLUS an explicit `parked: true` discriminator that eva-orchestrator.js's
 * new kill-switch guard requires (RISK-agent LEAD finding: gating on mere key-presence would
 * also match a DIFFERENT venture's live gating_decision whose value records an UNPARK, e.g.
 * AltifyAI's "UNPARKED — first dedicated revenue push authorized" -- presence alone is not a
 * safe discriminator, so `parked: true` is the one this SD's guard actually keys on).
 *
 * DISCOVERED live (2026-08-24): a gating_decision ALREADY existed on this venture from
 * 2026-07-25 (chairman-deferred behind the LEO app programme), but the chairman's 07-31
 * verbal override (decision_id 7c706688, recorded on the eva_stage_gate_attempts rows this
 * SD is fixing) already satisfied and superseded that park's own unpark_trigger -- the field
 * was simply never cleared/updated after the unpark. That stale field is NOT what is causing
 * today's replay (no code reads it yet -- that's the gap this SD's code change closes), but
 * it must not be silently clobbered: it is a chairman-decision audit trail. This script
 * preserves it verbatim under metadata.gating_decision_history and writes a NEW, distinct
 * current park reflecting the actual reason ApexNiche is parked today (the runaway hotfix),
 * not a resurrection of the old Sessions-page condition.
 *
 * Idempotent -- re-running when the CURRENT gating_decision.by already names this SD AND
 * carries parked:true is a no-op (safe to re-run to backfill parked:true onto an existing
 * SD-authored record that predates this field).
 *
 * Run once: node scripts/one-off/park-apexniche-stage21.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const VENTURE_ID = '809ec7e7-f688-4a0c-b9f8-c8a8291cf94d'; // ApexNiche AI
const SD_KEY = 'SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: venture, error: fetchErr } = await supabase
    .from('ventures')
    .select('id, name, metadata')
    .eq('id', VENTURE_ID)
    .single();
  if (fetchErr || !venture) {
    console.error('FAILED to fetch venture:', fetchErr?.message || 'not found');
    return 1;
  }

  const existing = venture.metadata?.gating_decision || null;
  if (existing?.by === SD_KEY && existing?.parked === true) {
    console.log('ALREADY_PARKED_BY_THIS_SD — no-op:', JSON.stringify(existing));
    return 0;
  }

  const gatingDecision = {
    decision: 'ApexNiche AI stage-21 stage-motion PARKED pending class fix (runaway retry hotfix)',
    parked: true,
    by: SD_KEY,
    at: new Date().toISOString(),
    unpark_trigger: 'SD-LEO-INFRA-STAGE-GATE-RETRY-001 shipped + stage-21 gate re-evaluated once',
    context: 'Supersedes the 2026-07-25 Sessions-page park recorded below in gating_decision_history — that park was already satisfied and unparked by chairman verbal override 7c706688 (2026-07-31 ~17:57Z, "I approve Recommendation A"), which is what let stage-21 evaluation resume in the first place. This is a NEW, distinct park for a NEW reason (the stage-21 gate never terminalizes after an override, so it replayed 7c706688 as a fresh eva_stage_gate_attempts row every ~30s, unbounded) — not a reinstatement of the old condition.',
  };

  const priorHistory = Array.isArray(venture.metadata?.gating_decision_history)
    ? venture.metadata.gating_decision_history
    : [];
  const mergedMetadata = {
    ...(venture.metadata || {}),
    gating_decision: gatingDecision,
    gating_decision_history: existing ? [...priorHistory, existing] : priorHistory,
  };

  const { error: updateErr } = await supabase
    .from('ventures')
    .update({ metadata: mergedMetadata })
    .eq('id', VENTURE_ID);

  if (updateErr) {
    console.error('FAILED to write gating_decision:', updateErr.message);
    return 1;
  }

  console.log('PARKED:', JSON.stringify(gatingDecision, null, 2));
  if (existing) {
    console.log('PRESERVED prior gating_decision in gating_decision_history (verbatim):', JSON.stringify(existing));
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
