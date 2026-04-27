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

2026-04-27 | splitPostgreSQLStatements (scripts/lib/supabase-connection.js) splits on semicolons inside single-line `--` comments, yielding malformed DDL fragments rejected as 42601 syntax error; workaround: send full migration as single client.query() call | scripts/lib/supabase-connection.js splitPostgreSQLStatements | observed during SD-LEO-INFRA-PR-TRACKING-BACKFILL-001 migration apply
2026-04-27 | leo-create-sd auto-generated SD metadata references vision_key/arch_key (e.g. VISION-EVA-SUPPORT-CLI-L2-001 + ARCH-EVA-SUPPORT-CLI-001 in SD-EVA-SUPPORT-CLI-SKILL-ORCH-001 metadata) but corresponding rows do NOT exist in vision_plans / sd_vision_plans / architecture_plans / sd_architecture_plans / brainstorm_sessions. Orphan FK-by-string. LEAD evaluation cannot trace strategic provenance | leo-create-sd vision/arch handoff path + table writes | deferred from SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A LEAD eval
- 2026-04-27: auto-trigger-stories.mjs Gemini timeout (3 retries) + priority-enum CHECK mismatch (script outputs MoSCoW must/should/could but DB CHECK is critical/high/medium/low). Forced manual-author fallback for SD-EHG-AI-GEN-GUARDRAILS-001 (US-1..10 inserted by general-purpose agent). 2-issue compound: LLM provider fragility + script/schema enum drift.
- 2026-04-27: PR #536 (SD-ACTIVATE-S18-MARKETING-COPY-ORCH-001) merged to main 2026-04-27T14:54Z but chairman_decisions.approval_type column NOT present in live DB (error: column does not exist). Migration apparently didn't run on merge. Discovered during SD-EHG-AI-GEN-GUARDRAILS-001 EXEC prerequisite check; FR-7 types.ts regen + FR-6 audit-trail integration both blocked. Possible cause: missing supabase migration deploy step in CI, or migration file not in PR scope. | live DB project dedlbzhpgkmetvhbkyzq + supabase/migrations/ | discovered EXEC pre-flight
- 2026-04-27: EHG repo has NO CI step that runs `supabase db push` on merge to main; supabase_migrations.schema_migrations has ZERO 20260427_* entries despite multiple 20260427 migrations existing in supabase/migrations/. PR #536 column went 5h unapplied as a result. Migrations land via out-of-band manual psql; ledger never updated. Systemic deployment hygiene gap. | .github/workflows/ + supabase/migrations/ | discovered during PR #536 unblock for SD-EHG-AI-GEN-GUARDRAILS-001
- 2026-04-27: chairman_unified_decisions view in PR #536 drops the `escalation` branch (live: 4 branches incl. agent_messages-driven escalation; PR #536: 3 branches with venture_decision shape + new approval_type). Frontend reading details->>'approval_type' from view gets NULL since live view's chairman_approval branch lacks it. Part 5 of 20260427_001 migration deferred during unblock. | ehg/supabase/migrations/20260427_001_add_approval_type_to_chairman_decisions.sql Part 5 + chairman_unified_decisions view | deferred during DB-agent unblock pass
- 2026-04-27: Migration 20260427000002_revert_decided_by_user_id never applied to live DB while sibling 000001/000003/000004 did apply. decided_by_user_id column still present + functions reference it. Out-of-band manual apply skipped the revert. Minor data-model inconsistency. | live DB chairman_decisions table + ehg/supabase/migrations/20260427000002* | discovered during sibling migration drift check
- 2026-04-27: husky pre-commit unconditionally runs `npm run test:smoke` regardless of branch type — fails for docs-only branches when network resolution is offline (DNS ENOTFOUND on test.invalid.local intentionally-invalid test target). Hook recognizes docs/ branches for LOC-threshold exemption (line 682) but not for smoke-test exemption. Forces `--no-verify` bypass for docs-only commits when environment is offline. Sibling pattern: same hook exempts docs/ from LOC-floor but not from runtime checks | .husky/pre-commit smoke-test stage | discovered while shipping docs/harness-backlog updates 2026-04-27
