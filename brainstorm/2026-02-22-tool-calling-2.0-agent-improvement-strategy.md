# Brainstorm: Tool Calling 2.0 — Agent Improvement Strategy for LEO + Eva

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD (partial — Tool Use Examples is SD-ready; others are Consideration Only)
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (FinTrack, EduPath, MedSync, LogiFlow, Solara Energy) — via Chairman Dashboard
- **Source**: [Anthropic Tool Calling 2.0 Video](http://www.youtube.com/watch?v=3wglqgskzjQ)

---

## Problem Statement

LEO Protocol and the Eva app backend operate in a serial "ping-pong" tool calling pattern: the model calls a tool, waits, parses, calls the next. This creates three compounding friction points — a **sequential gate tax** (5-10 round trips per validation chain where marginal cost compounds with growing context), **schema hallucinations** (sub-agents returning wrong formats for PRD story keys, gate results, and DB columns, causing a 15-20% token waste on retry loops), and **context bloat** (37K tokens of protocol files loaded at every SD start, pushing complex runs to 100-120K where effective context degrades).

Anthropic's Tool Calling 2.0 introduces four features — Programmatic Tool Calling, Dynamic Filtering, Tool Search, and Tool Use Examples — that could structurally address these friction points.

## Discovery Summary

### Friction Points Identified

**1. The Sequential Gate Tax**
During PLAN and BUILD phases, LEO runs multiple gate validations (check_logic, validate_schema, check_security) sequentially. Each turn carries the growing history + 37K protocol files. The marginal cost of the 10th validation is exponentially higher than the 1st. Wall-clock time: 45-90 seconds for a 10-turn gate chain.

**2. Schema Hallucinations in MEMORY.md**
Sub-agents consistently misformat:
- PRD story keys (using `US-LEARN019-001` instead of `NNN:US-NNN`)
- Gate results (returning `{valid, score}` instead of `{passed, score, maxScore}`)
- DB column disambiguation (`id` vs `sd_key` vs `uuid_id`)
- Retrospective columns (`key_takeaways` instead of `key_learnings`)

This "hallucinate-fail-retry" loop accounts for **15-20% of total token spend** per SD run.

**3. Context Bloat**
Protocol files (~37K tokens) load at every SD start. Complex SD runs push to 100-120K, where the model starts missing subtle protocol rules. This is where "effective context" degrades — the rules exist in context but get diluted by volume.

### Pain Concentration
- **PLAN phase** (the bottleneck): Gate validation chains, PRD creation with complex schemas
- **EXEC phase** (coordination chaos): Sub-agent dispatch → fail → correct → succeed → validate
- **Chairman Dashboard** (the opportunity): Multi-venture data aggregation requires multi-turn fetching

### Implementation Boundary
The four features operate at different layers:

| Feature | Layer | Stack |
|---------|-------|-------|
| Tool Use Examples | LEO agent configs | Static config — works in CLI + API |
| Dynamic Filtering | Middleware | Eva backend post-processing hooks |
| Tool Search | Infrastructure | Registry service + search endpoint |
| Programmatic Tool Calling | API-level | Eva backend only (Claude Code CLI doesn't expose it) |

**Critical constraint**: Programmatic Tool Calling is available via the Claude API (for Eva) but NOT in the Claude Code CLI (for LEO). Tool Use Examples work in both.

---

## Analysis

### Arguments For
1. **Schema examples are a near-free accuracy boost** — addresses 15-20% token waste, zero architectural change, works in both CLI and API
2. **Protocol-as-Tool-Library is the long-term architecture** — transforms LEO from "load everything" to "query what you need," a structural efficiency gain that compounds per SD
3. **Eva's Chairman Dashboard becomes an orchestration surface** — the jump from "read aggregator" to "active dispatch" makes the venture studio AI-native vs AI-assisted
4. **Existing proto-patterns reduce build cost** — Vision Score Heal Loop, Claim System badges, Memory tags are already informal tool search/filtering patterns

### Arguments Against
1. **Gate parallelization is misdiagnosed** — sequential gates aren't a tool calling problem, they're a data dependency problem (write-then-read chains). Tool Calling 2.0 doesn't fix this.
2. **Filtering taxonomy is a landmine** — phase boundaries that are too strict suppress cross-phase information. PLAN phase needs EXEC schema constraints to write valid PRDs.
3. **Maintenance burden of static examples** — in a DB-generated protocol (CLAUDE.md), examples drift. Every protocol change becomes two-step maintenance.
4. **Opportunity cost** — every hour building tool infrastructure is an hour not shipping venture features. At current LEO throughput, the sequential tax is tolerable.

---

## Protocol: Friction/Value/Risk Analysis

### Feature 1: Tool Use Examples (Schema Enforcement)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction — Pain level | 4/5 | Hallucinate-fail-retry is the #1 token waster |
| Friction — Breadth | 3/5 | Affects sub-agents across all phases |
| Value — Direct | 4/5 | Eliminates 15-20% retry waste |
| Value — Compound | 2/5 | Doesn't enable further architectural gains alone |
| Risk — Breaking change | 1/5 | Static config addition, no behavior changes |
| Risk — Regression | 2/5 | Examples can drift as protocol evolves |
| **Friction Total** | **7/10** | |
| **Value Total** | **6/10** | |
| **Risk Total** | **3/10** | |
| **Decision** | **(7+6)=13 > 3x2=6** | **IMPLEMENT NOW** |

### Feature 2: Dynamic Filtering (Context Diet)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction — Pain level | 4/5 | 37K protocol load every SD start |
| Friction — Breadth | 3/5 | Every SD start, every agent spawn |
| Value — Direct | 4/5 | Potential 60% context reduction |
| Value — Compound | 4/5 | Enables Protocol-as-Tool-Library |
| Risk — Breaking change | 4/5 | Cross-phase dependency suppression |
| Risk — Regression | 3/5 | Silent gate failures cost more than sequential tax |
| **Friction Total** | **7/10** | |
| **Value Total** | **8/10** | |
| **Risk Total** | **7/10** | |
| **Decision** | **(7+8)=15 > 7x2=14** | **MARGINAL** — defer, measure examples first |

### Feature 3: Tool Search (Deferred Loading)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction — Pain level | 3/5 | Current approach works, just wasteful |
| Friction — Breadth | 3/5 | Scales with agent/tool count |
| Value — Direct | 3/5 | Context savings real but not acute |
| Value — Compound | 5/5 | Protocol-as-Tool-Library, memory indexing |
| Risk — Breaking change | 4/5 | Infrastructure build, registry maintenance |
| Risk — Regression | 2/5 | Additive, doesn't change existing flows |
| **Friction Total** | **6/10** | |
| **Value Total** | **8/10** | |
| **Risk Total** | **6/10** | |
| **Decision** | **(6+8)=14 > 6x2=12** | **IMPLEMENT (deferred)** — build when throughput justifies |

### Feature 4: Programmatic Tool Calling (Eva Backend)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction — Pain level | 4/5 | 45-90s wall-clock gate chains |
| Friction — Breadth | 2/5 | Eva only — CLI constraint means LEO doesn't benefit |
| Value — Direct | 4/5 | 30-50% token reduction |
| Value — Compound | 5/5 | Chairman as orchestration surface |
| Risk — Breaking change | 4/5 | API architecture shift required |
| Risk — Regression | 3/5 | Gate write-then-read deps misdiagnosed as parallelizable |
| **Friction Total** | **6/10** | |
| **Value Total** | **9/10** | |
| **Risk Total** | **7/10** | |
| **Decision** | **(6+9)=15 > 7x2=14** | **MARGINAL** — separate project, after gate isolation redesign |

### Summary Decision Matrix

| Feature | F+V | Rx2 | Margin | Decision |
|---------|:---:|:---:|:------:|----------|
| Tool Use Examples | 13 | 6 | **+7** | **IMPLEMENT NOW** |
| Dynamic Filtering | 15 | 14 | +1 | Defer, measure first |
| Tool Search | 14 | 12 | +2 | Defer, build at scale |
| Programmatic (Eva) | 15 | 14 | +1 | Separate project |

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. The gate tax is NOT a tool calling problem — it's an architectural data dependency problem. Gates have write-then-read chains that can't be parallelized by tool batching. The real fix is gate isolation (read-only validation vs. state-mutating commits).
  2. Schema hallucinations are a prompt problem, not a tool problem. Tool Use Examples help with tool selection, but agents already know which tool to call — they return wrong data inside it. That's a system prompt / few-shot issue.
  3. The Eva backend pivot ignores the primary failure surface. The evidence (retrospective failures, wrong story keys, column mismatches) points to LEO CLI sub-agents, not Eva.
- **Assumptions at Risk**:
  1. Dynamic filtering could suppress cross-phase dependencies. PLAN phase needs EXEC schema constraints to write valid PRDs — a strict phase filter would break this.
  2. Static examples drift as the protocol evolves. Every protocol change becomes two-step maintenance (update protocol AND update examples).
  3. Claude Code hooks could achieve pseudo-programmatic behavior within CLI, making the Eva backend pivot unnecessary for core LEO use cases.
- **Worst Case**: Eva gets clean tool calling while LEO sub-agents continue hallucinating on the same schemas. Six months out, the primary failure surface is untouched.

### Visionary
- **Opportunities**:
  1. **Protocol-as-Tool-Library**: LEO exposes its rules as a queryable tool library. `search_protocol_rules(phase="PLAN", gate="PLAN-TO-LEAD")` returns 3-4 constraints instead of 37K. Saves ~640K tokens of context headroom across a 20-turn SD.
  2. **Schema-Enforced Tool Contracts**: Strict JSON Schema input/output contracts make hallucination impossible — type errors instead of silent wrong answers. Targets the three highest-hallucination surfaces.
  3. **Chairman Dashboard Tool Mesh**: Fan-out `get_venture_capability_graph(venture_id)` across all five ventures in parallel, filter server-side, return only actionable deltas.
- **Synergies**:
  - Claim System badges → formalize as typed tool returns
  - Vision Score Heal Loop → express as schema-enforced tool chain with typed exit conditions
  - Memory tagging convention (`[PAT-AUTO-XXXX]`) → formalize as indexed tool search over memory
- **Upside Scenario**: LEO becomes the first self-optimizing engineering protocol that measurably reduces its own token cost per SD over time. Chairman Dashboard becomes Rick's primary interface for directing LEO across ventures. The solo venture studio scales from "Rick runs LEO manually" to "Rick reviews proposals and approves exceptions."

### Pragmatist
- **Feasibility**: Tool Use Examples = 2/10 difficulty. Dynamic Filtering = 6/10. Tool Search = 7/10. Programmatic (Eva) = 8/10.
- **Resource Requirements**: Examples = ~3 hours. Filtering = 2-3 days. Search = 5-8 days. Programmatic = 1-2 weeks minimum.
- **Constraints**:
  1. Testing burden scales faster than token savings for middleware approaches
  2. Silent gate failures from bad filtering cost more than the sequential tax they save
  3. Tool Search registry has ongoing maintenance tax not justified at current throughput
- **Recommended Path**: Do Tool Use Examples NOW (edit agent configs, zero risk). Evaluate Dynamic Filtering after measuring results. Defer everything else indefinitely unless throughput or Eva architecture changes.

### Synthesis
- **Consensus Points**:
  1. All three agree: schema enforcement / examples is the highest-ROI immediate win
  2. Challenger + Pragmatist agree: Dynamic Filtering carries hidden risk from cross-phase dependency suppression
  3. Visionary + Pragmatist agree: Programmatic Tool Calling for Eva is a separate track from LEO improvements
- **Tension Points**:
  1. **Where to focus**: Challenger says LEO sub-agent prompts (the failure surface), Visionary says Eva backend (the scaling unlock). Both right — sequencing question.
  2. **Tool Search value**: Visionary sees Protocol-as-Tool-Library as transformative. Pragmatist says not worth maintenance tax at current throughput.
  3. **Gate tax diagnosis**: Challenger says it's a protocol redesign problem. Visionary says tool architecture change enables the redesign. Unresolved.
- **Composite Risk**: **Medium** — Immediate win is universally low-risk. Bigger plays carry real implementation risk for a solo operator.

---

## Open Questions
- Can Claude Code hooks (`pre-tool-enforce.cjs`) achieve pseudo-programmatic filtering without the API sandbox?
- How to prevent example drift in a DB-generated protocol? (Could examples be DB-generated too?)
- What's the correct cross-phase information taxonomy for Dynamic Filtering? (PLAN needs which EXEC constraints?)
- Does gate isolation (read-only validation vs. state-mutating) unlock parallelization independent of Tool Calling 2.0?
- What's the latency overhead of Tool Search vs. pre-loaded schemas for small agent pools?

## Suggested Next Steps
1. **Create SD**: Tool Use Examples for LEO agent configs — audit MEMORY.md for all WRONG/RIGHT patterns, inject as system prompt examples in sub-agent definitions. Target: eliminate 15-20% retry token waste. (~3 hours, zero architectural risk)
2. **Baseline measurement**: Before any changes, establish token-per-SD metrics to enable before/after comparison
3. **Investigate**: Can sub-agent system prompts (not tool definitions) carry the schema examples within Claude Code CLI? (Challenger's insight that the hallucination is in the payload, not the tool selection)
4. **Defer**: Dynamic Filtering, Tool Search, and Programmatic Tool Calling until Step 1 results are measured
5. **Future brainstorm**: Gate isolation architecture — separating read-only validation gates from state-mutating commit gates (this is a protocol redesign, not a Tool Calling 2.0 feature)
