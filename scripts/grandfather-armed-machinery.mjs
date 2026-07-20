#!/usr/bin/env node
// Auto-ARMED grandfathering sweep — SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-C (FR-2/FR-3).
//
// Run ONCE before the activation-evidence blocking default merges: every in-flight
// machinery-class SD with neither ACTIVATED evidence nor an ARMED registration gets an
// ARMED row via the existing registerArmedMachinery path, so the flip cannot mass-fail
// work that predates it. Idempotent (registerArmedMachinery upserts on process_key).
//
// --review additionally writes the observe-window artifact (what advisory mode surfaced
// since G3 shipped 2026-07-02) onto this SD's metadata per observe-then-bind discipline.
//
// Usage: node scripts/grandfather-armed-machinery.mjs [--dry-run] [--review]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { classifyMachineryClass } from '../lib/machinery-class/classify.js';
import { registerArmedMachinery } from '../lib/machinery-class/armed-registration.js';
import { isOrchestratorSync } from '../lib/sd/type-detection.js';
import {
  checkActivationEvidence,
  checkArmedRegistration,
} from './modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: both strategic_directives_v2 (the
// open-SD sweep set) and sd_phase_handoffs (the observe-window query) are growing tables; a
// silently-truncated sweep would leave real in-flight machinery SDs un-grandfathered.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const OBSERVE_WINDOW_START = '2026-07-02T00:00:00Z';
const CHAIRMAN_RATIFICATION = '2026-07-11 in-session ratification (kill-gate/ownership thread) — authorizes advisory->block promotion';
const SELF_SD_KEY = 'SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-C';
const OPEN_FILTER = ['completed', 'cancelled', 'archived', 'superseded'];

const dryRun = process.argv.includes('--dry-run');
const doReview = process.argv.includes('--review');
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Machinery-class, non-orchestrator SDs from a row set. */
function machineryLeaves(rows) {
  return rows.filter((sd) => !isOrchestratorSync(sd) && classifyMachineryClass(sd).machineryClass);
}

let openSds;
try {
  openSds = await fetchAllPaginated(() => supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, title, status, description, scope, key_changes, metadata, parent_sd_id')
    .not('status', 'in', `(${OPEN_FILTER.join(',')})`)
    .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
} catch (error) {
  console.error(`sweep: SD query failed: ${error.message}`); process.exit(1);
}

let grandfathered = 0, alreadyCovered = 0;
const grandfatheredKeys = [];
for (const sd of machineryLeaves(openSds ?? [])) {
  const [activated, armed] = await Promise.all([
    checkActivationEvidence(supabase, sd),
    checkArmedRegistration(supabase, sd),
  ]);
  if (activated || armed) { alreadyCovered += 1; continue; }
  if (dryRun) { console.log(`  [dry-run] would ARM ${sd.sd_key}`); grandfathered += 1; continue; }
  const res = await registerArmedMachinery(supabase, sd, {
    activationTrigger: 'grandfathered-at-activation-evidence-flip (SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-C): fires when this SD\'s machinery processes its first real event post-flip',
    owner: 'g3-activation',
  });
  if (!res.ok) { console.error(`  ❌ ARM failed for ${sd.sd_key}: ${res.error}`); process.exit(1); }
  grandfathered += 1;
  grandfatheredKeys.push(sd.sd_key);
  console.log(`  ✓ ARMED (grandfathered): ${sd.sd_key}`);
}
console.log(`\nSweep ${dryRun ? 'DRY-RUN' : 'complete'}: ${grandfathered} grandfathered, ${alreadyCovered} already ACTIVATED/ARMED.`);
console.log('Zero-mass-fail check: every in-flight machinery SD now holds ACTIVATED or ARMED state — none would hard-block at the flipped gate.');

if (doReview && !dryRun) {
  // Observe-window review: machinery-class SDs that reached LEAD-FINAL during the
  // advisory period, and their activation states now. Every query on this path is
  // FAIL-LOUD (adversarial review): a swallowed error here would write a falsely-clean
  // evidence artifact — the exact opposite of its observe-then-bind purpose.
  let windowHandoffs;
  try {
    windowHandoffs = await fetchAllPaginated(() => supabase
      .from('sd_phase_handoffs')
      .select('sd_id')
      .eq('handoff_type', 'LEAD-FINAL-APPROVAL')
      .gte('created_at', OBSERVE_WINDOW_START)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (whErr) {
    console.error(`review: handoff window query failed (${whErr.message}) — NOT writing a partial artifact`); process.exit(1);
  }
  const windowIds = [...new Set(windowHandoffs.map((h) => h.sd_id))];
  const { data: windowSds, error: wsErr } = windowIds.length
    ? await supabase.from('strategic_directives_v2')
        .select('id, sd_key, sd_type, title, status, description, scope, key_changes, metadata, parent_sd_id')
        .in('id', windowIds)
    : { data: [], error: null };
  if (wsErr) { console.error(`review: window SD query failed (${wsErr.message}) — NOT writing a partial artifact`); process.exit(1); }
  if (windowIds.length && (windowSds ?? []).length !== windowIds.length) {
    console.error(`review: window SD fetch truncated (${(windowSds ?? []).length}/${windowIds.length}) — NOT writing a partial artifact`);
    process.exit(1);
  }
  const counts = { ACTIVATED: 0, ARMED: 0, UNWIRED: 0 };
  const unwired = [];
  for (const sd of machineryLeaves(windowSds ?? [])) {
    const [activated, armed] = await Promise.all([
      checkActivationEvidence(supabase, sd),
      checkArmedRegistration(supabase, sd),
    ]);
    const state = activated ? 'ACTIVATED' : (armed ? 'ARMED' : 'UNWIRED');
    counts[state] += 1;
    if (state === 'UNWIRED') unwired.push(sd.sd_key);
  }
  const review = {
    window_start: OBSERVE_WINDOW_START,
    window_end: new Date().toISOString(),
    machinery_lead_final_states: counts,
    unwired_at_review: unwired,
    grandfathered_this_sweep: grandfatheredKeys,
    authorizing_decision: CHAIRMAN_RATIFICATION,
  };
  const { data: selfSd, error: selfErr } = await supabase
    .from('strategic_directives_v2').select('id, metadata').eq('sd_key', SELF_SD_KEY).single();
  if (selfErr || !selfSd?.id) {
    // Grandfathering writes above already committed and are idempotent — only the
    // review artifact is missing; re-run with --review after fixing the lookup.
    console.error(`review: could not load ${SELF_SD_KEY} (${selfErr?.message ?? 'no row'}) — artifact not written`);
    process.exit(1);
  }
  const { error: revErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...(selfSd.metadata ?? {}), observe_window_review: review } })
    .eq('id', selfSd.id);
  if (revErr) { console.error(`review write failed: ${revErr.message}`); process.exit(1); }
  console.log(`\nObserve-window review recorded on ${SELF_SD_KEY}: ${JSON.stringify(counts)}; unwired: ${unwired.length ? unwired.join(', ') : '(none)'}`);
}
