# Brainstorm: Sub-Agent Routing System Redesign for 1M Context Window

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal protocol infrastructure)
- **Chairman Review**: 3 items reviewed, 1 accepted, 0 flagged, 2 research-needed (resolved inline)

---

## Problem Statement
The sub-agent routing system was designed for a 200K context window. Only 1 of 17 deployable agents (DATABASE) has rich semantic triggers — phrase detection, confidence scoring, and denylist phrases. The other 16 rely on flat keyword lists scattered across 8+ files. Two phase files (CLAUDE_PLAN.md and CLAUDE_LEAD.md) have zero sub-agent invocation guidance. The pre-tool enforcement hook covers only 8 agents. With the context window now at 1M tokens (~823K headroom), the original constraints that forced minimal trigger definitions no longer apply.

## Discovery Summary

### Current State
- **17 deployable agents** (14 active + 3 archived: performance, uat, retro)
- **11 phantom agents** in keyword scorer with no .md files (ANALYTICS, CRM, FINANCIAL, etc.)
- **4 aspirational agents** in CLAUDE_CORE table only (AUDIT, CLAIM, JUDGE, PRIORITIZATION_PLANNER)
- **3 routing layers** that are diverged:
  1. `keyword-intent-scorer.js` — 27 agents, 3-tier weighted keywords, ~2000 keywords
  2. `pre-tool-enforce.cjs` — 8 agents, flat primary keywords, advisory-only
  3. CLAUDE_*.md text — DATABASE triggers in CORE+EXEC, zero elsewhere
- **CJS/ESM bridge problem**: Hook is CJS, scorer is ESM — can't share code directly
- **Proven solution**: JSON intermediary pattern already exists in `config/` directory

### User Decision: Remove EXEC Sub-Agent Restriction
CLAUDE_EXEC.md line 396 says "Do NOT invoke sub-agents during EXEC implementation." User considers this unnecessarily limiting and wants it removed.

### Design Decisions
1. **Layered approach**: Master routing table in CLAUDE_CORE.md + contextual phase reminders in LEAD/PLAN/EXEC
2. **All database-driven**: Content flows through `leo_protocol_sections` → `generate-claude-md-from-db.js`
3. **Full semantic triggers for all 17 real agents**: Phrases, priority scoring, denylist, confidence thresholds
4. **Multi-agent combination rules formalized**: e.g., "auth + RLS" triggers both DATABASE and SECURITY
5. **Upgrade pre-tool hook**: From 8 agents to 17, with weighted keywords from shared JSON source
6. **Phase reminders are contextual prose, not table copies**: "When reviewing PRD functional requirements and schema keywords detected → invoke DATABASE agent"
7. **Only trigger real agents**: Skip 11 phantom and 4 aspirational agents

## Analysis

### Arguments For
1. Only 1/17 agents has proper routing — extending a proven model
2. LEAD and PLAN phases have zero sub-agent guidance — real quality gap
3. 1M context window removes the original constraint that forced keywords out of CLAUDE.md
4. Database-driven pipeline already exists — no new infrastructure needed
5. JSON intermediary pattern solves the CJS/ESM bridge — proven in `config/`

### Arguments Against
1. Three-layer sync risk — must consolidate to shared JSON source first
2. Keyword ambiguity increases with scale — "migration", "auth" match multiple agents
3. Dense tables get less model attention than prose — phase reminders should be narrative, not tabular

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 8/10 | 16 agents lack semantic triggers, 2 phase files have zero guidance, hook and scorer diverged |
| Value Addition | 9/10 | Agents fire when they should. Enables future: fat prompts, composition chains, phase-aware routing |
| Risk Profile | 4/10 | Low if consolidated first. All protocol tooling, fully reversible via DB regeneration |
| **Decision** | **Implement** | (8+9) > (4×2) → 17 > 8 |

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Hook and scorer are already diverged — adding CLAUDE.md as 3rd layer worsens sync
  2. Phase-specific routing conflicts with master routing (EXEC says "don't invoke" — now resolved: removing that restriction)
  3. 9 phantom agents in scorer with no .md files — routing to non-existent agents
- **Assumptions at Risk**:
  1. More keywords ≠ better routing — multi-match ambiguity increases
  2. 12K tokens of trigger tables may be skimmed, not attended to by the model
  3. Hook currently breaks on first match — combination rules require architecture change
- **Worst Case**: Multi-agent ambiguity causes ignored or contradictory routing hints, making routing worse than the current simple approach

### Visionary
- **Opportunities**:
  1. "Fat prompts" — pre-loaded context bundles (full PRDs, retrospectives, prior agent results) at invocation time
  2. Multi-agent composition chains (SECURITY → DATABASE → STORIES pipeline)
  3. Phase-aware routing profiles that suppress irrelevant agents
- **Synergies**: EVA intake classification → agent pre-seeding; orchestrator children inherit parent agent findings; retrospective lessons injected into agent prompts; codebase health scores as routing inputs
- **Upside Scenario**: 3-5x more effective sub-agent invocations, near-zero gate failure rate, self-improving routing from execution results data

### Pragmatist
- **Feasibility**: 4/10 (mechanically simple, high surface area)
- **Resource Requirements**: 2-3 SDs, no external resources
- **Constraints**:
  1. Three-layer sync problem — make scorer the single source via JSON intermediary
  2. Only extend triggers to agents with .md files (~17), not all 27 in scorer
  3. DIGEST token budget (25K) must not include master routing table
- **Recommended Path**: Phase 1 (align hook via JSON) → Phase 2 (CLAUDE.md master table + phase reminders) → Phase 3 (combination rules)

### Synthesis
- **Consensus Points**: Consolidate routing layers to single source of truth; delete phantom agent routes; phase-awareness is critical
- **Tension Points**: Density vs recall (prose reminders > dense tables); scope of enrichment (fat prompts = future opportunity, not in scope now); all 17 vs only active agents (resolved: 17 real agents)
- **Composite Risk**: Medium — mitigated by consolidation-first approach

## Out of Scope
- Creating .md files for phantom/aspirational agents (ANALYTICS, CRM, etc.)
- Implementing "fat prompts" (context-rich invocation bundles) — future opportunity
- Self-improving/adaptive routing based on execution results
- Modifying the agent compilation pipeline

## Open Questions
- What is the optimal keyword count per agent before ambiguity degrades routing?
- Should the scorer's tertiary tier be capped at 5 keywords per agent to reduce noise?
- How should combination rules handle more than 2 agents (e.g., auth + RLS + performance)?

## Suggested Next Steps
1. Create SD for Phase 1: Consolidate routing layers (shared JSON, hook upgrade, phantom cleanup)
2. Create SD for Phase 2: Master routing table in CLAUDE_CORE.md + phase reminders in LEAD/PLAN/EXEC
3. Create SD for Phase 3: Multi-agent combination rules and phase-aware scoring modifiers
