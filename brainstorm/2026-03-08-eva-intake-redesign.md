# Brainstorm: EVA Intake Redesign — Interactive 3-Dimension Classification

## Metadata
- **Date**: 2026-03-08
- **Domain**: Integration
- **Phase**: Process
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ClarityStats, LocalizeAI, BrandForge AI (via cross-venture classification)

---

## Problem Statement

The EVA intake pipeline currently classifies items using a 2-dimension taxonomy (venture_tag + business_function) via an LLM-only classifier that does not leverage human expertise. The interactive mode uses readline, which is broken in Claude Code. 199 items (101 Todoist tasks, 98 YouTube videos) sit pending with no classification. The Chairman has no way to influence classification or apply contextual judgment before items enter the pipeline.

## Discovery Summary

### Data Sources & Volume
- 101 pending Todoist tasks, 98 pending YouTube videos (199 total)
- 20 Todoist tasks contain hyperlinks (12 YouTube, 2 ChatGPT, 2 Dropbox, 3 Gemini, 1 external)
- All 104 Todoist tasks are flat (no hierarchy)
- Existing Todoist/YouTube sync pipelines are working and not being modified

### New Taxonomy (User-Approved)
- **Application** (pick one): ehg_engineer, ehg_app, new_venture (Solara excluded)
- **Aspects** (multi-select, context-sensitive per app): LEO Protocol, EVA Pipeline, Sub-Agents & AI, DevOps & Tooling, etc.
- **Intent** (capture-intent): idea, insight, reference, question, value
- Replaces old venture_tag + business_function classification

### Workflow Design
- **Pass 1**: Interactive classification via AskUserQuestion — one item at a time, AI recommends all 3 dimensions, Chairman confirms/overrides/skips
- **Pass 2**: Classified items appear in Unified Inbox with badges for grouping/clustering before build decisions
- No auto-routing — Chairman controls all promotion decisions

### DB Changes
- Additive columns on existing tables: `target_application`, `target_aspects` (jsonb), `chairman_intent`, `chairman_notes`
- Add 'intake' as 5th source type in unified-inbox-builder.js

### Dry Run Findings
1. Always read descriptions — titles mislead ("script" = 507-line Cosmic Guidance Protocol)
2. Resolve local Dropbox links for classification enrichment
3. Aspect is multi-select
4. AI tends to over-classify as "build" — should default toward research/reference
5. Aspect options must adapt to chosen App
6. Cross-link YouTube duplicates between Todoist and YouTube intake

## Analysis

### Arguments For
- **Replaces broken interactive mode**: readline doesn't work in Claude Code; AskUserQuestion is proven and native
- **Human-in-the-loop classification quality**: Dry run showed AI alone mis-classifies intent (over-classifies as "build") — Chairman judgment is essential
- **Structured taxonomy enables downstream automation**: Application+Aspect+Intent becomes shared ontology across EVA, Unified Inbox, and LEO
- **Low infrastructure risk**: DB changes are additive, sync pipelines untouched, AskUserQuestion already proven in codebase

### Arguments Against
- **199 items x 3 questions = significant Chairman time**: Even with AI pre-classification and accept-all shortcuts, ~100 minutes of focused attention needed
- **Session resume complexity**: Context compaction mid-classification loses loop state; checkpoint/resume mechanism must be built
- **Dual classification systems**: Existing pipeline writes venture_tag/business_function; new system writes application/aspects/intent — reconciliation needed
- **Unified Inbox structural mismatch**: Current inbox lifecycle model doesn't naturally accommodate intake items without a shim layer

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 8/10 |
| Coverage | 7/10 |
| Edge Cases | 6 identified |

**Data Quality (8/10):**
- Source reliability: 5/5 — Todoist and YouTube sync are battle-tested, data already in DB
- Schema stability: 3/5 — Additive columns are safe, but existing check constraints on status and category_type may need attention

**Coverage (7/10):**
- Data completeness: 4/5 — 199 items have titles + descriptions; YouTube items have metadata + AI summaries
- Error handling: 3/5 — Need graceful handling for: unresolvable Dropbox links, vague items user can't recall, expired YouTube OAuth tokens

**Edge Cases:**
| Edge Case | Frequency | Handling Strategy |
|-----------|-----------|-------------------|
| Title misleads about content (e.g., "script" = 507-line spec) | Common | Always read description, not just title |
| Dropbox links in Todoist tasks | Common (20 items) | Resolve locally via filesystem; defer API integration |
| YouTube duplicate cross-linked in Todoist | Common (~12 items) | Cross-link via extracted_youtube_id |
| Context compaction mid-classification | Common | Checkpoint progress in evaluation_outcome JSONB |
| Vague task user can't recall intent for | Rare | Ask for context via AskUserQuestion, archive if unknown |
| Items spanning multiple Applications | Rare | Pick primary app, note secondary in chairman_notes |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Unified Inbox has no intake normalizer — structural mismatch with 4 existing source types. (2) No Dropbox API code exists — "link resolution" is unscoped plumbing. (3) AskUserQuestion has no session persistence — classification state lost on compaction.
- **Assumptions at Risk**: (1) "Additive columns" may conflict with existing check constraints. (2) No auto-routing ≠ no conflict — existing pipeline writes old taxonomy concurrently. (3) YouTube OAuth tokens expire during long classification sessions.
- **Worst Case**: Partially-classified items with competing taxonomy systems, no clean way to query "what still needs classification," and session resume failures requiring manual boundary detection.

### Visionary
- **Opportunities**: (1) Classification dataset trains fully autonomous classifier — manual Pass 1 creates self-improving system. (2) Dropbox link resolution unlocks content enrichment gateway. (3) AskUserQuestion creates real-time Chairman decision stream with high-throughput human-in-the-loop.
- **Synergies**: Feeds EVA 25-stage pipeline Mode 4 Operations. Becomes 5th Unified Inbox source. Application dimension maps to sd_capabilities for automatic conflict detection.
- **Upside Scenario**: 3-dimension taxonomy becomes lingua franca across all EHG systems; Chairman shifts from classifier to curator; intake-to-venture-evaluation becomes continuous data-rich pipeline.

### Pragmatist
- **Feasibility**: 4/10 difficulty (moderate)
- **Resource Requirements**: 3-4 SDs, 2-3 days implementation, ~$0.15-0.30 LLM cost, zero Supabase incremental cost
- **Constraints**: (1) AskUserQuestion is single-response — 3 sequential calls per item needed, with "accept all" shortcut. (2) Session resume is mandatory — 100+ minutes of classification unrealistic in single session. (3) No rate limiting in evaluation pipeline for 800-1200 DB calls.
- **Recommended Path**: Start with core classification flow (migration + classify script + resume support). Defer Dropbox, YouTube cross-linking, and Unified Inbox view to separate SDs.

### Synthesis
- **Consensus Points**: Session resume is mandatory. Dropbox should be deferred. Existing pipeline reconciliation needed.
- **Tension Points**: Challenger sees structural Unified Inbox mismatch vs. Visionary's natural integration. Challenger warns competing taxonomies vs. Visionary's shared ontology endgame.
- **Composite Risk**: Medium — sound concept with meaningful integration surface area

## Open Questions
- How to reconcile old venture_tag/business_function with new application/aspects/intent — replace or supplement?
- Should the existing evaluation-bridge pipeline be modified to use the new taxonomy, or run independently?
- Batch-accept threshold: at what AI confidence level should Chairman be offered "accept all recommendations"?

## Suggested Next Steps
- Create Vision Document and Architecture Plan (Step 9.5 — mandatory)
- Register in EVA for HEAL scoring
- Create orchestrator SD with children for phased implementation
