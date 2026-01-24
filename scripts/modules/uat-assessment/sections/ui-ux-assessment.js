/**
 * UAT Assessment Template - UI/UX Assessment Section
 * Section 3: Design system compliance, issues, accessibility, responsive design
 *
 * @module uat-assessment/sections/ui-ux-assessment
 */

export const uiUxAssessmentSection = `
## 3. UI/UX ASSESSMENT

### Design System Compliance

#### Component Library (Shadcn/UI)
- **Card System**: Consistent use of Card, CardHeader, CardTitle, CardContent
- **Badges**: Proper variant system (default, destructive, secondary, outline)
- **Buttons**: Size and variant props correctly applied
- **Tabs**: TabsList, TabsTrigger, TabsContent with proper ARIA
- **Progress Bars**: Uniform styling with venture color scheme
- **ScrollArea**: Used for overflow handling in alerts

#### Color Palette
- **Primary Colors**: venture-blue, venture-success, venture-danger (from tailwind.config.ts)
- **Alert Urgency Colors**:
  - Critical: red-500 border, red-50 background, red-100/red-800 badge
  - High: orange-500 border, orange-50 background, orange-100/orange-800 badge
  - Medium: yellow-500 border, yellow-50 background, yellow-100/yellow-800 badge
  - Low: blue-500 border, blue-50 background, blue-100/blue-800 badge
- **Semantic Usage**: Colors map correctly to urgency levels
- **Consistency**: venture-* colors used throughout metrics and charts

#### Typography Hierarchy
- **Page Title**: text-3xl font-bold with gradient (from-primary to-primary/70)
- **Metric Values**: text-2xl font-bold
- **Card Titles**: text-sm font-medium (may be too small - see issues below)
- **Alert Titles**: text-sm font-medium leading-tight
- **Alert Descriptions**: text-xs text-muted-foreground
- **Body Text**: Consistent use of muted-foreground for secondary text

#### Spacing & Layout
- **Grid System**: Responsive grid (cols-1 -> md:cols-2 -> lg:cols-4)
- **Gap Spacing**: Consistent gap-4 and gap-6 usage
- **Card Padding**: Standard CardHeader and CardContent padding
- **Section Spacing**: space-y-6 between major sections

### UI/UX Issues Identified

#### Issue 1: Alert Card Title Size
- **Location**: ExecutiveAlerts component
- **Problem**: Alert titles use text-sm which may be too small for scan-ability
- **Impact**: Reduces readability for executives quickly scanning alerts
- **Recommendation**: Consider text-base or text-md for titles
- **Priority**: MEDIUM

#### Issue 2: Priority Alerts Fixed Height
- **Location**: \`ExecutiveAlerts.tsx\` line 126
- **Problem**: \`<ScrollArea className="h-80">\` creates fixed 320px height
- **Impact**:
  - May cut off alerts with long content
  - Wastes space when few alerts present
  - Doesn't adapt to content needs
- **Related**: This is the issue noted in MANUAL-DASHBOARD-MG5GGDV0
- **Recommendation**: Use min-h-64 max-h-96 or dynamic height calculation
- **Priority**: HIGH

#### Issue 3: Export/Configure Button Functionality Unknown
- **Location**: \`ChairmanDashboard.tsx\` lines 184-191
- **Problem**: Buttons present but no onClick handlers visible in code
- **Impact**: May be non-functional placeholders
- **Testing Required**: Verify buttons do something or show appropriate disabled state
- **Priority**: MEDIUM

#### Issue 4: Hard-Coded Data Misleading
- **Location**: Portfolio Performance Summary
- **Problem**: Displays static counts that don't reflect actual data
- **Impact**: Executives may make decisions based on incorrect information
- **User Experience**: Undermines trust in the dashboard
- **Priority**: CRITICAL

#### Issue 5: Tab Content Density Varies
- **Observation**: Some tabs (Overview) are dense with multiple widgets, others may be sparse
- **Impact**: Inconsistent information density across views
- **Testing Required**: Verify all 6 tabs have appropriate content depth
- **Priority**: LOW (natural variation is acceptable)

### Accessibility Assessment (WCAG 2.1 AA)

#### Implemented Accessibility Features
- **Skip Navigation**: \`<SkipNavigation />\` present in AuthenticatedLayout
- **Navigation Announcer**: \`<NavigationAnnouncer />\` for screen readers
- **Enhanced Keyboard Nav**: \`useEnhancedKeyboardNavigation()\` hook active
- **Semantic HTML**: Proper heading hierarchy, main element with role="main"
- **Focus Management**: SidebarTrigger and interactive elements are proper buttons
- **Responsive Design**: Mobile-first approach with touch-friendly targets

#### Missing Accessibility Features

##### Screen Reader Support
- **Missing ARIA Labels**:
  - Export Report button (line 184): \`<Download className="w-4 h-4 mr-2" />\` - icon needs aria-label
  - Configure button (line 188): \`<Settings className="w-4 h-4 mr-2" />\` - icon needs aria-label
  - Alert category icons (ExecutiveAlerts.tsx lines 78-92): Icons need aria-labels
- **Missing ARIA Live Regions**:
  - Priority Alerts: Should have \`aria-live="polite"\` for real-time updates
  - Metric cards: Should announce value changes to screen readers
- **Missing Role Descriptions**:
  - Tabs: Should have aria-label describing dashboard sections
  - Metric cards: Should have aria-describedby for trend information

##### Keyboard Navigation
- **Testing Required**:
  - [ ] Tab order through all interactive elements
  - [ ] Focus indicators visible and high-contrast
  - [ ] No keyboard traps in modals or overlays
  - [ ] Escape key closes modals/dropdowns
  - [ ] Arrow keys work in tab navigation
  - [ ] Enter/Space activates buttons

##### Color Contrast
- **Testing Required**:
  - [ ] Badge text on colored backgrounds (red/orange/yellow/blue)
  - [ ] Alert text on tinted backgrounds (bg-red-50, bg-orange-50, etc.)
  - [ ] muted-foreground text contrast
  - [ ] Link colors in all states (default, hover, visited, focus)
- **Tool**: Use browser DevTools or WAVE extension for automated checks
- **Target**: 4.5:1 for normal text, 3:1 for large text

### Responsive Design Analysis

#### Breakpoint Strategy
- **Mobile**: Default (< 640px) - Single column, collapsed sidebar
- **Tablet**: md (768px) - 2 columns for metric cards
- **Laptop**: lg (1024px) - 4 columns for metrics, 2-3 columns for content
- **Desktop**: xl (1280px+) - Full 4-column layout

#### Responsive Components
- **Sidebar**: Collapses to overlay on mobile (SidebarTrigger)
- **Header**: Stacks vertically on small screens
- **Metric Cards**: Grid adapts from 1 -> 2 -> 4 columns
- **Tabs**: Grid adapts from 2 -> 6 columns with text hiding on sm breakpoints

#### Responsive Concerns
- **Tab Labels**: Hidden on small screens (\`<span className="hidden sm:inline">\`)
  - May confuse users if only icons shown
  - Needs testing for icon-only comprehension
- **Priority Alerts**: Fixed height may be problematic on mobile (less vertical space)
- **Table Data**: If present in sub-components, may need horizontal scroll
- **Long Text**: Alert descriptions and venture names may wrap awkwardly on narrow screens

---`;
