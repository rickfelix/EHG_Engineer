# Architecture Plan: EVA Chat Route with Dynamic Canvas

## Stack & Repository Decisions
- **Repositories**: EHG (frontend — React/Vite/Shadcn UI) and EHG_Engineer (backend — Node.js/Supabase)
- **Frontend**: React + TypeScript + Vite + Shadcn UI + Tailwind CSS
- **Chart Library**: Recharts (already in EHG at `recharts@2.15.4`)
- **Layout**: `react-resizable-panels@2.1.9` (already in EHG dependencies)
- **Markdown**: `react-markdown@9.1.0` (already in EHG dependencies)
- **Data Fetching**: `@tanstack/react-query@5.83.0` (already in EHG dependencies)
- **LLM**: Claude Sonnet for strategic analysis, Claude Haiku for content type classification. Uses existing `client-factory.js` for LLM routing.
- **Database**: Supabase (PostgreSQL) — extends existing schema
- **Streaming**: Server-Sent Events (SSE) for text streaming; canvas artifacts render on completion
- **Existing Infrastructure (Fully Reusable)**: `EVAChatInterface.tsx` (614 LOC — UI patterns), `EVAConversationService` (386 LOC — conversation management), `EVAContext` (296 LOC — state management), `ChartRenderer.tsx` (330 LOC — Recharts wrapper), `AIServiceManager` (retry/timeout/streaming), `client-factory.js` (LLM routing)
- **New Dependencies**: None required

## Legacy Deprecation Plan
N/A — additive feature. The existing floating EVAChatInterface continues to function. The new route-level chat is a separate component that shares service-layer code (EVAConversationService, EVAContext) but has its own UI optimized for full-page layout.

## Route & Component Structure

### Frontend (EHG repo)
- `src/pages/chairman/EVAChatPage.tsx` — Route page with ResizablePanelGroup layout
- `src/components/eva-chat/EVAChatPanel.tsx` — Full-page chat panel (rewrite of floating card patterns for route context)
- `src/components/eva-chat/EVACanvasPanel.tsx` — Canvas container managing content type rendering
- `src/components/eva-chat/canvas/CanvasContentRegistry.ts` — Content type registry (schema, renderer, validator per type)
- `src/components/eva-chat/canvas/renderers/DecisionMatrixRenderer.tsx` — Weighted option comparison
- `src/components/eva-chat/canvas/renderers/ComparisonTableRenderer.tsx` — Side-by-side comparison
- `src/components/eva-chat/canvas/renderers/ChartCanvasRenderer.tsx` — Wrapper around existing ChartRenderer
- `src/components/eva-chat/canvas/renderers/OKRBreakdownRenderer.tsx` — Objectives/key results display
- `src/components/eva-chat/canvas/renderers/TimelineRenderer.tsx` — Chronological events/milestones
- `src/components/eva-chat/canvas/renderers/TextRenderer.tsx` — Rich markdown via react-markdown
- `src/components/eva-chat/canvas/CanvasResponseParser.ts` — Parse + validate EVA structured output
- `src/hooks/useEVAChatStream.ts` — SSE streaming hook for EVA responses
- `src/hooks/useCanvasState.ts` — Canvas content state management
- Route registration in `src/routes/chairmanRoutesV3.tsx` — `/chairman/eva-chat`

### Backend (EHG_Engineer repo)
- `lib/integrations/eva-chat-service.js` — EVA conversation orchestration (prompt construction, context injection, response parsing)
- `lib/integrations/eva-canvas-prompt.js` — System prompt templates for canvas-aware EVA responses
- `scripts/eva/eva-chat-api.mjs` — REST/RPC endpoints for conversation CRUD

## Data Layer

### New Tables
- `eva_chat_conversations` — Conversation threads
  - `id` (uuid), `user_id` (fk → auth.users), `title` (text — auto-generated from first message)
  - `status` (active, archived), `metadata` (jsonb — tags, venture context)
  - `created_at` (timestamptz), `updated_at` (timestamptz)

- `eva_chat_messages` — Individual messages within conversations
  - `id` (uuid), `conversation_id` (fk → eva_chat_conversations)
  - `role` (user, assistant, system), `content` (text — raw message text)
  - `canvas_content` (jsonb — structured canvas artifact, null if text-only)
  - `canvas_content_type` (text — registry key, null if text-only)
  - `token_count` (int), `model_used` (text)
  - `created_at` (timestamptz)

- `eva_canvas_artifacts` — Persistent canvas state snapshots
  - `id` (uuid), `message_id` (fk → eva_chat_messages)
  - `content_type` (text — registry key), `content_data` (jsonb — full artifact data)
  - `title` (text — human-readable label), `pinned` (bool — chairman can pin important artifacts)
  - `created_at` (timestamptz)

### Existing Tables Used
- `auth.users` — User identity for conversation ownership
- `voice_conversations` — Reference pattern for conversation schema (not directly used)

### RLS
- Row-level security on all new tables: users can only access their own conversations
- Service role for backend conversation creation (EVA response insertion)
- `eva_chat_conversations`: `auth.uid() = user_id` for SELECT/INSERT/UPDATE
- `eva_chat_messages`: `auth.uid() = (SELECT user_id FROM eva_chat_conversations WHERE id = conversation_id)` for SELECT
- `eva_canvas_artifacts`: Inherits message-level access

## API Surface

### Supabase RPC
- `create_eva_conversation(p_title, p_metadata)` → returns conversation_id
- `get_eva_conversations(p_limit, p_offset)` → paginated conversation list
- `get_conversation_messages(p_conversation_id)` → full message thread with canvas artifacts

### REST Endpoints (EHG_Engineer)
- `POST /api/eva-chat/message` — Send message, receive streaming EVA response
  - Request: `{ conversation_id, content, context: { venture_id?, topic? } }`
  - Response: SSE stream — text chunks, then final canvas artifact JSON
- `POST /api/eva-chat/conversations` — Create new conversation
- `GET /api/eva-chat/conversations/:id` — Retrieve conversation with messages

### Canvas Content Type Schema
```typescript
interface CanvasContent {
  type: string;  // Registry key
  title: string; // Display label
  data: unknown; // Type-specific payload
}

// Example: Decision Matrix
interface DecisionMatrixData {
  options: string[];
  criteria: { name: string; weight: number }[];
  scores: number[][];  // [option_index][criteria_index]
  recommendation?: string;
}

// Example: Comparison Table
interface ComparisonTableData {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  highlights?: { row: number; column: string; type: 'positive' | 'negative' | 'neutral' }[];
}
```

## Implementation Phases

- **Phase 0** (2 days): Prototype — Extract EVAChatInterface patterns to a route-level page. Mock 2-3 canvas content types with hardcoded data. Chairman uses prototype to validate preference for conversational interface vs dashboards.
- **Phase 1** (2-3 days): Infrastructure — `/chairman/eva-chat` route with ResizablePanelGroup layout. EVAChatPanel (rewritten for route context). Database migration for `eva_chat_conversations` and `eva_chat_messages`. Backend conversation API (create, retrieve, list). Basic message send/receive via REST.
- **Phase 2** (2-3 days): Canvas Rendering — CanvasContentRegistry with 5 initial types (decision matrix, comparison table, chart, OKR breakdown, timeline, text). CanvasResponseParser with JSON Schema validation per type. Graceful fallback rendering for malformed output. EVA system prompt templates for structured output.
- **Phase 3** (2-3 days): Streaming + Polish — SSE streaming for text responses (useEVAChatStream hook). Canvas artifact rendering on response completion. Conversation persistence with canvas state. Error handling and loading states. `eva_canvas_artifacts` table for pinning important artifacts.

## Testing Strategy
- Unit tests for CanvasResponseParser (malformed JSON → graceful fallback)
- Unit tests for each canvas content type renderer (valid data → correct render)
- Integration tests for conversation API (create → message → retrieve round-trip)
- E2E test for chat route (send message → receive response → canvas renders)
- LLM output validation tests (sample EVA outputs → expected content type parsing)
- Performance tests: conversation thread with 100+ messages, 20+ canvas artifacts

## Risk Mitigation
- **LLM output inconsistency**: Validation+repair layer between EVA output and canvas renderer. JSON Schema validation per content type. Fallback to text/markdown rendering — canvas never crashes. Budget 150-250 LOC for this layer.
- **EVAChatInterface coupling to floating card**: Treat extraction as a rewrite. Build EVAChatPanel as a new component sharing service-layer code (hooks, EVAConversationService) but with route-optimized UI. Keep floating card functional — do not try to make one component serve two contexts.
- **Content type explosion**: Registry pattern from day 1. Each type is a self-registering module (schema + renderer + validator). New types added by dropping a file, not modifying a switch statement. Target: <100 LOC per new content type.
- **Streaming complexity**: Hybrid approach — stream text response token-by-token via SSE, render canvas artifacts as complete units when response finishes. This avoids incremental chart rendering (which requires all data points) while maintaining responsive chat UX.
- **Cross-repo coordination**: Clear API contract. Frontend consumes REST/RPC endpoints; backend provides them. Independent deployability. API versioning from day 1.
- **Product-market fit risk**: Phase 0 prototype validates chairman preference before committing to full build. If prototype shows low engagement, redirect effort toward AI-enhanced dashboards instead.
- **Performance**: React.memo on canvas renderers, lazy-load canvas artifacts beyond viewport, virtualized message list for long conversations. Supabase Realtime for conversation sync if needed.
