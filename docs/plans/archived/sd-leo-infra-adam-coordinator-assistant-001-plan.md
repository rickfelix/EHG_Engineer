<!-- Archived from: .claude/_adam-coord-assist-plan.md -->
<!-- SD Key: SD-LEO-INFRA-ADAM-COORDINATOR-ASSISTANT-001 -->
<!-- Archived at: 2026-06-08T01:40:45.953Z -->

# Adam coordinator-assistant standing-augmentation mode — codify in leo_protocol_sections id=601

INTENDED AS: child -E of orchestrator SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001 (parent_sd_id 2ad3ab19-1c35-4a30-9aea-5be32b783eed). Coordinator to promote/re-parent under the orchestrator and dispatch. Adam (L1 advisory) SOURCED this DRAFT (DOC-001-compliant authoring lane); Adam never hand-applies the canonical edit.

## Problem
The relationship "when not engaged by the chairman, Adam is the active coordinator's standing assistant" is operator-canonical (2026-06-07: "Adam is your assistant when not being used by the human") and is ALREADY asserted on the coordinator side at .claude/commands/coordinator.md line 46 — which even cites "the Adam Role Contract / CLAUDE_ADAM.md" as its authority. BUT the DB source of truth (leo_protocol_sections id=601, section_type=adam_role_contract, which generates CLAUDE_ADAM.md + CLAUDE_ADAM_DIGEST.md) is SILENT on it — a dangling forward-citation. The role contract frames Adam only as parallel/independent (NOT-worker, NOT-coordinator) with no chairman-idle assistant mode. Codifying 601 makes the existing citation resolve and the relationship genuinely official.

## Deliverable (ONE atomic change-set)
1. Amend leo_protocol_sections id=601 content: add a "Relationship to the coordinator (standing-assistant / augmentation lane)" subsection using the OFFICIAL TEXT below. Soften the absolute "NOT the coordinator / never consumes the fleet queue" into a bounded secondary engagement mode that preserves all hard invariants.
2. Regenerate CLAUDE_ADAM.md + CLAUDE_ADAM_DIGEST.md via scripts/generate-claude-md-from-db.js. NEVER hand-edit the generated files (CONST-005 rule class).
3. Sync .claude/commands/adam.md: add a one-line "secondary mode" bullet to the inline role summary + Step 3, deferring to CLAUDE_ADAM.md.
4. Add an "Adam (advisory/analysis role)" subsection to docs/protocol/fleet-coordinator-and-worker-behavior.md (durable fleet-roles source-of-truth; currently has Adam only as a canary-credit aside).
5. Tighten .claude/commands/coordinator.md line 46 so "per the Adam Role Contract / CLAUDE_ADAM.md" resolves to the now-real clause (close the dangling citation). No substantive change there.

## OFFICIAL TEXT (for section 601, drafted 2026-06-07)
Relationship to the coordinator (standing-assistant / augmentation lane). When an Adam session is live AND the Chairman is not actively engaging it, Adam serves as the active coordinator's official standing assistant on a delegation lane — performing pre-merge / full-row canary verification against intent, harness-backlog grooming and triage into a sourceable shortlist, cross-program pattern-spotting (dedup and same-write-surface conflict catches), continuity bridging, and authoring the DRAFT SDs the coordinator delegates (the DOC-001-compliant sourcing lane, since EXEC workers are DB-barred from creating SDs). This is augmentation and review, NOT authority or a safety-net: Adam still never claims, dispatches, or owns fleet lifecycle work, and the coordinator remains 100% accountable for every dispatch, assignment, and KPI and MUST run fully without Adam (survivor-agnostic — a healthy Adam's catches trend toward zero as the coordinator matures). Operator-canonical 2026-06-07: "Adam is your assistant when not being used by the human."

## Acceptance Criteria
1. leo_protocol_sections id=601 content contains the standing-assistant subsection (the official text), with the hard invariant (augmentation-not-safety-net, never-claim/dispatch/own, coordinator-100%-accountable, survivor-agnostic) preserved verbatim and prominent.
2. CLAUDE_ADAM.md + CLAUDE_ADAM_DIGEST.md regenerated (not hand-edited) and reflect the clause; digest carries a terse one-clause form within its <3k-char budget.
3. .claude/commands/coordinator.md line-46 citation resolves to a real clause (no dangling reference).
4. .claude/commands/adam.md inline summary + docs/protocol/fleet-coordinator-and-worker-behavior.md carry an aligned (DB-consistent) statement.
5. Constitution/Aegis layers (protocol_constitution, aegis_*) NOT touched (zero Adam content today; keep it that way — a role-engagement detail is not constitutional law).

## Governance
DB source of truth (Prime Directive); CLAUDE_ADAM.md/_DIGEST are generated (CONST-005 — never hand-edit, edit 601 + regen). Protocol change => governed via this SD under the orchestrator; a dispatched EXEC worker applies it through LEAD->PLAN->EXEC gates. Adam authored the DRAFT + official text (advisory sourcing); Adam does NOT execute it. The parent orchestrator + children A-D are SHIPPED/completed (this is a NEW 5th child, not a reopen).
