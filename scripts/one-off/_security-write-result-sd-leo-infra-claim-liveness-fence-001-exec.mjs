#!/usr/bin/env node
/**
 * Write SECURITY (Chief Security Architect) EXEC-phase verdict for
 * SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001.
 *
 * Scope: lib/fleet/claimant-liveness.cjs (the classifier) and its 9 fenced call sites
 * (lib/fleet/claim-eligibility.cjs liveClaimWriteFenceReason, lib/quick-fix-claim.mjs,
 * scripts/qf-start.js, scripts/create-quick-fix.js, lib/claim-validity-gate.js,
 * lib/drain-orchestrator.mjs, scripts/claim-orchestrator-for-rollup.mjs,
 * scripts/stale-session-sweep.cjs). Reviewed for command injection, fail-direction
 * correctness, kill-switch attack surface, bypassability, and information disclosure.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '137ad5d5-f542-4518-afb6-37789fd1546b';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001';

const findings = [
  {
    id: 'S1-command-injection-not-reachable',
    severity: 'INFO',
    summary: 'PASS on command injection. pidIsClaude() (claimant-liveness.cjs:53-68) builds the tasklist shell command from `pid`, but BOTH call sites pass an already-normalized value: pidfilePid = normalizePid(marker && marker.cc_parent_pid) (line 106) and base.recordedPid = normalizePid(recordedPid) (line 99). normalizePid (line 161-164) coerces to Number and requires Number.isInteger(n) && n > 0, returning null otherwise -- and pidIsClaude itself re-checks `!Number.isInteger(pid) || pid <= 0` before touching execCmd (defense-in-depth, belt and suspenders). A pid can therefore never carry shell metacharacters into the `${pid}` template literal; String(<positive integer>) cannot contain quotes/backticks/`;`/`&&`. Verified: pidIsClaude has exactly two call sites (lines 112, 126), both post-normalizePid. No path bypasses this.',
  },
  {
    id: 'S2-pidfile-path-traversal-unvalidated-sessionid',
    severity: 'MEDIUM',
    summary: 'CONCERN. readTickPidfile(sessionId, repoRoot) (claimant-liveness.cjs:71-79) builds `path.join(repoRoot, \'.claude\', \'pids\', `tick-${sessionId}.json`)` with NO format validation on sessionId. path.join normalizes the resulting path, so a sessionId containing `../` sequences (e.g. `../../../../some/other/file`) is not neutralized by path.join -- it is resolved as a traversal out of .claude/pids/. The codebase already has an established, elsewhere-applied convention for exactly this situation: lib/hooks/session-id.cjs:57-58 and scripts/hooks/coordination-inbox.cjs:310-311 both define `isValidSessionId(sid) = typeof sid === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(sid)` and gate file-path construction on it (coordination-inbox.cjs:315 getFrictionCounterFile calls isValidSessionId before building a path from sessionId). claimant-liveness.cjs does not reuse or reimplement that check. Exposure is bounded but real: most callers pass their OWN process.env.CLAUDE_SESSION_ID (self-declared, not attacker input over a network boundary), but scripts/stale-session-sweep.cjs:2924 passes s.session_id read from the claude_sessions DB row -- a column defined as `session_id TEXT NOT NULL UNIQUE` (database/migrations/20251204_multi_session_coordination.sql:12) with NO CHECK constraint on shape. A malformed or corrupted row (bug elsewhere, or a future writer with service-role access that does not follow the `session_<uuid8>_tty<N>_<pid>` convention) could carry traversal characters, causing the sweep to read an arbitrary JSON file\'s `cc_parent_pid` field. Blast radius is capped downstream (the extracted value is immediately re-run through normalizePid before ever reaching pidIsClaude, so this cannot escalate to command injection or file content disclosure beyond "a JSON object shape mismatch/parse attempt") -- so this is a defense-in-depth gap, not a demonstrated RCE/disclosure path. Recommend applying the SAME isValidSessionId regex already used elsewhere before building the pidfile path (cheap, consistent with existing convention, closes the gap regardless of attacker model).',
  },
  {
    id: 'S3-fail-open-direction-defensible-for-stated-threat-model',
    severity: 'INFO',
    summary: 'The classifier fails OPEN (verdict=INDETERMINATE -> claim ALLOWED) on: no session id, probe failure (tasklist errored), no pidfile + no recorded pid, no pidfile + recorded pid does not name-match, and the claim-write wrapper fails open on the claude_sessions lookup erroring. The ONLY path to a blocking DEAD verdict is: a self-declared tick pidfile names a pid, and that specific pid is confirmed (by a successful, name-matched tasklist probe) to NOT be a live claude.exe. Given the stated threat model -- the adversary here is a dead/orphaned process on the SAME trusted fleet, not an external malicious actor attempting to bypass access control -- this direction is defensible: it is asymmetric BY DESIGN because a false DEAD verdict (fencing a live, productive worker) is empirically the more expensive failure (the docstring cites session 24ca166f: recorded pid stale after resume/compaction, real process alive and shipping work). This is NOT the same risk calculus as a conventional authn/authz fence guarding against a hostile principal, where fail-open would be a straightforward defect; it is closer to a liveness/health-check circuit breaker, where fail-open-on-uncertainty is the standard, correct pattern (analogous to a Kubernetes readiness probe). One place this reasoning would NOT hold: if claimantSessionId could be supplied by an untrusted party racing to make live sessions APPEAR dead by manipulating the tick pidfile — but the pidfile is self-declared by the querying session\'s OWN daemon (session-tick.cjs writes tick-{SESSION_ID}.json for its OWN session id), so a third party cannot forge another session\'s pidfile through this classifier\'s inputs without independent filesystem write access, which is already a stronger compromise than this fence is designed to resist. Verdict: fail-open direction is correctly reasoned and consistently applied; no path found where it silently flips to fail-closed-when-it-should-be-open or vice versa.',
  },
  {
    id: 'S4-kill-switch-write-access-scoped-to-service-role',
    severity: 'INFO',
    summary: 'chairman_dashboard_config has RLS that blocks UPDATEs from authenticated/anon roles (service-role only) per the explicit comment in database/migrations/20260512_chairman_config_write_rpcs.sql:6-8. The two SECURITY DEFINER RPCs that DO exist for authenticated chairman writes (set_stage_override, set_global_auto_proceed) only write stage_overrides and global_auto_proceed columns respectively -- NEITHER touches the metadata column that claim_liveness_fence lives under. So there is no authenticated-role write path to metadata.claim_liveness_fence at all; flipping it requires service-role DB access, the same trust tier as every other piece of fleet-control config in this system (env var CLAIM_LIVENESS_FENCE=off requires host/process-level access, an equivalent tier). A global off-switch on a security control is acceptable here BECAUSE the write surface is already restricted to the same privileged tier that could disable/bypass the fence by other means (deploy a patched claimant-liveness.cjs, edit the DB row directly, etc.) -- the kill switch does not introduce a NEW privilege escalation path, it exposes an EXISTING one through one more (equally privileged) door, which is the point of an incident lever. fenceDisabled() correctly fails toward FENCE-ON on any read error (line 201 comment: "unreadable config must not disable the fence"), so an outage/misconfig of chairman_dashboard_config cannot accidentally disable the control. The 60s cache (FENCE_CACHE_TTL_MS) is a minor operational note, not a vulnerability: worst case is the fence stays disabled up to 60s longer than an operator intended after re-enabling it mid-incident -- bounded, non-adversarial, and the cache is per-process (module-level), never shared/poisoned across sessions.',
  },
  {
    id: 'S5-bypassability-sd-lane-liveness-check-currently-inert',
    severity: 'MEDIUM',
    summary: 'CONCERN, but transparently documented as a staged rollout. liveClaimWriteFenceReason(sb, sdKey, claimantSessionId=null, ...) only runs the liveness sub-check when claimantSessionId is truthy (claim-eligibility.cjs:743). Verified via grep: EVERY current caller of liveClaimWriteFenceReason -- lib/claim-guard.mjs:635, scripts/modules/handoff/executors/BaseExecutor.js:335, scripts/sd-start.js:1237, scripts/worker-checkin.cjs:377 -- invokes it with exactly 2 args (sb, sdKey), so claimantSessionId is always null and the liveness gate is a complete no-op for the entire SD self-claim/reconciliation lane today. This IS the documented, intended staged-rollout state (module docstring: "wiring the remaining call sites is a separate, reviewable step"; tests/unit/claim-liveness-fence-wiring.test.js even pins it: "is byte-identical when no claimant id is supplied"). It is not a hidden defect, but it means the SD-claim lane has ZERO liveness protection right now despite the SD\'s own framing implying broad 9-site coverage -- worth flagging so this gap does not get lost between SDs (the observed incidents QF-20260726-529/-030/-607 that motivated this SD were all QF-lane, which IS wired end-to-end (quick-fix-claim.mjs, qf-start.js, create-quick-fix.js, claim-validity-gate.js, drain-orchestrator.mjs, claim-orchestrator-for-rollup.mjs, stale-session-sweep.cjs all correctly thread a real session id through claimantLivenessFence), so today\'s actual coverage matches today\'s actual observed defect surface -- but the SD-lane gap should be tracked, not assumed closed.',
  },
  {
    id: 'S6-anti-rot-coverage-test-is-presence-not-flow-checked',
    severity: 'LOW',
    summary: 'tests/unit/claim-liveness-fence-surface-inventory.test.js (the "anti-rot pin" meant to prevent future coverage decay) flags a file as fenced if `FENCE_RE.test(f.src)` -- i.e. the STRING "claimantLivenessFence" or "liveClaimWriteFenceReason" appears ANYWHERE in the file\'s source (surface-inventory test line 32, 85). It does not verify that the specific `.update({claiming_session_id: ...})` call site actually consults the fence\'s return value before executing, nor that the fence call and the update are in the same function/control-flow path. A future writer could satisfy this test by importing the fence in an unrelated function, calling it and discarding the result, or referencing it only in a comment/JSDoc, while the actual claim-write proceeds unconditionally. This is a real (if narrow) gap in the guardrail whose entire purpose is to prevent silent coverage decay -- recommend tightening it to a lightweight data-flow check (e.g. require the fence-derived `reason`/local var name to appear in a conditional guarding the matched .update(...) block) in a follow-up, not blocking for this SD.',
  },
  {
    id: 'S7-information-disclosure-refusal-record',
    severity: 'INFO',
    summary: 'recordRefusal() persists to system_events: session_id, recorded_pid, pidfile_pid, verdict, deciding_signal, reason, plus caller-supplied context (e.g. sd_key). None of this is secret material -- internal fleet session ids and OS process ids are operational metadata already visible via claude_sessions/worker-checkin output, not credentials or PII. No hostnames, file contents, environment variables, or tokens are written. Best-effort insert (try/catch swallows errors) correctly never blocks/fails the claim decision on an audit-write failure. PASS.',
  },
];

const warnings = [
  'S2: claimant-liveness.cjs readTickPidfile builds a filesystem path directly from an unvalidated sessionId; apply the same isValidSessionId (/^[a-zA-Z0-9_-]{1,128}$/) convention already used in lib/hooks/session-id.cjs / scripts/hooks/coordination-inbox.cjs before path.join, closing a defense-in-depth gap on the one caller (stale-session-sweep.cjs) that passes a DB-sourced rather than self-declared session id.',
  'S5: the SD-claim lane (claim-guard.mjs, BaseExecutor.js, sd-start.js, worker-checkin.cjs) calls liveClaimWriteFenceReason without a claimantSessionId, so liveness fencing is currently inert there by design (staged rollout) -- track as a follow-on so it is not assumed closed.',
  'S6: the surface-inventory anti-rot test checks textual presence of the fence identifier in a file, not that the matched claiming_session_id write is actually gated on the fence result -- a narrow but real false-confidence gap in the guardrail meant to prevent coverage decay.',
];

const recommendations = [
  'Before/soon after merge: validate sessionId with the existing isValidSessionId regex in readTickPidfile (claimant-liveness.cjs) prior to path.join, matching the pattern already established in lib/hooks/session-id.cjs and scripts/hooks/coordination-inbox.cjs. Low-effort, closes S2 regardless of current exploitability.',
  'Follow-on SD/QF: wire claimantSessionId through the 4 SD-lane liveClaimWriteFenceReason call sites (claim-guard.mjs, BaseExecutor.js, sd-start.js, worker-checkin.cjs) so the liveness check is not permanently inert for that lane -- track explicitly rather than let the "staged rollout" framing quietly become the permanent state.',
  'Non-blocking follow-up: tighten claim-liveness-fence-surface-inventory.test.js from a textual FENCE_RE presence check to a lightweight control-flow check that the fence-derived variable actually guards the matched .update(...) call.',
  'No changes required for: command-injection surface (pid normalization is sound and double-enforced), fail-open direction (correctly reasoned for the stated dead-process threat model), kill-switch write access (already scoped to service-role, no authenticated RPC exposes metadata), or the refusal audit record (no sensitive data persisted).',
];

const summary = 'CONDITIONAL_PASS (confidence 85). No exploitable command-injection, privilege-escalation, or sensitive-disclosure defect found. Two MEDIUM findings, both non-blocking for this SD: (S2) claimant-liveness.cjs readTickPidfile builds a filesystem path from an unvalidated sessionId -- a defense-in-depth gap (path.join does not neutralize `..` traversal characters embedded in a single interpolated segment) that the codebase already has an established fix pattern for elsewhere (isValidSessionId) but does not reuse here; bounded blast radius since the extracted pid is re-normalized before any further use. (S5) the SD self-claim lane (4 call sites) invokes liveClaimWriteFenceReason without ever supplying claimantSessionId, so liveness fencing is currently a complete no-op there -- this matches the SD\'s own documented staged-rollout design and matches today\'s observed defect surface (QF lane), but should be tracked as explicitly open, not assumed closed by this SD\'s "9 fenced call sites" framing. Command injection (S1) is definitively ruled out: pid values are normalized to a validated positive integer via normalizePid() before EITHER of pidIsClaude\'s two call sites, with a redundant re-check inside pidIsClaude itself. Fail-open direction (S3) is well-reasoned and consistently applied for the stated dead-process threat model (not a hostile-actor access-control scenario). Kill-switch write access (S4) is correctly scoped to service-role/env-level privilege with no authenticated-role escape hatch, and fails toward fence-ON on any config-read error. The refusal audit record (S7) discloses nothing sensitive. LOW finding S6 notes the anti-rot coverage test checks textual presence rather than control-flow enforcement.';

const justification = [
  'CONDITIONAL_PASS (confidence 85) — SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 EXEC-phase security review.',
  '',
  'REVIEWED: lib/fleet/claimant-liveness.cjs (classifier) + all 9 named call sites (lib/fleet/claim-eligibility.cjs, lib/quick-fix-claim.mjs, scripts/qf-start.js, scripts/create-quick-fix.js, lib/claim-validity-gate.js, lib/drain-orchestrator.mjs, scripts/claim-orchestrator-for-rollup.mjs, scripts/stale-session-sweep.cjs) + surface-inventory anti-rot test + chairman_dashboard_config RLS/RPC migrations + claude_sessions schema.',
  '',
  '1. COMMAND INJECTION — PASS. pid is Number.isInteger-normalized (normalizePid) before both pidIsClaude call sites, plus a redundant guard inside pidIsClaude itself. No path bypasses normalization; String(positive integer) cannot carry shell metacharacters into the tasklist template literal.',
  '2. FAIL-DIRECTION — Defensible for the stated threat model (dead/orphaned process, not a hostile principal); this is a liveness/health-check circuit breaker, not an authn/authz gate, so fail-open-on-uncertainty is the standard correct pattern here, not a defect. Reasoning is consistent across all fail-open branches.',
  '3. KILL SWITCH — Write access to chairman_dashboard_config.metadata is service-role-only (RLS blocks authenticated/anon UPDATE; the two authenticated SECURITY DEFINER RPCs write different columns, not metadata). Unreadable config correctly fails toward fence-ON. 60s cache is a bounded operational nit, not a vulnerability.',
  '4. BYPASSABILITY — The QF lane (7 call sites) is genuinely wired end-to-end with a real session id. The SD lane (4 call sites: claim-guard.mjs, BaseExecutor.js, sd-start.js, worker-checkin.cjs) calls liveClaimWriteFenceReason with claimantSessionId omitted, so liveness fencing is currently INERT there — by design (staged rollout, explicitly tested), but flagged so it is tracked as an open gap rather than assumed complete. A Postgres trigger would provide stronger last-line coverage across write sites regardless of which JS caller forgets to thread the session id through, and is worth considering as a follow-on hardening, though the JS-classifier approach is reasonable for FIRST implementation given the probe (tasklist/name-match) cannot run inside a DB trigger.',
  '5. INFORMATION DISCLOSURE — PASS. Refusal records in system_events contain only operational metadata (session/pid ids, verdict, reason) already exposed elsewhere in the fleet tooling; no secrets, tokens, hostnames, or file contents.',
  '',
  'ADDITIONAL FINDING NOT IN THE ORIGINAL 5 DIMENSIONS: readTickPidfile interpolates an unvalidated sessionId directly into a filesystem path (claimant-liveness.cjs:72). path.join does not neutralize `../` sequences embedded within a single argument, so a sessionId containing traversal characters is not blocked. The codebase already has an established validation pattern for exactly this (lib/hooks/session-id.cjs / scripts/hooks/coordination-inbox.cjs isValidSessionId, `/^[a-zA-Z0-9_-]{1,128}$/`) used before analogous path construction elsewhere, but it is not reused here. Exposure is bounded (only one caller — stale-session-sweep.cjs — passes a DB-sourced rather than self-declared session id, and the downstream use of any file content read this way is immediately re-normalized to a validated integer, capping the blast radius well short of command injection or broad content disclosure), but it is a concrete, cheap-to-fix gap worth closing before or shortly after merge.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not blocking FAIL): no exploitable vulnerability was found against the SD\'s own stated threat model (dead/orphaned process). Both MEDIUM findings are either bounded-impact defense-in-depth gaps (S2) or explicitly-designed, well-tested staged-rollout state (S5) rather than silent defects. Recommend addressing S2 promptly (trivial fix, existing convention to copy) and tracking S5/S6 as explicit follow-on work so the "9 fenced call sites" framing does not get read as "SD-lane liveness enforcement is live" when it is not yet wired.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Validate sessionId (isValidSessionId regex) in claimant-liveness.cjs readTickPidfile before path.join (S2).',
      'Track SD-lane liveClaimWriteFenceReason claimantSessionId wiring as explicit open follow-on work, not assumed-closed (S5).',
    ],
    metadata: {
      review_type: 'EXEC_PHASE_SECURITY_REVIEW',
      files_reviewed: [
        'lib/fleet/claimant-liveness.cjs',
        'lib/fleet/claim-eligibility.cjs',
        'lib/quick-fix-claim.mjs',
        'scripts/qf-start.js',
        'scripts/create-quick-fix.js',
        'lib/claim-validity-gate.js',
        'lib/drain-orchestrator.mjs',
        'scripts/claim-orchestrator-for-rollup.mjs',
        'scripts/stale-session-sweep.cjs',
        'tests/unit/claim-liveness-fence-surface-inventory.test.js',
        'database/migrations/20260512_chairman_config_write_rpcs.sql',
        'database/migrations/20251204_multi_session_coordination.sql',
      ],
      review_dimensions: {
        command_injection: 'PASS — pid normalized to validated positive integer before all execCmd call sites',
        fail_direction: 'PASS — fail-open defensible for stated dead-process threat model',
        kill_switch: 'PASS — write access scoped to service-role; fails toward fence-ON on read error',
        bypassability: 'CONCERN — SD-lane liveness sub-check currently inert (claimantSessionId never supplied by its 4 callers); QF lane fully wired',
        information_disclosure: 'PASS — no sensitive data in refusal audit record',
        additional_finding: 'CONCERN — unvalidated sessionId in readTickPidfile path construction (path traversal defense-in-depth gap)',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001',
    },
    phase: 'EXEC',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect (security-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
