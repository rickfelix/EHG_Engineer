# Triangulation Prompt: Bridging Static and Dynamic Agent Systems

## Context

We have an AI engineering system (LEO Protocol) that manages work through specialized sub-agents (database, security, testing, RCA, etc.). There are **two parallel agent systems** that grew independently:

**System 1: Claude Code Native Agents** (18 agents)
- Defined as static markdown files (`.claude/agents/*.md`)
- Read by the Claude Code CLI at session start
- Contains: agent identity, instructions, methodology, trigger keywords
- Invoked via `Task tool` with `subagent_type="rca-agent"` etc.
- **Static** — what's in the file is all the agent gets

**System 2: LEO Database-Driven Sub-Agents** (30 agents, 477 trigger phrases)
- Defined in database tables (`leo_sub_agents`, `leo_sub_agent_triggers`)
- Instructions loaded at runtime via an instruction-loader module
- Enhanced by an **Agent Experience Factory** that composes dynamic knowledge:
  - Known issue patterns with proven solutions and prevention checklists
  - Retrospective learnings from past work
  - Relevant skills and success/failure patterns
  - All composed within a token budget (~1200 tokens) with priority-based truncation
- Invoked via `node scripts/execute-subagent.js --code RCA`
- **Dynamic** — agent gets fresh, contextual knowledge every invocation

**The Gap**: When agents are spawned through Claude Code's native system (System 1), they never receive the dynamic knowledge from System 2. All 18 agents operate without issue patterns, retrospective learnings, or factory-composed context. The database system has rich knowledge that's completely bypassed.

## Our Leading Option: Generate-Time Bridge

We're leaning toward **pre-computing** the dynamic knowledge into the static markdown files, similar to how we already auto-generate our main configuration file from the database. The approach:

1. A generation script queries the database for each agent's dynamic knowledge
2. Calls the Agent Experience Factory to compose the preamble
3. Injects the output between markers in each `.md` file (`<!-- DYNAMIC-START -->` / `<!-- DYNAMIC-END -->`)
4. Preserves human-authored sections outside the markers
5. Runs periodically (session start, or on-demand)

**Why we like it**: Zero runtime overhead, proven pattern, simple, high reliability.
**Our concern**: Knowledge freshness — agents only know what was true at generation time.

## What We Want From You

1. **Do you agree with the Generate-Time Bridge approach, or do you see a better pattern?** Consider that we're in a CLI-based AI engineering context where agents are spawned as subprocesses.

2. **What risks or failure modes do you see** in pre-computing dynamic knowledge into static files?

3. **Is there a bridge pattern from other agent frameworks** (LangChain, CrewAI, AutoGen, or similar) that solves this static-vs-dynamic agent knowledge problem differently?

4. **Should the generated content be committed to git or .gitignored?** Arguments either way — versioned knowledge vs. noise in diffs.

5. **Any architectural concerns** about having two parallel agent definition systems long-term? Should we be converging toward one system?

## Alternative Options We Considered

| Option | Approach | Why We Deprioritized |
|--------|----------|---------------------|
| Prompt-Time Bridge | Parent queries DB before each agent spawn, prepends to prompt | Adds ~600ms per spawn, relies on protocol adherence |
| Self-Bootstrap | Agent's first step runs a DB query script | Agents sometimes skip "first steps" in practice |
| Hybrid (Generate + Bootstrap) | Pre-generate + lightweight freshness check | Most complex, two systems to maintain |
| Hook-Based Injection | CLI hooks intercept Task tool calls | Unknown feasibility, fragile |
