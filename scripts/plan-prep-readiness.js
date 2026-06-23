#!/usr/bin/env node
/**
 * SD-LEO-INFRA-PLANEXEC-PREFLIGHT-JSONB-PREP-001 — EARLY PLAN-TO-EXEC prep-readiness advisory.
 *
 * FR-1 IDENTIFY (corrected from data): the SD's title guessed "JSONB fields", but a 21-day pull of
 * PLAN-TO-EXEC handoffs (200 total, 20 rejected) shows JSONB_FIELDS_INCOMPLETE = 0 at this stage —
 * that check belongs to LEAD-TO-PLAN (already remediated by SD-LEO-INFRA-GATE-CALIBRATE-LEAD-PLAN-
 * REJECTION-001 / lead-prep-readiness). The ACTUAL PLAN-TO-EXEC prerequisite_preflight gaps are
 * PRD-related (PRD_MISSING / PRD_NOT_APPROVED / PRD_SUMMARY_SHORT) and user-stories
 * (USER_STORIES_MISSING). So this advisory targets those — the real EXEC-readiness fields.
 *
 * FR-2 STRENGTHEN PREP / FR-3 NO GATE CHANGE: surface the gate's OWN prerequisite check
 * (checkPlanToExecPrereqs, the SSOT) EARLY — during PLAN, before the PLAN-TO-EXEC handoff — so the
 * worker creates/approves the PRD and the user stories first. The advisory reuses the exact gate
 * checks (no new checks, no lowered thresholds); the rejection cluster shrinks because real defects
 * close earlier, never because the bar dropped.
 *
 * Usage: node scripts/plan-prep-readiness.js <SD-KEY-or-UUID>
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { pathToFileURL } from 'url';
import { checkPlanToExecPrereqs } from './modules/handoff/pre-checks/prerequisite-preflight.js';

/**
 * Run the PLAN-TO-EXEC prerequisite check EARLY against an SD and partition the result.
 * Reuses the gate SSOT checkPlanToExecPrereqs — no duplicated checks, no new thresholds.
 * @returns {Promise<{ found:boolean, ready:boolean, blocking:Array, info:Array, sdKey:string }>}
 */
export async function runPlanPrepReadiness(sdInput, { supabase } = {}) {
  const sb = supabase || createSupabaseServiceClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sdInput));
  const { data: sd } = await sb
    .from('strategic_directives_v2')
    .select('*')
    .or(isUuid ? `uuid_id.eq.${sdInput},id.eq.${sdInput},sd_key.eq.${sdInput}` : `sd_key.eq.${sdInput}`)
    .limit(1)
    .maybeSingle();
  if (!sd) return { found: false, ready: false, blocking: [], info: [], sdKey: String(sdInput) };
  const issues = (await checkPlanToExecPrereqs(sb, sd, sd.sd_key || sd.id)) || [];
  const blocking = issues.filter(i => i.severity !== 'info');
  const info = issues.filter(i => i.severity === 'info');
  return { found: true, ready: blocking.length === 0, blocking, info, sdKey: sd.sd_key || sd.id };
}

function render(r, log = console.log) {
  if (!r.found) { log(`[plan-prep-readiness] SD not found: ${r.sdKey}`); return; }
  if (r.ready) {
    log(`✅ [plan-prep-readiness] ${r.sdKey} is PLAN-TO-EXEC prep-ready (PRD + user stories satisfy the prerequisite gate).`);
  } else {
    log(`⚠️  [plan-prep-readiness] ${r.sdKey} has ${r.blocking.length} PLAN-TO-EXEC prerequisite gap(s) — close these BEFORE the handoff (the gate will reject otherwise):`);
    for (const g of r.blocking) {
      log(`   ❌ [${g.code}] ${g.message}`);
      if (g.remediation) log(String(g.remediation).split('\n').map(l => `      ${l}`).join('\n'));
    }
  }
  for (const g of r.info) log(`   ℹ️  [${g.code}] ${g.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sdInput = process.argv[2];
  if (!sdInput) { console.error('Usage: node scripts/plan-prep-readiness.js <SD-KEY-or-UUID>'); process.exit(1); }
  runPlanPrepReadiness(sdInput)
    .then(r => { render(r); process.exit(0); })
    .catch(err => { console.error('plan-prep-readiness error:', err.message); process.exit(1); });
}

export { render };
