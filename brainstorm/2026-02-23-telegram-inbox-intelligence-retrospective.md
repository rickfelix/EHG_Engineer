# Brainstorm: Telegram Inbox Intelligence — Retrospective & Cross-Channel Application

## Metadata
- **Date**: 2026-02-23
- **Domain**: integration
- **Phase**: Output
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Skipped (retrospective-driven)
- **Related Ventures**: EHG Platform (internal tooling)

---

## Problem Statement

Over a series of sessions, the Telegram Chairman Bot's "Inbox" channel evolved from a simple brainstorm capture endpoint into a full intelligence pipeline — YouTube videos are analyzed by Gemini, classified by personas correlated to venture lifecycle stages, and presented with interactive disposition UX. These learnings should be applied to the other 7 Telegram forum topics (Daily Briefing, Venture Lifecycle, Decisions, Vision Alignment, Build Queue, Active SDs, Alerts).

## What Was Built (Chronological Evolution)

### Phase 1: Basic Capture (PR #145-146)
- Two-way Telegram assistant with Chairman/Builder dual-persona model
- Forum Group architecture: 8 topics, each with own system prompt + tool access
- Message routing by `message_thread_id` to correct persona

### Phase 2: LLM Enrichment (PR #147)
- Claude Haiku enrichment pipeline for brainstorm capture
- Auto-classification: title, description, type, priority, category, domain
- YouTube URL detection triggers background Gemini analysis

### Phase 3: Video Intelligence (PR #148)
- Gemini-powered YouTube video analysis at capture time
- Structured output: relevance scoring, key themes, implications
- Background processing with ACK message → poll → deliver results

### Phase 4: Sensemaking UX (PR #149-150)
- Unified sensemaking service with KB binding
- Interactive persona disposition flow (Keep All / Review Each / Discard)
- Session state machine with short IDs for callback routing
- Per-persona review with implications display

### Phase 5: Performance & Intelligence (PR #151 + uncommitted)
- Gemini 2.5 Flash upgrade (120s → 43s latency, 64% reduction)
- Thinking tokens disabled (`thinkingBudget: 0`) for speed
- JSON repair for Gemini formatting quirks
- `media_resolution: MEDIA_RESOLUTION_LOW` for longer video support
- `tool_choice` API parameter to force `capture_brainstorm` on YouTube URLs
- Dynamic 8-persona roster with stage affinity mapping
- Full Meta-Gem sensemaking framework in prompt
- 25 venture lifecycle stage awareness in analysis output

## Key Learnings

### 1. Force Tool Calling When Intent Is Unambiguous
**Pattern**: Claude would sometimes discuss a YouTube URL instead of calling `capture_brainstorm`.
**Solution**: Use `tool_choice: { type: "tool", name: "capture_brainstorm" }` when URL detected.
**Applicability**: Any channel where a specific input pattern should ALWAYS trigger a specific tool (e.g., venture name in Decisions → always call `get_venture_status` first).

### 2. Background Processing with Polling UX
**Pattern**: Send immediate ACK → process in background → poll for completion → deliver results.
**Why it works**: Telegram has strict timeout limits. Long operations (Gemini analysis: 40-60s) would fail if synchronous.
**Applicability**: Any channel doing heavy queries (Vision Alignment score computation, Portfolio Health aggregation) could use this pattern for complex analyses.

### 3. Inline Keyboard Disposition Flow
**Pattern**: Present results with action buttons → handle callbacks → update state.
**Why it works**: Mobile-first UX. Tapping a button is faster than typing a command.
**Applicability**: Decisions channel (kill/park/advance buttons), Build Queue (claim SD / skip / defer buttons), Alerts (acknowledge / snooze / escalate buttons).

### 4. Stage-Correlated Persona Selection
**Pattern**: Map content to relevant lifecycle stages → select personas whose expertise aligns with those stages → frame insights around stage improvements.
**Why it works**: Grounds abstract analysis in the concrete EHG venture framework. Every insight maps to actionable stage improvement.
**Applicability**: Venture Lifecycle channel could use stage-aware analysis for any venture status query. Daily Briefing could highlight which stages need attention across the portfolio.

### 5. Dynamic Prompt from Database
**Pattern**: Store the analysis prompt in `chairman_preferences` table, fall back to source code constant.
**Why it works**: Prompt iteration without redeployment. Chairman can tune analysis behavior.
**Applicability**: Every channel's system prompt could have a DB-backed override. Especially useful for Decisions (decision criteria), Vision Alignment (scoring rubric), Alerts (threshold definitions).

### 6. Multi-Format Output Parsing
**Pattern**: `extractPersonaInsights()` handles 3 different JSON structures from Gemini (array, keyed object, mixed).
**Why it works**: LLMs don't always follow the schema exactly. Defensive parsing prevents silent failures.
**Applicability**: Any tool executor that parses LLM output should handle format variations gracefully.

### 7. Conversation TTL + Token Budget
**Pattern**: 1-hour TTL, 4000-token max per conversation thread.
**Why it works**: Prevents context explosion on mobile. Chairman gets fast, focused responses.
**Applicability**: Already applied globally, but could be tuned per-channel (Decisions might need longer TTL for multi-step confirmation flows).

### 8. Latency Optimization Stack
**Pattern**: Model selection (2.5 Flash) + thinking disabled + low media resolution + increased timeout.
**Why it works**: Each lever independently reduces latency. Combined effect: 120s → 43s (64% reduction).
**Applicability**: Any channel using Gemini or Claude should apply the same optimization stack. Claude Haiku for enrichment is already fast; Gemini calls should always disable thinking for non-reasoning tasks.

## Cross-Channel Opportunities

### Daily Briefing (eva_daily_briefing)
- **Add**: Portfolio health with inline keyboard for drill-down per venture
- **Add**: Stage-aware alerts (ventures stuck at same stage for >2 weeks)
- **Pattern**: Background processing for aggregation queries

### Venture Lifecycle (eva_venture_lifecycle)
- **Add**: Stage-specific inline keyboards (at kill gates: Kill / Park / Advance buttons)
- **Add**: Stage improvement suggestions based on historical patterns
- **Pattern**: Disposition flow for stage transition decisions

### Decisions (eva_decisions)
- **Add**: Two-step confirmation with inline keyboards (currently text-based)
- **Add**: Decision impact preview before confirmation
- **Pattern**: Force tool calling (`make_venture_decision` always preceded by `get_venture_status`)

### Vision Alignment (eva_vision_alignment)
- **Add**: Background computation for trend analysis (heavy query)
- **Add**: Inline keyboard for dimension drill-down
- **Pattern**: Polling UX for score computation

### Build Queue (leo_build_queue)
- **Add**: Inline keyboard to claim/skip/defer SDs from mobile
- **Add**: Stage-aware priority (SDs affecting ventures at critical stages surface first)
- **Pattern**: Disposition flow for SD selection

### Active SDs (leo_active_sds)
- **Add**: Progress update with inline keyboard (% complete, blocker toggle)
- **Add**: Background processing for cross-SD dependency analysis
- **Pattern**: Polling UX for complex queries

### Alerts (shared_alerts)
- **Add**: Alert disposition (acknowledge / snooze 1h / snooze 24h / escalate)
- **Add**: Background threshold monitoring with push delivery
- **Pattern**: Inline keyboard disposition flow

## Out of Scope for Initial SD
- Building new channels/topics (only enhancing existing 7)
- Changing the dual-persona model
- Adding new tool definitions (only enhancing existing tool executors)
- External integrations beyond Telegram (Slack, email, etc.)

## Suggested Next Steps
1. Create SD to apply cross-channel patterns (inline keyboards, background processing, disposition flows)
2. Prioritize Decisions channel (highest Chairman impact) and Alerts channel (push notification UX)
3. Use the DB-backed prompt pattern for all channels (already partially implemented via `persona-prompts.ts`)
