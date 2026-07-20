// Record VALIDATION + Explore evidence for SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A (Child A).
// Same structural gap as the parent SD and FW-3 sibling SDs this session: Explore is a
// built-in read-only agent with no Write tool; the general-purpose VALIDATION run wasn't
// instructed to self-persist. Both agents did real investigation feeding this child's exact
// scope (parent-level Task/Agent calls this session), so this persists their genuine findings.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A';

const { data: sd } = await s.from('strategic_directives_v2').select('id').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

const validationRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Principal Systems Analyst',
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  conditions: [
    'PRD must sequence the migration-apply ceremony (chairman verbal/written approval -> scripts/apply-migration.js --prod-deploy MIGRATION_APPLY_TOKEN 3-factor attestation -> npm run schema:snapshot:lint regenerating scripts/lint/schema-reference-allowlist.json in the same PR -> a real service_role probe: enqueue an owed row + run reconcileOutboundSms) as an explicit FR-0, chairman-gated, before any live acceptance testing of this child\'s other FRs.',
    'PRD must target the EXACT bug mechanism: worker.js retryOrAlert overwrites provider_message_id on resend (lines 265-269) with no history kept, causing a late callback for the original Twilio SID to match zero rows and silently no-op. This IS the literal mechanism behind the 7-duplicate incident, not a restated "make retries reference the same obligation" requirement (they already do reference the same row -- id-preservation is not the gap; provider_message_id data-loss on that row is).',
  ],
  justification: 'This child\'s scope is real and grounded in existing code (api/webhooks/twilio-sms.js handleTwilioStatusCallback already built+mounted; sms-outbound-worker.js retryOrAlert/atomic-claim/crash-reaper all exist and were read directly). Two conditions must be satisfied in the PRD before EXEC: the migration-apply prerequisite needs to be an explicit sequenced FR-0 (currently only implicit in the parent proposal), and the duplicate-send fix needs to target the precise provider_message_id-overwrite mechanism rather than a vaguer idempotency restatement.',
  critical_issues: [
    'database/migrations/20260718_sms_outbound_obligations_STAGED.sql is chairman-gated and NOT yet applied to the live DB -- every FR in this child (callback config, provider-check-at-timeout, dedup bugfix, sole-authority audit, sleep-window pin) is fail-soft no-op in production until the migration ceremony runs. This is a genuine external, human-gated blocking dependency for LIVE acceptance (code can still be written/unit-tested against the known STAGED schema).',
  ],
  warnings: [
    'F1 (callback wiring) is config-only, not new code: handleTwilioStatusCallback (api/webhooks/twilio-sms.js:147-183) is fully built, signature-verified, mounted at server/index.js:150; twilio-provider.js:44-45 already reads TWILIO_STATUS_CALLBACK_URL. Scope this FR as "set the env var to the real public URL + verify prod route reachability", not new webhook code.',
    'F4 sole-send-authority is substantially already built: atomic single-use claim exists at worker.js:228-243, both known callers (sms-bridge.js enqueueChairmanSms/sendChairmanSmsQuestion, chairman-sms-gate/index.js) route through it. This FR should be scoped as an AUDIT (repo-wide grep for any remaining direct provider.send()/twilioProvider.send() call sites bypassing the claim), not new dispatch-authority code.',
    'Three separate ad-hoc quiet-window implementations already exist (isWithinChairmanQuietWindow in resend-adapter.js; a bespoke helper in chairman-morning-review-sweep.mjs, enqueue-time only; a third inlined in decision-scheduler) but NONE gate the retry-RELEASE point in worker.js retryOrAlert. Consolidate into ONE canonical helper reused at the release point, rather than authoring a fourth ad-hoc copy.',
    'The existing MEDIUM-1 crash-reaper (worker.js:176-195) already prevents re-send when a sending row carries provider_message_id/sent_at -- the "kill mid-retry, restart, prove zero duplicates" acceptance case is largely already handled by this path; verify it still holds after the resend-preservation fix rather than re-implementing it.',
  ],
  recommendations: [
    'PRD FR-0: migration-apply ceremony (chairman-gated, see exact runbook in the STAGED file header) + OWED-ESCALATE CHECK-constraint widen (DROP+ADD CONSTRAINT on status, mirroring 20260713_periodic_process_registry_gha_source_and_state_anchor.sql\'s widen pattern -- zero-risk since the table is still unapplied).',
    'PRD FR-1: set TWILIO_STATUS_CALLBACK_URL to the real public URL (config verification, not new code).',
    'PRD FR-2: replace the blind sent-timeout re-arm (worker.js ~197-214) with a real Twilio API query by provider_message_id; re-owe ONLY on provider-confirmed non-delivery. An obligation with no callback AND a failed provider-check goes to the new OWED-ESCALATE status, never silently closed (Solomon Pin #3 polarity).',
    'PRD FR-3: fix retryOrAlert (worker.js:265-269) to preserve/append the prior provider_message_id (e.g. an array/history column or a separate obligation_send_attempts table) instead of overwriting it, so a late callback for an earlier SID still resolves. Acceptance: kill the runner mid-retry, restart, prove zero duplicate sends (Solomon Pin #2).',
    'PRD FR-4: consolidate the 3 existing quiet-window helpers into one canonical function, call it at the retry-RELEASE point in retryOrAlert (not just at enqueue) so a message owed at 9:58PM does not fire at a 10:15PM sweep (Solomon Pin #1).',
    'PRD FR-5: audit (grep) for any remaining direct-send call sites bypassing the atomic claim at worker.js:228-243; close any found.',
  ],
  detailed_analysis: JSON.stringify({
    files_confirmed_real: [
      'api/webhooks/twilio-sms.js:147-183 (handleTwilioStatusCallback)',
      'server/index.js:150 (mount point)',
      'lib/messaging/providers/twilio-provider.js:44-45',
      'lib/chairman/sms-outbound-worker.js (worker.js): atomic claim 228-243, crash-reaper 176-195, blind timeout re-arm 197-214, provider_message_id overwrite 265-269',
      'lib/chairman/sms-bridge.js (enqueueChairmanSms, sendChairmanSmsQuestion)',
      'database/migrations/20260718_sms_outbound_obligations_STAGED.sql (full 97-line schema verified verbatim)',
      'lib/notifications/resend-adapter.js (isWithinChairmanQuietWindow)',
      'scripts/cron/chairman-morning-review-sweep.mjs (separate quiet-window helper, enqueue-time only)',
    ],
    migration_apply_runbook_verbatim: '(1) chairman verbal/written approval; (2) apply via scripts/apply-migration.js --prod-deploy with MIGRATION_APPLY_TOKEN 3-factor attestation commit; (3) npm run schema:snapshot:lint, commit regenerated snapshot in same PR (removes sms_outbound_obligations from scripts/lint/schema-reference-allowlist.json); (4) verify with a real service_role probe: enqueue an owed row and run reconcileOutboundSms.',
    staged_schema_status_check_constraint: "status TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','sending','sent','delivered','undelivered','failed','canceled')) -- OWED-ESCALATE needs to be added to this enum via DROP+ADD CONSTRAINT since the table is not yet applied (zero-risk, no live ALTER/backfill).",
  }),
  metadata: {
    files_identified: [
      'api/webhooks/twilio-sms.js',
      'server/index.js',
      'lib/messaging/providers/twilio-provider.js',
      'lib/chairman/sms-outbound-worker.js',
      'lib/chairman/sms-bridge.js',
      'database/migrations/20260718_sms_outbound_obligations_STAGED.sql',
      'lib/notifications/resend-adapter.js',
      'scripts/cron/chairman-morning-review-sweep.mjs',
    ],
  },
  validation_mode: 'prospective',
  source: 'VALIDATION',
  phase: 'LEAD',
  summary: 'CONDITIONAL_PASS: Child A scope (migration ceremony, callback config, provider-check-at-timeout, duplicate-send preservation, sole-authority audit, sleep-window-at-release) is grounded in real, verified code. Two conditions for PRD: sequence the migration-apply ceremony as an explicit chairman-gated FR-0, and target the precise provider_message_id-overwrite-on-resend bug (worker.js:265-269) as the literal duplicate-send fix rather than a vaguer idempotency restatement. F1 and F4-audit are both smaller/narrower than the parent proposal implied (config-only and audit-only respectively).',
};

const exploreRow = {
  sd_id: SD_UUID,
  sub_agent_code: 'Explore',
  sub_agent_name: 'Codebase Explorer',
  verdict: 'PASS',
  confidence: 92,
  critical_issues: [],
  warnings: [],
  recommendations: [
    'Child A PRD must cite the exact STAGED migration schema verbatim (columns: id, recipient_phone, kind, decision_id, body, dedupe_key UNIQUE, status CHECK-enum, provider_message_id, attempts, not_before, claimed_at, claimed_by, created_at, sent_at, delivered_at, last_error, media_url; RLS: service_role-only FOR ALL, no anon/authenticated policy at all) plus the exact 4-step chairman apply runbook already documented in the migration file\'s own header comment.',
    'The precedent for widening a CHECK constraint on a still-unapplied STAGED table is database/migrations/20260713_periodic_process_registry_gha_source_and_state_anchor.sql (widened liveness_source) -- mirror that DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern for adding OWED-ESCALATE to the status enum.',
    'Three quiet-window implementations to consolidate: isWithinChairmanQuietWindow (lib/notifications/resend-adapter.js), a bespoke et6amIso/etLocalHour helper in scripts/cron/chairman-morning-review-sweep.mjs (enqueue-time only), and a third inlined in the decision-scheduler per CHANGELOG (explicitly authored because "no shared helper for this exact boundary existed" at the time) -- none currently gate the retry-release point.',
  ],
  detailed_analysis: JSON.stringify({
    staged_migration_verbatim_captured: true,
    quiet_window_implementations_found: 3,
    migration_apply_precedent: '20260713_periodic_process_registry_gha_source_and_state_anchor.sql',
  }),
  metadata: {
    files_identified: [
      'database/migrations/20260718_sms_outbound_obligations_STAGED.sql',
      'database/migrations/20260713_periodic_process_registry_gha_source_and_state_anchor.sql',
      'lib/notifications/resend-adapter.js',
      'scripts/cron/chairman-morning-review-sweep.mjs',
    ],
  },
  validation_mode: 'prospective',
  source: 'Explore',
  phase: 'LEAD',
  summary: 'Confirmed the exact STAGED migration schema and apply runbook Child A\'s PRD needs to cite verbatim, plus the precedent pattern for widening its status CHECK constraint safely pre-apply, and catalogued the 3 existing quiet-window implementations that need consolidating rather than a 4th ad-hoc copy.',
};

const { data: v, error: vErr } = await s.from('sub_agent_execution_results').insert(validationRow).select('id').single();
if (vErr) { console.log('VALIDATION EVIDENCE ERR:', vErr.message); process.exit(1); }
console.log('VALIDATION_EVIDENCE', v.id);

const { data: e, error: eErr } = await s.from('sub_agent_execution_results').insert(exploreRow).select('id').single();
if (eErr) { console.log('EXPLORE EVIDENCE ERR:', eErr.message); process.exit(1); }
console.log('EXPLORE_EVIDENCE', e.id);
