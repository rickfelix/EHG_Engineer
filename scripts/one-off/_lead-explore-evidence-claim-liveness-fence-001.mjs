// Records the LEAD-phase Explore evidence for SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001.
//
// WHY THIS SCRIPT EXISTS: the Explore sub-agent is READ-ONLY by definition, so it cannot write its
// own sub_agent_execution_results row — it returned the inventory and explicitly handed the write
// back. This persists that agent's findings verbatim; it does not invent them.
//
// Uses the canonical writer (applySubAgentRepoVerdict) so metadata.repo_path + executed_from_cwd
// are set correctly. There are NO top-level repo_path/local_path columns — never hand-roll them.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const results = {
  status: 'completed',
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Claim-write surface inventory complete. THE CENTRAL FINDING: there is NO single choke point. '
    + 'liveClaimWriteFenceReason() (lib/fleet/claim-eligibility.cjs:733) is already wired into 3-4 write '
    + 'paths and fails closed, but SIX direct-write surfaces bypass both claim_sd and the fence entirely. '
    + 'Fencing only the RPC path would leave the QF lane — which is where all three cited QF incidents '
    + '(529/030/607) occurred — still open.',
  findings: [
    'CLAIM-WRITE PATHS VIA claim_sd RPC (4 independent call sites, not 1): lib/claim-guard.mjs:652,665 '
      + '(the ONLY write path for scripts/sd-start.js, which has zero direct writes); '
      + 'scripts/worker-checkin.cjs:372-388 tryClaim() covering every checkin lane (resume_final, '
      + 'orphan-adopt, draft self-claim, directed assignment); scripts/qf-start.js:78-82; '
      + 'lib/session-conflict-checker.mjs:302.',
    'DIRECT .update({claiming_session_id}) SURFACES THAT BYPASS THE RPC AND THE FENCE (6): '
      + 'lib/quick-fix-claim.mjs:47-58 (QF CAS); scripts/create-quick-fix.js:524-529 (creator self-claim '
      + 'at filing time — a third, separate QF-claim surface); lib/claim-validity-gate.js:260 and :602; '
      + 'lib/drain-orchestrator.mjs:237-239 (parallel EXEC-drain bulk claim, no fence call); '
      + 'scripts/claim-orchestrator-for-rollup.mjs:99-102 (its own liveness check at :84-96 is '
      + 'heartbeat_at + status===active only — no process signal at all).',
    'TICK PIDFILE (the prescribed tiebreak) IS REAL BUT WEAKER THAN ASSUMED: scripts/session-tick.cjs '
      + 'writes .claude/pids/tick-${sessionId}.json (:83-84) with {session_id, tick_pid, cc_parent_pid, '
      + 'started_at, hostname} (:88-102). It is written ONCE at spawn (:484), NOT refreshed per tick — '
      + 'only the DB row is patched. Cleanup (:104-106, called from :471) is best-effort and hard kills '
      + 'leave orphans: .claude/pids/ currently holds 66 files including 20+ tick markers.',
    'SESSION-TICK LINE CITATIONS IN THE SD ALL VERIFIED EXACT against the current file: parentAlive() '
      + ':110-119 is process.kill(pid,0) with no name match; :116 returns TRUE on EPERM; '
      + 'rediscoverParentPid :134-173 re-reads claude_sessions.pid and probes the candidate with the same '
      + 'bare kill(pid,0) at :161-162 (EPERM adoptable at :165), adopted by the caller at :520 with NO '
      + 'independent identity check (no name/cmdline/start-time); process_alive_at written at :232 and :284.',
    'heartbeat_at WRITER COUNT — the SD says 12+; that is an UNDERCOUNT. Measured: 23+ distinct '
      + 'production JS/TS files write it, plus 47 raw SQL "heartbeat_at = NOW()" occurrences across 31 '
      + 'migration files, plus a column DEFAULT NOW() at '
      + 'database/migrations/20251204_multi_session_coordination.sql:20. The cross-session writer keyed on '
      + 'sd_key is CONFIRMED at scripts/modules/handoff/executors/BaseExecutor.js:1121-1140 — it looks up '
      + 'activeClaim by .eq(sd_key,...) not session_id, and when the holder is a DIFFERENT session it still '
      + 'writes that other session\'s heartbeat_at (:1137-1140) with no liveness check.',
    'process_alive_at HAS EXACTLY ONE PRODUCTION WRITER: scripts/session-tick.cjs:232 and :284, same '
      + 'function. Every other repo hit is a read/test/fixture. NOTE FOR PLAN: single-writer makes it '
      + 'tempting, but the SD\'s rejection still stands and for the stated reason — that one writer IS the '
      + 'daemon being fenced out, and it keeps ticking while parentAlive() (an EPERM-true existence probe) '
      + 'returns true, so a recycled pid pins the field at 0m indefinitely.',
    'ONLY EXISTING NAME-MATCH HELPER: scripts/stale-session-sweep.cjs:699-709 anyClaudeProcessRunning() '
      + 'uses tasklist /FI "IMAGENAME eq claude.exe" /NH, used at :1994 to guard against PID recycling. '
      + 'CAVEAT: it is HOST-WIDE existence, never per-PID — it cannot confirm a specific pid is claude.exe. '
      + 'Every other predicate in the repo is bare process.kill(pid,0): stale-session-sweep.cjs:687-697, '
      + 'lib/fleet/cc-pid-liveness.cjs:26-30 (the fleet-dashboard SSOT), session-tick.cjs:110-119.',
  ],
  recommendations: [
    'PLAN MUST DECIDE CHOKE POINT vs TRIGGER. Inserting liveness only at '
      + 'lib/fleet/claim-eligibility.cjs:733 leaves the 6 direct-write surfaces open. Either route all of '
      + 'them through the shared check, or enforce at a Postgres trigger/CHECK on claiming_session_id '
      + 'writes so no JS call site can bypass it. Given the number of independent JS writers, the trigger '
      + 'is materially safer.',
    'THE QF LANE IS THE ONE THAT MUST NOT BE MISSED: all three cited QF incidents (529, 030, 607) are QF '
      + 'claims, and QF claiming has THREE separate surfaces (qf-start.js via RPC, lib/quick-fix-claim.mjs '
      + 'direct, create-quick-fix.js direct). An SD-only fence reproduces the exact defect on the QF path.',
    'BUILD THE PER-PID NAME CHECK THAT DOES NOT YET EXIST: tasklist /FI "PID eq <pid>" /FI "IMAGENAME eq '
      + 'claude.exe". Reuse anyClaudeProcessRunning\'s technique and fail-safe shape, not its host-wide '
      + 'semantics.',
    'DO NOT REUSE lib/fleet/cc-pid-liveness.cjs or lib/claim/owner-liveness.js unmodified — they look like '
      + 'natural reuse targets but both implement exactly the patterns the SD forbids (bare kill(pid,0) '
      + 'with EPERM-as-alive; status/heartbeat keying).',
    'Refresh the tick pidfile periodically or treat its absence as INDETERMINATE rather than dead — it is '
      + 'written once at spawn and orphaned markers already outnumber live sessions 66-to-~20.',
  ],
  metadata: {
    evidence_authored_by: 'Explore sub-agent (read-only; could not self-write this row)',
    recorded_by_session: '24ca166f-1a46-4584-99a7-35c791b28663',
    sd_uuid: '137ad5d5-f542-4518-afb6-37789fd1546b',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  fallback: 'EHG_Engineer',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

await storeSubAgentResults('Explore', SD_KEY, null, results, { phase: 'LEAD', sdKey: SD_KEY });

console.log('recorded. repo_path=', results.metadata?.repo_path, '| cwd=', results.metadata?.executed_from_cwd);
