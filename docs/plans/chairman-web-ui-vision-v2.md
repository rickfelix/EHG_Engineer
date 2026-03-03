# Chairman Web UI — Vision Document v2

## Metadata

- **Version**: 2.0.0
- **Date**: 2026-03-02
- **Status**: Draft
- **Supersedes**: `docs/plans/chairman-web-ui-vision.md` (v1.0.0)
- **Origin**: Comprehensive UI/UX assessment + cross-reference against v1 vision, architecture plan, and Glass Cockpit OS vision
- **Companion**: `docs/plans/chairman-web-ui-architecture-v2.md`

---

## 1. Executive Summary

Rebuild the EHG chairman experience as a focused governance and portfolio management interface. This is not a refactor — it is a clean rebuild that replaces the existing double-layer navigation and 50+ route sidebar with the single-shell layout originally planned but never implemented.

The UI serves two personas (same person, different cognitive modes), integrates with Claude Code for complex actions, and evolves from responsive web app (Phase C) to installable PWA with push notifications (Phase D).

**Key changes from v1**:
- Confirmed scope includes ALL builder views (Active SDs, Build Queue, Brainstorm Inbox)
- Full PWA implementation in scope (not deferred to Phase D)
- All 4 gate types get gate-specific context rendering
- RPC governance functions replace direct table writes
- 3-layer progressive disclosure on decisions
- Legacy cleanup happens as-we-go, not as a separate phase

---

## 2. Problem Statement

### What exists today (assessed 2026-03-02)

The EHG app has 69+ completed chairman-related SDs that collectively built:
- **Two navigation layers**: `AuthenticatedLayout` (ModernNavigationSidebar with 50+ database-driven routes, header with search/breadcrumbs/company selector) wrapping `ChairmanLayoutV3` (9 tab items, AttentionQueueSidebar, MobileTabBar)
- **~350-570px of horizontal sidebar space** consumed before content starts
- **~112px of vertical chrome** from two stacked headers
- **Three search entry points** (sidebar search, header search, Cmd+K modal)
- **Mobile/desktop tab mismatch** — 5 desktop tabs unreachable on mobile, 2 mobile tabs don't exist on desktop
- **4 routes skip the layout wrapper** — losing tab navigation context
- **Generic decision cards** with no gate-specific context
- **Broken data pipeline** — `venture_stages` table missing, `get_daily_briefing` RPC returns wrong shape, decision records have null context fields

### Root cause

Feature accretion across 69+ SDs without a unified information architecture pass. Each SD added navigation elements, routes, and components independently.

### What we're building instead

A clean rebuild following the Telegram-inspired information architecture from v1, with a single `ChairmanShell` layout containing 8 navigation items (5 chairman + 3 builder), gate-specific decision rendering, progressive disclosure, and Claude Code handoff integration.

---

## 3. Personas

### 3.1 Chairman (Governance Mode)

**Goal**: Make informed decisions that keep ventures aligned with strategic vision.

**Mindset**: Executive review. Wants synthesized information, not raw data. Comfortable with approve/reject/park decisions when given sufficient context. Reviews in batches, not real-time.

**Key activities**:
- Daily briefing review (portfolio pulse, aggregate health)
- Blocking gate decisions (approve/reject ventures at stages 0, 10, 22, 25)
- Vision alignment monitoring (HEAL scores, drift detection)
- Venture lifecycle overview (25-stage pipeline view per venture)
- Preference management (risk tolerance, budget caps, notification settings)

**Decision frequency**: ~1-4 blocking decisions per week across all ventures. Batched daily review.

### 3.2 Solo Entrepreneur (Builder Mode)

**Goal**: Execute efficiently across the venture portfolio using LEO protocol.

**Mindset**: Operational. Wants to know what's next, what's blocked, and what just completed. Uses CLI as primary tool but needs a visual overview of the build pipeline.

**Key activities**:
- Active SD tracking (current phase, progress, blockers)
- SD queue monitoring (what's ready, what's blocked, what's in progress)
- Brainstorm capture and review (ideas inbox)

**Primary tool**: CLI (`npm run sd:next`, Claude Code). The web UI is supplementary for the builder — a monitoring surface, not an execution surface.

### 3.3 Persona Switching

Both personas are the same person. The UI uses **route-based context**:

- `/chairman/*` routes → chairman governance mode (calm, information-dense, decision-oriented)
- `/builder/*` routes → builder operational mode (active, queue-focused, progress-oriented)
- Persona toggle in the top nav switches sidebar sections and navigates to the persona's landing page
- Persona preference persisted to localStorage via Zustand store

---

## 4. Information Architecture

### 4.1 Chairman Views

| View | Route | Type | Purpose |
|------|-------|------|---------|
| **Daily Briefing** | `/chairman` | Read | Morning summary: greeting, 4 metric cards, decision preview, portfolio pulse, HEAL alignment |
| **Decisions** | `/chairman/decisions` | Read/Write | Blocking gate queue with gate-specific context. Approve/reject/park. |
| **Decision Detail** | `/chairman/decisions/:id` | Read/Write | Full context for one gate decision. Progressive disclosure. Claude Code handoff. |
| **Venture Lifecycle** | `/chairman/ventures` | Read | 25-stage pipeline view per venture. Gate status. Health scores. |
| **Venture Detail** | `/chairman/ventures/:id` | Read | Single venture deep view. 25-stage horizontal timeline. Artifacts. |
| **Vision & Alignment** | `/chairman/vision` | Read | HEAL scores, drift detection, corrective SD alerts |
| **Preferences** | `/chairman/preferences` | Read/Write | Risk tolerance, budget caps, notification settings, venture overrides |

### 4.2 Builder Views

| View | Route | Type | Purpose |
|------|-------|------|---------|
| **Active SDs** | `/builder` | Read | In-progress SD details, phase, progress, blockers |
| **Build Queue** | `/builder/queue` | Read | Prioritized SD pipeline (visual mirror of `npm run sd:next`) |
| **Brainstorm Inbox** | `/builder/inbox` | Read/Write | Brainstorm capture, past brainstorm viewer |

### 4.3 Shared

| View | Route | Type | Purpose |
|------|-------|------|---------|
| **Alerts** | (badge + toast) | Read | Proactive notifications for both personas |

---

## 5. Chairman Decision Points

The UI's highest-value feature is the **Decision Queue** — the points where the EVA pipeline blocks for human judgment.

### 5.1 Stage 0: Venture Routing Decision

**Trigger**: New venture synthesized from ideation pipeline
**Context shown**:
- Venture name, problem statement, solution hypothesis
- Target market, archetype, moat strategy
- Portfolio synergy score (0-100), time horizon
- Chairman constraint scores (10 strategic filters) — pass/fail per constraint

**Actions**: Approve (→ Stage 1) | Park as Blocked (30d review) | Park as Nursery (90d review)
**Auto-resolve**: N/A

### 5.2 Stage 10: Brand Approval Gate

**Trigger**: Brand naming analysis complete with 5+ candidates
**Context shown**:
- Brand genome (archetype, values, tone)
- 5+ naming candidates with per-criterion weighted scores (bar chart)
- Narrative extension (vision, mission, brand voice)
- Naming strategy type

**Actions**: Approve top candidate | Select different candidate (override) | Reject with rationale
**Auto-resolve**: 24h → auto-approve with flag

### 5.3 Stage 22: Release Readiness Gate

**Trigger**: Build loop complete, release package assembled
**Context shown**:
- Release items (features/bugfixes/infra) with status
- Release notes preview
- Target date, sprint retrospective summary
- Build quality checks from stages 17-21

**Actions**: Approve release | Reject with rationale | Hold
**Auto-resolve**: 24h → auto-approve with flag

### 5.4 Stage 25: Venture Portfolio Review

**Trigger**: Post-launch data collected, venture review complete
**Context shown**:
- Review summary with initiative outcomes by category
- Current vs original vision comparison, drift analysis
- Financial comparison (projected vs actual)
- Venture health scores (5 dimensions, 0-100 each)
- Proposed next steps

**Actions**: Continue | Pivot | Expand | Sunset | Exit — each with rationale
**Auto-resolve**: 24h → auto-approve with flag

### 5.5 Kill Gates (Stage 3, 5, 13, 23)

**Trigger**: Stage completion with failing health metrics
**Context shown**:
- Health score vs threshold
- Stage artifacts summary
- Risk factors
- Recommendation from EVA

**Actions**: Continue (override) | Kill (terminate venture) | Park (pause for review)
**Auto-resolve**: N/A — kill gates require explicit human decision

---

## 6. Progressive Disclosure

Every decision uses a 3-layer disclosure pattern to manage cognitive load:

### Layer 0: EVA Summary (Default — Decision Queue list)

Compact card showing:
- Gate type badge + venture name
- 1-2 sentence synthesized summary
- Priority indicator (critical/high/normal/low)
- Auto-approve countdown (if applicable)
- Quick actions: [Approve] [Reject] [Tell me more →]

### Layer 1: Decision Context (Expanded card or slide-over panel)

Gate-specific context rendering (see Section 5 for each gate type):
- Evidence and reasoning
- Scores, charts, pass/fail indicators
- Risk factors and recommendation
- [Approve] [Reject with rationale] [Park] [Open in Claude Code]

### Layer 2: Full Detail (Decision Detail page — `/chairman/decisions/:id`)

Complete artifact access:
- All stage artifacts for the venture
- Raw data tables, full audit trail
- Token usage, agent logs (builder-level detail)
- Claude Code context assembly for complex actions

---

## 7. Claude Code Integration

### 7.1 Pattern: Dashboard Reads, Claude Code Writes

The UI is primarily a **read surface** for governance context. When the chairman needs to take action beyond approve/reject (e.g., issue a protocol directive, investigate a drift, create a corrective SD), the UI hands off to Claude Code.

### 7.2 ClaudeCodeLink Component

Every decision card and venture detail view includes an "Open in Claude Code" action that:

1. Assembles structured context (venture ID, stage, relevant data summary, suggested action)
2. Formats as a markdown prompt block
3. Copies to clipboard with a "Copied!" toast confirmation
4. The chairman pastes into Claude Code web/desktop to execute the decision

### 7.3 Context Assembly Format

```markdown
## Chairman Decision Context

**Venture**: {name} (ID: {id})
**Gate**: Stage {n} — {gate_type}
**Summary**: {1-2 sentence summary}

### Data Snapshot
{gate-specific data formatted as markdown}

### Suggested Action
{recommended next step for Claude Code}
```

---

## 8. Shell Layout

### 8.1 Desktop

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◆ EHG    [Chairman ▼]  [Builder]                     ⚙ Prefs   👤  │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  CHAIRMAN  │              Main Content Area                          │
│  ────────  │              (route-dependent)                          │
│  Briefing  │                                                         │
│  Decisions │                                                         │
│  Ventures  │                                                         │
│  Vision    │                                                         │
│  Prefs     │                                                         │
│            │                                                         │
│  BUILDER   │                                                         │
│  ────────  │                                                         │
│  Active    │                                                         │
│  Queue     │                                                         │
│  Inbox     │                                                         │
│            │                                                         │
│ ────────── │                                                         │
│ [Alerts 🔴3]│                                                        │
└────────────┴─────────────────────────────────────────────────────────┘
```

**Behavior**:
- Clicking [Chairman] or [Builder] in top nav scrolls sidebar to that section + navigates to persona landing page
- Active route highlighted in sidebar
- Alert badge at sidebar bottom shows unread count
- Sidebar collapses to icon-only on narrow desktops (< 1200px)

### 8.2 Mobile

```
┌────────────────────────────┐
│  ◆ EHG              ⚙  👤 │
├────────────────────────────┤
│                            │
│                            │
│     Main Content Area      │
│     (full width)           │
│                            │
│                            │
│                            │
│                            │
│                            │
├────────────────────────────┤
│ Brief │ Dec │ Vent │ Vis │⋯│  ← Bottom tab bar
└────────────────────────────┘
```

**Behavior**:
- Bottom tabs show current persona's views (swipe or tap ⋯ for overflow/persona switch)
- Chairman: Brief, Dec, Vent, Vis, ⋯(Prefs + persona switch)
- Builder: Active, Queue, Inbox, ⋯(persona switch)
- Same items as desktop sidebar — full parity

---

## 9. UI/UX Wireframes

### 9.1 Daily Briefing (`/chairman`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Good morning, Chairman.                     Mar 2, 2026   ☀️   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ PENDING  │  │ ACTIVE   │  │  HEAL    │  │ COMPLETED    │   │
│  │ DECISIONS│  │ VENTURES │  │  SCORE   │  │ THIS WEEK    │   │
│  │    2     │  │    1     │  │   78%    │  │     3 SDs    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  DECISION QUEUE (2 pending)                      View All →     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 Kill Gate — Stage 3           NicheBrief AI         │   │
│  │     Health: 61/100 (below threshold)                     │   │
│  │     Waiting since: 2h ago            [Review →]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PORTFOLIO PULSE                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NicheBrief AI    ███░░░░░░░░░░░░  Stage 3/25  Active   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VISION ALIGNMENT                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HEAL Score: 78% ████████████████░░░░  (↑ 3% this week)│   │
│  │  0 drift alerts · 0 corrective SDs        [Details →]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Decision Queue (`/chairman/decisions`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Decisions                                    1 pending · 0 held│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ BLOCKING ───────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ 🔴 KILL GATE · Stage 3                              │ │  │
│  │  │ NicheBrief AI                                       │ │  │
│  │  │                                                     │ │  │
│  │  │ Health: 61/100 · Below 70 threshold                 │ │  │
│  │  │ Risk: Market validation incomplete                  │ │  │
│  │  │ Recommendation: Continue with monitoring            │ │  │
│  │  │                                                     │ │  │
│  │  │  [✓ Continue]  [✗ Kill]  [Park]  [Tell me more →]  │ │  │
│  │  │                                                     │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ RECENT (last 7 days) ───────────────────────────────────┐  │
│  │  (no recent decisions)                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Venture Lifecycle (`/chairman/ventures`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Venture Lifecycle                              1 active · 0 🌱  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ NicheBrief AI ──────────────────────── Stage 3/25 ──────┐  │
│  │                                                           │  │
│  │  THE TRUTH    THE ENGINE   IDENTITY   BLUEPRINT  BUILD  L │  │
│  │  ●─●─●─◐──── ○─○─○─○──── ○─○─○───── ○─○─○───── ○──── ○ │  │
│  │  0 1 2 [3]   4 5 6 7     8 9 10      11-13      14-22 23│  │
│  │          ▲                                                │  │
│  │   🔴 BLOCKING — Kill Gate (Health: 61/100)                │  │
│  │                                                           │  │
│  │  Health: 61/100   HEAL: Aligned   [View Detail →]         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Legend: ● Complete  ◐ In Progress  ○ Future  [N] Current Stage │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Builder Dashboard (`/builder`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Builder                                     0 active · 0 ready │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACTIVE SDs                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  No active SDs. Check the Build Queue for ready work.   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  READY QUEUE (next 3)                        View Full Queue →  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  (populated from strategic_directives_v2 pipeline)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  RECENT COMPLETIONS                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  (last 7 days of completed SDs with PR links)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 Preferences (`/chairman/preferences`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Chairman Preferences                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RISK & BUDGET                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Max Drawdown Tolerance     [====●=======] 35%          │   │
│  │  Monthly Budget Cap         [$____500____] USD          │   │
│  │  Tech Stack Directive       [React + Supabase    ▼]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  NOTIFICATIONS                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Email                      [chairman@ehg.com      ]    │   │
│  │  Daily Digest               [●  ON  ○ OFF]              │   │
│  │  Digest Time                [08:00 ▼]  Timezone [EST ▼] │   │
│  │  Quiet Hours                [22:00] to [07:00]          │   │
│  │  Push Notifications         [●  ON  ○ OFF]              │   │
│  │  Alert Threshold            [Critical + Warning  ▼]     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VENTURE-SPECIFIC OVERRIDES                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NicheBrief AI     Max drawdown: 25%        [Edit] [✕]  │   │
│  │  [+ Add Venture Override]                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                           [Save Changes]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Data Freshness Strategy

| Tier | Refresh Model | Staleness Tolerance | Views |
|------|--------------|---------------------|-------|
| **Live** | Supabase Realtime subscription | 0s | Decision Queue (new decisions arriving) |
| **Near-live** | Poll every 60s while tab active | 1 min | Active SDs (phase transitions), Alerts |
| **Session** | Fetch on view mount, cache for session | 5-15 min | Daily Briefing, Venture Lifecycle, Vision & Alignment |
| **Manual** | Fetch on explicit refresh or navigation | Unlimited | Build Queue, Preferences |

### Stale Data Indicator

When data is older than its staleness tolerance:
```
Last updated: 3 min ago  [↻ Refresh]
```
No aggressive warnings — the chairman knows this is a daily review tool.

---

## 11. Notification & Alert Delivery

### Delivery Channels

| Channel | Events | Implementation |
|---------|--------|----------------|
| **Dashboard badge** | All alerts | Red dot on sidebar Alerts item, count badge |
| **Browser tab title** | Pending decisions | `(3) Chairman — EHG` in tab title |
| **Email digest** | Blocking decisions only | Daily email at configured time via Supabase Edge Function + Resend |
| **Push notification** | Blocking decisions, critical HEAL drops | Web Push API via service worker |
| **App badge** | Unread count | Navigator Badge API (where supported) |

### Alert Priority Levels

| Priority | Trigger | Behavior |
|----------|---------|----------|
| **Critical** | New blocking gate decision | Push + email + badge |
| **Warning** | HEAL score < threshold, auto-approve < 4h | Push + badge |
| **Info** | Stage progression, SD completion | Badge only |

### Chairman Preferences Integration

The Preferences view controls:
- Email digest time (default: 08:00 local) and on/off toggle
- Push notification opt-in
- Alert priority threshold (Critical only, or Critical + Warning)
- Quiet hours

---

## 12. PWA Capabilities

### Manifest

```json
{
  "name": "EHG Chairman",
  "short_name": "Chairman",
  "start_url": "/chairman",
  "display": "standalone",
  "theme_color": "#1a1a2e",
  "background_color": "#16213e"
}
```

### Service Worker

- Cache briefing data for offline reading
- Background sync for decision actions taken offline
- Install prompt after 3+ visits

### Push Notifications

- Supabase Edge Function triggers on new `chairman_decisions` rows with `status = 'pending'`
- Web Push API via service worker subscription
- Respects quiet hours and alert threshold from chairman_preferences

---

## 13. What This UI Is NOT

1. **Not an execution surface for LEO** — no SD creation, no phase handoffs, no code review. That's CLI + Claude Code.
2. **Not a replacement for `npm run sd:next`** — the builder queue is a visual mirror, not a replacement.
3. **Not a real-time monitoring dashboard** — batched daily review, not live streaming.
4. **Not multi-user** — single chairman, single builder, same person. No RBAC.
5. **Not the existing app sidebar** — ChairmanShell replaces ModernNavigationSidebar for chairman/builder routes. The 50+ route sidebar is for other app sections only.

---

## 14. Success Criteria

1. **Daily habit formation**: Chairman opens the briefing view at least 5 of 7 days per week after 2 weeks
2. **Decision queue clearance**: All blocking gate decisions resolved through the UI (not CLI or auto-approve)
3. **Context sufficiency**: Chairman can make gate decisions without needing CLI for additional context
4. **Mobile usable**: All views render and function correctly on mobile browser and as installed PWA
5. **Sub-second loads**: Dashboard views load in < 1s with cached Supabase queries
6. **Progressive disclosure works**: Chairman uses "Tell me more" on at least 50% of non-trivial decisions

---

## 15. Related Documents

- **Architecture plan**: `docs/plans/chairman-web-ui-architecture-v2.md`
- **Superseded vision**: `docs/plans/chairman-web-ui-vision.md` (v1)
- **Glass Cockpit OS**: `docs/reference/vision/00-vision-v2-chairman-os.md`
- **EVA Lifecycle Vision**: `docs/plans/eva-venture-lifecycle-vision.md`
