---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# Triangulation Synthesis: Bridging Agent Systems


## Table of Contents

- [Metadata](#metadata)
- [Consensus Summary](#consensus-summary)
  - [Key Insight from AntiGravity (Critical)](#key-insight-from-antigravity-critical)
- [Triangulated Findings](#triangulated-findings)
  - [1. Approach Validation](#1-approach-validation)
  - [2. Risks Identified (Triangulated)](#2-risks-identified-triangulated)
  - [3. Git Strategy (Strong Consensus)](#3-git-strategy-strong-consensus)
  - [4. Long-Term Convergence (Strong Consensus)](#4-long-term-convergence-strong-consensus)
  - [5. Framework Precedents (AntiGravity)](#5-framework-precedents-antigravity)
  - [6. Claude Code Agent Teams Perspective (Opus 4.6 — Internal Analysis)](#6-claude-code-agent-teams-perspective-opus-46-internal-analysis)
- [Phase 0: Full Agent Reconciliation Audit](#phase-0-full-agent-reconciliation-audit)
  - [Audit Scope](#audit-scope)
  - [Audit Dimensions (Per Agent)](#audit-dimensions-per-agent)
  - [Expected Findings](#expected-findings)
  - [Audit Output Format](#audit-output-format)
  - [Audit Method](#audit-method)
  - [Audit Decisions Required](#audit-decisions-required)
- [Phase 4: Team-Capable Agents](#phase-4-team-capable-agents)
  - [What Changes from Today](#what-changes-from-today)
  - [Example: RCA Agent Forms an Investigation Team](#example-rca-agent-forms-an-investigation-team)
  - [Example: Database Agent Forms a Migration Team](#example-database-agent-forms-a-migration-team)
  - [What Needs to Be Built](#what-needs-to-be-built)
  - [Team Formation Decision Logic](#team-formation-decision-logic)
  - [Prerequisites](#prerequisites)
  - [Maturity Model](#maturity-model)
- [Synthesis: Recommended Architecture](#synthesis-recommended-architecture)
- [Top 6 Areas for Improvement](#top-6-areas-for-improvement)
  - [1. Knowledge Gap: Agents Operating Without Institutional Memory (THE CORE ISSUE)](#1-knowledge-gap-agents-operating-without-institutional-memory-the-core-issue)
  - [2. Dual Source of Truth: Agent Identity Split Across Files and Database](#2-dual-source-of-truth-agent-identity-split-across-files-and-database)
  - [3. Unregistered Agents: RCA and Orchestrator-Child Missing from Config](#3-unregistered-agents-rca-and-orchestrator-child-missing-from-config)
  - [4. False Confidence Trap: Agents May Stop Querying After Seeing Injected Patterns](#4-false-confidence-trap-agents-may-stop-querying-after-seeing-injected-patterns)
  - [5. Teams Protocol Gap: No Guidance for Knowledge Distribution in Team Contexts](#5-teams-protocol-gap-no-guidance-for-knowledge-distribution-in-team-contexts)
  - [6. AGENT-MANIFEST.md Is Stale and Incomplete](#6-agent-manifestmd-is-stale-and-incomplete)
- [Action Items](#action-items)
  - [Phase 0 (Audit — Do First)](#phase-0-audit-do-first)
  - [Phase 1 (Bridge — After Audit)](#phase-1-bridge-after-audit)
  - [Phase 1.5 (Teams — Alongside Phase 1)](#phase-15-teams-alongside-phase-1)
  - [Phase 2-3 (Convergence)](#phase-2-3-convergence)
  - [Phase 4 (Team-Capable Agents)](#phase-4-team-capable-agents)
  - [Documentation (All Phases)](#documentation-all-phases)
- [GPT 5.3 Meta-Feedback (Process Improvement)](#gpt-53-meta-feedback-process-improvement)

## Metadata
- **Date**: 2026-02-11
- **Models Consulted**: GPT 5.3, AntiGravity (Claude via claude.ai), Claude Opus 4.6 (Claude Code session — Teams-aware analysis)
- **Brainstorm Source**: `brainstorm/2026-02-11-bridge-agent-systems.md`

---

## Consensus Summary

**Both models validate Option A (Generate-Time Bridge)** as the correct architectural choice. AntiGravity provided deep technical analysis confirming the approach. GPT 5.3 focused on strengthening the evaluation framework itself.

### Key Insight from AntiGravity (Critical)

The Agent Experience Factory's "dynamic" knowledge is actually **agent-scoped, not task-scoped**. It retrieves domain-level patterns ("Top 5 recurring DB issues"), not incident-specific data. This data changes slowly enough that generate-time caching is safe and effective. This reframes the freshness concern — it's less of a risk than we thought.

---

## Triangulated Findings

### 1. Approach Validation

| Source | Verdict | Confidence |
|--------|---------|------------|
| Our analysis | Option A (Generate-Time Bridge) | High |
| AntiGravity | Agrees — "correct architectural choice" | High |
| GPT 5.3 | Agrees implicitly (refined the evaluation framework rather than challenging the direction) | Medium |

**Consensus**: Generate-Time Bridge is the right pattern. It's a "Prompt Compiler" — the state-of-the-art pattern used in LangChain (PartialPromptTemplates), CrewAI (templated backstory), and DSPy (compiled few-shot examples).

### 2. Risks Identified (Triangulated)

| Risk | Source | Likelihood | Impact | Mitigation |
|------|--------|:---:|:---:|------------|
| **False Confidence Trap** | AntiGravity | 4/5 | 4/5 | Injected section header: "COMMON EXAMPLES (NOT EXHAUSTIVE)". Instructions must say: "You MUST still query the database for the specific error you are seeing." |
| **Git Noise / Dirty Diffs** | AntiGravity | 5/5 | 3/5 | Separate source from build artifact (see Git Strategy below) |
| **Token Bloat** | AntiGravity | 3/5 | 2/5 | Enforce strict 500-token limit for static version (reserve full 1200 for runtime path) |
| **Stale Critical Alerts** | AntiGravity | 2/5 | 4/5 | Post-insert hook on `issue_patterns` table triggers regeneration or "stale config" warning |
| **Freshness Drift** | Our analysis | 2/5 | 2/5 | Wire generation into session-start hook; AntiGravity confirms data changes slowly (agent-scoped, not task-scoped) |

**Highest priority**: False Confidence Trap (likelihood 4 x impact 4 = 16). Must be addressed in the injected prompt template.

### 3. Git Strategy (Strong Consensus)

**AntiGravity recommendation: GITIGNORE the generated files.**

Separate source from build artifact:

```
Source (committed):     .claude/agents/src/rca.partial.md    ← human identity & instructions
Build (gitignored):     .claude/agents/rca-agent.md          ← generated: source + DB content
```

**Workflow**:
1. Developers edit `agents/src/*.partial.md` (human-authored content)
2. Generation script reads partials + fetches DB content → writes to `.claude/agents/*.md`
3. `.claude/agents/*.md` is gitignored
4. `npm start` or session-start hook ensures agents are fresh

**GPT 5.3 alternative**: Commit on release only. But AntiGravity's approach is cleaner — it eliminates the "mixed source/artifact" problem entirely.

**Our assessment**: AntiGravity's approach is architecturally cleaner. The `.partial.md` → generated `.md` pipeline mirrors how CLAUDE.md already works. One concern: new developers cloning the repo won't have `.claude/agents/*.md` until they run the generation script. Mitigated by `npm postinstall` or documented setup step.

### 4. Long-Term Convergence (Strong Consensus)

**AntiGravity recommends full convergence to database as single source of truth.**

6-Phase roadmap (updated with Phase 0 audit, Teams-aware Phase 1.5, and Team-Capable Agents Phase 4):

| Phase | Action | Outcome |
|-------|--------|---------|
| **Phase 0** (First) | Full Agent Reconciliation Audit across both systems | Complete map of all gaps, mismatches, and missing registrations |
| **Phase 1** (Now) | Generate-Time Bridge with `.partial.md` source files | Every agent arrives with institutional memory, zero runtime cost |
| **Phase 1.5** (Now) | Add CLAUDE.md protocol guidance: "When spawning teammates, include relevant `issue_patterns` for their domain in the task prompt" | Team lead becomes natural real-time knowledge distributor |
| **Phase 2** (Next) | Move human identity text from `.partial.md` into `leo_sub_agents` table | Database becomes sole source of truth |
| **Phase 3** (Next) | Generation script reads 100% from DB → writes `.claude/agents/*.md` | `.claude/agents/` is purely ephemeral read model, fully gitignored |
| **Phase 4** (Future) | Team-Capable Agents — teach agents to form coordinated teams instead of spawning isolated experts | Agents can assemble experienced, communicating teams on demand |

**End state**: An agent triggered by a keyword can form a team of domain experts who all arrive with institutional memory, work in parallel, communicate findings to each other in real-time, and synthesize their independent analyses into a unified result. The database is the single source of truth for all agent identity and knowledge.

**GPT 5.3 alignment**: Requested a "convergence plan with backward compatibility notes" — consistent with the phased approach.

### 5. Framework Precedents (AntiGravity)

| Framework | Pattern | Analogy to Our System |
|-----------|---------|----------------------|
| **LangChain** | PartialPromptTemplates compiled at deploy time | Our generation script = compile step |
| **CrewAI** | Agent backstory templated with Jinja2 at startup | `.partial.md` + DB injection = templated backstory |
| **DSPy** | Few-shot examples compiled/optimized offline | Issue patterns = few-shot failure examples, pre-compiled |

We're implementing a **"Prompt Compiler"** — this is the established pattern across agent frameworks.

### 6. Claude Code Agent Teams Perspective (Opus 4.6 — Internal Analysis)

**Context**: AntiGravity and GPT 5.3 were unaware of Claude Code's Agent Teams feature (released February 2026). This feature allows multiple Claude instances to work in parallel with direct inter-agent communication (SendMessage), shared task lists, and specialized roles — all within a 1M token context window. This analysis was performed by the Claude Code session that has the Teams tooling loaded.

**Key Insight**: Teams doesn't invalidate the Generate-Time Bridge — it *reinforces* it and adds a complementary real-time layer that the other AIs couldn't see.

#### Why Generate-Time Bridge is Even Better With Teams

- Pre-generated knowledge **scales to N agents** without N database queries
- Every teammate gets enriched instructions automatically — no lead coordination overhead
- Zero runtime cost regardless of team size
- The lead doesn't have to remember to distribute knowledge — it's already baked in

#### New Capabilities Teams Adds

| Capability | How It Helps |
|-----------|-------------|
| **Team Lead as Knowledge Distributor** | The lead naturally queries context to assign tasks. Including relevant DB knowledge in task prompts is an incremental addition to what it already does — a managed Prompt-Time Bridge that doesn't depend on each agent's self-discipline. |
| **SendMessage for Mid-Task Knowledge Sharing** | If a teammate discovers a relevant pattern during work, it can broadcast to the team. This is real-time knowledge sharing that no pre-computation approach can provide. |
| **Dedicated Knowledge Teammate** | A lightweight "librarian" agent whose only job is to query the DB and share relevant patterns on request. Other teammates can ask it questions. |
| **Shared Task Lists as Knowledge Channel** | Task descriptions (TaskCreate) can embed relevant patterns/learnings alongside the work assignment. |
| **1M Token Context Window** | The team lead can hold substantial knowledge context while coordinating multiple teammates, reducing the need for each agent to independently carry knowledge. |

#### What AntiGravity and GPT 5.3 Missed

1. The team lead is a **natural knowledge distributor** — no new infrastructure needed, just protocol guidance
2. `SendMessage` enables **mid-task knowledge sharing** — a pattern impossible in single-agent spawning
3. Shared task lists provide **another channel** for embedding relevant knowledge in task descriptions
4. The freshness concern is **further reduced** — even if pre-generated knowledge ages slightly, the team lead can supplement with fresh queries when assigning specific tasks

#### Teams-Aware Layered Architecture

| Layer | Mechanism | Freshness | Cost |
|-------|-----------|-----------|------|
| **Base layer** | Generate-Time Bridge (pre-baked `.md` files) | Periodic (session start) | Zero runtime |
| **Team layer** | Lead includes task-specific knowledge in spawn prompts | Real-time | One DB query per teammate spawn |
| **Collaboration layer** | SendMessage for mid-task discovery sharing | Real-time | Zero (organic) |

This layered approach means the Generate-Time Bridge handles 90% of knowledge delivery at zero cost, the team lead covers the remaining 10% for task-specific context, and SendMessage handles emergent discoveries. No single layer needs to be perfect.

---

## Phase 0: Full Agent Reconciliation Audit

**Why Phase 0 must come first**: Building the Generate-Time Bridge on top of two systems that are already out of sync would bake in mismatches. We need a complete map of the gap before bridging it.

### Audit Scope

The audit must reconcile **every agent** across both systems:

- **30 agents** in `leo_sub_agents` table (database)
- **18 agent `.md` files** in `.claude/agents/` (Claude Code)
- **16 entries** in `phase-model-config.json` (model tier routing)
- **477 trigger phrases** in `leo_sub_agent_triggers` (database)
- Trigger keywords listed in each `.md` file (static)
- Trigger keywords listed in CLAUDE.md "Sub-Agent Trigger Keywords" section (generated)

### Audit Dimensions (Per Agent)

For each agent that exists in either system, the audit must check:

| Dimension | Check | Source A | Source B |
|-----------|-------|----------|----------|
| **Existence** | Does the agent exist in both systems? | `leo_sub_agents` row | `.claude/agents/*.md` file |
| **Identity** | Are name, description, and role consistent? | `leo_sub_agents.name`, `.description` | `.md` file header and identity section |
| **Capabilities** | Do listed capabilities match? | `leo_sub_agents.capabilities` JSONB | `.md` file capabilities/methodology |
| **Trigger Phrases** | Are trigger keywords aligned? | `leo_sub_agent_triggers` rows | `.md` file "Trigger Keywords" section |
| **Model Tier** | Is a model tier assigned? | `phase-model-config.json` entry | `.md` file `model:` frontmatter |
| **Category Mapping** | Is the agent mapped to pattern categories? | `subAgentCategoryMapping` in config | (implicit — determines which patterns the factory composes) |
| **CLAUDE.md Registration** | Is the agent listed in the trigger table? | CLAUDE.md "Sub-Agent Trigger Keywords" section | (generated from DB — should be automatic) |
| **Metadata** | Are version, success/failure patterns present? | `leo_sub_agents.metadata` JSONB | `.md` file "Success/Failure Patterns" sections |
| **Activation Type** | Manual vs automatic — consistent? | `leo_sub_agents.activation_type` | `.md` file description (proactive vs on-demand) |
| **Active Status** | Is the agent active in DB? Archived in files? | `leo_sub_agents.active` boolean | AGENT-MANIFEST.md active/archived list |

### Expected Findings

Based on what we already know, the audit will likely surface:

| Category | Known Examples | Expected Count |
|----------|---------------|:--------------:|
| **DB-only agents** (no `.md` file) | Unknown — 30 DB agents vs 18 files = 12 gaps | ~12 |
| **File-only agents** (no DB entry) | Possibly orchestrator-child-agent | ~1-2 |
| **Missing from `phase-model-config.json`** | RCA, orchestrator-child confirmed | 2+ |
| **Missing from `subAgentCategoryMapping`** | RCA confirmed, likely others | 2+ |
| **Trigger phrase mismatches** | Not yet investigated | Unknown |
| **Description/capability drift** | Not yet investigated | Unknown |
| **Stale metadata** | AGENT-MANIFEST.md lists 10 agents, actually 18 | Confirmed |

### Audit Output Format

The audit should produce a single reconciliation table:

```
| Agent Code | DB Row? | .md File? | Config? | CatMap? | Triggers Aligned? | Identity Aligned? | Status |
|------------|:-------:|:---------:|:-------:|:-------:|:-----------------:|:-----------------:|--------|
| RCA        |   ?     |    Yes    |   No    |   No    |        ?          |        ?          | GAPS   |
| DATABASE   |   Yes   |    Yes    |   Yes   |   Yes   |        ?          |        ?          | CHECK  |
| QUICKFIX   |   Yes   |    No     |   Yes   |   Yes   |       N/A         |       N/A         | DB-ONLY|
| ...        |         |           |         |         |                   |                   |        |
```

Plus a summary of:
- Total agents across both systems (deduplicated)
- Agents with full parity (present and aligned in both)
- Agents with partial coverage (present in both but mismatched)
- Agents only in DB (need `.md` file — or decision not to create one)
- Agents only in files (need DB registration)
- Missing config registrations

### Audit Method

1. Query `leo_sub_agents` for all 30 agents (code, name, description, capabilities, metadata, active)
2. List all `.claude/agents/*.md` files and extract frontmatter + key sections
3. Read `phase-model-config.json` for all registered codes
4. Query `leo_sub_agent_triggers` grouped by `sub_agent_id` for trigger phrase counts
5. Compare across all dimensions per agent
6. Produce reconciliation table and gap summary

### Audit Decisions Required

For each gap found, a decision must be made:

| Gap Type | Decision Options |
|----------|-----------------|
| DB-only agent, no `.md` file | Create `.md` file? Or mark as script-only agent? |
| File-only agent, no DB row | Create DB row? Or remove `.md` file? |
| Missing from config | Add to `phase-model-config.json` |
| Trigger phrase mismatch | Which source is authoritative? Align to DB (since CLAUDE.md is generated from DB) |
| Description/capability drift | Which source is current? Update the stale one |

These decisions feed directly into the Phase 1 Generate-Time Bridge — the bridge script needs to know exactly which agents to generate and what the authoritative source is for each.

---

## Phase 4: Team-Capable Agents

**Vision**: Any agent triggered by a keyword can form a coordinated team of domain experts who all arrive with institutional memory, work in parallel, communicate with each other, and synthesize findings into a unified result.

### What Changes from Today

| Aspect | Today (Individual Spawns) | Phase 4 (Team-Capable) |
|--------|--------------------------|------------------------|
| **How experts are invoked** | Sequential `Task` tool calls, each isolated | `TeamCreate` + parallel `Task` spawns as teammates |
| **Expert communication** | None — experts can't see each other's work | `SendMessage` — experts share findings in real-time |
| **Lead coordination** | Manual: lead reads each result sequentially, synthesizes alone | Organic: lead assigns tasks, teammates report back, cross-pollinate insights |
| **Knowledge delivery** | Phase 1 bakes in domain knowledge per agent | Same, plus lead supplements with task-specific context at spawn time |
| **Synthesis quality** | Lead synthesizes from N independent, non-communicating analyses | Lead synthesizes from N analyses that have already cross-referenced each other |

### Example: RCA Agent Forms an Investigation Team

```
User: "The migration keeps failing on the RLS policy check"
         │
         ▼
   Trigger: "keeps failing" → RCA agent spawned
         │
         ▼
   RCA agent (team lead) creates team:
   TeamCreate("rca-investigation")
         │
         ├──► Spawns database-agent as teammate
         │    - Pre-baked: top DB patterns, migration pitfalls, schema lessons
         │    - Task-specific: "Analyze this RLS policy migration failure independently"
         │
         ├──► Spawns security-agent as teammate
         │    - Pre-baked: RLS patterns, auth lessons, policy design failures
         │    - Task-specific: "Analyze from security/permissions perspective"
         │
         └──► Spawns testing-agent as teammate
              - Pre-baked: test strategy patterns, regression lessons
              - Task-specific: "What test coverage would have caught this?"
         │
         ▼
   Teammates work in parallel:
         │
   database-agent finds: "The policy references a column that was renamed in a previous migration"
         │──► SendMessage to security-agent: "Check if the old column name is in any other policies"
         │
   security-agent responds: "Found 3 other policies referencing the old name"
         │──► SendMessage to RCA lead: "Systemic issue — column rename didn't cascade to RLS policies"
         │
   testing-agent finds: "No migration test validates RLS policy column references"
         │
         ▼
   RCA agent synthesizes:
   - Root cause: Column rename migration doesn't update RLS policy references
   - Expert findings already cross-referenced (database + security confirmed scope)
   - CAPA: Add migration validation that checks RLS policies for stale column refs
   - Test gap: Add E2E test for column rename → RLS policy consistency
```

### Example: Database Agent Forms a Migration Team

```
User: "We need to add a new table with RLS and update the API"
         │
         ▼
   Trigger: "create table" + "RLS" → database-agent spawned
         │
         ▼
   database-agent (team lead) creates team:
   TeamCreate("migration-implementation")
         │
         ├──► Spawns security-agent: "Design RLS policies for this table"
         │    - Pre-baked: RLS design patterns, common policy mistakes
         │
         ├──► Spawns api-agent: "Design the API endpoints for this new table"
         │    - Pre-baked: API design patterns, endpoint naming conventions
         │
         └──► Spawns testing-agent: "Design test plan for migration + API + RLS"
              - Pre-baked: migration test patterns, E2E strategy
         │
         ▼
   Teammates communicate:
   security-agent → api-agent: "RLS requires user_id column — make sure API passes auth context"
   api-agent → testing-agent: "Endpoints are /api/v1/resource — test these paths"
   testing-agent → database-agent: "Need seed data in migration for tests to work"
         │
         ▼
   database-agent synthesizes: Complete migration + API + RLS + tests
   All cross-layer concerns caught by teammate communication
```

### What Needs to Be Built

| Component | Work Required |
|-----------|---------------|
| **Team formation logic** | Each agent's instructions need guidance on *when* to form a team vs spawn individual experts. Rule of thumb: form a team when the problem spans 2+ domains. |
| **Agent `.md` updates** | Add a "Team Formation" section to relevant agents (RCA, DATABASE, DESIGN, etc.) instructing them how to use `TeamCreate`, assign tasks, and synthesize. |
| **Team composition templates** | Define common team compositions per agent type (e.g., RCA always includes the relevant domain expert + one adjacent expert). Store in `leo_sub_agents.metadata` or a new `agent_team_templates` table. |
| **Spawn prompt templates** | Standardize how the team lead includes task-specific context alongside pre-baked knowledge when spawning teammates. |
| **Teardown protocol** | Team lead must `SendMessage` shutdown requests and `TeamDelete` after synthesis is complete. Prevent orphaned teams. |

### Team Formation Decision Logic

Not every invocation warrants a team. The agent should decide based on:

| Signal | Individual Spawn | Form a Team |
|--------|:---:|:---:|
| Single-domain issue (pure DB, pure security) | Yes | |
| Cross-domain issue (DB + security, API + testing) | | Yes |
| Simple/known pattern (proven solution exists) | Yes | |
| Complex/novel issue (no proven solution) | | Yes |
| Time-critical quick fix | Yes | |
| Systemic investigation (recurring pattern) | | Yes |
| Single file change | Yes | |
| Multi-layer change (schema + API + tests + RLS) | | Yes |

### Prerequisites

Phase 4 depends on all prior phases:

| Dependency | Why Required |
|-----------|-------------|
| **Phase 0** (Audit) | Must know which agents exist and are aligned before teaching them to form teams with each other |
| **Phase 1** (Generate-Time Bridge) | Teammates must arrive with experience — otherwise you're forming a team of amnesiac experts |
| **Phase 1.5** (Teams protocol) | Basic protocol for knowledge distribution in team contexts |
| **Phase 2-3** (DB convergence) | Team composition templates should live in the database alongside agent definitions, not in scattered files |

### Maturity Model

```
Phase 0-1:   Agents have experience (institutional memory)
             └─ "Every specialist has read the company manual"

Phase 1.5:   Lead distributes task-specific knowledge
             └─ "The manager briefs each specialist on the specific job"

Phase 4:     Agents form experienced, communicating teams
             └─ "The lead assembles a project team of specialists who
                 all have experience, get briefed on the job, AND
                 can talk to each other during the work"
```

---

## Synthesis: Recommended Architecture

```
┌─────────────────────────────────────────────────┐
│  Source of Truth (Phase 1: files, Phase 2+: DB) │
├─────────────────────────────────────────────────┤
│  .claude/agents/src/*.partial.md  (human text)  │
│  leo_sub_agents table             (DB config)   │
│  issue_patterns table             (patterns)    │
│  retrospectives                   (learnings)   │
└────────────────────┬────────────────────────────┘
                     │
          ┌──────────▼──────────┐
          │  Generation Script  │
          │  (Prompt Compiler)  │
          │                     │
          │  1. Read partials   │
          │  2. Query DB        │
          │  3. Call Factory    │
          │  4. Enforce 500tok  │
          │  5. Add disclaimers │
          │  6. Write .md files │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │  .claude/agents/    │
          │  *.md (GITIGNORED)  │
          │                     │
          │  Static identity    │
          │  + Dynamic knowledge│
          │  + "NOT EXHAUSTIVE" │
          │    disclaimer       │
          └─────────┬──────────┘
                    │
       ┌────────────┼────────────────┐
       │            │                │
       ▼            ▼                ▼
  ┌─────────┐ ┌──────────┐ ┌──────────────────┐
  │ Single  │ │  Team    │ │  Team Lead       │
  │ Agent   │ │ Teammate │ │  (Orchestrator)  │
  │ Spawn   │ │  Spawn   │ │                  │
  │         │ │          │ │ Supplements with  │
  │ Gets    │ │ Gets     │ │ task-specific DB  │
  │ pre-    │ │ pre-     │ │ knowledge in      │
  │ baked   │ │ baked    │ │ spawn prompts &   │
  │ .md     │ │ .md +    │ │ SendMessage       │
  │         │ │ lead's   │ │                  │
  │         │ │ context  │ │ [REAL-TIME LAYER]│
  └─────────┘ └──────────┘ └──────────────────┘
```

**Knowledge delivery layers**:
| Layer | Mechanism | Freshness | Cost |
|-------|-----------|-----------|------|
| Base | Pre-generated `.md` files | Session start | Zero runtime |
| Team | Lead embeds task-specific knowledge in spawn prompts | Real-time | ~1 DB query/spawn |
| Collaboration | SendMessage for mid-task discoveries | Real-time | Zero (organic) |

**Triggers for regeneration**:
- Session start (hook)
- `npm postinstall`
- Manual: `npm run generate:agents`
- Future: post-insert hook on `issue_patterns` table

---

## Top 6 Areas for Improvement

Based on the full analysis — the gap discovery, brainstorm, triangulation, and Teams-aware review — these are the highest-impact improvement areas, ranked by urgency and payoff:

### 1. Knowledge Gap: Agents Operating Without Institutional Memory (THE CORE ISSUE)

**What**: 18 Claude Code agents spawn without issue patterns, retrospective learnings, or factory-composed knowledge. They repeat mistakes the system has already solved. Additionally, 30 DB agents exist but only 18 have Claude Code counterparts — the full extent of the gap is unknown until audited.

**Impact**: Every agent invocation is a missed opportunity to use accumulated knowledge. The RCA agent — whose entire job is to prevent recurring issues — doesn't even receive the list of known recurring issues.

**Fix**: Phase 0 (Reconciliation Audit) to map the full extent, then Phase 1 (Generate-Time Bridge) to close it. The audit must come first — building a bridge on top of mismatched systems bakes in errors.

### 2. Dual Source of Truth: Agent Identity Split Across Files and Database

**What**: Each agent has identity defined in two places — `.claude/agents/*.md` (static) and `leo_sub_agents` table (dynamic). These can drift apart. Updates to one don't propagate to the other.

**Impact**: Confusion about which definition is authoritative. Risk of contradictory instructions between the file and DB versions. Maintenance burden of keeping both in sync.

**Fix**: Phase 2-3 convergence. Database becomes sole source of truth, `.claude/agents/*.md` becomes a generated read model.

### 3. Unregistered Agents: RCA and Orchestrator-Child Missing from Config

**What**: Two agents (`rca-agent`, `orchestrator-child-agent`) aren't registered in `phase-model-config.json`. They have no model tier assignment, no `subAgentCategoryMapping`, and no entry in the phase-based model selection system.

**Impact**: These agents can't benefit from model tier optimization (haiku/sonnet/opus routing). The factory can't look up their domain categories. They're invisible to the model allocation system.

**Fix**: Quick fix — add entries to `phase-model-config.json`. Independent of the bridge work.

### 4. False Confidence Trap: Agents May Stop Querying After Seeing Injected Patterns

**What**: When agents receive pre-baked patterns in their instructions, they may assume the list is complete and skip task-specific database queries. AntiGravity rated this 4/5 likelihood, 4/5 impact.

**Impact**: Agents miss new or specific patterns not covered in the pre-generated snapshot. Defeats the purpose of having a live knowledge base.

**Fix**: Mandatory "COMMON EXAMPLES (NOT EXHAUSTIVE)" disclaimer in all generated sections. Explicit instruction: "You MUST still query the database for the specific error you are seeing." Must be part of the generation template, not left to individual agent discretion.

### 5. Teams Protocol Gap: No Guidance for Knowledge Distribution in Team Contexts

**What**: When Agent Teams are used, the team lead has a natural opportunity to supplement pre-baked knowledge with task-specific DB queries. But there's no protocol guidance for this — the lead doesn't know it should include relevant `issue_patterns` in task assignments.

**Impact**: Teams replicate the same knowledge gap at the coordination layer. The lead assigns tasks without relevant context, even though it has the tools to query the DB.

**Fix**: Phase 1.5 — add CLAUDE.md protocol guidance: "When spawning teammates via Task tool, query relevant `issue_patterns` for the teammate's domain and include in the task prompt."

### 6. AGENT-MANIFEST.md Is Stale and Incomplete

**What**: The manifest (`AGENT-MANIFEST.md`) lists 10 agents (7 active, 3 archived) but there are actually 18 agent files. It was last updated 2025-10-12. It references an `_archived/` directory structure that doesn't match the current flat layout. It doesn't mention RCA, risk, regression, stories, dependency, or api agents.

**Impact**: Misleading documentation. Developers trust the manifest to understand the agent ecosystem but it's missing 8 agents and has outdated architecture.

**Fix**: Either regenerate the manifest from the database (aligns with convergence direction) or update it manually. If we implement the Generate-Time Bridge, the manifest itself should be generated.

---

## Action Items

### Phase 0 (Audit — Do First)
1. **Run Full Agent Reconciliation Audit** — Query DB + scan files + read config, produce reconciliation table for all ~30 agents across both systems
2. **Make gap decisions** — For each mismatch, decide: create missing entry, update stale source, or mark as intentionally asymmetric
3. **Register RCA and orchestrator-child** in `phase-model-config.json` (known gap, can fix immediately)

### Phase 1 (Bridge — After Audit)
4. **Create SD** for the Generate-Time Bridge implementation
5. **Design the `.partial.md` format** — what stays human-authored vs what's generated
6. **Add "NOT EXHAUSTIVE" disclaimer** to the Agent Experience Factory output template
7. **Regenerate AGENT-MANIFEST.md** from database or update manually to reflect all agents

### Phase 1.5 (Teams — Alongside Phase 1)
8. **Add Teams protocol guidance** to CLAUDE.md: lead should include domain-relevant patterns in teammate spawn prompts

### Phase 2-3 (Convergence)
9. **Plan Phase 2** — migrating human identity text into `leo_sub_agents` table
10. **Plan Phase 3** — full DB-driven generation, `.claude/agents/` becomes ephemeral read model

### Phase 4 (Team-Capable Agents)
11. **Define team formation logic** — when should an agent form a team vs spawn individual experts?
12. **Create team composition templates** — common team structures per agent type (stored in DB)
13. **Update agent instructions** — add "Team Formation" sections to RCA, DATABASE, DESIGN, and other multi-domain agents
14. **Build spawn prompt templates** — standardize how leads include task-specific context when spawning teammates
15. **Add teardown protocol** — ensure teams are cleanly shut down after synthesis is complete

### Documentation (All Phases)
16. **Document the full architecture** — from Phase 0 audit through Phase 4 team-capable agents, including the maturity model, decision logic, and examples
17. **Update CLAUDE.md** — add agent bridge architecture reference, Teams knowledge distribution protocol, and team formation guidance
18. **Update AGENT-MANIFEST.md** — regenerate to reflect all agents, their capabilities, team formation eligibility, and which phases they're covered by
19. **Create architecture diagram** — visual reference showing the knowledge delivery layers (pre-baked → lead-distributed → team-communicated) and how all phases build on each other

---

## GPT 5.3 Meta-Feedback (Process Improvement)

GPT 5.3 didn't answer the technical questions directly but instead improved the triangulation prompt itself. Key additions for future triangulations:

- Add **decision constraints** (max latency, complexity budget, team size)
- Ask for **ranked recommendations with confidence levels**
- Require an explicit **failure-mode matrix** (severity + likelihood + mitigation)
- Ask for a **migration path** from current to target state
- Define **required output format** for cross-model comparability

**Saved improved prompt template**: `brainstorm/2026-02-11-bridge-agent-systems-triangulation-prompt.md` (GPT 5.3's tightened version is in the user's conversation for reference)
