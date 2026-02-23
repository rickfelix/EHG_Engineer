# Brainstorm: Achieving the Out-of-Scope Meta-Gem Objectives

## Metadata
- **Date**: 2026-02-23
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None specific (cross-cutting EHG infrastructure)

---

## Problem Statement

The YouTube Video Intelligence SD (SD-LEO-FEAT-YOUTUBE-VIDEO-INTELLIGENCE-001) implemented ~60% of the EHG Unified Sensemaking Meta-Gem prompt. The remaining ~40% represents capabilities that would transform the system from a YouTube-specific video analyzer into a full **Unified Sensemaking Service** grounded in EHG's authoritative knowledge, capable of processing any input type, and producing governance-aligned structured intelligence.

The user's priority gaps are:
1. **Authoritative Knowledge Base binding** — grounding analysis in EHG reference documents, not just generic prompting
2. **Dynamic persona selection + full 7-section structured output** — selecting expert lenses based on content domain and producing the complete Meta-Gem output structure
3. **Multi-type input routing (TYPE B & C)** — handling text articles, notes, structured data, not just YouTube videos
4. **Hybrid architecture** — Telegram detects input type, standalone sensemaking service processes it

Constraints are minimal — the user is open to different runtimes, hosting models, and approaches. The priority is efficiency and automation.

## Discovery Summary

### Current State
- 5 edge function files shipped (PR #148 merged) implementing YouTube video analysis via Gemini REST API
- Background processing via `EdgeRuntime.waitUntil()` preserves Telegram responsiveness
- DB-stored prompt override mechanism exists via `chairman_preferences` table
- Fallback prompt covers: input classification, four-bucket decomposition (facts/assumptions/mechanisms/unknowns), EHG relevance scoring, simplified persona insights (3 fixed: VC/CTO/PM), spec-level impacts, prioritized next steps

### What's Missing (9 Gaps)
1. Multi-type input routing (TYPE B text, TYPE C structured data)
2. Authoritative Knowledge Base binding (9 EHG reference docs)
3. EHG governance & alignment checks (Chairman OS, EVA boundaries, Stage 1-25)
4. Confidence level scoring (separate from relevance)
5. Dynamic persona selection (up to 9 options based on content domain)
6. Full spec delta mapping to 6 artifact categories
7. Structured 7-section output format
8. Internal completeness checks
9. Spec debt register

### User Priorities (from discovery)
- **Highest**: Authoritative KB binding + Dynamic personas/structured output
- **Architecture direction**: Hybrid (Telegram detects, service processes)
- **KB approach**: Open to best approach; wants efficiency and automation; doesn't have to be all 9 docs
- **Constraints**: Minimal — unconstrained on runtime, hosting, budget

---

## Analysis

### Arguments For
1. **DB-stored prompt mechanism already exists** — `chairman_preferences` provides the bridge. Storing the full Meta-Gem prompt gets 80% of value with zero code changes.
2. **Standalone sensemaking service creates a reusable primitive** — Every future signal source (RSS, email, Slack, web UI, CLI) routes to the same service. Build once, use everywhere.
3. **Authoritative KB binding is the highest-ROI gap** — Grounding analysis in EHG's actual strategic context (tech trajectory, narrative risk, capability lattice, recent decisions) transforms output from "interesting observations" to "actionable intelligence aligned with portfolio strategy."
4. **Existing infrastructure covers most of the build** — Provider adapters, persona configs, Stage Zero synthesis patterns, async processing, and chairman preferences store all exist. This is integration work, not green-field.

### Arguments Against
1. **Cost model is unvalidated** — Video-specific Gemini pricing may be much higher than text. At scale, silent cost growth could be a serious issue. Challenger estimates $75-100/analysis vs. Pragmatist's $0.02-0.08. Needs empirical validation.
2. **Prompt governance debt accumulates invisibly** — Without versioning from day one, prompt edits create incomparable analyses. In 3 months, trend queries across analyses become unreliable.
3. **Hybrid detection is inherently brittle** — Regex-based input type detection will miss edge cases (playlists, live streams, URL shorteners, rich-text-embedded videos). Each miss is a silent routing failure.

---

## Architecture Options (Tradeoff Analysis)

### Option A: "Prompt-Only" — Store Full Meta-Gem in DB
**Approach**: Store the complete Meta-Gem prompt in `chairman_preferences.video_analysis_prompt`. No code changes. Gemini receives richer instructions and produces structured output.

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 9/10 | Almost zero — DB insert only |
| Maintainability | 25% | 5/10 | Prompt drift risk; no versioning; KB not bound |
| Performance | 20% | 7/10 | Same as current; no additional latency |
| Migration effort | 15% | 10/10 | Zero migration needed |
| Future flexibility | 20% | 3/10 | Still YouTube-only; no multi-type; no KB binding |
| **Weighted Total** | | **6.4/10** | |

**Verdict**: Quick win but doesn't address multi-type, KB binding, or hybrid architecture. Good as Phase 0.

### Option B: "KB-Enhanced Prompt" — Dynamic Prompt Assembly
**Approach**: Before calling Gemini, query Supabase for relevant KB context (tech trajectory, strategic playbook highlights, recent decisions). Assemble a dynamic prompt: `[KB Context Block] + [Meta-Gem Instructions] + [User Input]`. Still within the Edge Function.

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 7/10 | 2-3 Supabase queries before Gemini call |
| Maintainability | 25% | 7/10 | KB updates flow automatically; prompt still needs versioning |
| Performance | 20% | 6/10 | +200-500ms for KB queries; cacheable |
| Migration effort | 15% | 8/10 | Extend existing edge function; minimal schema changes |
| Future flexibility | 20% | 5/10 | Still coupled to Edge Function; multi-type possible but messy |
| **Weighted Total** | | **6.5/10** | |

**Verdict**: Better grounding but still constrained by Edge Function coupling. Good incremental step.

### Option C: "Standalone Sensemaking Service" — Full Decoupling
**Approach**: Extract sensemaking into a dedicated service (Node.js HTTP endpoint or separate Edge Function). Telegram becomes a thin client that detects input type and POSTs to the service. Service handles: KB retrieval, persona selection, Gemini/Claude routing, structured output, storage.

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 5/10 | New service; routing layer; API contract |
| Maintainability | 25% | 8/10 | Clean separation; KB isolated; prompt versioned |
| Performance | 20% | 7/10 | Can cache KB; pre-fetch; no Edge Function timeout pressure |
| Migration effort | 15% | 5/10 | Extract from edge function; new deployment |
| Future flexibility | 20% | 9/10 | Any input source can call; multi-type native; composable |
| **Weighted Total** | | **7.1/10** | |

**Verdict**: Highest flexibility and maintainability. More upfront work but creates the reusable primitive. Best long-term architecture.

### Option D: "Gemini Context Caching + Service" — Google-Native KB
**Approach**: Use Gemini's context caching feature to pre-load EHG reference documents as persistent context. The sensemaking service sends only the user input per call; Gemini already "knows" the KB. Combine with Option C's service architecture.

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 5/10 | Cache management; TTL handling; Gemini-specific API |
| Maintainability | 25% | 7/10 | KB updates require cache invalidation; but less prompt bloat |
| Performance | 20% | 9/10 | Dramatic token savings; faster responses; lower cost |
| Migration effort | 15% | 4/10 | New Gemini API patterns; cache lifecycle management |
| Future flexibility | 20% | 8/10 | Gemini-locked but very efficient; fallback to Option C if needed |
| **Weighted Total** | | **6.9/10** | |

**Verdict**: Highest performance and cost efficiency. Gemini-specific dependency is a risk. Best combined with Option C as fallback.

### Recommended Approach: Phased C → D

**Phase 0 (Day 1)**: Option A — Store full Meta-Gem prompt in DB. Immediate value, zero risk.

**Phase 1 (1-2 weeks)**: Option B — Add KB queries to existing edge function. Ground analysis in EHG context.

**Phase 2 (2-4 weeks)**: Option C — Extract to standalone sensemaking service. Add multi-type input routing. Telegram becomes thin client.

**Phase 3 (4-6 weeks)**: Option D — Add Gemini context caching for KB documents. Optimize cost and latency.

---

## Addressing Each Out-of-Scope Gap

### Gap 1: Multi-Type Input Routing (TYPE B & C)
**Approach**: In the standalone service (Phase 2), add input classifiers:
- **TYPE A (Video)**: YouTube URL regex → Gemini with `fileData.fileUri`
- **TYPE B (Text)**: Article URL → fetch + extract text → Gemini or Claude with text prompt
- **TYPE C (Structured)**: JSON/CSV detection → parse schema → Gemini with structured context

**Where detection lives**: Telegram bot's `enrichment.ts` does initial classification. Service validates and routes.

**Key decision**: Whether to use Gemini for all types or route TYPE B/C to Claude (lower cost for text-only analysis).

### Gap 2: Authoritative Knowledge Base Binding
**Approach**: Create a `sensemaking_knowledge_base` table in Supabase:
```
id, category (vision|execution|operations), title, content_summary (condensed),
content_full (optional), version, is_active, updated_at
```
- Store condensed versions (~500-1000 tokens each) of key EHG principles
- Service queries relevant entries before each Gemini call
- Inject as `[EHG CONTEXT]` block in system prompt
- Optional Phase 3: Use Gemini context caching to pre-load full documents

**Efficiency**: Cache KB results for 5-min TTL. Most analyses hit the same KB context.

**Automation**: KB entries auto-update when source documents change (via trigger or scheduled job).

### Gap 3: EHG Governance & Alignment Checks
**Approach**: Add a post-processing step in the service:
1. Gemini produces raw 7-section output
2. Service runs lightweight governance checks:
   - Does any recommendation propose Stage 1-25 changes? → Flag as violation
   - Does any spec-level impact affect EVA boundaries? → Flag for review
   - Is the confidence score below threshold? → Downgrade recommendations
3. Store flags in analysis metadata: `governance_flags: [{type, description, severity}]`

**Key insight**: This doesn't need a separate LLM call. Rule-based checks on the structured output are sufficient for most governance constraints.

### Gap 4: Confidence Level Scoring
**Approach**: Add to the Meta-Gem prompt:
- `Confidence: High/Medium/Low — <justification based on evidence quality and source reliability>`
- Parse from Gemini output alongside relevance score
- Store as separate field: `confidence_score` + `confidence_justification`

**Minimal effort**: This is purely a prompt change + output parsing. Can be done in Phase 0 (Option A).

### Gap 5: Dynamic Persona Selection
**Approach**: Instead of hardcoding 3 personas (VC/CTO/PM), maintain a persona registry:
```
chairman_preferences.sensemaking_personas = [
  {id: "architect", triggers: ["infrastructure", "schema", "performance", "migration"]},
  {id: "product_manager", triggers: ["feature", "user", "customer", "retention"]},
  {id: "security_engineer", triggers: ["vulnerability", "auth", "encryption", "compliance"]},
  {id: "ai_engineer", triggers: ["model", "prompt", "inference", "training"]},
  ...
]
```
- Service matches input content against trigger keywords
- Selects top 3 personas by relevance
- Injects persona instructions into Meta-Gem prompt dynamically

**Fallback**: If no triggers match, use default set (VC/CTO/PM).

### Gap 6: Full Spec Delta Mapping
**Approach**: Extend the Meta-Gem prompt to explicitly request impact mapping across 6 categories:
```
Map insights to concrete impacts on:
- Documentation: [files/sections affected]
- Database schema: [tables/columns to add or modify]
- API contracts: [endpoints to create or update]
- UI components: [pages/widgets to build or change]
- EVA orchestration: [agent behaviors to configure]
- Ops & debugging: [monitoring/alerts to set up]
```
- Service parses into structured JSON: `spec_impacts: [{category, description, affected_artifact, priority}]`

### Gap 7: Structured 7-Section Output
**Approach**: Already partially addressed by the Meta-Gem prompt structure. The service ensures all 7 sections are present:
1. Input Classification
2. EHG Relevance & Confidence
3. Professional Persona Lenses
4. Spec-Level Impact Analysis
5. Governance & Constraint Validation
6. Concrete Build Artifacts
7. NOT SPECIFIED — Spec Debt Register

**Enforcement**: Service validates output structure. If sections missing, re-prompts Gemini with "Section X was missing, please provide it."

### Gap 8: Internal Completeness Checks
**Approach**: Post-processing validation in the service:
- No lifecycle refactors proposed (keyword scan for "reorder stages", "replace stage", etc.)
- All recommendations map to real artifacts (cross-reference spec_impacts with known tables/files)
- All risks and assumptions explicit (check that FAMU buckets are non-empty)

### Gap 9: Spec Debt Register
**Approach**: Parse the "NOT SPECIFIED" section from Gemini output:
```
spec_debt: [{missing_definition, where_to_define (file + section), why_it_matters}]
```
- Accumulate across analyses: new `spec_debt_register` table
- Surface in `/leo audit` as "Spec Debt from Sensemaking"

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Prompt versioning — no audit trail for which prompt version produced which analysis; makes trend queries invalid over time
  2. Knowledge Base binding variant not specified — embedding full docs vs. summaries vs. lookup has very different token cost and freshness implications
  3. Hybrid detection boundary — regex-based type detection will miss edge cases silently, and async handoff has no retry semantics
- **Assumptions at Risk**:
  1. Gemini video understanding production-readiness — latency variance (3s to 40s+) is undocumented operationally
  2. DB-stored prompts provide sufficient iteration velocity — no A/B testing, no ground-truth evaluation set
  3. Cost at scale — estimates range from $0.02/analysis to $75/analysis depending on video-specific token pricing
- **Worst Case**: In 6 months, prompt drift creates incomparable analyses, cost overruns force throttling, and Gemini timeout spikes cause silent failures — feature trust erodes and it's abandoned

### Visionary
- **Opportunities**:
  1. Sensemaking service becomes the intake engine for EHG's compounding data layer — not just YouTube, but every signal type across the portfolio
  2. Hybrid composability enables multi-frontend signal ingestion (RSS, Slack, email, browser extension) routing to same service
  3. KB binding + Data Flywheel combine: service detects when themes repeat across sources, flags "conviction signals"
- **Synergies**: Direct amplification chain: Sensemaking → Data Flywheel → Capability Lattice → Research Department → Difficulty Matrix → LEAD decisions → Institutional Memory → back to KB
- **Upside Scenario**: By month 18, sensemaking service processes 100+ signals/week from diverse sources, becomes core IP, and enables 5-week earlier warning on market shifts vs. manual monitoring

### Pragmatist
- **Feasibility**: 6/10 (moderate — well-defined but operationally constrained)
- **Resource Requirements**: 60-80 hrs backend engineering, 15-20 hrs QA, 10-15 hrs infrastructure/monitoring. Total 80-100 hrs.
- **Constraints**:
  1. Gemini API rate limits (15 req/min default; needs quota increase, 24-48hr lead time)
  2. Edge Function 60s timeout vs. Gemini latency spikes (40s+ on long videos)
  3. KB schema drift — prompt parsing breaks if knowledge base structure changes without coordination
- **Recommended Path**: 3-phase over 2-4 weeks. Phase 1: Schema + KB retrieval helpers (2 days). Phase 2: Gemini integration with fallback + retry (5 days). Phase 3: Persona routing + 7-section parser (3 days).

### Synthesis
- **Consensus Points**: Prompt versioning is critical (all three). KB binding is highest-ROI gap (all three). Existing codebase provides strong foundations (Pragmatist + Visionary).
- **Tension Points**: Cost estimates diverge 1000x ($0.02 vs $75/analysis). Standalone service vs. Edge Function expansion. Ship hybrid now (Visionary) vs. start synchronous (Challenger).
- **Composite Risk**: Medium — core tech is well-scoped but cost model and prompt governance need early validation.

---

## Open Questions
1. What is Gemini's actual per-video token cost? Need to run 20-30 test analyses and measure.
2. Should KB binding use condensed summaries (~500 tokens each) or full document injection? Token budget vs. analysis quality tradeoff.
3. Which input types (B/C) are highest value after YouTube? Articles? Task exports? Founder notes?
4. Should the service route some analyses to Claude instead of Gemini? (Claude for text, Gemini for video/multimodal?)
5. What's the governance review cadence? Should governance flags auto-create feedback items or just annotate the analysis?

## Suggested Next Steps
1. **Immediate (Phase 0)**: Store the full Meta-Gem prompt in `chairman_preferences.video_analysis_prompt` + add confidence scoring. Zero code changes, immediate quality improvement.
2. **Create SD**: For the standalone sensemaking service (Option C) with phased delivery — covers KB binding, multi-type routing, dynamic personas, and structured output.
3. **Empirical cost validation**: Run 30 test video analyses through Gemini to establish actual per-analysis token cost before committing to scale.
4. **Prompt versioning**: Add `meta_gem_version` field to both `chairman_preferences` and analysis results from day one.
