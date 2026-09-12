'use strict';

/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001 FR-2/FR-3: the exact, exhaustive,
 * hand-verified enumeration (file:line) of every durable insertCoordinationRow() caller,
 * partitioned into FR-2 (CLI entrypoints — the file has a process.exit/process.exitCode
 * mechanism) and FR-3 (non-CLI durable lib/ and script callers — no exit mechanism).
 *
 * Method: `insertCoordinationRow\(` grepped across scripts/ and lib/, excluding
 * scripts/one-off/, *.json, *.test.*, scripts/lint/, lib/coordinator/dispatch.cjs (the
 * definition site) and lib/coordinator/dispatch.test.js. 27 files matched; TWO were excluded
 * as false positives (grep matched a COMMENT mentioning insertCoordinationRow, not an actual
 * call — both perform a deliberate raw insert instead, documented inline at the call site) —
 * see EXCLUDED_FALSE_POSITIVES. The remaining 25 real callers (14 FR-2 files + 11 FR-3
 * files/13 call sites) are a complete partition: every entry appears in exactly one FR.
 *
 * `disposition` values:
 *   'migrated'      — explicitly checks isDeliveredDispatchError()/`.landed` before branching
 *                      on the outcome (the 3 files with the old hand-rolled `if (e.landed)`
 *                      pattern, refactored onto the shared predicate by the FR-1 commit).
 *   'fixed-this-sd' — had a genuine defect (see `note`) fixed by this SD's FR-3 commit.
 *   'exempt-*'      — verified SAFE with no code change: the call site has no branch that
 *                      could mis-surface a delivered/parked (landed===true, data===null,
 *                      error===null) outcome as a failure. The exempt-* suffix names WHY,
 *                      each independently verified by reading the call site's own source.
 */

const FR2_CLI_ENTRYPOINTS = [
  // QF-20260905-317 shifted this call site from line 1392 -> 1401 (pre-send-consult block
  // reordered after the dedup check).
  { file: 'scripts/adam-advisory.cjs', line: 1401, disposition: 'migrated' },
  { file: 'scripts/solomon-advisory.cjs', line: 1438, disposition: 'migrated' },
  { file: 'scripts/worker-signal.cjs', line: 266, disposition: 'migrated' },
  { file: 'scripts/worker-signal.cjs', line: 422, disposition: 'migrated' },
  // QF-20260905-123 shifted these two call sites from 597/762 -> 603/768 (buildSolomonConsultPayload
  // gained an originSession param + a 6-line block above them in the same file).
  { file: 'scripts/worker-signal.cjs', line: 603, disposition: 'migrated' },
  { file: 'scripts/worker-signal.cjs', line: 768, disposition: 'migrated' },
  {
    file: 'scripts/ack-chairman-directive.cjs', line: 103,
    disposition: 'exempt-fire-and-forget',
    note: 'Bare `await insertCoordinationRow(...)` — no destructuring of the result, no branch reads .data/.error/.landed. The file\'s process.exit paths are unrelated arg-validation gates earlier in main().',
  },
  {
    file: 'scripts/adam-adherence-staleness-check.mjs', line: 109,
    disposition: 'exempt-generic-catch-all',
    note: 'process.exitCode=1 is set from `out.results.some(r => r.error)`, where r.error is populated by a generic per-check try/catch. Post-FR-1 the delivered case no longer throws, so that catch never fires for it — the exit gate is untouched and correct.',
  },
  {
    file: 'scripts/stale-session-sweep.cjs', line: 334,
    disposition: 'exempt-fire-and-forget',
    // QF-20260911-750: shifted from 322 -- added the heartbeat-freshness pre-release check
    // earlier in the file. A SECOND bare call (line 358, the release-notice-to-self insert)
    // was also added right after this one; both are the same fire-and-forget shape (no
    // destructuring, no landed-dependent branch) so one exemption covers both.
    note: 'Bare `await insertCoordinationRow(...)` inside a sweep loop (two call sites, 334 and 358, both the same shape); no destructuring, no landed-dependent branch. process.exit elsewhere in the file is unrelated (CLI arg/mode handling).',
  },
  {
    file: 'scripts/issue-chairman-directive.cjs', line: 60,
    disposition: 'exempt-fire-and-forget',
    note: 'Bare `await insertCoordinationRow(...)`, immediately followed by unconditional console.log — no result destructuring at all.',
  },
  {
    file: 'scripts/dispatch-suggestion-override.mjs', line: 58,
    disposition: 'exempt-guarded-ternary',
    note: '`if (!res || res.error) throw ...; return res.data ? res.data.id : null;` — the ternary already guards a null `data` (the delivered/parked shape) without throwing; returns null id rather than mis-reporting failure. main()\'s process.exit(1) paths are separate CLI arg-validation gates.',
  },
  {
    file: 'scripts/cron/batch-mint-sweep.mjs', line: 53,
    disposition: 'exempt-non-branching-destructure',
    note: 'QF-20260911-382: call site moved into defaultInsertConsultRow, a thin pass-through wrapper so openConsultRow can accept an injected insertRow stub for tests; the destructure (now result.data/.error in the caller) still does not branch process.exit on either — fire-and-log, not an exit-code decision.',
  },
  {
    file: 'scripts/coordinator-revive.cjs', line: 146,
    disposition: 'exempt-promise-catch-log-only',
    // QF-20260911-753: shifted 135 -> 139 (round 1: added a comment above the OTHER
    // insertCoordinationRow call at line 104) -> 146 (round 3: added a 6-line comment
    // above THIS call documenting the missed-writer fix for insertSpawnRequest's own
    // SPAWN_REQUEST broadcast).
    note: '`.then(...).catch((e) => console.warn(...))` — logs, never calls process.exit; the row insert above it (line 104, reapExpiredPendingRequests) is also a fire-and-forget `.catch(console.warn)`.',
  },
  {
    file: 'scripts/adam-quiet-tick.mjs', line: 1537,
    disposition: 'exempt-fail-soft-try-catch',
    // QF-20260911-888: shifted from (1506, 1509) — added CHECK_BOARD_STALE_TIMEOUT_MS,
    // withTimeout(), and the wall-clock guard around checkBoardStale's fetchAllPaginated
    // call earlier in the file (hang past a 150s external timeout, 2026-09-11).
    // QF-20260912-125: shifted from (1528, 1531) — 9 lines added earlier in the file
    // (checkRatificationRegressions' new contractCoverageUnpinnable backlog count).
    note: 'Both call sites (1537, 1540) sit inside `try { ... } catch { /* fail-open/fail-soft */ }` blocks that never call process.exit — they only gate an in-memory `acctNotified` flag.',
  },
  {
    file: 'scripts/three-way-comms-drill.mjs', line: 155,
    disposition: 'exempt-test-fixture-expects-throw',
    note: 'A drill/test helper that deliberately triggers a DIFFERENT throw code (DISPATCH_TARGET_INVALID/UNKNOWN, an out-of-scope refusal, not landed=true) and asserts on it — not a landed-outcome consumer. process.exit is not used at this site.',
  },
  {
    file: 'scripts/worker-checkin.cjs', line: 433, // QF-20260905-282 shifted this from 427 (new --stand-down help text added above)
    disposition: 'exempt-guarded-ternary',
    note: '`return { id: data && data.id, deduped: false };` — already null-safe for the delivered shape (data===null yields id:null, no throw). This is a roll_call heartbeat ping; not exit-code-gated.',
  },
  {
    file: 'scripts/coordinator-capacity-forecast.mjs', line: 359,
    disposition: 'exempt-error-only-check',
    note: '`return !res.error;` — for a delivered outcome error is null, so this already (correctly) returns true (success). Uses process.exitCode elsewhere in the file for unrelated reasons.',
  },
  {
    file: 'scripts/coordinator-capacity-forecast.mjs', line: 567,
    disposition: 'exempt-error-only-check',
    note: 'Same shape as line 359 — `return !res.error;`.',
  },
];

const FR3_NON_CLI_CALLERS = [
  {
    file: 'lib/coordinator/coordination-events.cjs', line: 475,
    disposition: 'fixed-this-sd',
    note: 'emitInertWorkerAlert: `return { ok: true, id: data.id };` would throw a TypeError on the delivered shape (data===null), caught by the outer catch and reported as {ok:false}. Fixed by checking isDeliveredDispatchError(result) before dereferencing data.id.',
  },
  {
    file: 'lib/coordinator/coordination-events.cjs', line: 594,
    disposition: 'fixed-this-sd',
    note: 'emitCompletionBoundaryExitAlert: identical shape/fix to line 475.',
  },
  {
    file: 'lib/coordinator/coordination-events.cjs', line: 750,
    disposition: 'fixed-this-sd',
    note: 'emitNotificationWaitAlert: identical shape/fix to line 475.',
  },
  {
    file: 'lib/coordinator/coordination-events.cjs', line: 967,
    disposition: 'fixed-this-sd',
    note: 'runReaperStarvationSurfacing\'s alert emit: identical shape/fix to line 475.',
  },
  {
    file: 'lib/fleet/sweep-findings-sink.cjs', line: 66,
    disposition: 'fixed-this-sd',
    note: 'emitFindingAlert: `return { ok: true, id: data.id };` had the identical data.id-on-null defect as coordination-events.cjs; fixed the same way.',
  },
  {
    file: 'lib/coordinator/kill-switch-writer.cjs', line: 207,
    disposition: 'exempt-no-production-consumer',
    note: '`return insertCoordinationRow(...)` with no catch — propagates the FR-1 additive-return shape (or a genuine throw for any other code) straight to its caller unmodified. fireFleetEnforcementKill has no production caller yet (only its own unit test) — nothing dereferences `.data.id` on this return today, so there is no live mis-surfacing path. A future consumer inherits the correct FR-1 shape by construction; regression-tested below to prove the delivered case now resolves rather than rejects.',
  },
  {
    // QF-20260905-123 shifted this call site from 125 -> 131 (an originatorSessionId param +
    // comment added above it in the same function).
    file: 'lib/adam/presend-consult-lane.cjs', line: 131,
    disposition: 'exempt-guarded-ternary',
    note: '`insertResult && !insertResult.error && insertResult.data && insertResult.data.id ? insertResult.data.id : null` — already null-safe for the delivered shape; documented in-file as "consultRowId comes back null" on this path. No crash, no false-failure report.',
  },
  {
    file: 'lib/chairman/sms-bridge.js', line: 1104,
    disposition: 'exempt-fire-and-forget',
    note: 'Bare `await insertCoordinationRow(...)`, no destructuring — `resultEntry.routedToAdam = true` is set unconditionally afterward regardless of outcome.',
  },
  {
    // QF-20260905-123 shifted this call site from 534 -> 543 (an originatorSessionId variable +
    // comment added above it in the same function, plus a metadata field added to a later insert
    // in this file that does not itself hold a census entry).
    file: 'lib/comms/adam-outbound/chairman-sms-gate/index.js', line: 543,
    disposition: 'exempt-pass-through-di',
    note: 'A dependency-injection adapter (`insertCoordinationRow: (row, opts) => insertCoordinationRow(supabase, row, opts)`) handed to presend-consult-lane.cjs, which already handles the FR-1 shape safely (see that entry above). This file never itself inspects the result.',
  },
  {
    file: 'lib/fleet/dispatch-suggestions.cjs', line: 214,
    disposition: 'exempt-guarded-ternary',
    note: '`if (!res || res.error) return null; return res.data ? res.data.id : null;` — already null-safe; returns null (documented as "or null on failure") for a delivered outcome rather than throwing. No crash.',
  },
  {
    file: 'lib/fleet/account-usage-exhaustion-advisory.cjs', line: 81,
    disposition: 'exempt-fire-and-forget-unconditional',
    note: 'Bare `await insertCoordinationRow(...)` followed unconditionally by `return { emitted: true, verdict: ... }` — never checked .error either before this SD, so behavior for a delivered outcome is unchanged and was never a source of false-failure reporting.',
  },
  {
    file: 'scripts/coordinator-self-review.mjs', line: 308,
    disposition: 'exempt-outer-catch-log-only',
    note: 'Wrapped in `try { ... } catch (e) { solicitFailed++; console.error(...) }` — the delivered case no longer throws post-FR-1, so this counter path (already non-fatal, no exit) is simply never reached for it.',
  },
  {
    file: 'scripts/coordinator-self-review.mjs', line: 322,
    disposition: 'exempt-outer-catch-log-only',
    note: 'Same shape/reasoning as line 308 (the bidirectional Adam-solicitation leg). Line shifted from 299 by QF-20260906-891 (interruptibility filter added above the solicit loop).',
  },
  {
    file: 'scripts/coordinator-comms-check.mjs', line: 84,
    disposition: 'exempt-fire-and-forget',
    note: 'Bare `await insertCoordinationRow(...)` inside an IIFE loop, no destructuring.',
  },
  {
    file: 'scripts/cron/drive-report-sms-sweep.mjs', line: 71,
    disposition: 'exempt-passthrough-return',
    note: '`return insertCoordinationRow(...)` — returns the FR-1 shape straight to its own caller unmodified, same non-dereferencing pattern as kill-switch-writer.cjs.',
  },
];

/**
 * Two grep hits that are NOT durable callers: the matched line is a COMMENT mentioning
 * insertCoordinationRow, not an invocation. Both perform a deliberate raw
 * `.from('session_coordination').insert(...)` instead, each with its own documented reason an
 * eslint-disable-next-line comment names inline. Recorded here so the census total (27 grep
 * hits - 2 false positives = 25 real callers = 14 FR-2 + 11 FR-3 files) is auditable rather than
 * silently dropped.
 */
const EXCLUDED_FALSE_POSITIVES = [
  {
    file: 'lib/fleet/canary-session.js', line: 172,
    reason: "Raw insert; insertCoordinationRow's assertValidTarget refuses a target_session with no existing claude_sessions row, which is precisely what pre-registering a not-yet-minted session id requires — the canonical choke point cannot express this write by construction.",
  },
  {
    file: 'scripts/hooks/coordination-inbox.cjs', line: 578,
    reason: "Raw insert (transport-ack DELIVERED marker); whether this should route through insertCoordinationRow is an open design question tracked separately at QF-20260907-402, not this SD's scope.",
  },
];

module.exports = { FR2_CLI_ENTRYPOINTS, FR3_NON_CLI_CALLERS, EXCLUDED_FALSE_POSITIVES };
