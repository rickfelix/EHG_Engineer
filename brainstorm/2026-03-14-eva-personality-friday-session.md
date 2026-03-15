# Brainstorm: Eva Personality & Friday Session Enhancement

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Chairman Review**: 2 items reviewed, 2 accepted, 0 flagged, 0 research-needed
- **Related Ventures**: None (internal EHG tooling)
- **Source**: Todoist intake (Eva personality update task)

---

## Problem Statement

Eva's Friday weekly sessions currently produce text-only CLI reports saved to the database. The reports are data dumps without personality, curiosity, or strategic dialogue. The chairman — a solo entrepreneur operating in dual mode (strategic chairman + hands-on builder) — needs Eva to function more like a real executive assistant: presenting data with interactive elements, asking probing follow-up questions, showing curiosity about strategic themes, and driving deeper exploration of priorities and motivations. The existing Eva route in the EHG React app has chat functionality but lacks personality, interactive charts, and the conversational depth needed to make Friday sessions genuinely valuable.

## Discovery Summary

### Chairman's Vision (from Todoist voice memo)

Two interconnected enhancements:

1. **Eva Personality Layer**: Inspired by ChatGPT's voice mode — Eva should ask follow-up questions, show curiosity, and drive deeper strategic thinking. She needs to understand the chairman's dual persona:
   - **Chairman persona**: Portfolio strategy, venture evaluation, kill gate decisions
   - **Solo entrepreneur/builder persona**: Hands-on execution, technical decisions, shipping velocity

   Eva should ask questions like:
   - "Does this make you think you want to do XYZ?"
   - "Is there an underlying theme or motivation?"
   - "What's driving your focus on [topic] this week?"

2. **Friday Session Format Upgrade**: Move from text-only CLI to an interactive format:
   - PowerPoint-style briefing with dialogue
   - Interactive charts and graphs (Recharts, already in stack)
   - Chat-based dialogue where Eva presents and discusses data
   - Use existing Eva route in EHG app
   - Animated/interactive elements for engagement

### Existing Eva Chat Infrastructure (Code Review Findings)

The Eva chat system is significantly more built out than initially assumed. A full code review of `EVAChatPage.tsx` and supporting components reveals:

**Page Layout** (`src/pages/chairman-v3/EVAChatPage.tsx`):
- Split-panel: conversation sidebar (left) + resizable chat panel (center) + canvas panel (right)
- Conversation list with new/select/message count
- ResizablePanelGroup for flexible layout

**Chat Panel** (`src/components/eva-chat/EVAChatPanel.tsx`):
- Full message thread with user/assistant roles, timestamps
- Input field with send button and loading state
- Suggested prompts (currently hardcoded: "Compare ventures", "Key risks", "Help me decide")
- Canvas artifact linking (messages can reference canvas items)

**Canvas System** (`src/components/eva-chat/canvas/`):
- Registry-driven renderer dispatch (self-registering pattern)
- 4 content types: decision-matrix, comparison-table, chart, text
- ChartRenderer already uses Recharts
- JSON schema validation per content type
- CanvasResponseParser extracts structured artifacts from LLM responses

**Data Layer** (`src/hooks/useEVAChatConversation.ts`):
- Full Supabase persistence: conversations + messages
- `get_eva_conversations` RPC for listing
- Canvas content stored per-message (canvas_content JSONB, canvas_content_type)
- Token count and model tracking per message
- `useEVAChatStream` hook for streaming responses

**Backend** (`supabase/functions/eva-chat/index.ts`):
- Edge function handling LLM calls
- Canvas content extraction and storage

**What This Means for the Enhancement:**
- Phase 1 (personality) is primarily **prompt engineering + edge function system prompt update** — the chat UI is ready
- Phase 2 (Friday briefing) adds new canvas renderers (SD velocity chart, venture stage heatmap) to the existing registry — no new rendering infrastructure needed
- Suggested prompts should become data-driven (generated from Friday meeting data)
- Conversation persistence already supports tracking dialogue history for Eva learning loop

### Other Existing Infrastructure

| Component | Status | Relevance |
|-----------|--------|-----------|
| Friday meeting script | Operational | scripts/friday-meeting.js generates text reports |
| Recharts | Already in canvas | ChartRenderer component exists |
| Shadcn UI | In stack | Button, Input, ScrollArea, Badge, ResizablePanel all used |
| Database reports | Stored | Friday reports persisted in database |
| Edge function | Operational | Eva-chat edge function handles LLM routing |

## Analysis

### Arguments For
1. **Transforms a passive data dump into a strategic thinking partner** — probing questions surface insights the chairman would miss alone
2. **Dual-persona awareness is a unique competitive advantage** — no AI assistant understands the chairman/builder duality
3. **Friday sessions become the strategic anchor of the week** — engagement ensures consistent use rather than skipping
4. **Existing infrastructure covers 70% of the build** — Eva route, chat backend, Recharts, Shadcn all in place
5. **Compound value** — every Friday session where Eva asks one question that changes a strategic decision pays for the entire build

### Arguments Against
1. **Personality layer could feel gimmicky** — bad prompting makes Eva feel patronizing or shallow
2. **Visual presentation is a separate frontend project** — mixing it with personality risks scope creep
3. **Qualitative ROI** — hard to measure "better strategic decisions" vs quantifiable metrics
4. **Chat UX has existing issues** — need to fix those before layering personality on top

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 7/10 | Current Friday sessions are text walls. Moderate breadth (weekly cadence, single user). |
| Value Addition | 9/10 | Direct: engaging strategic dialogue. Compound: every probing question that changes a decision has outsized value for a solo entrepreneur. |
| Risk Profile | 3/10 | Low breaking change risk (additive personality layer). Low regression (existing Friday script untouched). |
| **Decision** | **Implement** | (7 + 9) = 16 > (3 * 2) = 6 |

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | Forward. Transforms reporting into strategic dialogue. Dual-persona awareness is a genuine force multiplier for decision quality. |
| CRO | What's the blast radius if this fails? | Moderate. Bad personality could make chairman avoid sessions (worse than status quo). Scope creep on visual presentation. Mitigation: ship personality first via CLI, visual layer incrementally. |
| CTO | What do we already have? What's the real build cost? | Eva route, chat, Recharts, Shadcn all exist. Two distinct efforts: (1) personality prompting (low-code, Tier 2-3), (2) visual presentation (larger frontend). Ship separately — personality delivers 80% value at 20% cost. |
| CISO | What attack surface does this create? | Minimal. Prompt-layer changes, no new data flows. Ensure strategic conversation persistence has appropriate access controls. No new API keys or external services. |
| COO | Can we actually deliver this given current load? | Yes, if phased. Personality layer fits in one sprint. Visual presentation is a separate SD with own timeline. Don't deliver both simultaneously. |
| CFO | What does this cost and what's the return? | Personality is near-zero cost (prompt engineering). Visual presentation has real dev cost. ROI is qualitative but significant — fund personality immediately, cap visual presentation scope for v1. |

### Judiciary Verdict
- **Board Consensus**: 6/6 approve. Two-phase delivery is unanimous.
- **Key Tensions**: CRO warns against gimmicky personality. CTO says personality is 80% of value at 20% cost. CFO requires visual presentation scope cap.
- **Recommendation**: Phase 1: Eva personality with dual-persona awareness and probing questions (CLI first, then chat). Phase 2: Interactive Friday session UI with charts and presentation format.
- **Escalation**: No — unanimous.

## Open Questions
- What personality research should inform Eva's conversation style? (ChatGPT voice mode patterns, executive coaching frameworks?)
- Should Eva's probing questions be pre-scripted templates or fully generative?
- How to calibrate curiosity depth — too shallow feels robotic, too deep feels intrusive?
- Should Friday session transcripts be stored for learning (Eva improves over time)?

## Suggested Next Steps
1. Phase 1 SD: Eva personality layer — dual-persona system prompt, probing question generation, curiosity-driven follow-ups
2. Phase 2 SD: Friday session interactive UI — Recharts dashboard, chat-based briefing, animated presentation elements
3. Research: Study ChatGPT voice mode conversation patterns for inspiration
4. Fix existing Eva chat issues before layering personality
