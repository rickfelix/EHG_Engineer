---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# Chairman Web UI — Vision Document


## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Problem Statement](#2-problem-statement)
- [3. Personas](#3-personas)
  - [3.1 Chairman (Governance Mode)](#31-chairman-governance-mode)
  - [3.2 Solo Entrepreneur (Builder Mode)](#32-solo-entrepreneur-builder-mode)
  - [3.3 Persona Switching](#33-persona-switching)
- [4. Information Architecture](#4-information-architecture)
  - [4.1 Chairman Views](#41-chairman-views)
  - [4.2 Builder Views](#42-builder-views)
  - [4.3 Shared](#43-shared)
- [5. Chairman Decision Points](#5-chairman-decision-points)
  - [5.1 Stage 0: Venture Routing Decision](#51-stage-0-venture-routing-decision)
  - [5.2 Stage 10: Brand Approval Gate](#52-stage-10-brand-approval-gate)
  - [5.3 Stage 22: Release Readiness Gate](#53-stage-22-release-readiness-gate)
  - [5.4 Stage 25: Venture Portfolio Review](#54-stage-25-venture-portfolio-review)
- [6. Claude Code Remote Integration](#6-claude-code-remote-integration)
  - [6.1 Pattern: Dashboard Reads, Claude Code Writes](#61-pattern-dashboard-reads-claude-code-writes)
  - [6.2 Handoff Mechanism](#62-handoff-mechanism)
  - [6.3 Example Flows](#63-example-flows)
- [7. Phase C → Phase D Evolution](#7-phase-c-phase-d-evolution)
  - [7.1 Phase C: Hybrid Dashboard (current target)](#71-phase-c-hybrid-dashboard-current-target)
  - [7.2 Phase D: Progressive Web App (future enhancement)](#72-phase-d-progressive-web-app-future-enhancement)
- [8. What This UI Is NOT](#8-what-this-ui-is-not)
- [9. UI/UX Wireframes](#9-uiux-wireframes)
  - [9.1 Shell Layout (Desktop)](#91-shell-layout-desktop)
  - [9.2 Shell Layout (Mobile)](#92-shell-layout-mobile)
  - [9.3 Daily Briefing (`/chairman`)](#93-daily-briefing-chairman)
  - [9.4 Decision Queue (`/chairman/decisions`)](#94-decision-queue-chairmandecisions)
  - [9.5 Decision Detail — Reject/Rationale Modal](#95-decision-detail-rejectrationale-modal)
  - [9.6 Venture Lifecycle (`/chairman/ventures`)](#96-venture-lifecycle-chairmanventures)
  - [9.7 Vision & Alignment (`/chairman/vision`)](#97-vision-alignment-chairmanvision)
  - [9.8 Builder Dashboard (`/builder`)](#98-builder-dashboard-builder)
  - [9.9 Preferences (`/chairman/preferences`)](#99-preferences-chairmanpreferences)
  - [9.10 User Flow: Chairman Daily Review](#910-user-flow-chairman-daily-review)
  - [9.11 User Flow: Builder Check-In](#911-user-flow-builder-check-in)
- [10. Data Freshness Strategy](#10-data-freshness-strategy)
  - [Freshness Tiers](#freshness-tiers)
  - [Why Not All Realtime?](#why-not-all-realtime)
  - [Stale Data Indicator](#stale-data-indicator)
  - [Background Prefetch (Phase D / PWA)](#background-prefetch-phase-d-pwa)
- [11. Notification & Alert Delivery](#11-notification-alert-delivery)
  - [The Problem](#the-problem)
  - [Delivery Strategy (Phased)](#delivery-strategy-phased)
  - [Alert Priority Levels](#alert-priority-levels)
  - [Chairman Preferences Integration](#chairman-preferences-integration)
  - [No Telegram, No SMS](#no-telegram-no-sms)
- [12. Success Criteria](#12-success-criteria)
- [13. Related Documents](#13-related-documents)

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: Draft
**Origin**: Brainstorm session `8724b615-5e99-4980-a56c-33965d4a9df5`

---

## 1. Executive Summary

Build a focused governance and portfolio management interface for the EHG venture lifecycle. The UI serves two personas (same person, different cognitive modes) and integrates with Claude Code on the Web for conversational decision-making.

**Phase C** (current): Hybrid Dashboard + Claude Code Remote
**Phase D** (future): Progressive Web App with mobile-first interactions

---

## 2. Problem Statement

The EHG venture lifecycle (25 stages, 6 phases) requires human governance at specific intervention points. Today, these interventions are handled through CLI commands, which works for the builder persona but creates friction for the chairman persona — governance decisions need context-rich summaries, not terminal output.

The existing EHG web app (`rickfelix/ehg`) has 10+ chairman-related pages built across multiple SDs, but the user describes it as "cluttered." The pages were built incrementally without a unified information architecture, resulting in overlapping views that don't align to actual decision workflows.

Telegram was explored as an alternative (brainstorm sessions `11d895f1`, `8bb12106`) but rejected by the chairman — the medium doesn't match the governance context.

**Core insight**: The Telegram forum topic design *did* produce a clean information architecture. We adopt that IA as the blueprint for the web UI.

---

## 3. Personas

### 3.1 Chairman (Governance Mode)

**Goal**: Make informed decisions that keep ventures aligned with strategic vision.

**Mindset**: Executive review. Wants synthesized information, not raw data. Comfortable with approve/reject/park decisions when given sufficient context. Reviews in batches, not real-time.

**Key activities**:
- Daily briefing review (portfolio pulse, aggregate health)
- Blocking gate decisions (approve/reject ventures at stages 0, 10, 22, 25)
- Vision alignment monitoring (HEAL scores, drift detection)
- Venture lifecycle overview (where is each venture in the 25-stage pipeline)
- Preference management (risk tolerance, budget caps, tech stack directives)

**Decision frequency**: ~1-4 blocking decisions per week across all ventures. Batched daily review.

### 3.2 Solo Entrepreneur (Builder Mode)

**Goal**: Execute efficiently across the venture portfolio using LEO protocol.

**Mindset**: Operational. Wants to know what's next, what's blocked, and what just completed. Uses CLI as primary tool but needs a visual overview of the build pipeline.

**Key activities**:
- SD queue monitoring (what's ready, what's blocked, what's in progress)
- Active SD tracking (current phase, progress, blockers)
- Brainstorm capture and review (ideas inbox)
- Protocol health monitoring (shared alerts)

**Primary tool**: CLI (`npm run sd:next`, Claude Code). The web UI is supplementary for the builder — a monitoring surface, not an execution surface.

### 3.3 Persona Switching

Both personas are the same person. The UI does not require separate login or role switching — it uses **route-based context**:

- `/chairman/*` routes → chairman governance mode (calm, information-dense, decision-oriented)
- `/builder/*` routes → builder operational mode (active, queue-focused, progress-oriented)
- Landing page shows both at a glance, with the chairman decision queue prominent

---

## 4. Information Architecture

Adopted from the Telegram forum topic design, mapped to web routes:

### 4.1 Chairman Views

| View | Route | Type | Source Tables | Purpose |
|------|-------|------|---------------|---------|
| **Daily Briefing** | `/chairman` | Read | ventures, venture_artifacts, vision_scores, chairman_decisions | Morning summary: portfolio pulse, health scores, pending decisions count |
| **Decisions** | `/chairman/decisions` | Read/Write | chairman_decisions, venture_artifacts, ventures | Blocking gate queue with full context. Approve/reject/park actions. |
| **Venture Lifecycle** | `/chairman/ventures` | Read | ventures, venture_artifacts | 25-stage pipeline view per venture. Kill gate status. Stage progression. |
| **Vision & Alignment** | `/chairman/vision` | Read | vision_scores, vision_score_dimensions | HEAL scores, drift detection, correction SD alerts |
| **Preferences** | `/chairman/preferences` | Read/Write | chairman_preferences | Risk tolerance, budget caps, notification settings |

### 4.2 Builder Views

| View | Route | Type | Source Tables | Purpose |
|------|-------|------|---------------|---------|
| **Active SDs** | `/builder` | Read | strategic_directives_v2, sd_phase_handoffs | In-progress SD details, phase, progress, blockers |
| **Build Queue** | `/builder/queue` | Read | strategic_directives_v2 | Prioritized SD pipeline (mirrors `npm run sd:next`) |
| **Inbox** | `/builder/inbox` | Read/Write | brainstorm_sessions | Brainstorm capture, past brainstorm viewer |

### 4.3 Shared

| View | Route | Type | Source Tables | Purpose |
|------|-------|------|---------------|---------|
| **Alerts** | (sidebar/toast) | Read | chairman_decisions, strategic_directives_v2 | Proactive notifications for both personas |

---

## 5. Chairman Decision Points

The UI's highest-value feature is the **Decision Queue** — the 4 points where the EVA pipeline blocks for human judgment:

### 5.1 Stage 0: Venture Routing Decision

**Trigger**: New venture synthesized from ideation pipeline
**Data shown**: Venture name, problem statement, solution, target market, archetype, moat strategy, portfolio synergy score (0-100), time horizon, chairman constraint scores (10 strategic filters)
**Actions**: Approve (→ Stage 1) | Park as Blocked (30d review) | Park as Nursery (90d review)
**Auto-resolve**: N/A (synchronous in current flow)

### 5.2 Stage 10: Brand Approval Gate

**Trigger**: Brand naming analysis complete with 5+ candidates
**Data shown**: Brand genome (archetype, values, tone), 5+ naming candidates with per-criterion weighted scores, narrative extension (vision, mission, brand voice), naming strategy type
**Actions**: Approve top candidate | Select different candidate (override) | Reject with rationale
**Auto-resolve**: 24h → auto-approve with flag

### 5.3 Stage 22: Release Readiness Gate

**Trigger**: Build loop complete, release package assembled
**Data shown**: Release items (features/bugfixes/infra) with status, release notes, target date, sprint retrospective, build quality checks from stages 17-21
**Actions**: Approve release | Reject with rationale | Hold
**Auto-resolve**: 24h → auto-approve with flag

### 5.4 Stage 25: Venture Portfolio Review

**Trigger**: Post-launch data collected, venture review complete
**Data shown**: Review summary, initiative outcomes by category, current vs original vision, drift analysis, financial comparison (projected vs actual), venture health scores (5 dimensions, 0-100 each), proposed next steps
**Actions**: Continue | Pivot | Expand | Sunset | Exit — each with rationale
**Auto-resolve**: 24h → auto-approve with flag

---

## 6. Claude Code Remote Integration

### 6.1 Pattern: Dashboard Reads, Claude Code Writes

The UI is primarily a **read surface** for governance context. When the chairman needs to take action beyond approve/reject (e.g., issue a protocol directive, investigate a drift, create a corrective SD), the UI hands off to Claude Code on the Web.

### 6.2 Handoff Mechanism

Each decision card and venture detail view includes an "Open in Claude Code" action that:

1. Assembles structured context (venture ID, stage, relevant data summary)
2. Copies to clipboard as a formatted prompt OR opens Claude Code web with pre-filled context
3. The chairman works conversationally in Claude Code to execute the decision
4. Results appear in the dashboard on next refresh

### 6.3 Example Flows

**Gate Decision (simple)**: Chairman opens `/chairman/decisions` → reviews Stage 10 brand candidates → taps "Approve" directly in the UI → done.

**Corrective Action (complex)**: Chairman opens `/chairman/vision` → sees HEAL drift on venture X → taps "Investigate in Claude Code" → Claude Code opens with context → chairman directs LEO to create corrective SD → next day's briefing reflects the correction.

---

## 7. Phase C → Phase D Evolution

### 7.1 Phase C: Hybrid Dashboard (current target)

- Desktop and mobile responsive (Tailwind breakpoints)
- Deployed on Vercel (HTTPS by default)
- Built in `rickfelix/ehg` as new route groups
- Real-time via Supabase subscriptions (or polling as MVP)

### 7.2 Phase D: Progressive Web App (future enhancement)

Added after Phase C is stable and actively used:

- `manifest.json` with app name, icons, theme color
- Service worker for offline-capable read views (cached briefings)
- Install prompt for home screen
- Push notifications for blocking gates via Supabase Edge Functions + Web Push API
- Swipe gestures for quick approve/reject on mobile

**Phase D prerequisites**:
- Phase C is complete and used daily for 2+ weeks
- All 4 decision surfaces work correctly
- Mobile responsive layout verified

---

## 8. What This UI Is NOT

Explicitly out of scope (from brainstorm un-done analysis):

1. **Not an execution surface for LEO** — no SD creation, no phase handoffs, no code review. That's CLI + Claude Code.
2. **Not a replacement for `npm run sd:next`** — the builder queue is a visual mirror, not a replacement for the authoritative CLI command.
3. **Not a real-time monitoring dashboard** — batched daily review, not live streaming. Polling or manual refresh is acceptable.
4. **Not multi-user** — single chairman, single builder, same person. No RBAC, no team features.
5. **Not the existing chairman pages refactored** — this is a clean redesign using the Telegram IA as blueprint. Existing pages remain but are superseded.

---

## 9. UI/UX Wireframes

### 9.1 Shell Layout (Desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◆ EHG    [Chairman]  [Builder]                      ⚙ Settings  👤 │
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
└────────────┴─────────────────────────────────────────────────────────┘
```

**Behavior**: Clicking [Chairman] or [Builder] in the top nav scrolls the sidebar to that section and navigates to the persona's landing page. Active route is highlighted in the sidebar.

### 9.2 Shell Layout (Mobile)

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
│ Brief │ Dec │ Vent │ Vis │⋯│  ← Bottom tab bar (swipe for more)
└────────────────────────────┘
```

**Behavior**: Bottom tabs show current persona's views. Tap the `⋯` (more) tab to switch persona or access overflow items (Prefs, Inbox).

### 9.3 Daily Briefing (`/chairman`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Good morning, Chairman.                     Feb 25, 2026  ☀️   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ PENDING  │  │ ACTIVE   │  │  HEAL    │  │ COMPLETED    │   │
│  │ DECISIONS│  │ VENTURES │  │  SCORE   │  │ THIS WEEK    │   │
│  │          │  │          │  │          │  │              │   │
│  │    2     │  │    6     │  │   78%    │  │     3 SDs    │   │
│  │          │  │          │  │          │  │              │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  DECISION QUEUE (2 pending)                      View All →     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🔴 Stage 10 — Brand Approval         NicheBrief AI    │   │
│  │     5 candidates scored. Top: "NicheBrief"              │   │
│  │     Waiting since: 2h ago            [Review →]         │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  🟡 Stage 0 — Venture Routing        FinTrack Pro      │   │
│  │     Synergy: 72/100  Horizon: 18mo                      │   │
│  │     Waiting since: 45m ago           [Review →]         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PORTFOLIO PULSE                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NicheBrief AI    ██████████░░  Stage 10/25  Active     │   │
│  │  MedSync          ████░░░░░░░░  Stage 5/25   Active     │   │
│  │  Solara Energy    ██████████████ Stage 22/25  Review     │   │
│  │  EduPath          ██░░░░░░░░░░  Stage 3/25   Active     │   │
│  │  LogiFlow         ░░░░░░░░░░░░  Stage 0      Nursery    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VISION ALIGNMENT                                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HEAL Score: 78% ████████████████░░░░  (↑ 3% this week)│   │
│  │  ⚠ 1 venture drifting: MedSync (moderate drift)         │   │
│  │  2 corrective SDs active                  [Details →]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Decision Queue (`/chairman/decisions`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Decisions                                    2 pending · 0 held│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ BLOCKING ───────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ 🔴 STAGE 10 · Brand Approval                       │ │  │
│  │  │ NicheBrief AI                                       │ │  │
│  │  │                                                     │ │  │
│  │  │ Brand Genome: Innovator archetype · Professional    │ │  │
│  │  │ Strategy: Descriptive naming                        │ │  │
│  │  │                                                     │ │  │
│  │  │ CANDIDATES                         SCORE            │ │  │
│  │  │ ┌─────────────────────────────────────────────┐    │ │  │
│  │  │ │ 1. NicheBrief     ████████████░  82/100 ★  │    │ │  │
│  │  │ │ 2. BriefNiche     ████████░░░░░  67/100    │    │ │  │
│  │  │ │ 3. NicheForge     ███████░░░░░░  61/100    │    │ │  │
│  │  │ │ 4. BriefLens      ██████░░░░░░░  55/100    │    │ │  │
│  │  │ │ 5. ScopeAI        █████░░░░░░░░  48/100    │    │ │  │
│  │  │ └─────────────────────────────────────────────┘    │ │  │
│  │  │                                                     │ │  │
│  │  │  [✓ Approve #1]  [Select Other ▼]  [✗ Reject]     │ │  │
│  │  │                                                     │ │  │
│  │  │  ───────────────────────────────────────────────── │ │  │
│  │  │  Waiting: 2h · Auto-approve in: 21h 58m            │ │  │
│  │  │  [Open in Claude Code]                              │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │ 🟡 STAGE 0 · Venture Routing                       │ │  │
│  │  │ FinTrack Pro                                        │ │  │
│  │  │                                                     │ │  │
│  │  │ Problem: Manual financial tracking for freelancers  │ │  │
│  │  │ Market:  Solo professionals, 2M+ TAM               │ │  │
│  │  │ Synergy: 72/100  Horizon: 18 months                │ │  │
│  │  │ Archetype: Efficiency Tool                          │ │  │
│  │  │                                                     │ │  │
│  │  │ CHAIRMAN CONSTRAINTS          PASS/FAIL             │ │  │
│  │  │ ┌─────────────────────────────────────────────┐    │ │  │
│  │  │ │ Fully Automatable        ✅ Pass             │    │ │  │
│  │  │ │ Proprietary Data         ✅ Pass             │    │ │  │
│  │  │ │ Narrow Specialization    ✅ Pass             │    │ │  │
│  │  │ │ Niche Over Crowded       ⚠️ Warning          │    │ │  │
│  │  │ │ Moat First               ✅ Pass             │    │ │  │
│  │  │ │ Values Alignment         ✅ Pass             │    │ │  │
│  │  │ └─────────────────────────────────────────────┘    │ │  │
│  │  │                                                     │ │  │
│  │  │  [✓ Approve → Stage 1] [Park: Blocked] [Park: 🌱]  │ │  │
│  │  │                                                     │ │  │
│  │  │  [Open in Claude Code]                              │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ RECENT (last 7 days) ───────────────────────────────────┐  │
│  │  ✅ Stage 22 · Solara Energy · Approved · Feb 23         │  │
│  │  ✅ Stage 0  · EduPath      · Approved · Feb 21         │  │
│  │  🅿️ Stage 0  · LogiFlow     · Parked (nursery) · Feb 20 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 Decision Detail — Reject/Rationale Modal

```
┌─────────────────────────────────────────────┐
│  Reject: Stage 10 Brand Approval            │
│  NicheBrief AI                         [✕]  │
├─────────────────────────────────────────────┤
│                                             │
│  Rationale (required):                      │
│  ┌─────────────────────────────────────┐   │
│  │ Names don't convey the AI-powered   │   │
│  │ nature of the product. Need options │   │
│  │ that emphasize automation.          │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  This will:                                 │
│  · Block pipeline at Stage 10               │
│  · Send venture back for re-analysis        │
│  · Record rejection in audit trail          │
│                                             │
│        [Cancel]    [Confirm Rejection]      │
│                                             │
└─────────────────────────────────────────────┘
```

### 9.6 Venture Lifecycle (`/chairman/ventures`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Venture Lifecycle                              6 active · 1 🌱 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ NicheBrief AI ──────────────────────── Stage 10/25 ─────┐  │
│  │                                                           │  │
│  │  THE TRUTH    THE ENGINE   IDENTITY   BLUEPRINT  BUILD  L │  │
│  │  ●─●─●────── ●─●─●─●──── ●─◐─○───── ○─○─○───── ○──── ○ │  │
│  │  0 1 2       3 4 5 6     7 8 9  [10]  11 12 13   14-21 22│  │
│  │                            ▲                               │  │
│  │                     🔴 BLOCKING — Brand Approval           │  │
│  │                                                           │  │
│  │  Health: 74/100   HEAL: Aligned   [View Detail →]         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ MedSync ────────────────────────────── Stage 5/25 ──────┐  │
│  │                                                           │  │
│  │  THE TRUTH    THE ENGINE   IDENTITY   BLUEPRINT  BUILD  L │  │
│  │  ●─●─●────── ●─●─◐─○──── ○─○─○───── ○─○─○───── ○──── ○ │  │
│  │  0 1 2       3 4 [5] 6    7 8 9      10-13      14-21 22│  │
│  │                ▲                                           │  │
│  │         ⚡ IN PROGRESS — Unit Economics                     │  │
│  │                                                           │  │
│  │  Health: 61/100   HEAL: ⚠ Moderate Drift  [View Detail →]│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Solara Energy ──────────────────────── Stage 22/25 ─────┐  │
│  │                                                           │  │
│  │  THE TRUTH    THE ENGINE   IDENTITY   BLUEPRINT  BUILD  L │  │
│  │  ●─●─●────── ●─●─●─●──── ●─●─●───── ●─●─●─●─── ●──── ◐ │  │
│  │  0 1 2       3 4 5 6     7 8 9  10   11-13      14-21[22]│  │
│  │                                                     ▲      │  │
│  │                                    ✅ Approved 2d ago      │  │
│  │                                                           │  │
│  │  Health: 88/100   HEAL: Aligned   [View Detail →]         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ LogiFlow ───────────────────────────── 🌱 Nursery ──────┐  │
│  │  Parked: Feb 20 · Review in: 68 days · Reason: Time      │  │
│  │  horizon — market not ready            [Wake Up] [Detail] │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Legend: ● Complete  ◐ In Progress  ○ Future  [N] Current Stage
```

### 9.7 Vision & Alignment (`/chairman/vision`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Vision & Alignment                          HEAL Score: 78%    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SCORE TREND (30 days)                                          │
│  100│                                                           │
│   90│                                                           │
│   80│          ╭──╮    ╭───╮  ╭─────╮  ╭──────                 │
│   70│    ╭─────╯  ╰────╯   ╰──╯     ╰──╯                      │
│   60│────╯                                                      │
│   50│                                                           │
│     └──────────────────────────────────────────────             │
│      Jan 26                              Feb 25                 │
│                                                                 │
│  DIMENSION BREAKDOWN                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Strategic Alignment  ██████████████████░░  85%  ↑ 2%   │   │
│  │  Execution Quality    ████████████████░░░░  76%  ─ 0%   │   │
│  │  Innovation Velocity  ███████████████░░░░░  72%  ↑ 5%   │   │
│  │  Portfolio Coherence  ████████████████░░░░  78%  ↓ 1%   │   │
│  │  Risk Management      █████████████████░░░  80%  ↑ 3%   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DRIFT ALERTS                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ⚠ MedSync — Moderate Drift                             │   │
│  │    Original: B2B health data platform                    │   │
│  │    Current:  Pivoting toward B2C wellness app            │   │
│  │    Drift since: Stage 4 (Feb 18)                         │   │
│  │    [Investigate in Claude Code]  [Accept Drift]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  CORRECTIVE SDs                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SD-MAN-FEAT-CORRECTIVE-030  In Progress  Gap: V07      │   │
│  │  SD-MAN-FEAT-CORRECTIVE-029  Planning     Gap: V12      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.8 Builder Dashboard (`/builder`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Builder                                     3 active · 5 ready │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACTIVE SDs                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SD-FDBK-FEAT-VIDEO-003           EXEC 45%             │   │
│  │  YouTube Metadata Enrichment                             │   │
│  │  Phase: EXEC · Child: B of D · Est: 2h remaining        │   │
│  │  ████████████████████░░░░░░░░░░░░░░░░░░░                │   │
│  │  Blocker: none                      [Open in Claude Code]│   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  SD-MAN-FEAT-CORRECTIVE-030       PLANNING              │   │
│  │  Vision Gap V07 Correction                               │   │
│  │  Phase: PLAN · PRD drafting                              │   │
│  │  ██████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                │   │
│  │  Blocker: none                      [Open in Claude Code]│   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  SD-EVA-FEAT-TEMPLATES-002        EXEC 80%              │   │
│  │  Stage Templates 3-8                                     │   │
│  │  Phase: EXEC · Child: D of E                             │   │
│  │  █████████████████████████████████░░░░░░░                │   │
│  │  Blocker: none                      [Open in Claude Code]│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  READY QUEUE (next 3)                        View Full Queue →  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. SD-INFRA-AUTH-MIGRATION-001    Priority: HIGH       │   │
│  │  2. SD-EVA-FEAT-STAGE-ZERO-002    Priority: MEDIUM     │   │
│  │  3. SD-FDBK-ENH-TELEGRAM-004     Priority: MEDIUM      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  RECENT COMPLETIONS                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ✅ SD-FDBK-FEAT-VIDEO-002  Completed Feb 25  PR #1592  │   │
│  │  ✅ SD-FDBK-FEAT-VIDEO-001  Completed Feb 25  PR #1591  │   │
│  │  ✅ SD-FDBK-FIX-YOUTUBE-001 Completed Feb 24  PR #1590  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.9 Preferences (`/chairman/preferences`)

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
│  │  Immediate Notifications    [●  ON  ○ OFF]              │   │
│  │  Daily Digest               [●  ON  ○ OFF]              │   │
│  │  Digest Time                [08:00 ▼]  Timezone [EST ▼] │   │
│  │  Quiet Hours                [22:00] to [07:00]          │   │
│  │  Rate Limit                 [__10__] per hour           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  VENTURE-SPECIFIC OVERRIDES                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NicheBrief AI     Max drawdown: 25%        [Edit] [✕]  │   │
│  │  Solara Energy     Budget cap: $1000/mo     [Edit] [✕]  │   │
│  │                                                          │   │
│  │  [+ Add Venture Override]                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                           [Save Changes]        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.10 User Flow: Chairman Daily Review

```
                    Chairman opens app
                          │
                          ▼
                  ┌───────────────┐
                  │ Daily Briefing│
                  │  /chairman    │
                  └───────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
        Decisions > 0?          HEAL drift?
              │                       │
         YES  │                  YES  │
              ▼                       ▼
    ┌─────────────────┐    ┌──────────────────┐
    │ Decision Queue  │    │ Vision & Align   │
    │ /chairman/dec   │    │ /chairman/vision │
    └────────┬────────┘    └────────┬─────────┘
             │                      │
        For each:              [Investigate in
             │                  Claude Code]
             ▼                      │
    ┌─────────────────┐            ▼
    │ Review Context  │    ┌──────────────────┐
    │ (inline card)   │    │ Claude Code Web  │
    └────────┬────────┘    │ (external)       │
             │             │ Issue directive  │
     ┌───────┼────────┐   └──────────────────┘
     │       │        │
     ▼       ▼        ▼
  Approve  Reject   Park
     │       │        │
     └───────┴────────┘
             │
             ▼
    Pipeline unblocked
    (appears in next briefing)
```

### 9.11 User Flow: Builder Check-In

```
              Builder opens app
                    │
                    ▼
            ┌───────────────┐
            │ Builder Dash  │
            │  /builder     │
            └───────┬───────┘
                    │
         ┌──────────┴──────────┐
         │                     │
    Active SDs            Ready Queue
    need attention?       pick next?
         │                     │
    YES  │                YES  │
         ▼                     ▼
  ┌─────────────┐    ┌─────────────────┐
  │ View blocker│    │ View SD detail  │
  │ or progress │    │ in queue        │
  └──────┬──────┘    └────────┬────────┘
         │                    │
         ▼                    ▼
  [Open in Claude Code]  [Open in Claude Code]
         │                    │
         ▼                    ▼
  Continue work in       Start SD via CLI
  Claude Code terminal   (npm run sd:next)
```

---

## 10. Data Freshness Strategy

The dashboard serves a **batched daily review** workflow, not real-time monitoring. This shapes every data-fetching decision.

### Freshness Tiers

| Tier | Refresh Model | Staleness Tolerance | Views |
|------|--------------|---------------------|-------|
| **Live** | Supabase Realtime subscription | 0s | Decision Queue (new decisions arriving) |
| **Near-live** | Poll every 60s while tab is active | 1 min | Active SDs (phase transitions), Alerts |
| **Session** | Fetch on view mount, cache for session | 5-15 min | Daily Briefing, Venture Lifecycle, Vision & Alignment |
| **Manual** | Fetch on explicit refresh or navigation | Unlimited | Build Queue, Preferences |

### Why Not All Realtime?

Supabase Realtime uses WebSocket connections per subscription. For a single-user daily-review tool:
- Most data changes infrequently (venture stages move once every few days)
- Realtime subscriptions add connection overhead and reconnection complexity on mobile
- Only the Decision Queue benefits from instant updates — a new blocking gate decision should appear immediately

### Stale Data Indicator

When data is older than its staleness tolerance, show a subtle indicator:
```
Last updated: 3 min ago  [↻ Refresh]
```
No aggressive "stale data" warnings — the chairman knows this is a daily tool.

### Background Prefetch (Phase D / PWA)

When the PWA service worker is active:
- Prefetch Daily Briefing data on app open (before the user navigates)
- Cache the last successful response for each view — show cached data instantly, then refresh in background
- This enables offline-capable read views in Phase D

---

## 11. Notification & Alert Delivery

### The Problem

The dashboard is a pull-based tool — the chairman must open it to see updates. But some events need to push to the chairman:
- A new blocking gate decision is waiting (Stages 10, 22, 25)
- A venture's HEAL score drops below threshold
- An auto-approve timeout is approaching (< 4h remaining)

### Delivery Strategy (Phased)

| Phase | Channel | Events | Implementation |
|-------|---------|--------|----------------|
| **C (MVP)** | Dashboard badge | All alerts | Red dot on Alerts nav icon, count in tab title: `(3) Chairman` |
| **C (MVP)** | Email digest | Blocking decisions only | Daily email at configured time (morning) via Supabase Edge Function + Resend |
| **D (PWA)** | Push notification | Blocking decisions, critical HEAL drops | Web Push API via service worker |
| **D (PWA)** | App badge | Unread count | Navigator Badge API (where supported) |

### Alert Priority Levels

| Priority | Trigger | Phase C Behavior | Phase D Behavior |
|----------|---------|-----------------|-----------------|
| **Critical** | New blocking gate decision | Email + badge | Push + badge |
| **Warning** | HEAL score < threshold, auto-approve < 4h | Badge only | Push + badge |
| **Info** | Stage progression, SD completion, advisory touchpoint | Badge only | Badge only |

### Chairman Preferences Integration

The Preferences view (Section 4 IA) controls:
- Email digest time (default: 08:00 local)
- Email digest enabled/disabled
- Push notification opt-in (Phase D)
- Alert priority threshold (receive Critical only, or Critical + Warning)

These preferences are stored in `chairman_preferences` table and respected by the Edge Function / service worker.

### No Telegram, No SMS

Per the brainstorm: Telegram was explicitly rejected by the chairman. SMS adds cost and complexity for a single-user system. Email is the sole push channel in Phase C; Web Push supplements it in Phase D.

---

## 12. Success Criteria

1. **Daily habit formation**: Chairman opens the briefing view at least 5 of 7 days per week after 2 weeks
2. **Decision queue clearance**: All blocking gate decisions resolved through the UI (not CLI or auto-approve)
3. **Context sufficiency**: Chairman can make gate decisions without needing to open CLI for additional context
4. **Mobile usable**: All views render and function correctly on iPhone/Android browser
5. **Sub-second loads**: Dashboard views load in < 1s with cached Supabase queries

---

## 13. Related Documents

- Brainstorm: `brainstorm/2026-02-25-chairman-web-ui-hybrid-dashboard.md`
- Architecture Plan: `docs/plans/chairman-web-ui-architecture.md`
- EVA Lifecycle Vision: `docs/plans/eva-venture-lifecycle-vision.md`
- Phase 01 Guide: `docs/guides/workflow/cli-venture-lifecycle/stages/phase-01-the-truth.md`
- SD-MAN-FEAT-CORRECTIVE-VISION-GAP-005 (V07: GUI limited to Chairman governance)
