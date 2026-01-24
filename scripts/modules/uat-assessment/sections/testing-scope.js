/**
 * UAT Assessment Template - Testing Scope Section
 * Manual UAT testing checklists for all functionality
 *
 * @module uat-assessment/sections/testing-scope
 */

export const testingScopeSection = `
## TESTING SCOPE FOR MANUAL UAT

### 1. Navigation & Page Load Testing

#### [ ] Sidebar Navigation
- [ ] Click "Chairman Console" link in sidebar
- [ ] Verify navigation to \`/chairman\` route
- [ ] Confirm active state indicator on sidebar item
- [ ] Test keyboard shortcut (if configured)
- [ ] Test breadcrumb updates correctly
- **Expected**: Instant navigation, active state visible, breadcrumb shows "Chairman Console"

#### [ ] Default Redirect
- [ ] Log in with valid credentials
- [ ] Observe automatic redirect
- **Expected**: Redirects to \`/chairman\` (not \`/\` or other page)

#### [ ] Page Load Performance
- [ ] Measure initial page load time (DevTools Network tab)
- [ ] Check for loading skeleton states
- [ ] Verify Suspense fallback displays
- **Target**: < 3 seconds to interactive on standard connection

#### [ ] Error Handling
- [ ] Disconnect network and try to load page
- [ ] Observe error state
- [ ] Reconnect and verify recovery
- **Expected**: Graceful error message, retry mechanism

### 2. Authentication & Authorization Testing

#### [ ] Unauthenticated Access
- [ ] Log out completely
- [ ] Attempt to navigate directly to \`/chairman\`
- **Expected**: Redirect to \`/login\` page

#### [ ] Session Timeout
- [ ] Log in and remain idle for configured timeout period
- [ ] Attempt to interact with dashboard
- **Expected**: Session expires, prompt to re-authenticate

#### [ ] Role-Based Access (If Applicable)
- [ ] Log in with non-executive account (if roles exist)
- [ ] Attempt to access Chairman Console
- **Expected**: Access denied or limited view

### 3. Company Filtering Testing

#### [ ] Company Selector Functionality
- [ ] Open CompanySelector dropdown
- [ ] Verify all companies are listed
- [ ] Select a specific company
- [ ] Observe dashboard update
- **Expected**: All metrics and alerts filter to selected company

#### [ ] "All Companies" View
- [ ] Select "All" in CompanySelector
- [ ] Verify aggregated data displays
- **Expected**: Metrics sum across all companies

#### [ ] Filter Propagation
- [ ] Select Company A
- [ ] Check all 4 metric cards show Company A data
- [ ] Check Priority Alerts show Company A alerts
- [ ] Switch to Overview tab widgets
- [ ] Switch to Portfolio tab
- [ ] Switch to other tabs (KPIs, Financial, Operations, Intelligence)
- **Expected**: All components respect selected company filter

#### [ ] Filter Persistence
- [ ] Select Company B
- [ ] Switch between tabs
- [ ] Refresh page
- **Expected**: Selected company persists across tabs, resets on page refresh

### 4. Executive Overview Cards Testing

#### [ ] Portfolio Value Card
- [ ] Verify numerical value displays
- [ ] Check currency formatting (e.g., $42.5M)
- [ ] Verify trend indicator (up/down arrow)
- [ ] Check percentage change value
- [ ] Hover for additional details (if applicable)
- **Data Validation**: Compare with actual venture count x $1M calculation

#### [ ] Active Ventures Card
- [ ] Verify count displays
- [ ] Check sub-value (final stage ventures count)
- [ ] Verify count matches ventures with status="active"
- **Data Validation**: Cross-reference with Ventures page count

#### [ ] Success Rate Card
- [ ] Verify percentage displays
- [ ] Check trend indicator
- [ ] Verify percentage change value
- [ ] Confirm calculation: (active + completed) / total x 100
- **Data Validation**: Manual calculation from ventures data

#### [ ] At Risk Card
- [ ] Verify count displays
- [ ] Check trend indicator (note: increase is negative trend)
- [ ] Verify change count (not percentage)
- [ ] Confirm count matches ventures with status IN ('paused', 'cancelled')
- **Data Validation**: Cross-reference with paused/cancelled ventures

#### [ ] Loading States
- [ ] Observe skeleton loaders on initial page load
- [ ] Verify 4 skeleton cards display
- [ ] Check smooth transition to real data
- **Expected**: No layout shift when data loads

#### [ ] Empty States
- [ ] Test with company that has 0 ventures
- [ ] Verify graceful handling (0 values, not errors)
- **Expected**: Cards display 0 with appropriate messaging

### 5. Priority Alerts Testing

#### [ ] Alert Display
- [ ] Verify Priority Alerts card renders
- [ ] Check alert count badges (Critical, High)
- [ ] Verify urgency-based color coding
- [ ] Check category icons (Financial, Risk, Operational, Strategic, Opportunity)
- [ ] Verify relative timestamps ("2 hours ago")
- [ ] Check ScrollArea scrollbar appears if >10 alerts

#### [ ] Alert Content
- [ ] Read alert title (should be clear and scannable)
- [ ] Read alert description (provides context)
- [ ] Verify venture/company name badge
- [ ] Verify urgency level badge
- [ ] Check "Action Required" button displays when needed

#### [ ] Real-Time Updates
- [ ] Wait 30 seconds (auto-refresh interval)
- [ ] Verify new alerts appear (if any)
- [ ] Check alert count badges update
- **Testing Tip**: Create a test alert in database to observe update

#### [ ] Interactions
- [ ] Click "Action Required" button
- [ ] Verify navigation or action occurs
- [ ] Click "View All X Alerts" button at bottom
- [ ] Verify navigation to full notifications page
- **Expected**: Buttons are functional (not placeholders)

#### [ ] Empty State
- [ ] Test with company that has no alerts
- [ ] Verify empty state displays
- **Expected**: "No alerts at this time" message with icon

#### [ ] Layout Issue Verification (CRITICAL TEST)
- [ ] Observe Priority Alerts section in 3-column grid
- [ ] Check if component height fits properly
- [ ] Test with varying alert counts (1, 5, 10+)
- [ ] Test with long alert titles and descriptions
- [ ] Test responsive behavior (tablet, mobile)
- **Known Issue**: Fixed height may cause layout problems
- **Expected After Fix**: Dynamic height, no overflow/cutoff

### 6. Tab Navigation Testing

#### [ ] Tab Switching
- [ ] Click each of the 6 tabs in order
- [ ] Verify tab content changes
- [ ] Check active tab indicator (underline/highlight)
- [ ] Verify no layout shifts during transitions
- **Tabs**: Overview, Portfolio, KPIs, Financial, Operations, Intelligence

#### [ ] Keyboard Navigation
- [ ] Tab to tab list (focus on first tab)
- [ ] Use arrow keys to move between tabs
- [ ] Press Enter/Space to activate tab
- [ ] Tab into content area
- **Expected**: Full keyboard accessibility

#### [ ] Tab Icons
- [ ] On mobile (< 640px), verify icons display
- [ ] Check if icon-only labels are comprehensible
- [ ] On desktop, verify icon + text label display
- **Consideration**: Icon-only mode may need tooltips

#### [ ] Tab Content Loading
- [ ] Switch to each tab
- [ ] Verify content loads (not blank)
- [ ] Check for loading spinners if async data
- [ ] Verify error handling if data fails
- **Expected**: All tabs have meaningful content (no "Coming Soon" except Decision Support)

### 7. Overview Tab Components Testing

#### [ ] Performance Drive Cycle
- [ ] Verify component renders
- [ ] Check data visualization accuracy
- [ ] Test interactions (hover, click, etc.)
- **Backend Verification Needed**: Confirm data source

#### [ ] AI Strategic Insights
- [ ] Verify insights display
- [ ] Check insight quality/relevance
- [ ] Verify refresh mechanism
- **Backend Verification Needed**: Real AI vs mock data?

#### [ ] Synergy Opportunities
- [ ] Verify opportunities display
- [ ] Check synergy descriptions
- [ ] Test if clickable (links to ventures)
- **Backend Verification Needed**: Confirm algorithm

#### [ ] Portfolio Performance Summary
- [ ] **CRITICAL**: Verify stage counts (Ideation, Validation, Development, Launch, Growth)
- [ ] **KNOWN ISSUE**: Currently hard-coded (23, 31, 28, 34, 11)
- [ ] **TEST**: Change venture stages in database, refresh page
- [ ] **EXPECTED AFTER FIX**: Counts update dynamically
- [ ] Check gradient bar display
- [ ] Verify Team Utilization section
- [ ] **KNOWN ISSUE**: Utilization percentages hard-coded (87%, 73%)
- [ ] Click "View detailed operations ->" link
- **Expected After Fixes**: All data is dynamic and accurate

### 8. Portfolio Tab Testing

#### [ ] Content Presence
- [ ] Switch to Portfolio tab
- [ ] Verify VenturePortfolioOverview component loads
- [ ] Check for venture listings
- [ ] Test filters/sorting (if present)
- [ ] Test pagination (if present)
- **Backend Verification Needed**: Confirm integration

#### [ ] Detailed View
- [ ] Click on individual venture (if clickable)
- [ ] Verify navigation to venture detail
- [ ] Test back navigation
- **Expected**: Deep linking works correctly

### 9. KPIs Tab Testing

#### [ ] Content Presence
- [ ] Switch to KPIs tab
- [ ] Verify StrategicKPIMonitor component loads
- [ ] Check for KPI cards/tables
- [ ] Verify target vs actual displays
- [ ] Check trend indicators
- **Backend Verification Needed**: Confirm data source

#### [ ] KPI Interactions
- [ ] Test sorting (if present)
- [ ] Test filtering by KPI type (if present)
- [ ] Test time period selection (if present)
- **Expected**: Interactive KPI management

### 10. Financial Tab Testing

#### [ ] Content Presence
- [ ] Switch to Financial tab
- [ ] Verify FinancialAnalytics component loads
- [ ] Check for financial charts/metrics
- [ ] Verify currency formatting
- [ ] Check time series data (if present)
- **Backend Verification Needed**: Confirm integration

#### [ ] Financial Calculations
- [ ] Verify revenue, costs, ROI calculations
- [ ] Check for data consistency with other views
- [ ] Test export/print functionality (if present)
- **Data Validation**: Cross-check with source financial records

### 11. Operations Tab Testing

#### [ ] Content Presence
- [ ] Switch to Operations tab
- [ ] Verify OperationalIntelligence component loads
- [ ] Check for operational metrics
- [ ] Verify team/resource utilization displays
- [ ] Check for operational KPIs
- **Backend Verification Needed**: Confirm integration

#### [ ] Operational Data
- [ ] Verify team utilization (should NOT be hard-coded 87%/73%)
- [ ] Check resource allocation displays
- [ ] Verify operational efficiency metrics
- **Expected**: Real operational data, not placeholders

### 12. Intelligence Tab Testing

#### [ ] AI Insights Section
- [ ] Verify AIInsightsEngine displays
- [ ] Check insight quality and relevance
- [ ] Test refresh/regenerate functionality (if present)

#### [ ] Strategic Decision Support (KNOWN PLACEHOLDER)
- [ ] Verify placeholder card displays
- [ ] Check "Coming in next update" message
- [ ] Confirm Gauge icon displays
- [ ] **DECISION NEEDED**: Implement, remove, or keep placeholder
- **Expected**: Honest placeholder or functional feature

### 13. Header Components Testing

#### [ ] Global Search
- [ ] Type query in HeaderSearch input
- [ ] Verify search results display
- [ ] Test clicking result to navigate
- [ ] Test search scope (all entities)
- **Expected**: Quick navigation to ventures, portfolios, etc.

#### [ ] Breadcrumb Navigation
- [ ] Verify breadcrumb displays "Chairman Console"
- [ ] Check if breadcrumb updates when drilling down (if applicable)
- [ ] Test clicking breadcrumb segments to navigate
- **Expected**: Accurate location indicator

#### [ ] Keyboard Shortcuts
- [ ] Click KeyboardShortcuts icon/button
- [ ] Verify shortcut reference modal opens
- [ ] Check if shortcuts are documented
- [ ] Test actual shortcuts (if configured)
- **Expected**: Help dialog with shortcut list

#### [ ] Dark Mode Toggle
- [ ] Click DarkModeToggle
- [ ] Verify theme switches (light <-> dark)
- [ ] Check all components adapt to theme
- [ ] Verify persistence (reload page)
- **Expected**: Smooth theme transition, no broken styles

#### [ ] User Menu
- [ ] Click UserMenu dropdown
- [ ] Verify Profile option displays
- [ ] Verify Settings option displays
- [ ] Verify Logout option displays
- [ ] Test logout functionality
- **Expected**: Dropdown works, logout redirects to login

### 14. Export/Configure Buttons Testing

#### [ ] Export Report Button
- [ ] Click "Export Report" button
- [ ] **IF IMPLEMENTED**: Verify report generates
- [ ] **IF IMPLEMENTED**: Check report format (PDF, Excel, etc.)
- [ ] **IF IMPLEMENTED**: Verify report contains current filtered data
- [ ] **IF PLACEHOLDER**: Verify disabled state or "Coming Soon" tooltip
- **Backend Verification Needed**: Confirm functionality exists

#### [ ] Configure Button
- [ ] Click "Configure" button
- [ ] **IF IMPLEMENTED**: Verify configuration modal opens
- [ ] **IF IMPLEMENTED**: Test dashboard customization options
- [ ] **IF IMPLEMENTED**: Verify changes save and persist
- [ ] **IF PLACEHOLDER**: Verify disabled state or "Coming Soon" tooltip
- **Backend Verification Needed**: Confirm functionality exists

### 15. Responsive Design Testing

#### [ ] Mobile Portrait (375px x 667px)
- [ ] Verify sidebar collapses to overlay
- [ ] Check SidebarTrigger (hamburger menu) works
- [ ] Verify metric cards stack to 1 column
- [ ] Check tab labels (icon-only on small screens)
- [ ] Test Priority Alerts scrolling
- [ ] Verify header components stack/hide appropriately
- [ ] Check touch targets are >=44px x 44px
- **Device**: Test on actual mobile device or DevTools emulation

#### [ ] Tablet Portrait (768px x 1024px)
- [ ] Verify metric cards display in 2 columns
- [ ] Check sidebar remains visible or easily toggleable
- [ ] Verify tab labels display (not just icons)
- [ ] Check Priority Alerts layout
- [ ] Test all interactions work with touch
- **Device**: Test on iPad or similar

#### [ ] Laptop (1024px x 768px)
- [ ] Verify metric cards display in 4 columns
- [ ] Check sidebar always visible
- [ ] Verify all tab labels display
- [ ] Check Priority Alerts in 3-column grid
- [ ] Test all components fit without horizontal scroll
- **Device**: Standard laptop screen

#### [ ] Desktop (1920px x 1080px)
- [ ] Verify layout uses full width appropriately
- [ ] Check no excessive whitespace
- [ ] Verify all components scale well
- [ ] Check font sizes remain readable
- **Device**: Large monitor

### 16. Accessibility Testing

#### [ ] Screen Reader Testing
- [ ] Use NVDA (Windows) or VoiceOver (Mac)
- [ ] Navigate through entire page with Tab key
- [ ] Verify all interactive elements are announced
- [ ] Check alert updates are announced (aria-live)
- [ ] Verify metric card values are announced
- [ ] Check tab labels are announced correctly
- **Expected**: Full page navigable and comprehensible via screen reader

#### [ ] Keyboard-Only Navigation
- [ ] Disconnect mouse/trackpad
- [ ] Tab through all interactive elements
- [ ] Verify focus indicators are visible
- [ ] Test tab switching with arrow keys
- [ ] Test dropdown navigation with arrow keys
- [ ] Press Escape to close modals/dropdowns
- [ ] Test Enter/Space to activate buttons
- **Expected**: All functionality accessible via keyboard

#### [ ] Color Contrast
- [ ] Use browser DevTools or WAVE extension
- [ ] Check all text against backgrounds
- [ ] Verify badge text on colored backgrounds
- [ ] Check alert text on tinted backgrounds
- [ ] Test both light and dark modes
- **Target**: WCAG AA - 4.5:1 for normal text, 3:1 for large text

#### [ ] Zoom & Text Scaling
- [ ] Zoom to 200% (Ctrl/Cmd + +)
- [ ] Verify no horizontal scrolling
- [ ] Check text remains readable
- [ ] Verify components don't overlap
- [ ] Test browser text scaling (Settings)
- **Expected**: Layout adapts, content remains accessible

### 17. Performance Testing

#### [ ] Load Time
- [ ] Clear browser cache
- [ ] Hard reload page (Ctrl+Shift+R)
- [ ] Measure time to interactive (DevTools Performance tab)
- **Target**: < 3 seconds on standard connection

#### [ ] Data Refresh Performance
- [ ] Monitor network requests during 30-second auto-refresh
- [ ] Check if queries are optimized (no N+1 queries)
- [ ] Verify no unnecessary re-renders
- [ ] Use React DevTools Profiler
- **Expected**: Efficient queries, smooth UI updates

#### [ ] Large Dataset Handling
- [ ] Test with company that has 100+ ventures
- [ ] Verify page remains responsive
- [ ] Check if pagination is implemented
- [ ] Test scrolling performance
- **Expected**: No performance degradation with large datasets

#### [ ] Concurrent Users (If Possible)
- [ ] Simulate multiple users accessing dashboard
- [ ] Monitor database load
- [ ] Check for race conditions
- [ ] Verify data isolation
- **Expected**: System remains stable under load

### 18. Data Accuracy Testing

#### [ ] Cross-Reference with Source Data
- [ ] Open Ventures page in another tab
- [ ] Count actual active ventures
- [ ] Compare with Active Ventures metric card
- [ ] **Expected**: Counts match exactly

#### [ ] Company Filter Accuracy
- [ ] Select Company X
- [ ] Note Portfolio Value
- [ ] Manually sum ventures for Company X
- [ ] **Expected**: Calculated value matches displayed value

#### [ ] Alert Source Verification
- [ ] Review chairman_feedback table in database
- [ ] Check for recent critical/high alerts
- [ ] Verify alerts appear in Priority Alerts section
- [ ] **Expected**: Database alerts match displayed alerts

#### [ ] Success Rate Calculation
- [ ] Count ventures with status='active' or 'completed'
- [ ] Count total ventures
- [ ] Calculate (successful / total) x 100
- [ ] **Expected**: Matches Success Rate card value

### 19. Error State Testing

#### [ ] Network Failure
- [ ] Disconnect network
- [ ] Observe error messages
- [ ] Reconnect network
- [ ] Verify automatic recovery or retry button
- **Expected**: Graceful degradation, clear error messaging

#### [ ] Invalid Company Selection
- [ ] Manually set invalid company ID in URL/state
- [ ] Observe error handling
- [ ] **Expected**: Fallback to "all companies" or clear error

#### [ ] Empty Data States
- [ ] Test with new company (no ventures)
- [ ] Verify empty state messages display
- [ ] Check for helpful guidance ("Get started" messages)
- [ ] **Expected**: Friendly empty states, not errors

#### [ ] Query Timeout
- [ ] Simulate slow network (DevTools throttling)
- [ ] Observe loading states
- [ ] Verify timeout handling (if configured)
- [ ] **Expected**: Loading indicators, timeout errors after reasonable wait

### 20. Security Testing

#### [ ] Unauthorized Access
- [ ] Log out
- [ ] Attempt to navigate to \`/chairman\`
- [ ] **Expected**: Redirect to login, no data visible

#### [ ] Company Data Isolation
- [ ] Log in as User A (access to Company X only)
- [ ] Select "All Companies" in filter
- [ ] **Expected**: See only Company X data, not other companies

#### [ ] SQL Injection Attempts
- [ ] Enter SQL injection strings in search/filters (e.g., \`'; DROP TABLE ventures;--\`)
- [ ] **Expected**: Inputs sanitized, no database errors

#### [ ] XSS Attempts
- [ ] Enter script tags in editable fields (if any)
- [ ] **Expected**: Scripts sanitized/escaped, not executed

---`;
