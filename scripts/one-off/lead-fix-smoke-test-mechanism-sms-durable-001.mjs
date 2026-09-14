#!/usr/bin/env node
/**
 * LEAD-TO-PLAN gate remediation for SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001:
 * replaces the auto-generated placeholder success_criteria/smoke_test_steps with real,
 * SD-specific content and adds metadata.mechanism_verifications (read-merge-write on
 * metadata, per the unsafe-sd-metadata-full-blob-write-lint CI check).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-SMS-DURABLE-001';

const successCriteria = [
  {
    measure: 'voidStaleAndCollapseObligations (lib/chairman/sms-outbound-worker.js) mints a fresh sms_reply_token + sms_reply_token_expires_at on the linked chairman_decisions row and inserts a chairman_notifications row before re-emitting a stale decision_question',
    criterion: 'The re-emit branch stages a fresh token/notification, matching what sendChairmanSMS does via stageDecisionSmsNotification',
    verification: 'Automated: a new/updated assertion in tests/unit/chairman/sms-outbound-reconcile.test.js (extending TS-3) checks chairman_decisions.sms_reply_token_expires_at > now and a new chairman_notifications row exists after a re-emit',
  },
  {
    measure: 'A chairman SMS reply to a re-emitted decision_question resolves to outcome=answered, not expired, in handleInboundSmsReply (lib/chairman/sms-bridge.js:722)',
    criterion: 'The re-emit no longer produces a structurally-unanswerable question',
    verification: 'Automated: a new integration-style test simulates the full re-emit -> inbound-reply round trip and asserts outcome=answered',
  },
  {
    measure: 'lib/adam/chairman-held-send-release.js:511/575 (heartbeat_status kind, also calls enqueueChairmanSms with a decisionId) is explicitly ruled in or out of this SDs scope, not left silent',
    criterion: 'PRD documents the disposition of the held-send-release call sites (VALIDATION sub-agent finding, evidence row 3037cac9-6caf-4d5f-9d4c-00139a5f22c6)',
    verification: 'Manual: PRD scope section states whether these call sites are fixed in this SD or explicitly deferred with a reason (they are non-reply-expecting notices, not decision questions)',
  },
];

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'From the repo root, run: npx vitest run tests/unit/chairman/sms-outbound-reconcile.test.js',
    expected_outcome: 'All tests pass, including the new/updated TS-3 assertions on token refresh and chairman_notifications insert for the re-emit branch',
  },
  {
    step_number: 2,
    instruction: 'Trace a stale re-emit manually: a decision_question obligation with decision_id X goes stale (>6h, DEFAULT_STALE_THRESHOLD_MS) while chairman_decisions.status=pending for X; after the fix, query chairman_decisions for row X',
    expected_outcome: 'sms_reply_token_expires_at is a fresh timestamp (> now, not the original expired one) and a new chairman_notifications row exists with decision_id=X',
  },
  {
    step_number: 3,
    instruction: 'From the repo root, run: npx vitest run tests/unit/chairman/ tests/unit/comms/chairman-sms-gate/ tests/unit/comms/chairman-sms-gate-live-intercept.test.js',
    expected_outcome: 'All existing chairman-SMS test suites still pass -- no regressions to the normal sendChairmanSMS path or the reconcile worker',
  },
];

async function main() {
  const { data: sd, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readErr) throw readErr;

  const mergedMetadata = {
    ...(sd.metadata || {}),
    mechanism_verifications: [
      {
        verified_by: 'validation-sms-durable sub-agent (Sonnet 5), independently re-confirmed by LEAD session',
        verified_at: 'lib/chairman/sms-outbound-worker.js:357',
        claim: 'voidStaleAndCollapseObligations calls enqueueChairmanSms directly (decisionId set, dedupeKey null) with no token mint and no chairman_notifications insert -- confirmed by reading the function body and grepping every other enqueueChairmanSms call site (all others are correctly preceded by stageDecisionSmsNotification or carry no decisionId)',
        evidence_row: '3037cac9-6caf-4d5f-9d4c-00139a5f22c6',
      },
      {
        verified_by: 'explore-sms-durable sub-agent (Sonnet 5), independently re-confirmed by LEAD session',
        verified_at: 'lib/chairman/sms-bridge.js:374',
        claim: 'stageDecisionSmsNotification (the only function that mints sms_reply_token/sms_reply_token_expires_at via updateChairmanDecisionSmsFields at line 321-347, and inserts chairman_notifications via insertChairmanSmsNotification) has exactly two call sites -- sms-bridge.js:509 and chairman-sms-gate/index.js:664 -- neither of which is sms-outbound-worker.js',
        evidence_row: '36c39f39-2050-44e1-ba3c-d640a02617ef',
      },
    ],
  };

  const { error: writeErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      success_criteria: successCriteria,
      smoke_test_steps: smokeTestSteps,
      metadata: mergedMetadata,
    })
    .eq('sd_key', SD_KEY);
  if (writeErr) throw writeErr;

  console.log('UPDATED:', SD_KEY, '- success_criteria, smoke_test_steps, metadata.mechanism_verifications');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
