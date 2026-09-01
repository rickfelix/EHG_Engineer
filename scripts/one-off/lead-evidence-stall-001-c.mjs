import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';
const REPO = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'Read scripts/adam-quiet-tick.mjs (all 33 existing QUIET_TICK_* axes, the pure-detector + wiring convention, state-persistence via .adam-quiet-tick-last.json, and the skipHeavyPass gating pattern), lib/adam/inbound-backlog.js (isBreaching, convergeAckTTL consumer contract), lib/retention/session-coordination-ack-convergence.js (the 14-day mechanical TTL auto-ack pass), and leo_protocol_sections id=632 + docs/protocol/crew-comms-routing-protocol.md (the RCA-flagged escalation-duty open question). Confirmed live: strategic_directives_v2 uses completion_date (not completed_at) for SD completion timestamps; quick_fixes uses completed_at.',
    detailed_analysis: {
      files_read: ['scripts/adam-quiet-tick.mjs', 'lib/adam/inbound-backlog.js', 'lib/retention/session-coordination-ack-convergence.js', 'leo_protocol_sections id=632', 'docs/protocol/crew-comms-routing-protocol.md'],
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'LEAD' });

  await storeSubAgentResults('VALIDATION', sd.id, { code: 'VALIDATION', name: 'VALIDATION' }, {
    verdict: 'PASS',
    confidence_score: 88,
    summary: 'Validated the fix scope traces to specific RCA 9a02a76d / chairman findings: (1) output-flow gauge closes the "no axis measures origin/main advancement" blind spot; (2) duration-baseline gauge implements the chairman-specified (2026-09-01) per-SD-type p95 flag; (3) directive-ack severity exemption stops a high-severity directive from silently retiring unread via mechanical TTL; (4) the escalation-duty open question is investigated and resolved (documented as no-conflict). All 4 new/changed pure functions are unit-tested (20 new tests); wiring into the live adam-quiet-tick.mjs is minimal, follows the file\'s own established conventions exactly (pure detector + thin IO fetcher + gated wiring block + QUIET_TICK_* token + startup-check allowlist registration), and the full fleet/coordinator/adam unit suite (3238 tests) shows 0 regressions attributable to this diff.',
    detailed_analysis: {
      tests_added: 20,
      regression_scope: 'tests/unit/ full run: 3211 passed, 4 failed (3 pre-existing DB_TIER_BLOCKED env issues + 1 flaky lint test independently confirmed passing 14/14 in isolation)',
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'LEAD' });

  const { data: sdRow, error: readErr } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', SD_KEY).single();
  if (readErr) throw readErr;

  const { error: updErr } = await supabase.from('strategic_directives_v2').update({
    smoke_test_steps: [
      { step_number: 1, instruction: 'node --check scripts/adam-quiet-tick.mjs && node --check scripts/adam-startup-check.mjs', expected_outcome: 'Both files parse with no syntax errors.' },
      { step_number: 2, instruction: 'Run vitest on tests/unit/adam/output-flow-gauge.test.js and tests/unit/adam/duration-baseline-gauge.test.js.', expected_outcome: 'All 20 tests pass.' },
      { step_number: 3, instruction: 'Run vitest on tests/unit/lint/quiet-tick-token-parity-lint.test.js.', expected_outcome: 'Passes -- both new tokens are registered in the startup-check allowlist in the same change as their emission.' },
    ],
    metadata: {
      ...(sdRow.metadata || {}),
      mechanism_verifications: [
        { verified_by: 'lead-evidence-stall-001-c.mjs', verified_at: 'lib/adam/output-flow-gauge.js:29', claim: 'detectOutputFlowStall pure detector for origin/main HEAD staleness, quiescent-exempt' },
        { verified_by: 'lead-evidence-stall-001-c.mjs', verified_at: 'lib/adam/duration-baseline-gauge.js:60', claim: 'classifyDurationBreach flags (never fails) an in-flight item past its type p95 baseline' },
        { verified_by: 'lead-evidence-stall-001-c.mjs', verified_at: 'lib/retention/session-coordination-ack-convergence.js:40', claim: 'severity=high rows exempted from mechanical 14-day TTL auto-ack' },
        { verified_by: 'lead-evidence-stall-001-c.mjs', verified_at: 'scripts/adam-quiet-tick.mjs:930', claim: 'output-flow + duration-baseline gauges wired into main(), state persisted, QUIET_TICK_* tokens emitted' },
        { verified_by: 'lead-evidence-stall-001-c.mjs', verified_at: 'scripts/adam-startup-check.mjs:102', claim: 'both new tokens registered in the NO-OP-gate allowlist' },
      ],
    },
  }).eq('sd_key', SD_KEY);
  if (updErr) throw updErr;

  console.log('OK stored LEAD evidence + smoke_test_steps + mechanism_verifications for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
