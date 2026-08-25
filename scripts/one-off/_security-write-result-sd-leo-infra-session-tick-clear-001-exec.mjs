#!/usr/bin/env node
/**
 * Write SECURITY (Chief Security Architect) EXEC-phase verdict for
 * SD-LEO-INFRA-SESSION-TICK-CLEAR-001 (commit 5ca1858541e).
 *
 * Scope: scripts/hooks/session-register.cjs (stampCcParentPid FR-1 + the PASS-2
 * marker-independent DB-join in closeRotatedOutSessions FR-2/FR-3) and its
 * tests/unit/sessions/ coverage. Reviewed for forgery of metadata.cc_parent_pid,
 * mass-release DoS / blast radius, PostgREST filter injection through the shared
 * release .in('session_id', toCloseIds) write, cross-host isolation via hostname,
 * and standard injection / privilege-escalation / data-exposure concerns.
 *
 * Proportionality: server-internal SessionStart lifecycle hook, no external or
 * user-facing input, no auth/payment/PII path.
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '7eee0052-1da3-4bfb-9509-a090c52b0d25';
const SD_KEY = 'SD-LEO-INFRA-SESSION-TICK-CLEAR-001';

const findings = [
  {
    id: 'S1-forgery-precondition-collapses-into-total-compromise',
    severity: 'INFO',
    summary:
      'PASS on the forgery question (review item 1). stampCcParentPid (session-register.cjs:308-324) writes ONLY its own row: .eq(\'session_id\', sessionId) where sessionId comes from getCurrentSessionId() -> resolveSessionId(), which shape-validates every source through isValidSessionId (/^[a-zA-Z0-9_-]{1,128}$/, lib/hooks/session-id.cjs:57-58, applied at lines 202/204/213/217). There is no code path in this diff by which a session stamps ANOTHER row. The remaining question is whether a non-code-execution actor could forge metadata.cc_parent_pid directly over the API to trick a legitimate session\'s PASS 2 into releasing an arbitrary row. MEASURED with the anon key against live Supabase: anon SELECT on claude_sessions is ALLOWED but returns 0 rows (RLS filters everything -- no metadata read exposure); anon UPDATE returns 42501 permission denied for table claude_sessions; anon INSERT returns 42501. Probed four plausible session-writing RPC names (log_session_event, claim_sd, register_session, upsert_session) as anon: all PGRST202, none reachable with a caller-supplied session_id. Forging metadata.cc_parent_pid therefore requires the SERVICE-ROLE key, which lives in .env on the host -- i.e. it presupposes local file-read/code-execution access, at which point the same actor can simply issue UPDATE claude_sessions SET status=\'released\' directly. The new field grants ZERO additional capability over the pre-existing baseline. Blast radius is further bounded by four safeguards that all survive in the shipped code: the fail-closed identity guard (:389-396, now hoisted so it gates BOTH passes -- a real improvement over round 1), .eq(\'hostname\', hostname) host-scoping, .neq(\'session_id\', currentSessionId) self-exclusion, and the POSITIVE .in(\'status\', [active,idle,stale]) filter that leaves terminal rows alone.',
  },
  {
    id: 'S2-postgrest-in-filter-widening-empirically-demonstrated',
    severity: 'MEDIUM',
    summary:
      'CONCERN, and the direct answer to review item 3: the r?.session_id guard added in 5ca1858541e does NOT fully close the gap. It closes the null/malformed half but leaves a metacharacter half open, and the widening is real -- I demonstrated it against the live DB, not by reading. @supabase/postgrest-js 2.103.0 escapes .in() list elements with PostgrestReservedCharsRegexp = /[,()]/ (dist/index.cjs, in(column, values)): a value matching it is wrapped in double quotes, and DOUBLE-QUOTE ITSELF IS NOT IN THE CHARACTER CLASS. So a value containing `","` breaks out of its own quoting and injects an extra list element. Live proof: .in(\'session_id\', [\'ZZZNOTAREALID","session_08408afd_win23156_30568\']) returned 1 row -- session_08408afd_win23156_30568, a row that was NOT in the list -- while the benign control .in(\'session_id\', [\'ZZZNOTAREALID\']) returned 0. The affected write is the shared release at :459-461, .update({status:\'released\'}).in(\'session_id\', toCloseIds). Note this primitive applies to BOTH passes, and PASS 1 has the cheaper precondition: readTickMarkers (lib/sessions/rotation-closure.cjs:76-92) reads m.session_id out of .claude/pids/tick-*.json with NO shape validation, so anyone who can drop a file into the shared .claude/pids/ directory can plant a crafted id. NOT RATED HIGH, for two measured reasons: (a) every route to get a crafted id into either surface (service-role DB insert, or local FS write) already implies host access sufficient to release rows directly, so there is no privilege gain; (b) PASS 1\'s marker path is PRE-EXISTING and not a regression introduced here -- this SD only added .limit(999) to that line. Recording it as MEDIUM because the fix is one line, the codebase already has the exact validator, and this is the SECOND time this pattern has been flagged in this module family (the SECURITY EXEC verdict for SD-LEO-INFRA-CLAIM-LIVENESS-FENCE-001 raised unvalidated session_id in lib/fleet/claimant-liveness.cjs readTickPidfile and made the same isValidSessionId recommendation). A defect flagged twice across sibling modules is a pattern, not an instance.',
  },
  {
    id: 'S3-parentPid-shape-never-validated-degenerate-bucket-risk',
    severity: 'MEDIUM',
    summary:
      'CONCERN on review item 2 (mass release), from an angle the PRD did not enumerate: parentPid\'s SHAPE is never validated before it is stamped or joined on, and the new main() code is strictly WEAKER than the code it feeds. closeRotatedOutSessions has always derived the pid as `findClaudeCodePid() || process.ppid || process.pid` (:365) -- a `||` chain that rejects every falsy value. main()\'s new derivation (:589-598) instead uses `if (parentPid === undefined || parentPid === null)` before falling back, which ACCEPTS falsy-but-not-nullish, and then passes the value through as overrides.parentPid so the `||` chain is bypassed entirely. stampCcParentPid guards only `=== undefined || === null` as well (:310). findClaudeCodePid has two return paths with asymmetric rigor: the SCAN path validates `/^\\d+$/.test(raw)` before returning (capture-session-id.cjs:246), but the TREE-WALK path returns selected.pid unvalidated -- a bare entry.split(\'|\')[0] off PowerShell stdout (:203-212). An empty-string return would therefore be stamped as metadata.cc_parent_pid:\'\' and PASS 2 would issue .eq(\'metadata->>cc_parent_pid\', \'\'), a match-anything predicate over every equally-degenerate row on the host. That is precisely the failure mode rotation-closure.cjs\'s own header measured and rejected for tty ("\'unknown\' holds 3,582 sessions... would mass-release the entire host\'s live fleet on one hook run") -- the fix fail-closes on the degenerate HOSTNAME bucket but not on a degenerate PID value. LIKELIHOOD IS LOW and I want to be honest about that: Win32_Process ProcessId is always numeric, so the empty-string return needs malformed PowerShell output whose name field still matches claude.exe/node.exe exactly. I verified no degenerate bucket exists today (below). But the mitigation is one regex and it restores strictness the refactor silently dropped.',
  },
  {
    id: 'S4-blast-radius-measured-and-non-destructive',
    severity: 'INFO',
    summary:
      'PASS on the DoS bound (review item 2), measured rather than argued. Full paginated census of claude_sessions: 13,131 rows; ZERO currently carry metadata.cc_parent_pid (the field is unmerged, and session-tick.cjs:292 -- the only other writer -- posts with Prefer: resolution=ignore-duplicates so it fires only on genuine row creation, which session-register almost always wins); ZERO degenerate (non-numeric or 0) pid buckets; the hostname=\'unknown\' bucket PASS 2 fail-closes on is EMPTY. Per-host non-terminal counts: Legion-Laptop 9 non-terminal of 12,977 total; every other host bucket 0 non-terminal. So even a TOTAL degeneration of the pid predicate caps at 9 rows on the only live host -- the host+non-terminal filter, not .limit(999), is the operative bound. On .limit(999) specifically: it is a sane safety bound, not a DoS lever. The UPDATE is filtered by an ENUMERATED .in() list, so maximum releases per hook run = |markers| + 999; a tighter limit would trade a non-issue for silent under-release, which is the defect direction this SD exists to close. On pid reuse: session-tick.cjs cannot seed a degenerate bucket (`parentPid = Number(process.env.CC_PARENT_PID) || 0` then `if (!parentPid) process.exit(0)` at :70-79 guarantees a positive integer), and it stamps a JSON number while stampCcParentPid stamps a string -- harmless, because ->> extracts both as text. Finally, IMPACT IS NON-DESTRUCTIVE AND SELF-HEALING: release flips status only, row content is untouched, and main()\'s upsert payload (:500-508, status:\'active\', onConflict session_id) restores the row on that session\'s next SessionStart. Worst realistic case is tick-daemon loss and observability degradation, not data loss.',
  },
  {
    id: 'S5-cross-host-isolation-is-sound-including-under-spoofing',
    severity: 'INFO',
    summary:
      'PASS on review item 4. getHostname() (session-register.cjs:78-84) returns os.hostname() and only degrades to \'unknown\' if that throws; os.hostname() reads the OS, is not env-influenceable from Node, and PASS 2 fail-closes on \'unknown\' (:437). Tracing the spoofing scenario to its end, as asked: a session can only write hostname onto ITS OWN row (the upsert is keyed on its own session_id). Setting its own hostname to a target host\'s value does not attack anything -- it merely enrolls ITSELF as a release candidate for sessions running on that host. Self-harm, not a cross-host primitive. To cause a VICTIM\'s row to be released you must write to the victim\'s row, which needs service-role, which already permits setting status=\'released\' directly (see S1). So hostname isolation cannot be defeated for gain. One incidental confirmation: 81 rows carry hostname NULL, and SQL .eq(\'hostname\', x) never matches NULL, so that bucket is structurally excluded from PASS 2 without needing a guard.',
  },
  {
    id: 'S6-standard-concerns-clean',
    severity: 'INFO',
    summary:
      'PASS on review item 5. (a) NO SQL injection: everything goes through the supabase-js/PostgREST query builder, never raw SQL; I exercised eight adversarial .in() payloads and four adversarial metadata->>cc_parent_pid .eq() payloads (star, comma, `x)or(session_id.neq.zzz`, bare quote, null element, undefined element, empty array, `7440,session_id.neq.zz`) -- all returned 0 rows with no error and no widening. The ONLY payload that widened is the `","` case in S2, which is a PostgREST list-parsing issue, not SQL. (b) NO command injection: parentPid never reaches a shell anywhere in this diff. (c) NO data exposure: the stderr lines truncate session ids to 8 chars and emit only a pid and a path label; no key material, no metadata contents. (d) NO privilege escalation: the hook already holds the service-role client before any of this code runs; nothing here widens what that client is used for beyond one additional column read and one own-row metadata merge. (e) Metadata merge is CORRECT: stampCcParentPid read-modify-merges with the `typeof === object && !Array.isArray` guard and spreads the existing object (:314-320), matching the captureAccountIdentity precedent and avoiding the bare-metadata clobber that session-tick.cjs:292 would otherwise represent. (f) Fail-open-everywhere is the right direction for a SessionStart hook that runs fleet-wide, and the newly-added independent try/catch around PASS 2 (:434-456) correctly prevents a PASS-2 failure from discarding PASS 1\'s legitimate closures. (g) Tests: 53/53 pass across 4 files in tests/unit/sessions/.',
  },
];

const warnings = [
  'S2 and S3 are both defense-in-depth gaps whose exploitation preconditions already imply host compromise. Neither is a demonstrated privilege-escalation path and neither blocks EXEC-TO-PLAN. They are recorded because both fixes are one-liners and S2 is a repeat of a pattern already flagged on a sibling module.',
  'S3 is a behavioral difference the refactor introduced silently: main() replaced an `||` fallback chain with an `=== undefined || === null` check and then passes the result as overrides.parentPid, bypassing closeRotatedOutSessions\' own `||` chain. Worth naming explicitly in the PLAN handoff so it is not re-derived later as a mystery.',
  'The pre-existing "safety by coincidence" concern the file documents at :382-388 (our own row escapes release only because our marker usually does not exist yet) is now slightly WIDER: PASS 2 is marker-independent, so an incorrect currentSessionId is no longer shielded by marker absence. .neq(session_id, currentSessionId) still structurally excludes self, and self-release self-heals on the next SessionStart upsert, so this is a note, not a finding.',
];

const recommendations = [
  'S2 (recommended, 1 line): filter session ids through the EXISTING isValidSessionId from lib/hooks/session-id.cjs (/^[a-zA-Z0-9_-]{1,128}$/) before they enter toClose -- i.e. strengthen the new `if (r?.session_id && ...)` guard to `if (isValidSessionId(r?.session_id) && ...)`, and apply the same filter to candidateIds built from readTickMarkers. This closes the empirically-demonstrated `","` list-splitting widening on both passes at once, reuses the convention already applied at 6 sites in session-id.cjs and at coordination-inbox.cjs:310-315, and does not depend on postgrest-js ever widening its [,()] escape class.',
  'S3 (recommended, 1 line): require a numeric pid shape before it can be stamped or joined on -- `if (!/^\\d+$/.test(String(parentPid))) return;` in stampCcParentPid, and the same predicate as an additional fail-closed condition alongside `hostname !== \'unknown\'` on the PASS 2 branch. This restores the strictness the `||` chain provided and extends the existing degenerate-bucket fail-closed posture from hostname to pid, which is the axis rotation-closure.cjs\'s own header identifies as the mass-release risk.',
  'S3 (optional, upstream): consider validating the tree-walk return in capture-session-id.cjs findClaudeCodePid (:212) with the same /^\\d+$/ test the scan path already applies at :246. The asymmetry between the two return paths is the actual source of the unvalidated value; fixing it there benefits every consumer of that function, not just this hook.',
  'Non-blocking observation: stampCcParentPid is a read-modify-write with a TOCTOU window (select metadata at :312, update at :318-320), so a concurrent writer\'s newly-added metadata key can be lost. This is the same pattern captureAccountIdentity already uses, the payload is telemetry, and the field is idempotent, so no change is requested -- noted so it is not mistaken for a new defect if it ever surfaces.',
];

const summary =
  'CONDITIONAL_PASS for EXEC-TO-PLAN. The security-relevant design of this change is sound and, in two places, better than what it replaced: hoisting the fail-closed identity guard so it gates BOTH passes removes a drift seam, and the independent try/catch around PASS 2 stops a fallback failure from discarding legitimate PASS 1 closures. The central threat -- forging metadata.cc_parent_pid to make a legitimate session release an arbitrary row -- is NOT reachable below full host compromise: measured live, anon is denied 42501 on both INSERT and UPDATE to claude_sessions and reads back 0 rows under RLS, and no anon-callable session-writing RPC exists, so forgery requires the service-role key from .env, whose holder can already release rows directly. Blast radius was measured rather than argued: 13,131 rows, 9 non-terminal on the only live host, zero rows currently stamped, zero degenerate pid buckets, empty \'unknown\' hostname bucket -- and release is non-destructive and self-heals on the next SessionStart upsert. Two non-blocking findings, each fixable in one line. S2: the r?.session_id guard added in 5ca1858541e does not fully close the malformed-row gap -- postgrest-js 2.103.0 escapes only [,()] and not the double-quote, so I demonstrated live that a single crafted id containing `","` in .in(\'session_id\', ...) matches a row that was not in the list; the precondition (service-role insert, or a planted .claude/pids marker) implies host access, so there is no privilege gain, but the codebase already exports the exact validator (isValidSessionId) and this is the second time the pattern has been flagged in this module family. S3: parentPid\'s shape is never validated, and main()\'s new `=== undefined || === null` check is weaker than the `||` chain it bypasses, leaving a low-likelihood path by which an empty-string pid becomes a match-anything degenerate bucket -- the exact failure mode rotation-closure.cjs\'s header measured and rejected for tty. Cross-host isolation via hostname is sound including under spoofing (spoofing your own row is self-harm, not a cross-host primitive). No SQL injection, no command injection, no data exposure, no privilege escalation. 53/53 unit tests pass.';

const justification =
  'CONDITIONAL_PASS rather than PASS because two real defects were found and empirically confirmed (S2 demonstrated live against the DB, S3 confirmed by reading both return paths of findClaudeCodePid and the changed nullish check). CONDITIONAL_PASS rather than FAIL because neither is exploitable without host access that already permits the same effect directly, the measured blast radius on the live host is 9 non-terminal rows, and the effect of a wrongful release is non-destructive and self-healing. Proportionate to an internal SessionStart lifecycle hook with no external input surface: the two recommendations are one-liners reusing conventions the repo already has, not architectural changes.';

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
    confidence: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'S2: gate toClose membership on isValidSessionId (lib/hooks/session-id.cjs) for BOTH the db_join rows and the readTickMarkers candidateIds, closing the demonstrated `","` .in() list-splitting widening.',
      'S3: require /^\\d+$/ on parentPid before stampCcParentPid writes and before the PASS 2 metadata->>cc_parent_pid join, extending the existing fail-closed degenerate-bucket posture from hostname to pid.',
    ],
    metadata: {
      review_type: 'EXEC_PHASE_SECURITY_REVIEW',
      commit_reviewed: '5ca1858541e',
      branch: 'feat/SD-LEO-INFRA-SESSION-TICK-CLEAR-001',
      files_reviewed: [
        'scripts/hooks/session-register.cjs',
        'lib/sessions/rotation-closure.cjs',
        'scripts/hooks/capture-session-id.cjs',
        'scripts/session-tick.cjs',
        'lib/hooks/session-id.cjs',
        'tests/unit/sessions/rotation-closure-db-join.test.js',
        'tests/unit/sessions/rotation-closure-wiring.test.js',
      ],
      checklist: {
        forgery_metadata_cc_parent_pid:
          'PASS — own-row write only; anon INSERT/UPDATE denied 42501 and anon SELECT returns 0 rows under RLS; forgery requires service-role, which already permits direct release',
        mass_release_dos:
          'PASS — measured 13,131 rows / 9 non-terminal on the only live host; host+pid+non-terminal+neq-self filter is the operative bound; .limit(999) is a sane cap, not a lever; release is non-destructive and self-heals on next SessionStart upsert',
        malformed_row_injection:
          'CONCERN (S2) — r?.session_id guard closes the null half; the metacharacter half stays open because postgrest-js 2.103.0 escapes only [,()] and not the double-quote. Widening demonstrated live.',
        parent_pid_shape:
          'CONCERN (S3) — never validated; main() nullish check is weaker than the `||` chain it bypasses; empty-string pid would create a match-anything degenerate bucket',
        cross_host_isolation:
          'PASS — os.hostname() not env-influenceable; fail-closed on \'unknown\'; spoofing your own row is self-harm, not a cross-host primitive; NULL-hostname rows structurally excluded',
        sql_injection: 'PASS — query-builder only; 12 adversarial payloads exercised, none widened except the S2 PostgREST list-parsing case',
        command_injection: 'PASS — parentPid never reaches a shell in this diff',
        information_disclosure: 'PASS — stderr truncates session ids to 8 chars; no key material or metadata contents logged',
        privilege_escalation: 'PASS — no widening of what the pre-existing service-role client is used for',
        metadata_clobber: 'PASS — read-modify-merge with object/array type guard, matching captureAccountIdentity precedent',
      },
      empirical_evidence: {
        anon_select: 'ALLOWED but 0 rows (RLS)',
        anon_update: 'DENIED 42501 permission denied for table claude_sessions',
        anon_insert: 'DENIED 42501 permission denied for table claude_sessions',
        anon_rpc_probes: 'log_session_event/claim_sd/register_session/upsert_session all PGRST202 (unreachable)',
        total_rows: 13131,
        rows_with_cc_parent_pid: 0,
        degenerate_pid_buckets: 0,
        unknown_hostname_bucket: 'empty',
        non_terminal_by_host: 'Legion-Laptop 9; all other hosts 0',
        in_filter_widening_proof:
          'in(session_id,[\'ZZZNOTAREALID","session_08408afd_win23156_30568\']) returned 1 row (the victim, not in the list); benign control returned 0',
        postgrest_js_version: '2.103.0',
        postgrest_reserved_chars_regexp: '/[,()]/ — excludes the double-quote',
        unit_tests: '53/53 passing across 4 files in tests/unit/sessions/',
      },
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree:
        'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-SESSION-TICK-CLEAR-001',
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

main().catch((e) => {
  console.error('FAILED:', e.message);
  console.error(e.stack);
  process.exit(1);
});
