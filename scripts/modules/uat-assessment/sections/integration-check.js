/**
 * UAT Assessment Template - Integration Check Section
 * Section 4: Frontend-backend mapping, cross-component communication
 *
 * @module uat-assessment/sections/integration-check
 */

export const integrationCheckSection = `
## 4. INTEGRATION CHECK

### Frontend-Backend Mapping Table

| Feature | UI Component | Backend Service | Data Source | Integration Status | Verification Needed |
|---------|--------------|-----------------|-------------|-------------------|-------------------|
| **Authentication** | ProtectedRoute | Supabase Auth | auth.users | Connected | [ ] Test unauthorized access |
| **Navigation** | ModernNavigationSidebar | Static config | navigationItems array | Functional | [ ] Verify active state |
| **Company Filter** | CompanySelector | useCompanies hook | companies table | Connected | [ ] Test filter propagation |
| **Portfolio Value** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify calculation accuracy |
| **Active Ventures** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify count logic |
| **Success Rate** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify percentage calc |
| **At Risk Count** | MetricCard | usePortfolioMetrics | ventures table | Connected | [ ] Verify risk criteria |
| **Priority Alerts** | ExecutiveAlerts | useExecutiveAlertsUnified | chairman_feedback, ventures, compliance_violations | Connected | [ ] Test real-time updates |
| **Performance Cycle** | PerformanceDriveCycle | Unknown hook | Unknown table | Unknown | [X] **VERIFY BACKEND** |
| **AI Insights** | AIInsightsEngine | Unknown service | AI/ML endpoint? | Unknown | [X] **VERIFY BACKEND** |
| **Synergy Ops** | SynergyOpportunities | Unknown hook | ventures analysis? | Unknown | [X] **VERIFY BACKEND** |
| **Stage Counts** | Hard-coded divs | **NONE** | **STUBBED** | Not Connected | [X] **REPLACE WITH DYNAMIC QUERY** |
| **Team Utilization** | Hard-coded Progress | **NONE** | **STUBBED** | Not Connected | [X] **CONNECT TO RESOURCE DATA** |
| **Portfolio Tab** | VenturePortfolioOverview | Unknown hook | ventures table? | Unknown | [X] **VERIFY BACKEND** |
| **KPIs Tab** | StrategicKPIMonitor | Unknown hook | kpis table? | Unknown | [X] **VERIFY BACKEND** |
| **Financial Tab** | FinancialAnalytics | Unknown hook | financial_data table? | Unknown | [X] **VERIFY BACKEND** |
| **Operations Tab** | OperationalIntelligence | Unknown hook | operational_metrics? | Unknown | [X] **VERIFY BACKEND** |
| **Intelligence Tab** | AIInsightsEngine + Placeholder | Partial | Mixed | Mixed | [X] **COMPLETE OR REMOVE PLACEHOLDER** |
| **Export Report** | Button | Unknown | Unknown | Unknown | [X] **VERIFY FUNCTIONALITY** |
| **Configure** | Button | Unknown | Unknown | Unknown | [X] **VERIFY FUNCTIONALITY** |

### Cross-Component Communication

#### Verified Communication Paths
1. **CompanySelector -> ExecutiveOverviewCards**: \`companyId\` prop -> \`usePortfolioMetrics(companyId)\`
2. **CompanySelector -> ExecutiveAlerts**: \`companyId\` prop -> \`useExecutiveAlertsUnified(companyId)\`
3. **CompanySelector -> PerformanceDriveCycle**: \`companyId\` prop passed
4. **CompanySelector -> SynergyOpportunities**: \`companyId\` prop passed
5. **Tab State -> Content**: Managed by Shadcn Tabs component (controlled)

#### Needs Verification
- [ ] Does CompanySelector state persist across tab changes?
- [ ] Do all 6 tabs respect the company filter?
- [ ] Do metric cards update immediately when company changes?
- [ ] Are there loading states during company filter transitions?

---`;
