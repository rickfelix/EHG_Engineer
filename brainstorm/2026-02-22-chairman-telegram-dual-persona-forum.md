# Brainstorm: Chairman Telegram Bot — Dual-Persona Forum Group Design

## Metadata
- **Date**: 2026-02-22
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active EHG portfolio ventures (FinTrack, EduPath, MedSync, LogiFlow, Solara Energy)

---

## Problem Statement

The Chairman Telegram bot (SD-EHG-FEAT-CHAIRMAN-TELEGRAM-BOT-001) was deployed as a single-channel bot. The user operates in two distinct mental modes: **Chairman** (portfolio oversight, venture decisions, vision alignment) and **Solo Entrepreneur/Builder** (LEO Protocol execution, SD pipeline, implementation). These modes have different information needs, different tool requirements, and different interaction patterns. A single-channel bot forces context-switching that mirrors the cognitive load the bot was designed to eliminate.

## Discovery Summary

### Key Insight: Two Personas, One Brain
The user identified a fundamental tension: the same person is both the strategic decision-maker (Chairman) and the hands-on builder (Solo Entrepreneur). These are not roles filled by different people — they are cognitive modes that shift based on context, time of day, and what question is being asked.

### Architecture Decision: Option B — Forum Group with Topics
Three options were evaluated:
- **Option A: Two Separate Bots** — cleanest separation, but double the maintenance
- **Option B: One Bot, Forum Group with Topics** — single deployment, topic-based routing ✅
- **Option C: One Bot, Mode Switching** — simplest but weakest separation

Option B wins because: one deployment, shared database access, per-topic system prompts, mutable notification settings per topic, and Telegram's native Forum UI provides the mental context switching.

### Telegram Forum Mechanics
- Telegram "Forum" (supergroup with Topics enabled) provides thread-based channels
- Each message carries `message_thread_id` identifying the Topic
- Bot reads thread ID and routes to different system prompt + tool subset
- One webhook, one Edge Function, different personalities per channel

### Brainstorm Capture → Inbox Integration
Rather than a separate brainstorm topic, brainstorm capture merges into the Inbox:
1. User sends quick idea to Inbox topic
2. Bot creates feedback item tagged `brainstorm_request`
3. Appears in unified inbox as pending action
4. Full `/brainstorm` runs at desk session later
5. Past brainstorms viewable as read-only from Inbox topic

### Image Support at Key Venture Stages
Telegram Bot API supports `ctx.replyWithPhoto()` and `ctx.replyWithDocument()`. Key image opportunities in the 25-stage venture lifecycle:

| Stage | Chairman Touchpoint | Image Type |
|-------|-------------------|------------|
| 0 | Venture approval (blocking) | Venture brief summary card |
| 3 | Kill Gate — validation | Market validation scorecard |
| 5 | Kill Gate — profitability | Financial projection charts, ROI graph |
| 10 | Strategic Naming | Logo concepts, brand identity visuals |
| 11 | GTM Strategy | Go-to-market strategy map |
| 16 | Schema Firewall (advisory) | Architecture diagram |
| 20 | Compliance Gate (advisory) | Security/performance scorecard |
| 23 | Go/No-Go Kill Gate (blocking) | Launch readiness dashboard |
| 25 | Post-lifecycle decision (blocking) | Performance analytics dashboard |

### Codebase Awareness (Mini-Brainstorm Intelligence)
The bot can't read the codebase directly, but CAN query:
- All completed/active SDs (what's been built)
- Venture registry (what ventures exist)
- Past brainstorm sessions (what's been explored)
- Capability patterns from SD descriptions

This provides meaningful context without filesystem access.

---

## Final Topic Structure (8 Topics)

### Chairman Persona (4 Topics)

| # | Topic | Purpose | Key Tools |
|---|-------|---------|-----------|
| 1 | **Daily Briefing** | Morning summary, portfolio pulse, aggregate health | get_portfolio_health, get_venture_status, get_vision_scores |
| 2 | **Venture Lifecycle** | 25-stage touchpoints, kill gates, stage images | get_venture_status, venture stage queries, sendPhoto for stage images |
| 3 | **Decisions** | Approve/reject/park with inline keyboards, audit trail | make_venture_decision, inline keyboards, chairman_decisions write |
| 4 | **Vision & Alignment** | HEAL scores, drift detection, correction alerts | get_vision_scores, score trend analysis |

### Builder Persona (3 Topics)

| # | Topic | Purpose | Key Tools |
|---|-------|---------|-----------|
| 5 | **Build Queue** | SD pipeline, "what's next", prioritized queue | get_sd_queue, SD priority queries |
| 6 | **Inbox** | Unified inbox + brainstorm capture + past brainstorm viewer | inbox queries, feedback item creation, brainstorm_sessions read |
| 7 | **Active SDs** | In-progress SD details, phase, progress, blockers | get_sd_details, handoff status queries |

### Shared (1 Topic)

| # | Topic | Purpose | Trigger Sources |
|---|-------|---------|-----------------|
| 8 | **Alerts** | Proactive push notifications for both personas | Health drops, kill gate triggers, blocked SDs, stale claims, vision score anomalies |

---

## Analysis

### Arguments For
1. **Cognitive prosthetic**: Collapses decision latency to near-zero. Ideas captured in 15 seconds instead of lost in a notes app.
2. **Kill gate acceleration**: Stage 5 financials arrive with charts, Chairman decides on the spot instead of waiting for desktop.
3. **Zero context-switch cost**: Forum topics enforce mental mode separation. Open "Decisions" = Chairman brain. Open "Build Queue" = Builder brain.
4. **Behavioral telemetry**: Telegram timestamps reveal when creative energy peaks — data no other system captures.
5. **Lossless context switching**: Insight goes into Telegram → scored by LEAD heuristics → auto-created as DRAFT SD before next terminal session.

### Arguments Against
1. **Protocol orphan risk**: Telegram decisions are invisible to LEO unless explicitly bridged with database triggers. chairman_decisions from Telegram has no sd_key, no gate record, no handoff row.
2. **Wrong-topic routing**: On mobile, messages will land in wrong topic. NLP can't recover from a misrouted system prompt.
3. **Alert infrastructure gap**: Proactive push requires pg_cron/pg_net — a separate deployment unit and failure domain.
4. **Monolith scaling**: 960-line index.ts needs decomposition before 8-channel routing is maintainable.

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  - Bot creates a parallel source of truth — Telegram decisions have no protocol weight (no handoff.js call, no gate)
  - 8-topic routing assumes clean persona separation that doesn't exist in practice — cross-cutting messages will be truncated
  - No protocol for bot downtime during critical SD transitions (no fallback, no liveness check)
- **Assumptions at Risk**:
  - Claude Sonnet NLP routing reliable enough for persona separation (user WILL misroute messages on mobile)
  - Supabase Edge Function adequate for stateful protocol integration (no session_id, no heartbeat, no claim row)
  - Brainstorm-to-SD pipeline is lightweight (no defined promotion mechanism exists in the protocol)
- **Worst Case**: Silent drift where bot creates feeling of protocol integration while SD pipeline runs independently. Chairman persona stops trusting the pipeline because inputs don't produce visible outputs. Bot becomes a journaling tool that the protocol ignores.

### Visionary
- **Opportunities**:
  - Telegram as LEO's external nervous system — bidirectional mobile orchestration terminal
  - Brainstorm capture as first-class SD feeder — nightly job scores tagged items, auto-creates DRAFT SDs
  - Kill gate checkpoints modeled as protocol events parallel to handoff.js
- **Synergies**:
  - Heal loop → Alerts topic (HEAL_STATUS signals pushed when scores cross thresholds)
  - Attention Capital framework → Telegram capture timestamps as behavioral telemetry
  - Stage Zero Synthesis → Chairman topic outputs as synthesis engine inputs
  - Claim system → Active SDs topic renders YOURS/CLAIMED/STALE badges passively
- **Upside Scenario**: Solo operator runs at cognitive throughput of a small team. Every context switch is lossless. Decision latency collapses to near-zero for both Builder queue and Chairman portfolio. Over a year, compounds into more ventures reaching kill gates, more SDs completing, more ideas evaluated.

### Pragmatist
- **Feasibility**: 6/10 — core mechanics straightforward, proactive alerts require architectural work
- **Resource Requirements**:
  - Channel routing + per-channel prompts: 3-4 hours
  - Image sending: 2-3 hours
  - Inbox creation + brainstorm capture: 4-6 hours
  - Venture lifecycle awareness: 2-4 hours
  - Proactive alerts: 6-10 hours (new infrastructure)
  - Total: 17-27 hours, 3-4 weeks at 1-2 hours/day
- **Constraints**:
  - Proactive alert path is architecturally disjoint (needs pg_cron + pg_net or separate Edge Function)
  - 960-line monolith resists per-channel isolation (needs channel registry refactor first)
  - message_thread_id absent in General channel — must handle gracefully
- **Recommended Path**:
  1. **Week 1**: Channel registry refactor + Chairman/Builder routing (6 hours)
  2. **Week 2**: Image sending + brainstorm capture tools (5 hours)
  3. **Week 3-4**: Proactive alerts as separate Edge Function (6-10 hours)

### Synthesis
- **Consensus Points**: Channel registry refactor is critical first step. Proactive alerts need separate infrastructure. Brainstorm capture needs defined promotion mechanism.
- **Tension Points**: Challenger sees silent drift risk; Visionary sees the same gap as the transformative opportunity if bridged. The design question is whether Telegram decisions emit protocol events or remain orphaned.
- **Composite Risk**: Medium — architecture sound, but protocol integration must be designed, not assumed.

---

## Critical Design Requirement: Auto-Surface Pending Brainstorms at Desktop

When the user captures brainstorm ideas on mobile via Telegram, they MUST be automatically surfaced when starting a desktop Claude Code session. The user should never have to remember to check the inbox manually.

**Implementation path:**
- `sd:next` or session initialization queries feedback items with `type='brainstorm_request'` and `status='pending'`
- Surfaces them alongside the SD queue: "You have N pending brainstorm items from Telegram"
- Each item shows: topic, capture timestamp, auto-detected domain
- User can immediately invoke `/brainstorm` on any item or defer

This is non-negotiable — the value of mobile capture is zero if the desktop session doesn't automatically remind the user.

## Open Questions
1. **Protocol bridge**: Should Telegram decisions emit database triggers that update `strategic_directives_v2`? Or should they remain advisory-only until confirmed at desktop?
2. **Misrouted messages**: Should the bot detect cross-cutting messages and suggest redirecting to the correct topic?
3. **Bot identity for claims**: Should the bot have its own `claude_sessions` row for protocol integration? Or should Telegram writes bypass the claim system entirely?
4. **Image generation pipeline**: Where do stage images (charts, brand visuals) come from? Are they pre-generated by EVA and stored in Supabase Storage, or generated on-demand?
5. **Alert priority levels**: Should all alerts go to one topic, or should critical alerts (kill gates) go to Decisions while informational alerts stay in Alerts?

## Suggested Next Steps
1. **Create SD** for the Forum Group evolution (channel registry refactor + topic routing)
2. **Design the protocol bridge** — how Telegram decisions become protocol-native events
3. **Audit Supabase Storage** — verify it's configured for image hosting
4. **Test Forum Group creation** — create the Telegram group, enable Topics, map thread IDs
5. **Phase the rollout**: Registry refactor → Chairman topics → Builder topics → Alerts infrastructure
