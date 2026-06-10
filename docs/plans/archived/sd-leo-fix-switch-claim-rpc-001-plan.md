<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_rank8_switchclaim_plan.md -->
<!-- SD Key: SD-LEO-FIX-SWITCH-CLAIM-RPC-001 -->
<!-- Archived at: 2026-06-09T17:20:13.215Z -->

# Plan: switch_sd_claim RPC — add existence and terminal-status guards on p_new_sd_id (PAT-OPTIMISTIC-RPC sibling of claim_sd)

## Type
fix

## Priority
medium

## Summary
claim_sd received three guards across three completed SDs (sd_not_found existence, sd_terminal_status, claimed_by_live_peer). Its live sibling RPC switch_sd_claim takes a free-form p_new_sd_id exactly like claim_sd's p_sd_id but has NO existence guard and NO terminal-status guard — the same optimistic-claim class. An Adam verify pass confirmed the original candidate's named functions (release_sd, assignment RPCs) are actually safe, but found the real residual in switch_sd_claim.

## Scope
The final SD-side UPDATE in switch_sd_claim keys on WHERE sd_key = p_new_sd_id with no NOT FOUND / existence check (a phantom/typo id matches zero SD rows yet the claude_sessions UPDATE still writes sd_key = p_new_sd_id — the phantom-claim optimism claim_sd's VALIDATE fix eliminated), and no terminal-status check (a claim can be switched onto a completed/cancelled/deferred SD). Fix: mirror claim_sd's existence + terminal-status guards into switch_sd_claim via a function-body CREATE OR REPLACE, plus a regression suite, using the byte-identical-deploy verification recipe (CRLF-normalize, reverse-diff proof, DATABASE sub-agent confirms live pg_proc.prosrc == migration). No table schema change.

## Source
Adam verify (workflow wf_c6d577ae) re-targeting PAT-OPTIMISTIC-RPC (7844a823) from the safe release_sd/assignment RPCs to the genuine live defect switch_sd_claim. Net-new: the three completed PAT-OPTIMISTIC-RPC SDs (CLAIM-RPC VALIDATE/TERMINAL/REFUSE) are all claim_sd-scoped; no SD/QF references switch_sd_claim. Live-wired via lib/session-manager.mjs.

## Risks
- switch_sd_claim is a fleet-critical claim RPC; a defect in the guard logic could block legitimate claim-switches. Reuse claim_sd's exact guard keys (sd_key existence, terminal status set) and pin with regression tests covering legitimate switch, phantom id, and terminal target.
- Function-body CREATE OR REPLACE must preserve the existing signature and grants (CREATE OR REPLACE preserves grants); verify live prosrc is byte-identical to the migration before relying on it.
- Must not change the self-resume / --force paths; guard only the phantom/terminal cases.
