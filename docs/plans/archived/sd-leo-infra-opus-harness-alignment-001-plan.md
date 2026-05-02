<!-- Archived from: C:/Users/rickf/.claude/plans/leo-sd-opus-47-phase-2-orch-001.md -->
<!-- SD Key: SD-LEO-INFRA-OPUS-HARNESS-ALIGNMENT-001 -->
<!-- Archived at: 2026-04-25T11:02:27.121Z -->

# Plan: Opus 4.7 Harness Alignment Phase 2 — Sub-Agents, Skills, Commands, Chairman-Adjacent Surfaces

**Type**: infrastructure
**Priority**: high
**Pattern**: orchestrator + 6 children
**Predecessor**: SD-LEO-FIX-PLAN-OPUS-HARNESS-001 (Phase 1, completed 2026-04-24)

## Goal

Phase 2 of the Opus 4.7 harness alignment program. Phase 1 realigned the LEO protocol harness (CLAUDE*.md) with Anthropic's 4.6→4.7 migration guidance: 4.7 interprets instructions more literally, defaults to fewer sub-agent spawns, respects effort levels strictly, and will not infer implicit conventions across phase boundaries. Phase 1 covered the orchestrator instructions only (CLAUDE*.md, leo_protocol_sections, generators).

A 2026-04-25 audit confirmed five additional Claude-prompt surfaces inherit the same literalism risk and are NOT covered by Phase 1 or by sibling Phase 1 SDs (Modules C/D/E — sub-agent evidence gate, memory frontmatter, scope pre-commit). Phase 2 applies the Phase 1 imperative pattern to those surfaces. This is additive to Module A's CLAUDE*.md hedge audit, not a re-execution.

Phase 2 ships six child SDs under one orchestrator. Each child handles one surface, ships independently, and can be paused or rolled back without blocking siblings. The orchestrator tracks aggregate hedge-density reduction, manifests freshness, and the staged Module K rollout.

## Scope (Six Children)

### Child A — Module H: Sub-Agent Definitions Audit + Rephrase
- Surface: `.claude/agents/*.md` (21 files, ~7,500 LOC)
- Action: replace hedges (typically/ideally/consider/should/may/could) with imperatives; enumerate canonical pause/handoff points where applicable; add reasoning-effort tags in headers
- Priority order (highest impact first): database-agent, validation-agent, testing-agent, retro-agent, rca-agent
- Acceptance: hedge density reduced ≥75% in modified files; reasoning-effort tag present in each header

### Child B — Module I: Slash Command Definitions Audit + Rephrase
- Surface: `.claude/commands/*.md` (34 files)
- Action: same as Module H; prioritize the 10 most-invoked commands
- Acceptance: hedge density reduced ≥75% in modified files

### Child C — Module J: Skill Definitions Audit + Rephrase
- Surface: `.claude/skills/*.md` (24 files)
- P0 subset (chairman/board blast radius): eva-vision, eva-mission, eva-strategy, eva-okr, eva-archplan, eva-constitution, eva-research, eva-score, review-vision, brainstorm, friday
- Action: same as Module H
- Acceptance: hedge density reduced ≥75% in modified files; P0 skills audited and rephrased before remainder

### Child D — Module K: Inline Script Prompts Replace-and-Replay
- Surface: 5 active scripts:
  - scripts/eva-intake-pipeline.js
  - scripts/llm-audit.js
  - scripts/modules/ai-quality-judge/
  - scripts/modules/sd-creation/prd-sd-041c/technical-design.js
  - scripts/eva/srip/quality-checker.mjs
- Action: capture golden corpus (10-20 real recent invocations per script with paired downstream-validator results); rephrase prompt; ship V1→V2 cutover in single PR with replay regression tests in CI; rollback via git revert if a real invocation fails post-merge. NO feature flags (rejected as overengineering).
- Per-script PR order, safest first: llm-audit.js → quality-checker.mjs → ai-quality-judge → eva-intake-pipeline.js → prd-sd-041c/technical-design.js (last; gates SD creation)
- Pre-EXEC obligation: code-Read against current main to confirm SD-LEO-FIX-MIGRATE-HARDCODED-LLM-001 (already touched technical-design.js + eva/srip) did not already imperative-ize the prompts
- Acceptance: each script's V2 prompt produces output passing the same downstream validators V1 passed; replay tests in CI; one PR per script with days-apart spacing

### Child E — Module L: Hooks + Statusline Sweep
- Surface: `.claude/hooks/`, `scripts/hooks/*.cjs`, `.claude/session-state.md`, statusline scripts
- Action: any user-facing or Claude-facing text emitted by hooks gets the same hedge-to-imperative pass; statusline templates audited
- Acceptance: text emitted from hooks during normal SD execution contains zero hedge phrases in critical-path messages

### Child F — Module M: AGENT-MANIFEST.md Refresh
- Surface: `.claude/agents/AGENT-MANIFEST.md`
- Current state: stale — claims 10 agents, 21 .md files present
- Action: regenerate to reflect actual 21 agents, current model assignments, active-vs-archived status, and link to each agent's reasoning-effort tag set in Module H
- Acceptance: manifest accurately enumerates all 21 agents with current metadata; reflects Module H's reasoning-effort tags

## Excluded (Out of Scope, Rationale Below)

- **LEO protocol harness (CLAUDE*.md)** — covered by SD-LEO-FIX-PLAN-OPUS-HARNESS-001 (Phase 1, completed 2026-04-24)
- **26 venture workflow stages + intelligence agents** — audited 2026-04-25, prompts already imperative (GCIA, Portfolio Balance use imperatives + JSON-only output, no hedges detected)
- **EVA Friday Meeting + Canvas conversation** — routes through Gemini (not Claude); 4.6→4.7 literalism guidance does not apply. If hardening is desired, file as a separate sibling SD with Gemini-specific rationale (canvas JSON schema brittleness is the real lever, not hedge density which is already <2%)
- **MEMORY.md re-index** — covered by SD-LEO-REFAC-PLAN-MEMORY-INDEX-001 (completed 2026-04-25)
- **/learn noise filter** — separate concern
- **Sub-agent evidence gate (Module C)** — covered by SD-LEO-INFRA-OPUS-MODULE-SUB-001 (completed). Module C is the gate enforcement mechanism; Module H is the agent definition text. Distinct surfaces.

## Rationale

Anthropic's 4.6→4.7 migration guidance: more literal, fewer implicit inferences, strict effort respect. Phase 1 hardened the orchestrator instructions. Phase 2 hardens the agents, commands, and skills the orchestrator delegates to — which is where most reasoning depth actually lives. Friction incidents 2026-04-22 to 2026-04-25 show category-A confirmation-fishing and category-B sub-agent-skip patterns persisting after Phase 1 because the agent definitions themselves still hedge.

Validation-agent pre-creation check (95/100 confidence): clear-to-proceed. No blocking overlaps among 1003 SDs in DB. Three in-flight SDs are adjacent (quick-fix/cleanup workflow concerns), none touch Phase 2 surfaces. Phase 1 + sibling Modules C/D/E confirmed not covering Phase 2 scope.

## Success Criteria

- [ ] All 6 child SDs created under orchestrator with parent_sd_id linkage
- [ ] Hedge density (count of typically/ideally/consider/should/may/could per 1000 LOC) reduced ≥75% across Modules H, I, J modified files
- [ ] Each modified file in H/I/J carries a reasoning-effort tag in its header
- [ ] Module K: 5 scripts each ship V1→V2 cutover with replay regression tests in CI; days-apart PRs; rollback plan documented
- [ ] Module K: pre-EXEC code-Read against current main completed; confirms SD-LEO-FIX-MIGRATE-HARDCODED-LLM-001 prior edits did not already imperative-ize the prompts
- [ ] Module L: hook + statusline text passes hedge audit on critical-path messages
- [ ] AGENT-MANIFEST.md regenerated and reflects 21 agents with current metadata
- [ ] All 6 children pass their own LEAD→PLAN→EXEC→PLAN→LEAD-FINAL handoffs
- [ ] Orchestrator-level retrospective captures aggregate hedge-density delta and which P0 skills moved the needle most

## Files Likely to Change (Non-Exhaustive)

| Path | Action | Module |
|---|---|---|
| `.claude/agents/database-agent.md` | MODIFY | H |
| `.claude/agents/validation-agent.md` | MODIFY | H |
| `.claude/agents/testing-agent.md` | MODIFY | H |
| `.claude/agents/retro-agent.md` | MODIFY | H |
| `.claude/agents/rca-agent.md` | MODIFY | H |
| `.claude/agents/AGENT-MANIFEST.md` | REGENERATE | M |
| `.claude/commands/sd-create.md` | MODIFY | I |
| `.claude/commands/heal.md` | MODIFY | I |
| `.claude/commands/learn.md` | MODIFY | I |
| `.claude/skills/eva-vision.skill.md` | MODIFY | J |
| `.claude/skills/eva-mission.skill.md` | MODIFY | J |
| `.claude/skills/eva-strategy.skill.md` | MODIFY | J |
| `.claude/skills/brainstorm.md` | MODIFY | J |
| `.claude/skills/friday.md` | MODIFY (if exists; otherwise commands/friday.md) | J |
| `scripts/eva-intake-pipeline.js` | MODIFY | K |
| `scripts/llm-audit.js` | MODIFY | K |
| `scripts/modules/ai-quality-judge/index.js` | MODIFY | K |
| `scripts/modules/sd-creation/prd-sd-041c/technical-design.js` | MODIFY | K |
| `scripts/eva/srip/quality-checker.mjs` | MODIFY | K |
| `.claude/hooks/*` | MODIFY | L |
| `scripts/hooks/*.cjs` | MODIFY | L |

## Risk + Mitigation

- **Module K is highest risk**: rephrasing inline prompts in production scripts can break downstream parsers. Mitigation: golden-corpus replay regression tests in CI, per-script PR cadence with days apart, prd-sd-041c/technical-design.js shipped last with longest stability window.
- **AGENT-MANIFEST drift**: kept as Module M sibling child, not nested in Module H, so manifest correction is auditable as a discrete deliverable.
- **Children block on parent claim**: children inherit parent worktree_path; parent must be claimed by the creating session before any child can be created. Orchestrator creator is responsible for claim handoff to child executors.

## Validation Evidence (LEAD Pre-Approval)

Validation-agent pre-creation check completed 2026-04-25 (agent ID: a11af4dc86705fdd8). Verdict: PASS / CLEAR_TO_PROCEED. Confidence: 95/100. Findings stored inline in this plan and in orchestrator metadata.lead_pre_approval_validation. Re-run via `node scripts/execute-subagent.js --code VALIDATION --sd-id <ORCH-ID>` once the orchestrator SD exists, to write a DB-backed audit row in `sub_agent_execution_results`.
