// One-shot RCA evidence writer for SD-FDBK-INFRA-TYPE-GAMING-DETECTION-001
// Schema: sub_agent_execution_results uses verdict / summary / detailed_analysis / recommendations / critical_issues / warnings
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const s = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: sdRow, error: lookupErr } = await s
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-FDBK-INFRA-TYPE-GAMING-DETECTION-001')
  .maybeSingle();

if (lookupErr || !sdRow) {
  console.error('SD lookup failed:', lookupErr?.message || 'not found');
  process.exit(1);
}

const summary =
  'Multi-witness defect cluster in /leo next + /leo start (session 35d3f159, 2026-05-09 ~23:30 UTC). ' +
  'Bugs 1+2 share a missing invariant (cancelled SDs MUST refuse claim — no guard in lib/claim-guard.mjs, ' +
  'lib/claim-validity-gate.js, or scripts/modules/claim-health/triangulate.js). Bug 3 is independent: ' +
  'is_working_on=true is written by 4 sites with no PG uniqueness AND no global cancellation sweep ' +
  '(13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001). Bug 1 (queue display) is a stale-render race ' +
  'window, not a code defect — displayTracks correctly filters cancelled. Tier-3 SD recommended; defer to a ' +
  'dedicated campaign-mode session given 3 parallel CC peers.';

const detailedAnalysis = {
  bugs: {
    bug1_queue_display:
      'Race window — cancellation at 23:32:28 UTC, /leo next render preceded. SDNextSelector.displayTracks (scripts/modules/sd-next/SDNextSelector.js:694) filters status IN (draft|active|in_progress|planning), correctly excluding cancelled. data-loaders.js:114 + fallback-queue.js:53 also exclude cancelled. NOT a queue-filter code defect.',
    bug2_claim_succeeded:
      'lib/claim-guard.mjs + lib/claim-validity-gate.js + scripts/modules/claim-health/triangulate.js contain ZERO sd.status===cancelled guards (verified via grep, 0 hits). claimGuard runs heartbeat/identity/triangulation checks but never refuses on terminal SD status. Pre-claim invariant missing.',
    bug3_multi_is_working_on:
      'is_working_on=true written by 4 live sites: lib/claim-guard.mjs:467, lib/drain-orchestrator.mjs:230, scripts/modules/handoff/executors/plan-to-exec/state-transitions.js:134, scripts/stale-session-sweep.cjs:1091/1099. NO PG uniqueness/CHECK constraint. cancel-sd.js:99-103 clears is_working_on for the cancelled SD only — no global sweep across stale rows. Two unrelated SDs carry stale flags: LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 (legit, my session) + EVA-SUPPORT-CLI-SKILL-ORCH-001-B (orphaned since 2026-05-02).'
  },
  five_whys: [
    { level: 1, q: 'Why was the cancelled SD claimable?', a: 'sd-start.js called claimGuard which had no terminal-status check.', evidence: 'grep status===cancelled in lib/claim-guard.mjs returns 0 hits' },
    { level: 2, q: 'Why does claimGuard not check terminal status?', a: 'It checks claim validity (heartbeat, identity, triangulation) but not SD state. Invariant "cancelled SDs cannot be claimed" never declared in claim path.', evidence: 'claim-guard.mjs + claim-validity-gate.js + triangulate.js: 0 cancelled guards' },
    { level: 3, q: 'Why was the invariant never declared?', a: 'Until QF-CANCEL-SD shipped today (PR #3625), no canonical cancellation path existed. Ad-hoc cancellation was rare and never bothered to interlock with the claim path.', evidence: 'scripts/cancel-sd.js Birth: 2026-05-09 16:02:27' },
    { level: 4, q: 'Why does cancellation+claim interlock matter now?', a: 'Canonical cancel-sd in flight + 96.9% cancellation rate from corrective-SD-generator (memory: SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001) means cancelled SDs are now a meaningful slice of state; race windows + stale displays will surface them more often.', evidence: 'memory: project_sd_suppress_corrective_generator_001' },
    { level: 5, q: 'Why is the writer/consumer asymmetry on is_working_on still open?', a: '4 writers each set is_working_on=true; only the cancellation path attempts to clear it, and only for the targeted SD. No PG-side single-true invariant, no shared canCarryWorkingOn helper, no global cancellation sweep. 13th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.', evidence: 'grep "is_working_on:.*true" returns 4 distinct writer sites; only cancel-sd clears, scoped to single SD' }
  ],
  root_cause:
    'Two independent missing invariants. (A) "Cancelled SDs MUST refuse claim" — not enforced at sd-start, claim-guard, claim-validity-gate, OR PG. (B) "is_working_on=true must be cleared on terminal status across ALL writer paths" — not enforced anywhere globally; cancel-sd.js clears it only for the cancelled SD.',
  classification: 'cross_cutting',
  category: 'cross_cutting',
  tier: 'Tier-3 SD',
  tier_rationale:
    'Bundle requires: claim-guard guard (~15 LOC) + claim-validity-gate guard (~10 LOC) + cancel-sd global is_working_on sweep (~20 LOC) + sd-start post-render re-check (~10 LOC) + PG trigger refusing UPDATE on cancelled SD (~30 LOC + migration) + 3 regression tests (~80 LOC). Estimated 80-120 src LOC + ~150 test LOC. Crosses 75 LOC Tier-2 ceiling. Risk keyword "claim" + DB migration → Tier-3 forced anyway.',
  pattern_witnesses: ['PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (13th witness for bug 3)'],
  experts_consulted: [
    {
      expert: 'inline_db_evidence_only',
      findings:
        'Time-boxed: skipped Task-tool expert spawn given strong direct DB evidence + user authorization to proceed autonomously in campaign mode. Direct queries to strategic_directives_v2 and grep across all writer/consumer sites provided sufficient evidence for high-confidence classification. The implementing SD should invoke database-agent at PLAN PRD-prospective for the PG-trigger CAPA design.',
      capa_items: ['PG trigger design needs database-agent at PLAN time']
    }
  ],
  mode_recommendation:
    'Defer fix to a dedicated campaign session. 3 parallel CC peers running per user note; cancellation cascade SD touches shared infra (claim-guard.mjs, cancel-sd.js, PG trigger) and is gravity-class — should run in isolated worktree without contention.',
  immediate_safe_action:
    'Manually clear is_working_on=true on EVA-SUPPORT-CLI-SKILL-ORCH-001-B (stale since 2026-05-02; single canonical UPDATE, gravity-safe). Leave LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 alone — it is the active session\'s legitimate claim and will release on session close.'
};

const recommendations = [
  { type: 'corrective', action: 'Add SD terminal-status refusal in claimGuard pre-acquire', file: 'lib/claim-guard.mjs', urgency: 'immediate' },
  { type: 'corrective', action: 'Add cancelled-status assertion in assertValidClaim', file: 'lib/claim-validity-gate.js', urgency: 'immediate' },
  { type: 'corrective', action: 'Extend cancel-sd.js with global is_working_on=false sweep across ALL claude_sessions for the cancelled SD + post-condition check', file: 'scripts/cancel-sd.js', urgency: 'immediate' },
  { type: 'corrective', action: 'Add post-render cancellation re-check in sd-start.js between sd lookup and claimGuard call', file: 'scripts/sd-start.js', urgency: 'next-session' },
  { type: 'corrective', action: 'Manual one-time DB UPDATE: clear is_working_on on EVA-SUPPORT-CLI-SKILL-ORCH-001-B (orphan since 2026-05-02)', file: 'database UPDATE', urgency: 'immediate-and-safe' },
  { type: 'preventive', control: 'PG trigger: REFUSE UPDATE setting claiming_session_id when status=cancelled', location: 'database/migrations/20260509_refuse_claim_on_cancelled.sql', kind: 'pg_trigger' },
  { type: 'preventive', control: 'Static guard test pinning all 4 is_working_on=true writers to import shared canCarryWorkingOn(sdRow) helper that refuses cancelled', location: '__tests__/static/working-on-writers.test.js', kind: 'static_test' },
  { type: 'preventive', control: 'Regression integration test: sd-start refuses cancelled SD with non-zero exit', location: '__tests__/sd-start-cancelled-refusal.test.js', kind: 'integration_test' },
  { type: 'preventive', control: 'Pattern-witness test: cancel-sd.js clears is_working_on for cancelled SD across all sessions, idempotent', location: '__tests__/cancel-sd-global-sweep.test.js', kind: 'integration_test' }
];

const criticalIssues = [
  'lib/claim-guard.mjs accepts claims on cancelled SDs (no terminal-status guard)',
  'lib/claim-validity-gate.js has no cancelled-status assertion',
  'cancel-sd.js does not perform global is_working_on sweep for the cancelled SD across other sessions',
  'No PG-layer invariant preventing claim acquisition on cancelled SDs (defense-in-depth gap)'
];

const warnings = [
  'Stale is_working_on=true on EVA-SUPPORT-CLI-SKILL-ORCH-001-B since 2026-05-02 (orphan from prior session)',
  'Bug 1 (queue display) is a stale-render-vs-mutation race — not a code defect; do NOT add a "fix" to the queue filter',
  'sd-next.js fatal: ambiguous argument origin/<branch>..HEAD already filed as feedback 4e008a5a (separate issue)',
  '13th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 — class is recurring; preventive control is now overdue'
];

const { data, error } = await s.from('sub_agent_execution_results').insert({
  sub_agent_code: 'RCA',
  sub_agent_name: 'rca-agent',
  sd_id: sdRow.id,
  phase: 'RCA',
  verdict: 'WARNING',
  confidence: 92,
  summary,
  detailed_analysis: detailedAnalysis,
  recommendations,
  critical_issues: criticalIssues,
  warnings,
  source: 'manual_rca_invocation',
  validation_mode: 'prospective',
  metadata: {
    session_id: '35d3f159-e7d8-4141-bb92-cdb6d8211684',
    invocation_date_utc: '2026-05-09T23:30:00Z',
    witnesses: [
      'SD-FDBK-INFRA-TYPE-GAMING-DETECTION-001 (cancelled SD that was claimable)',
      'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 (stale is_working_on, my session legit claim)',
      'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B (stale is_working_on since 2026-05-02, orphan)'
    ],
    related_memory: [
      'project_qf_cancel_sd_canonical (PR #3625 today)',
      'project_sd_suppress_corrective_generator_001_completed (96.9% cancellation rate)',
      'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (12 prior witnesses)'
    ],
    parallel_session_note: '3 parallel Claude Code sessions per user note; gravity-class change should defer to isolated campaign session',
    related_feedback: ['4e008a5a (sd-next git ambiguous-argument, separate)']
  }
}).select();

if (error) {
  console.error('INSERT ERR:', error.message);
  process.exit(1);
}
console.log('✓ sub_agent_execution_results row written:', data?.[0]?.id || '(ok)');
