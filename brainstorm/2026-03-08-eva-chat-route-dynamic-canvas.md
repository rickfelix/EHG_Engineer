# Brainstorm: EVA Chat Route with Dynamic Canvas

## Metadata
- **Date**: 2026-03-08
- **Domain**: Integration
- **Phase**: MVP (extending existing EVA infrastructure with dedicated conversational interface)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (backend EVA pipeline), EHG (Chairman UI frontend)
- **Source**: Chairman final cut — merged from SD-RESEARCH-CHAIRMAN_UI-20260309-008 (GUI communication with EVA + dynamic canvas alongside chat)

---

## Problem Statement
The chairman interacts with EVA (the AI strategic advisor) through dashboard-surfaced recommendations and a floating chat card. This limits strategic dialogue to either passive consumption (dashboards) or constrained conversation (small floating card). There is no dedicated workspace where the chairman can engage in extended strategic dialogue with EVA while seeing rich, structured analysis rendered alongside the conversation. The current floating chat cannot display charts, tables, decision matrices, or other structured artifacts that strategic decision-making requires.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist's codebase exploration revealed significant existing infrastructure across both repositories:

**Frontend (EHG/ehg — Chairman V3):**
- **`EVAChatInterface.tsx`** (614 LOC) — Fully functional chat UI with message rendering, voice input, tab system
- **`EVAConversationService`** (386 LOC) — Manages conversations, messages, action items
- **`EVAContext`** (296 LOC) — React Context for EVA state management
- **`ChartRenderer.tsx`** (330 LOC) — Recharts wrapper supporting bar/line/pie/area charts
- **`react-resizable-panels@2.1.9`** — Already in dependencies for split-panel layouts
- **`react-markdown@9.1.0`** — Available for rich text rendering
- **`@tanstack/react-query@5.83.0`** — Mature data fetching patterns throughout
- **`recharts@2.15.4`** — Full chart library already integrated
- **86 TSX components** in Chairman V3, 13 existing routes
- Route pattern: `ProtectedRoute → ChairmanShell → LazyRoute → Page`

**Backend (EHG_Engineer):**
- **`client-factory.js`** — LLM routing infrastructure (Haiku/Sonnet tiers)
- **EVA intake pipeline** — `eva-intake-pipeline.js`, `eva-intake-classify.js`, sync services
- **`AIServiceManager`** — Wraps Claude/OpenAI with retry logic, timeouts, streaming support
- **`voice_conversations` table** — Supabase migration for conversation storage (partially reusable)

### What Must Be Built
- EVA Chat route page with split-panel layout (chat + canvas)
- Canvas content type system (5-7 initial types: decision matrix, comparison table, chart, OKR breakdown, timeline, text/markdown, risk heatmap)
- Response parser/validator (EVA JSON output → canvas render)
- Backend conversation API (save/retrieve EVA conversations)
- Database migration for `eva_chat_conversations` table
- Streaming integration (Challenger flagged polling as insufficient for chat UX)

## Analysis

### Arguments For
- Existing infrastructure reduces implementation effort by ~70% — chat UI, charts, layouts, data fetching all exist
- Transforms EVA from passive advisor (dashboard push) to interactive partner (conversational pull)
- Compound queries become possible — multi-dimensional strategic questions answered in seconds instead of 20-minute dashboard navigation
- Decision journaling with structured artifacts creates traceable strategic rationale
- No new dependencies required — recharts, react-resizable-panels, react-markdown all in place
- Canvas as action surface enables brainstorm→SD creation within conversation

### Arguments Against
- **Product-market risk**: No validated demand — does the chairman actually prefer conversational interaction for strategic decisions, or does he prefer structured dashboards?
- **LLM output reliability**: EVA must produce consistent structured JSON for canvas content types — inconsistent output breaks the experience
- **Streaming is non-negotiable**: Modern chat UX expects streaming; polling creates 5-15 second dead zones that feel broken
- **Canvas is a rendering framework**: Each content type is effectively a mini-application with its own state, error handling, and lifecycle — not just a component
- **EVAChatInterface coupling**: The existing 614 LOC component was built as a floating card, not a route-level panel — extraction is closer to a rewrite
- **Content type explosion**: The chairman will request types beyond the initial 5-7; without a registry pattern, each addition is 2-3 days of work

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 8/10 (High — all data from Supabase/EVA pipeline, well-structured) |
| Coverage | 7/10 (Good — existing EVA context + venture metrics; gaps in real-time competitor data) |
| Edge Cases | 5 identified |

**Edge Cases**:
1. **Malformed LLM JSON** (Common) — EVA produces canvas content that passes schema validation but renders nonsensically (0 data points, mismatched columns). Requires validation+repair layer.
2. **Content type not supported** (Common during rollout) — Chairman asks for visualization EVA cannot produce. Graceful fallback to markdown/text rendering.
3. **Long conversation performance** (Moderate) — 100+ message threads with many canvas renders cause React re-render cascading. Memoization and lazy-loading required.
4. **Stale data rendering** (Moderate) — Canvas shows metrics that are hours/days old. Freshness indicators needed on all canvas artifacts.
5. **Concurrent conversation sessions** (Rare) — Chairman opens EVA chat on desktop and mobile simultaneously. Conversation sync via Supabase Realtime.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) "Build it and they will come" trap — no validated demand for conversational strategic interface; chairman may prefer structured dashboards for decision-making; (2) Canvas is a rendering framework, not a feature — each content type is a mini-application with its own state/error handling; (3) EVAChatInterface extraction from floating card is closer to a rewrite than refactoring due to layout/context coupling; (4) Conversation persistence and shareability not addressed — without them, canvas becomes transient artifact generator
- **Assumptions at Risk**: (1) EVA can reliably produce structured JSON — LLMs produce malformed/hallucinated output more than teams expect; (2) Polling is sufficient — modern chat UX demands streaming, launching without it feels broken by comparison; (3) 5-7 content types cover use cases — content type requests follow a power law, architecture must handle growth; (4) Existing EVAChatInterface can be extracted — 614 LOC built for floating card context has different layout/lifecycle assumptions
- **Worst Case**: Feature ships, chairman tries real strategic queries. EVA produces inconsistent JSON, canvas crashes or shows raw data. Polling delay makes it feel sluggish. Chairman uses it twice, returns to dashboards. Feature becomes most expensive per usage minute — ongoing maintenance for content types nobody uses. Engineering time diverted from high-impact dashboard improvements.

### Visionary
- **Opportunities**: (1) Paradigm shift from "navigating information" to "conversing with it" — compound queries collapse 20-minute dashboard workflows to 90 seconds; (2) Decision journaling — every canvas render is a decision artifact with timestamped rationale, creates traceable strategic history; (3) In-chat brainstorming — brainstorm→SD pipeline happens inside conversation with canvas providing structured scaffolding; (4) Venture factory differentiator — no competitor has conversational strategic AI + structured canvas
- **Synergies**: EVA recommendation engine (push→pull complete loop), brainstorm pipeline (conversational brainstorming), LEO Protocol/SD creation (natural language front end for SD initiation), competitor monitoring (canvas visualizes competitive intelligence), Todoist/YouTube intake (visual classification review through canvas)
- **Upside Scenario**: Within 6 months, the EVA chat route becomes the chairman's primary work surface. Morning briefings take 3 minutes instead of 15. Brainstorm-to-SD conversion drops from days to minutes. 40% of SDs initiated through conversational EVA. Decision documentation goes from 20% to 100% with full conversational context.

### Pragmatist
- **Feasibility**: 8.5/10 — Both codebases have mature infrastructure; existing EVA patterns, conversation management, chart rendering, and layout systems all in place. Main work is integration.
- **Resource Requirements**: 950-1,550 LOC (excluding tests), ~7-9 days. No new dependencies needed. Phase 1 (infra): 2-3 days, Phase 2 (canvas): 2-3 days, Phase 3 (streaming+polish): 2-3 days.
- **Constraints**: (1) Streaming vs polling decision must be made early — architectural impact; (2) EVAChatInterface extraction is really a rewrite; (3) Content type registry pattern needed from day 1 to prevent maintenance explosion; (4) Database migration needed for eva_chat_conversations table
- **Recommended Path**: Phase 1 (route + layout + basic API), Phase 2 (canvas content types with registry pattern), Phase 3 (streaming + error handling + polish). Start with 5 core content types, make the registry extensible.

### Synthesis
- **Consensus Points**: (1) Existing infrastructure is strong — 70%+ reusable (all 3 agree); (2) Content type architecture must be extensible from day 1 (Challenger + Pragmatist); (3) This is technically feasible with known patterns (all 3 agree)
- **Tension Points**: (1) Challenger questions whether demand exists vs Visionary sees paradigm shift; (2) Pragmatist says polling-first vs Challenger insists streaming is non-negotiable for chat UX; (3) Visionary envisions persistent workspaces vs Challenger warns about scope creep
- **Composite Risk**: Medium — strong technical foundation, but product-market fit risk (conversational vs dashboard preference) requires validation. LLM output reliability is the technical wildcard.

## Open Questions
- Should a Phase 0 prototype be required to validate the chairman prefers conversational EVA over dashboard-surfaced recommendations?
- Streaming vs polling: commit to streaming from day 1 (adds 3-4 days but prevents rewrite), or ship polling MVP first?
- Should canvas artifacts be persistent (saved alongside conversation) or ephemeral (rendered on demand)?
- How should the canvas handle EVA hallucinations or incorrect structured data?

## Suggested Next Steps
1. Create SD(s) from this brainstorm with vision-key and arch-key linkage
2. Architecture suggests 3 implementation phases — could be orchestrator with children
3. Cross-repo coordination required (EHG frontend + EHG_Engineer backend)
4. Consider Phase 0 prototype (2-day spike) to validate chairman preference before full build
