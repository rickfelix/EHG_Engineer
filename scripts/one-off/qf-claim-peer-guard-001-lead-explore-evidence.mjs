#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001, LEAD-TO-PLAN phase.
 *
 * Records the LEAD-phase discovery work: confirmed the QF branch of claim_sd() lacks the
 * live-foreign-peer guard the SD branch has (SD-LEO-FIX-CLAIM-RPC-REFUSE-001), confirmed the
 * live production function definition to anchor the fix migration against, confirmed the
 * quick_fixes.started_at gap, enumerated all claim_sd callers for QF ids, and confirmed the
 * live-DB integration test pattern to follow.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001';

const findings = [
  {
    id: 'live-function-anchor-confirmed',
    severity: 'INFO',
    summary: 'The initially-assumed anchor migration (20260704_claim_sd_client_gate_version.sql) is NOT the live claim_sd() definition — two newer applied migrations exist on top of it (20260712_claim_sd_claim_switch_clobber_guard.sql, 20260717_claim_sd_phantom_session_guard.sql, both @approved-by: codestreetlabs@gmail.com) plus one STAGED-ONLY unapplied migration (20260816_claim_sd_tier_check.sql, chairman-gated, SD-only scope per its own header). The live production function is 20260717_claim_sd_phantom_session_guard.sql — confirmed by full read. The fix migration in this SD (20260828_claim_sd_qf_live_peer_guard.sql) is layered on top of 20260717 with the full body preserved verbatim, matching repo convention (every guard addition is its own dated CREATE OR REPLACE migration, never an in-place edit of a prior one).',
  },
  {
    id: 'qf-branch-live-peer-guard-gap-confirmed',
    severity: 'HIGH',
    summary: 'Confirmed: for the SD branch (v_is_qf=FALSE), claim_sd() captures v_sd_claiming_id + v_sd_claim_hb_age (strategic_directives_v2.claiming_session_id + its session heartbeat age) and refuses the claim with error=claimed_by_live_peer when that claimant is a still-live foreign session — added by SD-LEO-FIX-CLAIM-RPC-REFUSE-001 to close the drift_recovery stomp path. For the QF branch (v_is_qf=TRUE), quick_fixes.claiming_session_id is read ONLY for the terminal-status check and is never checked against a live session before a second claimer can take over — so a QF whose claiming_session_id names a still-live peer (whose own claude_sessions.sd_key has since drifted away) can be silently claimed out from under it. Fix mirrors the SD-side guard variable-for-variable (new v_qf_claiming_id / v_qf_claim_hb_age locals, new guard block with identical condition/message/return shape, QF-specific wording).',
  },
  {
    id: 'started-at-stamp-gap-confirmed',
    severity: 'MEDIUM',
    summary: 'quick_fixes.started_at (database/migrations/20251117_create_quick_fixes_table.sql:46) is stamped exactly once, at QF creation time, by scripts/create-quick-fix.js:640 (`.update({ claiming_session_id: creatorSessionId, started_at: new Date().toISOString() })`) — but ONLY when the creator auto-claims their own new QF at creation. claim_sd()\'s QF UPDATE branch (the normal claim path used by scripts/qf-start.js for every other claim, including a fresh claim on a QF the creator did NOT self-claim) never touches started_at, so it stays NULL for that common path. scripts/read-quick-fix.js:141-142 displays "Started:" conditionally on qf.started_at being truthy — today silently blank for RPC-claimed QFs. Fix: `started_at = COALESCE(started_at, NOW())` in the QF UPDATE, preserving the original start time across any later takeover/re-claim rather than resetting it.',
  },
  {
    id: 'claim-sd-qf-callers-enumerated',
    severity: 'INFO',
    summary: 'Confirmed 3 production callers of claim_sd() for QF ids: scripts/qf-start.js (primary CLI claim path), scripts/worker-checkin.cjs (fleet check-in auto-assignment), and lib/sd-creation/source-adapters/qf.js:219 (a fourth caller not mentioned in the SD title, discovered during Explore — included here for completeness; no caller-side changes are needed since the fix is entirely inside the RPC body, but PLAN should note this caller exists for anyone auditing blast radius).',
  },
  {
    id: 'same-class-asymmetries-out-of-scope',
    severity: 'LOW',
    summary: 'Two other SD-only guard families in claim_sd() have no QF counterpart and are the SAME general shape of bug (SD-LEO-INFRA-CLAIM-RPC-HONOR-001\'s armed-silence-window claimed_by_silenced_peer guard, and the sd_conflict_matrix blocking-conflict check, which is explicitly `IF NOT v_is_qf`-gated and looks intentional since QFs aren\'t modeled in that matrix). Both are LEAD-scoped OUT of this SD (title names only "live-foreign-peer claiming_session_id guard" + "started_at") — documented in the fix migration\'s header comment as a future-SD candidate rather than silently left unaddressed.',
  },
  {
    id: 'test-pattern-confirmed',
    severity: 'INFO',
    summary: 'No mocked-Postgres unit test exists for claim_sd()\'s SQL body anywhere in the repo — RPC-level behavior is verified exclusively via live-DB integration tests in tests/database/*.test.js (vitest), gated with describe.skipIf(!HAS_REAL_DB) so CI skips cleanly without service-role creds. tests/database/claim-sd-refuse-live-foreign.test.js (the SD-side live-peer-guard test) and tests/database/claim-sd-terminal-status.test.js (QF-fixture insert boilerplate) were read in full and used as the exact template for the new tests/database/claim-sd-qf-live-peer-guard.test.js — same hermetic per-run session-id suffixing (QF-20260612-167 lesson: fixed session ids collide across overlapping CI legs), same dedicated-scratch-row + afterAll-delete cleanup discipline, same 5-scenario shape (refuse-live / takeover-stale / takeover-force / self-resume / unclaimed-passthrough) plus one additional scenario for the started_at stamp-and-preserve behavior.',
  },
];

const warnings = [];

const recommendations = [
  'A future SD could extend the armed-silence-window (claimed_by_silenced_peer) and sd_conflict_matrix guards to the QF branch for full SD/QF symmetry — not warranted by this SD\'s scope (title names only the live-peer guard + started_at stamp) and flagged in the fix migration header for whoever picks it up.',
  'The unapplied, chairman-gated 20260816_claim_sd_tier_check.sql migration independently touches the same IF v_is_qf structure (SD-only tier-rank backstop). Whoever applies 20260816 will need to hand-merge it on top of this SD\'s migration rather than applying both as independent CREATE OR REPLACE bodies, since only the LAST-applied body wins.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001 confirmed the live production claim_sd() definition is 20260717_claim_sd_phantom_session_guard.sql (not the initially-assumed 20260704 anchor), confirmed the QF branch genuinely lacks the SD-side live-foreign-peer guard (SD-LEO-FIX-CLAIM-RPC-REFUSE-001) and never stamps quick_fixes.started_at on claim, enumerated all 3 production callers (qf-start.js, worker-checkin.cjs, lib/sd-creation/source-adapters/qf.js), identified 2 other same-class SD-only guard asymmetries explicitly scoped OUT, and confirmed the live-DB vitest integration-test pattern to follow (no SQL-body unit-test harness exists in this repo).';

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
    confidence_score: 94,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/migrations/20260704_claim_sd_client_gate_version.sql',
        'database/migrations/20260717_claim_sd_phantom_session_guard.sql',
        'database/migrations/20251117_create_quick_fixes_table.sql',
        'scripts/qf-start.js',
        'scripts/create-quick-fix.js',
        'scripts/read-quick-fix.js',
        'tests/database/claim-sd-refuse-live-foreign.test.js',
        'tests/database/claim-sd-terminal-status.test.js',
      ],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
