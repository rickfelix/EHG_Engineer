# Brainstorm: Bridging Claude Code Agents and LEO Dynamic Sub-Agent System

## Metadata
- **Date**: 2026-02-11
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD

---

## Problem Statement

18 Claude Code agents (`.claude/agents/*.md`) operate as static markdown files. The LEO Protocol has a parallel database-driven sub-agent system (`leo_sub_agents` + `leo_sub_agent_triggers` + Agent Experience Factory) that dynamically composes knowledge at invocation time: issue patterns, retrospective learnings, skills, prevention checklists, success/failure patterns.

**The gap**: When Claude Code spawns an agent natively via the Task tool (`subagent_type="rca-agent"`), the agent gets only its static `.md` identity. The dynamic knowledge composition never happens. When the same agent is invoked via `node scripts/execute-subagent.js --code RCA`, it gets the full dynamic treatment.

**Impact**: Every agent spawned through Claude Code operates without:
- Known issue patterns from `issue_patterns` table (proven solutions, prevention checklists)
- Retrospective learnings from past SDs
- Skills/capabilities composed by the Agent Experience Factory
- Dynamic instructions from `leo_sub_agents.description`/`capabilities`/`metadata`

Two agents (RCA, orchestrator-child) aren't even registered in `phase-model-config.json`.

## Architectural Constraints

1. **Claude Code platform**: `.claude/agents/*.md` files are read by Claude Code at session start. We cannot change how Claude Code loads them.
2. **Agent Experience Factory**: Requires async Supabase queries, token budget allocation, priority-based truncation. Output is a plain text `promptPreamble`.
3. **Existing precedent**: `generate-claude-md-from-db.js` already generates CLAUDE.md from database tables. This pattern is proven and reliable.
4. **Token budgets**: Factory output is capped at ~1200 tokens per agent. Agent `.md` files range from ~200-550 lines.
5. **18 agents affected**: All agents in `.claude/agents/` have this gap.

## Options Analysis

### Option A: Generate-Time Bridge

**Concept**: Sister script to `generate-claude-md-from-db.js` that regenerates `.claude/agents/*.md` files from database. Each file gets auto-generated "dynamic knowledge" sections injected between markers, preserving human-authored sections.

**Mechanism**:
1. Script reads `leo_sub_agents` row for each agent code
2. Calls Agent Experience Factory `compose()` per agent
3. Loads relevant `issue_patterns` via `pattern-loader.js`
4. Injects formatted output between `<!-- DYNAMIC-START -->` / `<!-- DYNAMIC-END -->` markers
5. Preserves everything outside markers

**Pros**:
- Zero runtime overhead (knowledge baked into static files)
- Uses proven CLAUDE.md generation pattern
- Human-editable sections preserved
- Could wire into session-start hook for auto-refresh

**Cons**:
- Knowledge only as fresh as last generation run
- Generated sections create git diff noise
- Must handle marker corruption gracefully

**Precedent**: `generate-claude-md-from-db.js` does exactly this for CLAUDE.md.

### Option B: Prompt-Time Bridge

**Concept**: Parent Claude session queries `loadSubAgentInstructions(code)` before spawning each Task agent, prepends factory output to the Task prompt.

**Mechanism**:
1. CLAUDE.md instruction: "Before invoking sub-agent via Task tool, run `node scripts/compose-agent-preamble.js <CODE>`"
2. Script calls instruction-loader + factory, outputs preamble
3. Parent includes preamble in Task prompt

**Pros**:
- Always-fresh knowledge
- No file generation needed
- Clean separation (static identity in .md, dynamic knowledge in prompt)

**Cons**:
- Adds bash call before every agent spawn (~600ms factory timeout)
- Relies on parent Claude protocol adherence
- Preamble in prompt, not agent system identity
- Increases prompt token usage per spawn

### Option C: Agent Self-Bootstrap

**Concept**: Each agent `.md` includes mandatory first step: run bootstrap script that loads dynamic knowledge.

**Mechanism**:
1. Every `.md` starts with: "FIRST STEP: Run `node scripts/agent-bootstrap.js <CODE>`"
2. Bootstrap calls instruction-loader + factory
3. Agent reads output, incorporates as context
4. Proceeds with task

**Pros**:
- Self-contained (no parent coordination)
- Always fresh
- Pattern already exists (`_model-tracking-section.md`)

**Cons**:
- Agent compliance not guaranteed (agents skip steps)
- Adds latency to every invocation
- Model tracking already proves agents sometimes skip "FIRST STEP"

### Option D: Hybrid (A + C)

**Concept**: Pre-generate bulk knowledge (Option A) + lightweight freshness check (Option C).

**Mechanism**:
1. Generation script bakes in patterns/learnings (updated periodically)
2. Each file includes freshness check: `node scripts/agent-freshness-check.js <CODE> <GENERATED_AT>`
3. Freshness script only outputs delta if new patterns exist since timestamp
4. Usually zero overhead; catches new knowledge when it exists

**Pros**: Best of both worlds. Usually zero cost. Always has baseline.
**Cons**: Most complex. Two systems to maintain. Freshness check still requires DB call.

### Option E: Hook-Based Injection

**Concept**: Use Claude Code hooks to intercept Task tool calls and auto-inject dynamic knowledge.

**Mechanism**:
1. Pre-tool hook on Task tool
2. Hook detects `subagent_type`, maps to agent code
3. Hook runs instruction-loader + factory
4. Hook modifies Task prompt with preamble

**Pros**: Completely transparent. No agent or protocol changes.
**Cons**: Hooks may not support modifying tool parameters. Unknown feasibility. Fragile.

## Tradeoff Matrix

| Dimension | Weight | A: Generate | B: Prompt-Time | C: Bootstrap | D: Hybrid | E: Hooks |
|-----------|--------|:-----------:|:--------------:|:------------:|:---------:|:--------:|
| Complexity | 20% | 9 | 6 | 7 | 4 | 3 |
| Maintainability | 25% | 8 | 5 | 6 | 5 | 3 |
| Freshness | 20% | 5 | 10 | 10 | 9 | 10 |
| Runtime cost | 15% | 10 | 5 | 5 | 8 | 5 |
| Reliability | 20% | 9 | 6 | 6 | 8 | 3 |
| **Weighted** | | **8.15** | **6.25** | **6.75** | **6.55** | **4.50** |

**Critical weakness flag**: Option E scores <3 on Complexity and Reliability (unknown feasibility).

## Recommendation

**Option A (Generate-Time Bridge)** scores highest and aligns with proven patterns. It:
- Mirrors the exact approach that already works for CLAUDE.md
- Has zero runtime cost
- Is the simplest to implement and maintain
- Can be enhanced later with Option C (freshness check) if periodic generation proves insufficient

**Implementation sketch**:
1. Create `scripts/generate-agent-md-from-db.js`
2. Add `<!-- DYNAMIC-KNOWLEDGE-START -->` / `<!-- DYNAMIC-KNOWLEDGE-END -->` markers to each agent `.md`
3. Script queries `leo_sub_agents` + calls factory + injects between markers
4. Wire into session-start hook or `npm run generate:all`
5. Register RCA and orchestrator-child in `phase-model-config.json`

## Open Questions
- Should generated content be committed to git or .gitignored?
- Should the generation run on every session start or on a schedule?
- Should we also align the two invocation paths (Task tool vs execute-subagent.js) or keep them separate?
- Can Claude Code hooks modify tool parameters? (determines Option E feasibility)

## Suggested Next Steps
1. Triangulate with external AIs (AntiGravity, GPT 5.3) for alternative perspectives
2. If validated, create SD for implementation
3. Register RCA and orchestrator-child in `phase-model-config.json` regardless of bridge approach
