<!-- Archived from: docs/plans/portfolio-balance-venture-prioritization-architecture.md -->
<!-- SD Key: SD-LEO-FEAT-PORTFOLIO-BALANCE-SYSTEM-001 -->
<!-- Archived at: 2026-03-13T13:13:03.032Z -->

# Architecture Plan: Portfolio-Based Venture Prioritization & Balance System

## Stack & Repository Decisions
- **Repository**: `rickfelix/ehg` (EHG app — React + Vite + TypeScript + Shadcn UI + Tailwind + Recharts)
- **Backend**: Supabase (existing) — schema migration + RPC function for portfolio metrics
- **No new dependencies** — Recharts already available for charts, Shadcn UI for components
- **Engineer repo** (`EHG_Engineer`): LEO scripts for classification automation if needed

## Legacy Deprecation Plan
- **Demo portfolios**: The 4 industry-vertical portfolios (HealthTech, FinTech, GreenTech, RetailTech) and their parent companies should be soft-archived. Mark with `is_demo = true` if not already set. Do NOT delete — they may have FK references.
- **Existing `PortfolioSummary` component**: Keep as-is. The new `PortfolioBalanceTab` is a sibling, not a replacement. `PortfolioSummary` shows stage distribution; `PortfolioBalanceTab` shows strategy allocation.
- **`ventures.time_horizon_classification`**: Keep this column. It's complementary to `growth_strategy` (time horizon = when, strategy = what role it plays in the portfolio).

## Route & Component Structure

### Routes
No new routes needed. Portfolio Balance is a new tab on the existing `/chairman/vision` route (`VisionAlignmentPage`).

### Component Hierarchy
```
VisionAlignmentPage (existing)
  └── Tabs (existing — add 5th tab)
      ├── TabsTrigger value="portfolio"    ← NEW
      └── TabsContent value="portfolio"    ← NEW
          └── PortfolioBalanceTab           ← NEW
              ├── StrategyAllocationCards    ← NEW (3 cards: Cash Engine, Capability Builder, Moonshot)
              ├── GapAlertBanner            ← NEW (shown when any bucket is empty)
              ├── CapabilityFlowDiagram      ← NEW (Phase 2, show cross-venture capability sharing)
              └── VenturesByStrategy         ← NEW (grouped venture list with reclassification)
```

### New Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `PortfolioBalanceTab` | `src/components/chairman-v3/PortfolioBalance/PortfolioBalanceTab.tsx` | Container for the portfolio balance view |
| `StrategyAllocationCards` | `src/components/chairman-v3/PortfolioBalance/StrategyAllocationCards.tsx` | Three cards showing count, percentage, and progress bar per strategy type |
| `GapAlertBanner` | `src/components/chairman-v3/PortfolioBalance/GapAlertBanner.tsx` | Warning banner when a strategy bucket has zero ventures |
| `VenturesByStrategy` | `src/components/chairman-v3/PortfolioBalance/VenturesByStrategy.tsx` | Grouped venture list with strategy badges and reclassification dropdown |

## Data Layer

### Schema Migration

```sql
-- Add growth_strategy enum and column to ventures
CREATE TYPE growth_strategy_type AS ENUM ('cash_engine', 'capability_builder', 'moonshot');

ALTER TABLE ventures
  ADD COLUMN growth_strategy growth_strategy_type;

-- Index for portfolio balance queries
CREATE INDEX idx_ventures_growth_strategy ON ventures (growth_strategy)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Optional: Add strategy description to help Chairman during classification
COMMENT ON COLUMN ventures.growth_strategy IS
  'Portfolio growth strategy classification: cash_engine (proven revenue), capability_builder (reusable tech/business capabilities), moonshot (high risk/high ceiling)';
```

### Queries

**Portfolio balance metrics** (Supabase RPC or inline query):
```sql
SELECT
  growth_strategy,
  COUNT(*) as venture_count,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1) as percentage,
  ARRAY_AGG(json_build_object('id', id, 'name', name, 'status', status)) as ventures
FROM ventures
WHERE status = 'active'
  AND deleted_at IS NULL
  AND growth_strategy IS NOT NULL
GROUP BY growth_strategy;
```

**Unclassified ventures**:
```sql
SELECT id, name, status
FROM ventures
WHERE status = 'active'
  AND deleted_at IS NULL
  AND growth_strategy IS NULL;
```

**Capability flow** (Phase 2 — cross-venture capability sharing):
```sql
SELECT
  v.name as venture_name,
  v.growth_strategy,
  sc.capability_key,
  sc.capability_type,
  sc.name as capability_name
FROM sd_capabilities sc
JOIN strategic_directives_v2 sd ON sd.uuid_id = sc.sd_uuid
JOIN ventures v ON v.id = sd.venture_id  -- need to verify this FK path
WHERE v.status = 'active'
ORDER BY v.growth_strategy, sc.capability_key;
```

### RLS
- Existing venture RLS policies apply — no new policies needed
- The `growth_strategy` column is readable by authenticated users (same as other venture fields)
- Write access: Chairman only (existing company_admin check)

### React Query Hook
```typescript
// src/hooks/usePortfolioBalance.ts
export function usePortfolioBalance(companyId: string) {
  return useQuery({
    queryKey: ['portfolio-balance', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventures')
        .select('id, name, status, growth_strategy')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .is('deleted_at', null);

      if (error) throw error;

      const grouped = {
        cash_engine: data.filter(v => v.growth_strategy === 'cash_engine'),
        capability_builder: data.filter(v => v.growth_strategy === 'capability_builder'),
        moonshot: data.filter(v => v.growth_strategy === 'moonshot'),
        unclassified: data.filter(v => !v.growth_strategy),
      };

      const total = data.filter(v => v.growth_strategy).length;

      return {
        grouped,
        total,
        gaps: Object.entries(grouped)
          .filter(([k, v]) => k !== 'unclassified' && v.length === 0)
          .map(([k]) => k),
        hasUnclassified: grouped.unclassified.length > 0,
      };
    },
  });
}
```

## API Surface

### Supabase RPC Functions
No new RPC functions needed for Phase 1 — direct table queries via Supabase client suffice.

### Phase 2: Portfolio Metrics RPC
```sql
CREATE OR REPLACE FUNCTION get_portfolio_balance(p_company_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'strategy_counts', (
      SELECT json_object_agg(growth_strategy, cnt)
      FROM (
        SELECT growth_strategy, COUNT(*) as cnt
        FROM ventures
        WHERE company_id = p_company_id
          AND status = 'active'
          AND deleted_at IS NULL
          AND growth_strategy IS NOT NULL
        GROUP BY growth_strategy
      ) sub
    ),
    'total_active', (
      SELECT COUNT(*) FROM ventures
      WHERE company_id = p_company_id AND status = 'active' AND deleted_at IS NULL
    ),
    'unclassified', (
      SELECT COUNT(*) FROM ventures
      WHERE company_id = p_company_id AND status = 'active'
        AND deleted_at IS NULL AND growth_strategy IS NULL
    ),
    'gaps', (
      SELECT json_agg(strategy)
      FROM unnest(ARRAY['cash_engine', 'capability_builder', 'moonshot']) AS strategy
      WHERE strategy NOT IN (
        SELECT DISTINCT growth_strategy::text FROM ventures
        WHERE company_id = p_company_id AND status = 'active'
          AND deleted_at IS NULL AND growth_strategy IS NOT NULL
      )
    )
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

## Implementation Phases

### Phase 1: Classify + Visualize (MVP — ~2 days)
**Deliverables:**
1. Database migration: `growth_strategy` enum + column on `ventures`
2. Manual classification: Chairman classifies 7 ventures (via script or admin UI)
3. `usePortfolioBalance` hook
4. `PortfolioBalanceTab` with `StrategyAllocationCards`, `GapAlertBanner`, `VenturesByStrategy`
5. Add 5th tab to `VisionAlignmentPage`

**Time estimate**: 12-16 hours elapsed

### Phase 2: Capability Flow (1 week after Phase 1)
**Deliverables:**
1. `CapabilityFlowDiagram` component showing cross-venture capability sharing
2. Query `sd_capabilities` grouped by venture's `growth_strategy`
3. Highlight "double ROI" ventures (revenue + capability production)

**Time estimate**: 8-12 hours elapsed

### Phase 3: Portfolio-Aware Intake (future)
**Deliverables:**
1. EVA Stage 0 chairman review shows portfolio context panel
2. `portfolio_synergy_score` auto-calculation based on capability overlap
3. Gap detection generates EVA intake prompts

**Time estimate**: 16-24 hours elapsed

## Testing Strategy

### Unit Tests
- `usePortfolioBalance` hook: test grouping logic, gap detection, unclassified handling
- `StrategyAllocationCards`: render with 0, 1, N ventures per bucket
- `GapAlertBanner`: show when gaps exist, hide when all buckets populated

### Integration Tests
- Migration applies cleanly on existing data (no FK breakage)
- Ventures with null `growth_strategy` show as "Unclassified"
- Reclassification updates the balance view in real-time (React Query invalidation)

### E2E Tests
- Chairman navigates to `/chairman/vision` → clicks "Portfolio" tab → sees balance view
- Chairman reclassifies a venture → balance updates
- With zero ventures in a bucket → gap alert appears

## Risk Mitigation

### Risk 1: Classification taxonomy changes after build
**Mitigation**: Use a Postgres enum for `growth_strategy`. Adding a new enum value is a single `ALTER TYPE ... ADD VALUE` — no data migration needed. The UI maps enum values to display labels, so renaming is also cheap.

### Risk 2: Demo portfolio data causes confusion
**Mitigation**: Filter by `is_demo = false` in all portfolio queries. Consider a migration to set `is_demo = true` on the 4 industry-vertical portfolios and their parent companies.

### Risk 3: Chairman doesn't classify ventures (cold start)
**Mitigation**: Show an "Unclassified" section prominently with a call-to-action: "3 ventures need classification." Make classification a one-click dropdown, not a form.

### Risk 4: Portfolio balance view becomes vanity metric
**Mitigation**: Keep the view actionable — gap alerts link to EVA intake, venture cards link to venture detail pages. Don't add percentage targets or "ideal allocation" — at 7 ventures, there is no meaningful optimum.
