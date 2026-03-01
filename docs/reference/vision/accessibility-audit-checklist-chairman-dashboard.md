---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Accessibility Audit Checklist: Chairman Dashboard UI



## Table of Contents

- [Metadata](#metadata)
- [Quick Reference](#quick-reference)
- [1. Perceivable](#1-perceivable)
  - [1.1 Text Alternatives (Level A)](#11-text-alternatives-level-a)
  - [1.2 Time-based Media (Level A/AA)](#12-time-based-media-level-aaa)
  - [1.3 Adaptable (Level A)](#13-adaptable-level-a)
  - [1.4 Distinguishable (Level A/AA)](#14-distinguishable-level-aaa)
- [2. Operable](#2-operable)
  - [2.1 Keyboard Accessible (Level A)](#21-keyboard-accessible-level-a)
  - [2.2 Enough Time (Level A)](#22-enough-time-level-a)
  - [2.3 Seizures (Level A/AA)](#23-seizures-level-aaa)
  - [2.4 Navigable (Level A/AA)](#24-navigable-level-aaa)
  - [2.5 Input Modalities (Level A/AA)](#25-input-modalities-level-aaa)
- [3. Understandable](#3-understandable)
  - [3.1 Readable (Level A/AA)](#31-readable-level-aaa)
  - [3.2 Predictable (Level A/AA)](#32-predictable-level-aaa)
  - [3.3 Input Assistance (Level A/AA)](#33-input-assistance-level-aaa)
- [4. Robust](#4-robust)
  - [4.1 Compatible (Level A)](#41-compatible-level-a)
- [5. Additional Best Practices](#5-additional-best-practices)
  - [5.1 Screen Reader Testing](#51-screen-reader-testing)
  - [5.2 Reduced Motion](#52-reduced-motion)
  - [5.3 High Contrast Mode](#53-high-contrast-mode)
  - [5.4 Zoom and Magnification](#54-zoom-and-magnification)
- [6. Automated Testing Strategy](#6-automated-testing-strategy)
  - [6.1 CI/CD Integration](#61-cicd-integration)
  - [6.2 Manual Testing Checklist](#62-manual-testing-checklist)
- [7. Priority Matrix](#7-priority-matrix)
- [8. Sign-Off Checklist](#8-sign-off-checklist)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: testing, e2e, guide, sd

**Target:** SD-VISION-V2-006 (Vision V2: Chairman Dashboard UI)
**Standard:** WCAG 2.1 Level AA
**Created:** 2025-12-15

---

## Quick Reference

**Status Legend:**
- ✅ Specified and compliant
- ⚠️ Partially specified / needs validation
- ❌ Not specified / missing
- 🔧 Needs implementation verification

---

## 1. Perceivable

### 1.1 Text Alternatives (Level A)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **1.1.1** Non-text Content | All icons | ✅ | Lucide icons with aria-label |
| | QuickStatCard icons | ✅ | Semantic icon components |
| | HealthBadge | ✅ | Color + text label |
| | ProgressRing | ✅ | Percentage text overlay |

**Action Items:**
- [ ] Verify all icon-only buttons have aria-label
- [ ] Add alt text for any dynamic charts/graphs

---

### 1.2 Time-based Media (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **1.2.1** Audio-only/Video-only | N/A | ✅ | No audio/video content |

---

### 1.3 Adaptable (Level A)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **1.3.1** Info and Relationships | All components | ✅ | Semantic HTML (Card, article, etc.) |
| | DecisionCard | ⚠️ | Needs role="article" + aria-labelledby |
| | StageTimeline | ✅ | Semantic structure with headings |
| **1.3.2** Meaningful Sequence | BriefingDashboard | ✅ | Logical reading order (greeting → metrics → decisions) |
| **1.3.3** Sensory Characteristics | All components | ✅ | Color + text + icons (not color alone) |
| **1.3.4** Orientation | All components | 🔧 | Needs testing on portrait/landscape |
| **1.3.5** Identify Input Purpose | Forms | ✅ | DecisionModal uses semantic inputs |

**Action Items:**
- [ ] Add `role="article"` to DecisionCard
- [ ] Add `aria-labelledby` referencing decision title
- [ ] Test orientation lock on mobile (should not require landscape)

---

### 1.4 Distinguishable (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **1.4.1** Use of Color | All components | ✅ | Color + text + icons |
| **1.4.2** Audio Control | N/A | ✅ | No auto-playing audio |
| **1.4.3** Contrast (Minimum) | All text | ⚠️ | Needs validation (4.5:1 ratio) |
| | DecisionCard urgency colors | ❌ | Not validated |
| | Dark mode colors | ❌ | Not validated |
| **1.4.4** Resize Text | All components | ✅ | Tailwind responsive typography |
| **1.4.5** Images of Text | All components | ✅ | No images of text |
| **1.4.10** Reflow | All components | ✅ | Responsive grid (no horizontal scroll at 320px) |
| **1.4.11** Non-text Contrast | UI components | ⚠️ | Needs validation (3:1 ratio) |
| | HealthBadge dots | ⚠️ | 12px dots need 3:1 contrast |
| | Stage dots | ⚠️ | 12-16px dots need 3:1 contrast |
| **1.4.12** Text Spacing | All components | 🔧 | Needs testing with user stylesheets |
| **1.4.13** Content on Hover/Focus | Tooltips | ⚠️ | Needs dismissible/hoverable/persistent spec |

**Action Items:**
- [ ] Validate all text/background combinations for 4.5:1 contrast
- [ ] Validate UI component borders/icons for 3:1 contrast
- [ ] Create contrast validation matrix (light + dark modes)
- [ ] Add tooltip specification (dismissible on Esc, persistent on hover)

**Priority Contrast Checks:**

```typescript
// High Priority Combinations to Validate
const contrastChecks = [
  // DecisionCard urgency backgrounds
  { bg: 'bg-red-50', text: 'text-gray-700', target: 4.5 },
  { bg: 'bg-amber-50', text: 'text-gray-700', target: 4.5 },
  { bg: 'bg-blue-50', text: 'text-gray-700', target: 4.5 },

  // Dark mode equivalents
  { bg: 'dark:bg-red-950/20', text: 'dark:text-gray-300', target: 4.5 },

  // QuickStatCard
  { bg: 'bg-green-50', text: 'text-green-700', target: 4.5 },

  // HealthBadge dots
  { bg: 'bg-white', border: 'bg-green-500', target: 3.0 },
  { bg: 'bg-white', border: 'bg-amber-500', target: 3.0 },
  { bg: 'bg-white', border: 'bg-red-500', target: 3.0 },

  // Stage dots
  { bg: 'bg-gray-100', dot: 'bg-blue-500', target: 3.0 },
];
```

---

## 2. Operable

### 2.1 Keyboard Accessible (Level A)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **2.1.1** Keyboard | All interactive elements | ✅ | Tab/Enter/Space specified |
| | DecisionCard actions | ✅ | Button elements (native keyboard support) |
| | StageTimeline navigation | ✅ | Button elements for stage nodes |
| **2.1.2** No Keyboard Trap | Modals | ✅ | Focus trap + Esc to close specified |
| | DecisionModal | ✅ | Focus trap with Shadcn Dialog |
| **2.1.4** Character Key Shortcuts | Keyboard shortcuts | ❌ | Not specified (recommended: F/J/K/A/R) |

**Action Items:**
- [ ] Add keyboard shortcut specification
- [ ] Ensure shortcuts can be disabled/remapped
- [ ] Add visual shortcut hints (tooltip or help modal)
- [ ] Test focus trap in all modals

**Recommended Keyboard Shortcuts:**

| Shortcut | Action | Context |
|----------|--------|---------|
| `F` | Toggle Focus Mode | Chairman Dashboard |
| `J` | Next Decision | Decision Stack (focused) |
| `K` | Previous Decision | Decision Stack (focused) |
| `A` | Approve Decision | Decision Card (focused) |
| `R` | Reject Decision | Decision Card (focused) |
| `Space` | Expand/Collapse | Decision Card (focused) |
| `Enter` | Navigate to Venture | Decision Card (focused) |
| `Esc` | Close Modal / Back | Any modal / Factory Floor |
| `?` | Show Keyboard Help | Any page |

---

### 2.2 Enough Time (Level A)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **2.2.1** Timing Adjustable | Real-time updates | ✅ | Poll intervals (5 min briefing, 30-60s decisions) |
| **2.2.2** Pause, Stop, Hide | Live telemetry | ⚠️ | Needs pause button specification |
| | Auto-refresh | ⚠️ | Needs manual control |

**Action Items:**
- [ ] Add pause button to ActiveAgentsWidget
- [ ] Add "Disable auto-refresh" toggle
- [ ] Persist preference in localStorage

---

### 2.3 Seizures (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **2.3.1** Three Flashes or Below | All animations | ✅ | No flashing content |
| **2.3.2** Three Flashes | All animations | ✅ | No flashing content |

---

### 2.4 Navigable (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **2.4.1** Bypass Blocks | BriefingDashboard | ⚠️ | Needs "Skip to decisions" link |
| **2.4.2** Page Titled | All routes | 🔧 | Needs verification (`<title>` element) |
| **2.4.3** Focus Order | All components | ✅ | Logical tab order (top to bottom, left to right) |
| **2.4.4** Link Purpose | All links | ✅ | Descriptive link text (venture name + stage) |
| **2.4.5** Multiple Ways | Navigation | ✅ | Breadcrumbs + sidebar + search (assumed) |
| **2.4.6** Headings and Labels | All components | ✅ | CardTitle elements provide headings |
| **2.4.7** Focus Visible | All interactive elements | ⚠️ | Needs explicit focus indicator spec |

**Action Items:**
- [ ] Add "Skip to main content" link at top of page
- [ ] Add "Skip to decisions" link in header
- [ ] Verify all routes have unique, descriptive `<title>` elements
- [ ] Define focus indicator styles (ring-2 ring-offset-2 ring-blue-500)
- [ ] Test focus indicators on all interactive elements

**Focus Indicator Specification:**

```typescript
// Add to design tokens
const focusStyles = {
  default: 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
  destructive: 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500',
  visible: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500',
};

// Example usage
<Button className={focusStyles.default}>
  Approve
</Button>
```

---

### 2.5 Input Modalities (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **2.5.1** Pointer Gestures | DecisionCard swipe | ❌ | Not specified |
| **2.5.2** Pointer Cancellation | All buttons | ✅ | Native button behavior |
| **2.5.3** Label in Name | All buttons | ✅ | Visible text matches accessible name |
| **2.5.4** Motion Actuation | N/A | ✅ | No device motion triggers |
| **2.5.5** Target Size | All touch targets | ⚠️ | Mentioned (44x44px) but not enforced |

**Action Items:**
- [ ] Add swipe gesture specification with fallback
- [ ] Enforce 44x44px minimum touch target size
- [ ] Add visual regression test for touch target sizes

**Touch Target Enforcement:**

```typescript
// Minimum touch target classes
const touchTargetClasses = 'min-h-[44px] min-w-[44px] p-2';

// Apply to all interactive elements
<Button className={touchTargetClasses}>
  Approve
</Button>

<button
  className={`${touchTargetClasses} flex items-center justify-center`}
  onClick={onStageClick}
>
  <StageIcon />
</button>
```

---

## 3. Understandable

### 3.1 Readable (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **3.1.1** Language of Page | HTML | 🔧 | Needs `<html lang="en">` verification |
| **3.1.2** Language of Parts | N/A | ✅ | All content in English |

**Action Items:**
- [ ] Verify `<html lang="en">` attribute
- [ ] Add lang attribute to any non-English content (if applicable)

---

### 3.2 Predictable (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **3.2.1** On Focus | All components | ✅ | No context change on focus |
| **3.2.2** On Input | All forms | ✅ | No auto-submit on input |
| **3.2.3** Consistent Navigation | All pages | ✅ | Header + sidebar consistent |
| **3.2.4** Consistent Identification | All components | ✅ | Consistent icon/label pairing |

---

### 3.3 Input Assistance (Level A/AA)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **3.3.1** Error Identification | All forms | ✅ | Toast + inline banner specified |
| **3.3.2** Labels or Instructions | DecisionModal | ✅ | Clear labels for inputs |
| **3.3.3** Error Suggestion | Error states | ✅ | "Retry" button + actionable message |
| **3.3.4** Error Prevention | Destructive actions | ✅ | Confirmation modal for overrides |

---

## 4. Robust

### 4.1 Compatible (Level A)

| Guideline | Component | Status | Notes |
|-----------|-----------|--------|-------|
| **4.1.1** Parsing | All HTML | ✅ | React generates valid HTML |
| **4.1.2** Name, Role, Value | All components | ⚠️ | Needs ARIA enhancement |
| **4.1.3** Status Messages | Dynamic updates | ⚠️ | Needs live region specification |

**Action Items:**
- [ ] Add ARIA roles to custom components
- [ ] Add ARIA live regions for dynamic updates
- [ ] Add ARIA labels to icon-only buttons
- [ ] Add ARIA descriptions to complex widgets

**ARIA Enhancement Specification:**

```typescript
// DecisionCard with ARIA
<div
  role="article"
  aria-labelledby={`decision-${decision.id}-title`}
  aria-describedby={`decision-${decision.id}-summary`}
>
  <h3 id={`decision-${decision.id}-title`} className="sr-only">
    Decision for {decision.venture_name} at Stage {decision.stage}
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
    {error && `Error: ${error.message}`}
  </div>

  {/* Action buttons with explicit labels */}
  <Button
    aria-label={`Approve ${decision.recommendation} for ${decision.venture_name}`}
    onClick={handleApprove}
  >
    Accept: {decision.recommendation}
  </Button>
</div>
```

**Live Region Patterns:**

```typescript
// Toast notifications should use aria-live
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {toastMessage}
</div>

// Urgent alerts should use assertive
<div
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
>
  {urgentAlert}
</div>

// Real-time updates (agents, tokens)
<div
  role="status"
  aria-live="polite"
  aria-atomic="false"
>
  {agentStatus}
</div>
```

---

## 5. Additional Best Practices

### 5.1 Screen Reader Testing

**Components to Test:**
- [ ] BriefingDashboard (full page navigation)
- [ ] DecisionStack (list of decisions)
- [ ] DecisionCard (individual decision)
- [ ] DecisionModal (modal focus trap)
- [ ] StageTimeline (25-stage visualization)
- [ ] QuickStatCard (metric announcements)
- [ ] RiskWidget (risk item drill-down)
- [ ] ActiveAgentsWidget (live status updates)

**Screen Readers to Test:**
- [ ] NVDA (Windows)
- [ ] JAWS (Windows)
- [ ] VoiceOver (macOS/iOS)
- [ ] TalkBack (Android)

**Test Scenarios:**
1. Navigate entire dashboard with keyboard only
2. Approve/reject decision with screen reader
3. Drill down to venture from decision card
4. Expand/collapse decision evidence
5. Navigate stage timeline
6. Hear live agent status updates

---

### 5.2 Reduced Motion

**Current Status:** ❌ NOT SPECIFIED

**Action Items:**
- [ ] Add `prefers-reduced-motion` media query support
- [ ] Identify all animations
- [ ] Provide static alternatives

**Components with Animations:**

| Component | Animation | Reduced Motion Alternative |
|-----------|-----------|----------------------------|
| ProgressRing | Stroke transition (500ms) | Instant update |
| StageNode | Pulse animation (in_progress) | Static blue dot |
| ActiveAgentsWidget | Bot icon pulse | Static icon |
| TokenBudgetBar | Width transition | Instant width change |
| DecisionCard | Expand/collapse transition | Instant expand |

**Implementation:**

```typescript
// useReducedMotion hook
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// Component usage
const prefersReducedMotion = useReducedMotion();

<circle
  className={`
    ${getColor(progress)}
    ${prefersReducedMotion ? '' : 'transition-all duration-500'}
  `}
  strokeDashoffset={offset}
/>
```

---

### 5.3 High Contrast Mode

**Current Status:** ⚠️ PARTIALLY SPECIFIED (dark mode, but not forced-colors)

**Action Items:**
- [ ] Add forced-colors media query support
- [ ] Test in Windows High Contrast Mode
- [ ] Ensure borders are visible in high contrast

**Implementation:**

```css
/* Ensure borders visible in forced-colors mode */
@media (forced-colors: active) {
  .decision-card {
    border: 1px solid CanvasText;
  }

  .health-badge {
    border: 1px solid CanvasText;
    forced-color-adjust: none; /* Use custom colors if critical */
  }
}
```

---

### 5.4 Zoom and Magnification

**Current Status:** ✅ SPECIFIED (Tailwind responsive typography)

**Test Cases:**
- [ ] 200% zoom (no horizontal scroll, all content accessible)
- [ ] 400% zoom (reflow to single column)
- [ ] Browser text size increase (ctrl/cmd +)
- [ ] OS-level zoom (macOS zoom, Windows Magnifier)

---

## 6. Automated Testing Strategy

### 6.1 CI/CD Integration

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    // Run axe-core on every test
    trace: 'on-first-retry',
  },
});

// e2e/chairman-dashboard.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Chairman Dashboard Accessibility', () => {
  test('should not have any automatically detectable accessibility issues', async ({ page }) => {
    await page.goto('/chairman');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have correct ARIA landmarks', async ({ page }) => {
    await page.goto('/chairman');

    // Check for main landmark
    const main = page.locator('main');
    await expect(main).toBeVisible();

    // Check for navigation landmark
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/chairman');

    // Tab to first decision
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip to content link
    await page.keyboard.press('Tab'); // First QuickStatCard

    // Check focus indicator is visible
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/chairman');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1); // Only one h1

    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingLevels = await headings.evaluateAll(elements =>
      elements.map(el => parseInt(el.tagName.substring(1)))
    );

    // Check no skipped levels (e.g., h1 → h3)
    for (let i = 1; i < headingLevels.length; i++) {
      expect(headingLevels[i] - headingLevels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  test('should announce decision submission to screen readers', async ({ page }) => {
    await page.goto('/chairman');

    // Click approve button
    await page.click('button:has-text("Accept")');

    // Check for live region announcement
    const announcement = page.locator('[role="status"]');
    await expect(announcement).toContainText(/submitting|submitted/i);
  });
});
```

---

### 6.2 Manual Testing Checklist

**Before Each Release:**

#### Keyboard Navigation
- [ ] Tab through entire dashboard without mouse
- [ ] All interactive elements focusable
- [ ] Focus order is logical
- [ ] Focus indicators always visible
- [ ] No keyboard traps
- [ ] Esc closes modals
- [ ] Enter activates buttons

#### Screen Reader
- [ ] Page structure announced correctly
- [ ] Landmarks navigable (main, nav, article)
- [ ] Headings navigable (h1-h6)
- [ ] Links announced with context
- [ ] Buttons announced with state
- [ ] Form inputs announced with labels
- [ ] Live regions announce updates
- [ ] Modals announce when opened

#### Visual
- [ ] All text readable at 200% zoom
- [ ] No horizontal scroll at 200% zoom
- [ ] Content reflows at 400% zoom
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible
- [ ] Error messages visible and descriptive

#### Touch
- [ ] All touch targets ≥44x44px
- [ ] Swipe gestures have keyboard alternatives
- [ ] Pinch zoom works (no user-scalable=no)
- [ ] Double-tap zoom works

---

## 7. Priority Matrix

| Priority | Issue | Impact | Effort | Deadline |
|----------|-------|--------|--------|----------|
| **P0** | Color contrast validation | High | Medium | Before dev |
| **P0** | Focus indicator specification | High | Low | Before dev |
| **P0** | ARIA live regions | High | Medium | Before dev |
| **P0** | Touch target enforcement | Medium | Low | Before dev |
| **P1** | Keyboard shortcuts | Medium | Medium | Sprint 1 |
| **P1** | Reduced motion support | Medium | Low | Sprint 1 |
| **P1** | Screen reader testing | High | High | Sprint 2 |
| **P2** | Skip links | Low | Low | Sprint 2 |
| **P2** | High contrast mode | Low | Medium | Sprint 3 |

---

## 8. Sign-Off Checklist

**Before Implementation:**
- [ ] All P0 issues addressed in specification
- [ ] Design tokens include contrast-validated colors
- [ ] ARIA patterns documented
- [ ] Keyboard shortcuts specified
- [ ] Touch targets enforced

**Before QA:**
- [ ] Automated axe-core tests passing
- [ ] Keyboard navigation smoke tests passing
- [ ] Focus indicators visible on all interactive elements

**Before Production:**
- [ ] Manual screen reader testing complete
- [ ] All WCAG 2.1 AA criteria verified
- [ ] High contrast mode tested
- [ ] Reduced motion tested
- [ ] Touch target sizes verified

---

**Document Version:** 1.0
**Created:** 2025-12-15
**Standard:** WCAG 2.1 Level AA
**Next Review:** After implementation (Sprint 2)
