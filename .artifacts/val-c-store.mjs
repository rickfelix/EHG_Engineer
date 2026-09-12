import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_UUID = '30a5f9e6-fa6c-47d2-abfc-5639745010f3';
const SD_KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data: subAgent } = await supabase.from('leo_sub_agents').select('*').eq('code', 'VALIDATION').maybeSingle();

const findings = [
  {
    id: 'V-1', severity: 'info',
    title: 'Claims 1-5 CONFIRMED: 8 of 9 call sites need zero code change',
    detail: 'Live trigger read via pg_get_triggerdef: feedback_no_update is BEFORE UPDATE ... WHEN (title|description|category|type|feedback_type|original_type|source_*|provenance_source|command|environment|page_url|use_case|error_*|stack_trace|user_id|venture_id|created_at|first_seen|sentry_*|severity|effort_estimate|value_estimate|votes|converted_at|conversion_reason|ignore_pattern|rubric_score|quality_assessment|auto_correction_status|corrective_class|source_gate|gate_run_id|sd_id), tgenabled=A. The allowlist migration IS live; file state was NOT trusted because its header still reads "Chairman verification NOT yet obtained" (a ceremony marker, not apply state). Verified per site: assist-runner.js:126-133 (ai_triage_classification/confidence/source, updated_at); auto-resolve-recovered.js:116-119 (status, resolution_type, resolution_notes, resolved_at, updated_at); auto-triage.js:176-183 (same 4 as assist-runner); chairman-decisions.mjs:195-197 (status, resolved_at, resolution_notes, resolution_type); assist-engine.js:644-663 (metadata, updated_at); assist-engine.js:752-786 (updated_at, status in {in_progress,backlog,wont_fix}, snoozed_until, resolution_notes). NONE of these columns appear in the WHEN clause.'
  },
  {
    id: 'V-2', severity: 'info',
    title: 'LEAD correction on site 4 is CORRECT: resolution_type, not type',
    detail: 'chairman-decisions.mjs:196 literally writes resolution_type:"chairman_decision". Bare `type` IS in the WHEN clause and would still be blocked; resolution_type is not. The original 2026-09-12 audit description said "type" - that was wrong. Reachability also confirmed: the writers{} map (L137) is dispatched dynamically via routeDecision(parsed, writers) at L297, so resolveFeedback IS live despite having no by-name caller.'
  },
  {
    id: 'V-3', severity: 'high',
    title: 'Claim 6 mechanism CONFIRMED: snooze-manager.js is broken independently of the trigger',
    detail: 'information_schema.columns on public.feedback: only snoozed_until exists. snoozed_at, snoozed_by, snooze_reason DO NOT EXIST. pg_get_constraintdef(feedback_status_check) allows exactly {new,triaged,in_progress,resolved,wont_fix,duplicate,invalid,backlog,shipped} - neither "snoozed" nor "open" is a member. Both failure modes fire before/independently of feedback_no_update.'
  },
  {
    id: 'V-4', severity: 'high',
    title: 'REFUTES the LEAD "genuinely dead code / nothing invokes these" claim',
    detail: '.claude/skills/inbox.md IS a live invocation path: L345-352 calls snoozeFeedback (/inbox snooze <id> <duration>), L373-379 calls unsnoozeFeedback (/inbox unsnooze <id>), L399-403 calls getSnoozedItems (/inbox snoozed), each via a node -e snippet the skill instructs the agent to run. docs/reference/research/quality-lifecycle-100-percent-completion-plan.md:79 records "snooze-manager.js converted to ESM and wired to /inbox skill" as done. The LEAD search covered scripts/ lib/ api/ server/ src/ pages/ but NOT .claude/skills/ - a search-scope gap. Correct characterisation is BROKEN USER-FACING ENTRY POINT, not dead code. ATTEMPTED, not assumed: `require("./lib/quality/snooze-manager.js")` SUCCEEDS on Node 24 (require(esm) support; the module has no top-level await), returning all 8 exports. So the skill path loads cleanly and genuinely reaches the DB call, where it then throws. The entry point is live end-to-end up to the defect - it is not insulated by a module-loading failure.'
  },
  {
    id: 'V-5', severity: 'medium',
    title: 'Two failure modes the LEAD summary mis-stated or missed',
    detail: '(a) wakeExpiredSnoozes (L169-209) never REACHES its UPDATE: the read filters .eq("status","snoozed") which can never match, so it early-returns {woken:0}. It is a silent zero-yield no-op, NOT a constraint-violation thrower. (b) getSnoozedItems (L218-251) is a 4th broken function the scope omits: .eq("status","snoozed") always returns [] and .eq("snoozed_by", userId) references a non-existent column. So 4 functions are broken (snooze/unsnooze/wake/getSnoozed), not 3, and two of them fail SILENTLY rather than loudly.'
  },
  {
    id: 'V-6', severity: 'info',
    title: 'Live row census corroborates total deadness of the affordance',
    detail: 'SELECT over public.feedback (38,184 rows): status=snoozed -> 0 rows; snoozed_until IS NOT NULL -> 1 row. That single row comes from chairman-decisions.mjs:247, an INSERT, not from snoozeFeedback. No row has ever been snoozed through this module - independently corroborating lib/chairman/decision-disposition.mjs:34.'
  },
  {
    id: 'V-7', severity: 'medium',
    title: 'The drift was known and SILENCED, not unknown',
    detail: 'lib/quality/snooze-manager.js:99 carries an inline "schema-lint-disable-line: pre-existing snoozed_at/snoozed_by/snooze_reason columns" suppression. The schema linter DID catch this and was disabled at the call site. This is the likely reason QF-20260912-253 "exhaustive grep" missed this 4th site of its own defect class.'
  },
  {
    id: 'V-8', severity: 'info',
    title: 'GATE 1 duplicate check: no duplicate SD/QF; one near-sibling',
    detail: 'strategic_directives_v2: only SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C matches snooze/snoozed_at/snooze-manager. quick_fixes: no QF targets snooze-manager.js. NEAR-SIBLING = QF-20260912-253 (status=completed): "3 feedback.update() call sites write columns that do not exist in public.feedback (assigned_at, assignment_reason, priority_reasoning, burst_group_id, ignored_by_pattern_id, ignore_reason)" covering triage-engine.js x2 + ignore-patterns.js x1. snooze-manager.js is a 4th site of that EXACT defect class that QF-253 missed. Not a duplicate - the scope-sibling whose chosen remedy the fix should mirror. QF-20260912-316 (burst-detector title mutation) is a different class (genuinely content, correctly still rejected).'
  },
  {
    id: 'V-9', severity: 'medium',
    title: 'Additional live DB machinery any fix must respect',
    detail: 'Two further triggers on public.feedback beyond the three append-only ones: trg_log_feedback_resolution_violation (BEFORE INSERT OR UPDATE, tgenabled=O, logs resolved-missing-reference / wont_fix-missing-notes / duplicate-invalid-reference) and trigger_update_feedback_updated_at (BEFORE UPDATE, auto-sets updated_at). Relevant CHECK constraints: chk_feedback_terminal_resolution, chk_resolved_requires_reference, chk_wont_fix_requires_notes. LATENT pre-existing risk (trigger-independent, out of this SD scope): chairman-decisions.mjs resolveFeedback(id, status, note) will violate chk_wont_fix_requires_notes if ever invoked with status=wont_fix and a null/empty note.'
  },
  {
    id: 'V-10', severity: 'info',
    title: 'Sibling precedent favours re-scope over cancel',
    detail: 'Child G completed 2026-09-12T12:01Z, AFTER the allowlist applied at 10:53Z, facing the identical "trigger no longer blocks my sites" situation. It did NOT no-op and did NOT cancel: it re-scoped to the genuine residual defects in its own file set and shipped lib/uat/risk-router.js, scripts/adversarial-verification-sweep.mjs, scripts/clockwork/prod-error-sweep-loop.cjs, scripts/corrective-triage.mjs + 4 unit tests + CHANGELOG (PR #8756), plus a LEAD-phase evidence script scripts/one-off/audit-fix-feedback-001-g-lead-explore-evidence.mjs. Child B was cancelled 12:07Z with NO recorded rationale (no handoffs, no retro, no cancellation_reason in metadata) - a governance gap, and weak precedent in either direction.'
  },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 92,
  phase: 'LEAD',
  findings,
  critical_issues: [],
  message: 'Scope narrowing to lib/quality/snooze-manager.js is SUPPORTED by independent verification. 8 of 9 call sites confirmed already-fixed by the live allowlist trigger (zero code change). The 9th file is genuinely broken, but the SD narrative needs two corrections: it is a LIVE /inbox skill entry point (not dead code), and 4 functions are broken (not 3), two of them silently.',
  recommendations: [
    'NARROW scope to lib/quality/snooze-manager.js only. Formally record the other 5 files / 8 sites as VERIFIED-NO-CHANGE with the live pg_get_triggerdef read as evidence, so the orchestrator keeps coverage accounting instead of them reading as unaudited.',
    'KEEP AS AN SD, do not downgrade to a Quick-Fix, and follow Child G precedent (re-scope, do not cancel). The fix is not a column rename: it requires three real design decisions - (i) what status value represents snoozed given feedback_status_check has neither "snoozed" nor "open" (reuse backlog+snoozed_until as assist-engine already does, vs. a CHECK-constraint migration to add enum values), (ii) whether snoozed_at/snoozed_by/snooze_reason are dropped or folded into metadata, (iii) whether the wake/list read paths are repaired in the same change. Decision (i) touches a CHECK constraint = schema risk keyword = Tier 3.',
    'CONDITIONAL: if PLAN settles on the no-migration option (status=backlog + snoozed_until + metadata, existing columns only) the change is ~40 LOC in one file and legitimately Tier 2 QF-sized. LEAD may downgrade at that point - but only AFTER the design decision is recorded, not before it.',
    'EXPAND scope by one file: .claude/skills/inbox.md must be fixed in the same change. It is the only live caller and it is broken twice over (calls functions that throw, and uses require() against an ESM module). Fixing snooze-manager.js alone leaves the user-facing /inbox snooze|unsnooze|snoozed commands still broken.',
    'ADD getSnoozedItems and wakeExpiredSnoozes to the FR list. The SD currently names 3 UPDATE sites; there are 4 broken functions, and the two read-path failures (always-empty result, non-existent snoozed_by filter) fail silently, which is why this went unnoticed for so long.',
    'Mirror QF-20260912-253 chosen remedy for the non-existent-column class so the two fixes stay consistent; cross-reference it in the PRD since snooze-manager.js is the 4th site of that QF own defect class.',
    'Acceptance test must be behavioural, not existential: assert a real snooze round-trip (snooze -> appears in getSnoozedItems -> wakeExpiredSnoozes actually wakes it) against the live CHECK constraint. The current 0-of-38,184 row census is the baseline to beat.',
  ],
  metadata: {
    phase: 'LEAD',
    sd_key: SD_KEY,
    validation_gate: 'GATE_1_LEAD_PRE_APPROVAL',
    duplicate_check: 'PASS_no_duplicate_sd_or_qf',
    near_sibling_qf: 'QF-20260912-253',
    claims_confirmed: ['1', '2', '3', '4', '5a', '5b', '6-mechanism'],
    claims_refuted: ['6-dead-code-claim'],
    supersedes: 'ab9b70a1-18f0-4191-bc04-26b48859029e',
    supersede_reason: 'V-4 in the superseded row asserted an unverified secondary defect (require() on ESM would fail). Attempted it: require() SUCCEEDS on Node 24. Claim withdrawn and replaced with the measured result.',
    live_probe: {
      method: 'pg_get_triggerdef + pg_get_constraintdef + information_schema.columns + row census via SUPABASE_POOLER_URL (read-only)',
      trigger_feedback_no_update: 'live, WHEN-clause present, tgenabled=A',
      snooze_columns_present: ['snoozed_until'],
      snooze_columns_missing: ['snoozed_at', 'snoozed_by', 'snooze_reason'],
      feedback_status_check_allowed: ['new', 'triaged', 'in_progress', 'resolved', 'wont_fix', 'duplicate', 'invalid', 'backlog', 'shipped'],
      row_census: { total: 38184, status_snoozed: 0, snoozed_until_not_null: 1 },
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase,
});
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_UUID, subAgent, results, { phase: 'LEAD', sdKey: SD_KEY });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
