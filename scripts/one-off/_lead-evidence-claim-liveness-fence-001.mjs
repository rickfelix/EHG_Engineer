#!/usr/bin/env node
/**
 * One-off: write VALIDATION LEAD-phase evidence for
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001, verifying the LEAD FINDING appended to the
 * SD row (callsign non-uniqueness, QF-20260726-030 misattribution, AC-N1..N3
 * sufficiency, false-positive/false-negative asymmetry).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict + lib/sub-agent-executor/results-storage.js
 * storeSubAgentResults) per CLAUDE.md prologue rule 11 — no hand-rolled insert.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '137ad5d5-f542-4518-afb6-37789fd1546b';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    findings: [
      {
        id: 'F1-scope-coherent-buildable-multi-callsite',
        severity: 'INFO',
        summary: "Design is coherent and buildable as a shared liveness-classifier module (ESRCH=death, Get-Process ProcessName=claude match=life, .claude/pids/tick-{SESSION_ID}.json as pid-binding tiebreak) wired into the claim-WRITE call sites. Grepped and found >=5 distinct fresh-claim write sites that set claiming_session_id to a NEW value: lib/claim-guard.mjs:195 (SD claim), lib/quick-fix-claim.mjs:52 (QF claim), lib/drain-orchestrator.mjs:238, scripts/stale-session-sweep.cjs:2912 (sweep re-issue), scripts/claim-orchestrator-for-rollup.mjs:101. A fix that gates only one of these (e.g. SD claims but not QF claims) reproduces the exact defect class on the untouched path — QF-20260726-529/030/607 were all QF claims, not SD claims. Recommend PLAN's PRD FR list enumerate every write site explicitly rather than leaving 'the claim write' singular/implicit.",
      },
      {
        id: 'F2-existing-sibling-liveness-modules-are-unsound-by-the-same-defect-class',
        severity: 'WARNING',
        summary: "lib/fleet/cc-pid-liveness.cjs:isProcessRunning() and lib/claim/owner-liveness.js:classifyOwnerLiveness() already exist in this repo and are the natural place an implementer would reach for reusable liveness logic — but both use exactly the patterns this SD's do_not_accept list forbids: cc-pid-liveness.cjs uses bare process.kill(pid,0) treating EPERM as alive (same unsound existence-only test as session-tick.cjs's parentAlive(), no ProcessName match, so it inherits the pid-recycling flaw); owner-liveness.js keys on status==='active' and heartbeat age (both explicitly forbidden fields). PLAN/EXEC must NOT reuse these as-is for the new fence — they need to either build a new module or extend these with a genuine ProcessName-match step. Not a blocker, but a real collision risk worth flagging so the PRD names it explicitly instead of an implementer 'discovering' an existing helper mid-EXEC and wiring in the same flaw.",
      },
      {
        id: 'F3-callsign-non-uniqueness-verified-true-and-understated',
        severity: 'INFO',
        summary: 'Verified against claude_sessions.metadata->fleet_identity->>callsign: the LEAD FINDING claim (8 distinct sessions have held "Charlie", naming fd6493d2/8600535a/356833d8/5e839448/a9170b68) is TRUE and actually undercounts — a full-history query returns 34+ distinct session_ids that have held callsign="Charlie" going back to March 2026, all five named sessions confirmed present. In just the 4 days preceding the SD (2026-07-22 to 2026-07-26), 2 distinct sessions held "Charlie" (fd6493d2 released 2026-07-25T02:26Z, then 24ca166f claimed 2026-07-26T21:53Z). A callsign-keyed evidence line for a "dead CHARLIE" instance is structurally ambiguous — it cannot on its own distinguish which of dozens of historical holders is meant.',
      },
      {
        id: 'F4-qf030-misattribution-confirmed-plus-concrete-pid-staleness-fixture-found',
        severity: 'CRITICAL',
        summary: 'Verified against quick_fixes: QF-20260726-030 has status=completed, pr_url=https://github.com/rickfelix/ehg/pull/777, commit_sha=a1b37d65d8bc41e6af525590d8e5abcfbcae955d, completed_at=2026-07-27T00:59:03Z — matching the LEAD FINDING exactly. The SD row\'s original claim ("claimed by CHARLIE (dead)", "the claimant never held it") is factually contradicted by the record for this instance and must be withdrawn/re-attributed as the LEAD FINDING already instructs; three instances support "dead seats take fresh work," not four. Independently reproduced the underlying mechanism live: this session\'s (24ca166f) recorded claude_sessions.pid=21864 returns NOT FOUND via `tasklist /FI "PID eq 21864"` (process genuinely gone/recycled), while the tick pidfile .claude/pids/tick-24ca166f....json records cc_parent_pid=7440, which `tasklist /FI "PID eq 7440"` confirms IS a live claude.exe process right now. This is a real, reproducible AC-N1 regression fixture — but the two pids play different roles and the AC wording should say so explicitly: 21864 is the STALE DB-recorded pid (must not be trusted for death), 7440 is the tick-pidfile-bound pid that the ProcessName-match check must resolve as LIVE.',
      },
      {
        id: 'F5-acN1-acN3-necessary-but-three-gaps-identified',
        severity: 'WARNING',
        summary: 'AC-N1..N3 are necessary and address a real, previously-unstated gap (see F6). They are largely testable given the F4 fixture. Three additions are still missing for PLAN to close: (a) no AC asserts the end-to-end outcome at the actual claim-WRITE call sites — the current three test the liveness CLASSIFIER in isolation, not that lib/claim-guard.mjs / lib/quick-fix-claim.mjs etc. actually refuse a write for a genuinely-dead claimant and permit one for a genuinely-live claimant; (b) the security_assessment.fail_mode text states refusals must be "RECORDED with a reason rather than silently dropped" but no AC encodes this as testable — a silent refusal is operationally indistinguishable from an unrelated claim failure; (c) no AC covers gate-internal failure fail-open behavior — fail_mode also states "a failure INSIDE the gate itself must not wedge all claiming" (e.g. the Get-Process shell-out times out or PowerShell is unavailable) but there is no criterion forcing that path to degrade safely rather than block every claim fleet-wide.',
      },
      {
        id: 'F6-asymmetry-confirmed-spec-tested-only-false-positive-side',
        severity: 'WARNING',
        summary: "Confirmed: the SD's own metadata.do_not_accept lists exactly 5 items, and all 5 exist solely to prevent admitting a corpse (false positive / liveness-instrument choice). metadata.security_assessment narrates the false-negative risk in prose (\"residual_risk_if_shipped: A session that is alive but whose tick-pid binding file is missing or stale could be refused\") but, prior to the LEAD FINDING, encoded zero acceptance criteria testing that direction. Yes: admitting a corpse is the cheaper failure (one pinned item a sweep later clears) versus falsely fencing a live worker (silently stops real work, looks like an idle fleet, per the SD's own fail_mode language) — and the original spec tested only the cheaper-to-get-wrong side. AC-N1..N3 are the correct, necessary counterweight; F5 identifies what still needs to be added alongside them.",
      },
    ],
    warnings: [
      'Do not let PLAN copy AC-N1\'s fixture pid (21864) as "the live pid to check" — it is the STALE one. The live-verification pid in this session is cc_parent_pid=7440 from the tick pidfile; the AC needs both numbers to avoid an implementer testing the wrong side of the fixture.',
      'lib/fleet/cc-pid-liveness.cjs and lib/claim/owner-liveness.js are natural-looking but UNSOUND reuse targets for this fence — both violate the do_not_accept list. Call this out explicitly in the PRD so EXEC does not silently reach for them.',
    ],
    recommendations: [
      'PLAN: enumerate every claim-WRITE call site as separate FRs/tasks (lib/claim-guard.mjs, lib/quick-fix-claim.mjs, lib/drain-orchestrator.mjs, scripts/stale-session-sweep.cjs reclaim path, scripts/claim-orchestrator-for-rollup.mjs) rather than one implicit "the claim write."',
      'PLAN: add three ACs to close the gaps in F5 — end-to-end write-gating assertion, refusal-recorded-with-reason assertion, gate-internal-failure fail-open assertion.',
      'PLAN: correct AC-N1\'s fixture description to distinguish the stale DB pid (21864) from the live tick-pidfile-bound pid (cc_parent_pid, e.g. 7440) so the regression test targets the right value.',
      'LEAD/PLAN: apply the SD row correction the LEAD FINDING already specifies — withdraw or re-attribute the QF-20260726-030 evidence line (three genuinely-dead instances remain, not four).',
    ],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      verification_method: 'Independent DB queries against claude_sessions and quick_fixes (engineer DB), live tasklist pid probes on this host, and codebase grep for claiming_session_id write sites.',
      callsign_query: "SELECT ... FROM claude_sessions WHERE metadata->'fleet_identity'->>'callsign' = 'Charlie' -- 34+ distinct session_id rows returned across full history; all 5 named sessions (fd6493d2, 8600535a, 356833d8, 5e839448, a9170b68, plus active 24ca166f) confirmed present.",
      qf030_row: { id: 'QF-20260726-030', status: 'completed', pr_url: 'https://github.com/rickfelix/ehg/pull/777', commit_sha: 'a1b37d65d8bc41e6af525590d8e5abcfbcae955d', completed_at: '2026-07-27T00:59:03.243Z', started_at: '2026-07-27T00:25:25.745Z' },
      pid_fixture: { db_recorded_pid: 21864, tasklist_21864: 'NOT FOUND', tick_pidfile_cc_parent_pid: 7440, tasklist_7440: 'claude.exe CONFIRMED RUNNING' },
      claim_write_sites_found: ['lib/claim-guard.mjs:195', 'lib/quick-fix-claim.mjs:52', 'lib/drain-orchestrator.mjs:238', 'scripts/stale-session-sweep.cjs:2912', 'scripts/claim-orchestrator-for-rollup.mjs:101'],
      unsound_sibling_modules: ['lib/fleet/cc-pid-liveness.cjs (bare process.kill(pid,0), EPERM=alive, no ProcessName match)', 'lib/claim/owner-liveness.js (keys on heartbeat age + status==active, both explicitly forbidden fields)'],
    }),
    metadata: {
      verified_claims: {
        callsign_non_unique: 'CONFIRMED (34+ sessions, not just 8)',
        qf030_misattribution: 'CONFIRMED (record contradicts original SD claim)',
        acN1_acN3_necessary: 'CONFIRMED necessary, sufficiency gaps found (see F5)',
        asymmetry_untested_false_negative_side: 'CONFIRMED (do_not_accept 5/5 false-positive-only, pre-LEAD-FINDING)',
      },
    },
    phase: 'LEAD',
    validation_mode: 'prospective',
    summary: 'CONDITIONAL_PASS for LEAD-TO-PLAN. Design (ESRCH=death, ProcessName-match=life, tick pidfile as tiebreak) is coherent and buildable. All four claims in the LEAD FINDING independently verified TRUE against the DB and a live pid probe on this host, including a fresh reproducible fixture (session 24ca166f: DB-recorded pid 21864 is stale/not-found, tick-pidfile cc_parent_pid 7440 is a confirmed-live claude.exe). Concerns for PLAN to close before/at PRD: (1) enumerate all >=5 claim-write call sites explicitly, not one implicit site; (2) two existing sibling liveness modules in this repo are unsound reuse traps and should be named as such; (3) AC-N1..N3 are necessary but not sufficient — add end-to-end write-gating, refusal-recorded, and gate-failure-fail-open criteria; (4) fix AC-N1\'s fixture wording (21864 is the stale pid, not the live one — 7440 is); (5) correct the SD row per the LEAD FINDING\'s own instruction (QF-20260726-030 line should be withdrawn/re-attributed).',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('VALIDATION result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
