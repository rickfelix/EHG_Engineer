# Brainstorm: Chairman Telegram Assistant — Two-Way EVA Operations Bot

## Metadata
- **Date**: 2026-02-22
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: Cross-cutting (EHG infrastructure)
- **Source**: Mark Kashef — "7 Agent Team Use Cases" video, Use Case #7: Hybrid Sub-Agent + Team Workflow

---

## Problem Statement

The Chairman currently receives one-way Telegram notifications (vision scores, digests) but cannot take action without opening a laptop and running Claude Code CLI. The gap between receiving information and acting on it creates friction in portfolio management. A two-way Telegram assistant powered by Claude API would let the Chairman manage all EVA operations — venture decisions, SD queue, portfolio health, preferences — from mobile.

## Discovery Summary

### Existing Infrastructure (Ready to Wire Up)

| Capability | Existing Code | Status |
|---|---|---|
| Telegram send (one-way) | `lib/notifications/telegram-adapter.js` | Production |
| Vision scores | `sd-next/data-loaders.js::loadVisionScores()` | Production |
| SD queue | `SDNextSelector.js::runSDNext()` | Production |
| Portfolio health / OKR | `data-loaders.js::loadOKRScorecard()` | Production |
| Kill/Park/Advance | `venture-nursery.js::parkVenture()` | Production |
| Decision watching | `chairman-decision-watcher.js::waitForDecision()` | Production |
| Preferences | `ChairmanPreferenceStore` class | Production |
| DFE evaluation | `decision-filter-engine.js::evaluateDecision()` | Production |
| Brand genome | `brand-genome.js` (full CRUD) | Production |
| Baseline/progress | `data-loaders.js::loadActiveBaseline()` | Production |
| Edge Functions | Already deployed (Deno runtime) | Production |

### What Needs to Be Built

1. **Supabase Edge Function**: `telegram-chairman-bot` webhook handler (grammY + Deno)
2. **Claude API tool definitions**: ~15-20 tools mapped to Supabase queries
3. **Data access layer in Deno**: Cannot import existing Node.js modules — must rewrite as direct Supabase client queries
4. **Conversation state table**: `telegram_conversations` (chat_id, messages JSONB, created_at)
5. **Audit logging table**: `telegram_bot_interactions`
6. **Inline keyboard templates**: kill/park/advance decision buttons
7. **Response formatter**: HTML parse_mode for rich Telegram messages
8. **RLS hardening**: Fix `chairman_preferences` table (currently public: true)

### Recommended Stack

| Component | Technology |
|---|---|
| **Runtime** | Supabase Edge Functions (Deno) |
| **Bot Framework** | grammY (native Deno support, official Supabase example) |
| **LLM** | Claude Sonnet via `npm:@anthropic-ai/sdk` |
| **Database** | Existing Supabase (direct access from Edge Functions) |
| **State** | `telegram_conversations` table |
| **Auth** | chat_id allowlist + webhook secret_token |
| **Formatting** | HTML parse_mode |

## Analysis

### Arguments For
1. **Complete Chairman API surface already exists** — 15+ functions across vision scores, decisions, preferences, SD queue, portfolio health, brand genome. The bot is a UI layer, not new business logic.
2. **Proven stack** — Supabase Edge Functions + grammY is officially documented with examples. ~42ms cold starts.
3. **Massive UX improvement** — Chairman manages portfolio from phone instead of requiring laptop + CLI.
4. **"Chairman OS" trajectory** — starts as bot, evolves into decision engine with learned preferences. Decision data becomes a strategic asset.
5. **Low operational cost** — ~$20-50/month (Sonnet API + free Supabase tier).

### Arguments Against
1. **Deno impedance is ~60% of dev work** — all existing Node.js modules must be reimplemented as direct Supabase queries in Deno.
2. **Latency risk** — 4-16 seconds for Claude tool-calling chain; may feel broken to Telegram users. Needs prototyping.
3. **Security gap** — `chairman_preferences` RLS is wide open (public: true). Must fix before any external integration.
4. **Conversation state is genuinely hard** — multi-turn disambiguation requires session memory, token budgeting, truncation strategy.

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. RLS policy gap on `chairman_preferences` (public: true on all operations) creates real attack surface when exposed via bot
  2. No conversation state management architecture exists — Claude API is stateless, multi-turn chat needs explicit design
  3. Telegram webhook reliability (duplicate processing, cold start retries) needs idempotency layer
- **Assumptions at Risk**:
  1. Claude + tools latency (4-16s end-to-end) may kill UX — Telegram users expect near-instant responses
  2. "All capabilities day one" underestimates business logic edge cases (doctrine_of_constraint triggers, claim system, status transitions)
  3. Single chat_id auth is insufficient without webhook secret_token validation
- **Worst Case**: Bot works for simple queries but fails unpredictably on complex operations. Chairman loses trust after 3-5 confusing failures. Live Edge Function with service_role key becomes dormant security liability.

### Visionary
- **Opportunities**:
  1. **Chairman OS** — seed of an executive operating system. Every decision creates structured records that evolve into a predictive decision model.
  2. **Multi-stakeholder platform** — same architecture serves advisors (read-only), investors (dashboards), venture leads (escalation). One-to-many platform play.
  3. **Ambient intelligence** — voice notes → Whisper → Claude → Stage 0 brief. Captures 80% of strategic thinking vs 20% that reaches a desk.
- **Synergies**: Vision score heal loop closes (one-way → two-way). DFE gets its natural input channel. Brand genome gets mobile approval. SD queue becomes strategic steering mechanism.
- **Upside Scenario**: Within 6 months, Chairman manages EHG entirely from Telegram during international travel. 90% of routine decisions autonomous. The "Chairman OS" pattern becomes EHG's own venture — licensed to PE firms and family offices.

### Pragmatist
- **Feasibility**: 5/10 (achievable but deceptively complex due to Deno impedance)
- **Resource Requirements**:
  - MVP (read-only): 3-5 days
  - Full two-way (15-20 tools): 10-15 days
  - Production-hardened: +3-5 days
  - Operational cost: ~$20-50/month
- **Constraints**:
  1. Deno runtime cannot import Node.js modules — must rewrite data access layer (~60% of dev time)
  2. Conversation state in stateless Edge Functions needs explicit table + truncation strategy
  3. Inline keyboard callback handling adds complexity (unique IDs, confirmation flows, cold start survival)
- **Recommended Path**: Phase 1 (read-only MVP, 3-5 days) → Phase 2 (decisions + state, days 5-10) → Phase 3 (full surface, days 10-15)

### Synthesis
- **Consensus**: The idea is valuable, the API surface exists, but Deno impedance and conversation state are real engineering challenges
- **Key Tension**: "All day one" vs phased approach. Latency (4-16s) vs UX expectations. Pragmatist and Challenger both recommend prototyping first.
- **Composite Risk**: Medium-High — integration seams are where complexity hides

## Implementation Phases (Recommended)

### Phase 1: Read-Only MVP (3-5 days)
- Single Edge Function with grammY
- Auth: chat_id allowlist + webhook secret_token
- Commands: `/status`, `/ventures`, `/scores`
- 3 Claude tools (read-only): `get_sd_queue`, `get_venture_status`, `get_vision_scores`
- No conversation state, no decisions
- **Validates**: latency chain, webhook reliability, auth model

### Phase 2: Decisions + State (days 5-10)
- Inline keyboards for kill/park/advance
- `chairman_decisions` table integration
- `telegram_conversations` table for multi-turn context
- Preference reads (direct Supabase queries)
- **Requires**: RLS fix on `chairman_preferences` FIRST

### Phase 3: Full Surface (days 10-15)
- All 15-20 tools ported
- Brainstorming mode (longer conversations)
- Portfolio health dashboards (formatted HTML)
- Brand genome approval flows
- Audit logging
- Conversation summarization for token management

## Pre-Requisites (Must Do Before Phase 1)
1. **Fix RLS on `chairman_preferences`** — add proper policies gated via `fn_is_chairman()`
2. **Validate grammY + Deno + webhook** — 30-minute spike to confirm the stack works
3. **Prototype latency** — single Claude tool call from Edge Function, measure end-to-end

## Architecture Diagram

```
[Chairman Phone] → [Telegram] → webhook POST
                                      ↓
                          [Supabase Edge Function]
                          ├── Auth (chat_id allowlist)
                          ├── grammY (parse update)
                          ├── Rate limiter
                          └── Route:
                              ├── /commands → direct Supabase queries
                              └── free text → Claude API (Sonnet)
                                              ├── tool_use → Supabase query
                                              └── text → format HTML → reply
                                      ↓
                          [Supabase DB] (existing tables)
                                      ↓
                          [Formatted response → Telegram]
```

## Open Questions
1. **Model choice**: Sonnet (fast, cheap, ~$0.02/interaction) vs Opus (smarter tool routing, ~$0.10/interaction)? Prototype will answer this.
2. **Voice message support**: Should Phase 1 handle Telegram voice messages (Whisper transcription → Claude)? Or defer to Phase 3?
3. **Notification consolidation**: Should the bot replace the existing one-way notification system, or run alongside it?
4. **Multi-device**: If Chairman uses Telegram on both phone and desktop, how does conversation state handle concurrent sessions?
5. **Decision confirmation**: Two-step (tap "Kill" → "Are you sure?") or single-step with undo window?

## Suggested Next Steps
1. **Create an SD** — this is well-defined enough for a phased implementation via LEO Protocol
2. **Phase 1 first** — read-only MVP validates the entire technical stack in 3-5 days
3. **Fix RLS** — `chairman_preferences` table hardening should be a separate quick-fix SD
