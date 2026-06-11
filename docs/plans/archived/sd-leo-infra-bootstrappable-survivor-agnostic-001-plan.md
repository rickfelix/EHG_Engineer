<!-- Archived from: scripts/one-off/_plan-survivor.md -->
<!-- SD Key: SD-LEO-INFRA-BOOTSTRAPPABLE-SURVIVOR-AGNOSTIC-001 -->
<!-- Archived at: 2026-06-07T20:43:09.549Z -->

# DB-bootstrappable, survivor-agnostic post-restart recovery protocol — a fresh coordinator with ZERO survivors reconstructs in-flight state + identity purely from the DB

## Type
infrastructure

## Priority
medium

## Summary
The 2026-06-07 Anthropic API issue restarted the coordinator + all 6 workers; the Adam advisory session happened to survive and bridged continuity (re-established the coordinator, flagged orphaned in-flight work, re-sent lost context). But the survivor set is NON-DETERMINISTIC — it depends on what each session was doing when the API issue hit (idle may be spared, mid-call gets killed). Next time the coordinator + workers + Adam could ALL be gone. Recovery must therefore be SURVIVOR-AGNOSTIC: it must work in the worst case of zero survivors, with no reliance on a lucky session holding context in its conversation.

## Principle
The DB already carried SD / orchestrator-program / claim state through the restart intact — that is the survivor-agnostic backbone, and it worked. The GAP is the session-level glue that needed a survivor this time: who is the coordinator, the comms relationships, and re-dispatching in-flight work. This SD makes that glue DB-bootstrappable.

## Scope (EHG_Engineer)
Define a recovery protocol a fresh coordinator runs on startup (assuming zero prior-session survivors), reconstructing cold from the DB:
- IN-FLIGHT WORK: enumerate mid-flight SDs (status in_progress / sd:next) + the orchestrator->children structure; detect ORPHANED claims (claiming_session_id whose claude_sessions row is dead/absent) via the stale-claim sweep; RELEASE + RE-DISPATCH them to RESUME (not restart — PRD/EXEC state is DB-preserved). (Live example: child SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A orphaned when worker b0e6e89d died; claim had to be swept + re-dispatched.)
- IDENTITY: re-establish who-is-who via the self-ID handshake (sibling SD), independent of flags.
- NO HUMAN/SURVIVOR RELAY REQUIRED at any step.

## Acceptance Criteria
- A fresh coordinator with zero prior-session survivors reconstructs the in-flight program + claims + fleet identity from the DB alone.
- Orphaned in-flight work (dead-session claims) is detected, released, and re-dispatched to RESUME (state preserved), not restarted from scratch.
- No step depends on a designated survivor holding in-conversation context.
- Reproduce: simulate a full restart (coordinator + workers, no survivor) and confirm cold recovery of in-flight work + identity.

## Smoke Test Steps
- Mark an in-flight SD's claim to a non-existent session; run the recovery protocol; assert the claim is released + re-dispatched to resume, and identity re-established via handshake.

## Success Metrics
- 100% of orphaned in-flight SDs recovered (resumed, not restarted) after a full no-survivor restart.
- 0 reliance on a surviving session for recovery.

## Linkage
Chairman-directed comms test + 2026-06-07 API restart (lesson #3, chairman survivor-agnostic refinement). Depends on the self-ID handshake SD (lesson #2). Related: SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001, the stale-claim sweep (cleanup_stale_sessions).
