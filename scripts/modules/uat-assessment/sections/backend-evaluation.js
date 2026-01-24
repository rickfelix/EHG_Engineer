/**
 * UAT Assessment Template - Backend Evaluation Section
 * Section 2: Service connections, partial implementations, stubbed data
 *
 * @module uat-assessment/sections/backend-evaluation
 */

export const backendEvaluationSection = `
## 2. BACKEND EVALUATION

### FULLY CONNECTED Services

#### Authentication & Authorization
- **Component**: \`ProtectedRoute\` wrapper
- **Service**: Supabase Auth
- **Functionality**:
  - Enforces authentication before page access
  - Redirects unauthenticated users to \`/login\`
  - Maintains session state
- **Status**: FULLY FUNCTIONAL

#### Portfolio Metrics (Executive Overview Cards)
- **Hook**: \`usePortfolioMetrics(companyId)\`
- **File**: \`src/hooks/useChairmanData.ts\`
- **Database Tables**: \`ventures\`, \`companies\`
- **Data Fetched**:
  - Active ventures count (status = 'active')
  - Final stage ventures (stage IN final_polish, customer_success, venture_active)
  - At-risk ventures (status IN paused, cancelled)
  - Portfolio value calculation ($1M average per venture)
  - Success rate percentage (active/completed vs total)
- **Refresh**: React Query with 5-minute stale time
- **Filtering**: Company-specific or "all" aggregation
- **Status**: CONNECTED (calculated from real venture data)

#### Executive Alerts (Priority Alerts Component)
- **Hook**: \`useExecutiveAlertsUnified(companyId)\`
- **Base Hook**: \`useUnifiedNotifications(companyId)\`
- **File**: \`src/hooks/useUnifiedNotifications.ts\`
- **Data Sources**:
  1. **chairman_feedback** table - Strategic feedback requiring attention
  2. **ventures** table - Paused/cancelled venture alerts
  3. **compliance_violations** table - Governance violations
  4. **System notifications** - Hard-coded maintenance messages
- **Refresh**: 30-second auto-polling
- **Filtering**: Critical + High urgency only, top 10 items
- **Features**:
  - Urgency-based color coding (red/orange/yellow/blue)
  - Category icons (financial, risk, operational, strategic, opportunity)
  - Action required flagging
  - Relative timestamps (formatDistanceToNow)
- **Status**: FULLY FUNCTIONAL

#### Company Management
- **Hook**: \`useCompanies()\`
- **File**: \`src/hooks/useChairmanData.ts\`
- **Database**: \`companies\` table
- **Fields**: id, name, description, logo_url, website, industry, settings, created_at
- **Refresh**: 5-minute stale time
- **Status**: CONNECTED

#### Company Selector State Management
- **Component**: \`CompanySelector\`
- **State**: \`selectedCompany\` (useState in AuthenticatedLayout)
- **Propagation**: Props passed to child components
- **Status**: IMPLEMENTED (needs propagation verification in testing)

### PARTIALLY IMPLEMENTED / NEEDS VERIFICATION

#### Performance Drive Cycle
- **Component**: \`PerformanceDriveCycle\`
- **File**: \`src/components/chairman/PerformanceDriveCycle.tsx\`
- **Expected Hook**: Likely uses \`usePortfolioMetrics\` or custom hook
- **Status**: VERIFY - Component exists, backend connection unknown

#### AI Insights Engine
- **Component**: \`AIInsightsEngine\`
- **File**: \`src/components/chairman/AIInsightsEngine.tsx\`
- **Expected Data**: AI-generated strategic recommendations
- **Status**: VERIFY - May be mock data or connected to AI service

#### Synergy Opportunities
- **Component**: \`SynergyOpportunities\`
- **File**: \`src/components/chairman/SynergyOpportunities.tsx\`
- **Expected Hook**: Likely analyzes ventures for synergies
- **Status**: VERIFY - Algorithm implementation unknown

#### Venture Portfolio Overview (Portfolio Tab)
- **Component**: \`VenturePortfolioOverview\`
- **Expected Data**: Detailed venture listings with filters
- **Status**: VERIFY - Component exists, integration level unknown

#### Strategic KPI Monitor (KPIs Tab)
- **Component**: \`StrategicKPIMonitor\`
- **Expected Data**: Custom KPIs with targets and trends
- **Status**: VERIFY - Component exists, data source unknown

#### Financial Analytics (Financial Tab)
- **Component**: \`FinancialAnalytics\`
- **Expected Data**: Revenue, costs, ROI, financial forecasts
- **Status**: VERIFY - Component exists, integration unknown

#### Operational Intelligence (Operations Tab)
- **Component**: \`OperationalIntelligence\`
- **Expected Data**: Resource utilization, team metrics, operational KPIs
- **Status**: VERIFY - Component exists, integration unknown

### STUBBED / NOT IMPLEMENTED

#### Portfolio Performance Summary - Stage Counts
- **Location**: \`ChairmanDashboard.tsx\` lines 267-287
- **Issue**: Hard-coded venture stage distribution
- **Stubbed Values**:
  \`\`\`typescript
  <div className="text-2xl font-bold">23</div>  // Ideation
  <div className="text-2xl font-bold">31</div>  // Validation
  <div className="text-2xl font-bold">28</div>  // Development
  <div className="text-2xl font-bold">34</div>  // Launch
  <div className="text-2xl font-bold">11</div>  // Growth
  \`\`\`
- **Required**: Dynamic query from ventures table grouped by stage
- **Priority**: HIGH - Displays inaccurate data

#### Team Utilization Preview
- **Location**: \`ChairmanDashboard.tsx\` lines 291-320
- **Issue**: Hard-coded utilization percentages
- **Stubbed Values**:
  - Development: 87%
  - Strategy: 73%
- **Required**: Connect to resource allocation or team management tables
- **Priority**: HIGH - Displays inaccurate data

#### Strategic Decision Support (Intelligence Tab)
- **Location**: \`ChairmanDashboard.tsx\` lines 351-367
- **Issue**: Placeholder with "Coming in next update" message
- **UI Present**: Card with empty state icon (Gauge)
- **Backend**: NOT IMPLEMENTED
- **Options**:
  1. Implement the feature
  2. Remove the placeholder tab content
  3. Gray out/disable the tab
- **Priority**: MEDIUM - Placeholder is honest about status

---`;
