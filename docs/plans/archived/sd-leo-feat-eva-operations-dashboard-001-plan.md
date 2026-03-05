<!-- Archived from: .claude/plans/eva-operations-dashboard-ui.md -->
<!-- SD Key: SD-LEO-FEAT-EVA-OPERATIONS-DASHBOARD-001 -->
<!-- Archived at: 2026-03-05T11:05:48.467Z -->

# EVA Operations Dashboard UI — Complete Missing Frontend Pages

## Problem Statement
SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I (Operations Dashboard and Background Workers) was marked completed but only the backend workers, APIs, and Supabase hooks were implemented. The frontend Operations Dashboard pages were never built.

## Scope
Build the missing Operations Dashboard UI in the `ehg` frontend app to consume the existing backend APIs at `/api/eva/operations/*`.

### Components to Build
1. **VentureOperationsPage.tsx** — Live ventures overview table (`/chairman/operations`)
2. **VentureOperationsDetailPage.tsx** — Per-venture detail with tabs (`/chairman/operations/:ventureId`)
3. **RevenueTab.tsx** — MRR, CAC/LTV, churn metrics display
4. **CustomerServiceTab.tsx** — Ticket management, SLA tracking
5. **FeedbackTab.tsx** — Wraps Universal Inbox for venture feedback
6. **MetricsTab.tsx** — AARRR funnel visualization
7. **HealthTab.tsx** — Health score breakdown per venture

### Hooks & Routes
- Add route `/chairman/operations` → VentureOperationsPage
- Add route `/chairman/operations/:ventureId` → VentureOperationsDetailPage
- Create `useVentureOperations.ts` hook consuming existing APIs
- Wire into `chairmanRoutesV3.tsx`

### Existing Backend (Already Implemented)
- `lib/eva/workers/` — 5 worker modules (base, health-monitor, metrics-collector, stage-advance, scheduler)
- `lib/eva/operations/` — domain-handler.js, index.js
- `server/routes/eva-operations.js` — API endpoints
- `src/hooks/useLiveWorkflowProgress.ts` — already updated with real Supabase queries

## Type
feature

## Target Repository
ehg (frontend)

## Dependencies
None — backend APIs already exist from Child I
