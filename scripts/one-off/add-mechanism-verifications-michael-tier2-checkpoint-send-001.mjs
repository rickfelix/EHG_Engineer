#!/usr/bin/env node
// One-off: satisfy the mechanism-claim-verifier gate (GATE_MECHANISM_CLAIM_VERIFIER) at
// LEAD-TO-PLAN for SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001. Every file/line claim made in
// the re-authored FRs gets a citation: {verified_by, verified_at: "file:line", claim}.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const mechanism_verifications = [
  {
    verified_by: 'LEAD worker (direct read)',
    verified_at: 'scripts/michael/todoist-act.mjs:73-77',
    claim: 'todoist-act.mjs preflights the recording table (readRows on michael_todoist_snapshot) BEFORE the external Todoist call, and refuses TABLES_ABSENT before any mutation -- the exact preflight-before-external-call shape FR-1/FR-6 require.',
  },
  {
    verified_by: 'LEAD worker (direct read)',
    verified_at: 'lib/michael/db.mjs:43-58',
    claim: 'readRows() returns {rows:[],tables_absent:true} on a missing relation (line 50) and {rows:[],tables_absent:false,error} on any other read error (lines 51,56) -- both branches yield an empty rows array, so a verb using readRows() naively for a cap-count would fail OPEN unless it explicitly branches on tables_absent AND error before concluding "0 sent today".',
  },
  {
    verified_by: 'LEAD worker (direct read)',
    verified_at: 'database/migrations/20260906_michael_tables.sql:128-312',
    claim: 'All 11 michael_* tables in this migration share one shape: RLS enabled, a single service_role-only ALL policy, REVOKE ALL FROM anon/authenticated/PUBLIC, a BEFORE UPDATE updated_at trigger via michael_set_updated_at(), a natural-key UNIQUE INDEX, and a COMMENT ON TABLE citing the authorizing SD -- michael_feedback_ledger (128-148, one row per et_date) and michael_todoist_snapshot (237-262, mutations_applied JSONB array + a *_at revoke-signal column) are the closest shape precedents for the new checkpoint-send ledger.',
  },
  {
    verified_by: 'LEAD worker (direct read)',
    verified_at: 'lib/messaging/providers/twilio-provider.js:17-19',
    claim: 'accountSid()/authToken()/messagingService() read process.env.TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_MESSAGING_SERVICE directly at call time inside send() -- there is no per-caller identity parameter today, confirming the FR-3 hazard (sharing this module as-is means revoking Michael also revokes Adam).',
  },
  {
    verified_by: 'LEAD worker (direct read)',
    verified_at: 'scripts/michael/rule-encode.mjs:61-66,72-84,133',
    claim: 'needsVerifier() returns true whenever a write flips auto_apply or supersedes an active rule; runRuleEncode() then requires --verifier-verdict naming a runner-produced Opus-verifier JSON file (verifyVerdict checks producer/model/subject_hash/staleness) before the write proceeds -- confirming michael_rules.auto_apply is NOT a fast, lightweight revocation mechanism and is the wrong home for FR-5.',
  },
  {
    verified_by: 'LEAD worker (direct DB query + file read)',
    verified_at: 'CLAUDE_MICHAEL.md:127; chairman_ratifications row id=561878ae-9c24-48d8-944f-8af1ba0c37b4',
    claim: 'Ratification 561878ae (target_contracts=[adam,michael], ratified 2026-09-13T23:10:12Z) has encoded_at=NULL and encoded_ref=NULL in chairman_ratifications -- confirmed by direct query. CLAUDE_MICHAEL.md:127 carries only its predecessor b9d3607e\'s encoded text, ending "Neither tier is built or scheduled and this clause authorises no build." grep for "561878ae" in CLAUDE_MICHAEL.md returns 0 hits.',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results id=1171f9c8-d49d-4a32-9c15-a3c97e39200e)',
    verified_at: 'lib/feature-flags/evaluator.js:22,65-69,80-89,102',
    claim: 'CACHE_TTL_MS=30000; refreshCacheIfNeeded early-returns inside the TTL; a failed flags read is caught and falls back to the STALE cache (comment: "fail-open: keep the existing cache on read failure"); lastCacheRefresh is stamped even when the read failed -- confirms leo_feature_flags is disqualified for FR-5 (must be fresh + fail-closed).',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results id=1171f9c8-d49d-4a32-9c15-a3c97e39200e)',
    verified_at: 'api/webhooks/twilio-sms.js:18; lib/chairman/sms-bridge.js:26; lib/chairman/sms-outbound-worker.js:81',
    claim: 'Exactly 3 real importers of lib/messaging/providers/twilio-provider.js exist, all default imports -- confirms an additive optional identity parameter on send() changes zero existing call sites, making it strictly safer than a parallel module for FR-3.',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results id=1171f9c8-d49d-4a32-9c15-a3c97e39200e)',
    verified_at: 'lib/comms/adam-outbound/chairman-sms-gate/index.js:144,423,566,640',
    claim: 'Chairman-phone resolution in the existing gate uses "message.recipientPhone || process.env.CHAIRMAN_PHONE || null" at 4 sites -- the caller-first/env-fallback shape FR-2 explicitly forbids Michael\'s new verb from copying.',
  },
  {
    verified_by: 'VALIDATION sub-agent (sub_agent_execution_results id=1171f9c8-d49d-4a32-9c15-a3c97e39200e)',
    verified_at: 'tests/unit/outbound-sink-conformance.test.js:52-67',
    claim: 'DISCOVERY_ROOTS (lib/comms, lib/chairman, lib/notifications, lib/adam, lib/messaging, lib/coordinator/adam-outbound-gate.js) and ADDITIONAL_SCOPE (6 explicit out-of-root paths) do NOT include scripts/michael or lib/michael -- confirms the new verb is born outside the chairman-reaching-sink census regardless of the FR-3 mechanism chosen, and must be added to ADDITIONAL_SCOPE in the same PR.',
  },
];

const nextMetadata = { ...(sdRow.metadata || {}), mechanism_verifications };

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: nextMetadata })
  .eq('id', sdRow.id);
if (updErr) throw updErr;

console.log('OK: mechanism_verifications written,', mechanism_verifications.length, 'entries.');
