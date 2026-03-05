# Brainstorm: Protocol File Context Window Optimization

## Metadata
- **Date**: 2026-03-05
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (cross-cutting infrastructure)

---

## Problem Statement
The CLAUDE*.md protocol files consume up to ~97K tokens (nearly half the 200K context window) when fully loaded. While the auto-loaded baseline is modest (~4,500 tokens for CLAUDE.md + MEMORY.md), on-demand phase files are the real cost: CLAUDE_CORE_DIGEST.md alone is 44KB despite being a "digest," and CLAUDE_PLAN.md is 93KB. This limits session productivity by triggering early compaction, reducing room for SD-specific context (PRDs, user stories, code), and shortening useful work time per session.

The digest system was designed to solve this but has three implementation gaps:
1. Digests are too large (44KB is not a "digest")
2. The loading hook (`load-phase-context.cjs`) steers agents to full files, not digests
3. The tracker (`protocol-file-tracker.cjs`) conflates digest/full reads via equivalence mapping, destroying usage telemetry

## Discovery Summary

### File Size Inventory
| File | Lines | Size | Est. Tokens | Role |
|------|------:|-----:|------------:|------|
| CLAUDE.md | 122 | 6 KB | ~1,500 | Auto-loaded session config |
| MEMORY.md | 200 | ~12 KB | ~3,000 | Auto-loaded persistent memory |
| CLAUDE_CORE_DIGEST.md | 934 | 44 KB | ~11,000 | On-demand (should be default) |
| CLAUDE_LEAD_DIGEST.md | 130 | 5 KB | ~1,200 | On-demand (already right-sized) |
| CLAUDE_PLAN_DIGEST.md | 323 | 15 KB | ~3,800 | On-demand (needs compression) |
| CLAUDE_EXEC_DIGEST.md | 406 | 18 KB | ~4,500 | On-demand (needs compression) |
| CLAUDE_CORE.md | 1,382 | 60 KB | ~15,000 | Escalation target |
| CLAUDE_LEAD.md | 1,630 | 65 KB | ~16,000 | Escalation target |
| CLAUDE_PLAN.md | 2,473 | 93 KB | ~23,000 | Escalation target |
| CLAUDE_EXEC.md | 1,971 | 77 KB | ~19,000 | Escalation target |
| **TOTAL** | **9,528** | **389 KB** | **~97,000** | |

### Current State Assessment
- **Auto-loaded cost**: ~4,500 tokens (2-3% of context) — acceptable
- **Typical LEAD phase**: +12,200 tokens for CORE_DIGEST + LEAD_DIGEST — acceptable IF digests are right-sized
- **Worst case (full files loaded)**: ~97K tokens — nearly half the context window
- **Biggest offenders**: CLAUDE_CORE_DIGEST.md (44KB — 4x target), CLAUDE_PLAN.md (93KB), CLAUDE_EXEC.md (77KB)

### Existing Infrastructure
- **Database source**: `leo_protocol_sections` table → `generate-claude-md-from-db.js`
- **Digest generator**: `scripts/modules/claude-md-generator/digest-generators.js`
- **File tracker**: `scripts/hooks/protocol-file-tracker.cjs` (PostToolUse hook)
- **Phase loader**: `scripts/hooks/load-phase-context.cjs` (PostToolUse hook)
- **Gates**: `core-protocol-gate.js`, `protocol-file-read-gate.js`

### User Design Decisions
- **Goal**: Both reduce consumption AND improve relevance
- **Risk appetite**: Conservative — keep current file structure, optimize content and loading
- **Optimization target**: Session productivity (longer useful sessions)
- **Digest target size**: 5-10KB reference cards (not manuals)
- **Default loading**: Digest first, full file on-demand escalation

## Analysis

### Arguments For
1. **Massive headroom recovery** — Shrinking digests from ~97K to ~15K total frees ~80K tokens for actual SD work
2. **Reduces compaction pressure** — Fewer mid-session compactions = fewer context losses = more productive sessions
3. **Infrastructure already exists** — digest generators, tracker, database-sourced content all in place
4. **Self-reinforcing** — Telemetry from tracker fix enables future evidence-based compression decisions

### Arguments Against
1. **No usage audit** — We don't know which protocol content is load-bearing vs. defensive boilerplate
2. **Human review required** — Compression needs principled section selection, not just truncation
3. **Silent failure mode** — If a digest misses a critical rule, agents produce wrong-but-confident behavior instead of crashing

## Friction/Value/Risk Analysis

| Dimension | Component | Score | Rationale |
|-----------|-----------|-------|-----------|
| **Friction Reduction** | Current friction level | 4/5 | Sessions hit compaction regularly; protocol reads consume 8-50% of context |
| | Friction breadth | 5/5 | Every SD workflow affected (LEAD, PLAN, EXEC) |
| | **Subtotal** | **9/10** | |
| **Value Addition** | Direct value | 4/5 | ~80K tokens freed = longer sessions, fewer compactions |
| | Compound value | 5/5 | Enables context budget hook, data-driven optimization, richer SD context |
| | **Subtotal** | **9/10** | |
| **Risk Profile** | Breaking change risk | 3/5 | Gates coupled to file paths/markers |
| | Regression risk | 2/5 | In-flight SD disruption; silent wrong-but-confident decisions |
| | **Subtotal** | **5/10** | |

**Decision**: (9 + 9) = 18 > (5 * 2) = 10 → **Implement**

## Team Perspectives

### Challenger
- **Blind Spots**: (1) No usage audit to know which content is load-bearing vs. boilerplate; (2) Agent behavioral drift under token pressure — reference cards only work if agents reliably escalate; (3) Digest-first changes failure modes from comprehension failures to silent wrong-but-confident decisions
- **Assumptions at Risk**: (1) "Session productivity" isn't well-defined — fewer tokens ≠ better outcomes if gate errors increase; (2) Incremental compression isn't isolated — protocol files cross-reference heavily
- **Worst Case**: Agents load compact digests confidently, miss gate conditions silently, DB accumulates corrupted handoff records requiring manual cleanup

### Visionary
- **Opportunities**: (1) Progressive protocol loading — digests as entry, full promoted on-demand via gate failure trigger; (2) Session context budget as first-class resource — hook that gates transitions based on headroom; (3) Database-driven semantic compression — compression rules stored alongside content
- **Synergies**: pruneResolvedMemory() auto-healing pattern applicable to digests; AUTOCOMPACT threshold can relax from 80% to ~90%; gates can enforce "load full file" as explicit escalation
- **Upside Scenario**: Total protocol overhead drops from ~97K to <15K tokens. Freed headroom lets orchestrator load richer SD context. Gate pass rates improve. Sessions run longer without compaction.

### Pragmatist
- **Feasibility**: 6/10 — Achievable. Digest generator exists; main work is compression logic, hook routing, gate validation
- **Resource Requirements**: 5 files to modify (digest-generators.js, load-phase-context.cjs, protocol-file-tracker.cjs, core-protocol-gate.js, protocol-file-read-gate.js); DB may need content tagging; medium test burden
- **Constraints**: (1) Gates check specific markers — digests must preserve them; (2) Compression needs principled selection, not truncation; (3) Rollout must happen at SD boundaries
- **Recommended Path**: Audit content taxonomy → compress CORE_DIGEST as pilot → update hook routing → add telemetry tagging

### Synthesis
- **Consensus Points**: Digest compression is highest-leverage; gate compatibility is critical risk; telemetry fix is small once routing is settled; rollout at SD boundaries
- **Tension Points**: Compact digests could cause confident wrong decisions (Challenger) vs. freed context improves decision quality (Visionary); conservative incremental approach (Pragmatist) vs. context budget system (Visionary)
- **Composite Risk**: Medium — manageable with phased rollout and gate validation at each step

## Improvement Dimensions Identified

### 1. Digest Compression (Highest Priority)
- Shrink CLAUDE_CORE_DIGEST.md from 44KB to 5-10KB
- Shrink CLAUDE_PLAN_DIGEST.md from 15KB to 5-10KB
- Shrink CLAUDE_EXEC_DIGEST.md from 18KB to 5-10KB
- CLAUDE_LEAD_DIGEST.md already at 5KB — leave as-is
- Method: Content taxonomy audit in `leo_protocol_sections`, then principled selection of phase-essential vs. reference content
- **Mitigation for silent failure**: Include explicit "ESCALATE TO FULL FILE WHEN:" section in each digest listing the scenarios that require the full version

### 2. Loading Strategy Fix
- Update `load-phase-context.cjs` PHASE_CONTEXT_DOCS to point to digest versions
- Keep full file paths as escalation targets
- Agent instruction: "Read digest first. If you encounter ambiguity or a gate failure, escalate to full file."

### 3. Telemetry Fix
- Split protocol-file-tracker.cjs tracking: record `actual_file_read` separately from `gate_equivalent`
- Persist read telemetry to Supabase (new table or column on `sd_phase_handoffs`)
- Track: which file, digest vs. full, read count, escalation events (digest → full)
- Aggregate across sessions to answer: "What % of the time do agents need the full file?"

### 4. Content Taxonomy (Enables #1)
- Tag `leo_protocol_sections` rows as `essential` (must be in digest) vs. `reference` (full file only)
- Update `digest-generators.js` to filter by tag instead of using line-count heuristics
- Human review per section to classify — this is the bottleneck

### 5. Context Budget Hook (Future — Visionary Idea)
- Lightweight `context-budget.cjs` hook that tracks estimated token usage
- Could gate phase transitions based on available headroom
- Prevents the deadlock-at-100% scenario proactively
- Depends on telemetry (#3) for calibration data

## Open Questions
1. What content in CLAUDE_CORE_DIGEST.md is actually referenced during typical SD work? (Need usage audit)
2. Should the escalation trigger be automatic (gate failure → load full file) or manual (agent decides)?
3. How do we measure "session productivity" to validate the improvement? (Sessions-to-completion? Gate pass rate? Compaction frequency?)
4. Should MEMORY.md also get a compression pass? (245 lines, 15KB — above the 200-line display limit)

## Suggested Next Steps
1. **Create SD** for this work — scope: digest compression pilot (CLAUDE_CORE_DIGEST.md) + loading strategy fix + telemetry fix
2. Start with content taxonomy audit of `leo_protocol_sections` to classify essential vs. reference content
3. Compress CLAUDE_CORE_DIGEST.md as pilot, validate gate passes, measure token savings
4. Roll out to remaining digests once pilot validated
