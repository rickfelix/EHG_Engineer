# Harness Backlog

**Purpose**: One-line deferred captures of harness-level bugs found during `[MODE: product]` sessions.

During product work, do NOT file SDs/QFs for harness issues (LEO-INFRA, gate bugs, session lifecycle drift, tooling gaps). Append them here and keep shipping product. A follow-up `[MODE: campaign]` session processes this backlog: triages, groups, and files the necessary `SD-LEO-INFRA-*` / `SD-LEARN-FIX-*` / `SD-MAN-INFRA-*` / `QF-*` against the real recurrence signal.

See CLAUDE.md → Session Mode Declaration for the full rule.

## Format

One line per item. Date, symptom, file or command where it surfaced, SD/QF from which session it was deferred.

```
2026-MM-DD | <symptom> | <file or command> | deferred from SD-...
```

## Items

<!-- Append below. Do not edit or remove existing lines — they are the signal for the next campaign session. -->
2026-04-26 | GATE5_GIT_COMMIT_ENFORCEMENT hardcodes appPath=EHG_ROOT (ehg frontend repo) — backend EHG_Engineer SDs see wrong branch, gate misfires; bypass needed every backend SD | scripts/verify-git-commit-status.js:33 + scripts/modules/handoff/executors/plan-to-lead/gates/git-commit-enforcement.js:18 | deferred from SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001 (PR #3365)
2026-04-26 | sd_type gaming-detection trigger blocks LEAD-authority type changes when LLM detector + manual confirmation both agree the type is wrong (95% LLM confidence at PLAN-TO-EXEC SD_TYPE_VALIDATION); requires governance_metadata.bypass_reason that operator cannot self-grant from EXEC | DB trigger raising P0001 on strategic_directives_v2 sd_type updates | deferred from SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
2026-04-26 | Chaining-end behavior: with chain_orchestrators=true and no next orchestrator queued, LEAD-FINAL-APPROVAL exits 1 attempting to claim a non-existent UUID (cosmetic, SD already completed correctly) | scripts/modules/handoff/executors/lead-final-approval/index.js + chain auto-continuation logic | deferred from SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
2026-04-26 | model_usage_log CHECK constraint stale: rejects phase='EXEC-TO-PLAN' (handoff phase enum drifted from log enum) | model_usage_log.phase CHECK constraint | observed by database-agent during user-stories status update, deferred from SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
2026-04-26 | Concurrent npm install across sibling worktrees on shared C:\Users\rickf\Projects\_EHG\EHG_Engineer\node_modules causes ENOTEMPTY/ENOENT lock errors (recovery requires sequential install) | npm install on shared node_modules in worktree fleet | deferred from SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
