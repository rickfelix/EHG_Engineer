/**
 * SECURITY sub-agent evidence writer for SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001 (EXEC-TO-PLAN).
 *
 * Companion to canonical execute-subagent.js row 53e36ed7. That run DID measure the correct tree
 * (executed_from_cwd = this worktree, evaluated_commit_sha = 91ec5d40 = worktree HEAD; the
 * sibling TESTING agent's cwd bug did not reproduce because this run was invoked FROM the
 * worktree). But it is stamped phase='EXEC', not 'EXEC-TO-PLAN', and it answers a generic
 * repo/catalog-wide question, not the five diff-specific concerns under review. This row carries
 * the diff-specific verdict at the handoff phase.
 */
import { execSync } from 'child_process';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = '71fb0b59-adb5-4c65-88d3-5fe788b062d1';
const SD_KEY = 'SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001';

const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

const results = {
  verdict: 'PASS',
  confidence_score: 93,
  summary:
    'Backend-only Node.js diff adding an optional, additive opts.urgency stamp to the shared '
    + 'coordinator dispatch chokepoint, plus a pure predicate module, a comment-only pointer fix and a '
    + 'docs subsection. No injection, log-forgery, authorization-bypass, secret-disclosure or DoS vector '
    + 'found. All five reviewed concerns verified by behavioural probe, not by reading alone. The change '
    + 'grants no capability a caller did not already have: row.payload is unrestricted JSONB, so any '
    + 'caller reaching insertCoordinationRow could already write payload.urgency (and any other key) '
    + 'directly. Two LOW hardening advisories, neither blocking.',
  critical_issues: [],
  warnings: [
    {
      severity: 'LOW',
      issue:
        'The fail-open warning path can itself THROW, defeating the stated "never throws / fail-open" '
        + 'contract. lib/coordinator/dispatch.cjs:1478 calls JSON.stringify(urgency) OUTSIDE any try/catch. '
        + 'Probed: a BigInt urgency throws TypeError "Do not know how to serialize a BigInt"; a circular '
        + 'object throws "Converting circular structure to JSON"; an object with a throwing toJSON() '
        + 'propagates its own Error. The thrown error carries no .code, so callers that branch on '
        + 'e.code (the convention everywhere else in this function) cannot classify it.',
      recommendation:
        'Wrap the stringify (or use String(urgency)) so the fail-open promise holds for every input. '
        + 'Impact is bounded: a non-JSON-serializable payload value would also fail postgrest-js '
        + 'serialization at the insert, so the net effect is an earlier throw with a less specific '
        + 'message rather than a new failure mode. Not blocking.',
    },
    {
      severity: 'LOW',
      issue:
        'The warning interpolates the FULL urgency value with no length bound. Probed: a 1 MB urgency '
        + 'string produces a 1,000,002-character single log line. dispatch.cjs own convention at the '
        + 'sibling observe-only warns is String(row.subject || "").slice(0, 120).',
      recommendation:
        'Truncate to match house style, e.g. JSON.stringify(urgency).slice(0, 200). Log-volume only - '
        + 'the DB write itself is not a new exposure (payload is unrestricted JSONB regardless). Not blocking.',
    },
    {
      severity: 'INFO',
      issue:
        'JSON.stringify escapes every ASCII control character (newline, CR, ESC -> \\u001b, NUL -> \\u0000) '
        + 'and quotes, but does NOT escape U+2028/U+2029. Probed: hostile newline/ANSI/quote/JSON-breaking '
        + 'urgency values all collapse to exactly 1 log line with no raw ESC; only the U+2028 case passes '
        + 'the separator through literally.',
      recommendation:
        'No action required. Standard terminals and newline-splitting log ingest do not treat U+2028 as a '
        + 'line break, so this is not a practical forgery vector. Recorded for completeness.',
    },
    {
      severity: 'INFO',
      issue:
        'INHERITED / OUT OF SCOPE, recorded so it is not misattributed to this SD: the canonical '
        + 'execute-subagent.js run (row 53e36ed7) returned CONDITIONAL_PASS on two standing platform '
        + 'conditions - (a) HIGH: the RLS table census RPC public.get_tables_without_rls is missing from '
        + 'the schema cache, so RLS posture is UNVERIFIED, and (b) CRITICAL: 59 pre-existing SECURITY '
        + 'DEFINER functions are anon/authenticated-EXECUTE-able.',
      recommendation:
        'Neither is attributable to this diff, which contains zero SQL, zero migrations and zero RLS, '
        + 'policy, auth or database-surface changes. Track separately as platform posture; they must not '
        + 'gate this handoff.',
    },
  ],
  recommendations: [
    'No blocking action. Proceed to PLAN verification.',
    'Optional hardening (single line, non-blocking): bound and guard the fail-open warn - '
      + 'logger.warn(`... ${safeStringify(urgency).slice(0, 200)} ...`) - to make the documented '
      + '"never throws" contract literally true and match the file existing truncation convention.',
  ],
  metadata: {
    phase: 'EXEC-TO-PLAN',
    measured: true,
    assessment_method: 'static review of the full uncommitted diff PLUS executable behavioural probes',
    measurement_tree: {
      branch,
      head_sha: headSha,
      working_tree: 'dirty (implementation uncommitted at measurement time, read via git diff)',
      main_repo_head_for_contrast: '5a92ab6623fe9af303b015b6a085d92d13abbb7b',
      changed_files: [
        'lib/coordinator/urgency-levels.cjs (NEW, 24 LOC)',
        'lib/coordinator/dispatch.cjs (MODIFIED, +22 net at :1456-1484)',
        'scripts/hooks/coordination-inbox.cjs (MODIFIED, comment-only)',
        'docs/protocol/coordinator-adam-comms.md (MODIFIED, docs-only, +34)',
        'tests/unit/coordinator/dispatch-urgency-stamp.test.js (NEW, 181 LOC)',
      ],
    },
    threat_model_note:
      'The caller of insertCoordinationRow is trusted in-fleet Node code already holding a service-role '
      + 'Supabase client and already able to write arbitrary JSONB into row.payload (the diff own comment '
      + 'states this). opts.urgency therefore widens no trust boundary and creates no new attacker-reachable '
      + 'surface; it renames an existing capability behind a validated option.',
    concerns_assessed: {
      C1_injection: {
        verdict: 'NO_FINDING',
        evidence: [
          'Write path is supabase.from("session_coordination").insert(row) -> postgrest-js -> HTTP JSON body. No raw SQL, no string concatenation into a query, no dynamic identifier. Values are transported as JSON and bound server-side by PostgREST.',
          'The payload key is the HARDCODED shorthand identifier `urgency` in { ...payload, urgency } - it is NOT a computed/caller-supplied key, so no key-injection.',
          'Probed prototype pollution: urgency = the string {"__proto__":{"polluted":true}} and the parsed object {"__proto__":{"pwn":1}} both left Object.prototype untouched (({}).polluted === undefined, ({}).pwn === undefined); merged own keys stayed exactly ["kind","urgency"].',
          'Probed JSONB escape: a value crafted as "},"kind":"fleet_kill_switch","actor":"evil","x":{" cannot escape the payload object - it is a JSON string VALUE, serialized with quotes escaped, and lands as payload.urgency verbatim. It cannot forge a sibling key such as kind/actor.',
          'Reader side is .eq("payload->>urgency", "interrupt") - an exact-equality parameterized filter. An arbitrary value simply fails to match, so an attacker string cannot even escalate itself into the uncapped/interrupt lane.',
        ],
      },
      C2_log_injection: {
        verdict: 'NO_FINDING (one INFO residual)',
        evidence: [
          'Probed 7 hostile strings through the exact warn expression. Every one produced exactly 1 log line.',
          'Newline forgery blocked: a value containing a newline plus "[dispatch] FORGED: kill switch authorized" has the newline escaped to a literal two-character sequence; output stays 1 line.',
          'CRLF forgery blocked: CR and LF both escaped, 1 line.',
          'ANSI/terminal injection blocked: ESC (U+001B) is below 0x20 so JSON.stringify escapes it to \\u001b; probe confirmed the output contains NO raw ESC byte.',
          'Quote-breakout blocked: the value is always JSON-QUOTED, so it can never be confused with the surrounding literal prose of the warn message.',
          'NUL/BEL/BS escaped to \\u0000 / \\u0007 / \\b.',
          'Residual (INFO only): U+2028/U+2029 are not escaped by JSON.stringify. Not a practical forgery vector for a console or newline-split consumer.',
        ],
      },
      C3_authorization: {
        verdict: 'NO_FINDING - purely additive, no existing guard weakened, reordered or short-circuited',
        evidence: [
          'Read lib/coordinator/dispatch.cjs:1456-1836 (the whole function, insert at :1832). The new block is inserted at :1475-1484, immediately after the pre-existing topicId merge and before every guard. It contains no return, no throw, no early exit and no control flow over any guard - it only adds one key to row.payload. Every guard that existed before still runs, in the same order.',
          'ORDERING IS SAFE, verified rather than assumed. The review brief expected the block AFTER all guards; it is in fact BEFORE them, so I tested whether a hostile urgency can flip a guard verdict.',
          'assertKillSwitchAuthorized (:1017) keys on payload.kind !== KILL_SWITCH_KIND and requires payload.actor + payload.reason + an active-coordinator identity check. An added `urgency` key cannot create, remove or alter kind/actor/reason - object spread with a fixed key name cannot overwrite a sibling key. Probed: {...{kind,actor}, urgency} -> keys ["kind","actor","urgency"], both originals intact.',
          'describeUnreadableAssignment / describeUndirectableAssignment (lib/fleet/assignment-target.cjs) were the only real risk, because the "worker" profile includes a TEXT SCAN. Verified the scan source: keysInText() reads ONLY row.subject, row.body and payload.body - it never stringifies the whole payload. Probed directly: payload.urgency = "SD-REAL-LOOKING-001" yields resolveAssignmentTarget -> {key:null, source:null, ambiguous:false, candidates:[]}, i.e. the injected key is invisible to the resolver. readSource() likewise consults only the 8 named SOURCES, and `urgency` is not one of them.',
          'Behavioural A/B on the guard verdicts: an unresolvable WORK_ASSIGNMENT returns unreadable=true, undirectable=true identically with no urgency, with urgency="SD-FAKE-INJECTED-001", and with urgency="interrupt". The ONLY observable difference is the diagnostic string listing one extra payload key name. No verdict changed.',
          'Other payload-reading guards all key on payload.kind (work_assignment/message_type mismatch, Adam untyped-kind, BACKPRESSURE_EXEMPT_KINDS, INFORMATIONAL_KINDS) or on row.message_type - none reads payload.urgency. isReplyRow reads kind/reply_to; isAdamInboxRow reads kind.',
          'dispatchToWorker remains a thin wrapper: insertCoordinationRow(supabase, row, { ...opts, targetRoleHint: opts.targetRoleHint ?? "worker" }). opts.urgency passes through unchanged and the pre-existing ?? idiom is untouched.',
          'Regression evidence: npx vitest run --project unit tests/unit/coordinator/ -> 110 files / 1364 tests, all passing, including the exported choke-guard fixtures (assertKillSwitchAuthorized, assertFleetAssignmentTarget, assertCorrelationNotDisposed, assertSendBackpressure, assertAddresseeRoleMatch).',
        ],
      },
      C4_doc_comment_disclosure: {
        verdict: 'NO_FINDING',
        evidence: [
          'Scanned the additive lines of both docs/protocol/coordinator-adam-comms.md and scripts/hooks/coordination-inbox.cjs for credentials, tokens, JWTs, API keys, connection strings, absolute internal URLs, emails and phone-shaped PII: zero matches.',
          'The doc code sample uses the VARIABLE workerSessionId, not a literal session UUID, so no live identifier is disclosed.',
          'Only identifiers present are internal governance references (QF-20260912-269, PR #8889, the SD key) and one relative markdown link - appropriate for internal engineering documentation.',
          'coordination-inbox.cjs change is comment-only; git diff confirms zero executable lines changed (no logic, no query, no control flow).',
          'Bonus correctness check on the stale-pointer fix that motivated the SD: the NEW pointer resolves. docs/reference/fleet-coordination.md exists and line 173 is the heading "Urgency classes (payload.urgency)", matching the anchor #urgency-classes-payloadurgency. The fix does not itself introduce a second stale pointer.',
        ],
      },
      C5_denial_of_service: {
        verdict: 'NO_FINDING',
        evidence: [
          'isKnownUrgency is typeof + Array.prototype.includes over a 1-element frozen array - O(1), no regex, no I/O, no allocation, no network.',
          'Benchmarked in-process: 200,000 calls with a valid value = 1.4 ms (~7 ns/call).',
          'Length-amplification tested explicitly: 200,000 calls with a 1 MB string = 1.2 ms, i.e. NOT slower. SameValueZero comparison short-circuits on length, so cost is independent of attacker-controlled string size - there is no quadratic or length-proportional path.',
          'Object spread { ...payload, urgency }: 200,000 iterations = 2.7 ms, a shallow copy of an already-small object, and the function already performs the identical spread for topicId, correlation_id, protocol_comms_version and the body mirrors. It adds no new order of work.',
          'The added work is negligible against the function existing cost, which is dominated by ~6 awaited network round-trips (assertValidTarget, assertKillSwitchAuthorized, assertSdDispatchable, findExistingCorrelationRow, assertSendBackpressure, assertCorrelationNotDisposed).',
          'Only LOW-rated amplification is log VOLUME on the fail-open warn (see the un-truncated warning above), not CPU or DB.',
        ],
      },
    },
    companion_row: {
      id: '53e36ed7-cf1e-41d2-b785-4365dbebb375',
      relationship: 'companion, NOT superseded - it measured the correct tree',
      executed_from_cwd: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-FIX-COORDINATOR-RULING-REVERSES-001',
      evaluated_commit_sha: '91ec5d40115d2a1a7ac7f9367a6f19426929f496',
      note:
        'The cwd-resolution bug the sibling TESTING agent hit did NOT reproduce for SECURITY, because '
        + 'execute-subagent.js was invoked FROM INSIDE the worktree: executed_from_cwd is the worktree and '
        + 'evaluated_commit_sha is the worktree HEAD (91ec5d40), not main (5a92ab66). metadata.repo_path is '
        + 'the registered applications.local_path by design (the SUB_AGENT_REPO_RESOLUTION contract), not a '
        + 'misresolution. Two real limitations remain: it is stamped phase="EXEC" rather than '
        + '"EXEC-TO-PLAN", and its generic 6-phase scan assessed none of the five diff-specific concerns.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  fallback: process.cwd(),
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'SECURITY',
  SD_UUID,
  { code: 'SECURITY', name: 'Chief Security Architect' },
  results,
  { phase: 'EXEC-TO-PLAN', sdKey: SD_KEY }
);

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2).slice(0, 900));
