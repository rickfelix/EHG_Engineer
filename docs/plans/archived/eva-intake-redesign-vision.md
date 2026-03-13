# Vision: EVA Intake Redesign — Interactive 3-Dimension Classification

## Executive Summary

The EVA intake pipeline processes ideas and references captured in Todoist and YouTube into the EHG ecosystem. Currently, classification uses a 2-dimension taxonomy (venture_tag + business_function) driven entirely by LLM inference, with an interactive mode that uses readline — broken in Claude Code. 199 items sit pending with no human-verified classification.

This redesign introduces a 3-dimension taxonomy (Application, Aspects, Intent) with interactive classification via AskUserQuestion. The Chairman reviews AI recommendations and confirms, overrides, or skips each item. Classified items flow into the Unified Inbox with taxonomy badges for holistic grouping before any build decisions. The key principle: "Build-ready doesn't mean build now" — everything goes through Classify → Inbox → Group → Research → THEN build decisions.

The new taxonomy becomes the shared ontology across EVA intake, Unified Inbox, and LEO execution, replacing the ad-hoc venture_tag/business_function system with a structured, context-sensitive classification that captures not just what an item is about, but why it was captured.

## Problem Statement

**Who is affected**: The Chairman (sole user) who manages strategic intake across 3 active ventures and the EHG platform itself.

**Current impact**:
- 199 items (101 Todoist, 98 YouTube) are stuck as "pending" with no classification pathway
- The existing LLM classifier mis-classifies intent ~30% of the time (over-classifies as "build" when items should be "research" or "reference")
- readline-based interactive mode is non-functional in Claude Code
- No way to group related items across Todoist and YouTube sources
- Classification results don't feed into the Unified Inbox, so classified items are invisible to the operational workflow

## Personas

### Chairman (Rick Felix)
- **Goals**: Maintain strategic clarity across all ventures and platform work; ensure no valuable idea is lost; prevent premature build decisions on items that need research first
- **Mindset**: Methodical, context-rich decision-making; trusts AI recommendations but needs override capability; values holistic view over speed
- **Key Activities**: Reviews AI-recommended classifications, applies contextual judgment (especially on intent — "is this an idea to build or a reference to study?"), groups related items for cluster analysis, promotes clusters to research or brainstorm SDs

## Information Architecture

### Views
1. **Classification View** (Pass 1): Sequential presentation of pending items via AskUserQuestion — shows item title, description excerpt, AI recommendation for all 3 dimensions, and confidence score
2. **Unified Inbox View** (Pass 2): Existing inbox augmented with 'intake' source type — items display Application badge, Aspect tags, and Intent icon
3. **Classification Dashboard** (optional): Summary of classified vs. pending items, distribution by Application/Aspect/Intent

### Data Sources
- `eva_todoist_intake` — Todoist tasks synced from EVA/EVA Next Steps projects
- `eva_youtube_intake` — YouTube videos synced from curated playlists
- `eva_idea_categories` — Category taxonomy (extended with new classification types)
- Local Dropbox filesystem — For resolving Dropbox links in Todoist descriptions

### Navigation
- `npm run eva:intake:classify` — Launch Pass 1 interactive classification
- `npm run eva:intake:classify --resume` — Resume interrupted classification session
- `/leo inbox` — View classified items in Unified Inbox (Pass 2)

## Key Decision Points

1. **Taxonomy reconciliation**: The old venture_tag/business_function system must be deprecated, not supplemented. Running two competing taxonomies creates query ambiguity. Migration path: map existing classifications to new taxonomy, then remove old columns in a future SD.

2. **Session resume strategy**: Classification progress must survive context compaction. Store partial progress in `evaluation_outcome` JSONB (not a new status value) to avoid modifying existing check constraints. Resume queries `WHERE target_application IS NULL`.

3. **AI confidence threshold**: Items where AI confidence exceeds 85% across all 3 dimensions should be offered as "batch accept" to reduce Chairman fatigue. Below 85%, present individually for review.

4. **Dropbox integration timing**: Defer Dropbox API integration to a separate SD. For Pass 1, resolve Dropbox links via local filesystem path (`C:\Users\rickf\Dropbox\_EHG\`) — no API needed for local files.

5. **Unified Inbox integration approach**: Add intake normalizer as 5th source with minimal lifecycle mapping — intake items enter as NEW, promotion moves them to IN_PROGRESS (via SD creation), archival moves them to COMPLETED.

## Integration Patterns

### Existing Pipeline (No Modification)
- `npm run eva:ideas:sync` — Todoist + YouTube sync continues unchanged
- `npm run eva:ideas:post-process` — Post-processing continues unchanged
- These pipelines populate `eva_todoist_intake` and `eva_youtube_intake` tables

### New Classification Layer (Additive)
- Reads from existing intake tables
- Writes 3 new columns: `target_application`, `target_aspects` (jsonb array), `chairman_intent`
- Optional: `chairman_notes` (text) for context the Chairman wants to preserve
- Uses `evaluation_outcome` JSONB for session checkpoint data

### Unified Inbox Integration
- `unified-inbox-builder.js` gets new intake normalizer function
- Queries both intake tables WHERE target_application IS NOT NULL
- Maps to existing inbox item schema with taxonomy badges in metadata
- Cross-links Todoist items that reference YouTube videos via `extracted_youtube_id`

### Downstream Consumers
- Pass 2 promotion creates SDs, brainstorms, or research tasks from classified clusters
- Classification data feeds future autonomous classifier training
- Application dimension maps to `sd_capabilities` for conflict detection

## Evolution Plan

### Phase 1: Core Classification (This Orchestrator)
- DB migration for additive columns
- Interactive classification script with AskUserQuestion
- Session resume via evaluation_outcome JSONB checkpoint
- AI pre-classification with confidence scoring
- 3-step flow with "accept all" shortcut

### Phase 2: Unified Inbox Integration
- Intake normalizer in unified-inbox-builder.js
- Taxonomy badges (Application, Aspects, Intent) in inbox display
- YouTube cross-link deduplication in inbox
- Promotion actions from inbox (Create SD, Brainstorm, Archive)

### Phase 3: Enrichment & Automation
- Dropbox local file resolution for classification enrichment
- Training data capture from Chairman overrides
- Batch-accept mode for high-confidence items
- Future: Dropbox API integration for non-local links
- Future: Autonomous classification pipeline using trained model

## Out of Scope
- Auto-routing intake items to SDs (Chairman controls all promotion decisions)
- Replacing or modifying the existing Todoist/YouTube sync pipeline
- Building the Pass 2 promotion workflow beyond basic inbox integration
- Solara-related classification or intake
- Mobile or web UI for classification (Claude Code only)
- Dropbox API integration (local filesystem only for Phase 1)

## UI/UX Wireframes

N/A — CLI-based classification via AskUserQuestion. No web UI component.

**AskUserQuestion Flow (3-step per item):**

```
┌─────────────────────────────────────────────────┐
│ Classify Item 14/199                            │
│ ─────────────────────────────────────────────── │
│ Title: "AI-powered translation for niche mkts"  │
│ Source: Todoist                                  │
│ Description: "Research LocalizeAI competitors..." │
│                                                 │
│ AI Recommendation: new_venture / business_model  │
│                    / reference (92% confidence)  │
│                                                 │
│ ○ Accept AI recommendation                      │
│ ○ Override (choose manually)                     │
│ ○ Skip (come back later)                        │
│ ○ Archive (not worth classifying)               │
└─────────────────────────────────────────────────┘
```

## Success Criteria
- Successfully classify 10+ intake items end-to-end via AskUserQuestion with all 3 taxonomy dimensions populated
- Session resume works: interrupt classification, restart, continue from last checkpoint
- Classified items visible in Unified Inbox with correct Application, Aspect, and Intent badges
- AI pre-classification achieves 70%+ acceptance rate (Chairman accepts without override)
- Classification of all 199 items completable across 3-5 sessions
- No modification to existing Todoist/YouTube sync pipelines
- Zero data loss on existing intake records during migration
