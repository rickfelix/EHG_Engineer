/**
 * UAT Assessment Template - Sub-Agent Responsibilities Section
 * Section 5: Design, Database/EXEC, and Security sub-agent tasks
 *
 * @module uat-assessment/sections/sub-agent-responsibilities
 */

export const subAgentResponsibilitiesSection = `
## 5. SUB-AGENT RESPONSIBILITIES

### Design Sub-Agent - UI/UX Enhancements

#### Priority 1: Accessibility Compliance (CRITICAL)
**Add ARIA Labels to Icon-Only Elements**
- [ ] Export Report button: \`aria-label="Export chairman dashboard report"\`
- [ ] Configure button: \`aria-label="Configure dashboard settings"\`
- [ ] Alert category icons: Add descriptive aria-labels (e.g., "Financial risk", "Operational issue")
- [ ] Metric trend icons: Add aria-labels (e.g., "Trending up 12%")
- **Files**: \`ChairmanDashboard.tsx\`, \`ExecutiveAlerts.tsx\`
- **Impact**: Critical for screen reader users

**Implement ARIA Live Regions**
- [ ] Priority Alerts section: \`<div aria-live="polite" aria-atomic="true">\`
- [ ] Metric cards: Announce value changes with aria-live
- [ ] Company selector: Announce filter changes
- **Purpose**: Real-time updates accessible to screen readers
- **Impact**: High - core functionality for assistive tech users

**Screen Reader Context**
- [ ] Add role descriptions to tab sections
- [ ] Add aria-describedby to metric cards linking to trend descriptions
- [ ] Ensure tab focus management works correctly
- **Testing**: Use NVDA/JAWS for validation

#### Priority 2: Fix Priority Alerts Layout (HIGH)
**Replace Fixed Height with Adaptive Sizing**
- **Current**: \`<ScrollArea className="h-80">\` (320px fixed)
- **Proposed**:
  \`\`\`tsx
  <ScrollArea className="min-h-64 max-h-[32rem]">
  {/* Dynamic height based on content, min 256px, max 512px */}
  \`\`\`
- **Alternative**: Calculate height based on alert count
- **Testing**: Verify with 0, 1, 5, 10+ alerts
- **File**: \`src/components/chairman/ExecutiveAlerts.tsx\` line 126

**Improve Alert Card Layout**
- [ ] Increase alert title from text-sm to text-base
- [ ] Add max-width to long text elements to prevent overflow
- [ ] Test badge wrapping behavior with multiple badges
- [ ] Ensure consistent spacing between alert cards

#### Priority 3: Responsive Improvements (MEDIUM)
- [ ] Test tab icon-only mode on mobile (sm breakpoint)
- [ ] Verify Priority Alerts on mobile devices (portrait/landscape)
- [ ] Check metric card stacking on narrow screens
- [ ] Test header component wrapping/overflow on small tablets

#### Priority 4: Color Contrast Validation (MEDIUM)
- [ ] Run WAVE or axe DevTools on entire dashboard
- [ ] Test all badge variants against WCAG AA
- [ ] Verify alert text on tinted backgrounds (bg-red-50, etc.)
- [ ] Check muted-foreground contrast ratio
- **Target**: 4.5:1 minimum for normal text

### Database/EXEC Sub-Agents - Backend Integration

#### Priority 1: Replace Hard-Coded Data (CRITICAL)
**Portfolio Stage Distribution**
- [ ] Create query to count ventures grouped by stage
- [ ] Update \`ChairmanDashboard.tsx\` lines 267-287 with dynamic data
- [ ] Add error handling and loading states
- **Query Example**:
  \`\`\`sql
  SELECT stage, COUNT(*) as count
  FROM ventures
  WHERE company_id = ? OR ? = 'all'
  GROUP BY stage
  ORDER BY stage
  \`\`\`
- **Hook**: Extend \`usePortfolioMetrics\` or create \`useVentureStageDistribution\`

**Team Utilization Metrics**
- [ ] Identify/create resource allocation or team management table
- [ ] Query actual team utilization percentages
- [ ] Update \`ChairmanDashboard.tsx\` lines 298-311 with dynamic data
- [ ] Consider removing if no real data source exists
- **Alternative**: Remove this section entirely if not supported by backend

#### Priority 2: Verify Sub-Component Integrations (HIGH)
**Components Needing Backend Verification**:
1. **PerformanceDriveCycle** (\`src/components/chairman/PerformanceDriveCycle.tsx\`)
   - [ ] Review component source code
   - [ ] Identify data hooks/queries
   - [ ] Verify data accuracy
   - [ ] Add to integration status table

2. **AIInsightsEngine** (\`src/components/chairman/AIInsightsEngine.tsx\`)
   - [ ] Check if connected to AI/ML service or using mock data
   - [ ] Verify API endpoints if external service
   - [ ] Document data refresh strategy

3. **SynergyOpportunities** (\`src/components/chairman/SynergyOpportunities.tsx\`)
   - [ ] Review synergy detection logic
   - [ ] Verify ventures analysis queries
   - [ ] Check calculation accuracy

4. **VenturePortfolioOverview** (Portfolio tab)
   - [ ] Verify ventures table queries
   - [ ] Check filtering and sorting functionality
   - [ ] Validate pagination if present

5. **StrategicKPIMonitor** (KPIs tab)
   - [ ] Identify KPI data sources
   - [ ] Verify target vs actual calculations
   - [ ] Check trend analysis accuracy

6. **FinancialAnalytics** (Financial tab)
   - [ ] Identify financial data tables
   - [ ] Verify calculation logic
   - [ ] Check currency formatting and conversions

7. **OperationalIntelligence** (Operations tab)
   - [ ] Identify operational metrics sources
   - [ ] Verify team/resource queries
   - [ ] Check aggregation logic

#### Priority 3: Implement or Remove Stubs (MEDIUM)
**Strategic Decision Support (Intelligence Tab)**
- **Option A**: Implement the feature
  - Define requirements with stakeholders
  - Design data model
  - Implement backend logic
  - Connect frontend
- **Option B**: Remove placeholder
  - Remove card from Intelligence tab
  - Update UI to show only AIInsightsEngine
- **Option C**: Disable tab entirely
  - Gray out Intelligence tab
  - Show "Coming Soon" indicator
- **Decision Needed**: Consult with product owner

**Export/Configure Buttons**
- [ ] Implement export functionality (PDF/Excel report generation)
- [ ] Implement configure functionality (dashboard customization)
- [ ] OR: Remove buttons if not planned
- [ ] OR: Show disabled state with tooltip explaining future feature

#### Priority 4: Performance Optimization (LOW)
**Alert Polling Frequency**
- **Current**: 30-second auto-refresh
- **Consideration**: May be too frequent, causing unnecessary load
- **Options**:
  1. Increase to 60 seconds
  2. Implement WebSocket/Supabase Realtime for instant updates
  3. Add manual refresh button for user control
- **Testing**: Monitor database query load

**Database Indexes**
- [ ] Verify index on ventures.status for alert queries
- [ ] Verify index on ventures.company_id for filtering
- [ ] Verify index on chairman_feedback.alert_level
- [ ] Verify index on compliance_violations.status
- **Goal**: Sub-100ms query times

### Security Sub-Agent - Access Control & Data Protection

#### Priority 1: Authentication Enforcement (CRITICAL)
**Protected Route Testing**
- [ ] Attempt to access \`/chairman\` without authentication
- [ ] Verify redirect to \`/login\` page
- [ ] Test session timeout behavior (idle timeout)
- [ ] Test expired token handling
- [ ] Verify re-authentication flow
- **File**: \`ProtectedRoute\` component

**Authorization Checks**
- [ ] Verify user roles/permissions for chairman console access
- [ ] Test if non-executive users can access dashboard
- [ ] Check if certain tabs should be role-restricted
- **Consideration**: Should all authenticated users see this page?

#### Priority 2: Data Isolation (HIGH)
**Multi-Company Data Segregation**
- [ ] Test company filter with multiple companies
- [ ] Attempt to access data from unauthorized companies
- [ ] Verify RLS policies on all queried tables
- [ ] Test "all companies" view authorization
- **Tables to Verify**: ventures, chairman_feedback, compliance_violations, companies

**Row-Level Security (RLS) Policies**
- [ ] \`ventures\` table: Verify company_id filtering
- [ ] \`chairman_feedback\` table: Verify executive-only access
- [ ] \`compliance_violations\` table: Verify governance role access
- [ ] \`companies\` table: Verify user_company_access enforcement
- **Testing**: Use different user accounts with varying permissions

#### Priority 3: Sensitive Data Handling (HIGH)
**Executive Decision Data**
- [ ] Verify \`chairman_feedback.executive_decision\` field is protected
- [ ] Check if sensitive feedback text is sanitized/encrypted
- [ ] Audit logging for executive decisions
- **Compliance**: May have regulatory requirements (SOX, etc.)

**Compliance Violation Details**
- [ ] Verify governance violation data is role-restricted
- [ ] Check if violation details expose sensitive info
- [ ] Confirm audit trails for violation access
- **Consideration**: Some users may only need violation counts, not details

**Portfolio Financial Data**
- [ ] Verify financial metrics are properly secured
- [ ] Check if portfolio value calculations expose proprietary data
- [ ] Confirm investor/stakeholder data isolation
- **Consideration**: Different detail levels for different roles

#### Priority 4: API Security (MEDIUM)
**Supabase Client Configuration**
- [ ] Verify anon key is used (not service role key in frontend)
- [ ] Check RLS enforcement in all queries
- [ ] Validate CORS policies
- [ ] Review Supabase dashboard security settings

**Export Functionality Security** (If Implemented)
- [ ] Verify exported reports include only authorized data
- [ ] Check file permissions on generated reports
- [ ] Implement download link expiration
- [ ] Add audit logging for report exports

---`;
