# Chairman Web UI — Architecture Plan v2

## Metadata

- **Version**: 2.0.0
- **Date**: 2026-03-02
- **Status**: Draft
- **Supersedes**: `docs/plans/chairman-web-ui-architecture.md` (v1.0.0)
- **Companion**: `docs/plans/chairman-web-ui-vision-v2.md`

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Repository & Stack](#2-repository--stack)
- [3. Route Structure](#3-route-structure)
- [4. ChairmanShell Layout](#4-chairmanshell-layout)
- [5. Component Architecture](#5-component-architecture)
- [6. Data Layer](#6-data-layer)
- [7. Governance API Surface](#7-governance-api-surface)
- [8. Zod Response Validation](#8-zod-response-validation)
- [9. Zustand Client State](#9-zustand-client-state)
- [10. Progressive Disclosure Architecture](#10-progressive-disclosure-architecture)
- [11. Gate-Specific Renderers](#11-gate-specific-renderers)
- [12. Claude Code Integration](#12-claude-code-integration)
- [13. Notification System](#13-notification-system)
- [14. Mobile & PWA](#14-mobile--pwa)
- [15. Legacy Deprecation](#15-legacy-deprecation)
- [16. Implementation Phases](#16-implementation-phases)
- [17. Testing Strategy](#17-testing-strategy)
- [18. Risk Mitigation](#18-risk-mitigation)

---

## 1. Overview

This document defines the technical architecture for the Chairman Web UI rebuild. It is the engineering companion to the vision document (v2) and provides actionable specifications for components, data flow, API contracts, and implementation phasing.

**Architecture principles**:
1. **Single shell** — one `ChairmanShell` layout replaces the double-layer `AuthenticatedLayout > ChairmanLayoutV3` nesting
2. **Route-based personas** — `/chairman/*` and `/builder/*` share the shell but show different sidebar sections
3. **RPC-first governance** — decision mutations go through Supabase RPC functions, not direct table writes
4. **Validate at the boundary** — Zod schemas on every Supabase response, graceful fallback on failure
5. **Clean up as we go** — no separate legacy cleanup phase; each SD removes what it replaces

---

## 2. Repository & Stack

### 2.1 Repo: `rickfelix/ehg`

Local path: `C:\Users\rickf\Projects\_EHG\ehg`

All work happens in the existing EHG app. No new repositories. Feature branches per SD, PRs to `main`.

### 2.2 Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | React | ^18.3.1 | Existing |
| Build | Vite | Existing | Existing |
| Language | TypeScript | Existing | Strict mode |
| UI Components | Shadcn UI | Existing | Card, Table, Badge, Button, Sheet, Tabs, ScrollArea |
| Styling | Tailwind CSS | Existing | Responsive utilities, `cn()` from lib/utils |
| Icons | Lucide React | Existing | Consistent icon set |
| Data | @supabase/supabase-js | ^2.56.0 | Hosted instance: `dedlbzhpgkmetvhbkyzq.supabase.co` |
| Auth | Supabase Auth | Existing | `ProtectedRoute` + `ProtectedRouteWrapper` |
| State (server) | @tanstack/react-query | ^5.83.0 | v5 object syntax required |
| State (client) | zustand | ^5.0.8 | New `chairman-ui` store (see Section 9) |
| Routing | react-router-dom | ^6.30.1 | Existing |
| Charts | Recharts | ^2.15.4 | HEAL trends, health visualizations |
| Animation | framer-motion | ^11.18.2 | Subtle view transitions only |
| Validation | zod | ^3.25.76 | RPC response validation (see Section 8) |
| Toasts | sonner | ^1.7.4 | **Only toast system** for v3 — see Section 2.3 |
| Theme | Custom ThemeProvider | Existing | `src/components/theme/ThemeProvider.tsx` |
| Hosting | Vercel | Existing | HTTPS, edge CDN |

### 2.3 Toast System: Sonner Only

Two toast systems exist in the app. Chairman v3 standardizes on **sonner**:

| System | Package | v3 Usage |
|--------|---------|----------|
| sonner | `sonner ^1.7.4` | **Use exclusively** — `toast.success()`, `toast.error()`, `toast.info()` |
| Radix toast | `@radix-ui/react-toast` | **Do NOT import** in any v3 component |

Sonner is already themed via `src/components/ui/sonner.tsx`. The `next-themes` import in that file should be swapped to the custom ThemeProvider during cleanup.

### 2.4 React Query v5 Conventions

All v3 hooks must use the v5 object syntax:

```tsx
// CORRECT (v5)
const { data, isLoading } = useQuery({
  queryKey: ['chairman', 'decisions', 'pending'],
  queryFn: async () => { ... },
  staleTime: 60_000,
});

// WRONG (v4 shorthand)
const { data } = useQuery(['decisions'], fetchDecisions);
```

**Query key conventions**:
- Prefix: `['chairman', ...]` or `['builder', ...]`
- Include filter params: `['chairman', 'decisions', { status: 'pending', gateType }]`
- Mutations use `useMutation` with `onSuccess` invalidation of related keys

### 2.5 Animation Rules (Framer Motion)

| Transition | Animation | Duration |
|------------|-----------|----------|
| View mount | Fade in + slide up 8px | 200ms |
| Decision card enter | Stagger children 50ms | 150ms each |
| Persona toggle | Crossfade sidebar items | 250ms |
| Toast | Slide in from right (handled by sonner) | 200ms |
| Modal/Sheet | Scale from 0.95 + fade | 200ms |

**Rule**: No animation > 300ms. No spring physics. This is a governance tool.

---

## 3. Route Structure

### 3.1 Route Groups

```
/chairman                    → Daily Briefing (landing)
/chairman/decisions          → Decision Queue (blocking gates)
/chairman/decisions/:id      → Decision Detail (full context)
/chairman/ventures           → Venture Lifecycle Map
/chairman/ventures/:id       → Venture Detail (25-stage view)
/chairman/vision             → Vision & Alignment (HEAL scores)
/chairman/preferences        → Chairman Preferences

/builder                     → Builder Dashboard (Active SDs)
/builder/queue               → Build Queue (SD pipeline)
/builder/inbox               → Brainstorm Inbox
```

**Total**: 7 chairman routes + 3 builder routes = 10 routes (down from 19+)

### 3.2 Route File

New file: `src/routes/chairmanRoutesV3.tsx`

Coexists with `chairmanRoutes.tsx` during transition. Once stable, the old file is deleted and the new file is renamed.

```tsx
// src/routes/chairmanRoutesV3.tsx
import { Route } from 'react-router-dom';
import { ProtectedRouteWrapper } from '@/components/auth/ProtectedRouteWrapper';
import { LazyRoute } from '@/components/routing/LazyRoute';
import { RouteErrorBoundary } from '@/components/errors/RouteErrorBoundary';
import ChairmanShell from '@/components/chairman-v3/ChairmanShell';

// All routes wrapped in: ProtectedRoute > ChairmanShell
// NO exceptions — every v3 route uses ChairmanShell

export const chairmanRoutesV3 = (
  <Route element={<ChairmanShell />}>
    {/* Chairman persona */}
    <Route path="/chairman" element={
      <ProtectedRouteWrapper loadingMessage="Loading briefing...">
        <LazyRoute component={() => import('@/components/chairman-v3/DailyBriefing')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/decisions" element={
      <ProtectedRouteWrapper loadingMessage="Loading decisions...">
        <LazyRoute component={() => import('@/components/chairman-v3/DecisionQueue')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/decisions/:id" element={
      <ProtectedRouteWrapper loadingMessage="Loading decision...">
        <LazyRoute component={() => import('@/components/chairman-v3/DecisionDetail')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/ventures" element={
      <ProtectedRouteWrapper loadingMessage="Loading ventures...">
        <LazyRoute component={() => import('@/components/chairman-v3/VentureLifecycle')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/ventures/:id" element={
      <ProtectedRouteWrapper loadingMessage="Loading venture...">
        <LazyRoute component={() => import('@/components/chairman-v3/VentureDetail')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/vision" element={
      <ProtectedRouteWrapper loadingMessage="Loading vision...">
        <LazyRoute component={() => import('@/components/chairman-v3/VisionAlignment')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/chairman/preferences" element={
      <ProtectedRouteWrapper loadingMessage="Loading preferences...">
        <LazyRoute component={() => import('@/components/chairman-v3/Preferences')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    {/* Builder persona */}
    <Route path="/builder" element={
      <ProtectedRouteWrapper loadingMessage="Loading builder...">
        <LazyRoute component={() => import('@/components/chairman-v3/builder/BuilderDashboard')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/builder/queue" element={
      <ProtectedRouteWrapper loadingMessage="Loading queue...">
        <LazyRoute component={() => import('@/components/chairman-v3/builder/BuildQueue')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    <Route path="/builder/inbox" element={
      <ProtectedRouteWrapper loadingMessage="Loading inbox...">
        <LazyRoute component={() => import('@/components/chairman-v3/builder/BrainstormInbox')} />
      </ProtectedRouteWrapper>
    } errorElement={<RouteErrorBoundary />} />

    {/* Redirects from legacy routes */}
    <Route path="/chairman/overview" element={<Navigate to="/chairman" replace />} />
    <Route path="/chairman/settings" element={<Navigate to="/chairman/preferences" replace />} />
    <Route path="/chairman/gates" element={<Navigate to="/chairman/decisions" replace />} />
    <Route path="/chairman/escalations/:id" element={<Navigate to="/chairman/decisions" replace />} />
    <Route path="/chairman/governance" element={<Navigate to="/chairman" replace />} />
    <Route path="/chairman/lifecycle" element={<Navigate to="/chairman/ventures" replace />} />
    <Route path="/chairman/portfolio" element={<Navigate to="/chairman/ventures" replace />} />
    <Route path="/chairman/*" element={<Navigate to="/chairman" replace />} />
  </Route>
);
```

---

## 4. ChairmanShell Layout

### 4.1 Component: `ChairmanShell.tsx`

Replaces both `AuthenticatedLayout` and `ChairmanLayoutV3` for all chairman/builder routes.

```tsx
interface ChairmanShellProps {
  children?: React.ReactNode; // or uses <Outlet />
}
```

**Structure**:

```
┌──────────────────────────────────────────────────────────────────────┐
│  TopNav: ◆ EHG    [Chairman ▼] [Builder]               ⚙ Prefs  👤  │
├────────────┬─────────────────────────────────────────────────────────┤
│  Sidebar   │  <Outlet />                                             │
│  (w-56)    │  (main content area)                                    │
│            │                                                         │
│  CHAIRMAN  │                                                         │
│  ────────  │                                                         │
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
│ Alerts 🔴3 │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

### 4.2 Desktop Behavior

- **Sidebar width**: `w-56` (224px) expanded, `w-14` (56px) collapsed (icon-only)
- **Auto-collapse**: Below 1200px viewport width
- **Persona toggle**: Top nav buttons. Clicking "Chairman" or "Builder" scrolls sidebar to that section and navigates to persona landing page (`/chairman` or `/builder`)
- **Active route**: Highlighted with accent background + left border indicator
- **Alert badge**: Sidebar bottom item, red dot with unread count. Clicking opens alert panel (Sheet from right)
- **No header chrome beyond top nav**: No breadcrumbs, no search bar, no company selector in the shell. Those belong to other app sections.

### 4.3 Mobile Behavior (< 768px)

- **Sidebar hidden**: Replaced by bottom tab bar
- **Top nav simplified**: Logo + settings gear + user avatar only
- **Bottom tab bar**: Fixed, `h-14`
  - Chairman: Briefing, Decisions, Ventures, Vision, [overflow: Prefs + persona switch]
  - Builder: Active, Queue, Inbox, [overflow: persona switch]
- **Full width content**: No sidebar consuming space

### 4.4 What ChairmanShell Does NOT Include

- `ModernNavigationSidebar` (the 50+ route sidebar) — not rendered
- `HeaderSearch`, `BreadcrumbNavigation`, `CompanySelector` — not rendered
- `FloatingEVAAssistant`, `FeedbackWidget`, `FeatureSearch` — not rendered
- `AttentionQueueSidebar` — replaced by the alert badge + panel
- `MobileTabBar` (existing) — replaced by new bottom tab bar component

The ChairmanShell is an entirely new layout. It does NOT wrap `AuthenticatedLayout`.

---

## 5. Component Architecture

### 5.1 Directory Structure

```
src/components/chairman-v3/
  ChairmanShell.tsx            # Layout: top nav + sidebar + bottom tabs + <Outlet />
  DailyBriefing.tsx            # /chairman — morning summary
  DecisionQueue.tsx            # /chairman/decisions — pending gate list
  DecisionDetail.tsx           # /chairman/decisions/:id — full context
  VentureLifecycle.tsx         # /chairman/ventures — all ventures pipeline
  VentureDetail.tsx            # /chairman/ventures/:id — single 25-stage view
  VisionAlignment.tsx          # /chairman/vision — HEAL scores + drift
  Preferences.tsx              # /chairman/preferences — settings editor

  builder/
    BuilderDashboard.tsx       # /builder — active SDs
    BuildQueue.tsx             # /builder/queue — SD pipeline
    BrainstormInbox.tsx        # /builder/inbox — idea capture + history

  gates/
    GateRendererStage0.tsx     # Venture routing context
    GateRendererStage10.tsx    # Brand approval context
    GateRendererStage22.tsx    # Release readiness context
    GateRendererStage25.tsx    # Portfolio review context
    GateRendererKillGate.tsx   # Kill gate context (stages 3, 5, 13, 23)
    GateRenderer.tsx           # Router component: picks renderer by gate type

  shared/
    ClaudeCodeLink.tsx         # "Open in Claude Code" — context assembly + clipboard
    DecisionActions.tsx        # Approve/Reject/Park button group with confirmation
    HealthScore.tsx            # Color-coded 0-100 score display
    StageIndicator.tsx         # Small stage badge (number + status color)
    StagePipeline.tsx          # Horizontal 25-stage pipeline visualization
    AlertPanel.tsx             # Right-side sheet for notification list
    MetricCard.tsx             # Dashboard metric card (count + label + trend)
    PersonaToggle.tsx          # Chairman/Builder switch buttons
    BottomTabBar.tsx           # Mobile bottom navigation
    StaleDataIndicator.tsx     # "Last updated: 3m ago [Refresh]"

  index.ts                     # Barrel exports
```

### 5.2 Key Shared Components

#### ClaudeCodeLink

```tsx
interface ClaudeCodeLinkProps {
  ventureId: string;
  ventureName: string;
  gateType?: string;
  stage?: number;
  summary: string;
  dataSnapshot: Record<string, unknown>;
  suggestedAction?: string;
}
```

Behavior:
1. Formats data into markdown context block (see vision v2 Section 7.3)
2. `navigator.clipboard.writeText(formatted)`
3. `toast.success("Copied to clipboard — paste into Claude Code")`

#### DecisionActions

```tsx
interface DecisionActionsProps {
  decisionId: string;
  gateType: 'stage0' | 'stage10' | 'stage22' | 'stage25' | 'kill_gate';
  onApprove: (notes?: string) => void;
  onReject: (reason: string) => void;
  onPark: (notes?: string) => void;
  isActing: boolean;
}
```

- Stage 0: [Approve] [Park as Blocked] [Park as Nursery]
- Stage 10: [Approve Top] [Select Different] [Reject]
- Stage 22: [Approve Release] [Reject] [Hold]
- Stage 25: [Continue] [Pivot] [Expand] [Sunset] [Exit]
- Kill Gate: [Continue] [Kill] [Park]

Reject and multi-option actions open a rationale input (Sheet or Dialog).

#### StagePipeline

```tsx
interface StagePipelineProps {
  currentStage: number;
  stages: Array<{
    number: number;
    status: 'completed' | 'in_progress' | 'not_started' | 'blocked';
    healthScore?: number;
  }>;
  onStageClick?: (stageNumber: number) => void;
}
```

Horizontal scrollable pipeline. 6 phase groups with labels. Color-coded dots per stage. Click to navigate to venture detail at that stage.

### 5.3 Error Boundary Strategy

Reuse the existing app error boundary hierarchy:

| Boundary | Usage in v3 |
|----------|-------------|
| `GlobalErrorBoundary` | Already wraps entire app — no change |
| `RouteErrorBoundary` | Wrap each v3 route via `errorElement` prop |
| `ComponentErrorBoundary` | Wrap data-dependent sections (HEAL chart, venture list, decision cards) |
| `ProtectedRouteWrapper` | Provides Suspense + loading message per route |
| `LazyRoute` | Code-splitting for all v3 views |

---

## 6. Data Layer

### 6.1 Hook Directory

```
src/hooks/chairman-v3/
  useChairmanBriefing.ts       # /chairman — pending count + ventures + HEAL + recent SDs
  useDecisionQueue.ts          # /chairman/decisions — pending gates with filtering
  useDecisionDetail.ts         # /chairman/decisions/:id — single decision + artifacts
  useVentureLifecycle.ts       # /chairman/ventures — all ventures with stage info
  useVentureDetail.ts          # /chairman/ventures/:id — single venture deep view
  useVisionScores.ts           # /chairman/vision — HEAL history + dimensions
  useChairmanPreferences.ts    # /chairman/preferences — preferences CRUD
  useBuilderDashboard.ts       # /builder — active SDs + recent completions
  useBuildQueue.ts             # /builder/queue — SD pipeline
  useBrainstormInbox.ts        # /builder/inbox — brainstorm sessions
  useAlerts.ts                 # Cross-cutting — notification state
```

### 6.2 Supabase Queries by View

#### Daily Briefing (`/chairman`)

```tsx
// useChairmanBriefing.ts
// Combines 4 parallel queries

// 1. Pending decisions count
const pendingCount = supabase
  .from('v_chairman_pending_decisions')
  .select('id', { count: 'exact', head: true });

// 2. Active ventures with current stage
const ventures = supabase
  .from('ventures')
  .select('id, name, current_lifecycle_stage, status, health_score, health_status')
  .eq('status', 'active')
  .order('name');

// 3. Latest HEAL score
const healScore = supabase
  .from('eva_vision_scores')
  .select('id, total_score, dimension_scores, threshold_action, scored_at')
  .order('scored_at', { ascending: false })
  .limit(1)
  .single();

// 4. Recent SD completions (last 7 days)
const recentSDs = supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, status, completion_date')
  .eq('status', 'completed')
  .gte('completion_date', sevenDaysAgo)
  .order('completion_date', { ascending: false })
  .limit(10);
```

**Stale time**: 5 min. **Refetch interval**: 5 min.

#### Decision Queue (`/chairman/decisions`)

```tsx
// useDecisionQueue.ts
// Query the unified view with optional filters

const decisions = supabase
  .from('v_chairman_pending_decisions')
  .select('*')
  .order('sla_remaining_seconds', { ascending: true }) // Most urgent first
  .limit(50);

// Client-side filter by priority and gate type
// (simpler than multiple query paths)
```

**Stale time**: 30s. **Refetch interval**: 60s. **Realtime**: Subscribe to `chairman_decisions` INSERT events.

**View columns available** (`v_chairman_pending_decisions`):
- `id`, `venture_id`, `venture_name`, `lifecycle_stage`, `stage_name`
- `health_score`, `recommendation`, `decision`, `status`
- `summary`, `brief_data`, `override_reason`, `risks_acknowledged`
- `created_at`, `updated_at`, `decided_by`, `rationale`, `blocking`
- `sla_deadline_at`, `sla_remaining_seconds`, `is_stale_context`, `venture_updated_at`
- `decision_type` (gate_decision, guardrail_override, cascade_override, advisory, etc.)

#### Decision Detail (`/chairman/decisions/:id`)

```tsx
// useDecisionDetail.ts

// 1. Decision with full brief_data
const decision = supabase
  .from('chairman_decisions')
  .select('*')
  .eq('id', decisionId)
  .single();

// 2. Venture context
const venture = supabase
  .from('ventures')
  .select(`
    id, name, current_lifecycle_stage, problem_statement,
    solution_approach, moat_strategy, portfolio_synergy_score,
    health_score, health_status, brand_variants
  `)
  .eq('id', ventureId)
  .single();

// 3. Stage configuration for gate context
const stageConfig = supabase
  .from('lifecycle_stage_config')
  .select('*')
  .eq('stage_number', lifecycleStage)
  .single();
```

**Stale time**: 30s. No auto-refetch (user is actively reviewing).

#### Venture Lifecycle (`/chairman/ventures`)

```tsx
// useVentureLifecycle.ts

const ventures = supabase
  .from('ventures')
  .select(`
    id, name, current_lifecycle_stage, status,
    health_score, health_status, created_at
  `)
  .eq('status', 'active')
  .order('name');

// For each venture, get pending decisions count
const pendingDecisions = supabase
  .from('chairman_decisions')
  .select('venture_id', { count: 'exact' })
  .eq('status', 'pending')
  .in('venture_id', ventureIds);
```

**Stale time**: 2 min. **Refetch interval**: 5 min.

#### Venture Detail (`/chairman/ventures/:id`)

```tsx
// useVentureDetail.ts

// 1. Full venture record
const venture = supabase
  .from('ventures')
  .select('*')
  .eq('id', ventureId)
  .single();

// 2. Stage transition history
const transitions = supabase
  .from('venture_stage_transitions')
  .select('*')
  .eq('venture_id', ventureId)
  .order('created_at', { ascending: true });

// 3. Past decisions for this venture
const decisions = supabase
  .from('chairman_decisions')
  .select('*')
  .eq('venture_id', ventureId)
  .order('created_at', { ascending: false })
  .limit(20);
```

#### Vision & Alignment (`/chairman/vision`)

```tsx
// useVisionScores.ts

// 1. HEAL score history (last 30 entries)
const scores = supabase
  .from('eva_vision_scores')
  .select('id, total_score, dimension_scores, threshold_action, scored_at')
  .order('scored_at', { ascending: false })
  .limit(30);

// 2. Active vision document
const visionDoc = supabase
  .from('eva_vision_documents')
  .select('id, vision_key, level, status, extracted_dimensions, version')
  .eq('status', 'active')
  .eq('level', 'L1')
  .single();

// 3. Corrective SDs (open)
const correctiveSDs = supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, status, priority')
  .like('sd_key', 'SD-MAN-FEAT-CORRECTIVE%')
  .neq('status', 'completed')
  .order('created_at', { ascending: false });
```

**Stale time**: 5 min. **Refetch interval**: 10 min.

#### Preferences (`/chairman/preferences`)

```tsx
// useChairmanPreferences.ts

// 1. Chairman settings (resolved with inheritance)
const settings = supabase.rpc('get_chairman_settings', {
  p_company_id: companyId,
  p_venture_id: null, // global
});

// 2. Chairman preferences (key-value pairs)
const preferences = supabase
  .from('chairman_preferences')
  .select('*')
  .order('preference_key');

// 3. Venture-specific overrides
const overrides = supabase
  .from('chairman_preferences')
  .select('*, ventures!inner(name)')
  .not('venture_id', 'is', null)
  .order('preference_key');
```

**Stale time**: 10 min. Manual refresh only.

#### Builder Dashboard (`/builder`)

```tsx
// useBuilderDashboard.ts

// 1. Active SDs
const activeSDs = supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, status, priority, sd_type, parent_sd_id')
  .in('status', ['in_progress', 'ready', 'planning'])
  .order('priority', { ascending: false });

// 2. Recent completions (last 7 days)
const completedSDs = supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, completion_date')
  .eq('status', 'completed')
  .gte('completion_date', sevenDaysAgo)
  .order('completion_date', { ascending: false })
  .limit(10);
```

#### Build Queue (`/builder/queue`)

```tsx
// useBuildQueue.ts
// Visual mirror of `npm run sd:next` — read-only

const queue = supabase
  .from('strategic_directives_v2')
  .select(`
    sd_key, title, status, priority, sd_type,
    parent_sd_id, track, created_at
  `)
  .in('status', ['draft', 'ready', 'planning', 'in_progress'])
  .order('priority', { ascending: false })
  .order('created_at', { ascending: true })
  .limit(50);
```

#### Brainstorm Inbox (`/builder/inbox`)

```tsx
// useBrainstormInbox.ts

const sessions = supabase
  .from('brainstorm_sessions')
  .select(`
    id, domain, topic, mode, stage, outcome_type,
    session_quality_score, crystallization_score,
    created_sd_id, created_at
  `)
  .order('created_at', { ascending: false })
  .limit(30);
```

### 6.3 Mutations

| Action | Hook | RPC / Table | Operation |
|--------|------|-------------|-----------|
| Approve gate | `useDecisionQueue` | `approve_chairman_decision` RPC | See Section 7 |
| Reject gate | `useDecisionQueue` | `reject_chairman_decision` RPC | See Section 7 |
| Park venture | `useDecisionQueue` | `park_venture_decision` RPC | See Section 7 |
| Update preference | `useChairmanPreferences` | `chairman_preferences` | UPSERT |
| Update setting | `useChairmanPreferences` | `chairman_settings` | UPDATE |

All mutations use optimistic updates:
1. Cancel in-flight queries
2. Set optimistic data (remove from list / update status)
3. On error: rollback to previous data
4. On settle: invalidate related query keys

### 6.4 Realtime Subscriptions

```tsx
// In useDecisionQueue.ts — subscribe to new decisions
supabase
  .channel('chairman-decisions-v3')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chairman_decisions',
    filter: 'status=eq.pending'
  }, () => {
    queryClient.invalidateQueries({ queryKey: ['chairman', 'decisions'] });
  })
  .subscribe();
```

| Subscription | Table | Event | Invalidates |
|-------------|-------|-------|-------------|
| New decisions | `chairman_decisions` | INSERT (status=pending) | `['chairman', 'decisions']`, `['chairman', 'briefing']` |
| Decision resolved | `chairman_decisions` | UPDATE | `['chairman', 'decisions']`, `['chairman', 'briefing']` |
| Venture stage change | `venture_stage_transitions` | INSERT | `['chairman', 'ventures']`, `['chairman', 'briefing']` |

---

## 7. Governance API Surface

### 7.1 New RPC Functions

The existing `chairman_decisions` table uses direct `UPDATE` statements for approve/reject/park. This works but lacks:
- Audit trail generation
- Side-effect execution (e.g., unblocking downstream SDs)
- Input validation
- Consistent return format

New RPC functions encapsulate governance actions:

#### `approve_chairman_decision`

```sql
CREATE OR REPLACE FUNCTION approve_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT DEFAULT NULL,
  p_decided_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision RECORD;
  v_result JSONB;
BEGIN
  -- Lock the row
  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found or already resolved'
    );
  END IF;

  -- Update decision
  UPDATE chairman_decisions SET
    decision = CASE
      WHEN lifecycle_stage = 0 THEN 'proceed'
      WHEN lifecycle_stage = 10 THEN 'approve'
      WHEN lifecycle_stage = 22 THEN 'release'
      WHEN lifecycle_stage = 25 THEN 'continue'
      ELSE 'go'
    END,
    status = 'approved',
    rationale = COALESCE(p_rationale, 'Approved by Chairman'),
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'approved'
  );
END;
$$;
```

#### `reject_chairman_decision`

```sql
CREATE OR REPLACE FUNCTION reject_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT,
  p_decided_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision RECORD;
BEGIN
  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found or already resolved'
    );
  END IF;

  UPDATE chairman_decisions SET
    decision = CASE
      WHEN decision_type = 'gate_decision' AND lifecycle_stage IN (3, 5, 13, 23) THEN 'kill'
      ELSE 'no_go'
    END,
    status = 'rejected',
    rationale = p_rationale,
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'rejected'
  );
END;
$$;
```

#### `park_venture_decision`

```sql
CREATE OR REPLACE FUNCTION park_venture_decision(
  p_decision_id UUID,
  p_park_type TEXT,  -- 'blocked' (30d review) | 'nursery' (90d review)
  p_reason TEXT,
  p_decided_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision RECORD;
BEGIN
  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found or already resolved'
    );
  END IF;

  UPDATE chairman_decisions SET
    decision = 'pause',
    status = 'approved', -- parked is a type of resolution
    rationale = p_reason,
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  -- Update venture status based on park type
  IF p_park_type = 'blocked' THEN
    UPDATE ventures SET status = 'paused', updated_at = now()
    WHERE id = v_decision.venture_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'park_type', p_park_type,
    'review_date', CASE
      WHEN p_park_type = 'blocked' THEN (now() + interval '30 days')::date
      WHEN p_park_type = 'nursery' THEN (now() + interval '90 days')::date
    END
  );
END;
$$;
```

### 7.2 RLS Policy Requirements

All v3 routes need authenticated read access. Decision mutations go through `SECURITY DEFINER` RPC functions (bypass RLS).

| Table | Existing RLS? | v3 Need | Action |
|-------|:---:|---------|--------|
| `chairman_decisions` | Yes (`fn_is_chairman()`) | Read + RPC write | Verify SELECT policy works with Supabase auth |
| `chairman_preferences` | Yes (`fn_is_chairman()`) | Full CRUD | No change needed |
| `chairman_settings` | Yes | Read + update | No change needed |
| `ventures` | Yes | Read | No change needed |
| `venture_stage_transitions` | Check | Read | Verify SELECT policy exists |
| `eva_vision_scores` | Check | Read | Verify SELECT policy exists |
| `eva_vision_documents` | Check | Read | Verify SELECT policy exists |
| `lifecycle_stage_config` | Check | Read | Likely public read — verify |
| `strategic_directives_v2` | Check | Read | Verify SELECT for builder views |
| `brainstorm_sessions` | Check | Read | Verify SELECT policy exists |

**Action item**: Run RLS audit query before Phase 1 implementation begins.

---

## 8. Zod Response Validation

### 8.1 Schema Location

New directory: `src/lib/schemas/chairman-v3/`

### 8.2 Schemas

```tsx
// src/lib/schemas/chairman-v3/decisions.ts
import { z } from 'zod';

export const PendingDecisionSchema = z.object({
  id: z.string().uuid(),
  venture_id: z.string().uuid().nullable(),
  venture_name: z.string().nullable(),
  lifecycle_stage: z.number().int().min(0).max(25).nullable(),
  stage_name: z.string().nullable(),
  health_score: z.string().nullable(),
  recommendation: z.string().nullable(),
  decision: z.string().nullable(),
  decision_type: z.string().nullable(),
  status: z.string().nullable(),
  summary: z.string().nullable(),
  brief_data: z.record(z.unknown()).nullable(),
  risks_acknowledged: z.unknown().nullable(),
  created_at: z.string(),
  sla_deadline_at: z.string().nullable(),
  sla_remaining_seconds: z.number().nullable(),
  blocking: z.boolean(),
});

export const DecisionListSchema = z.array(PendingDecisionSchema);

export const RpcResultSchema = z.object({
  success: z.boolean(),
  decision_id: z.string().uuid().optional(),
  venture_id: z.string().uuid().optional(),
  error: z.string().optional(),
});
```

```tsx
// src/lib/schemas/chairman-v3/ventures.ts
import { z } from 'zod';

export const VentureSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  current_lifecycle_stage: z.number().int().min(1).max(25).nullable(),
  status: z.string(),
  health_score: z.number().nullable(),
  health_status: z.string().nullable(),
});

export const VentureListSchema = z.array(VentureSummarySchema);
```

```tsx
// src/lib/schemas/chairman-v3/vision.ts
import { z } from 'zod';

export const VisionScoreSchema = z.object({
  id: z.string().uuid(),
  total_score: z.number().int().min(0).max(100),
  dimension_scores: z.array(z.object({
    dimension: z.string(),
    score: z.number(),
    weight: z.number(),
    reasoning: z.string().optional(),
  })),
  threshold_action: z.enum(['accept', 'minor_sd', 'gap_closure_sd', 'escalate']),
  scored_at: z.string(),
});

export const VisionScoreListSchema = z.array(VisionScoreSchema);
```

### 8.3 Usage Pattern

```tsx
// In hooks — validate then fallback
const result = DecisionListSchema.safeParse(data);
if (!result.success) {
  console.error('[useDecisionQueue] Schema validation failed:', result.error);
  // Return data anyway — log the drift, don't crash
  return data as PendingDecision[];
}
return result.data;
```

---

## 9. Zustand Client State

### 9.1 Store: `chairman-ui`

```tsx
// src/stores/chairman-ui.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChairmanUIStore {
  // Persona
  activePersona: 'chairman' | 'builder';
  setPersona: (persona: 'chairman' | 'builder') => void;
  togglePersona: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Alerts
  alertsPanelOpen: boolean;
  setAlertsPanelOpen: (open: boolean) => void;
  unreadAlertCount: number;
  setUnreadAlertCount: (count: number) => void;
}

export const useChairmanUI = create<ChairmanUIStore>()(
  persist(
    (set) => ({
      activePersona: 'chairman',
      setPersona: (persona) => set({ activePersona: persona }),
      togglePersona: () => set((s) => ({
        activePersona: s.activePersona === 'chairman' ? 'builder' : 'chairman',
      })),

      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      alertsPanelOpen: false,
      setAlertsPanelOpen: (open) => set({ alertsPanelOpen: open }),
      unreadAlertCount: 0,
      setUnreadAlertCount: (count) => set({ unreadAlertCount: count }),
    }),
    {
      name: 'ehg-chairman-ui',
      partialize: (state) => ({
        activePersona: state.activePersona,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
```

**Persisted**: `activePersona`, `sidebarCollapsed` survive page reload.
**Not persisted**: `alertsPanelOpen`, `unreadAlertCount` (transient UI state).

---

## 10. Progressive Disclosure Architecture

### 10.1 Three Layers

| Layer | Where | Component | Data |
|-------|-------|-----------|------|
| **L0: Summary** | Decision Queue list | `DecisionQueue.tsx` card items | View row: title, priority, summary, SLA countdown |
| **L1: Context** | Expanded card OR slide-over Sheet | `GateRenderer.tsx` inside Sheet | View row + `brief_data` JSONB + stage config |
| **L2: Full Detail** | Decision Detail page | `DecisionDetail.tsx` | Full decision record + venture record + stage transitions + artifacts |

### 10.2 "Tell Me More" Flow

1. **L0 → L1**: User clicks "Tell me more" on a decision card. A `Sheet` slides in from the right with gate-specific context (see Section 11). Quick actions available at L1.
2. **L1 → L2**: User clicks "View Full Detail" inside the Sheet. Navigation to `/chairman/decisions/:id`. Full artifact access, audit trail, Claude Code handoff.

### 10.3 Data Loading Strategy

- **L0**: Loaded with the decision queue query (already in cache)
- **L1**: `brief_data` column from the same query row (no additional fetch if present). If `brief_data` is null, fetch from `chairman_decisions` by ID.
- **L2**: Dedicated `useDecisionDetail` hook. Only fires when user navigates to detail page.

---

## 11. Gate-Specific Renderers

### 11.1 Router Component

```tsx
// src/components/chairman-v3/gates/GateRenderer.tsx

interface GateRendererProps {
  decision: PendingDecision;
  venture?: VentureRecord;
  stageConfig?: StageConfigRecord;
}

export function GateRenderer({ decision, venture, stageConfig }: GateRendererProps) {
  const stage = decision.lifecycle_stage;

  if (stage === 0) return <GateRendererStage0 {...props} />;
  if (stage === 10) return <GateRendererStage10 {...props} />;
  if (stage === 22) return <GateRendererStage22 {...props} />;
  if (stage === 25) return <GateRendererStage25 {...props} />;
  if ([3, 5, 13, 23].includes(stage)) return <GateRendererKillGate {...props} />;

  // Fallback: generic gate context
  return <GateRendererGeneric {...props} />;
}
```

### 11.2 Renderer Specifications

#### Stage 0: Venture Routing

Context sections:
1. **Problem & Solution**: `venture.problem_statement`, `venture.solution_approach`
2. **Market & Archetype**: From `brief_data` or venture metadata
3. **Portfolio Synergy**: `venture.portfolio_synergy_score` (0-1 displayed as 0-100)
4. **Chairman Constraints**: 10 strategic filters from `brief_data.constraint_scores` — pass/fail badges
5. **Time Horizon**: `venture.time_horizon_classification`

Actions: [Approve → Stage 1] [Park as Blocked (30d)] [Park as Nursery (90d)]

#### Stage 10: Brand Approval

Context sections:
1. **Brand Genome**: Archetype, values, tone from `venture.brand_variants` or `brief_data`
2. **Naming Candidates**: 5+ candidates with per-criterion weighted scores (horizontal bar chart via Recharts)
3. **Narrative Extension**: Vision, mission, brand voice excerpts
4. **Naming Strategy**: Type classification

Actions: [Approve Top Candidate] [Select Different (dropdown)] [Reject with Rationale]

#### Stage 22: Release Readiness

Context sections:
1. **Release Items**: Feature/bugfix/infra list with status badges
2. **Release Notes**: Preview (rendered markdown)
3. **Build Quality**: Checks from stages 17-21 (pass/fail list)
4. **Target Date**: Sprint retrospective summary

Actions: [Approve Release] [Reject with Rationale] [Hold]

#### Stage 25: Portfolio Review

Context sections:
1. **Review Summary**: Initiative outcomes by category
2. **Vision Drift**: Current vs original comparison from `brief_data`
3. **Financial Comparison**: Projected vs actual (if available)
4. **Health Dimensions**: 5-dimension radar chart or score cards (0-100 each)
5. **Proposed Next Steps**: From `recommendation`

Actions: [Continue] [Pivot] [Expand] [Sunset] [Exit] — each opens rationale input

#### Kill Gates (3, 5, 13, 23)

Context sections:
1. **Health Score vs Threshold**: `health_score` compared to stage threshold (from `lifecycle_stage_config`)
2. **Stage Artifacts Summary**: Brief list of what was produced
3. **Risk Factors**: `risks_acknowledged` array rendered as badges
4. **EVA Recommendation**: `recommendation` field

Actions: [Continue (Override)] [Kill (Terminate)] [Park (Pause for Review)]

---

## 12. Claude Code Integration

### 12.1 ClaudeCodeLink Component

```tsx
// src/components/chairman-v3/shared/ClaudeCodeLink.tsx

function assembleContext(props: ClaudeCodeLinkProps): string {
  return `## Chairman Decision Context

**Venture**: ${props.ventureName} (ID: ${props.ventureId})
**Gate**: Stage ${props.stage} — ${props.gateType}
**Summary**: ${props.summary}

### Data Snapshot
${formatDataSnapshot(props.dataSnapshot)}

### Suggested Action
${props.suggestedAction || 'Review and take appropriate action.'}
`;
}

export function ClaudeCodeLink(props: ClaudeCodeLinkProps) {
  const handleCopy = async () => {
    const context = assembleContext(props);
    await navigator.clipboard.writeText(context);
    toast.success('Copied to clipboard — paste into Claude Code');
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Terminal className="h-4 w-4 mr-2" />
      Open in Claude Code
    </Button>
  );
}
```

### 12.2 Placement

- Decision cards (L0): Small icon button
- Decision Sheet (L1): Full button with label
- Decision Detail (L2): Prominent button with context preview
- Venture Detail: Button for "Investigate in Claude Code"

---

## 13. Notification System

### 13.1 Alert Sources

| Source | Priority | Detection |
|--------|----------|-----------|
| New blocking decision | Critical | Realtime subscription on `chairman_decisions` INSERT |
| SLA approaching (< 2h) | Warning | Computed from `sla_remaining_seconds` in view |
| HEAL score drop | Warning | Compare latest vs previous in `eva_vision_scores` |
| Auto-approve countdown (< 4h) | Info | Computed from `sla_deadline_at` |
| Stage progression | Info | Realtime subscription on `venture_stage_transitions` INSERT |
| SD completion | Info | Poll `strategic_directives_v2` status changes |

### 13.2 Delivery Channels

| Channel | Implementation | Component |
|---------|---------------|-----------|
| **Dashboard badge** | `useChairmanUI.unreadAlertCount` → red dot on sidebar "Alerts" | `ChairmanShell.tsx` sidebar |
| **Browser tab title** | `useEffect` sets `document.title` = `(${count}) Chairman — EHG` | `ChairmanShell.tsx` |
| **sonner toast** | `toast.warning()` for critical alerts while app is open | `useAlerts.ts` |
| **Email digest** | Supabase Edge Function + Resend API, scheduled daily | Separate SD |
| **Push notification** | Web Push API via service worker | PWA SD |

### 13.3 Alert State Hook

```tsx
// src/hooks/chairman-v3/useAlerts.ts

interface Alert {
  id: string;
  type: 'decision' | 'sla' | 'heal' | 'stage' | 'sd';
  priority: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// Derives alerts from existing query caches
// No separate table — computed from decision + venture + vision data
```

---

## 14. Mobile & PWA

### 14.1 Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| `< 768px` (mobile) | Bottom tab bar, full-width content, stacked cards |
| `768px - 1199px` (tablet) | Collapsed sidebar (icon-only), content fills remaining space |
| `>= 1200px` (desktop) | Expanded sidebar + content |

### 14.2 Mobile-Specific Adaptations

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Sidebar | Left sidebar, expandable | Bottom tab bar, 5 items |
| Decision cards | Horizontal layout with side context | Stacked vertical |
| Stage pipeline | Horizontal scroll | Horizontal scroll with larger touch targets |
| Decision actions | Inline buttons | Full-width sticky footer buttons |
| Sheets | Right-side slide-over | Full-screen bottom sheet |
| Tables | Standard table | Card list layout |

### 14.3 PWA Architecture

#### manifest.json

```json
{
  "name": "EHG Chairman",
  "short_name": "Chairman",
  "description": "EHG Venture Factory governance dashboard",
  "start_url": "/chairman",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#1a1a2e",
  "background_color": "#16213e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

#### Service Worker Strategy

Use `vite-plugin-pwa` for Vite integration:

```tsx
// vite.config.ts addition
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        // Cache Supabase API responses for offline briefing
        urlPattern: /^https:\/\/dedlbzhpgkmetvhbkyzq\.supabase\.co\/rest\/v1\/.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'supabase-api',
          expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
        },
      },
    ],
  },
})
```

**Caching strategy**:
- **App shell**: Precache (HTML, JS, CSS, fonts)
- **Supabase API**: StaleWhileRevalidate (show cached data, refresh in background)
- **Images/icons**: Cache-first with 7-day expiry

#### Web Push Notifications

1. **Edge Function**: Triggered by Supabase webhook on `chairman_decisions` INSERT where `status = 'pending'`
2. **Subscription**: Stored in `chairman_push_subscriptions` table (new)
3. **Push payload**: `{ title, body, tag, data: { url } }`
4. **Service worker handler**: `self.addEventListener('notificationclick', ...)` — opens `/chairman/decisions`
5. **Quiet hours**: Edge function checks `chairman_preferences` before sending

#### Install Prompt

Custom install banner shown after 3+ visits (tracked in localStorage). Uses `beforeinstallprompt` event.

---

## 15. Legacy Deprecation

### 15.1 Strategy: Clean Up As We Go

Each implementation SD that creates a new component also:
1. Updates the route file to use the new component
2. Adds redirects from superseded routes
3. Deletes the superseded component file
4. Removes unused imports

### 15.2 Supersession Map

| Old Route | Old Component | New Route | New Component | Cleanup SD |
|-----------|--------------|-----------|---------------|------------|
| `/chairman` | BriefingDashboard | `/chairman` | DailyBriefing | Chairman Views SD |
| `/chairman/overview` | ChairmanOverview | `/chairman` (redirect) | — | Chairman Views SD |
| `/chairman/decisions` | DecisionGateQueue | `/chairman/decisions` | DecisionQueue | Decision System SD |
| `/chairman/portfolio` | VenturesPage | `/chairman/ventures` | VentureLifecycle | Chairman Views SD |
| `/chairman/settings` | ChairmanSettingsPage | `/chairman/preferences` | Preferences | Chairman Views SD |
| `/chairman/escalations/:id` | ChairmanEscalationPage | `/chairman/decisions` (redirect) | — | Decision System SD |
| `/chairman/analytics` | DecisionAnalyticsDashboard | — (removed) | — | Decision System SD |
| `/chairman/risk-review` | ChairmanRiskReviewPage | `/chairman/ventures` (redirect) | — | Chairman Views SD |
| `/chairman/vision` | VisionDashboard | `/chairman/vision` | VisionAlignment | Chairman Views SD |
| `/chairman/governance` | GovernanceOverview | `/chairman` (redirect) | — | Chairman Views SD |
| `/chairman/lifecycle` | VentureLifecycleMap | `/chairman/ventures` (redirect) | — | Chairman Views SD |
| `/chairman/builder` | BuilderViews | `/builder` | BuilderDashboard | Builder Views SD |
| `/chairman/queue` | BuilderViews | `/builder/queue` | BuildQueue | Builder Views SD |
| `/chairman/health` | HealthHeatmapPanel | — (removed, merged into briefing) | — | Foundation SD |
| `/chairman/events` | EventFeedPanel | — (removed, merged into alerts) | — | Foundation SD |

### 15.3 Layout Transition

1. **Phase 1**: New `ChairmanShell` created. New route file (`chairmanRoutesV3.tsx`) registers v3 routes alongside old routes.
2. **Phase 2**: Old route file (`chairmanRoutes.tsx`) entries are replaced one-by-one as new components are built. Each replacement is a PR.
3. **Phase 3**: Old route file deleted. `ChairmanLayoutV3.tsx`, `AttentionQueueSidebar.tsx`, old `MobileTabBar.tsx` deleted. `AuthenticatedLayout` no longer wraps chairman/builder routes.

### 15.4 Existing Components to Preserve/Adapt

| Component | Location | Action |
|-----------|----------|--------|
| `EVAGreeting.tsx` | chairman-v3/ | Reuse in DailyBriefing |
| `QuickStatCard.tsx` | chairman-v3/ | Adapt as MetricCard |
| `StageTimeline.tsx` | chairman-v3/ | Adapt as StagePipeline |
| `TokenBudgetBar.tsx` | chairman-v3/ | Reuse in Preferences if relevant |
| `VisionScoreCard.tsx` | chairman-v3/VisionDashboard/ | Reuse in VisionAlignment |
| `VisionTrendChart.tsx` | chairman-v3/VisionDashboard/ | Reuse in VisionAlignment |
| `DimensionBreakdownPanel.tsx` | chairman-v3/VisionDashboard/ | Reuse in VisionAlignment |
| `CorrectiveSDsTable.tsx` | chairman-v3/VisionDashboard/ | Reuse in VisionAlignment |
| `PersonaToggle.tsx` | chairman-v3/ | Reuse in ChairmanShell top nav |
| `OfflineIndicator.tsx` | chairman-v3/ | Reuse in ChairmanShell |

### 15.5 Existing Hooks Replacement

| Old Hook | New Hook | Action |
|----------|----------|--------|
| `useChairmanDashboardData.ts` | `useChairmanBriefing.ts` | Replace (different data shape) |
| `useChairmanData.ts` | Split across v3 hooks | Deprecate when all consumers migrated |
| `useChairmanConfig.ts` | `useChairmanPreferences.ts` | Evaluate reuse — may carry over |
| `useChairmanOverviewData.ts` | `useChairmanBriefing.ts` | Replace |
| `useDecisionGateQueue.ts` | `useDecisionQueue.ts` (v3) | Carry forward core logic, new return shape |
| `useDecisionQueue.ts` | `useDecisionQueue.ts` (v3) | Merge useful patterns |
| `useVisionDashboardData.ts` | `useVisionScores.ts` | Replace (streamlined query) |
| `useGovernanceData.ts` | Merged into briefing | Deprecate |
| `useBuilderViews.ts` | `useBuilderDashboard.ts` | Replace |
| `useVentureLifecycle.ts` | `useVentureLifecycle.ts` (v3) | Evaluate — may be reusable as-is |
| `useVentureData.ts` | `useVentureDetail.ts` | Replace (different shape) |

---

## 16. Implementation Phases

### Phase Map to Orchestrator SDs

| Phase | Orchestrator SD | Children | Scope |
|-------|----------------|----------|-------|
| **1: Foundation** | Orch-1 | Shell, Routes, Store, Sonner, Zod | ChairmanShell layout, route registration, Zustand store, Zod schemas, sonner standardization |
| **2: Decision System** | Orch-2 | Queue, Detail, Gate Renderers, RPC, ClaudeCodeLink | Decision queue, detail page, 5 gate renderers, progressive disclosure, RPC functions, Claude Code handoff |
| **3: Chairman Views** | Orch-3 | Briefing, Ventures, Vision, Preferences | Daily briefing, venture lifecycle/detail, vision alignment, preferences editor |
| **4: Builder Views** | Orch-4 | Dashboard, Queue, Inbox | Builder dashboard, build queue, brainstorm inbox |
| **5: Notifications & PWA** | Orch-5 | Alerts, Email, PWA, Push | Alert system, tab title badges, email digest edge function, manifest, service worker, web push |

### Phase 1: Foundation

| Child SD | Scope | Dependencies |
|----------|-------|-------------|
| Shell & Layout | `ChairmanShell.tsx`, `BottomTabBar.tsx`, `PersonaToggle.tsx` (new), sidebar items | None |
| Route Registration | `chairmanRoutesV3.tsx`, redirect map, lazy loading setup | Shell |
| Zustand Store | `chairman-ui.ts` store with persona, sidebar, alerts state | None |
| Sonner Standardization | Verify sonner theming, fix `next-themes` import in `sonner.tsx` | None |
| Zod Schemas | `src/lib/schemas/chairman-v3/` with decision, venture, vision schemas | None |
| RLS Audit | Verify all required table SELECT policies work with Supabase auth | None |

### Phase 2: Decision System

| Child SD | Scope | Dependencies |
|----------|-------|-------------|
| Decision Queue View | `DecisionQueue.tsx`, `useDecisionQueue.ts` (v3), queue list with filtering | Foundation complete |
| Decision Detail Page | `DecisionDetail.tsx`, `useDecisionDetail.ts`, full context view | Decision Queue |
| Gate Renderers | `GateRenderer.tsx` + 5 specific renderers (Stage 0, 10, 22, 25, Kill) | Decision Queue |
| RPC Functions | 3 Supabase migrations: `approve_chairman_decision`, `reject_chairman_decision`, `park_venture_decision` | None (DB-only) |
| Decision Actions | `DecisionActions.tsx` with gate-type-specific buttons + rationale input | RPC Functions |
| Progressive Disclosure | Sheet-based L1 view, "Tell me more" flow, L0→L1→L2 navigation | Gate Renderers + Decision Detail |
| Claude Code Link | `ClaudeCodeLink.tsx` component, context assembly per gate type | Decision Detail |

### Phase 3: Chairman Views

| Child SD | Scope | Dependencies |
|----------|-------|-------------|
| Daily Briefing | `DailyBriefing.tsx`, `useChairmanBriefing.ts`, 4 metric cards, decision preview, portfolio pulse, HEAL preview | Foundation + Decision Queue (for decision preview) |
| Venture Lifecycle | `VentureLifecycle.tsx`, `useVentureLifecycle.ts`, pipeline view per venture | Foundation |
| Venture Detail | `VentureDetail.tsx`, `useVentureDetail.ts`, 25-stage timeline, transition history, past decisions | Venture Lifecycle |
| Vision Alignment | `VisionAlignment.tsx`, `useVisionScores.ts`, HEAL trend chart, dimension breakdown, corrective SDs | Foundation |
| Preferences | `Preferences.tsx`, `useChairmanPreferences.ts`, settings editor, venture overrides, notification config | Foundation |

### Phase 4: Builder Views

| Child SD | Scope | Dependencies |
|----------|-------|-------------|
| Builder Dashboard | `BuilderDashboard.tsx`, `useBuilderDashboard.ts`, active SDs + recent completions | Foundation |
| Build Queue | `BuildQueue.tsx`, `useBuildQueue.ts`, prioritized SD pipeline | Foundation |
| Brainstorm Inbox | `BrainstormInbox.tsx`, `useBrainstormInbox.ts`, session list + capture form | Foundation |

### Phase 5: Notifications & PWA

| Child SD | Scope | Dependencies |
|----------|-------|-------------|
| Alert System | `useAlerts.ts`, `AlertPanel.tsx`, sidebar badge, tab title update | Foundation + any view that generates alerts |
| Email Digest | Supabase Edge Function + Resend integration, preference-driven scheduling | Preferences (for config) |
| PWA Shell | `manifest.json`, icons, `vite-plugin-pwa` config, service worker caching | Foundation |
| Push Notifications | Web Push subscription, Edge Function webhook trigger, quiet hours | PWA Shell + Preferences |

---

## 17. Testing Strategy

| Level | Approach | Scope |
|-------|----------|-------|
| **Schema** | Zod `.safeParse()` logs on every Supabase response | All hooks |
| **Component** | Vitest + React Testing Library | Each view component, gate renderers |
| **Hook** | Vitest with MSW (Mock Service Worker) for Supabase mocking | Each data hook |
| **Integration** | Manual testing with real Supabase data | All decision flows (approve/reject/park per gate type) |
| **E2E** | Manual walkthrough of full decision lifecycle | Stage 0 → approve → verify venture proceeds |
| **Mobile** | Chrome DevTools responsive mode + real device | All views at 375px, 768px, 1200px |
| **Accessibility** | Keyboard navigation, focus management, ARIA labels | Shell, decision actions, forms |
| **PWA** | Lighthouse PWA audit | Install, offline, push |

---

## 18. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| RLS policies block reads | Medium | High | Run audit query before Phase 1. Test with auth token in Supabase dashboard. |
| `v_chairman_pending_decisions` view schema changes | Low | Medium | Zod validation catches drift. View is defined in migrations we control. |
| Double-layout during transition confuses users | Medium | Low | v3 routes are new paths (`/builder/*`). Old routes redirect. No ambiguity period. |
| `brief_data` JSONB is empty for most decisions | High | Medium | Gate renderers gracefully handle null brief_data — show available fields, hide empty sections. |
| PWA service worker caching stale data | Medium | Medium | StaleWhileRevalidate strategy. Clear cache on app update. Version cache names. |
| Sonner + next-themes conflict | Low | Low | Fix during Foundation SD. Swap import in sonner.tsx. |
| Large decision queue (50+ items) | Low | Medium | Pagination or virtual scrolling. Initial limit of 50 is sufficient for current scale. |
| Claude Code deep-link API changes | Low | Low | Clipboard-first approach. Deep-link is additive future enhancement. |
| Multiple sessions causing claim conflicts during SD work | Medium | Low | Standard LEO claim system handles this. Each SD is independent. |

---

## Appendix A: Database Quick Reference

### Key Tables

| Table | Primary Use | Key Columns |
|-------|-----------|-------------|
| `chairman_decisions` | Gate decisions | `id`, `venture_id`, `lifecycle_stage`, `decision`, `status`, `decision_type`, `blocking`, `brief_data`, `summary`, `rationale` |
| `chairman_preferences` | Key-value prefs | `chairman_id`, `venture_id`, `preference_key`, `preference_value`, `value_type` |
| `chairman_settings` | Numeric settings | `company_id`, `venture_id`, `risk_tolerance`, `kill_gate_mode`, `exploit_ratio` |
| `ventures` | Core ventures | `id`, `name`, `current_lifecycle_stage`, `status`, `health_score`, `problem_statement`, `brand_variants` |
| `eva_vision_scores` | HEAL scores | `vision_id`, `total_score`, `dimension_scores`, `threshold_action` |
| `eva_vision_documents` | Vision docs | `vision_key`, `level`, `content`, `extracted_dimensions`, `status` |
| `lifecycle_stage_config` | Stage definitions | `stage_number`, `stage_name`, `phase_name`, `work_type`, `advisory_enabled` |
| `venture_stage_transitions` | Stage audit trail | `venture_id`, `from_stage`, `to_stage`, `transition_type`, `handoff_data` |
| `brainstorm_sessions` | Idea inbox | `domain`, `topic`, `outcome_type`, `session_quality_score`, `created_sd_id` |
| `strategic_directives_v2` | SD pipeline | `sd_key`, `title`, `status`, `priority`, `sd_type`, `track` |

### Key Views

| View | Purpose |
|------|---------|
| `v_chairman_pending_decisions` | SLA-sorted pending decisions with venture context, used by decision queue |
| `v_chairman_settings_resolved` | Settings with company → venture inheritance resolved |

### Key RPC Functions

| Function | Purpose |
|----------|---------|
| `fn_is_chairman()` | Auth check — returns boolean |
| `get_chairman_settings(company_id, venture_id)` | Resolved settings with inheritance |
| `approve_chairman_decision(id, rationale)` | **New** — approve with audit trail |
| `reject_chairman_decision(id, rationale)` | **New** — reject with audit trail |
| `park_venture_decision(id, park_type, reason)` | **New** — park (blocked/nursery) |

---

## Appendix B: File Impact Summary

### New Files (created by this rebuild)

| File | Phase |
|------|-------|
| `src/components/chairman-v3/ChairmanShell.tsx` | 1 |
| `src/components/chairman-v3/shared/BottomTabBar.tsx` | 1 |
| `src/components/chairman-v3/shared/MetricCard.tsx` | 1 |
| `src/components/chairman-v3/shared/StagePipeline.tsx` | 1 |
| `src/components/chairman-v3/shared/StaleDataIndicator.tsx` | 1 |
| `src/components/chairman-v3/shared/AlertPanel.tsx` | 5 |
| `src/routes/chairmanRoutesV3.tsx` | 1 |
| `src/stores/chairman-ui.ts` | 1 |
| `src/lib/schemas/chairman-v3/decisions.ts` | 1 |
| `src/lib/schemas/chairman-v3/ventures.ts` | 1 |
| `src/lib/schemas/chairman-v3/vision.ts` | 1 |
| `src/components/chairman-v3/DecisionQueue.tsx` | 2 |
| `src/components/chairman-v3/DecisionDetail.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRenderer.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRendererStage0.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRendererStage10.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRendererStage22.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRendererStage25.tsx` | 2 |
| `src/components/chairman-v3/gates/GateRendererKillGate.tsx` | 2 |
| `src/components/chairman-v3/DailyBriefing.tsx` | 3 |
| `src/components/chairman-v3/VentureLifecycle.tsx` | 3 |
| `src/components/chairman-v3/VentureDetail.tsx` | 3 |
| `src/components/chairman-v3/VisionAlignment.tsx` | 3 |
| `src/components/chairman-v3/Preferences.tsx` | 3 |
| `src/components/chairman-v3/builder/BuilderDashboard.tsx` | 4 |
| `src/components/chairman-v3/builder/BuildQueue.tsx` | 4 |
| `src/components/chairman-v3/builder/BrainstormInbox.tsx` | 4 |
| `src/hooks/chairman-v3/useChairmanBriefing.ts` | 3 |
| `src/hooks/chairman-v3/useDecisionQueue.ts` | 2 |
| `src/hooks/chairman-v3/useDecisionDetail.ts` | 2 |
| `src/hooks/chairman-v3/useVentureLifecycle.ts` | 3 |
| `src/hooks/chairman-v3/useVentureDetail.ts` | 3 |
| `src/hooks/chairman-v3/useVisionScores.ts` | 3 |
| `src/hooks/chairman-v3/useChairmanPreferences.ts` | 3 |
| `src/hooks/chairman-v3/useBuilderDashboard.ts` | 4 |
| `src/hooks/chairman-v3/useBuildQueue.ts` | 4 |
| `src/hooks/chairman-v3/useBrainstormInbox.ts` | 4 |
| `src/hooks/chairman-v3/useAlerts.ts` | 5 |
| `public/manifest.json` | 5 |
| `public/sw.js` (generated by vite-plugin-pwa) | 5 |
| Supabase migration: `approve_chairman_decision` | 2 |
| Supabase migration: `reject_chairman_decision` | 2 |
| Supabase migration: `park_venture_decision` | 2 |

### Files to Delete (after replacement)

| File | When |
|------|------|
| `src/routes/chairmanRoutes.tsx` | After all routes migrated |
| `src/components/chairman-v3/ChairmanLayoutV3.tsx` | After ChairmanShell is stable |
| `src/components/chairman-v3/AttentionQueueSidebar.tsx` | After AlertPanel replaces it |
| `src/components/chairman-v3/MobileTabBar.tsx` (old) | After BottomTabBar replaces it |
| `src/components/chairman-v3/ChairmanOverview.tsx` | After DailyBriefing replaces it |
| `src/components/chairman-v3/BriefingDashboard.tsx` | After DailyBriefing replaces it |
| `src/components/chairman-v3/DecisionGateQueue.tsx` | After DecisionQueue replaces it |
| `src/components/chairman-v3/DecisionGateDetailSheet.tsx` | After DecisionDetail replaces it |
| `src/components/chairman-v3/DecisionGateActions.tsx` | After DecisionActions replaces it |
| `src/components/chairman-v3/DecisionStack.tsx` | After DecisionQueue replaces it |
| `src/components/chairman-v3/BuilderViews.tsx` | After builder/ directory replaces it |
| `src/hooks/useChairmanDashboardData.ts` | After useChairmanBriefing replaces it |
| `src/hooks/useChairmanOverviewData.ts` | After useChairmanBriefing replaces it |
| `src/hooks/useDecisionGateQueue.ts` | After v3 useDecisionQueue replaces it |
| `src/hooks/useDecisionQueue.ts` | After v3 useDecisionQueue replaces it |
