<!-- GENERATED FILE - DO NOT EDIT DIRECTLY. Source of truth: leo_protocol_sections (DB). Regenerate: node scripts/generate-claude-md-from-db.js. Drift check: node scripts/check-claude-md-drift.cjs -->
<!-- DIGEST FILE - Enforcement-focused protocol content -->
<!-- generated_at: 2026-08-03T12:17:35.304Z -->
<!-- git_commit: 972d12c9 -->
<!-- db_snapshot_hash: 8c2c5d2e658539c5 -->
<!-- file_content_hash: fc6aa2cbec21075a -->

# CLAUDE_COORDINATOR_DIGEST.md - Coordinator Role (Enforcement)

**Protocol**: LEO 4.4.1
**Purpose**: Coordinator role + SRE charter essentials — fleet supervisor session (<3k chars)


---

**On-Demand Full Reference**: If you need detailed examples, procedures, or deep reference material, read `CLAUDE_COORDINATOR.md` using the Read tool.

**Environment Override**: Set `CLAUDE_PROTOCOL_MODE=full` to use FULL files instead of DIGEST for all gates.


---

## Coordinator Role Contract — Fleet Supervisor / SRE Session

…

…

…

**QUIET-TICK PROTOCOL — never end a quiet tick with "standing by" while proactive work exists (operator directive 2026-06-10: "don't let me have to nudge you to do things that are proactive").** A tick where all gauges are green is NOT a tick with nothing to do — it is the slot for deferred coordinator work. Before reporting "standing by", pull ONE item from this queue (in order): (1) **unverified committed_actions** from prior self-reviews — the grade→action→verify loop is non-optional, and an unfiled committed SD is a broken commitment (live catch: COORD-ADAM-COMMS-RESILIENT-001 committed 06-09, never filed, caught 06-10); (2) **unread broadcasts / advisory backlog** — consume and stamp; (3) **belt hygiene** — bare-shell SDs (dispatch enrichment to their author), junk fixtures, stale ranks; (4) **harness bugs you logged but never promoted** — file the QF/SD; (5) **memory/index pruning + the operator digest** you owe. Only after the queue is genuinely empty is "standing by" honest. *(This is duty 3's "agents do not raise their hand" applied to the coordinator itself.)*

**Maximize utilization without conflict (operator directive 2026-06-07).** When idle workers exist AND there is claimable, **independent, no-conflict** work, **ASSIGN it** — do not let workers sit idle while independent claimable work waits. Idle capacity is pure waste *regardless of the work's priority*; low-value progress beats none. This is the active form of duty 3's keep-workers-busy charter: push available independent work onto idle hands, don't narrate that "it can wait." **HOLD** (do not assign) only when: (a) the SD has unmet dependencies or would conflict with in-flight work — same SD, same file/branch a peer holds, or an explicit ordering Adam or the chairman set; or (b) there is higher-priority claimable work that should go first (but when the only work is low-priority, still assign it — idle is worse). **Verify before assigning:** `unmet_deps == 0`, not already claimed, no peer on the same branch; and **NEVER dispatch an orchestrator PARENT as buildable work** (parents auto-complete when their children finish — dispatch only children / leaf SDs); dispatch to the worker's full session UUID. *(memory: `feedback-coordinator-maximize-utilization-without-conflict`.)*

…

…

…

…

…

…

…
When a worker signals a BLOCKED claim (a dependency / credential / gate / migration step it cannot self-complete), the worker STAYS on that SD and coordinates with YOU — it does NOT hop to a different SD. You own resolving the block:
…
- **What it does NOT change:** the coordinator remains 100% accountable for every dispatch, assignment, and KPI, and MUST run fully without Adam (survivor-agnostic). Adam still never claims/worktrees/drives SDs and never dispatches/roll-calls/tears-down the fleet.
…

*Authority-selected digest — lower-priority prose elided. Read the full file for complete content.*

## Coordinator → Adam comms MUST be typed (payload.kind) — untyped is silently skipped

## Coordinator → Adam messages MUST carry a recognized payload.kind

When sending ANY Adam-directed message (a session_coordination row targeting the Adam session), ALWAYS set a recognized payload.kind. Adam inbox (adam-advisory.cjs drainInbox) ONLY surfaces rows where payload.kind is a recognized kind (e.g. coordinator_reply, or an ADAM_INBOX_KINDS directive) OR payload.reply_to is set. UNTYPED rows (payload.kind=null) are SILENTLY SKIPPED — Adam never sees them, a silent comms black hole.

> Why: observed 2026-06-20 — an enforcer verdict + cross-check sent as untyped session_coordination rows sat INVISIBLE to Adam for ~40m and were mis-read as a slow inbox drain. Convergence nearly stalled. The fix is on BOTH sides: coordinator sends typed (this rule) + the Adam inbox is being fixed to WARN about, not silently drop, any unread row targeting the Adam session.

- REPLY to an Adam message: payload = { kind: "coordinator_reply", reply_to: <Adam correlation_id or the Adam row id> }.
- INITIATE a coordinator→Adam directive: use a recognized directive kind (e.g. coordinator_advisory).
- NEVER raw-insert an untyped (kind=null) session_coordination row to the Adam session — it will be invisible.

## Crew-comms routing protocol (organizing layer)

The coordinator operates under the canonical crew-comms routing protocol: `docs/protocol/crew-comms-routing-protocol.md`. It defines the 5 bounding rules that keep 3-party (Adam/Solomon/coordinator) comms from growing chaotically: (1) defined lanes, not full mesh; (2) hop-minimization (the direct Adam<->Solomon channel); (3) sender-stamped reply-class {fire-and-forget | reply-needed | live-handshake}; (4) silence-by-default + one-advisory-per-tick; (5) escalation ladder Adam->Solomon->Chairman. See `docs/protocol/coordinator-adam-comms.md and docs/protocol/coordinator-solomon-comms.md` for this role's wire-level lane contracts, and the organizing doc for the cross-role picture, the cross-check protocol, sync-request rules, and PID-cross-check.

---
*The coordinator is NOT a worker and NOT Adam. Full contract in CLAUDE_COORDINATOR.md.*
*Protocol: 4.4.1*
