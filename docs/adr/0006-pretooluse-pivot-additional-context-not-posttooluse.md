<!-- POCOCK-ADR-RPC-SIGNED: 78120845d46390136626ca03ad8ea6ef3ad424f0d9bb69cecdc552ae4dc56661 -->

# ADR-0006: Hook injection uses PreToolUse additionalContext, not PostToolUse

Goal-chain and rule injection happen at PreToolUse hook boundary via additionalContext, not at PostToolUse. PostToolUse cannot influence the current tool call; PreToolUse can shape behavior before it executes. Documented in brainstorm session a6b92936 pivot history.

---
Status: accepted
Accepted at: 2026-05-14T16:29:02.484557+00:00
Approved by: chairman-backfill-2026-05-14
