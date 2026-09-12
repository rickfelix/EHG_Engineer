// Insert PRD for SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C (INLINE mode — scope narrowed at LEAD per
// Explore+VALIDATION evidence: 8/9 originally-named call sites are already fixed by the
// 2026-09-12 lifecycle-allowlist migration; the remaining fix is entirely within
// lib/quality/snooze-manager.js).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const s = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';

const { data: sd } = await s.from('strategic_directives_v2').select('id, sd_key, title').eq('sd_key', KEY).single();
const SD_UUID = sd.id;

const functional_requirements = [
  {
    id: 'FR-1', priority: 'critical',
    title: 'Fix lib/quality/snooze-manager.js to use only existing columns — NEVER write status',
    description: "REVISED after PLAN-TO-EXEC prospective TESTING review (evidence 2de37d89-7fb2-4ab3-a37e-8d7b8c531376) found the original status='backlog' design unimplementable (F1: bulk-wake cannot batch a per-row metadata merge in one UPDATE...IN(...) call) and semantically broken (F2: 'backlog' is not excluded by lib/quality/assist-engine.js's reader, so a snoozed item resurfaces in /leo assist immediately; F5: resnooze() would clobber the true original status). CORRECTED DESIGN: snoozing is a pure, orthogonal ADD-ON dimension. status is NEVER read or written by any of these 4 functions. Only snoozed_until (existing column) and metadata.snooze (existing JSONB column, holding {active, snoozed_at, snoozed_by, snooze_reason}) are touched. This eliminates the CHECK-constraint risk entirely (status is never touched, so 'snoozed'/'open' can never be written), eliminates the need to capture/restore a 'pre_snooze_status' (there is nothing to restore), and eliminates the bulk-wake per-row-metadata problem (waking only ever clears snoozed_until, a single scalar, safely batchable across many rows in one UPDATE...IN(...) call).",
    acceptance_criteria: [
      "snoozeFeedback(id, duration, opts) succeeds against the live schema, sets ONLY snoozed_until + metadata.snooze={active:true, snoozed_at, snoozed_by, snooze_reason} — status is read-modify-write UNCHANGED",
      "unsnoozeFeedback(id) succeeds, clears snoozed_until to null, sets metadata.snooze.active=false + unsnoozed_at — status is UNCHANGED",
      "wakeExpiredSnoozes() succeeds via one or more chunked UPDATE...WHERE id IN (...) calls setting ONLY snoozed_until=null + updated_at (no metadata write needed in the bulk path — a row with snoozed_until=null no longer matches any 'currently snoozed' read filter regardless of stale metadata)",
      "getSnoozedItems() filters on snoozed_until IS NOT NULL AND snoozed_until > now AND metadata.snooze.active=true, and supports the userId filter via metadata.snooze.snoozed_by (not the nonexistent snoozed_by column)",
      "resnooze(id, duration, opts) simply extends snoozed_until/refreshes the metadata.snooze fields — no clobber risk since status was never touched to begin with",
    ],
  },
  {
    id: 'FR-2', priority: 'critical',
    title: 'lib/quality/assist-engine.js loadInboxItems() must exclude an actively-snoozed item',
    description: "TESTING finding F2 (confirmed live): assist-engine.js's loadInboxItems() query filters .not('status','in','(resolved,wont_fix,shipped,snoozed,invalid)') but never checks snoozed_until, and 'snoozed' is a dead enum value (0 rows, ever) so that clause was already a no-op. Since FR-1's corrected design never changes status, a snoozed item's status is unchanged and it would resurface in /leo assist on the very next run unless this reader is also taught to respect snoozed_until. Add an additional filter excluding rows where snoozed_until is in the future.",
    acceptance_criteria: [
      "loadInboxItems() excludes any row with snoozed_until > now() (via an added .or('snoozed_until.is.null,snoozed_until.lte.<now>') clause or equivalent)",
      "a row with snoozed_until in the past (expired snooze, not yet woken) is NOT excluded — matches existing behavior for any other timestamp-based staleness",
      "the dead 'snoozed' status literal may be left in the exclude list harmlessly (0 rows ever use it) or removed as a documented no-op cleanup — either is acceptable, not both required",
    ],
  },
  {
    id: 'FR-3', priority: 'high',
    title: 'Preserve .claude/skills/inbox.md return-shape compatibility (back-compat fields)',
    description: "TESTING finding F4: .claude/skills/inbox.md's snoozed subcommand renders `item.snoozed_by` directly (line ~417) and the snooze/unsnooze subcommands read `result.title`, `result.status`, `result.snoozeInfo.snoozedUntil.toLocaleString()`. getSnoozedItems() must continue projecting snoozed_by (and snooze_reason) onto each returned item (sourced from metadata.snooze, not a real column) so the skill's existing render logic keeps working unmodified. snoozeInfo.snoozedUntil must remain a JS Date object (not an ISO string) since the skill calls .toLocaleString() on it directly. Both snoozeFeedback and unsnoozeFeedback must keep returning the full updated row via .select() so result.title/result.status remain populated.",
    acceptance_criteria: [
      "getSnoozedItems() output items include snoozed_by and snooze_reason fields projected from metadata.snooze (skill compatibility, not new real columns)",
      "snoozeFeedback()'s returned snoozeInfo.snoozedUntil is a Date instance",
      "snoozeFeedback()/unsnoozeFeedback() both still return the full row (title, status, etc.) via .select()",
    ],
  },
  {
    id: 'FR-4', priority: 'high',
    title: 'Regression tests proving the 8 already-fixed call sites actually work (verification only, no code change)',
    description: "scripts/modules/inbox/assist-runner.js, scripts/modules/inbox/auto-triage.js, scripts/modules/inbox/auto-resolve-recovered.js, scripts/chairman-decisions.mjs resolveFeedback(), and lib/quality/assist-engine.js's two shapes were confirmed working under the live 2026-09-12 allowlist migration via a live transactional probe (LEAD Explore evidence) and independently re-confirmed by the PLAN-phase TESTING probe. Add/confirm unit or integration tests asserting each of these 8 update shapes succeeds, so this child's '5 files verified, 0 code change' claim is backed by a committed, repeatable test rather than a one-time manual probe. TESTING found assist-runner.js and auto-triage.js currently have ZERO test files — this FR is greenfield for those two, not a confirm-existing pass.",
    acceptance_criteria: [
      "a test exists asserting each of the 8 already-working shapes succeeds",
      "no source change is made to these 5 files — verification only",
    ],
  },
  {
    id: 'FR-5', priority: 'medium',
    title: 'Tests for the corrected snooze-manager.js fix',
    description: "Unit tests for snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes/getSnoozedItems/resnooze covering: successful snooze without touching status; unrelated metadata keys survive a snooze/unsnooze round-trip (TR-2); wakeExpiredSnoozes bulk-clears snoozed_until across multiple rows in one batched call; getSnoozedItems excludes an assist-engine-shaped row (status=backlog+snoozed_until, no metadata.snooze marker); the userId filter works via the metadata path; back-compat snoozed_by/snooze_reason projection (FR-3); assist-engine.js's loadInboxItems excludes an actively-snoozed row (FR-2).",
    acceptance_criteria: [
      "tests/unit covering all 5 functions in snooze-manager.js pass",
      "a test explicitly asserts assist-engine.js's loadInboxItems() excludes an actively-snoozed row",
    ],
  },
];

const technical_requirements = [
  { id: 'TR-1', description: 'No DDL, no new columns, no CHECK-constraint change, and status is NEVER written or read by any function in this file — eliminating the CHECK-constraint risk entirely rather than merely avoiding invalid literal values. Only snoozed_until (existing column) and metadata (existing JSONB column) are touched — both confirmed lifecycle-exempt under the live feedback_no_update WHEN clause via a live rolled-back probe.' },
  { id: 'TR-2', description: 'metadata.snooze must be merged (read-then-write), never a bare overwrite, so unrelated metadata keys on the same row survive a snooze/unsnooze round-trip (single-row operations only — snoozeFeedback/unsnoozeFeedback/resnooze — never the bulk wakeExpiredSnoozes path, which does not need to touch metadata at all per FR-1).' },
  { id: 'TR-3', description: "wakeExpiredSnoozes() bulk-wake issues chunked UPDATE...WHERE id IN (...) calls (mirrors the existing UPDATE_CHUNK=200 batching) setting ONLY snoozed_until=null + updated_at — a single scalar value safely shared across every row in a chunk, unlike the rejected per-row-metadata design." },
];

const test_scenarios = [
  { id: 'TS-1', scenario: 'snoozeFeedback on a row with an arbitrary pre-existing status and unrelated metadata keys', expected: 'snoozed_until set, metadata.snooze={active:true,...} added, status UNCHANGED, unrelated metadata keys survive' },
  { id: 'TS-2', scenario: 'unsnoozeFeedback on that row', expected: 'snoozed_until cleared to null, metadata.snooze.active=false, status still UNCHANGED throughout' },
  { id: 'TS-3', scenario: 'wakeExpiredSnoozes with several expired rows in one chunk', expected: 'one batched UPDATE...IN(...) call clears snoozed_until for all of them; woken=N; no metadata write needed or attempted' },
  { id: 'TS-4', scenario: 'getSnoozedItems against a mixed table containing both a snooze-manager row (snoozed_until set + metadata.snooze.active=true) and an assist-engine this_week row (status=backlog+snoozed_until, no metadata.snooze)', expected: 'only the snooze-manager row is returned' },
  { id: 'TS-5', scenario: 'wakeExpiredSnoozes against the same mixed table, both rows expired', expected: "only the snooze-manager row's snoozed_until is cleared; the assist-engine row (no active marker) is untouched" },
  { id: 'TS-6', scenario: 'getSnoozedItems with a userId filter', expected: 'filters via metadata.snooze.snoozed_by, not the nonexistent snoozed_by column' },
  { id: 'TS-7', scenario: 'Live/mocked-trigger regression for the 8 already-fixed shapes (assist-runner.js, auto-triage.js, auto-resolve-recovered.js, chairman-decisions.mjs resolveFeedback, assist-engine.js x2)', expected: 'all 8 UPDATE payloads succeed with zero source changes' },
  { id: 'TS-8', scenario: 'assist-engine.js loadInboxItems() with a row whose snoozed_until is in the future', expected: 'row is excluded from the returned items' },
  { id: 'TS-9', scenario: 'assist-engine.js loadInboxItems() with a row whose snoozed_until is in the past (expired, not yet woken)', expected: 'row is NOT excluded (behaves as if not snoozed)' },
  { id: 'TS-10', scenario: 'getSnoozedItems()/skill-rendering compatibility', expected: 'returned items include projected snoozed_by/snooze_reason fields and snoozeInfo.snoozedUntil is a Date instance (not a string)' },
];

const risks = [
  { risk: 'A future feature reuses snoozed_until for an unrelated purpose without checking metadata.snooze, causing a collision symmetric to the one this SD found in reverse', impact: 'low', likelihood: 'low', mitigation: 'TR-1/FR-1 document the metadata.snooze marker as the authoritative "is this an active snooze-manager snooze" signal; a future author sharing snoozed_until must check it, mirroring the lesson this SD encodes.' },
  { risk: 'lib/chairman/chairman_all_decision_signals (a DB view feeding the chairman queue) does not exclude snoozed critical/high-severity rows -- confirmed by PLAN-phase TESTING (finding F3, 404 currently-snoozeable critical/high rows)', impact: 'medium', likelihood: 'medium', mitigation: 'OUT OF SCOPE for this child -- it is a shared DB view (not one of the 6 originally-named files), any change is schema-adjacent and high blast radius across every other feature reading that view, and deserves its own dedicated review rather than a rider on this bugfix. Filed as a separate follow-up finding for the parent orchestrator / a new QF, not silently dropped.' },
  { risk: 'A legacy row snoozed by a hypothetical prior version of this code (before the fix) has no metadata.snooze marker and would not be found by the corrected getSnoozedItems/wakeExpiredSnoozes', impact: 'none', likelihood: 'certain', mitigation: 'Live-measured: 0 of 38,184 feedback rows have ever had status=\'snoozed\' or a successful write from this mechanism (LEAD Explore evidence) — there is no legacy population to migrate.' },
];

const system_architecture = {
  overview: 'Fix confined to two files: lib/quality/snooze-manager.js (the actual defect — 3 nonexistent columns + 2 invalid status enum values) and lib/quality/assist-engine.js (a one-clause read-filter addition so the fix actually has effect end-to-end). Snoozing is redesigned as a pure, orthogonal add-on using only snoozed_until (existing column) + metadata.snooze (existing JSONB column) — status is never read or written by the snooze mechanism, eliminating the CHECK-constraint risk entirely rather than merely avoiding specific invalid literals.',
  components: [
    { name: 'lib/quality/snooze-manager.js', role: 'FIXED: snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes/getSnoozedItems/resnooze rewritten to touch only snoozed_until + metadata.snooze, never status.' },
    { name: 'lib/quality/assist-engine.js', role: 'loadInboxItems() gains one additional filter clause excluding rows with a future snoozed_until, so /leo assist actually respects an active snooze. Its own write shapes (already confirmed working) are unchanged.' },
    { name: '.claude/skills/inbox.md', role: 'UNCHANGED (consumer only) — the /inbox snooze|unsnooze|snoozed subcommands call snooze-manager.js functions by name via inline node -e snippets; FR-3 preserves the exact return shape (Date objects, projected snoozed_by/snooze_reason fields) these snippets depend on.' },
  ],
  data_flow: '/inbox snooze <id> <duration> -> snoozeFeedback() -> UPDATE feedback SET snoozed_until=<computed>, metadata=<merged with snooze marker> (status untouched) -> succeeds under the live allowlist trigger. /leo assist -> loadInboxItems() now excludes any row with a future snoozed_until. /inbox snoozed -> getSnoozedItems() -> SELECT WHERE snoozed_until>now AND metadata.snooze.active=true. A scheduled wakeExpiredSnoozes() pass bulk-clears snoozed_until (no status/metadata restoration needed, since neither was ever changed by the snooze).',
};

const prd = {
  id: `PRD-${KEY}`,
  directive_id: KEY,
  sd_id: SD_UUID,
  title: `Product Requirements for ${KEY}`,
  version: '1.0',
  status: 'planning',
  category: 'Infrastructure',
  priority: 'medium',
  phase: 'PLAN',
  executive_summary: "LEAD Explore+VALIDATION evidence found the child's original scope (6 files, 9 feedback.update() call sites believed broken by the append-only trigger) was stale: the chairman-approved lifecycle-allowlist migration (applied 2026-09-12, between the original audit and this LEAD evaluation) already fixed 8 of 9 sites with zero code change. The one remaining genuine defect, lib/quality/snooze-manager.js, is broken for reasons independent of the trigger (3 nonexistent columns, 2 invalid status enum values) and is a LIVE entry point via .claude/skills/inbox.md's snooze/unsnooze/snoozed commands, not dead code. A PLAN-phase prospective TESTING review (evidence 2de37d89) then found the initial status='backlog' fix design unimplementable and semantically broken (would let a snoozed item immediately resurface in /leo assist). REVISED DESIGN: snoozing becomes a pure, orthogonal add-on using only snoozed_until + a metadata.snooze marker — status is never touched by the snooze mechanism at all, eliminating the CHECK-constraint risk entirely — plus a one-clause read-filter addition in lib/quality/assist-engine.js so the fix has real end-to-end effect. No migration required.",
  business_context: "Parent orchestrator SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001 exists to close every feedback.update() call site broken by the 2026-09-08 append-only trigger. Sibling Child G already established the precedent of re-scoping after the allowlist migration landed mid-audit rather than treating the original (now-partially-stale) audit as gospel. This child follows the same pattern: verify against current main, narrow scope to what is actually still broken, and fix the ONE genuine, live, user-facing defect (a completely non-functional /inbox snooze feature) with the smallest correct change.",
  technical_context: 'No DDL. Fix confined to lib/quality/snooze-manager.js (touches only snoozed_until + metadata, never status) and one read-filter clause in lib/quality/assist-engine.js — both already proven lifecycle-exempt / low-risk under the live trigger.',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria: functional_requirements.flatMap(fr => fr.acceptance_criteria),
  risks,
  system_architecture,
  implementation_approach: '(1) Rewrite snoozeFeedback/unsnoozeFeedback/wakeExpiredSnoozes/getSnoozedItems/resnooze in lib/quality/snooze-manager.js to touch only snoozed_until + metadata.snooze marker, never status; (2) add one snoozed_until exclusion clause to lib/quality/assist-engine.js loadInboxItems(); (3) add unit tests for both files including the assist-engine-exclusion and skill-compatibility cases; (4) add/confirm regression tests for the 8 already-fixed shapes across the other 5 files (verification only, no source change); (5) full regression on touched files. Target <=100 LOC source diff.',
  dependencies: ['database/chairman-gated/20260912_feedback_no_update_lifecycle_allowlist.sql (applied, chairman decision ba4055b7) — the prerequisite that made 8/9 originally-named sites already-working'],
  constraints: ['No migration/schema change', 'status is never read or written by the snooze mechanism', 'the chairman_all_decision_signals view (F3, snoozed critical/high rows still surface in the chairman queue) is explicitly OUT OF SCOPE for this child — filed as a separate follow-up, not silently dropped'],
  assumptions: ['No legacy population of successfully-snoozed rows exists to migrate (0 of 38,184 feedback rows have ever had status=\'snoozed\', per LEAD Explore evidence)'],
  metadata: {
    scope_narrowed_at_lead: true,
    lead_explore_evidence_id: 'f3afbd9d-47db-475f-aa25-ff8e609a8a11',
    lead_validation_evidence_id: 'ab9b70a1-18f0-4191-bc04-26b48859029e',
    plan_testing_evidence_id: '2de37d89-7fb2-4ab3-a37e-8d7b8c531376',
    original_scope_files_verified_no_change_needed: [
      'scripts/modules/inbox/assist-runner.js',
      'scripts/modules/inbox/auto-resolve-recovered.js',
      'scripts/modules/inbox/auto-triage.js',
      'scripts/chairman-decisions.mjs',
    ],
    followup_out_of_scope_finding: 'lib/chairman/chairman_all_decision_signals (DB view) does not exclude snoozed critical/high-severity feedback rows — 404 currently-snoozeable rows measured live 2026-09-12. Needs its own SD/QF given shared-view blast radius.',
  },
};

const { data: existing } = await s.from('product_requirements_v2').select('id').eq('directive_id', KEY).maybeSingle();
let result;
if (existing) {
  result = await s.from('product_requirements_v2').update(prd).eq('directive_id', KEY).select('id').single();
} else {
  result = await s.from('product_requirements_v2').insert(prd).select('id').single();
}
if (result.error) { console.log('PRD INSERT ERROR:', JSON.stringify(result.error)); process.exit(1); }
console.log('PRD_ID', result.data.id);
