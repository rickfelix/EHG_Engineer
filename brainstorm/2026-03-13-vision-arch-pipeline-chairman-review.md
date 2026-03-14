# Brainstorm: Vision & Architecture Pipeline Chairman Review

## Metadata
- **Date**: 2026-03-13
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (cross-cutting protocol improvement)

---

## Problem Statement
The brainstorm-to-vision-to-architecture pipeline auto-generates planning documents without chairman input, leading to three recurring issues: (1) questionable aspects — over-optimistic claims, bold assumptions, high-risk items, unresolved tensions — pass through unchecked, (2) architecture plans defer work with vague "future work" labels instead of planning all phases completely, and (3) architecture plan generation only consumes the summary document, losing nuance from the full brainstorm conversation.

## Discovery Summary

### Chairman Review Checkpoint
- Insert after brainstorm completes, before vision auto-generation (Step 8.7, between Edge-Case Bucketing and mandatory vision/arch creation)
- The LLM analyzes the brainstorm conversation and team perspectives to identify questionable aspects
- Each flagged item is presented individually via AskUserQuestion with multiple-choice options and a recommended option with rationale
- No severity floor — ALL detected items are surfaced, regardless of LOW/MEDIUM/HIGH severity
- "Needs more research" option pauses the pipeline entirely and suggests a focused follow-up brainstorm

### Questionable Aspects Criteria (8 categories)
1. **"Will" language without evidence** — claims stated as certainties with no validation path
2. **No validation path** — assumptions that can't be tested before committing resources
3. **Scope implies >2 phases** — signals the work may be too large for a single SD
4. **Challenger-Visionary disagreement** — risks the Challenger raised that the Visionary didn't address
5. **Implicit dependencies** — the plan assumes something exists or works that hasn't been verified
6. **Single-point-of-failure assumptions** — the design hinges on one external service, one pattern, or one untested approach
7. **Complexity underestimation** — items described in one sentence that typically take significant implementation effort
8. **Contradictions between team perspectives** — where tension was flagged but no resolution was reached

### AskUserQuestion Pattern Per Flagged Item
- **Header**: Flagged item + severity level
- **Question**: What the issue is and why it was flagged
- **Options**: Multiple choice, adapted per category:
  - Accept as-is (with rationale)
  - Flag as risk (include in vision Risk Mitigation section)
  - Reduce scope (defer to tracked child SD)
  - Needs more research (HALTS pipeline, suggests follow-up brainstorm)
- **Recommended option**: LLM-selected based on brainstorm context and team analysis

### No-Deferral Architecture Plans
- Architecture plans must be phased-but-complete
- "Deferred to future work" with no SD is banned
- "Deferred to a separately tracked child SD" (with explicit SD key placeholder) is acceptable
- Each phase maps to a named SD — e.g., SD-TOPIC-PHASE2-001
- If something is too significant a lift, it should be caught during chairman review and the vision should capture the scoping decision

### Full Conversation Leverage
- Architecture plan generation must consume the entire brainstorm conversation, not just the saved summary document
- In-session: full conversation context is naturally available — use it directly
- Standalone/offline: fall back to the saved brainstorm document (with awareness of truncation limits)
- The saved vision doc serves as a structural anchor; the conversation provides the nuance

## Analysis

### Arguments For
1. **Catches over-scoped SDs before they consume implementation cycles** — chairman review is a cheap gate that prevents expensive downstream rework
2. **Eliminates the "deferred to future" black hole** — forces explicit planning of all phases, even if split across child SDs
3. **Richer arch plans from full conversation context** — currently losing nuance by only consuming the summary doc
4. **Low implementation cost** — purely prompt changes to brainstorm.md, no database/code/migration work
5. **Intentionally duplicative safety net** — brainstorm catches what it catches, but vision review is a second pass on synthesized output

### Arguments Against
1. **Chairman checkpoint adds blocking friction** — if user isn't present, pipeline stalls with no recovery (mitigated: this only runs in interactive brainstorm sessions)
2. **"No deferral" may produce padding instead of real design** — without arch plan quality gate, the rule changes labels not substance (mitigated: child-SD carve-out gives a legitimate outlet for large scope)
3. **Full conversation may include noise** — retracted ideas and tangents could degrade coherence (mitigated: vision doc serves as structural anchor, conversation provides nuance)

## Team Perspectives

### Challenger
- **Blind Spots**: Chairman checkpoint has no async fallback. No-deferral pressure shifts into vision docs. Full conversation has no canonical vs. exploratory boundary.
- **Assumptions at Risk**: Chairman may not spot issues pre-vision (review fires early). Banning deferral labels may produce padding. Bottleneck may be prompt quality not input volume.
- **Worst Case**: Protocol appears more rigorous while producing lower-quality outputs with more friction.

### Visionary
- **Opportunities**: Quality forcing function that catches over-scoped SDs. Full conversation leverage improves arch plan specificity.
- **Synergies**: Aligns with EVA/HEAL scoring. Chairman review creates audit trail of scoping decisions.
- **Upside**: Brainstorms that pass chairman review produce SDs that rarely need mid-EXEC scope corrections.

### Pragmatist
- **Feasibility**: 3/10 difficulty — purely prompt/instruction changes.
- **Constraints**: Context window pressure on full conversation. Chairman criteria must be precise. No-deferral needs child-SD carve-out.
- **Recommended Path**: Single edit to brainstorm.md — insert Step 8.7, update 9.5C instructions. Test with one live brainstorm.

### Synthesis
- **Consensus Points**: Chairman checkpoint is highest-value but needs concrete rubric. No-deferral needs child-SD carve-out. Full conversation naturally available in-session.
- **Tension Points**: Challenger argues review fires too early. Resolution: team analysis output IS the raw material for chairman review — LLM identifies questionable items, chairman confirms/adjusts. The duplication is intentional.
- **Composite Risk**: Low-Medium — prompt-only changes (low blast radius), but quality degradation without arch plan quality gates is a real concern.

## Open Questions
- Should there be an arch plan quality gate (similar to PRD quality gate) to catch hand-wavy padding that replaces explicit deferral?
- What is the recovery path if the chairman checkpoint fires during an unattended session? (Current answer: this only runs in interactive brainstorm sessions, so it shouldn't happen)

## Suggested Next Steps
- Create vision and architecture documents
- Implement as a single edit to `.claude/commands/brainstorm.md`
- Test with one live brainstorm end-to-end
