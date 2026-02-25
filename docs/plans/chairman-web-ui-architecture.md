# Chairman Web UI — Architecture Plan

**Version**: 1.0.0
**Date**: 2026-02-25
**Status**: Draft
**Companion**: `docs/plans/chairman-web-ui-vision.md`

---

## 1. Overview

This document defines the technical architecture for the Chairman Web UI: a focused governance and portfolio management interface built as new route groups in the existing EHG app (`rickfelix/ehg`).

---

## 2. Repository & Stack

### 2.1 Repo: `rickfelix/ehg`

**Rationale** (from tradeoff matrix, weighted score 7.65/10):
- Auth (Supabase Auth) already wired
- Supabase client configured
- Shadcn UI + Tailwind + Vite + React + TypeScript proven
- Zero migration effort — add new route groups

### 2.2 Tech Stack (inherited)

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | React | ^18.3.1 | Existing |
| Build | Vite | Existing | Existing |
| Language | TypeScript | Existing | Existing |
| UI Components | Shadcn UI | Existing | Card, Table, Badge, Button, Sheet, Tabs |
| Styling | Tailwind CSS | Existing | Responsive utilities for mobile |
| Data | @supabase/supabase-js | ^2.56.0 | Existing — Supabase client |
| Auth | Supabase Auth | Existing | `ProtectedRoute` + `ProtectedRouteWrapper` |
| State (server) | @tanstack/react-query | **^5.83.0** | **v5 API** — must use `{ queryKey, queryFn }` object syntax |
| State (client) | zustand | ^5.0.8 | Existing — use for persona toggle, sidebar collapse, alert state |
| Routing | react-router-dom | ^6.30.1 | Existing |
| Charts | Recharts | ^2.15.4 | HEAL score trends, health visualizations |
| Animation | framer-motion | ^11.18.2 | Existing — use for view transitions, card entrances |
| Validation | zod | ^3.25.76 | Existing — use for RPC response validation |
| Toasts | sonner | ^1.7.4 | **Primary toast system** for chairman-v3 (see Section 2.4) |
| Theme | Custom ThemeProvider | Existing | **Not** `next-themes` (see Section 2.5) |
| Hosting | Vercel | Existing | HTTPS, edge CDN |

### 2.3 New Dependencies

None required. The existing stack covers all needs.

### 2.4 Toast System Decision

Two toast systems coexist in the EHG app:

| System | Package | Usage |
|--------|---------|-------|
| **sonner** | `sonner ^1.7.4` | Programmatic transient toasts (`toast.success()`, `toast.error()`) |
| **Radix toast** | `@radix-ui/react-toast ^1.2.14` | Shadcn `useToast()` hook — persistent/actionable toasts |

**Decision for chairman-v3**: Standardize on **sonner** exclusively.
- Simpler API (`toast()` function vs. hook + imperative handle)
- Already themed via `src/components/ui/sonner.tsx`
- Use for: decision confirmations, error messages, alert dismissals
- Do NOT import `use-toast.ts` (Radix-based) in any v3 component

### 2.5 Theme System Decision

Two theme providers coexist:

| Provider | Location | Used By |
|----------|----------|---------|
| Custom `ThemeProvider` | `src/components/theme/ThemeProvider.tsx` | App-wide — stores in `localStorage('ehg-ui-theme')` |
| `next-themes` | `next-themes ^0.3.0` | Only `sonner.tsx` imports `useTheme` from `next-themes` |

**Decision for chairman-v3**: Use the **custom ThemeProvider** exclusively.
- All v3 components import `useTheme` from `src/components/theme/ThemeProvider`
- Fix `sonner.tsx` to use the custom provider instead of `next-themes` (Phase 5 cleanup)
- Two toggle components exist (`ThemeToggle.tsx` and `DarkModeToggle.tsx`) — pick one for ChairmanShell, delete the other in Phase 5

### 2.6 React Query v5 Conventions

All chairman-v3 hooks must follow the v5 API:

```tsx
// CORRECT (v5)
const { data, isLoading } = useQuery({
  queryKey: ['chairman', 'decisions', 'pending'],
  queryFn: () => supabase.from('chairman_decisions').select('*').eq('status', 'pending'),
  staleTime: 60_000,
  refetchInterval: 60_000,
});

// WRONG (v4 shorthand — will not compile)
const { data } = useQuery(['decisions'], fetchDecisions);
```

**Query key conventions for chairman-v3:**
- Prefix all keys with `['chairman', ...]` or `['builder', ...]` by persona
- Include filter params in keys: `['chairman', 'decisions', { status: 'pending' }]`
- Mutations use `useMutation` with `onSuccess` invalidation of related query keys

---

## 3. Legacy Deprecation Plan

### 3.1 Existing Chairman Pages (to be superseded)

The current EHG app has 10+ chairman routes built across multiple SDs. These are **not deleted immediately** but are superseded by the new views:

| Existing Route | Existing Component | Superseded By | Deprecation Action |
|---|---|---|---|
| `/chairman` | BriefingDashboard | `/chairman` (new Daily Briefing) | Replace — same route, new component |
| `/chairman/overview` | ChairmanOverview | `/chairman` (new Daily Briefing) | Remove route |
| `/chairman/decisions` | DecisionsInbox | `/chairman/decisions` (new Decision Queue) | Replace — same route, new component |
| `/chairman/settings` | ChairmanSettingsPage | `/chairman/preferences` (new) | Redirect old → new |
| `/chairman/escalations` | ChairmanEscalationPage | `/chairman/decisions` (merged into queue) | Remove route |
| `/chairman/analytics` | DecisionAnalyticsDashboard | Future enhancement or remove | Keep temporarily |
| `/chairman/risk-review` | ChairmanRiskReviewPage | `/chairman/ventures` (merged into lifecycle) | Remove route |
| `/chairman/vision` | VisionDashboard | `/chairman/vision` (new, streamlined) | Replace — same route, new component |
| `/chairman/governance` | GovernanceOverview | `/chairman` (merged into briefing) | Remove route |
| `/chairman/okr-analytics` | OKRAnalyticsPage | Future enhancement or remove | Keep temporarily |

### 3.2 Layout Wrapping Inconsistency

The existing chairman routes have an inconsistent layout pattern — 4 routes bypass `ChairmanLayoutV2`:

| Route | Has Layout Wrapper? |
|-------|-------------------|
| `/chairman/settings` | No |
| `/chairman/escalations/:id` | No |
| `/chairman/analytics` | No |
| `/chairman/okr-analytics` | No |

**Impact on deprecation**: Routes without the layout wrapper may have standalone styling/navigation that needs separate handling during swap. All v3 routes use `ChairmanShell` uniformly — no exceptions.

### 3.3 Deprecation Strategy

**Phase 1**: Build new components alongside existing ones. New routes use a `v3/` component directory.
**Phase 2**: Once new views are stable (2+ weeks daily use), swap route definitions to point to new components.
**Phase 3**: Delete old components, remove unused routes. Target: 5 chairman routes (briefing, decisions, ventures, vision, preferences) + 3 builder routes (dashboard, queue, inbox).

### 3.4 Existing Components to Reuse

Some existing chairman-v2 components are well-built and should be preserved or adapted:

| Component | Reuse Strategy |
|-----------|---------------|
| `StageTimeline` | Adapt for venture lifecycle view |
| `TokenBudgetBar` | Reuse in preferences view |
| `EVAGreeting` | Reuse in daily briefing |
| `QuickStatCard` | Reuse for summary metrics |
| `DecisionStack` | Adapt for new decision queue (core logic is solid) |

### 3.5 Existing Hooks to Evaluate

5 chairman-specific hooks already exist in `src/hooks/` (flat directory):

| Existing Hook | v3 Replacement | Action |
|--------------|----------------|--------|
| `useChairmanDashboardData.ts` | `useChairmanBriefing.ts` | Replace — different data shape |
| `useChairmanData.ts` | Split across multiple v3 hooks | Deprecate |
| `useChairmanConfig.ts` | `useChairmanPreferences.ts` | Evaluate — may be reusable |
| `useChairmanOverviewData.ts` | `useChairmanBriefing.ts` | Replace |
| `useChairmanFeedbackService.ts` | No v3 equivalent | Keep if still used elsewhere |
| `useDecisionQueue.ts` | `useDecisionQueue.ts` (v3) | Evaluate — core logic may carry over |
| `useVisionDashboardData.ts` | `useVisionScores.ts` | Replace — streamline query |
| `useGovernanceData.ts` | Merged into briefing/lifecycle | Deprecate |
| `useStrategicGovernance.ts` | No direct equivalent | Deprecate if only used by old routes |
| `useOKRScorecard.ts` | Future enhancement | Keep temporarily |

**Strategy**: During Phase 1, read each existing hook before writing its replacement. Carry forward well-tested query logic; replace the shape and caching strategy.

---

## 4. Route Structure

### 4.1 New Route Groups

```
/chairman                    → Daily Briefing (landing)
/chairman/decisions          → Decision Queue (blocking gates)
/chairman/decisions/:id      → Decision Detail (full context for one gate)
/chairman/ventures           → Venture Lifecycle Map
/chairman/ventures/:id       → Single Venture Detail (25-stage view)
/chairman/vision             → Vision & Alignment (HEAL scores)
/chairman/preferences        → Chairman Preferences

/builder                     → Builder Dashboard (Active SDs)
/builder/queue               → Build Queue (SD pipeline)
/builder/inbox               → Brainstorm Inbox
```

### 4.2 Route File

New file: `src/routes/chairmanRoutesV3.tsx` (coexists with existing during transition)

### 4.3 Layout

New layout component: `src/components/chairman-v3/ChairmanShell.tsx`

```
┌─────────────────────────────────────────────────┐
│  EHG  [Chairman ▼]  [Builder]        [⚙️] [👤]  │  ← Top nav with persona toggle
├──────────┬──────────────────────────────────────┤
│ Briefing │                                      │
│ Decisions│         Main Content Area            │
│ Ventures │                                      │
│ Vision   │                                      │
│ Prefs    │                                      │
│──────────│                                      │
│ ── or ── │                                      │
│ Active   │                                      │
│ Queue    │                                      │
│ Inbox    │                                      │
├──────────┴──────────────────────────────────────┤
│  [Alerts sidebar / toast area]                  │
└─────────────────────────────────────────────────┘
```

**Mobile**: Sidebar collapses to bottom tab bar (5 tabs for active persona).

---

## 5. Component Architecture

### 5.1 Directory Structure

```
src/components/chairman-v3/
  ChairmanShell.tsx          # Layout with sidebar + persona toggle
  DailyBriefing.tsx          # Landing page
  DecisionQueue.tsx          # List of pending blocking decisions
  DecisionDetail.tsx         # Full context for one decision
  VentureLifecycle.tsx       # All ventures with stage indicators
  VentureDetail.tsx          # Single venture 25-stage view
  VisionAlignment.tsx        # HEAL scores + drift
  Preferences.tsx            # Chairman preference editor

  builder/
    BuilderDashboard.tsx     # Active SDs overview
    BuildQueue.tsx           # Prioritized SD pipeline
    BrainstormInbox.tsx      # Brainstorm capture + history

  shared/
    AlertToast.tsx           # Notification toasts
    StageIndicator.tsx       # Small stage badge (reusable)
    HealthScore.tsx          # Color-coded 0-100 score display
    ClaudeCodeLink.tsx       # "Open in Claude Code" button with context assembly
    DecisionActions.tsx      # Approve/Reject/Park button group
```

### 5.2 Key Shared Components

**ClaudeCodeLink**: Assembles context and provides clipboard copy or deep-link.

```tsx
interface ClaudeCodeLinkProps {
  ventureId: string;
  context: string;      // Pre-formatted prompt context
  action?: string;      // Suggested action for Claude Code
}
```

**DecisionActions**: Standardized approve/reject/park interface with confirmation.

```tsx
interface DecisionActionsProps {
  decisionId: string;
  gateType: 'stage0' | 'stage10' | 'stage22' | 'stage25';
  onDecision: (decision: string, rationale?: string) => void;
}
```

### 5.3 Error Boundary Strategy

The EHG app has a mature error boundary hierarchy. Chairman-v3 reuses it:

| Boundary | Component | Usage in v3 |
|----------|-----------|-------------|
| App-level | `GlobalErrorBoundary` | Already wraps entire app — no change |
| Route-level | `RouteErrorBoundary` | Wrap each v3 route in `chairmanRoutesV3.tsx` |
| Component-level | `ComponentErrorBoundary` | Wrap data-dependent sections (HEAL chart, venture list) |
| Protected route | `ProtectedRouteWrapper` | Use for all v3 routes — provides `Suspense` + `loadingMessage` |
| Lazy loading | `LazyRoute` | Use for code-splitting v3 views |

**Pattern for v3 routes:**
```tsx
<Route path="/chairman" element={
  <ProtectedRouteWrapper loadingMessage="Loading briefing...">
    <LazyRoute component={() => import('./components/chairman-v3/DailyBriefing')} />
  </ProtectedRouteWrapper>
} errorElement={<RouteErrorBoundary />} />
```

### 5.4 Client State (Zustand)

UI-only state that does not belong in React Query:

```tsx
// src/stores/chairman-ui.ts
interface ChairmanUIStore {
  activePersona: 'chairman' | 'builder';
  sidebarCollapsed: boolean;
  alertsOpen: boolean;
  togglePersona: () => void;
  toggleSidebar: () => void;
  toggleAlerts: () => void;
}
```

- Persisted to `localStorage` via Zustand `persist` middleware
- Persona preference survives page reload
- Sidebar collapse state survives navigation

### 5.5 View Transitions (Framer Motion)

Use `framer-motion` for polish — keep animations subtle and fast:

| Transition | Animation | Duration |
|------------|-----------|----------|
| View mount | Fade in + slide up 8px | 200ms |
| Decision card enter | Stagger children 50ms | 150ms each |
| Persona toggle | Crossfade sidebar items | 250ms |
| Alert toast | Slide in from right | 200ms |
| Modal (reject rationale) | Scale from 0.95 + fade | 200ms |

**Rule**: No animation > 300ms. No spring physics (too playful for a governance tool).

### 5.6 RPC Response Validation (Zod)

Validate Supabase RPC responses at runtime to catch schema drift:

```tsx
// src/lib/schemas/chairman.ts
import { z } from 'zod';

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  venture_id: z.string().uuid(),
  lifecycle_stage: z.number(),
  status: z.enum(['pending', 'approved', 'rejected']),
  decision: z.enum(['proceed', 'reject', 'park']).nullable(),
  summary: z.string(),
  rationale: z.string().nullable(),
  created_at: z.string(),
});

export const ApproveResponseSchema = z.object({
  success: z.boolean(),
  decision_id: z.string().uuid(),
  new_status: z.string(),
});
```

Use `.safeParse()` in hooks — log validation failures, display graceful fallback rather than crash.

---

## 6. Data Layer

### 6.1 Supabase Queries by View

#### Daily Briefing (`/chairman`)
```sql
-- Pending decisions count
SELECT count(*) FROM chairman_decisions WHERE status = 'pending';

-- Active ventures summary
SELECT id, name, current_lifecycle_stage, status, metadata
FROM ventures WHERE status = 'active';

-- Latest HEAL scores
SELECT * FROM vision_scores
ORDER BY created_at DESC LIMIT 1;

-- Recent SD completions (last 7 days)
SELECT sd_key, title, status, completion_date
FROM strategic_directives_v2
WHERE status = 'completed' AND completion_date > NOW() - INTERVAL '7 days';
```

#### Decision Queue (`/chairman/decisions`)
```sql
-- All pending blocking decisions with venture context
SELECT cd.*, v.name as venture_name, v.current_lifecycle_stage
FROM chairman_decisions cd
LEFT JOIN ventures v ON cd.venture_id = v.id
WHERE cd.status = 'pending'
ORDER BY cd.created_at ASC;
```

#### Decision Detail (`/chairman/decisions/:id`)
```sql
-- Decision with full brief data
SELECT * FROM chairman_decisions WHERE id = :id;

-- Related venture artifacts for context
SELECT * FROM venture_artifacts
WHERE venture_id = :ventureId AND is_current = true
ORDER BY lifecycle_stage DESC;
```

#### Venture Lifecycle (`/chairman/ventures`)
```sql
-- All active ventures with latest stage artifact
SELECT v.*,
  (SELECT max(lifecycle_stage) FROM venture_artifacts
   WHERE venture_id = v.id AND is_current = true) as latest_stage
FROM ventures v WHERE v.status = 'active'
ORDER BY v.name;
```

#### Vision & Alignment (`/chairman/vision`)
```sql
-- HEAL score history (last 30 entries)
SELECT * FROM vision_scores ORDER BY created_at DESC LIMIT 30;

-- Dimension breakdown for latest score
SELECT * FROM vision_score_dimensions
WHERE score_id = :latestScoreId;

-- Corrective SDs
SELECT sd_key, title, status FROM strategic_directives_v2
WHERE sd_key LIKE 'SD-MAN-FEAT-CORRECTIVE%' AND status != 'completed'
ORDER BY created_at DESC;
```

#### Preferences (`/chairman/preferences`)
```sql
-- All global preferences (venture_id IS NULL)
SELECT * FROM chairman_preferences
WHERE venture_id IS NULL
ORDER BY preference_key;

-- Venture-specific overrides
SELECT cp.*, v.name as venture_name
FROM chairman_preferences cp
LEFT JOIN ventures v ON cp.venture_id = v.id
WHERE cp.venture_id IS NOT NULL
ORDER BY v.name, cp.preference_key;
```

#### Builder Dashboard (`/builder`)
```sql
-- Active SDs with phase info
SELECT sd.sd_key, sd.title, sd.status, sd.priority,
  h.phase, h.status as phase_status
FROM strategic_directives_v2 sd
LEFT JOIN sd_phase_handoffs h ON h.sd_id = sd.id
WHERE sd.status IN ('in_progress', 'ready', 'planning')
ORDER BY sd.priority DESC, sd.created_at;
```

### 6.2 React Query Hooks

```
src/hooks/chairman-v3/
  useChairmanBriefing.ts     # Combines pending count + ventures + HEAL
  useDecisionQueue.ts        # Pending blocking decisions
  useDecisionDetail.ts       # Single decision with artifacts
  useVentureLifecycle.ts     # All ventures with stage info
  useVisionScores.ts         # HEAL history + dimensions
  useChairmanPreferences.ts  # Preferences CRUD
  useBuilderSDs.ts           # Active SDs for builder view
  useBuildQueue.ts           # SD pipeline
  useBrainstormInbox.ts      # Brainstorm sessions
```

### 6.3 Mutations

| Action | Table | Operation |
|--------|-------|-----------|
| Approve gate | chairman_decisions | UPDATE status='approved', decision='proceed' |
| Reject gate | chairman_decisions | UPDATE status='rejected', decision='reject', rationale=... |
| Park venture | chairman_decisions + venture_nursery | UPDATE + INSERT |
| Update preference | chairman_preferences | UPSERT |
| Override score | chairman_overrides | INSERT |

### 6.4 Real-Time (Phase 2+)

```ts
// Supabase realtime subscription for decision queue updates
supabase
  .channel('chairman-decisions')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'chairman_decisions',
    filter: 'status=eq.pending'
  }, handleDecisionChange)
  .subscribe();
```

**Phase 1**: Polling with react-query `refetchInterval: 60000` (1 min)
**Phase 2+**: Supabase Realtime for instant updates

---

## 7. Governance API Surface

### 7.1 New RPC Functions Needed

The UI needs clean API boundaries for decision actions. These should be Supabase RPC functions (not direct table writes) for audit safety:

```sql
-- Approve a blocking gate decision
CREATE OR REPLACE FUNCTION approve_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT DEFAULT NULL
) RETURNS JSONB AS $$ ... $$;

-- Reject a blocking gate decision
CREATE OR REPLACE FUNCTION reject_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT
) RETURNS JSONB AS $$ ... $$;

-- Park a venture (Stage 0 routing)
CREATE OR REPLACE FUNCTION park_venture_decision(
  p_decision_id UUID,
  p_park_type TEXT,  -- 'blocked' | 'nursery'
  p_reason TEXT
) RETURNS JSONB AS $$ ... $$;

-- Override a score
CREATE OR REPLACE FUNCTION chairman_score_override(
  p_venture_id UUID,
  p_component TEXT,
  p_system_score NUMERIC,
  p_override_score NUMERIC,
  p_reason TEXT
) RETURNS JSONB AS $$ ... $$;
```

### 7.2 RLS Policy Requirements

| Table | Policy Needed | Notes |
|-------|--------------|-------|
| chairman_decisions | SELECT for authenticated | Read all decisions |
| chairman_decisions | UPDATE for authenticated | Only status, decision, rationale fields |
| chairman_preferences | SELECT, INSERT, UPDATE, DELETE for authenticated | Full CRUD |
| chairman_overrides | SELECT, INSERT for authenticated | Insert new, read history |
| ventures | SELECT for authenticated | Read all ventures |
| venture_artifacts | SELECT for authenticated | Read artifacts for context |
| vision_scores | SELECT for authenticated | Read HEAL scores |
| vision_score_dimensions | SELECT for authenticated | Read score breakdowns |
| strategic_directives_v2 | SELECT for authenticated | Read SD queue |
| brainstorm_sessions | SELECT for authenticated | Read brainstorm history |

**Action item**: Audit existing RLS policies before building any views.

---

## 8. Claude Code Remote Context Protocol

### 8.1 Context Assembly

When the user clicks "Open in Claude Code," the UI assembles a structured context block:

```typescript
interface ClaudeCodeContext {
  type: 'gate_decision' | 'venture_review' | 'corrective_action';
  ventureId: string;
  ventureName: string;
  stage?: number;
  summary: string;         // 2-3 sentence human-readable summary
  suggestedAction?: string; // "Review HEAL drift and consider corrective SD"
  dataSnapshot: Record<string, unknown>; // Relevant data for context
}
```

### 8.2 Handoff Options

1. **Clipboard copy** (MVP): Format as markdown prompt, copy to clipboard, user pastes into Claude Code
2. **URL scheme** (future): If Anthropic provides deep-link support for Claude Code sessions
3. **`claude --remote` CLI** (future): Programmatic session creation via API

---

## 9. Mobile Considerations (Phase C responsive, Phase D PWA)

### 9.1 Phase C: Responsive Layout

- Sidebar → bottom tab bar on mobile (5 tabs)
- Decision cards stack vertically
- Venture lifecycle → horizontal scroll with stage pills
- Tables → card layout on mobile
- "Open in Claude Code" → opens Claude iOS/Android app

### 9.2 Phase D: PWA Additions

```json
// manifest.json
{
  "name": "EHG Chairman",
  "short_name": "Chairman",
  "start_url": "/chairman",
  "display": "standalone",
  "theme_color": "#1a1a2e",
  "background_color": "#16213e"
}
```

- Service worker: Cache briefing data for offline reading
- Web Push: Notify on new blocking decisions via Supabase Edge Function → Web Push API
- Install prompt: Show after 3+ visits

---

## 10. Implementation Phases

### Phase 1: Read-Only Dashboard (8-12h)

| Task | Est. |
|------|------|
| Create `chairman-v3/` component directory | 0.5h |
| ChairmanShell layout with sidebar + persona toggle | 2h |
| DailyBriefing view (pending count, venture summary, HEAL) | 2h |
| VentureLifecycle view (all ventures, stage indicators) | 2h |
| VisionAlignment view (HEAL scores, drift) | 2h |
| BuilderDashboard + BuildQueue (read-only) | 2h |
| Route registration + responsive testing | 1h |

### Phase 2: Decision Gates (6-10h)

| Task | Est. |
|------|------|
| DecisionQueue list view | 2h |
| DecisionDetail with gate-specific context rendering | 3h |
| DecisionActions component (approve/reject/park) | 2h |
| RPC functions for decision mutations | 1.5h |
| RLS policy audit + fixes | 1.5h |

### Phase 3: PWA Shell (4-6h)

| Task | Est. |
|------|------|
| manifest.json + icons | 1h |
| Service worker (Vite PWA plugin) | 2h |
| Mobile-specific layout refinements | 1.5h |
| Push notification setup (Edge Function + Web Push) | 1.5h |

### Phase 4: Claude Code Remote (2-4h)

| Task | Est. |
|------|------|
| ClaudeCodeLink component | 1h |
| Context assembly logic per gate type | 1.5h |
| Clipboard + deep-link integration | 1h |

### Phase 5: Legacy Cleanup (2-4h)

| Task | Est. |
|------|------|
| Swap chairman routes to v3 components | 1h |
| Delete superseded components | 1h |
| Update navigation + remove dead routes | 1h |
| Verify no broken links/imports | 1h |

**Total estimated: 22-36h across 5 phases**

---

## 11. Testing Strategy

| Level | Approach |
|-------|----------|
| Component | Vitest + React Testing Library for each view |
| Integration | Supabase query validation with test data |
| E2E | Manual testing of all 4 decision flows |
| Mobile | Browser DevTools responsive mode + real device |
| Accessibility | Keyboard navigation, screen reader basics |

---

## 12. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| RLS policies block reads | Audit before Phase 1; use service role key in dev, auth key in prod |
| Existing routes conflict | v3 components coexist; swap only when stable |
| Low adoption (Challenger concern) | Track daily opens; if < 3/week after 2 weeks, reassess |
| Claude Code Remote API changes | Clipboard-first approach; URL scheme is additive |
| Scope creep into builder execution | Vision doc Section 8 "What This UI Is NOT" — enforce boundary |
