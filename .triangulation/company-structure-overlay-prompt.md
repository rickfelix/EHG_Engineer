# Triangulation Prompt: EHG/LEO Company-Structure Overlay

## Instructions for External AI Analysis

**Send this prompt to**: ChatGPT (GPT-4), Gemini, or other AI assistants

**Purpose**: Get independent architectural opinions on extending a governance protocol into a "company structure" overlay without leading toward a predetermined conclusion.

---

## PROMPT TO SEND (Copy below this line)

---

# Architectural Analysis Request: Governance Protocol as Company Structure

## Context

I'm evaluating whether to extend an existing software governance protocol (called "LEO") to model a "company structure" with departments and employee-like agents. I want your independent architectural opinion.

## Current System (Factual Description)

**LEO Protocol** is a governance layer that:
- Manages work items called "Strategic Directives" (SDs) through phases: LEAD → PLAN → EXEC
- Uses "sub-agents" (specialized AI modules) for validation tasks (Security, Testing, Database, Design, etc.)
- Stores all state in a PostgreSQL database (Supabase)
- Has a self-improvement mechanism: retrospectives → pattern extraction → protocol updates
- Supports protocol versioning with supersession

**Current Sub-Agent System**:
- 20+ sub-agents with keyword-based trigger routing
- Each execution logged with verdict (PASS/FAIL), confidence score, execution time
- No performance-based routing (all keyword matching)
- No formal "department" grouping of sub-agents

**Existing Schema Elements** (already in database but not fully utilized):
- `agent_registry` table with hierarchy support (LTREE paths, parent_agent_id)
- `agent_relationships` table (reports_to, delegates_to relationship types)
- `agent_performance_metrics` table (columns exist but not populated)
- `tool_registry` table with 13 seeded tools (shared services concept)

**Sacred Constraints** (must not violate):
1. The underlying venture workflow (stages, validation) is immutable
2. LEO remains a governance/orchestration layer, not the execution layer
3. Existing fractal hierarchy (Chairman → EVA → Venture CEO → VPs → Crews) stays valid
4. Strict separation: governance plane vs runtime plane

## Proposed Extensions (Under Evaluation)

**A. Department Model**: Group sub-agents into departments (Engineering, QA, Security, Docs, etc.) with reporting lines

**B. Employee System**: Sub-agents behave like "employees" with:
- Specialties and capability tags
- Performance KPIs (accuracy, speed, rework rate)
- Routing based on performance + capabilities
- Potential promotion/demotion logic

**C. Self-Improvement Loop**: LEO improves its own protocols via:
- Retrospective analysis → proposed changes
- AI-scored quality assessment
- Governance gates before changes go live
- Effectiveness tracking

**D. Shared Services**: Reusable capabilities across ventures (tools, crews)

## Questions for Your Analysis

1. **Feasibility**: Is modeling AI sub-agents as "employees" with KPIs architecturally sound, or does it introduce problematic complexity?

2. **Department Grouping**: What are the tradeoffs of grouping sub-agents into departments vs keeping them flat?

3. **Performance-Based Routing**: Should task routing consider agent performance metrics, or is capability-matching sufficient? What are the risks?

4. **Self-Improvement Governance**: What guardrails would you recommend for a system that modifies its own protocols?

5. **Schema Design**: Given the existing tables (agent_registry with hierarchy, agent_performance_metrics), what's the minimal schema change to enable this?

6. **Phasing**: If implementing incrementally, what order would you recommend and why?

7. **Anti-Patterns**: What should we explicitly avoid in this design?

8. **Alternative Approaches**: Are there simpler ways to achieve the goals (better sub-agent routing, self-improvement, organizational structure) that we might be overlooking?

## What I'm NOT Looking For

- Don't assume any particular answer is correct
- Don't just validate the proposed approach
- If you think this is overengineered or misguided, say so directly
- If you see risks or better alternatives, prioritize those

## Output Format Requested

1. **Initial Reaction**: Is this a good idea, bad idea, or depends?
2. **Tradeoff Analysis**: For each proposed extension (A-D), list pros/cons
3. **Recommended Approach**: What would you actually build?
4. **What to Avoid**: Specific anti-patterns or pitfalls
5. **Critical Questions**: What should we clarify before proceeding?

---

## END OF PROMPT

---

## After Receiving Responses

Bring the external AI responses back for triangulation. We'll compare:
- Areas of agreement (high confidence)
- Areas of disagreement (needs investigation)
- Novel insights not in original analysis
- Potential blind spots in any analysis

