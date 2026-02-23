# Brainstorm: Agent Team Architecture Improvement from External Patterns

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Consideration Only
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (cross-cutting infrastructure)
- **Source**: Mark Kashef — "7 Agent Team Use Cases in Claude Code" ([video](http://www.youtube.com/watch?v=dlb_XgFVrHQ))

---

## Problem Statement

EHG's LEO protocol uses 17 specialized agents in a hub-and-spoke architecture where all findings route through the orchestrator. An external video by Mark Kashef demonstrates 7 agent team patterns (inter-agent sharing, devil's advocate roles, parallel section writers, creative team composition) that suggest potential improvements to our workflow. This brainstorm evaluates which patterns translate to our domain and which don't.

## Discovery Summary

### Current Architecture Strengths
- **17 specialized agents** covering database, security, testing, design, validation, RCA, performance, and more
- **Hub-and-spoke orchestration** with database-driven coordination via `sub_agent_execution_results` table
- **Parallel child execution infrastructure already built** (371 LOC in `parallel-team-spawner.js`) — feature-gated behind `ORCH_PARALLEL_CHILDREN_ENABLED`
- **Institutional memory** loaded at session start from `issue_patterns` table
- **Multiple adversarial validation points**: `russian-judge.js`, `gate-4-strategic-value.js`, `retrospective-quality.js`
- **Proven team pattern** in `/brainstorm` skill (Challenger/Visionary/Pragmatist)

### Current Architecture Gaps
- **No inter-agent peer communication** — all findings go through orchestrator middleman
- **No challenger role during SD execution** — all agents validate against spec, none question the spec
- **Parallel child execution disabled** due to Windows worktree reliability concerns
- **Gates run sequentially** in handoff validation (8+ gates in PLAN-TO-EXEC)
- **Fixed agent roster** — no dynamic team composition per SD

### Video Pattern Mapping

| Video Pattern | EHG Status | Applicable? |
|---|---|---|
| Inter-agent sharing (Content Engine) | Hub-and-spoke only | Low — our workflows are sequential, not document co-authoring |
| Sequential handoff (Pitch Deck) | Already strong | Already implemented |
| Parallel section writers (RFP) | Built but disabled | High — just needs activation |
| Devil's advocate (Advisory Board) | Only in /brainstorm | Medium — debated value in constrained SD execution |
| Creative team composition (Competitive Intel) | Fixed agent roster | Medium — DB-driven composition possible |
| Human-in-the-loop (Pitch Deck) | AUTO-PROCEED with pause points | Already implemented |
| Sub-agent + Team combo (Custom Assistant) | Orchestrator children | Partially implemented |

## Analysis

### Arguments For
1. **Parallel child execution is the highest-ROI improvement** — 371 LOC already written, feature-gated, offers 2-3x throughput for multi-child orchestrators
2. **Challenger pattern is proven in this codebase** — `/brainstorm` uses it, `devils-advocate.js` exists for Eva, extending to PLAN-TO-EXEC is ~1 SD of work
3. **Compounding returns** — findings ledger + LEARN module = self-improving protocol over 100+ SDs
4. **Video validates our direction** — we already have most patterns, gaps are refinements not rebuilds

### Arguments Against
1. **No observed friction** — user hasn't hit pain points; building for theoretical gains risks "improvement theater"
2. **Windows worktree reliability is unsolved** — MSYS2 pipe corruption + worktree deletion issues multiply with parallel execution
3. **Gate ordering dependencies prevent simple parallelization** — shared mutable context (`ctx._prd`, `ctx._bmadResult`) creates race conditions for ~1-2 seconds of savings
4. **Adversarial review may be noise in locked-scope execution** — 10+ gates already exist; adding challenger to constrained delivery differs from unconstrained ideation

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Hub-and-spoke is an intentional enforcement mechanism (orchestrator as single authority), not a limitation
  2. Parallel child execution disabled for real reliability reasons (worktree failures documented in MEMORY.md, PR #1380)
  3. Claim system (`claude_sessions` partial unique index) was designed for sequential execution — concurrent peer communication was never in its threat model
- **Assumptions at Risk**:
  1. "Challenger role improves outcomes" — but `russian-judge.js`, `gate-4-strategic-value.js`, and retrospective quality already provide adversarial review
  2. "Parallel gates save time" — but gates are 50-200ms DB queries; 10 sequential = 1-2 seconds, not user-visible vs 30-60s LLM calls
  3. "Inter-agent sharing translates" — video agents co-author documents (embarrassingly parallel); LEO agents work on sequential phases with hard dependencies
- **Worst Case**: Significant engineering effort producing infrastructure nobody turns on because the same reliability constraints remain. "Improvement theater."

### Visionary
- **Opportunities**:
  1. **Peer-to-peer findings ledger** — lightweight `sd_agent_findings` table where successive agents start from a higher baseline (eliminates redundant rediscovery)
  2. **Adversarial agent at PLAN-TO-EXEC** — catches spec-level errors before they become full EXEC rework cycles
  3. **Parallel gate execution with dependency tiers** — reuse existing `dependency-dag.js` DAG pattern for gate dependency resolution
- **Synergies**: Parallel gates + adversarial agent = adversarial review at zero additional latency. Findings ledger + LEARN module = richer pattern extraction. Parallel children + claim system = already supports sibling claims.
- **Upside Scenario**: SD cycle time drops 40-60%. Quality improves non-linearly (catching one flawed assumption before EXEC prevents entire failed handoff cycle). After 100 SDs, devil's advocate has historical data on which PRD assumptions fail. Protocol becomes self-optimizing.

### Pragmatist
- **Feasibility Scores**:
  - Parallel child execution: **7/10** (infrastructure exists, 1 SD to stabilize)
  - Devil's advocate in workflow: **6/10** (reuse `devils-advocate.js`, 1 SD)
  - DB-driven agent composition: **5/10** (2 SDs, moderate testing)
  - Parallel gate execution: **4/10** (2-3 SDs, high testing burden for 1-2s savings)
  - Inter-agent shared memory: **3/10** (3-5 SDs, architectural mismatch with Task tool model)
- **Resource Requirements**: Token cost for parallel children = 3x per orchestrator ($4.50-$9.00 vs $1.50-$3.00). Challenger agent = ~$0.03/SD. Acceptable.
- **Constraints**: Windows worktree reliability, context mutation in gate ordering, prompt bloat from injecting cross-agent findings
- **Recommended Path**: Enable parallel children first (highest ROI, most work already done), then devil's advocate (proven pattern, clean insertion point)

### Synthesis
- **Consensus**: Enable parallel child execution (#1), inter-agent peer comms is premature (#5)
- **Key Tension**: Devil's advocate value in constrained execution (Challenger says redundant, Visionary says high-impact, Pragmatist says medium)
- **Composite Risk**: Medium — highest-value item has known platform constraints

## Priority Ranking

| # | Improvement | Priority | Effort | ROI | Blocker |
|---|------------|----------|--------|-----|---------|
| 1 | Enable parallel child execution | HIGH | 1 SD | Highest | Windows worktree reliability |
| 2 | Challenger agent at PLAN-TO-EXEC | MEDIUM | 1 SD | Good | May duplicate existing gates |
| 3 | DB-driven agent composition | MEDIUM | 2 SDs | Moderate | Safety rails for mandatory agents |
| 4 | Parallel gate execution | LOW | 2-3 SDs | Low | Context mutation dependencies |
| 5 | Inter-agent shared memory | LOW | 3-5 SDs | Uncertain | Architectural mismatch |

## Open Questions
- Is the Windows worktree reliability issue fully resolved after PR #1380, or does parallel execution surface new failure modes?
- Does `russian-judge.js` + existing adversarial gates provide sufficient "challenger" coverage, or is there a measurable gap?
- What's the actual distribution of multi-child orchestrator SDs? If most SDs have 0-1 children, parallel execution ROI is lower than estimated.
- Would a lightweight findings ledger (JSONB column on `sd_phase_handoffs`) be enough to capture the value without full inter-agent messaging?

## Suggested Next Steps
1. **No immediate SD creation** — no friction observed, improvements are speculative
2. **Monitor for friction signals** — if orchestrator throughput becomes a bottleneck or spec-level rework becomes frequent, revisit #1 and #2
3. **Low-cost experiment**: Try a 2-child orchestrator with `ORCH_PARALLEL_CHILDREN_ENABLED=true` in a controlled session to assess Windows worktree stability
4. **Capture the pattern catalog** — the video's 7 patterns are a useful reference for future team composition decisions (this document serves that purpose)
