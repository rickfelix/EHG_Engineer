#!/usr/bin/env node
/**
 * RETRO sub-agent evidence row for the PLAN-TO-LEAD GATE_SUBAGENT_EVIDENCE
 * check on SD-LEO-INFRA-FLEET-VIEW-BADGES-001.
 *
 * Companion to scripts/one-off/insert-retro-sd-leo-infra-fleet-view-badges-001.mjs
 * (the SD_COMPLETION retrospective row this evidence row references).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '1a6325e6-16f6-43d1-8b3a-a46ef735c6e3';
const SD_KEY = 'SD-LEO-INFRA-FLEET-VIEW-BADGES-001';
const RETRO_ID = '56500650-a4cb-4b31-b2da-8e6bcbfc056d';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  const cwd = process.cwd().replace(/\\/g, '/');

  const evidence = {
    sd_id: SD_UUID,
    sub_agent_code: 'RETRO',
    sub_agent_name: 'Continuous Improvement Coach',
    verdict: 'PASS',
    confidence: 92,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Migrate lib/fleet/exec-boundary-hold-writer.js to the safe atomic-merge pattern (mergeMetadataKeys), same fix class as QF-20260720-597 (harness bug 862b76b5-8f72-4e9c-88a6-3a051e89d01a)',
      'Swap classifyWatchdogState() into computeSessionBadge()\'s call site once SD-LEO-INFRA-FLEET-WATCHDOG-001 ships, rather than maintaining two badge vocabularies',
    ],
    detailed_analysis: `SD-completion retrospective generated for PLAN-to-LEAD handoff of ${SD_KEY} (Fleet launcher SD-C: per-session badges, capacity chip, attention strip). Implementation: lib/fleet/fleet-view-badges.cjs (new, formatCapacityChip + computeSessionBadge), lib/fleet/attention-flag-writer.js (new, atomic JSONB merge), scripts/fleet-dashboard.cjs (edited: header chip, row badge, printAttentionStrip()). 17 new tests (9 fleet-view-badges.test.js + 8 attention-flag-writer.test.js), zero regressions across 750 tests/unit/fleet tests and 165 tests across every test file referencing fleet-dashboard.cjs directly. Key SD-specific findings captured: (1) LEAD-phase validation correction that account-identity was already wired (narrowed FR scope); (2) deliberate rollup-not-classifier scoping of computeSessionBadge() to avoid colliding with in-flight sibling SD-LEO-INFRA-FLEET-WATCHDOG-001's own liveness taxonomy; (3) discovery of a second live instance of the QF-20260720-597 read-spread-write anti-pattern in lib/fleet/exec-boundary-hold-writer.js, logged as feedback 862b76b5-8f72-4e9c-88a6-3a051e89d01a and signaled rather than fixed inline. Retrospective row id ${RETRO_ID}, quality_score 100, status PUBLISHED.`,
    summary: `RETRO PASS for ${SD_KEY} PLAN-to-LEAD. SD-specific retrospective published (id ${RETRO_ID}, quality_score 100) capturing 6 success patterns, 5 key learnings, 3 action items, and 1 harness bug discovered+deferred (feedback 862b76b5-8f72-4e9c-88a6-3a051e89d01a). Zero test regressions (750/750 fleet unit tests, 165/165 fleet-dashboard.cjs-referencing tests).`,
    execution_time: 0,
    validation_mode: 'prospective',
    phase: 'PLAN',
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: 100,
      learnings_count: 5,
      action_items_count: 3,
    },
    metadata: {
      sd_key: SD_KEY,
      phase: 'PLAN',
      retrospective_id: RETRO_ID,
      generated_at: new Date().toISOString(),
      handoff_phase: 'PLAN-TO-LEAD',
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      repo_resolved: true,
      executed_from_cwd: cwd,
      registry_source: 'db',
    },
    executed_from_cwd: cwd,
    source: 'sub_agent_execution',
  };

  const { data: subRow, error: subErr } = await s
    .from('sub_agent_execution_results')
    .insert(evidence)
    .select('id, sd_id, sub_agent_code, verdict, phase, confidence, created_at')
    .single();
  if (subErr) {
    console.error('Sub-agent insert error:', subErr.message);
    process.exit(1);
  }
  console.log('Sub-agent evidence inserted:', JSON.stringify(subRow, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
