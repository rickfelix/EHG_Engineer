#!/usr/bin/env node
/**
 * Persist Explore sub-agent evidence for SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001's
 * LEAD-TO-PLAN handoff. REQUIRED_SUBAGENTS['LEAD-TO-PLAN'] = ['VALIDATION', 'Explore']
 * (scripts/modules/handoff/required-subagents.js) -- the designed path for the built-in
 * Explore agent is: worker invokes the Task-tool agent, then persists the row manually
 * via storeSubAgentResults with source='manual' (Explore has no leo_sub_agents DB row).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001';

const summary = 'CONFIRMED: voidStaleAndCollapseObligations (lib/chairman/sms-outbound-worker.js:357) ' +
  'is the sole gap. Full call-site inventory of enqueueChairmanSms (sms-bridge.js:245): (1) worker.js:357 ' +
  '(stale-decision re-emit branch) calls it DIRECTLY with the original decisionId, no staging call anywhere ' +
  'in that function -- the gap; (2) sms-bridge.js:518 inside sendChairmanSmsQuestion, called AFTER ' +
  'stageDecisionSmsNotification at line 509 -- correctly ordered; (3) chairman-sms-gate/index.js:177 inside ' +
  'makeDefaultSender().send(), reached only via sendChairmanSMS.sender.send() at line 700, which always runs ' +
  'AFTER stageDecisionSmsNotification at line 664 for a decision message -- correctly ordered; ' +
  '(4) drive-report-sms-sweep.mjs:349 binds enqueue for report-only sends, no decisionId used -- not relevant. ' +
  'stageDecisionSmsNotification (sms-bridge.js:374) has exactly two call sites (sms-bridge.js:509, ' +
  'chairman-sms-gate/index.js:664) -- voidStaleAndCollapseObligations never calls it. ' +
  'CRITICAL AMPLIFIER: TOKEN_TTL_MS=15min (sms-bridge.js:59) is far shorter than the 6h staleness threshold ' +
  '(DEFAULT_STALE_THRESHOLD_MS, worker.js:120) that triggers re-emit -- so EVERY re-emit is guaranteed to ' +
  'carry an already-dead token, not an occasional race. handleInboundSmsReply (sms-bridge.js:722) requires ' +
  'per-candidate status===pending && !sms_reply_used_at && sms_reply_token_expires_at>=now (line 814); since ' +
  'the token expired hours earlier, any reply to a re-emitted question resolves to outcome=expired ' +
  '(lines 836-837), never answered. Test coverage gap confirmed: tests/unit/chairman/sms-outbound-reconcile.' +
  'test.js exercises summary.reEmitted counts and the re_asked_as: supersede marker (TS-3, QF-20260829-320, ' +
  'SEC-2, TS-11) but asserts nothing about chairman_notifications inserts or token refresh on the re-emitted ' +
  'row. Schema confirmed: database/migrations/20260716_sms_bridge_schema.sql:24-25 (sms_reply_token TEXT ' +
  'UNIQUE, sms_reply_token_expires_at TIMESTAMPTZ on chairman_decisions).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings: [
      { id: 'EXPLORE1-call-graph-confirmed', severity: 'INFO', summary },
    ],
    warnings: [],
    recommendations: [
      'PRD should require: (1) the re-emit branch mints a fresh token/expiry and stages a chairman_notifications row before superseding the original obligation; (2) a regression test asserting chairman_notifications + a fresh, live token exist on the re-emitted row.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'LEAD_TO_PLAN_EXPLORE',
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001',
    },
    phase: 'LEAD_TO_PLAN',
    validation_mode: 'prospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore (built-in Task-tool agent, manual persist)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
