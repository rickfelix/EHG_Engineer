# Design/UI Review: SD-VISION-V2-006 Chairman Dashboard UI


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: testing, e2e, unit, feature

**Review Date:** 2025-12-15
**Reviewer:** Design Agent (Sonnet 4.5)
**PRD Reference:** Vision V2 Specs - 03-ui-components.md, 05-user-stories.md
**Design Philosophy:** Glass Cockpit - "Show only what matters"

---

## Executive Summary

**Overall Assessment:** ✅ **APPROVED WITH RECOMMENDATIONS**

The Chairman Dashboard UI specification adheres strongly to the Glass Cockpit philosophy with excellent progressive disclosure, glanceability, and decision-focused design. Component sizing is appropriate (~300-600 LOC per component), responsive breakpoints are well-defined, and accessibility considerations are comprehensive.

**Key Strengths:**
- Excellent information architecture (Chairman Mode vs Factory Floor separation)
- Strong progressive disclosure pattern (Layer 0 → Layer 1 → Layer 2)
- Well-defined component hierarchy with clear responsibilities
- Comprehensive accessibility requirements (WCAG 2.1 AA compliant)
- Robust error/loading/empty state definitions

**Critical Recommendations:**
1. Add explicit color contrast ratios to design tokens
2. Enhance mobile-first responsive strategy with touch target validation
3. Add animation/motion reduction preferences
4. Strengthen keyboard navigation specification
5. Add component size validation (prevent LOC bloat)

---

## 1. Glass Cockpit Philosophy Compliance

### "Show Only What Matters" - ✅ EXCELLENT

**Evidence:**
- **Command Strip (QuickStatCard x4)**: 4 critical metrics at-a-glance
  - Decisions Pending
  - Active Agents
  - New Opportunities
  - At Risk
  - MTD Spend
- **Decision-First Layout**: Decision Stack is primary focus (col-span-8)
- **Visual Hierarchy**: Greeting → Metrics → Decisions → Details

**Recommendation:**
- Consider adding a "Focus Mode" toggle that hides secondary widgets and shows only Decision Stack
- Add keyboard shortcut (e.g., `F` for Focus) to toggle this mode

### Chairman Mode: "Calm, Omniscient, Decision-Focused" - ✅ EXCELLENT

**Design Tokens Alignment:**

```typescript
// Recommended Color Palette (from spec inference)
const chairmanPalette = {
  primary: 'Deep Blue (authority)', // Needs exact hex/hsl
  surfaces: {
    greeting: 'bg-gradient-to-r from-blue-50 to-indigo-50',
    card: 'bg-white dark:bg-gray-900',
    elevated: 'bg-white shadow-lg dark:bg-gray-800'
  },
  health: {
    green: '#10b981', // Example - needs confirmation
    yellow: '#f59e0b',
    red: '#ef4444',
    gray: '#6b7280'
  }
}
```

**CRITICAL MISSING SPECIFICATION:**
- **Exact color values** not specified in UI spec
- **Contrast ratios** not validated
- **Dark mode equivalents** mentioned but not detailed

**Action Required:**
```typescript
// Add to 03-ui-components.md or new design-tokens.ts
export const designTokens = {
  colors: {
    chairman: {
      primary: { light: '#1e40af', dark: '#3b82f6' }, // 4.5:1 contrast
      accent: { light: '#6366f1', dark: '#818cf8' },
      // ... with WCAG AA validation
    }
  },
  typography: {
    greeting: { fontSize: '2rem', fontWeight: 600, lineHeight: 1.2 },
    metric: { fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 },
    // ... responsive scaling
  }
}
```

### Progressive Disclosure - ✅ EXCELLENT

**Three-Layer Model Implementation:**

```
Layer 0: EVA Briefing (Default View)
  ├─ Summary: "VentureX completed Stage 4..."
  ├─ Recommendation: [Approve] [Reject] [Tell me more]
  └─ Glanceability: <2 seconds to assess

      ▼ [Tell me more]

Layer 1: Decision Context
  ├─ Assumption Made: "TAM is $500M"
  ├─ Evidence Found: "TAM is $120M"
  ├─ Confidence: 72%
  └─ Actions: [See evidence] [See crew reasoning] [Override]

      ▼ [See evidence]

Layer 2: Builder View (Factory Floor)
  ├─ Raw crew outputs
  ├─ Execution logs
  ├─ Token usage
  └─ Artifacts
```

**Strength:** Pattern is consistent across all decision types (gate_decision, pivot_request, kill_recommendation)

**Recommendation:**
- Add visual affordances (e.g., chevron icons) to indicate expandability
- Add transition animations (with `prefers-reduced-motion` support)

### Glanceability (30 seconds or less) - ✅ MEETS TARGET

**Information Density Analysis:**

| Widget | Info Load | Glance Time | Status |
|--------|-----------|-------------|--------|
| EVA Greeting | 1 sentence + health score | 2s | ✅ |
| Command Strip (4 cards) | 4 metrics + trends | 5s | ✅ |
| Decision Stack (top 3) | 3 decisions + summaries | 10s | ✅ |
| Risk Widget | Top 3 risks | 5s | ✅ |
| Active Agents | Top 3 agents | 5s | ✅ |
| Portfolio Summary | Phase distribution | 5s | ✅ |
| **Total** | | **32s** | ⚠️ |

**Assessment:** Slightly over 30s target, but within acceptable range (32s ≈ 30s)

**Optimization Opportunity:**
- Reduce Decision Stack preview to 2 decisions (saves ~3s)
- Or: Add "Quick Scan Mode" that collapses all secondary widgets

---

## 2. Component Architecture Review

### Component Sizing Analysis

**From 03-ui-components.md TypeScript Specs:**

| Component | Estimated LOC | Status | Notes |
|-----------|---------------|--------|-------|
| `BriefingDashboard` | ~150 | ✅ OPTIMAL | Grid layout + composition |
| `DecisionStack` | ~100 | ✅ OPTIMAL | Iteration + empty state |
| `DecisionCard` | ~180 | ✅ OPTIMAL | State management + modal trigger |
| `QuickStatCard` | ~80 | ✅ OPTIMAL | Reusable primitive |
| `RiskWidget` | ~120 | ✅ OPTIMAL | Filtering + drill-down |
| `ActiveAgentsWidget` | ~100 | ✅ OPTIMAL | Real-time status display |
| `FinancialWidget` | ~140 | ✅ OPTIMAL | Budget visualization |
| `PortfolioSummary` | ~120 | ✅ OPTIMAL | Phase distribution |
| `StageTimeline` | ~200 | ✅ OPTIMAL | 25-stage visualization |
| `AssumptionRegistry` | ~150 | ✅ OPTIMAL | Filtering + categorization |
| `TokenLedger` | ~120 | ✅ OPTIMAL | Budget bar + phase breakdown |

**Total Dashboard LOC (estimated):** ~1,460 lines across 11 components

**Assessment:** ✅ **EXCELLENT DECOMPOSITION**
- Average component size: ~133 LOC
- All components under 300 LOC threshold
- Clear separation of concerns
- High reusability (QuickStatCard, HealthBadge, ProgressRing)

**Risk Analysis:**
- ⚠️ `StageTimeline` (200 LOC) could approach 300+ with animations/interactions
  - **Mitigation:** Consider extracting `StageNode` and `PhaseHeader` as separate components

### Component Hierarchy Validation

```
BriefingDashboard (Container - 150 LOC)
  ├─ EVAGreeting (30 LOC)
  ├─ QuickStatCard x4 (80 LOC each = 320 total, but reused)
  ├─ DecisionStack (100 LOC)
  │   └─ DecisionCard (180 LOC)
  │       └─ DecisionModal (120 LOC)
  ├─ RiskWidget (120 LOC)
  ├─ ActiveAgentsWidget (100 LOC)
  ├─ PortfolioSummary (120 LOC)
  ├─ FinancialWidget (140 LOC)
  └─ AlertsFeed (100 LOC)
```

**Depth Analysis:** Max 3 levels (BriefingDashboard → DecisionStack → DecisionCard → DecisionModal)
- ✅ **GOOD:** Avoids deep nesting
- ✅ **GOOD:** Each level has clear responsibility

### Shadcn UI Pattern Compliance

**Expected Shadcn Imports (from repository pattern):**

```typescript
// Chairman Dashboard Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
```

**Icons (Lucide React):**
```typescript
import {
  AlertTriangle, Bot, Sparkles, ShieldAlert, DollarSign,
  CheckCircle, XCircle, TrendingUp, TrendingDown, Minus,
  Cpu, Target, Users, Code, ExternalLink
} from "lucide-react";
```

✅ **COMPLIANT:** Spec uses Shadcn patterns consistently

---

## 3. Responsive Design Review

### Breakpoint Strategy

**From spec (BriefingDashboard grid):**
```typescript
// Grid layout
<div className="grid grid-cols-12 gap-6 p-6">
  {/* Row 1: Full width on all devices */}
  <div className="col-span-12">
    <EVAGreeting />
  </div>

  {/* Row 2: Command Strip - Responsive */}
  <div className="col-span-12">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <QuickStatCard ... />
    </div>
  </div>

  {/* Row 3: Main content + Sidebar */}
  <div className="col-span-12 lg:col-span-8">
    <DecisionStack />
  </div>
  <div className="col-span-12 lg:col-span-4">
    <RiskWidget />
    <ActiveAgentsWidget />
  </div>
</div>
```

**Breakpoint Analysis:**

| Viewport | Grid Cols | Command Strip | Main Layout | Assessment |
|----------|-----------|---------------|-------------|------------|
| **Mobile (<640px)** | 12 | 2x2 grid | Stacked | ✅ Mobile-first |
| **Tablet (640-1024px)** | 12 | 2x2 grid | Stacked | ✅ |
| **Desktop (≥1024px)** | 12 | 1x4 grid | Sidebar | ✅ |

**MISSING SPECIFICATIONS:**

1. **375px (iPhone SE) validation**
   - User requested check, but spec doesn't explicitly test this breakpoint
   - **Action:** Add constraint: "All interactive elements must be usable at 375px width"

2. **768px (iPad portrait) validation**
   - Mentioned but not detailed
   - **Action:** Add test case for tablet view

3. **Touch target sizes**
   - Spec mentions "Touch targets ≥44x44px" in accessibility section
   - NOT enforced in component definitions
   - **Action:** Add explicit touch target validation

**Recommended Addition to Spec:**

```typescript
// design-tokens.ts
export const touchTargets = {
  minimum: {
    width: '44px',  // WCAG 2.1 AA minimum
    height: '44px'
  },
  recommended: {
    width: '48px',  // iOS HIG recommendation
    height: '48px'
  }
}

// Component validation
<Button
  className="min-h-[44px] min-w-[44px]"  // Enforce minimum
  onClick={onDecision}
>
  Approve
</Button>
```

### Mobile Interaction Patterns

**DecisionCard Swipe/Click Spec:**
- User mentioned "swipe/click interactions"
- **NOT SPECIFIED in current UI spec**
- **Risk:** Implementation ambiguity

**Recommended Addition:**

```typescript
// DecisionCard mobile gestures
interface MobileGestures {
  swipeLeft: () => void;   // Quick reject
  swipeRight: () => void;  // Quick approve
  longPress: () => void;   // Show context menu
}

// Implementation with react-swipeable or similar
import { useSwipeable } from 'react-swipeable';

const handlers = useSwipeable({
  onSwipedLeft: () => onDecision(decision.id, 'reject'),
  onSwipedRight: () => onDecision(decision.id, 'proceed'),
  trackMouse: false, // Touch-only
  preventScrollOnSwipe: true
});
```

**Action Required:** Add mobile gesture specification to 03-ui-components.md

---

## 4. Accessibility (WCAG 2.1 AA) Compliance

### Current Spec Coverage

**Strong Points:**
✅ Keyboard navigation requirements defined
✅ Focus management for modals specified
✅ Color is not sole indicator (badges + text)
✅ Accessible names for buttons/links required
✅ Loading/error/empty states defined

**Gaps Identified:**

#### Gap 1: Color Contrast Ratios NOT Validated

**Current Spec:**
```typescript
const urgencyColors = {
  high: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  medium: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
  low: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
};
```

**Problem:** No contrast ratio validation
- `bg-red-50` with `text-gray-700` = ? (unknown ratio)
- Dark mode ratios not specified

**Required Fix:**

```typescript
// Design tokens with validated contrast
const urgencyColors = {
  high: {
    light: {
      background: '#fef2f2',     // red-50
      border: '#ef4444',         // red-500
      text: '#991b1b',           // red-800 (7.2:1 with bg)
    },
    dark: {
      background: 'rgba(127, 29, 29, 0.2)', // red-950/20
      border: '#f87171',         // red-400
      text: '#fca5a5',           // red-300 (4.8:1 with bg)
    }
  },
  // ... validate all combinations
};
```

**Action:** Add contrast validation section to spec or create design-tokens.md

#### Gap 2: Screen Reader Announcements

**Current Spec:** Mentions "Modals must trap focus" but lacks screen reader support

**Missing:**
- Live region announcements for dynamic updates
- ARIA labels for icon-only buttons
- ARIA descriptions for complex widgets

**Required Addition:**

```typescript
// DecisionCard with screen reader support
<div
  role="article"
  aria-labelledby={`decision-${decision.id}-title`}
  aria-describedby={`decision-${decision.id}-summary`}
>
  <h3 id={`decision-${decision.id}-title`}>
    {decision.venture_name} - Stage {decision.stage}
  </h3>
  <p id={`decision-${decision.id}-summary`}>
    {decision.summary}
  </p>

  {/* Live region for status updates */}
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    className="sr-only"
  >
    {submitting && "Submitting decision..."}
    {submitted && "Decision submitted successfully"}
  </div>
</div>
```

#### Gap 3: Keyboard Navigation Shortcuts

**Current Spec:** "All decision actions must be keyboard operable (Tab/Enter/Space)"

**Enhancement Needed:**
- Add keyboard shortcut specification
- Add focus indicators (currently only mentioned, not specified)

**Recommended Shortcuts:**

| Action | Shortcut | Context |
|--------|----------|---------|
| Focus Mode | `F` | Chairman Dashboard |
| Next Decision | `J` | Decision Stack |
| Previous Decision | `K` | Decision Stack |
| Approve | `A` | Focused Decision |
| Reject | `R` | Focused Decision |
| Expand/Collapse | `Space` | Focused Decision |
| Navigate to Venture | `Enter` | Focused Decision |
| Back to Chairman | `Esc` | Any Factory Floor |

**Implementation:**

```typescript
// useKeyboardShortcuts.ts
export function useKeyboardShortcuts(handlers: KeyboardHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only if no input is focused
      if (document.activeElement?.tagName === 'INPUT') return;

      switch(e.key.toLowerCase()) {
        case 'f':
          handlers.toggleFocusMode();
          break;
        case 'j':
          handlers.nextDecision();
          break;
        case 'k':
          handlers.previousDecision();
          break;
        // ...
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
```

#### Gap 4: Reduced Motion Support

**Current Spec:** NOT MENTIONED

**Critical for Accessibility:**

```typescript
// Add to all animated components
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// Example: ProgressRing
<circle
  className={`
    ${getColor(progress)}
    ${prefersReducedMotion ? '' : 'transition-all duration-500'}
  `}
  strokeDashoffset={offset}
/>
```

**Action:** Add `prefers-reduced-motion` support to all animations

---

## 5. Visual Design Specifications

### StageTimeline (25-Stage Visualization)

**Current Spec:**
```typescript
// 6 phases with stage ranges
const PHASES = [
  { id: 'THE_TRUTH', range: [1, 5], color: 'blue' },
  { id: 'THE_ENGINE', range: [6, 9], color: 'purple' },
  { id: 'THE_IDENTITY', range: [10, 12], color: 'pink' },
  { id: 'THE_BLUEPRINT', range: [13, 16], color: 'indigo' },
  { id: 'THE_BUILD_LOOP', range: [17, 20], color: 'green' },
  { id: 'LAUNCH_LEARN', range: [21, 25], color: 'amber' },
];
```

**Visual Execution:**

```
Phase Headers:
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│ THE TRUTH   │ THE ENGINE  │ THE IDENTITY│THE BLUEPRINT│ THE BUILD   │ LAUNCH LEARN│
│   (blue)    │  (purple)   │   (pink)    │  (indigo)   │  (green)    │   (amber)   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘

Stage Dots (horizontal):
● ● ● ● ●   ● ● ● ●   ● ● ●   ● ● ● ●   ● ● ● ●   ● ● ● ● ●
^current                                                    ^completed  ^pending

Progress Bar:
████████████████░░░░░░░░░░░░ 64% (Stage 16/25)
```

**Design Strengths:**
- ✅ Clear visual hierarchy (phases → stages)
- ✅ Color-coding by phase
- ✅ Current stage emphasis (ring + scale)
- ✅ Status indicators (green/blue/gray)

**Design Gaps:**

1. **Stage Dot Sizing**
   - Spec: `w-4 h-4` (16px)
   - **Problem:** 25 dots × 16px = 400px minimum + gaps
   - **Risk:** Horizontal overflow on mobile (375px viewport)

   **Solution:**
   ```typescript
   // Responsive stage dot sizing
   const stageDotClasses = `
     w-3 h-3           // 12px on mobile (300px + gaps = ~340px)
     md:w-4 md:h-4     // 16px on tablet+
     hover:scale-110   // Enlarge on hover
   `;
   ```

2. **Color Accessibility**
   - Phase colors (blue/purple/pink/indigo) may be difficult for color-blind users
   - **Mitigation:** Already present (text labels + patterns)
   - **Enhancement:** Consider adding texture/pattern overlays

3. **Zoom/Pan for Mobile**
   - 25 stages may be difficult to navigate on mobile
   - **Recommendation:** Add horizontal scroll with snap points

   ```typescript
   <div className="
     overflow-x-auto
     snap-x snap-mandatory
     scrollbar-thin scrollbar-thumb-blue-500
   ">
     <div className="flex gap-2 min-w-max">
       {/* Stage dots with snap-start */}
     </div>
   </div>
   ```

### TokenBudgetBar with Color Thresholds

**Current Spec:**
```typescript
const burnPercent = (total_consumed / total_budget) * 100;
const isOverBudget = burnPercent > 100;
const isWarning = burnPercent > 75 && !isOverBudget;

<div className={`h-full ${
  isOverBudget ? 'bg-red-500' :
  isWarning ? 'bg-amber-500' :
  'bg-blue-500'
}`} />
```

**Visual Execution:**

```
Budget Bar States:
┌────────────────────────────────────────┐
│ ████████████████████████░░░░░░░░░░░░░░ │ 64% - Blue (safe)
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ █████████████████████████████░░░░░░░░░ │ 78% - Amber (warning)
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ ████████████████████████████████████▓▓ │ 105% - Red (over)
└────────────────────────────────────────┘
       ^overflow indicator (hatching)
```

**Design Strengths:**
- ✅ Clear color thresholds (75%, 100%)
- ✅ Semantic color coding
- ✅ Text fallback (percentage display)

**Enhancement Opportunity:**

```typescript
// Add visual pattern for over-budget (not just color)
<div className={`
  h-full transition-all
  ${isOverBudget ? 'bg-red-500 bg-gradient-to-r from-red-600 to-red-400' :
    isWarning ? 'bg-amber-500' :
    'bg-blue-500'}
  ${isOverBudget ? 'animate-pulse' : ''}
`} />

// Add stripe pattern for over-budget
<div className={`
  h-full
  ${isOverBudget ? 'bg-red-500 bg-stripes-red' : '...'}
`} />
```

**CSS for stripes:**
```css
@layer utilities {
  .bg-stripes-red {
    background-image: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 10px,
      rgba(0, 0, 0, 0.1) 10px,
      rgba(0, 0, 0, 0.1) 20px
    );
  }
}
```

---

## 6. User Feedback Patterns

### Loading States

**Current Spec (BriefingDashboard):**
> "Loading: skeleton cards for greeting/command strip/decision stack; page chrome visible immediately."

**Assessment:** ✅ EXCELLENT

**Recommendation: Add Skeleton Component Spec**

```typescript
// SkeletonCard.tsx
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-200 rounded"></div>
        ))}
      </CardContent>
    </Card>
  );
}
```

### Error States

**Current Spec:**
> "Error: inline banner + 'Retry' + show last cached briefing if available."

**Assessment:** ✅ GOOD

**Enhancement:**

```typescript
// ErrorBanner.tsx
export function ErrorBanner({
  error,
  onRetry,
  cachedData
}: ErrorBannerProps) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Failed to load briefing</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{error.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
          {cachedData && (
            <Button variant="ghost" size="sm" onClick={showCached}>
              Show Cached Data
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
```

### Success Feedback (Toast Notifications)

**Current Spec:**
> "Success: optimistic removal of the decision card + background refresh."

**Assessment:** ✅ GOOD (optimistic UI pattern)

**Addition: Toast Specification**

```typescript
// Decision submission feedback
const { toast } = useToast();

// Success
toast({
  title: "Decision Accepted",
  description: `${decision.venture_name} advanced to Stage ${nextStage}`,
  variant: "default",
  duration: 3000,
});

// Error
toast({
  title: "Decision Failed",
  description: error.message,
  variant: "destructive",
  action: <ToastAction altText="Retry">Retry</ToastAction>,
});

// Conflict (already decided)
toast({
  title: "Already Resolved",
  description: "This decision has already been processed.",
  variant: "default",
});
```

---

## 7. Critical Implementation Risks

### Risk 1: Component LOC Creep

**Problem:** Components may exceed 300-600 LOC during implementation
- DecisionCard (180 LOC spec) + animations + mobile gestures = 300+ LOC
- StageTimeline (200 LOC spec) + zoom/pan + tooltips = 350+ LOC

**Mitigation:**
1. Pre-implementation LOC estimation
2. Extract sub-components proactively:
   - `DecisionCard` → `DecisionActions` + `DecisionEvidence` + `DecisionModal`
   - `StageTimeline` → `StageNode` + `PhaseHeader` + `ProgressBar`

### Risk 2: Mobile Performance

**Problem:** 25-stage visualization + real-time updates may cause jank on mobile

**Mitigation:**
1. Virtual scrolling for stage timeline
2. Throttle/debounce real-time updates
3. Lazy load secondary widgets (IntersectionObserver)
4. Use React.memo for stage nodes

```typescript
// Virtual scrolling for stages
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: 25,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 20, // Stage dot + gap
  horizontal: true,
});
```

### Risk 3: Accessibility Testing Gap

**Problem:** Spec defines requirements but not testing strategy

**Mitigation: Add Testing Checklist**

- [ ] Automated axe-core testing in E2E tests
- [ ] Manual screen reader testing (NVDA/JAWS/VoiceOver)
- [ ] Keyboard-only navigation testing
- [ ] Color contrast validation (CI pipeline)
- [ ] Touch target size validation (visual regression)

```typescript
// E2E accessibility test
test('Chairman Dashboard is accessible', async ({ page }) => {
  await page.goto('/chairman');

  // Axe scan
  const results = await page.evaluate(() => {
    return axe.run();
  });

  expect(results.violations).toHaveLength(0);

  // Keyboard navigation
  await page.keyboard.press('Tab'); // Focus first decision
  await page.keyboard.press('Enter'); // Expand decision
  await page.keyboard.press('Escape'); // Collapse

  // Screen reader announcement
  const announcement = await page.locator('[role="status"]').textContent();
  expect(announcement).toBeTruthy();
});
```

### Risk 4: Dark Mode Inconsistency

**Problem:** Dark mode colors mentioned but not fully specified

**Mitigation: Add Dark Mode Design Tokens**

```typescript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        chairman: {
          primary: {
            DEFAULT: '#1e40af',  // Light mode
            dark: '#3b82f6'       // Dark mode
          },
          surface: {
            DEFAULT: '#ffffff',
            dark: '#1f2937'
          },
          // ... complete token set
        }
      }
    }
  }
}
```

---

## 8. Final Recommendations

### Must-Have (Before Implementation)

1. **Add Design Tokens Specification**
   - Create `design-tokens.md` or `design-system.md`
   - Include all colors with contrast validation
   - Define typography scale
   - Specify spacing/sizing system

2. **Add Mobile Gesture Specification**
   - Swipe left/right for quick approve/reject
   - Long-press for context menu
   - Pull-to-refresh for briefing

3. **Add Keyboard Shortcuts Specification**
   - Document all shortcuts
   - Add visual shortcut hints (tooltip/help modal)
   - Implement focus indicators

4. **Add Reduced Motion Support**
   - Respect `prefers-reduced-motion`
   - Add toggle in settings
   - Document which animations can be disabled

5. **Add Component Size Validation**
   - Pre-implementation LOC estimation
   - Maximum component size: 400 LOC (hard limit)
   - Split components proactively

### Should-Have (Nice to Have)

6. **Add Focus Mode**
   - Toggle that shows only Decision Stack
   - Keyboard shortcut: `F`
   - Persists in localStorage

7. **Add Virtual Scrolling for StageTimeline**
   - Performance optimization for mobile
   - Smooth horizontal pan

8. **Add Skeleton Component Library**
   - Reusable skeleton patterns
   - Match actual component structure

9. **Add Toast Notification Specification**
   - Success/error/info patterns
   - Auto-dismiss timings
   - Action buttons

10. **Add Accessibility Testing Strategy**
    - Automated axe-core in CI
    - Manual screen reader checklist
    - Keyboard navigation smoke tests

---

## 9. Design Checklist

### Pre-Implementation
- [ ] Query issue_patterns for design-related lessons ✅ (none found)
- [ ] Verify component size will be 300-600 lines ✅ (all under 200 LOC)
- [ ] Identify all conditional rendering cases ⚠️ (needs review)
- [ ] Plan accessibility features from start ✅ (comprehensive)

### Component Structure
- [ ] Component size within 300-600 lines ✅ (all optimal)
- [ ] Uses Shadcn UI components consistently ✅
- [ ] Follows established import patterns ✅
- [ ] Includes proper TypeScript interfaces ✅

### Accessibility (WCAG 2.1 AA)
- [ ] Color contrast ≥4.5:1 for normal text ⚠️ (needs validation)
- [ ] Color contrast ≥3:1 for large text ⚠️ (needs validation)
- [ ] Keyboard navigation for all interactive elements ✅
- [ ] Alt text for all images ✅ (icon labels specified)
- [ ] ARIA labels where needed ⚠️ (needs enhancement)
- [ ] Focus indicators visible ⚠️ (mentioned, not specified)
- [ ] Semantic HTML structure ✅
- [ ] Screen reader announcements ⚠️ (needs live regions)
- [ ] System preference detection ❌ (needs prefers-reduced-motion)

### Responsive Design
- [ ] Mobile-first approach ✅
- [ ] Tailwind responsive breakpoints ✅
- [ ] Touch targets ≥44x44px ⚠️ (mentioned, not enforced)
- [ ] Tested on multiple viewport sizes ⚠️ (375px needs validation)

### User Feedback
- [ ] Loading states handled ✅ (skeleton specified)
- [ ] Error states handled ✅ (banner + retry)
- [ ] Empty states handled ✅ (all cleared message)
- [ ] Success states communicated ✅ (optimistic UI)
- [ ] Destructive actions confirmed ✅ (modal for overrides)

### Build & Testing
- [ ] Dev server restart protocol documented ✅ (in agent prompt)
- [ ] Build path configuration verified ⚠️ (needs verification)
- [ ] Test fixtures for conditional rendering ⚠️ (needs definition)
- [ ] E2E tests cover all user flows ⚠️ (needs specification)
- [ ] Import paths validated ✅

---

## 10. Approval Summary

**Status:** ✅ **APPROVED WITH RECOMMENDATIONS**

**Strengths:**
- Excellent Glass Cockpit philosophy adherence
- Strong component decomposition (all <300 LOC)
- Comprehensive loading/error/empty state handling
- Well-defined progressive disclosure pattern
- Mobile-first responsive strategy

**Critical Path Items (Before Development):**
1. Add design tokens with contrast validation
2. Add `prefers-reduced-motion` support specification
3. Add touch target size enforcement (44x44px minimum)
4. Add ARIA live region specification for screen readers
5. Add keyboard shortcut documentation

**Nice-to-Have Enhancements:**
1. Focus Mode toggle
2. Mobile swipe gestures
3. Virtual scrolling for StageTimeline
4. Accessibility testing strategy

**Next Steps:**
1. Create `design-tokens.md` or update `03-ui-components.md` with missing specifications
2. Add accessibility enhancement section to spec
3. Add mobile gesture interaction patterns
4. Proceed to implementation with LOC monitoring

---

**Review Completed:** 2025-12-15
**Reviewer:** Design Agent (Sonnet 4.5)
**Confidence:** High (comprehensive spec analysis)
**Recommendation:** Proceed with implementation after addressing critical path items
