# Session State — SD-LEO-INFRA-RETRO-PROMOTION-PATH-001

Worktree: C:\Users\rickf\Projects\_EHG\EHG_Engineer\.worktrees\SD-LEO-INFRA-RETRO-PROMOTION-PATH-001
Branch: feat/SD-LEO-INFRA-RETRO-PROMOTION-PATH-001
Worker: fleet session 9a78de7f-f379-460a-8a47-b2e5e5c5618f ("Golf"), coordinator c130ca2c-48aa-4ff3-bf81-3f7f1eeffac8

## Status (2026-08-24) — starting LEAD phase

Title: "RETRO promotion path: clobber-guard refuses HANDOFF->SD_COMPLETION promotion (2/2
recurrence, worked around twice)". sd_type=infrastructure, priority=medium, status=draft.

## Problem (from SD's metadata.plan_content — description column is truncated mid-sentence,
## same pattern as the prior SD this session)

Provenance: review-cycle candidate #7 (retro enhance-path silent-skip, signal 95399d44), held
next-wave, GRADUATED on recurrence — Hotel-2 signal 2026-08-24T01:23:27Z reports the identical
refusal on a SECOND SD (SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001, after
SD-LEO-INFRA-PLAN-LEAD-RETRO-001), both worked around by hand-editing. Coordinator sourcing row
105ed45e, RECUR=PROTECTED framing: a defect recurring after its workaround is being PROTECTED,
not merely unfinished — fix the promotion path, never widen the workaround.

`enhanceRetrospective`'s clobber-guard (`rich_existing_content`,
`lib/sub-agents/retro/db-operations.js`) refuses to promote a non-qualifying HANDOFF-type
retrospective to SD_COMPLETION type. The guard's PURPOSE (protect rich human content from being
clobbered) is correct, but its predicate treats TYPE PROMOTION itself as clobbering even when the
enhancement is additive (content preserved/appended, not replaced) — so every SD whose retro was
first written at handoff time hits a refusal at completion, and the worker hand-edits around it
(2/2 observed so far). The workaround writes outside the canonical enhance flow — exactly what the
guard exists to prevent.

## Scope (one SD, per plan_content)
- FR-1: root the predicate — distinguish CLOBBER (replacing/overwriting existing rich content,
  keep refusing) from PROMOTE (type upgrade HANDOFF->SD_COMPLETION with content
  preserved/appended, allow through the canonical path). Fix lives in the promotion path.
- FR-2: the two specimen SDs' retros re-run through the fixed path (premise verification doubles
  as the fixture) — both must promote cleanly with prior content intact.
- FR-3: regression pair — (a) a genuine clobber attempt (different content, same type) still
  REFUSES; (b) a promotion with preserved content SUCCEEDS; (c) the refusal message, when it
  fires, names which content would be lost (today's refusal reads as a silent skip per 95399d44).

## Out of scope
Retro content/scoring; SD-LEO-INFRA-PLAN-LEAD-RETRO-001's presence-sequencing (separate SD, in
belt).

## Success criteria (as submitted — verify before trusting, per this session's own standing
## discipline; measures are [UNPOPULATED] boilerplate in the DB row, need real authoring at PLAN)
- Zero workaround edits needed on the next SD completion whose retro began as HANDOFF-type.
- Both regression fixtures green; refusal message includes the protected-content identification.

## Interesting note carried from the JUST-COMPLETED SD (FORECASTER-CLAIMABLE-PREDICATE-001)
When I dispatched retro-agent for that SD's completion retrospective, it explicitly said it could
NOT use `generate-comprehensive-retrospective.js` because that script's inputs (sd_phase_handoffs
/ PRD summaries) were too thin to clear the boilerplate bar, and wrote a one-off insert script
instead. Worth checking during LEAD/PLAN investigation whether that's the SAME underlying
clobber-guard/promotion-path defect class this SD targets, or a genuinely separate gap (my retro
was a fresh INSERT, not a promotion of an existing HANDOFF-type row — likely different, but
verify, don't assume).

## Update 1 (2026-08-24) — LEAD-TO-PLAN PASSED (94%), scope substantially corrected

Dispatched Explore (very thorough) FIRST. It found the guard's real location
(scripts/modules/handoff/lib/retro-clobber-guard.js `classifyRetro()`) and confirmed the core
mechanism, but flagged the two NAMED specimen SDs weren't independently file-verifiable (only the
general workaround pattern was, via 2 OTHER SDs' one-off scripts).

Independently re-verified myself (not just trusted the report) by reading
retro-clobber-guard.js in full and lib/sub-agents/retro/db-operations.js:200-330 directly:
confirmed `isSafeToWriteRetro(supabase, sdId)` takes ONLY sdId (never the incoming write content),
and confirmed `enhanceRetrospective`'s merge is additive for arrays but WHOLESALE-REPLACES
description/7 scalar fields/auto_generated — a real nuance beyond what Explore flagged.

Dispatched validation-agent with the fully-informed brief (my own 2 direct findings included).
Result: CONDITIONAL_PASS 92% (evidence 5de79dfb-acf1-46ce-bab5-3cf8b891276d) — and it
SUBSTANTIALLY corrected the SD's own premise, not just confirmed it:
1. **retro_type plays NO role in the actual refusal** — the SD's own framing
   ("HANDOFF->SD_COMPLETION promotion refused") mischaracterizes the mechanism. The real cause:
   classifyRetro()'s `rich_existing_content` branch fires whenever content is auto-generated
   (generated_by IN AUTO_GENERATED_TYPES) AND scores "rich" by CHARACTER LENGTH — conflating
   provenance with length, refusing even though the guard's own charter says it should only
   protect MANUALLY-curated content.
2. **Scale is 1653/1658 (99.7%) of the live HANDOFF population**, not "2/2" — replayed
   classifyRetro() against the real table. Both cited specimens' key_learnings[0] is a
   byte-identical 193-char boilerplate string.
3. **NEW finding (V5), independently re-verified by me directly against code already read**: the
   guard classifies the WRONG ROW on a multi-retro SD. `enhanceRetrospective(supabase, existingId,
   ...)` writes `.eq('id', existingId)` (db-operations.js:332) but the guard is consulted via
   `isSafeToWriteRetro(supabase, sdIdForGuard)` (db-operations.js:224), which re-queries "most
   recent retro row for this sd_id" (retro-clobber-guard.js:130-136) — independent of which row
   existingId actually names. Both specimens carry 3 retro rows each.
4. Recurrence is genuine and UNDERSTATED (>=6 file-verified specimens, not 2); one originally-cited
   specimen script was found to be unrelated (different root cause) and dropped.
5. FR-1 as literally worded ("root the predicate... distinguish CLOBBER from PROMOTE") is
   under-scoped — validation-agent recommended (and I accepted) a narrower, more surgical fix
   (exempt auto-generated content from the richness check entirely, leave manual_retro/
   manual_retro_null_inferred untouched) PLUS 2 more real FRs (row-selection fix, non-lossy merge).

Corrected the SD record via scripts/one-off/retro-promotion-path-001-lead-scope-correction.mjs:
4 FRs now (was 1), scope_reduction_percentage=0 (scope genuinely GREW, not shrank).
`mechanism_verifications` written directly (learned from the prior SD — GATE_MECHANISM_CLAIM_VERIFIER
needs this on the SD record itself, sub_agent_execution_results evidence alone does not satisfy
it) — worked cleanly this time, gate passed 100% on the very first precheck.

`handoff.js precheck LEAD-TO-PLAN`: 91%, one real remediation (missing Explore sub-agent evidence
— I had dispatched Explore but not yet written it to sub_agent_execution_results). Stored via the
canonical writer (evidence dd2fd245-ee20-4c3d-9a57-eb379e836bef). Re-ran: 95%, PASSED.
`handoff.js execute LEAD-TO-PLAN`: PASS, score 94. **SD is now in_progress/PLAN_PRD.**

## Next steps
1. Commit scripts/one-off/retro-promotion-path-001-lead-scope-correction.mjs + session-state.md.
2. PLAN phase: author a proper PRD from the corrected 4-FR scope above (Update 1) — do NOT build
   the original as-submitted 1-FR "root the predicate" text. Follow CLAUDE_PLAN.md phase
   requirements; use the canonical add-prd-to-database.js --content override pipeline (per the
   prior SD's established, working pattern this session — see FORECASTER-CLAIMABLE-PREDICATE-001's
   own session-state Update 4 if still readable, or lib/artifact-contracts/prd-contract.js for the
   exact field shapes).
3. Run PLAN-TO-EXEC once the PRD is ready.
4. EXEC implementation of FR-1 through FR-4, with the same standing discipline (independently
   verify every sub-agent finding, mutation-test where practical, full regression sweep of every
   consumer of retro-clobber-guard.js and enhanceRetrospective before shipping).

## Notes carried from prior SDs this session
- ENF-15 force-push allowlist does NOT include docs/* branches.
- CHANGELOG.md is a contention hotspot under concurrent fleet sessions — re-merge origin/main
  right before final push on any changelog-only PR.
- git stash is repo-global across worktrees — always target by index (stash@{N}), never bare pop.
- Stale `.git/worktrees/<name>/index.lock` (0 bytes, no live git.exe process) is safe to remove —
  recurred 3x this session, same fix each time.
- GATE_MECHANISM_CLAIM_VERIFIER (LEAD-TO-PLAN) requires `metadata.mechanism_verifications =
  [{verified_by, verified_at: "file:line"}]` on the SD record itself — sub_agent_execution_results
  evidence alone does NOT satisfy it. Only fires when the spine names both a file AND a
  function/call near it.
- CI's "Run Unit Tier (quarantine-aware)" and "coverage" jobs are the longest-running required
  checks (~10-12 min) — a "status check is in progress" merge failure is routine, not a defect;
  ScheduleWakeup + retry, never blind hammer-retry.
- The main EHG_Engineer repo's own working directory (not a worktree) is heavily shared by
  concurrent fleet sessions with lots of uncommitted state — never work there directly; always
  use/create a dedicated worktree.
