#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 — Explore breadth search at LEAD-TO-PLAN.
 *
 * Read-only pass over scripts/michael/ (44 entries, confirming the SD's own "capability is an
 * absence" premise), the two house patterns the pre-build security review cited
 * (rule-encode.mjs, todoist-act.mjs), lib/michael/db.mjs (the shared verb seam), the michael_*
 * table conventions in database/migrations/20260906_michael_tables.sql, and the fleet-lane
 * messaging provider (lib/messaging/providers/twilio-provider.js) that FR-3 says must NOT be
 * shared with Michael's new identity.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: 'Read-only breadth pass confirming: (1) no sending capability exists today at the Michael seat (matches the SD\'s "absence, not a blocked build" premise), (2) the two house patterns the pre-build security review cited are real, read-in-full, and directly reusable, (3) the shared verb seam (lib/michael/db.mjs) and the michael_* table conventions the new ledger/config tables should follow, (4) the concrete FR-3 hazard: lib/messaging/providers/twilio-provider.js reads TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_MESSAGING_SERVICE from process.env at call time (accountSid()/authToken()/messagingService() helper functions) -- these are the SAME process-global values the Adam/fleet chairman-SMS gate uses, so reusing this exact module for Michael would mean any revocation of Michael\'s send capability (unsetting these vars) also silently kills Adam\'s chairman-SMS sends. FINDING 1: scripts/michael/ contains 44 entries (matching the ratification\'s own count) and zero of them call an SMS/email transport -- grepped for the usual send call shapes (twilio, sendSms, provider.send, nodemailer) across the directory: no matches. Confirms the ratification\'s premise directly rather than trusting it. FINDING 2: scripts/michael/todoist-act.mjs (read in full) is the clearest FR-pattern match: closed VERBS enumeration (line 19), a preflight read of the recording table BEFORE the external call (lines 73-77, explicitly there so an unapplied migration never yields an unrecorded mutation -- the exact FR-1/FR-6 shape needed), content stored as sha256+length never verbatim (redactCall, lines 27-33, SEC-M3), dry-run-by-default via an explicit --dry-run flag returning before any external call (line 69). scripts/michael/rule-encode.mjs (not yet read in full by this pass; flagged for PLAN to read directly) is cited by the review for "gate before any flip, a provenance row per write" -- the FR-5 enable/disable shape. FINDING 3: lib/michael/db.mjs is the one seam every verb reads/writes michael_* through -- createMichaelClient() (service-role only), readRows()/writeRows() with a shared isMissingRelation() classifier (42P01/PGRST205/COUNT_UNMEASURABLE) so an unapplied migration returns {tables_absent:true} or a named refusal rather than throwing, a bounded READ_LIMIT=500 (count-truncation-diff-lint enforces this), parseArgs() (repeated-flag becomes array, QF-20260907-847), refusal()/emit() envelope helpers. The new checkpoint-send verb should be built on this exact seam, not a new one. FINDING 4: database/migrations/20260906_michael_tables.sql\'s 11 tables share one shape -- RLS enabled, a single service_role-only ALL policy, REVOKE ALL FROM anon/authenticated/PUBLIC, a BEFORE UPDATE updated_at trigger via the shared michael_set_updated_at() function, a natural-key UNIQUE INDEX, and a COMMENT ON TABLE citing the authorizing SD. michael_feedback_ledger (one row per et_date) and michael_todoist_snapshot (mutations_applied JSONB array, a *_at revoke-signal column) are the two closest shape-precedents for the new checkpoint-send ledger. FINDING 5 (the FR-3 hazard, confirmed by direct read): lib/messaging/providers/twilio-provider.js\'s accountSid()/authToken()/messagingService() functions (lines 17-19) read process.env.TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_MESSAGING_SERVICE directly at call time -- there is no per-caller identity parameter. This module (or the fleet lane\'s use of it, e.g. Adam\'s chairman-sms-gate) is exactly what FR-3 forbids Michael from importing directly; Michael needs either a parallel provider module reading distinctly-named env vars, or a parameterized identity argument threaded through send(). No such parallel module or parameter exists today -- this is new work, matching the SD\'s own "CHAIRMAN-GATED DEPENDENCY... none exists today" claim.',
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'MEDIUM',
      issue: 'No parallel Michael-scoped messaging provider or identity-parameterization exists yet; the shared twilio-provider.js reads fleet-lane env vars unconditionally',
      evidence: 'lib/messaging/providers/twilio-provider.js:17-19 (accountSid/authToken/messagingService read process.env.TWILIO_* directly, no identity parameter); this is the exact sharing FR-3 prohibits.',
      location: 'lib/messaging/providers/twilio-provider.js:17-19',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'rule-encode.mjs (the FR-5 gate-before-flip pattern the security review cited) was located but not read in full by this Explore pass -- PLAN should read it directly before designing the enable/disable row.',
      evidence: 'scripts/michael/rule-encode.mjs exists in the 44-entry directory listing; not opened this pass.',
      location: 'scripts/michael/rule-encode.mjs',
    },
  ],
  recommendations: [
    'PLAN: build the new verb on lib/michael/db.mjs\'s existing seam (createMichaelClient/readRows/writeRows/parseArgs/refusal/emit) rather than a new one, mirroring todoist-act.mjs\'s shape exactly (VERBS enumeration, preflight-before-external-call, redact-never-verbatim, dry-run-by-default).',
    'PLAN: design the new ledger table and the enable/disable row on the database/migrations/20260906_michael_tables.sql conventions (RLS service_role-only policy, updated_at trigger, natural-key unique index, COMMENT citing this SD) -- michael_feedback_ledger and michael_todoist_snapshot are the closest shape precedents.',
    'PLAN: resolve FR-3 with either (a) a new lib/messaging/providers/twilio-provider-michael.js reading MICHAEL_TWILIO_* env vars (distinct names, zero overlap with TWILIO_*), or (b) a parameterized identity argument on the existing provider -- (a) is the smaller, safer diff and matches how process-global env-var isolation is usually done in this codebase.',
    'PLAN: read scripts/michael/rule-encode.mjs in full before finalizing the FR-5 enable/disable row design (flagged, not yet read this pass).',
    'EXEC: the chairman-gated dependency (new env var names for the Michael-scoped Twilio identity) does not block build/test -- the existing provider\'s own fail-closed-when-unset behavior (lines 51-55) is the same shape the new module should follow, so dry-run/fail-closed testing (EXIT PREDICATE) is fully achievable without live credentials.',
  ],
  detailed_analysis: {
    searched_identifiers: ['twilio', 'sendSms', 'provider.send', 'nodemailer', 'createMichaelClient', 'readRows', 'writeRows', 'redactCall', 'VERBS', 'isMissingRelation', 'michael_set_updated_at'],
    searched_paths: ['scripts/michael/', 'lib/michael/db.mjs', 'scripts/michael/todoist-act.mjs', 'database/migrations/20260906_michael_tables.sql', 'lib/messaging/providers/twilio-provider.js'],
    cross_check: 'Independently confirms the SD description\'s own claim ("44 entries under scripts/michael/, zero senders by grep") rather than trusting it — this pass re-ran the same class of grep and got the same zero-match result.',
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/sd-leo-infra-michael-tier2-checkpoint-send-001-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
