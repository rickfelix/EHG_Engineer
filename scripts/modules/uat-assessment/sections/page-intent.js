/**
 * UAT Assessment Template - Page Intent & Context Section
 * Section 1: Primary purpose, strategic position, user flow, component dependencies
 *
 * @module uat-assessment/sections/page-intent
 */

export const pageIntentSection = `
## 1. PAGE INTENT & CONTEXT

### Primary Purpose
The **Chairman Console** serves as the strategic command center and default entry point for the EHG application, providing executive-level oversight of the entire venture portfolio with real-time intelligence and cross-company analytics.

### Strategic Position in Application
- **Default Landing Page**: All authenticated users redirect to \`/chairman\` after login
- **Hub Pattern**: Acts as gateway to all other application areas (Ventures, Portfolios, EVA, Analytics)
- **First Item**: Top position in "Main Navigation" sidebar category
- **Executive Focus**: Designed for C-level decision-making with high-level aggregated views

### User Flow Architecture
\`\`\`
Authentication Flow:
  Login -> ProtectedRoute -> AuthenticatedLayout -> /chairman

Page Structure:
  Chairman Console (/chairman)
  +- Header
  |  +- SidebarTrigger (mobile menu)
  |  +- GlobalSearch (HeaderSearch)
  |  +- BreadcrumbNavigation
  |  +- Header Actions
  |     +- KeyboardShortcuts
  |     +- CompanySelector
  |     +- DarkModeToggle
  |     +- UserMenu
  |
  +- Executive Overview (Always Visible)
  |  +- Portfolio Value
  |  +- Active Ventures
  |  +- Success Rate
  |  +- At Risk
  |
  +- Tabbed Dashboard (6 Views)
     +- Overview (Default Tab)
     |  +- Performance Drive Cycle
     |  +- AI Strategic Insights
     |  +- Priority Alerts
     |  +- Synergy Opportunities
     |  +- Portfolio Performance Summary
     +- Portfolio -> VenturePortfolioOverview
     +- KPIs -> StrategicKPIMonitor
     +- Financial -> FinancialAnalytics
     +- Operations -> OperationalIntelligence
     +- Intelligence -> AIInsightsEngine + Decision Support
\`\`\`

### Relationship to Other Pages

| Target Page | Relationship | Navigation Path |
|-------------|--------------|-----------------|
| EVA Assistant | Peer feature | Sidebar -> EVA Assistant |
| Ventures | Detail view | Overview cards -> Ventures count -> /ventures |
| Portfolios | Detail view | Sidebar -> Portfolios |
| Analytics | Deep dive | Via embedded charts -> Full analytics |
| Reports | Export destination | "Export Report" button |
| Settings | Configuration | UserMenu -> Settings |
| Notifications | Alert details | "View All Alerts" button |

### Component Dependencies (17 components)

#### Layout Components
1. **AuthenticatedLayout** - Overall page shell with sidebar + header
2. **ModernNavigationSidebar** - Left navigation with chairman-console as first item
3. **BreadcrumbNavigation** - Current location indicator
4. **FloatingEVAAssistant** - Persistent AI assistant overlay

#### Header Components
5. **SidebarTrigger** - Mobile menu toggle
6. **HeaderSearch** - Global search functionality
7. **CompanySelector** - Multi-company filtering
8. **KeyboardShortcuts** - Shortcut reference dialog
9. **DarkModeToggle** - Theme switcher
10. **UserMenu** - Profile + logout dropdown

#### Dashboard Components
11. **ExecutiveOverviewCards** - 4 metric cards (Portfolio Value, Active Ventures, Success Rate, At Risk)
12. **PerformanceDriveCycle** - Performance visualization widget
13. **AIInsightsEngine** - AI-powered strategic insights
14. **ExecutiveAlerts** - Priority alerts with real-time updates
15. **SynergyOpportunities** - Cross-venture synergy detection
16. **VenturePortfolioOverview** - Detailed portfolio analysis (Portfolio tab)
17. **StrategicKPIMonitor** - KPI tracking dashboard (KPIs tab)
18. **FinancialAnalytics** - Financial metrics and charts (Financial tab)
19. **OperationalIntelligence** - Operational metrics (Operations tab)

---`;
