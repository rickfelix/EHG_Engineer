# Brainstorm: Research Department as Internal EHG Service

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (cross-cutting internal service)
- **Related Brainstorm**: "Building deep domain expertise into EHG venture ideation" (2026-02-21, needs_triage)
- **Related SDs**: SD-LEO-FEAT-DOMAIN-INTELLIGENCE-SYSTEM-001 (planning), SD-LEO-FIX-ORG-STRUCTURE-CLI-001, SD-LEO-INFRA-ORG-STRUCTURE-DEPARTMENT-001, SD-LEO-ENH-ORG-STRUCTURE-AGENT-001

---

## Problem Statement

EHG ventures currently lack continuous, structured research input — they get a snapshot at creation time but domain knowledge goes stale. The ideation engine similarly operates without deep, accumulated domain intelligence. Research capabilities exist in fragments (research-engine.js, financial_models, modeling_requests) but have no organizational home, no routing mechanism, and no systematic accumulation strategy.

The Research Department is an **internal EHG department** (not a product/venture) that serves as a unified service layer for:
1. **Active ventures** — continuous market intelligence, articles, newsletters, competitive data
2. **The ideation engine** — domain knowledge, model research, trend data that enriches brainstorm sessions and venture creation

## Discovery Summary

### Operating Model: Hybrid
- **Proactive baseline**: Continuously scanning domains relevant to active ventures, accumulating intelligence
- **On-demand deep dives**: Ventures and the ideation engine can request targeted research

### Domain Intelligence as First Capability
- SD-LEO-FEAT-DOMAIN-INTELLIGENCE-SYSTEM-001 (already in PLAN phase) becomes the Research Department's first shipped capability
- Design is complete: 3 modules (~370 LOC) + 1 DB table (domain_knowledge)
- Context injection approach: enriches existing brainstorm agents with domain knowledge, not a 4th agent

### Prerequisite SDs (Department Infrastructure Completion)
| SD Key | Type | What It Delivers |
|--------|------|-----------------|
| SD-LEO-FIX-ORG-STRUCTURE-CLI-001 | bugfix | create-department CLI, npm scripts, v_agent_departments view, docs |
| SD-LEO-INFRA-ORG-STRUCTURE-DEPARTMENT-001 | infrastructure | >=80% test coverage for department feature (currently 0%) |
| SD-LEO-ENH-ORG-STRUCTURE-AGENT-001 | enhancement | Department messaging fan-out to agent_messages (critical for routing) |

### Existing Infrastructure
- **Department system**: Built but empty — 4 root departments, 0 agent assignments, 0 capabilities
- **Research engine**: lib/research/research-engine.js — multi-provider deep research (Claude + OpenAI)
- **Financial models**: financial_models, financial_projections, financial_scenarios tables
- **Modeling requests**: Supports market_trend, portfolio_synergy, kill_gate_prediction, competitive_density
- **Brainstorm sessions**: brainstorm_sessions + brainstorm_question_interactions tables
- **Venture lifecycle**: 25 stages including Stage 2 (AI Multi-Model Critique), Stage 5 (Profitability Forecasting)

---

## Analysis

### Arguments For
1. **Compounding intelligence flywheel** — Every venture the Research Department supports generates domain artifacts that benefit all other ventures. By venture #10, the department draws on pattern data from 9 prior ventures.
2. **Infrastructure already exists** — Department tables, RPCs, hierarchy, messaging are built. This is an instantiation, not a new system.
3. **Clean dependency chain** — 3 small SDs → department creation → DI as first capability. No architectural unknowns.
4. **Load-bearing for venture lifecycle** — Plugs into 6+ stages: Stage 2 critique, Stage 5 forecasting, Stage 8 BMC, kill gates, nursery re-eval, and ideation.
5. **Kill gate intelligence** — With real research coverage, kill_gate_prediction and nursery_reeval signals gain teeth. Early ventures train the model, improving portfolio decisions over time.

### Arguments Against
1. **Org charts may not help AI agents** — Capability routing could be achieved with simpler mechanisms (tags, direct routing) without the department abstraction.
2. **Dual-master demand patterns** — Ventures need fast/specific/on-demand; ideation needs broad/proactive/cadenced. Structurally different consumption patterns.
3. **Attribution is hard** — Measuring "Research Department made this venture succeed faster" requires instrumentation that doesn't exist yet.
4. **3 prerequisite SDs are sprint tax** — They exist because the original orchestrator scored 68/100, consuming capacity before new value is delivered.
5. **0 populated departments is a signal** — The department system has been live with zero real usage, which may indicate the abstraction isn't needed.

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Department abstraction solves a human org problem that may not exist for AI agents — capability routing matters, org charts don't
  2. Dual-master demand patterns (ventures vs ideation) are structural tension, not additive value
  3. 0 agent assignments may signal the abstraction was never useful enough to populate
- **Assumptions at Risk**:
  1. Research ROI is notoriously hard to causally link to venture outcomes
  2. Domain Intelligence doesn't need the department abstraction to ship — prerequisites may be overhead tax
  3. "Connects to existing infrastructure" may be integration debt, not integration value
- **Worst Case**: Department ships as organizational artifact. Research quality unchanged. 3 prerequisite SDs consume sprint slots. Domain Intelligence operates independently of department structure. Six months later: 1 capability registered, 0 measurable impact.

### Visionary
- **Opportunities**:
  1. Compounding intelligence flywheel — persistent knowledge corpus that widens as a moat over time
  2. Ideation engine as product surface — eventually licensable to other venture studios
  3. Kill gate intelligence — research coverage gives prediction signals real teeth
- **Synergies**:
  - Domain Intelligence SD becomes first public artifact of a live department
  - Plugs into 6+ venture lifecycle stages directly
  - financial_models + modeling_requests become triggered workflows, not manual steps
- **Upside Scenario**: 12 active ventures, 3 specialized research agents, weekly weak signal surfacing, pre-populated Business Model Canvases, kill gate predicting failures 2 stages early. EHG makes better venture decisions faster than any comparably-sized studio.

### Pragmatist
- **Feasibility**: 4/10 (moderate — infrastructure exists, dependency chain is short)
- **Resource Requirements**: 3-5 focused sessions, single-agent workload, no new infrastructure or subscriptions
- **Constraints**:
  1. CLI create-department must ship before programmatic instantiation (hard blocker)
  2. 0% test coverage means silent failures if building on unvalidated foundation
  3. Domain Intelligence PRD not yet inserted via add-prd-to-database.js (hard blocker on PLAN-TO-EXEC)
- **Recommended Path**: Insert DI PRD first (unblocks immediately), run 3 prerequisite SDs, then create Research Department and register DI as first capability

### Synthesis
- **Consensus Points**: All agree prerequisite SDs are real dependencies; DI PRD insertion is the immediate unblock; test coverage matters for trust in foundation
- **Tension Points**: "Org chart vs capability routing" is the key design question — does the department add routing value or just a label? Dual-master tension is real but may resolve by starting with one master (ideation first)
- **Composite Risk**: Medium — infrastructure exists and dependency chain is short, but abstraction may be premature. Shipping DI as first capability immediately proves or disproves the department's value.

---

## Open Questions
1. **Does the department abstraction add routing value beyond simpler alternatives?** The messaging fan-out (SD-LEO-ENH-ORG-STRUCTURE-AGENT-001) is the litmus test — if agents use it, the department is real; if not, it's a label.
2. **How to instrument attribution?** Track which research artifacts influenced which venture decisions from day one.
3. **Start with one master or both?** Strong case for ideation-first (Domain Intelligence), proving value before expanding to active venture support.
4. **What research agents need to be registered?** Domain Scanner (proactive), Deep Dive Agent (on-demand), Financial Modeler (tied to modeling_requests)?

## Suggested Next Steps
1. **Immediate**: Insert Domain Intelligence PRD via `node scripts/add-prd-to-database.js` — unblocks PLAN-TO-EXEC with no other dependency
2. **Short-term**: Execute the 3 prerequisite SDs (CLI fix → messaging fan-out → test coverage)
3. **Then**: Create Research Department as DB operation, assign first agent, register Domain Intelligence as first capability
4. **Validate**: Ship Domain Intelligence through the department routing — this is the proof-of-concept for the entire department abstraction
5. **Expand**: If validated, add proactive scanning and venture-facing research services
