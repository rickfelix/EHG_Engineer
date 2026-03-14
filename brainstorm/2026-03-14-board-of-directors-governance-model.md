# Brainstorm: Board of Directors Governance Model for Brainstorming

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (meta-brainstorm — redesigning the team system itself)
- **Related Ventures**: None (cross-cutting infrastructure)

---

## Problem Statement

The current brainstorm process uses 3 static personas (Challenger, Visionary, Pragmatist) that produce generic insights regardless of domain or topic. These are thinking modes, not domain experts — a "Challenger" for a YouTube integration brainstorm flags the same generic concerns as one for a security audit. The result is balanced but shallow analysis that misses topic-specific risks and opportunities.

EHG already has a sophisticated governance stack (3 constitutions, debate system, judiciary with constitutional citations, amendment process) but it's not connected to the brainstorming process.

## Discovery Summary

### Existing Infrastructure (Already Built)

**Constitutions (3 active, enforced):**
- `PROTOCOL` — 9 immutable rules governing LEO self-improvement (CONST-001 through CONST-010)
- `FOUR_OATHS` — EVA Manifesto: agent behavior constitution
- `DOCTRINE` — Doctrine of Constraint: agents cannot kill/remove ventures without Chairman approval

**Judiciary (fully operational):**
- `debate_sessions` — structured debates between agents
- `debate_arguments` — per-agent positions with `round_number`, `in_response_to_argument_id`, `confidence_score`
- `judge_verdicts` — rulings with `constitution_citations`, `constitutional_score`, `escalation_required`, `human_decision` fields
- `constitutional_amendments` — proposed changes with chairman approval workflow
- RLS policies prevent deletion/modification of constitution rules (immutable)

**Existing agent codes:** ARCHITECT, DATABASE, SECURITY, PERFORMANCE (used in debates)

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Permanent board seats | 6: CSO, CRO, CTO, CISO, COO, CFO | Covers all governance dimensions for a solo-founder AI-augmented holding company |
| Judiciary system | Use existing (`judge_verdicts`, `debate_arguments`, constitutions) | Already built, battle-tested, supports precedent and escalation |
| Specialist delegation | Board auto-detects and summons | No chairman approval gate — board identifies expertise gaps and spawns specialists autonomously |
| Institutional memory | Persistent across brainstorms | Each seat accumulates position history. Past positions cross-referenced against completed SDs, retrospectives, and capabilities to determine current relevance |
| Position lifecycle | Active → Mitigated / Superseded / Validated | Positions annotated with relevance status by querying SD completions, retrospectives, and delivered capabilities — nothing deleted, staleness detected from signals |
| Deliberation model | Parallel + structured rebuttal | Round 1: all 6 positions in parallel. Round 2: rebuttals informed by Round 1. Judiciary synthesizes. Matches existing `debate_arguments` schema with `round_number` |

### Board Seat Definitions

| Seat | Code | Perspective | Standing Question |
|------|------|------------|-------------------|
| Chief Strategy Officer | CSO | Portfolio alignment, timing, vision fit | "Does this move EHG forward or sideways?" |
| Chief Risk Officer | CRO | Financial, technical, regulatory exposure | "What's the blast radius if this fails?" |
| Chief Technology Officer | CTO | Architecture, feasibility, capability graph | "What do we already have? What's the real build cost?" |
| Chief Information Security Officer | CISO | Data safety, compliance, agent behavior | "What attack surface does this create?" |
| Chief Operating Officer | COO | Execution health, velocity, resource allocation | "Can we actually deliver this given current load?" |
| Chief Financial Officer | CFO | Cost, ROI, budget constraints, unit economics | "What does this cost and what's the return?" |

### Specialist Delegation Model

When the board identifies a topic requiring deeper expertise than any permanent seat can provide:
1. Board members flag the expertise gap during Round 1 positions
2. System auto-spawns specialist agents with topic-specific identity (e.g., "YouTube API integration veteran", "market sizing analyst", "UX research specialist")
3. Specialists produce testimony recorded in `debate_arguments` with a specialist agent code
4. Board members incorporate specialist testimony in Round 2 rebuttals
5. Judiciary weighs specialist input alongside board positions

### Institutional Memory Architecture

Each board seat's memory is a **query pattern**, not a separate store:
- Past positions stored in `debate_arguments` with the seat's agent code
- On each brainstorm, the seat loads its position history for related topics
- Cross-references against `strategic_directives_v2` (completed SDs), `retrospectives` (learnings), `sd_capabilities` (delivered capabilities)
- Positions annotated: Active concern | Mitigated (SD resolved it) | Superseded (context changed) | Validated (issue occurred)
- No manual pruning — relevance detected from signals, full history preserved

## Analysis

### Arguments For
1. **Institutional consistency** — 6 permanent seats ensure every brainstorm gets the same governance rigor
2. **Precedent accumulation** — board memory means past mistakes inform future decisions
3. **Constitutional grounding** — decisions tied to existing judiciary have legal weight within EHG
4. **Specialist delegation** — auto-detecting expertise gaps solves the "generic insights" problem
5. **Already half-built** — judiciary, constitutions, debate system all exist and are operational

### Arguments Against
1. **Overhead risk** — 6 board agents + specialists + judiciary is heavier than 3 personas (mitigated by parallel execution)
2. **Memory anchoring** — persistent positions could create bias (mitigated by position lifecycle annotations)
3. **Implementation complexity** — each seat needs persona definition, memory queries, constitutional awareness, specialist summoning logic

## Open Questions
- Should the board have a quorum requirement (minimum seats that must participate)?
- Should board positions be visible to the chairman during deliberation, or only the judiciary's synthesis?
- How should specialist agent identities be generated — from a registry or dynamically from the topic?

## Suggested Next Steps
- Create vision and architecture documents
- Design the board seat persona prompts
- Implement the institutional memory query pattern
- Wire board deliberation into the existing debate system
