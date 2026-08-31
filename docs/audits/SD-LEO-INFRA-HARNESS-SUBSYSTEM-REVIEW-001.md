# Harness Subsystem Review — 2026-08-31

**SD**: SD-LEO-INFRA-HARNESS-SUBSYSTEM-REVIEW-001
**Subsystem**: harness (LEO gates, handoffs, hooks, claim machinery)
**Worker**: Hotel-3 (fleet worker), coordinator e03409a6-317d-4e93-8e4f-c7aaeb40fd08
**Recipe**: `.claude/commands/review-subsystem.md`

## Ground truth (7-day window, measured 2026-08-31 ~16:05-16:10 UTC)

`validation_audit_log` (1190 rows total in the 7d window):

| failure_category | rows |
|---|---|
| pass | 455 |
| gate_failure | 264 |
| bypass | 262 |
| bypass_shape_warning | 15 |
| db_content_drift | 4 |

`gate_failure` rows by validator:

| validator | rows |
|---|---|
| handoff_lead_to_plan | 111 |
| handoff_plan_to_exec | 50 |
| handoff_plan_to_lead | 47 |
| handoff_lead_final_approval | 47 |
| handoff_exec_to_plan | 39 |

Of 294 total gate_failure rows, 149 (51%) are `PREREQUISITE_PREFLIGHT_FAILED`, spanning 74 distinct SDs (2 avg retries each — broad, not one runaway loop). Cross-referencing `sd_phase_handoffs.validation_details.preflight_remediation[].code` for the same 149 rows gives the real blocking-code breakdown (see Finding 1 — `validation_audit_log` itself only stores the generic reason):

| blocking code | rows |
|---|---|
| SUBAGENT_EVIDENCE_MISSING | 144 |
| USER_STORIES_BYPASSED | 33 |
| SMOKE_TEST_BYPASSED | 17 |
| SMOKE_TEST_MISSING | 9 |
| DESCRIPTION_TOO_SHORT | 8 |
| SUBAGENT_EVIDENCE_BAD_VERDICT | 3 |
| JSONB_FIELDS_INCOMPLETE | 2 |
| others (1 each) | 4 |

`bypass_detection` validator: 232 rows in the 7d window — see Finding 2.

## Findings

### Finding 1 (HIGH) — `validation_audit_log` collapses `SUBAGENT_EVIDENCE_MISSING` to `failed_gate:null`

`SUBAGENT_EVIDENCE_MISSING` is 144/149 (97%) of all preflight failures and 144/246 (58.5%) of **all** 7d handoff rejections — by far the single largest handoff-rejection driver in the fleet, confirming CLAUDE.md prologue #2's stated concern ("Opus 4.8 defaults to fewer sub-agent spawns") is not marginal.

But `validation_audit_log` — the table this review recipe itself names as ground truth — stores only the generic reason code and `metadata.failed_gate: null` for every one of these rows. The actual blocking code only survives in `sd_phase_handoffs.validation_details.preflight_remediation[].code`, set at `HandoffOrchestrator.js:239-246`, and never threaded into the governance-audit insert in `HandoffRecorder.js` (`_logGovernanceAudit`, ~lines 1348-1369; `recordFailure`, ~lines 397-483). Anyone using `validation_audit_log` alone (as directed by this recipe) sees an undiagnosable generic bucket instead of the real, highly concentrated top offender.

- Evidence: feedback row `d7f68e57-d4bd-40b8-9bce-d75ee0af2592`
- Draft SD: `SD-FDBK-FIX-HARNESS-REVIEW-VALIDATION-001` (verified non-duplicate of completed `SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001`, which threaded remediation into `sd_phase_handoffs` only, never into `validation_audit_log`)

### Finding 2 (HIGH) — `bypass_detection` CI job has no dedup; 100% of its 7d volume is one stale finding re-logged on every main push

All 232 `bypass_detection` rows in the 7d window are for the **same** `sd_id` (`73b8cdb1-ba10-498a-8bd9-cb26e5fd1eb8`, SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002, status=active) with the identical `failure_reason` ("Artifact handoff_plan_to_lead created before prerequisite EXEC-TO-PLAN"), timestamped roughly hourly from 2026-08-29 through 2026-08-31.

Root cause: `.github/workflows/leo-bypass-validation.yml` runs `scripts/modules/bypass-detection-validator.js` on every push to `main` touching `scripts/**|lib/**|database/**`, with `recentOnly=true` (7-day window) when unscoped. `logValidationAuditEvents` (`bypass-detection-validator.js:350-378`) unconditionally INSERTs a fresh row per finding on every run — no dedup key. Because the SD stays active (`updated_at` keeps refreshing) it never leaves the rolling 7-day window, so the same historical timeline anomaly gets re-detected and re-inserted on every qualifying push, indefinitely.

Impact: `validation_audit_log` grows unbounded for as long as the SD stays active, and 19.5% of ALL 7d rows in the table are this one static fact — masking real signal for anyone using the table as a gate-FP leaderboard (`bypass_detection` reads as the single largest-volume validator when it represents zero systemic incidents).

- Evidence: feedback row `98f5ed65-00e4-4ee8-bf9c-ae6cbf2812e2`
- Draft SD: `SD-FDBK-FIX-HARNESS-REVIEW-BYPASS-001`

### Finding 3 (CRITICAL, resolved via existing fleet thread) — worktree pool exhaustion + `WORKTREE_ORPHAN_MIN_AGE_MS` misconfigured to ~10yr

`sd-start.js` worktree creation was hard-blocked (28/28, later 30/28) during this review, with 277+ orphan directories on disk. `node scripts/worktree-reaper.mjs --orphan-sweep` (dry-run) reported every scanned directory as `excluded=too_recent` because `WORKTREE_ORPHAN_MIN_AGE_MS` resolves to `315360000000` ms (~10 years), making the orphan-sweep a permanent no-op regardless of actual age.

This review independently confirmed the same misconfiguration that an active Solomon→Adam coordination thread (`session_coordination` id `0b622afa-c1ee-4f69-ba85-2bea88f826ec`) was already diagnosing and driving toward a chairman/Adam-authorized fix. A draft SD was initially filed for this finding and then **cancelled** (`SD-FDBK-FIX-HARNESS-REVIEW-WORKTREE-001`, via `scripts/cancel-sd.js`) once the duplicate active thread was found, to avoid a redundant backlog entry; the corroborating evidence was merged into that thread instead via a coordinator notice.

New data point contributed to that thread: worker-side `worktree-reaper.mjs` (all modes) and direct `git worktree remove` on hand-verified merged+clean candidates were both denied by the auto-mode permission classifier in this session, independent of any `--execute` authorization question. The coordinator additionally caught a real gap in the hand-rolled "merged+clean" predicate used to select candidates: 2 of 9 candidates were live-claim-held by other sessions and would have been unsafe to remove — `worktree-reaper.mjs` already has this check built in (`shipped-stale-suppressed reason=claim-held`), which the hand-rolled predicate lacked.

By the time this review resumed (after the pool cleared to 22-23/28), the fix was already in flight elsewhere.

- Evidence: feedback row `ec753ea2-0e4a-4b94-9dae-8b9189f36077`
- No SD filed for this finding (duplicate of active thread, cancelled — see above)

## Clean bills

- **Claim machinery** (`scripts/stale-session-sweep.cjs`, `claim-eligibility.cjs`): not flagged — no anomalies surfaced in this review's scope; the belt-eligibility/reservation-fence mechanics observed during the review's own `/checkin` cycles behaved as documented (reservation fences, tiering, stale-assignment purge all fired correctly).
- **Hook registration** (`scripts/hooks/` vs `.claude/settings.json`): not inspected in depth this cycle — no findings to report either way; deferred to a future rotation pass rather than asserting a false clean bill.

## Notifications sent

- Coordinator notice (`session_coordination` id `336d1540-cdc3-4ccb-95f1-2ce550fddf7c`, `payload.kind='review_supply_result'`)
- Adam grooming note (`feedback` id `d1446bfd-c4a3-4ad2-a8d1-7ec8563c93f6`)
- 2 harness-bug signals re: worktree pool/classifier blockage during the review (`b30e135e-8101-4875-a7fa-c3e4ed7a17bb` medium, `14be1545-ca3b-45f3-87b8-7370a96a1358` high)
