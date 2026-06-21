---
category: documentation
status: draft
version: 0.1.0
author: docmon-agent (Information Architecture Lead)
last_updated: 2026-06-20
tags: [flywheel, leo-protocol, lead-plan-exec, gates, handoffs]
---

# Link 9 — LEO Execution (LEAD → PLAN → EXEC)

> **Reviewed by Adam 2026-06-20 (chairman delegated the review); living doc — keep current as behavior changes.** [← back to the flywheel map](README.md)

## Role in the flywheel

This is the **per-worker workflow** — how a single worker turns one claimed SD into a shipped PR.
Where link 8 (the harness) is *that* work flows, LEO execution is *how* a single SD is built. Its
output (a merged PR + gate-validated phase records) is what the build gauge (link 10) later measures
and what the learning loop (link 13) reflects on.

> This link is documented authoritatively in **`CLAUDE.md`** + **`CLAUDE_CORE/LEAD/PLAN/EXEC.md`**
> (all generated from `leo_protocol_sections`). This page is the flywheel bridge; for the binding
> rules, read those files.

## Source of truth (verified)

- **Protocol files:** `CLAUDE.md` (orchestrator router), `CLAUDE_CORE.md`, `CLAUDE_LEAD.md`,
  `CLAUDE_PLAN.md`, `CLAUDE_EXEC.md` — **generated from `leo_protocol_sections`** (the DB is the
  source of truth; the .md files are artifacts).
- **State tables:** `strategic_directives_v2` (SD state/phase/claim), `product_requirements_v2`
  (PRDs), `sd_phase_handoffs` (gate-validated transitions), `sub_agent_execution_results` (formal
  sub-agent evidence — gates query this).
- **Process scripts:** `scripts/handoff.js`, `scripts/add-prd-to-database.js`,
  `scripts/leo-create-sd.js`.

## The three phases

| Phase | Concern | Artifact |
|-------|---------|----------|
| **LEAD** | Strategy: approve + scope the SD | strategic intent in `strategic_directives_v2` |
| **PLAN** | Architecture: produce the PRD, validate gates | `product_requirements_v2` |
| **EXEC** | Implementation: ship code + tests | the merged PR |

Transitions are **phase handoffs** (`node scripts/handoff.js execute <PHASE> <SD-ID>`) that run the
full gate pipeline and write canonical phase state. A non-final handoff is **TERMINAL** — phase work
must be written to the DB before the next phase begins.

## Gates + sub-agent evidence (the verification oracle)

- The **gate pipeline + `sub_agent_execution_results`** are the external verification oracle a worker
  must satisfy before a phase advances — *"manual DB checks are not evidence; the row is."* This
  embodies the 2026 best practice that **the agent doing the work must not be the agent deciding it's
  done.**
- Required sub-agents are invoked via the Task tool **before** `handoff.js execute`; the handoff
  blocks with `SUBAGENT_EVIDENCE_MISSING` if no fresh row exists for the current phase.
- Target gate pass rate: 85% (SD-type overrides 60–90% with documented justification).
- The **post-completion-tail Stop hook** is the harness's "Ralph loop": it re-injects `/document →
  /heal → /learn` when a worker claims done (feeding link 13), rather than letting it stop on a
  self-declared completion.

## Where it sits relative to the gauge

LEO execution **builds** the capabilities; it does **not** measure them. The VDR build gauge (link
10) probes *live signals* (code presence, table counts, KR status) independently of whether a
handoff said "done" — so a worker cannot inflate the gauge by declaring completion. Shipped work
moves the gauge only when the live probe actually flips. This separation is deliberate (anti-honesty-
lie doctrine).

## Existing documentation

- `CLAUDE*.md` + `leo_protocol_sections` — **Coverage: good (canonical).**
- `docs/leo/` (phases, gates, handoffs, sub-agents, commands, api). **Coverage: good.**
- `docs/protocol/README.md` — protocol-vs-harness boundary. **Coverage: good.**
- `docs/reference/validation-gate-registry.md`, `error-code-catalog.md`, `handoff-state-machines.md`.
- **Gap (filled here):** the relationship *LEO execution builds → the gauge independently measures →
  the loop reflects* was implicit. This page makes it explicit in flywheel context.

## Connects to

- **Up from:** a claimed belt SD ([08-belt-coordinator-fleet.md]).
- **Produces:** a shipped PR → measured by the build gauge ([10-vdr-build-gauge.md]).
- **Feeds the loop:** `/document → /heal → /learn` + retros ([13-feedback-learning.md]);
  `sd_key_result_alignment` credits the SD to a KR ([03-okrs-key-results.md]).
- **Bounded by:** the five Canonical Pause Points + chairman authority ([14-governance.md]).
