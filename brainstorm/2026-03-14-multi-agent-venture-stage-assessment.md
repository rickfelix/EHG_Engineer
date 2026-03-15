# Brainstorm: 25-Stage Venture Proving Run — Multi-Agent Stage Companion

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats) + Chairman Challenge
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed
- **Related Ventures**: All active ventures (Shortform Sage, Elysian, ListingLens AI, MindStack AI, CodeShift, LegacyAI, LexiGuard)
- **Source**: Todoist intake 5646f9ea-70f0-4192-9c27-bdbe75d6b671

---

## Problem Statement

No real venture has ever completed all 25 stages of the EHG venture workflow. The pipeline has only been tested in forced test mode. Before the venture factory can operate at scale, the 25-stage workflow must be proven with a real venture — a pilot run that stress-tests every stage, captures what works and what's broken, and builds the institutional knowledge needed for all future ventures.

The chairman wants a multi-agent CLI companion for this proving run — not a permanent assessment tool, but a temporary accelerator that provides deep intelligence at each stage segment. The agents examine upcoming stages from multiple perspectives (planned vision, actual codebase, gap analysis, enhancement opportunities), and their accumulated expertise seeds the specialist registry for future reuse.

## Chairman Challenge (Reframing)

The board initially framed this as a mature assessment tool for ongoing gate decisions. The chairman challenged this framing:

> "We're still at the very early stages of building out all 25 stages. We really need to prove out each stage. I consider this like an initial run-through."

**Reframing**: This is not an assessment tool for a mature pipeline. It's a **proving run accelerator** — a one-time (reusable) expedition through all 25 stages with rich multi-agent instrumentation that:
1. Discovers what's broken/missing before it blocks the venture
2. Captures enhancement ideas while stage context is fresh
3. Journals what actually happened vs what was planned
4. Produces a complete map of what every stage needs to be production-ready

## Discovery Summary

### Chairman's Vision (from Todoist voice memo)

The chairman wants a CLI companion that runs before each kill gate segment, providing:

1. **Plan Agent**: Gathers vision/architecture docs for all stages in the upcoming segment (before the next chairman gate). Creates a structured list of what was planned from vision, architecture, and dossier perspectives.

2. **Reality Agent**: Audits the actual codebase to determine what was built. This agent's perspective is strictly what exists in code — no assumptions about intent.

3. **Gap Analyst**: Takes outputs from Plan and Reality agents, compares them, identifies gaps with a severity rubric. Recommends proceed or fix-first. Understands the "spirit" of the venture factory — it's not just binary pass/fail, it's about whether we're achieving the objectives.

4. **Enhancement Layer**:
   - Per-stage expert agents propose improvements
   - Sources: YouTube digests, Todoist tasks, prior brainstorms, existing codebase capabilities
   - Prioritization agent MoSCoW-ranks enhancements for chairman review
   - Interactive: agent recommends, chairman decides

5. **Journal Capture**: Stage-by-stage record of what worked, what was missing, what needed manual intervention — building the definitive playbook for future ventures.

### Chairman's Insight: Specialist Registry Seeding

> "We might be able to reuse this multi-agent orchestration later. The per-stage agents could be considered specialists if they were called on for each stage of the brainstorming board of directors."

**Key realization**: The 25 per-stage expert agents built for this proving run don't die afterward — they become **persistent specialist identities** in the Board of Directors specialist registry:

1. **During proving run**: Each stage agent accumulates real context — what worked, what broke, what the chairman decided, what enhancements were considered
2. **After proving run**: Agents persist in the specialist registry with their accumulated institutional memory
3. **Future brainstorms**: When someone brainstorms about "improving stage 7," the board auto-summons the Stage 7 specialist who has first-hand knowledge from the proving run
4. **Future distill items**: A YouTube video about "better market validation" gets routed to Stage 4-5 specialists who can weigh in with real operational knowledge
5. **Future ventures**: Second venture's run-through is dramatically smoother because every stage has a battle-tested specialist

### Existing Infrastructure

| Component | Status | Relevance |
|-----------|--------|-----------|
| EVA Stage Execution Worker | Running | Knows venture stage state, auto-advances |
| Vision/architecture docs in DB | Complete | Plan Agent data source |
| Sub-agent routing (LEO) | Complete | Agent orchestration infrastructure |
| Board of Directors governance | Just shipped | Specialist registry integration |
| YouTube digest system | Just shipped | Enhancement source |
| Todoist integration | Complete | Enhancement source |
| Brainstorm sessions DB | Complete | Enhancement source |
| sd_capabilities table | Complete | Existing capability discovery |
| Venture dossiers | Complete | Plan Agent data source |
| Stage renderers (GUI) | Operational | Reality Agent comparison target |
| Specialist registry | Built (empty) | Target for post-proving persistence |

## Analysis

### Arguments For
1. **No venture has completed all 25 stages** — this is the single biggest gap in the venture factory. Proving the pipeline is existential.
2. **Multi-agent intelligence makes the first run-through maximally productive** — instead of just discovering problems, you get plan-vs-reality analysis, enhancement ideas, and expert recommendations at every step
3. **Seeds the specialist registry** — 25 stage experts with real operational knowledge become permanent board specialists, compounding value for all future brainstorms, distill items, and venture runs
4. **80% of infrastructure already exists** — sub-agent routing, vision/arch DB, YouTube digest, Todoist, brainstorm sessions, specialist registry
5. **Captures the playbook** — journal output becomes the authoritative guide for running ventures through the pipeline

### Arguments Against
1. **Reality Agent is the real build** — codebase auditing requires file-system scanning, capability matching, and heuristics for "actually working" vs "just scaffolding"
2. **25 specialist agents is a lot of context to curate** — each needs stage-specific prompts with accumulated memory
3. **LLM cost per stage segment** — multi-agent runs at each segment add up, but this is a one-time proving investment
4. **Some stages may not be buildable yet** — proving run may stall at stages that need fundamental implementation work

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 10/10 | The entire venture factory is blocked until one venture proves the 25-stage pipeline works end-to-end. This is the critical path. |
| Value Addition | 10/10 | Direct: proves the pipeline. Compound: seeds 25 specialist agents, captures the playbook, discovers all gaps and enhancements simultaneously. |
| Risk Profile | 5/10 | Moderate complexity in Reality Agent. Proving run may surface fundamental issues requiring significant remediation. LLM cost is one-time investment. |
| **Decision** | **Implement** | (10 + 10) = 20 > (5 * 2) = 10 |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | Decisively forward. Deepens competitive advantage of existing pipeline. Converts past investments (YouTube, Todoist, brainstorms) into actionable recommendations at the exact moment they matter. |
| CRO | What's the blast radius if this fails? | Moderate, well-contained. Advisory system — never blocks gates. Primary risk is false confidence from miscalibrated gap analysis. Recommend shipping core agents first, deferring enhancement layer until gap analysis proves reliable across 2+ gate cycles. |
| CTO | What do we already have? What's the real build cost? | Plan Agent is mostly DB queries. Reality Agent is the real build (codebase auditing, capability matching). Estimate: 2-3 SDs for core agents, 2-3 more for enhancement layer. Prioritization agent is trivial once inputs are structured. |
| CISO | What attack surface does this create? | Reality Agent needs read access across venture repos — scope to path allowlists. LLM calls transmit vision docs and code snippets — filter credentials. External sources (YouTube) are untrusted input — sanitize before entering prioritization context. |
| COO | Can we actually deliver this given current load? | Core 3-agent loop is deliverable. Enhancement layer is a scope multiplier. Recommend targeting only 5 chairman gate stages initially — cuts scope by 80%. Latency and token cost per run must stay bounded. |
| CFO | What does this cost and what's the return? | $15-40 per full pipeline cycle. Catching one misalignment before a kill gate saves 4-8 hours of rework. Enhancement layer ROI harder to quantify — classify as Phase 2. Instrument from day 1: track recommendations generated, acted on, and gate pass rate delta. |

### Chairman Challenge Response

The board's initial positions assumed a mature pipeline needing ongoing assessment. The chairman challenged:
- The pipeline has never been run with a real venture
- This is a proving run, not an operational tool
- The multi-agent system is temporary infrastructure for maximum intelligence during the first walkthrough
- Per-stage agents should persist as specialist registry entries for future board deliberations

**Board revised consensus**: Reframe from "assessment tool" to "proving run accelerator." The one-time investment in 25 stage agents is justified because they seed permanent specialist knowledge. Proving the pipeline is existential — it's the critical path for the entire venture factory.

### Judiciary Verdict
- **Board Consensus**: 6/6 approve with reframing. This is a proving run accelerator, not a permanent tool.
- **Key Tensions**: CRO wants the system to be advisory (never blocks stages). CISO requires path allowlists for Reality Agent. CFO notes one-time cost is acceptable for existential proving run.
- **Recommendation**: Build as proving run companion. Core agents + enhancement layer ship together (not phased) because the proving run needs maximum intelligence on the first pass. Persist stage agents as specialists after run.
- **Escalation**: No — chairman challenge accepted, board unanimously revised.

## Open Questions
- Which venture should be the pilot? (Strongest candidate with most existing stage data, or newest venture for clean test?)
- Should the proving run journal be a database table (stage_proving_journal) or structured markdown?
- How to handle stages that are fundamentally unimplemented — does the companion help build them or just document the gap?
- Should specialist persistence happen automatically after each stage or as a batch after the full run?

## Suggested Next Steps
1. **Select pilot venture** — recommend one with existing Stage 0-3 data for immediate momentum
2. Create orchestrator SD for the proving run companion
3. Build core 3-agent loop: Plan Agent, Reality Agent, Gap Analyst
4. Build per-stage expert agents (can start with stages 0-5, expand as proving run progresses)
5. Build enhancement layer: YouTube/Todoist/brainstorm/capability source adapters
6. Build journal capture system (stage_proving_journal table)
7. Build specialist registry persistence (post-stage agent → specialist identity)
8. Run the proving venture from Stage 0 through Stage 25
