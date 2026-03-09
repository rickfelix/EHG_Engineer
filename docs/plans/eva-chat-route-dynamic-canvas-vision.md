# Vision: EVA Chat Route with Dynamic Canvas

## Executive Summary
EHG's Chairman UI currently surfaces EVA's strategic intelligence through static dashboards and a constrained floating chat card. This vision transforms the chairman's interaction with EVA from passive information consumption to active conversational strategy — a dedicated chat route where the chairman engages in extended strategic dialogue with EVA while a dynamic canvas renders rich, structured analysis (charts, tables, decision matrices, timelines) alongside the conversation. The canvas is not just a display surface but an action surface where strategic artifacts become the starting point for decisions, brainstorms, and SD creation.

The strategic bet: conversational AI + structured visual output creates a fundamentally different way to operate a venture factory — one where strategic thinking is externalized, structured, and traceable.

## Problem Statement
The chairman manages a portfolio of ventures through the Chairman V3 UI. Strategic analysis currently requires navigating multiple dashboards, mentally cross-referencing data, and synthesizing insights manually. EVA surfaces recommendations through push-based dashboard widgets, but there is no way to engage EVA in extended dialogue — asking follow-up questions, requesting alternative analyses, or drilling into specific dimensions. The existing floating chat card (EVAChatInterface.tsx, 614 LOC) is limited by its card-size viewport and cannot render structured visual artifacts. Strategic decisions that require comparing options, visualizing trends, or evaluating tradeoffs lack a natural workspace.

## Personas
- **Chairman (Rick)**: Primary user. Makes portfolio-level strategic decisions. Needs a workspace where he can think out loud, ask EVA compound questions ("Which ventures have declining MRR but improving engagement, and how does that compare to competitors?"), and see structured analysis rendered instantly. Values traceability — wants to look back at why decisions were made.
- **EVA (AI Strategic Advisor)**: The conversational partner. Needs a richer output surface than text to communicate structured analysis. Currently constrained to text responses in a floating card; the canvas gives EVA a medium for charts, tables, matrices, and interactive artifacts.
- **Venture Leads (Future)**: Secondary users who may eventually participate in canvas-enabled strategy sessions. Not in MVP scope.

## Information Architecture
- **Conversation Thread**: Left panel — message history with the chairman's queries and EVA's responses. Supports text, markdown, code blocks, and embedded references to canvas artifacts.
- **Dynamic Canvas**: Right panel — renders structured content extracted from EVA's responses. Content types form a registry pattern where each type (chart, table, decision matrix, timeline, etc.) is a self-registering module with its own schema, renderer, and validator.
- **Content Type System**: 5-7 initial types:
  - `decision-matrix` — weighted comparison of strategic options
  - `comparison-table` — side-by-side venture/competitor/feature comparison
  - `chart` — bar, line, area, pie via existing ChartRenderer (Recharts)
  - `okr-breakdown` — objectives, key results, metrics with progress indicators
  - `timeline` — chronological events, milestones, projections
  - `text` — rich markdown content for narrative analysis
  - `risk-heatmap` — probability × impact grid (stretch goal)
- **Conversation Persistence**: Conversations and their canvas artifacts stored in Supabase for retrieval and review. Each conversation has a thread of messages and associated canvas states.
- **Existing Infrastructure Leveraged**: EVAChatInterface (chat UI patterns), EVAConversationService (conversation management), ChartRenderer (visualization), react-resizable-panels (layout), react-markdown (text rendering), @tanstack/react-query (data fetching)

## Key Decision Points
- **Streaming vs Polling**: The chat UX must feel responsive. Modern AI chat interfaces stream responses token-by-token. Polling creates 5-15 second dead zones that erode trust. Decision: commit to streaming from Phase 1 for the text response; canvas artifacts render as complete units when the response finishes.
- **Canvas Persistence**: Canvas artifacts are persistent — stored alongside the conversation in Supabase. This enables decision journaling (traceable strategic rationale) and prevents the "transient artifact generator" anti-pattern where valuable analysis disappears after the session.
- **Content Type Extensibility**: Use a registry pattern from day 1. New content types are added by registering a schema, renderer, and validator — not by modifying a switch statement. This prevents maintenance explosion as the chairman requests types beyond the initial 5-7.
- **LLM Output Validation**: EVA's structured JSON output goes through a validation+repair layer before canvas rendering. Malformed output degrades gracefully to text/markdown — the canvas never crashes. Schema validation per content type with fallback rendering.
- **Cross-Repository Architecture**: The chat route lives in EHG (frontend), while conversation APIs and EVA orchestration live in EHG_Engineer (backend). Clear API contract between the two repos via Supabase RPC and REST endpoints.
- **Demand Validation**: A lightweight Phase 0 prototype (2-day spike with mocked canvas content) validates that the chairman prefers conversational EVA over dashboard-surfaced recommendations before committing to the full build.

## Integration Patterns
- **EVA Recommendation Engine**: Transforms from push-only (dashboard surfacing) to push+pull (conversational queries + proactive recommendations in context). The chat route gives the recommendation engine a conversational delivery channel.
- **Brainstorm Pipeline**: Brainstorms can happen inside the EVA chat — the chairman describes an idea, EVA renders a structured brainstorm scaffold on the canvas (problem statement, competitive context, effort estimate), and the conversation refines it toward SD creation.
- **LEO Protocol / SD Creation**: The canvas serves as a natural-language front end for SD initiation. The chairman describes what they want built, EVA renders a draft SD structure on the canvas, and once approved, calls `leo-create-sd.js` with the agreed parameters.
- **Competitor Monitoring**: Canvas renders competitive intelligence — feature comparison matrices, market share trends, positioning maps — pulling from the competitor monitoring pipeline's data.
- **Todoist/YouTube Intake**: Canvas displays classified intake items visually, enabling the chairman to review, reclassify, or promote items to brainstorms through conversation.
- **Existing EVA Infrastructure**: Extends `EVAChatInterface.tsx` (UI patterns), `EVAConversationService` (conversation management), `client-factory.js` (LLM routing). Does not replace any existing functionality.

## Evolution Plan
- **Phase 0** (2 days): Prototype/Spike — Mocked canvas content with the existing EVAChatInterface extracted to a route. Validates chairman preference for conversational interface before full investment.
- **Phase 1** (2-3 days): Infrastructure — EVA Chat route (`/chairman/eva-chat`), split-panel layout using react-resizable-panels, basic conversation API (save/retrieve), database migration for `eva_chat_conversations`.
- **Phase 2** (2-3 days): Canvas Rendering — Content type registry pattern, 5 initial content types (decision matrix, comparison table, chart, OKR breakdown, timeline, text), EVA response parser/validator, graceful fallback rendering.
- **Phase 3** (2-3 days): Streaming + Polish — Streaming text responses via SSE, canvas artifact rendering on response completion, conversation persistence with canvas state, error handling, loading states.
- **Future**: Persistent canvas workspaces (named strategic environments), canvas as action surface (approve/reject/create from canvas), multi-stakeholder collaborative canvas, multi-modal input (screenshots, voice, PDFs).

## Out of Scope
- Collaborative multi-user canvas (future evolution)
- Voice-to-canvas pipeline (future — extends existing voice transcription)
- Canvas export to PDF/presentation format (future)
- Real-time canvas collaboration via WebSocket (future)
- Replacing existing Chairman V3 dashboards (canvas is additive, not replacement)
- Mobile-optimized canvas layout (desktop-first)
- Custom canvas widget builder (content types are developer-defined)

## UI/UX Wireframes
```
┌─────────────────────────────────────────────────────────────────────┐
│  Chairman V3 Shell (Navigation Bar)                                 │
├─────────────────────────────────┬───────────────────────────────────┤
│                                 │                                   │
│  EVA Chat Thread                │  Dynamic Canvas                   │
│  ─────────────────              │  ─────────────────                │
│                                 │                                   │
│  [Rick]: Which ventures have    │  ┌─────────────────────────────┐  │
│  declining MRR but improving    │  │  Venture Comparison Table   │  │
│  engagement?                    │  │                             │  │
│                                 │  │  Venture  MRR   Engagement  │  │
│  [EVA]: Based on the last 90   │  │  ─────── ───── ──────────── │  │
│  days, here's the analysis...  │  │  App A   ↓12%  ↑ 23%       │  │
│                                 │  │  App B   ↓ 5%  ↑ 45%       │  │
│  📊 Canvas: Venture Comparison │  │  App C   ↑ 8%  ↑  3%       │  │
│                                 │  └─────────────────────────────┘  │
│  [Rick]: Now overlay competitor │                                   │
│  data for App B                 │  ┌─────────────────────────────┐  │
│                                 │  │  📈 Engagement Trend Chart  │  │
│  [EVA]: Here's App B vs its    │  │  (Recharts line chart)      │  │
│  top 3 competitors...          │  │                             │  │
│                                 │  │  ~~~~~/                     │  │
│  📊 Canvas: Competitive        │  │  ~~~~~/                     │  │
│  Analysis                       │  │  ─── App B  ─── Comp 1     │  │
│                                 │  └─────────────────────────────┘  │
│                                 │                                   │
│  ┌──────────────────────┐      │                                   │
│  │ Type a message...    │      │                                   │
│  └──────────────────────┘      │                                   │
├─────────────────────────────────┴───────────────────────────────────┤
│  ◀─── Drag to resize panels ───▶                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Success Criteria
- EVA Chat route accessible at `/chairman/eva-chat` with split-panel layout
- Canvas renders 5+ content types correctly from EVA structured output
- Conversation persistence — chairman can return and review prior strategic dialogues
- Streaming text responses with <2 second time-to-first-token
- LLM output validation layer prevents canvas crashes — graceful fallback to text for malformed output
- Canvas content types extensible via registry pattern — adding a new type requires <100 LOC
- Phase 0 prototype validates chairman preference for conversational interface
- Cross-repo coordination: frontend (EHG) and backend (EHG_Engineer) deploy independently
- No degradation of existing Chairman V3 dashboard performance
