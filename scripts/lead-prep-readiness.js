#!/usr/bin/env node
/**
 * SD-LEO-INFRA-GATE-CALIBRATE-LEAD-PLAN-REJECTION-001 (FR-2 remediation) — EARLY LEAD-TO-PLAN
 * prep-readiness advisory.
 *
 * DIAGNOSIS (FR-1): of 237 LEAD-TO-PLAN handoffs, 62 (26%) were rejected; clustering the
 * rejection_reasons showed the DOMINANT cause is PREP-INSUFFICIENT — SDs arriving without the
 * required fields the gate (correctly) demands for a usable PRD: smoke_test_steps (~21 across
 * SMOKE_TEST_*), JSONB_FIELDS_INCOMPLETE (~13: success_criteria/success_metrics/key_changes/
 * dependencies), success_metrics, strategic_objectives, and DESCRIPTION_TOO_SHORT — NOT
 * gate-too-strict. (A secondary, orthogonal ~9 GATE_CLAIM_VALIDITY cluster is a claim/timing issue,
 * not prep/strictness.)
 *
 * REMEDIATION (FR-2, prep-insufficient branch) that PRESERVES the gate's protective intent (FR-3):
 * surface the gate's OWN prerequisite check (checkLeadToPlanPrereqs, the SSOT) EARLY — when a worker
 * starts a LEAD-phase SD — so the missing fields are populated with REAL content BEFORE the handoff,
 * turning a late rejection into an early checklist. No threshold is lowered; the same checks run,
 * just sooner. The rejection rate falls because real defects are closed earlier, not because the bar
 * dropped.
 *
 * Usage: node scripts/lead-prep-readiness.js <SD-KEY-or-UUID>
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { pathToFileURL } from 'url';
import { checkLeadToPlanPrereqs } from './modules/handoff/pre-checks/prerequisite-preflight.js';

/**
 * Run the LEAD-TO-PLAN prerequisite check EARLY against an SD and partition the result.
 * Reuses the gate SSOT checkLeadToPlanPrereqs — no duplicated checks, no new thresholds.
 * @returns {Promise<{ found:boolean, ready:boolean, blocking:Array, info:Array, sdKey:string }>}
 */
export async function runLeadPrepReadiness(sdInput, { supabase } = {}) {
  const sb = supabase || createSupabaseServiceClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sdInput));
  const { data: sd } = await sb
    .from('strategic_directives_v2')
    .select('*')
    .or(isUuid ? `uuid_id.eq.${sdInput},id.eq.${sdInput},sd_key.eq.${sdInput}` : `sd_key.eq.${sdInput}`)
    .limit(1)
    .maybeSingle();
  if (!sd) return { found: false, ready: false, blocking: [], info: [], sdKey: String(sdInput) };
  const issues = checkLeadToPlanPrereqs(sd) || [];
  const blocking = issues.filter(i => i.severity !== 'info');
  const info = issues.filter(i => i.severity === 'info');
  return { found: true, ready: blocking.length === 0, blocking, info, sdKey: sd.sd_key || sd.id };
}

function render(r, log = console.log) {
  if (!r.found) { log(`[lead-prep-readiness] SD not found: ${r.sdKey}`); return; }
  if (r.ready) {
    log(`✅ [lead-prep-readiness] ${r.sdKey} is LEAD-TO-PLAN prep-ready (no blocking prerequisite gaps).`);
  } else {
    log(`⚠️  [lead-prep-readiness] ${r.sdKey} has ${r.blocking.length} LEAD-TO-PLAN prerequisite gap(s) — populate these BEFORE the handoff (the gate will reject otherwise):`);
    for (const g of r.blocking) {
      log(`   ❌ [${g.code}] ${g.message}`);
      if (g.remediation) log(String(g.remediation).split('\n').map(l => `      ${l}`).join('\n'));
    }
  }
  for (const g of r.info) log(`   ℹ️  [${g.code}] ${g.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sdInput = process.argv[2];
  if (!sdInput) { console.error('Usage: node scripts/lead-prep-readiness.js <SD-KEY-or-UUID>'); process.exit(1); }
  runLeadPrepReadiness(sdInput)
    .then(r => { render(r); process.exit(0); })
    .catch(err => { console.error('lead-prep-readiness error:', err.message); process.exit(1); });
}

export { render };
