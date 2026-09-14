#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 -- Explore evidence at LEAD-TO-PLAN.
 *
 * Records the LEAD-phase Explore sub-agent's real findings (already reported back and acted
 * on -- the quiet-hours scoping gap it surfaced drove the LEAD-phase scope/key_changes/risks
 * correction, and its schema/blast-radius findings shaped the fix approach) to the canonical
 * sub_agent_execution_results table.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "LEAD-phase Explore review of the Michael checkpoint-texting codebase surfaced 6 findings, the most significant driving a real LEAD-phase scope correction: (1) NO existing on-demand/ad-hoc send mechanism exists anywhere in lib/michael or scripts/michael -- every Michael verb follows an identical [--apply]/[--et-date]/[--json] contract with the sole window gate being lib/michael/feeder.mjs:248's inWindow() check, confirming the on-demand path is genuinely new capability, not something to reuse. (2) The existing test suite (scripts/michael/checkpoint-send.test.js, 380 lines) has solid baseline coverage of every current guard but ZERO coverage of the finished_at race, the asOf rendering format, or any on-demand/quiet-hours behavior -- confirming those are net-new test surface for PLAN to scope. (3) database/migrations/20260906_michael_tables.sql:151-167 confirms michael_feeder_runs.status has no literal 'finished' value and 'skipped' is dual-purpose (a START placeholder written by claimAttempt AND a legitimate final outcome some feeders return) -- finished_at IS NOT NULL is the only unambiguous completion signal, matching the SD's fix approach. (4) grep for readProducingFeederCounts/summarizeCounts/composeCheckpointBody across the whole repo returns exactly 2 hits (definition + test file) -- confirming the fix's blast radius is confined to this one file and its own tests. (5) MOST SIGNIFICANT: the SD's own original scope text claimed the 22:00-06:00 ET chairman quiet-hours guard 'still applies' to on-demand sends, implying checkpoint-send.mjs already enforces it -- Explore found ZERO references to quiet hours anywhere in the file's 254 lines. The mechanism is real and live elsewhere (used by Adam's chairman SMS outbound worker) but was never wired into Michael's checkpoint-send verb; the original Tier-2 PRD flagged it as only a SHOULD, unimplemented, and invisible until now because none of the 4 fixed windows ever fall inside the quiet window by construction. This drove a real LEAD-phase scope/key_changes/risks correction (scripts/one-off/michael-texting-lead-correction-quiet-hours.mjs) requiring PLAN to scope NEWLY WIRING this guard rather than assume it exists. (6) michael_checkpoint_send_ledger.window_slot (database/migrations/20260914_michael_checkpoint_send.sql:36) is unconstrained TEXT with no CHECK/enum, confirming a new 'on-demand' dedup-key value is schema-safe.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'MEDIUM',
        issue: "Explore's own quiet-hours citation (resolveAllowQuietHours/quiet-hours-extension.js) was itself imprecise about the exact function/line for the in-window predicate -- a follow-up LEAD-TO-PLAN VALIDATION review found the correct predicate is isSmsQuietHour (chairman-et-wall-clock.js:138), not the override resolver alone, and this was corrected in the spine before handoff (finding F3, VALIDATION evidence row 22b5dac7-a3b2-4d15-8b6c-b3bf497040a2).",
        evidence: 'LEAD-TO-PLAN VALIDATION sub-agent review, finding F3.',
      },
    ],
    recommendations: [
      'PLAN should scope the quiet-hours guard as new wiring (isSmsQuietHour composition, not resolveAllowQuietHours alone), matching the corrected key_changes text.',
      'PLAN should add the finished_at-race fixture (an in-flight row alongside an older finished row for the same feeder/date) as a named test scenario, since Explore confirmed no existing test reproduces it.',
    ],
    detailed_analysis: {
      commands_run: [
        'grep -n "Usage" across scripts/michael/*.mjs (20+ files) -- confirmed identical [--apply]/[--et-date]/[--json] contract, no on-demand bypass anywhere',
        'Read lib/michael/feeder.mjs:248 (inWindow gate) and the full scripts/michael/checkpoint-send.test.js (380 lines) for existing coverage census',
        'Read database/migrations/20260906_michael_tables.sql:151-167 (michael_feeder_runs schema) and lib/michael/feeder.mjs claimAttempt (~210-212) and the finish path (~301-303) confirming the dual-purpose skipped status',
        "grep -rn 'readProducingFeederCounts|summarizeCounts|composeCheckpointBody' across the whole repo -> exactly 2 hits (definition file + its own test file)",
        "grep -rn 'quiet' scripts/michael/checkpoint-send.mjs -> zero hits",
        'Read lib/comms/adam-outbound/quiet-hours-extension.js and lib/time/chairman-et-wall-clock.js, confirmed live wiring into lib/chairman/sms-outbound-worker.js',
        'Read database/migrations/20260914_michael_checkpoint_send.sql:36 and the DDL tests -- window_slot confirmed unconstrained TEXT',
      ],
    },
    metadata: { independent_verification: true, drove_scope_correction: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/michael-texting-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
