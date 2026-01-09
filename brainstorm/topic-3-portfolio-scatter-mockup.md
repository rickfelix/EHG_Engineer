# Portfolio Scatter View Mockup Specification

**Date**: 2026-01-08
**Purpose**: Visual specification for the EHG Venture Evaluation Matrix primary dashboard view

---

## Desktop Layout (Primary)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  EHG VENTURE MATRIX                                          [Settings] [Export]   │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  PORTFOLIO HEALTH                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ Home Runs    │ │ Strategic    │ │ Cash Cows    │ │ Calibration  │              │
│  │     4        │ │ Bets: 2      │ │     1        │ │   Health     │              │
│  │    50%       │ │    25%       │ │    12%       │ │    ████░░    │              │
│  │  ▲ +1 MTD    │ │  ─ stable    │ │  ▼ -1 MTD    │ │     78%      │              │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘              │
│                                                                                    │
├───────────────────────────────────────────────────┬────────────────────────────────┤
│                                                   │                                │
│  SUCCESS        PORTFOLIO FRONTIER                │  ATTENTION REQUIRED            │
│  OUTLOOK                                          │                                │
│                                                   │  ┌────────────────────────┐   │
│  100% ┌─────────────────────────────────────┐    │  │ ⚠️  Venture C           │   │
│       │                      ●              │    │  │    Success dropped      │   │
│       │  CASH COWS     │    HOME RUNS       │    │  │    40-60% → 20-40%     │   │
│   80% │                │         ●          │    │  │    [Review]            │   │
│       │       ○        │              ●     │    │  └────────────────────────┘   │
│       │                │                    │    │                                │
│   60% ├────────────────┼────────────────────┤    │  ┌────────────────────────┐   │
│       │                │                    │    │  │ 🔴 Venture F           │   │
│       │                │         ◆          │    │  │    Constraint blocked  │   │
│   40% │                │                    │    │  │    Security Risk: HIGH │   │
│       │  DEAD ZONE     │   STRATEGIC BETS   │    │  │    [Escalate]          │   │
│       │                │              ◇     │    │  └────────────────────────┘   │
│   20% │                │                    │    │                                │
│       │       ✕        │                    │    │  ┌────────────────────────┐   │
│       │                │                    │    │  │ ⏰ Venture D           │   │
│    0% └─────────────────────────────────────┘    │  │    Expiry in 14 days   │   │
│        0      5      10      15      20     25   │  │    Mode: Exploration   │   │
│                                                   │  │    [Extend] [Kill]     │   │
│        CAPABILITY IMPACT (Plane 1)               │  └────────────────────────┘   │
│                                                   │                                │
│  LEGEND                                          │  3 items need attention        │
│  ● Constraint: Pass   ◆ Exploration mode         │                                │
│  ○ Constraint: Warn   ◇ Exploitation mode        │                                │
│  ✕ Constraint: Block  Size = Resource allocation │                                │
│                                                   │                                │
├───────────────────────────────────────────────────┴────────────────────────────────┤
│                                                                                    │
│  SELECTED: Truth Engine X                                      Quadrant: HOME RUN │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                             │  │
│  │  CAPABILITY          SUCCESS OUTLOOK         CONSTRAINTS      MODE          │  │
│  │  ┌────────────┐     ┌────────────┐          ┌──────────┐    ┌──────────┐   │  │
│  │  │     18     │     │   60-80%   │          │  ✅ PASS  │    │ Skewed   │   │  │
│  │  │    ━━━━━━  │     │   Medium   │          │          │    │ Explore  │   │  │
│  │  │    /25     │     │ confidence │          │ 0 blocks │    │          │   │  │
│  │  └────────────┘     └────────────┘          └──────────┘    └──────────┘   │  │
│  │                                                                             │  │
│  │  Top Driver: Strong market demand (+4 tailwind)                             │  │
│  │                                                                             │  │
│  │  [View Details]  [Compare]  [History]  [What-If Scenarios]                  │  │
│  │                                                                             │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
│  EVA RECOMMENDATION: PROCEED                          Confidence: HIGH            │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Portfolio Health Bar (Top)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Home Runs    │ │ Strategic    │ │ Cash Cows    │ │ Calibration  │
│     4        │ │ Bets: 2      │ │     1        │ │   Health     │
│    50%       │ │    25%       │ │    12%       │ │    ████░░    │
│  ▲ +1 MTD    │ │  ─ stable    │ │  ▼ -1 MTD    │ │     78%      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Metrics**:
- Count of ventures in each quadrant
- Percentage of portfolio
- Month-to-date trend (▲ up, ▼ down, ─ stable)
- Calibration health: How accurate are our Success Outlook predictions?

**Color Coding**:
- Home Runs: Gold/amber background
- Strategic Bets: Blue background
- Cash Cows: Green background
- Dead Zone: Not shown (should be 0)

---

### 2. Scatter Plot (Main)

**Axes**:
- X-axis: Capability Impact (Plane 1), range 0-25
- Y-axis: Success Outlook (%), range 0-100%
- Quadrant dividers: X=12.5 (or configurable), Y=60% (or configurable)

**Dot Encoding**:

| Visual | Meaning |
|--------|---------|
| **Color** | Constraint status (Plane 3) |
| Green (●) | All constraints pass |
| Yellow (○) | Warning - needs attention |
| Red (✕) | Blocked - cannot proceed |
| **Shape** | Exploration mode (Plane 4) |
| Circle (●○) | Exploration mode |
| Diamond (◆◇) | Exploitation mode |
| **Size** | Resource allocation (budget/attention) |
| Large | High resource allocation |
| Small | Low resource allocation |
| **Border** | Forecast confidence |
| Solid | High confidence |
| Dashed | Medium confidence |
| Dotted | Low confidence |

**Quadrant Labels**:

| Quadrant | Position | Color | Strategy |
|----------|----------|-------|----------|
| HOME RUNS | Upper right | Gold | Priority investment |
| STRATEGIC BETS | Lower right | Blue | Time-boxed, extraction milestones |
| CASH COWS | Upper left | Green | Exploit, strict ROI governance |
| DEAD ZONE | Lower left | Gray | Should be empty (reject/kill) |

**Interactions**:
- Hover: Show venture name + key metrics tooltip
- Click: Select venture, populate detail panel below
- Drag: Pan the view (if zoomed)
- Scroll: Zoom in/out
- Double-click quadrant: Filter to that quadrant only

---

### 3. Attention Queue (Right Sidebar)

```
┌────────────────────────┐
│ ⚠️  Venture C           │
│    Success dropped      │
│    40-60% → 20-40%     │
│    [Review]            │
└────────────────────────┘
```

**Alert Types**:

| Icon | Meaning | Action |
|------|---------|--------|
| ⚠️ | Warning - score changed significantly | Review |
| 🔴 | Blocked - constraint violation | Escalate |
| ⏰ | Expiring - exploration approaching deadline | Extend or Kill |
| 📉 | Declining - trending toward Dead Zone | Intervene |
| 🆕 | New - venture just added to portfolio | Evaluate |

**Display**:
- Max 5 items visible
- Sorted by urgency
- Click to select venture in scatter plot
- Action buttons inline

---

### 4. Selected Venture Panel (Bottom)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CAPABILITY          SUCCESS OUTLOOK         CONSTRAINTS      MODE          │
│  ┌────────────┐     ┌────────────┐          ┌──────────┐    ┌──────────┐   │
│  │     18     │     │   60-80%   │          │  ✅ PASS  │    │ Skewed   │   │
│  │    ━━━━━━  │     │   Medium   │          │          │    │ Explore  │   │
│  │    /25     │     │ confidence │          │ 0 blocks │    │          │   │
│  └────────────┘     └────────────┘          └──────────┘    └──────────┘   │
│                                                                             │
│  Top Driver: Strong market demand (+4 tailwind)                             │
│                                                                             │
│  [View Details]  [Compare]  [History]  [What-If Scenarios]                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Components**:

**Capability Gauge**:
- Large number (score out of 25)
- Horizontal bar showing fill
- Color: Green (≥15), Yellow (10-14), Red (<10)

**Success Outlook Gauge**:
- Bucketed range (60-80%)
- Confidence level (Low/Medium/High)
- Color: Green (≥60%), Yellow (40-59%), Red (<40%)

**Constraints Badge**:
- Pass (✅) / Warn (⚠️) / Block (🔴)
- Count of blocks/warnings

**Mode Badge**:
- Exploration / Exploitation / Balanced
- If exploration: days until expiry

**Top Driver**:
- Single most important factor (from Success Outlook evidence)

**Actions**:
- View Details: Opens full four-plane breakdown
- Compare: Opens side-by-side comparison with another venture
- History: Shows score evolution over time
- What-If: Scenario modeling

---

## Alternative Views

### Compact Table View (Toggle)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ VENTURE          │ CAP │ SUCCESS  │ QUADRANT      │ CONSTRAINT │ ACTION     │
├──────────────────┼─────┼──────────┼───────────────┼────────────┼────────────┤
│ Truth Engine X   │  18 │ 60-80%   │ 🟡 Home Run   │ ✅ Pass     │ [Details]  │
│ Reguard          │  22 │ 40-60%   │ 🔵 Strat Bet  │ ✅ Pass     │ [Details]  │
│ FlexiQuote       │   8 │ 80-100%  │ 🟢 Cash Cow   │ ⚠️ Warn     │ [Review]   │
│ Venture C        │  16 │ 20-40%   │ 🔵 Strat Bet  │ ✅ Pass     │ [Details]  │
│ Venture F        │  14 │ 60-80%   │ 🟡 Home Run   │ 🔴 Block    │ [Escalate] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Toggle between Scatter and Table with button in header.

---

### Trend View (Drill-Down)

```
                    PORTFOLIO TREND (6 MONTHS)

  % Portfolio
  100% ┌─────────────────────────────────────────────┐
       │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
   80% │░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  ▓ Home Runs
       │████████████████████████████████████████████│  ░ Strategic Bets
   60% │                                            │  █ Cash Cows
       │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  ▒ (Dead Zone = 0)
   40% │                                            │
       │                                            │
   20% │                                            │
       │                                            │
    0% └─────────────────────────────────────────────┘
        Aug    Sep    Oct    Nov    Dec    Jan

  INSIGHT: Home Runs increased from 35% to 50% over 6 months ✅
```

---

## Mobile Layout

```
┌─────────────────────────┐
│ EHG PORTFOLIO      [≡]  │
├─────────────────────────┤
│                         │
│  PORTFOLIO HEALTH       │
│  ┌─────────────────┐    │
│  │ 🟡 4  🔵 2  🟢 1 │    │
│  │ HR   SB   CC    │    │
│  └─────────────────┘    │
│  Calibration: 78% ✓     │
│                         │
├─────────────────────────┤
│                         │
│  ⚠️ 3 NEED ATTENTION    │
│  ┌───────────────────┐  │
│  │ Venture C  ⚠️     │  │
│  │ Success ↓ 20-40%  │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Venture F  🔴     │  │
│  │ Blocked           │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Venture D  ⏰     │  │
│  │ Expires 14d       │  │
│  └───────────────────┘  │
│                         │
├─────────────────────────┤
│                         │
│  [View Full Matrix]     │
│                         │
└─────────────────────────┘
```

**Mobile Philosophy**:
- Focus on attention queue (what needs action NOW)
- Portfolio health summary at a glance
- Full matrix available but not default
- Swipe cards to take action

---

## Color Palette

**Dark Mode (Primary)**:

| Element | Color | Hex |
|---------|-------|-----|
| Background | Near black | #0D1117 |
| Card background | Dark gray | #161B22 |
| Text primary | Off-white | #E6EDF3 |
| Text secondary | Gray | #8B949E |
| Quadrant lines | Subtle gray | #30363D |
| Home Run | Gold | #F0B429 |
| Strategic Bet | Blue | #58A6FF |
| Cash Cow | Green | #3FB950 |
| Dead Zone | Gray | #6E7681 |
| Warning | Yellow | #D29922 |
| Block/Error | Red | #F85149 |
| Pass/Success | Green | #3FB950 |

---

## Interaction States

**Hover on Dot**:
```
┌──────────────────────────┐
│ Truth Engine X           │
│ ─────────────────────    │
│ Capability: 18/25        │
│ Success: 60-80% (Med)    │
│ Quadrant: Home Run       │
│ Status: Proceed          │
└──────────────────────────┘
```

**Selected Dot**:
- Larger size
- Glow/highlight ring
- Connected to detail panel below

**Drag Selection**:
- Lasso select multiple ventures
- Show aggregate stats for selection

---

## Empty States

**No Ventures**:
```
┌─────────────────────────────────────────┐
│                                         │
│           No ventures yet               │
│                                         │
│     Add your first venture to see       │
│     the portfolio matrix                │
│                                         │
│         [+ Add Venture]                 │
│                                         │
└─────────────────────────────────────────┘
```

**All Clear (No Attention Items)**:
```
┌────────────────────────┐
│                        │
│   ✅ All Clear         │
│                        │
│   No items need        │
│   attention right now  │
│                        │
└────────────────────────┘
```

---

## Technical Notes

**Performance**:
- Scatter plot: Use canvas/WebGL for >50 ventures
- Lazy load venture details on selection
- Cache portfolio health calculations

**Accessibility**:
- Keyboard navigation for scatter plot (arrow keys)
- Screen reader announces quadrant on focus
- High contrast mode option
- Don't rely solely on color (use shapes)

**Responsiveness**:
- Desktop: Full scatter + sidebar + detail panel
- Tablet: Scatter + collapsible sidebar
- Mobile: Attention queue primary, scatter on demand

---

*Portfolio Scatter View Mockup Specification*
*Created: 2026-01-08*
*For implementation in EHG Venture Evaluation Matrix*
