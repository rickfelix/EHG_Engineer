<!-- Archived from: docs/plans/session-lifecycle-hygiene-plan.md -->
<!-- SD Key: SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 -->
<!-- Archived at: 2026-04-24T14:03:45.677Z -->

# Session-Lifecycle Hygiene: Heartbeat-on-DB-Write + 12 Concurrent Drifts

## Summary

A single LEO Protocol session run on 2026-04-24 surfaced **13 distinct session-lifecycle drift events**, two of which directly caused mid-session claim theft. The shared root cause across most of them is that LEO's session-state machinery has multiple producer paths but no consistent contract: SessionStart hooks, claim writes, sub-agent runs, and DB updates all touch overlapping state without a single owner. This SD consolidates all 13 into one corrective work unit, with priority on the highest-impact bug (#5 — DB writes do not refresh `claude_sessions.heartbeat_at`, causing active sessions to be reaped after 15 min of focused gate-prep work).

## Type

infrastructure

## Priority

high

## Target Application

EHG_Engineer (LEO session lifecycle + claim/heartbeat machinery)

## Parent Memory

Promoted from `feedback_claim_session_lifecycle_four_issues.md` per its own promotion threshold ("parallel session reports independently OR blocks a handoff > 10 min"). The 2026-04-24 session hit BOTH triggers: another session (`4e006d16`) grabbed my SD mid-LEAD-prep, AND each claim recovery cost ~10 min of manual work.

## Success Criteria

- **AC1**: Any LEO script that writes to `strategic_directives_v2`, `product_requirements_v2`, `sub_agent_execution_results`, or `sd_phase_handoffs` for a CLAIMED SD also writes `claude_sessions.heartbeat_at = now()` for the owning session — atomically or as a guaranteed follow-up. Proof: a 15-minute gate-prep run (validation-agent + Explore + 4 SD field updates) keeps `claude_sessions.status='active'` throughout.

- **AC2**: `scripts/hooks/capture-session-id.cjs` upserts a `claude_sessions` row at session start (not just captures the env var). Proof: a fresh CC session can run `/claim` immediately without `no_deterministic_identity` failures.

- **AC3**: `npm run sd:next` SESSION_SETTINGS line reads from `$CLAUDE_SESSION_ID`'s row first (with fallback to most-recent only when env var is absent). Proof: a session with `chain=false` does not see `chain=true` from a peer session in its own queue output.

- **AC4**: `session-check-concurrency` and `sd:next` use the same canonical `getActiveSessions()` helper from `lib/sessions.js`. Proof: both report the same active session list within 1-second skew.

- **AC5**: `sd-start.js` worktree-path resolver uses an explicit `repoRoot` argument resolved from the SD's claim record, not from `process.cwd()`. Proof: re-claiming after a previous worktree creation succeeds even when bash CWD is stuck inside the worktree (no `outside_repo` rejection that releases the claim).

- **AC6**: Heartbeat refresh sets `status='active'` when status was `released` (else it leaves status untouched). Proof: a single `update({heartbeat_at, status:'active'})` re-activates a session previously auto-released by TTL, no separate status flip required.

- **AC7**: `vision-scorer.js` accepts a `--auto-zero-for-engineer` flag (or auto-detects EHG_Engineer target SDs) and persists zero-score dimensions with `LEO_INFRASTRUCTURE_DIMENSIONS_NOT_APPLICABLE` reasoning, eliminating the manual LLM scoring round-trip for engineer-target SDs.

- **AC8**: `phase-preflight.js` discovery gate reads BOTH `exploration_summary.files_explored` AND `exploration_summary.files_examined` (or migrates existing data), and the docs in `CLAUDE_PLAN.md` name the canonical key explicitly. Proof: populating `files_examined` and `files_explored` both pass the gate; the docs unambiguously specify which to use.

- **AC9**: `user_stories` insert errors include the valid enum values for any failing CHECK constraint (status, story_key regex, etc.) instead of the bare PostgreSQL message. Proof: an attempted insert with `status='pending'` returns "valid statuses: draft|ready|completed" in the error path.

- **AC10**: `[Heartbeat] Process exiting (code 0)` log emits a final heartbeat ping before process exit. Proof: trailing `process_alive_at` timestamp on graceful script exit matches the actual exit time within 2 seconds.

- **AC11**: `session-check-concurrency` exits cleanly on Windows Node 24 — no libuv `UV_HANDLE_CLOSING` assertion noise.

## Scope

### FR1 — Heartbeat-on-DB-write middleware (HIGHEST PRIORITY)

Wrap the LEO Supabase client (or add a thin helper) that, for any write to `strategic_directives_v2`, `product_requirements_v2`, `sub_agent_execution_results`, `sd_phase_handoffs`, automatically pings `claude_sessions.heartbeat_at = now()` for the owning session in the same transaction (or immediately after, fail-soft). Expose as `lib/leo/session-keepalive.js` with `withHeartbeat(supabase, sessionId)` returning a wrapped client. Migrate the highest-traffic call sites first: `handoff.js`, `add-prd-to-database.js`, `phase-preflight.js`, `sd-start.js`. Closes drift #5 + #6 (the dominant claim-loss vector observed in the 2026-04-24 session).

### FR2 — SessionStart hook DB upsert

Modify `scripts/hooks/capture-session-id.cjs` to upsert `{session_id: <captured>, status:'active', heartbeat_at: now(), metadata: {auto_proceed: true, chain_orchestrators: false}}` in `claude_sessions` immediately after capture. Today the hook only captures the env var; the DB row is missing until first manual claim. Closes drift #1.

### FR3 — sd:next SESSION_SETTINGS reads $CLAUDE_SESSION_ID first

In `npm run sd:next` (or the underlying script), filter the SESSION_SETTINGS query by `session_id = $CLAUDE_SESSION_ID` first, falling back to most-recent-heartbeat only when the env var is absent. Closes drift #2 (cross-session settings leak).

### FR4 — Consolidate active-session helper

Create `lib/leo/sessions.js` with canonical `getActiveSessions({maxAgeSeconds, includeReleasedWithinSeconds})`. Migrate both `scripts/session-check-concurrency.js` and the `npm run sd:next` script to use it. Closes drift #3 (session-check-concurrency vs sd:next mismatch).

### FR5 — sd-start worktree-path resolver hardening

In `scripts/sd-start.js` (around line 837 per `feedback_sd_start_fails_from_inside_worktree.md`), replace `git rev-parse --show-toplevel` with the `getRepoRoot()` helper from `scripts/lib/repo-paths.js` that walks up to find the canonical main repo root regardless of CWD. Validate worktree path against THAT root, not against the worktree's own toplevel. Closes drift #7 + the existing memory's open issue.

### FR6 — Heartbeat refresh re-activates released sessions

In `scripts/lib/session-helpers.js` (or wherever the heartbeat refresh logic lives), change `update({heartbeat_at})` to `update({heartbeat_at, status: 'active'})` for sessions whose status is `released`. Don't touch status for sessions already `active`. Closes drift #6.

### FR7 — vision-scorer auto-zero for engineer SDs

Add `--auto-zero-for-engineer` flag (or auto-detect via `target_application='EHG_Engineer'`) to `scripts/eva/vision-scorer.js`. When set, persist all dimensions with `score=0` and `reasoning='LEO_INFRASTRUCTURE_DIMENSIONS_NOT_APPLICABLE'`. Avoids the manual LLM round-trip for every LEO-infra SD. Closes drift #8.

### FR8 — phase-preflight discovery gate dual-key support

In `scripts/phase-preflight.js` lines 91-105, also check `sd?.exploration_summary?.files_examined` (in addition to `files_explored`). Migrate existing `files_examined` rows to `files_explored` via a one-shot script. Document the canonical key in `CLAUDE_PLAN.md` "PRD Template Scaffolding". Closes drift #9.

### FR9 — user_stories insert error helpfulness

In `scripts/lib/user-story-helpers.js` (create if needed), wrap user_stories inserts with a try/catch that maps each `*_check` constraint failure to a human-friendly message naming the valid enum values. Closes drift #11 + #12.

### FR10 — Final heartbeat ping on graceful exit

Add a `process.on('exit', ...)` handler in `scripts/lib/heartbeat.js` (or equivalent) that pings `heartbeat_at` synchronously before process termination. Removes the `[Heartbeat] Process exiting (code 0)` log noise and ensures the database reflects actual session liveness. Closes drift #13.

### FR11 — libuv assertion fix

In `scripts/session-check-concurrency.js`, ensure all async handles are properly closed (await `supabase.auth.stop()` where applicable, or set `process.exit(0)` with explicit unref). Closes drift #4.

## Non-Goals

- NOT changing the 15-minute claim TTL (it's the right balance — the bug is heartbeat refresh, not the TTL itself).
- NOT redesigning the session-state machine — wrapping the Supabase client + adding helpers is the minimum scope to close the bugs.
- NOT touching the orphan-QF reaper or other downstream session consumers — they're correct given fresh heartbeat data; this SD just feeds them better data.
- NOT refactoring all 50+ DB-write call sites — FR1 migrates the top 4 highest-traffic; the rest can be migrated incrementally as they become problematic.

## Key Technical Decisions

**Why a wrapper instead of "remember to call heartbeat"**: The 2026-04-24 session writes ~30 DB rows during LEAD prep alone (validation-agent, Explore findings, SD field updates, vision score, exploration_summary, PRD, user stories). Asking 30+ call sites to remember a heartbeat ping is a recipe for the same bug surfacing as a "missing call" in a future SD. A wrapper (`withHeartbeat()`) makes it impossible to write without pinging.

**Why FR1 first**: bug #5 is the dominant claim-loss vector observed in the 2026-04-24 session. All other drifts cost minutes; this one costs the entire SD if a peer session steals the claim during the gap. Ship FR1 with FR6 as a tight pair (write refreshes heartbeat AND re-activates status), defer the rest to subsequent commits within this SD.

**Why consolidate vs split into N small SDs**: All 13 drifts share the same machinery (claude_sessions table + session-state helpers). Splitting would mean N PRs touching overlapping code, N retrospectives, N gate runs. Consolidation is the right grain for shared-machinery work. (Compare: SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 consolidated two related gate fixes for the same reason.)

## Supporting Evidence

- **Primary incident**: 2026-04-24 session running `SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001` (ironically the SD that fixed the retrospective gate). Session id `4b78a802-b4ed-4333-ba36-8b9f13aad0b8`. Lost claim TWICE — first to peer session `4e006d16-8f1f-434b-abc3-68a7fb691b86` mid-LEAD-prep, then again after PR push. Both times manual recovery required heartbeat refresh + sd-start re-claim.
- **All 13 drifts** are documented in the closing report of that SD's session, captured in feedback memory.
- **Existing memory**: `feedback_claim_session_lifecycle_four_issues.md` documented 4 of these drifts with the explicit promotion threshold "promote to SD if any blocks a handoff > 10 min OR a parallel session reports independently". Both triggers fired on 2026-04-24.

## Estimated Scope

~300-500 LOC across:
- New `lib/leo/session-keepalive.js` (~80 LOC) + `lib/leo/sessions.js` (~60 LOC)
- Migration of top 4 call sites to `withHeartbeat()` (~40 LOC)
- Hardening `capture-session-id.cjs` (+30 LOC), `sd-start.js` (~20 LOC), `vision-scorer.js` (+40 LOC), `phase-preflight.js` (+10 LOC)
- New unit tests for the helpers (~150 LOC)
- Doc updates in CLAUDE_PLAN.md + new CLAUDE_CORE.md section on session lifecycle (~50 LOC of markdown)

Tier 3 per CLAUDE.md Work Item Routing → full SD workflow (infrastructure type: 4 handoffs, skip EXEC-TO-PLAN, 80% gate threshold). DOCMON required for the new CLAUDE_CORE.md section. May warrant decomposition into 2 children (FR1+FR6 as Phase A, the rest as Phase B) — defer that decision to PLAN phase.

## Risks

- **Risk**: Heartbeat-on-write wrapper adds a DB round-trip to every write. **Mitigation**: pings are fail-soft (errors logged, never thrown), and `claude_sessions` updates on a row indexed by session_id are sub-millisecond. Negligible latency vs the cost of a single claim loss (10+ min recovery).
- **Risk**: `capture-session-id.cjs` upsert could collide with concurrent SessionStart hooks across CC restarts. **Mitigation**: upsert with `onConflict: 'session_id'` is idempotent; the same session_id always maps to the same row.
- **Risk**: `sd-start.js` worktree resolver change could break the existing happy path where bash CWD is at main repo root. **Mitigation**: `getRepoRoot()` helper from `scripts/lib/repo-paths.js` is already battle-tested by `lead-final-approval/gates.js`. Use the same helper.
