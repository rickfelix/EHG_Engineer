---
category: feature
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [feature, auto-generated]
---
# Risk Re-calibration UI Components - Visual Guide



## Table of Contents

- [Metadata](#metadata)
- [Component Visual Reference](#component-visual-reference)
  - [1. RiskRecalibrationForm](#1-riskrecalibrationform)
  - [2. ChairmanReviewPanel](#2-chairmanreviewpanel)
  - [3. RiskGateDashboard](#3-riskgatedashboard)
  - [4. EscalationAlertBanner](#4-escalationalertbanner)
  - [5. RiskLevelBadge](#5-risklevelbadge)
  - [6. RiskDeltaIndicator](#6-riskdeltaindicator)
- [Color Palette Reference](#color-palette-reference)
  - [Risk Levels](#risk-levels)
  - [Risk Deltas](#risk-deltas)
  - [Gate Status](#gate-status)
  - [Chairman UI](#chairman-ui)
- [Responsive Behavior](#responsive-behavior)
  - [Mobile (< 640px)](#mobile-640px)
  - [Tablet (640px - 1024px)](#tablet-640px---1024px)
  - [Desktop (> 1024px)](#desktop-1024px)
- [Animation Reference](#animation-reference)
  - [Pulse Animation](#pulse-animation)
  - [Hover Effects](#hover-effects)
  - [Transition Effects](#transition-effects)
- [Icon Reference](#icon-reference)
- [Accessibility Annotations](#accessibility-annotations)
  - [Screen Reader Announcements](#screen-reader-announcements)
  - [Focus Management](#focus-management)
  - [Color Contrast](#color-contrast)

## Metadata
- **Category**: Feature
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: api, security, feature, guide

**SD**: SD-LIFECYCLE-GAP-005
**Created**: 2026-01-19

---

## Component Visual Reference

### 1. RiskRecalibrationForm

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ Risk Re-calibration: Gate 4                      [TruthEngine]          │
│    Validation → Development                                                 │
│    Previous Assessment: 01/01/2026                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Risk Categories                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Market Risk                                                                 │
│   Previous: [MEDIUM]   Current: [▼ LOW]   Delta: [↓ Improved]             │
│   Justification: [Validation complete, market proven____________]          │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Technical Risk                                                              │
│   Previous: [HIGH]     Current: [▼ MEDIUM] Delta: [↓ Improved]            │
│   Justification: [PoC delivered, tech stack validated_________]            │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Financial Risk                                                              │
│   Previous: [LOW]      Current: [▼ LOW]    Delta: [→ Stable]              │
│   Justification: [Runway stable at 18 months___________________]           │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Operational Risk                                                            │
│   Previous: [MEDIUM]   Current: [▼ HIGH]   Delta: [↑ Degraded]            │
│   Justification: [Team scaling pressure, 2 key hires needed___]            │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ New Risks                                          [+ Add New Risk]         │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ Category: [AI Dependency________] Level: [▼ MEDIUM]           [X]  │   │
│ │ Description: [Dependence on OpenAI API reliability____________]     │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ Resolved Risks                                [✓ Mark Risk Resolved]       │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ Category: [MVP Scope___________] Previous Level: [▼ HIGH]     [X]  │   │
│ │ Resolution: [MVP completed and validated with customers______]      │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Overall Assessment                                                          │
│   Risk Trajectory: [▼ IMPROVING]    Go Decision: [▼ GO]                   │
│                                                                             │
│ ⚠️  Chairman Review Required                                                │
│     2 HIGH risks detected. Chairman approval required (<24 hours).         │
│                                                                             │
│                                      [Cancel] [💾 Submit for Review]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Visual Features:**
- Blue gradient header with Shield icon
- Venture name badge (top right)
- Risk category rows with Previous/Current/Delta/Justification columns
- Green cards for resolved risks
- Amber alert for Chairman review requirement
- Submit button text changes based on escalation

---

### 2. ChairmanReviewPanel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👑 Chairman Review Required                           [⏰ 2h 15m]          │
│    Venture: TruthEngine | Gate 4                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ⚠️  Escalation Reason                                                       │
│     1 CRITICAL risk identified                                              │
│     Response Time Target: <4 hours                                          │
│     Time Elapsed: 2h 15m                                                    │
│                                                                             │
│ Risk Summary                                                                │
│ ┌─────────────────────────┐  ┌─────────────────────────┐                  │
│ │ ⚠️  CRITICAL Risks       │  │ ⚠️  HIGH Risks          │                  │
│ │    1                    │  │    2                    │                  │
│ └─────────────────────────┘  └─────────────────────────┘                  │
│                                                                             │
│ Critical Risks:                                                             │
│ • Technical: Platform integration failure risk                              │
│                                                                             │
│ [▼ Form Details ───────────────────────────────────────────────────]       │
│                                                                             │
│ ───────────────────────────────────────────────────────────────────────── │
│                                                                             │
│ Chairman Decision                                                           │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                     │
│ │ ✓ Approve     │ │ ✗ Reject      │ │ ↻ Request     │                     │
│ │               │ │               │ │   Revision    │                     │
│ └───────────────┘ └───────────────┘ └───────────────┘                     │
│                                                                             │
│ Decision Notes *                                                            │
│ [Approve with condition: Complete security audit before next_____]         │
│ [gate. Technical risk is acceptable with mitigation plan in______]         │
│ [place._________________________________________________10/2000]         │
│                                                                             │
│ ⚠️  Executive Decision Impact                                               │
│     This decision will be recorded in the audit trail and affect the       │
│     venture's phase transition. Approval will allow the venture to         │
│     proceed to the next phase.                                              │
│                                                                             │
│                                             [Cancel] [👑 Submit Decision]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Visual Features:**
- Amber/orange gradient header with Crown icon
- Time badge (top right) - turns red + pulses when overdue
- Escalation reason alert box
- Risk summary cards (red for CRITICAL, orange for HIGH)
- Three-button action selector (green/red/yellow)
- Warning alert for decision impact
- Submit button with Crown icon

---

### 3. RiskGateDashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ Risk Gates: TruthEngine                    [⚠️  1 Active Escalation]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ ✅  Gate 3 (Ideation → Validation)                   [PASSED] ⟩        │ │
│ │     Decision: GO                                                       │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ ⚠️  Gate 4 (Validation → Development)  [PENDING Chairman Review] ⟩    │ │
│ │     Decision: GO                                                       │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ ○  Gate 5 (Development → Scaling)                [Not Started]        │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │ ○  Gate 6 (Scaling → Exit)                       [Not Started]        │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Visual Features:**
- Blue gradient header with Shield icon
- Active escalations badge (red, top right)
- Gate rows with color-coded backgrounds:
  - Green (PASSED)
  - Amber (PENDING/ESCALATED)
  - Gray (NOT STARTED)
  - Red (REJECTED)
- Chevron right arrow for clickable rows
- Hover effect for interactive rows

---

### 4. EscalationAlertBanner

**Normal State** (within SLA):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👑  CRITICAL risk detected - Chairman + EVA review required                │
│                                                [⏰ 3h 45m remaining]        │
│                                                                             │
│     Venture: TruthEngine | Gate: 4 | SLA: <4 hours                        │
│                                                                             │
│                                              [Review Now ⟩]                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Critical State** (<1 hour remaining):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👑  CRITICAL risk detected - Chairman + EVA review required                │
│                                                [⏰ 0h 45m remaining]        │
│                                                                             │
│     Venture: TruthEngine | Gate: 4 | SLA: <4 hours                        │
│                                                                             │
│                                              [Review Now ⟩]                │
└─────────────────────────────────────────────────────────────────────────────┘
```
*Orange border/background instead of amber*

**Overdue State** (pulsing):
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 👑  CRITICAL risk detected - Chairman + EVA review required                │
│                                                [⏰ OVERDUE by 1h 20m]      │
│                                                                             │
│     Venture: TruthEngine | Gate: 4 | SLA: <4 hours                        │
│     ⚠️  Response time exceeded. Immediate action required.                 │
│                                                                             │
│                                              [Review Now ⟩]                │
└─────────────────────────────────────────────────────────────────────────────┘
```
*Red border/background with pulse animation*

**Key Visual Features:**
- Banner style (full width)
- Crown icon (left)
- Time badge (right) - changes color based on urgency
- Escalation message adapts to type (CRITICAL/HIGH/MULTIPLE_HIGH)
- Auto-updates every minute
- Pulse animation when overdue
- Large "Review Now" button

---

### 5. RiskLevelBadge

```
[CRITICAL]  <- Red background, red text, pulse animation
[HIGH]      <- Orange background, orange text
[MEDIUM]    <- Yellow background, yellow text
[LOW]       <- Green background, green text
```

**Usage Examples:**
```tsx
<RiskLevelBadge level="CRITICAL" />              // Full badge
<RiskLevelBadge level="HIGH" showLabel={false} /> // Icon only (if needed)
```

---

### 6. RiskDeltaIndicator

```
[↓ Improved]   <- Green background, TrendingDown icon
[→ Stable]     <- Gray background, Minus icon
[↑ Degraded]   <- Red background, TrendingUp icon
[★ New]        <- Blue background, Star icon
[✓ Resolved]   <- Emerald background, CheckCircle icon
```

**Usage Examples:**
```tsx
<RiskDeltaIndicator delta="IMPROVED" />              // Full indicator
<RiskDeltaIndicator delta="DEGRADED" size="lg" />   // Larger size
<RiskDeltaIndicator delta="NEW" showLabel={false} /> // Icon only
```

---

## Color Palette Reference

### Risk Levels
| Level | Background | Text | Border | Special |
|-------|-----------|------|--------|---------|
| CRITICAL | `bg-red-100` | `text-red-900` | `border-red-300` | `animate-pulse` |
| HIGH | `bg-orange-100` | `text-orange-900` | `border-orange-300` | - |
| MEDIUM | `bg-yellow-100` | `text-yellow-900` | `border-yellow-300` | - |
| LOW | `bg-green-100` | `text-green-900` | `border-green-300` | - |

### Risk Deltas
| Delta | Background | Text | Border | Icon |
|-------|-----------|------|--------|------|
| IMPROVED | `bg-green-100` | `text-green-700` | `border-green-300` | TrendingDown |
| STABLE | `bg-gray-100` | `text-gray-700` | `border-gray-300` | Minus |
| DEGRADED | `bg-red-100` | `text-red-700` | `border-red-300` | TrendingUp |
| NEW | `bg-blue-100` | `text-blue-700` | `border-blue-300` | Star |
| RESOLVED | `bg-emerald-100` | `text-emerald-700` | `border-emerald-300` | CheckCircle |

### Gate Status
| Status | Background | Icon | Icon Color |
|--------|-----------|------|------------|
| PASSED | `bg-green-50` | CheckCircle | `text-green-600` |
| PENDING | `bg-blue-50` | Clock | `text-blue-600` |
| ESCALATED | `bg-amber-50` | AlertTriangle | `text-amber-600` |
| NOT STARTED | `bg-gray-50` | Circle | `text-gray-400` |
| REJECTED | `bg-red-50` | XCircle | `text-red-600` |

### Chairman UI
| Element | Background | Text | Border |
|---------|-----------|------|--------|
| Header | `bg-gradient-to-r from-amber-50 to-orange-50` | `text-amber-900` | `border-amber-200` |
| Alert | `bg-amber-50` | `text-amber-800` | `border-amber-300` |
| Overdue | `bg-red-50` | `text-red-800` | `border-red-300` |

---

## Responsive Behavior

### Mobile (< 640px)
- Form fields stack vertically
- Risk category rows use single column layout
- Gate dashboard shows full cards (no grid)
- Escalation banner text wraps gracefully

### Tablet (640px - 1024px)
- Form fields use 2-column grid
- Risk category rows show Previous/Current side-by-side
- Gate dashboard uses 1-column card layout

### Desktop (> 1024px)
- Full multi-column layouts
- Risk category rows show all 4 columns (Previous/Current/Delta/Justification)
- Gate dashboard shows condensed row layout

---

## Animation Reference

### Pulse Animation
**Used for:**
- CRITICAL risk badges
- Overdue escalation banners
- Overdue time badges

**CSS:**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Hover Effects
**Used for:**
- Clickable gate rows (`hover:shadow-md hover:scale-[1.01]`)
- Buttons (`hover:bg-*-700` for primary colors)

### Transition Effects
**Used for:**
- All interactive elements (`transition-all`)
- Color changes on status updates

---

## Icon Reference

| Component | Icons Used | Source |
|-----------|-----------|--------|
| RiskRecalibrationForm | Shield, Plus, X, Save, CheckCircle, TrendingUp, TrendingDown | lucide-react |
| ChairmanReviewPanel | Crown, CheckCircle, XCircle, RotateCcw, AlertTriangle, Clock, ChevronDown, ChevronUp, Loader2 | lucide-react |
| RiskGateDashboard | Shield, CheckCircle, Clock, AlertTriangle, Circle, XCircle, ChevronRight | lucide-react |
| EscalationAlertBanner | Crown, Clock, AlertTriangle, ChevronRight | lucide-react |
| RiskDeltaIndicator | TrendingDown, TrendingUp, Minus, Star, CheckCircle | lucide-react |

---

## Accessibility Annotations

### Screen Reader Announcements
```tsx
// Example: EscalationAlertBanner
<Alert role="alert" aria-live="assertive">
  // Content announces immediately to screen readers
</Alert>

// Example: RiskGateDashboard gate rows
<div
  role="button"
  tabIndex={0}
  aria-label="Gate 4 (Validation to Development) - PENDING Chairman Review"
  onKeyPress={(e) => {
    if (e.key === "Enter" || e.key === " ") handleClick();
  }}
>
```

### Focus Management
All interactive elements have visible focus indicators via Tailwind's `focus:` utilities and CSS variables from existing codebase (e.g., `--focus-ring`).

### Color Contrast
All color combinations tested for WCAG 2.1 AA compliance:
- Normal text: ≥4.5:1 contrast ratio
- Large text: ≥3:1 contrast ratio
- Interactive elements: Clear visual differentiation

---

*Visual guide created 2026-01-19 for SD-LIFECYCLE-GAP-005 UI components.*
