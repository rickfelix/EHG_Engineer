#!/usr/bin/env node
/**
 * LEAD-phase scope correction for SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E, after Explore evidence
 * (6b44c537) and VALIDATION evidence (e523e69f) findings. Appends a corrections block to scope,
 * replaces the auto-populated placeholder success_criteria/key_changes/risks with real content,
 * populates exploration_summary.files_explored (PLAN Discovery Gate) and mechanism_verifications
 * (GATE_MECHANISM_CLAIM_VERIFIER).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E';

const CORRECTIONS_BLOCK = `

LEAD-PHASE CORRECTIONS (Explore evidence 6b44c537, VALIDATION evidence e523e69f, 2026-09-05):

1. DEDUP UPDATE: QF-20260905-544 (minted 2026-09-05T05:59Z, after this SD's own dedup check at 2026-09-04T19:05Z) is a genuine duplicate of FR-3 (same file/line: lib/fleet/best-effort-release.mjs:246-254). Marked disposition=promoted, escalated_to_sd_id=this SD. Its two extra requirements are folded into FR-3: (a) distinguish clearAndReopenQf()'s zero-row UPDATE return reason "guard_refused" (predicate correctly refused) from a genuine "no_match_status" (predicate wrongly excluded a real target) so the sweep does not log a real gap as "the guard working as intended"; (b) FR-3's fix scope explicitly includes correcting the sweep's per-writer census/logging for this defect class.

2. FR-4 EXIT PREDICATE CORRECTED (was unsatisfiable by construction): the originally-worded predicate "claude_sessions rows with status released or stale_at set AND is_alive=true, asserted at zero" is unsatisfiable because stale_at is never cleared when a session later returns to status=active (cleanup_stale_sessions' release CTE leaves it non-null; claim_sd and session-register.cjs flip status back to active without nulling stale_at; heartbeat-manager.mjs then writes is_alive=true unguarded for the now-healthy session). Measured live 2026-09-05: 2,106 currently-healthy rows already violate the literal predicate. CORRECTED PREDICATE: zero rows WHERE status IN ('released','stale') AND is_alive=true (current-status-gated; drop the independent stale_at-alone disjunct). This is satisfiable once FR-1's writers are fixed, and does not flag a currently-active, currently-alive session merely because it once passed through a stale period.

3. FR-5 BACKFILL SCOPE follows the corrected FR-4 predicate: only rows CURRENTLY status IN ('released','stale') AND is_alive=true, not the broader stale_at-based set.

4. FR-2 CLARIFIED as a deny-list, not an allow-list: isSessionAlive() denies raw_is_alive trust when status IN ('released','stale') (the terminal states FR-1 now correctly writes is_alive=false for); it does NOT narrow to "only status=active" as originally worded, since status=idle is a legitimate alive-but-unclaimed state that must continue to trust a fresh raw is_alive=true. The 'raw_is_alive' reason survives for status IN ('active','idle') and any other non-terminal status; it is denied only for ('released','stale').

5. CENSUS SCOPE WIDENED: Explore-phase discovery found ~24 distinct claude_sessions write sites across ~15 files plus 5 Postgres RPC bodies that set a terminal/stale status or stamp stale_at -- materially more than the 4 classes named above (STALE_CLEANUP, release-claim, retire, guard retire). FR-1's "a census enumerates the writers and each is covered by a test" now uses this wider census as its basis. Exactly ONE writer (scripts/stale-session-sweep.cjs:3241-3260) already writes is_alive:false correctly; it is the reference pattern for all others. lib/heartbeat-manager.mjs's setIsAlive() (the sole is_alive writer in the repo) is the structural mirror of this defect (never touches status/stale_at) and is explicitly OUT OF SCOPE for this child (FR-1 is the status-writer side only).

6. STALE FACT CORRECTED: OUT OF SCOPE's "the coordinator has not hand-cleared [QF-20260903-020, -722]" is now stale -- both are cleared (claiming_session_id=null) as of ~2026-09-05 05:5xZ. FR-3 therefore has no live specimen remaining; FR-4's constructed e60956f5-shape fixture is the sole demonstration path for the whole causal chain.`;

const success_criteria = [
  { criterion: 'Every claude_sessions release-path writer from the ~24-site census writes is_alive=false in the same statement it sets status to released/stale or stamps stale_at', measure: 'Each writer is covered by a dedicated unit test asserting is_alive:false is present in its update payload/RPC body' },
  { criterion: "isSessionAlive() denies raw is_alive trust for status IN ('released','stale') only", measure: "New test: a row with is_alive=true, status='released' reads as dead; a row with is_alive=true, status='idle' still reads as alive via reason 'raw_is_alive'" },
  { criterion: "clearAndReopenQf() releases a claimed QF whose status is 'open' with a non-null claiming_session_id, not just status='in_progress'", measure: 'New test: a status=open, claimed QF is released by the sweep; the return reason distinguishes guard_refused (real refusal) from no_match_status (nothing to match)' },
  { criterion: "A CI-scheduled check asserts zero claude_sessions rows currently violate the corrected exit predicate", measure: "Scheduled script counts rows WHERE status IN ('released','stale') AND is_alive=true; asserted zero from the merge commit forward" },
  { criterion: 'Existing contradicted rows are backfilled in one idempotent run', measure: 'Backfill script sets is_alive=false on all rows matching the corrected predicate; the affected-row count is recorded in the PRD/retrospective' },
];

const key_changes = [
  { change: 'lib/claim/release-claim-both-surfaces.mjs releaseClaimBothSurfaces() writes is_alive:false alongside a terminal status write', type: 'fix' },
  { change: '~19 additional claude_sessions release-path writers (stale-session-sweep.cjs x9 remaining, spawn-control.js x3, session-tick.cjs raw REST PATCH, session-manager.mjs, singleton-refresh-sequencer.cjs, session-register.cjs, cancel-sd.js, reconcile-seats.mjs, assert-daemon-census.mjs) write is_alive:false', type: 'fix' },
  { change: '4 Postgres RPC functions (create_or_replace_session auto-replace branch, release_session, cleanup_stale_sessions two-phase, report_pid_validation_failure) write is_alive=false via a new migration', type: 'fix' },
  { change: "lib/fleet/session-liveness.cjs isSessionAlive() denies raw is_alive trust for status IN ('released','stale') only", type: 'fix' },
  { change: 'lib/fleet/best-effort-release.mjs clearAndReopenQf() also releases status=open claimed QFs, distinguishing guard_refused from no_match_status in its return reason', type: 'fix' },
  { change: 'New CI-scheduled check + idempotent backfill script for the corrected zero-contradiction predicate', type: 'test' },
];

const risks = [
  {
    risk: "Denying raw_is_alive trust for status IN ('released','stale') could introduce a false-negative if a legitimately-alive session is ever written with a terminal status by a writer this SD's census missed",
    impact: 'medium', likelihood: 'low',
    mitigation: "FR-1's census-driven test coverage plus FR-4's CI-scheduled check catch any writer that sets a terminal status without is_alive:false going forward; the existing SD-LEO-INFRA-IS-ALIVE-LIVENESS-SSOT-001 false-negative regression fixture (the Golf/Golf-3 incident shape) is re-run before merge.",
  },
  {
    risk: "clearAndReopenQf()'s widened status match (status=open with a claim, not just in_progress) could release a QF whose claim is genuinely fresh if the upstream liveness check has a bug",
    impact: 'low', likelihood: 'low',
    mitigation: 'The existing liveness.alive gate at stale-session-sweep.cjs:1324 and the CAS expectedHolder predicate are both unchanged by this fix; only the status filter widens.',
  },
  {
    risk: 'The corrected, current-status-gated FR-4 predicate could mask a future defect class where a session returns to active while still carrying an unrelated problem tied to a stale stale_at',
    impact: 'low', likelihood: 'low',
    mitigation: 'Documented explicitly in this SD; a stale_at-clearing follow-up (clearing it on every return to active) is a natural, separately-scoped hardening step if that class is ever observed.',
  },
];

const exploration_summary = {
  files_explored: [
    'lib/fleet/session-liveness.cjs',
    'scripts/stale-session-sweep.cjs',
    'lib/fleet/best-effort-release.mjs',
    'lib/claim/release-claim-both-surfaces.mjs',
    'lib/claim-validity-gate.js',
    'scripts/coordinator-cold-recovery.cjs',
    'lib/coordinator/singleton-refresh-sequencer.cjs',
    'scripts/session-tick.cjs',
    'lib/session-manager.mjs',
    'scripts/hooks/session-register.cjs',
    'lib/fleet/spawn-control.js',
    'scripts/cancel-sd.js',
    'scripts/reconcile-seats.mjs',
    'scripts/assert-daemon-census.mjs',
    'lib/heartbeat-manager.mjs',
    'database/migrations/20260509_layer1_claiming_session_id_release_parity.sql',
    'database/migrations/20260904_report_pid_validation_failure_heartbeat_refusal.sql',
  ],
  explored_at: new Date().toISOString(),
  explored_by: 'Explore-agent-6b44c537',
};

const mechanism_verifications = [
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'lib/fleet/session-liveness.cjs:169' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'scripts/stale-session-sweep.cjs:1324' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'lib/fleet/best-effort-release.mjs:254' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'lib/claim/release-claim-both-surfaces.mjs:214-226' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'scripts/stale-session-sweep.cjs:3241-3260' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'scripts/session-tick.cjs:615-646' },
  { verified_by: 'Explore-agent-6b44c537', verified_at: 'lib/heartbeat-manager.mjs:314-329' },
  { verified_by: 'validation-agent-e523e69f', verified_at: 'database/migrations/20260509_layer1_claiming_session_id_release_parity.sql:186-264' },
];

async function main() {
  const { data: current, error: readErr } = await supabase
    .from('strategic_directives_v2')
    .select('scope')
    .eq('sd_key', SD_KEY)
    .single();
  if (readErr) throw new Error(readErr.message);

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      scope: current.scope + CORRECTIONS_BLOCK,
      success_criteria,
      key_changes,
      risks,
      exploration_summary,
    })
    .eq('sd_key', SD_KEY)
    .select('sd_key')
    .single();
  if (error) throw new Error(error.message);

  // metadata.mechanism_verifications needs a merge, not a blind overwrite
  const { data: mdRow, error: mdReadErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (mdReadErr) throw new Error(mdReadErr.message);

  const { error: mdErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...mdRow.metadata, mechanism_verifications } })
    .eq('sd_key', SD_KEY);
  if (mdErr) throw new Error(mdErr.message);

  console.log('SD corrected:', data.sd_key);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
