<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_sd_claim_lifecycle.md -->
<!-- SD Key: SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002 -->
<!-- Archived at: 2026-06-09T12:33:04.749Z -->

# Claim-lifecycle hardening: stop treating parked/terminal SDs as workable

## Type
infrastructure

## Priority
high

## Objective
Close the writer-consumer gaps where a deferred / terminal / parked SD is still treated as claimable or resumable, which causes /checkin resume-loops and duplicate or lost work.

## Scope
- Clear `active_session_id` (not just `claiming_session_id`) in EVERY release path of `scripts/stale-session-sweep.cjs` (sites at L763, L838-840, L854-862, L883-885, L915-920, L1119-1122). Extend the static guard test `tests/unit/scripts/stale-session-sweep-release-payload.test.js` to assert `active_session_id:null` co-occurs with `claiming_session_id:null` at every SD-release site. (DB-side RPCs and `lib/claim-validity-gate.js:353` already clear both columns; the sweep is the lone writer leaving `active_session_id` stale.)
- Guard the `/checkin` resume branch (`scripts/worker-checkin.cjs` runCheckin step 4, L404-409): before returning `action='resume'`, fetch the SD status; if terminal/parked (completed/cancelled/deferred or QF-terminal), self-heal — null `claude_sessions.sd_key` guarded to this session_id and clear `sd.is_working_on/active_session_id/claiming_session_id` where they still point here — then fall through to self-claim. Fail-open on any query error (preserve today's resume behavior). NOTE: scope on the defense-in-depth framing; DROP the `recommendation-feedback.mjs` evidence (verified unrelated to SD claims).
- Widen `scripts/leo-continuous.js` `getNextParentSD()` resume filter (L349) from `status !== 'completed'` to `!['completed','cancelled','deferred','pending_approval'].includes(status)` (mirror the L388-392 baseline fallback plus pending_approval, which awaits LEAD-FINAL not fresh execution).
- Make the park hook write `expected_silence_until` (bounded to the existing 30-min cap) when it stamps `loop_state='awaiting_tick'` (`scripts/hooks/post-tool-loop-state.cjs:43`). This reuses the sweep's existing source-side hold (`stale-session-sweep.cjs:599-605`), so a parked /loop worker is not reaped if PID-marker resolution fails — zero sweep change required (preferred route-a).

## Acceptance Criteria
- Every sweep SD-release nulls `active_session_id` (guard test enforces co-occurrence at all sites).
- A `/checkin` against a deferred/terminal `sd_key` self-heals instead of looping `resume`.
- `leo-continuous` will not re-execute a parked/cancelled/pending_approval SD.
- The park hook sets `expected_silence_until`; all changes fail-open.

## Success Metrics
- No `active_session_id` left set on an SD after a sweep release.
- The documented manual resume-loop recovery becomes unnecessary.
- Parked `awaiting_tick` workers are no longer mis-reaped when PID resolution fails.

## Rationale
`grep 'active_session_id' scripts/stale-session-sweep.cjs` returns ZERO matches; the resume branch reads only `sd_key` with no status query; the leo-continuous exclusion is single-valued; `loop_state` is written by the sweep (:1648-1663) but never read in classification. Matches multiple documented incidents (resume-loop on a coordinator-deferred SD, lost-claim, parked-worker reap). No overlap with the in-flight SD-LEO-FIX-CLAIM-RPC-TERMINAL-001 (that hardens the `claim_sd` RPC — a different surface).
