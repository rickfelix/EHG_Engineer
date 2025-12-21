# Application File Trees

**Generated**: 9/29/2025, 7:07:16 PM
**Purpose**: Provide EXEC agent with complete directory context to eliminate routing errors

---

## EHG_Engineer (Management Dashboard)

**Path**: `/mnt/c/_EHG/EHG_Engineer`
**Purpose**: LEO Protocol management dashboard
**Database**: dedlbzhpgkmetvhbkyzq (Supabase)
**Files**: 2548

```
├── 📁 .claude/
│   ├── 📁 commands/
│   │   ├── 📝 leo-debug.md
│   │   ├── 📝 leo-design.md
│   │   ├── 📝 leo-perf.md
│   │   ├── 📝 leo-quick.md
│   │   ├── 📝 leo-security.md
│   │   ├── 📝 leo-test.md
│   │   ├── 📝 leo-verify.md
│   │   └── 📝 leo.md
│   ├── 📝 agent-responsibilities.md
│   ├── 📝 protocol-config.md
│   ├── 📝 session-state.md
│   └── 📋 settings.local.json
├── 📁 .cursor/
│   └── 📁 rules/
│       └── 📝 leo_protocol_basic.md
├── 📁 .githooks/
│   ├── 📄 pre-commit
│   └── 📜 pre-commit.js
├── 📁 .github/
│   ├── 📁 workflows/
│   │   ├── ⚙️ a11y-check.yml
│   │   ├── ⚙️ auto-labels.yml
│   │   ├── ⚙️ backlog-integrity-staging-readonly.yml
│   │   ├── ⚙️ boundary-lint.yml
│   │   ├── ⚙️ claude-agentic-review.yml
│   │   ├── ⚙️ db-verify.yml
│   │   ├── ⚙️ e2e-stories.yml
│   │   ├── ⚙️ housekeeping-prod-promotion.yml
│   │   ├── ⚙️ housekeeping-staging-selfcontained.yml
│   │   ├── ⚙️ housekeeping-staging.yml
│   │   ├── ⚙️ housekeeping-weekly-report.yml
│   │   ├── ⚙️ label-sync.yml
│   │   ├── ⚙️ leo-drift-check.yml
│   │   ├── ⚙️ leo-gates.yml
│   │   ├── ⚙️ perf-budget.yml
│   │   ├── ⚙️ policy-verification.yml
│   │   ├── ⚙️ schema-compatibility-check.yml
│   │   ├── ⚙️ schema-drift.yml
│   │   ├── ⚙️ security-review.yml
│   │   ├── ⚙️ sign-artifacts.yml
│   │   ├── ⚙️ sign-policies.yml
│   │   ├── ⚙️ slsa-verification.yml
│   │   ├── ⚙️ stories-ci.yml
│   │   ├── ⚙️ story-gate-check.yml
│   │   ├── ⚙️ test-coverage.yml
│   │   ├── ⚙️ uat-testing.yml
│   │   ├── ⚙️ vh-ideation-staging-readonly.yml
│   │   ├── ⚙️ vision-alignment-prod-readonly.yml
│   │   ├── ⚙️ vision-alignment-staging-readonly.yml
│   │   ├── ⚙️ vision-governance-apply-prod.yml
│   │   ├── ⚙️ vision-governance-apply-staging.yml
│   │   ├── ⚙️ vision-stories-apply-staging.yml
│   │   ├── ⚙️ visual-regression.yml
│   │   ├── ⚙️ wsjf-apply-prod.yml
│   │   ├── ⚙️ wsjf-apply-staging.yml
│   │   ├── ⚙️ wsjf-bulk-accept-prod.yml
│   │   ├── ⚙️ wsjf-bulk-accept.yml
│   │   ├── ⚙️ wsjf-prod-readonly.yml
│   │   ├── ⚙️ wsjf-proposals-ingest-prod.yml
│   │   ├── ⚙️ wsjf-proposals-ingest.yml
│   │   └── ⚙️ wsjf-staging-readonly.yml
│   ├── 📄 CODEOWNERS
│   ├── ⚙️ labeler.yml
│   └── ⚙️ labels.yml
├── 📁 .vscode/
│   └── 📋 tasks.json
├── 📁 agents/
│   └── 📁 story/
│       ├── 📁 test/
│       │   └── 📜 story-agent.test.js
│       ├── 📜 index.js
│       ├── 📝 README.md
│       └── 📝 runbook.md
├── 📁 api/
│   ├── 📁 uat/
│   │   └── 📘 handlers.ts
│   ├── 📁 webhooks/
│   │   └── 📜 github-ci-status.js
│   └── 📜 uat-convert-to-sd.js
├── 📁 applications/
│   ├── 📁 APP001/
│   │   ├── 📁 codebase/
│   │   │   ├── 📁 .github/
│   │   │   │   └── 📁 workflows/
│   │   │   │       └── ⚙️ ci.yml
│   │   │   ├── 📁 app/
│   │   │   │   ├── 📁 (onboarding)/
│   │   │   │   │   ├── 📁 getting-started/
│   │   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   │   ├── 📁 quickstart/
│   │   │   │   │   │   ├── ⚛️ page.tsx
│   │   │   │   │   │   └── ⚛️ QuickstartChecklist.tsx
│   │   │   │   │   ├── 📁 tour/
│   │   │   │   │   │   ├── ⚛️ OnboardingTour.tsx
│   │   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   │   └── ⚛️ layout.tsx
│   │   │   │   ├── 📁 api/
│   │   │   │   │   ├── 📁 ai-agents/
│   │   │   │   │   │   ├── 📁 start/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 status/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   └── 📁 stop/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 analytics/
│   │   │   │   │   │   └── 📁 events/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 companies/
│   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   ├── 📁 data-management/
│   │   │   │   │   │   ├── 📁 quality/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   └── 📁 storage/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 eva-nlp/
│   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   ├── 📁 eva-orchestration/
│   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   ├── 📁 governance/
│   │   │   │   │   │   ├── 📁 compliance/
│   │   │   │   │   │   │   └── 📁 status/
│   │   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 metrics/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 reviews/
│   │   │   │   │   │   │   └── 📁 upcoming/
│   │   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   │   └── 📁 violations/
│   │   │   │   │   │       └── 📁 recent/
│   │   │   │   │   │           └── 📘 route.ts
│   │   │   │   │   ├── 📁 integration/
│   │   │   │   │   │   ├── 📁 health-alerts/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 health-check/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 health-metrics/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 services/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   ├── 📁 status/
│   │   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   │   └── 📁 webhooks/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 monitoring/
│   │   │   │   │   │   └── 📁 overview/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 onboarding/
│   │   │   │   │   │   └── 📁 complete/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 performance/
│   │   │   │   │   │   └── 📁 overview/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 security/
│   │   │   │   │   │   └── 📁 overview/
│   │   │   │   │   │       └── 📘 route.ts
│   │   │   │   │   ├── 📁 settings/
│   │   │   │   │   │   └── 📘 route.ts
│   │   │   │   │   └── 📁 ventures/
│   │   │   │   │       ├── 📁 create/
│   │   │   │   │       │   └── 📘 route.ts
│   │   │   │   │       └── 📁 list/
│   │   │   │   │           └── 📘 route.ts
│   │   │   │   ├── 📁 data-management/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   ├── 📁 governance/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   ├── 📁 integration/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   ├── 📁 monitoring/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   ├── 📁 performance/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   ├── 📁 security/
│   │   │   │   │   └── ⚛️ page.tsx
│   │   │   │   └── 📁 settings/
│   │   │   │       ├── ⚛️ EVASettingsCard.tsx
│   │   │   │       ├── ⚛️ page.tsx
│   │   │   │       └── ⚛️ PreferencesForm.tsx
│   │   │   ├── 📁 db/
│   │   │   │   └── 📁 migrations/
│   │   │   ├── 📁 docs/
│   │   │   │   ├── 📁 prds/
│   │   │   │   ├── 📁 retrospectives/
│   │   │   │   └── 📁 strategic-directives/
│   │   │   ├── 📁 enhanced_prds/
│   │   │   │   ├── 📁 00_foundation/
│   │   │   │   ├── 📁 10_platform/
│   │   │   │   ├── 📁 20_workflows/
│   │   │   │   ├── 📁 30_agents/
│   │   │   │   └── 📝 README.md
│   │   │   ├── 📁 handoffs/
│   │   │   ├── 📁 lib/
│   │   │   │   ├── 📁 analytics/
│   │   │   │   │   └── 📘 onboarding.ts
│   │   │   │   └── 📁 auth/
│   │   │   │       └── 📘 useCurrentUser.ts
│   │   │   ├── 📁 public/
│   │   │   │   ├── 📄 favicon.ico
│   │   │   │   ├── 📄 placeholder.svg
│   │   │   │   └── 📄 robots.txt
│   │   │   ├── 📁 scripts/
│   │   │   │   ├── 📁 seed/
│   │   │   │   │   ├── 📘 governance.seed.ts
│   │   │   │   │   └── 📘 onboarding.seed.ts
│   │   │   │   ├── 🗄️ add-leo-docs-to-database.sql
│   │   │   │   ├── 📜 add-sd-2025-001-simple.js
│   │   │   │   ├── 📜 add-sd-2025-001-to-database.js
│   │   │   │   ├── 📜 add-test-data.js
│   │   │   │   ├── 🗄️ seed-test-data.sql
│   │   │   │   └── 📜 verify-database-before-exec.js
│   │   │   ├── 📁 server/
│   │   │   │   ├── 📁 api/
│   │   │   │   │   └── 📁 onboarding/
│   │   │   │   │       └── 📘 progress.ts
│   │   │   │   ├── 📁 contracts/
│   │   │   │   │   ├── 📘 feedback.ts
│   │   │   │   │   ├── 📘 index.ts
│   │   │   │   │   └── 📘 ventures.ts
│   │   │   │   └── 📁 tests/
│   │   │   │       └── 📁 contracts/
│   │   │   │           ├── 📘 feedback.spec.ts
│   │   │   │           └── 📘 ventures.spec.ts
│   │   │   ├── 📁 src/
│   │   │   │   ├── 📁 components/
│   │   │   │   │   ├── 📁 accessibility/
│   │   │   │   │   │   ├── ⚛️ AccessibilityProvider.tsx
│   │   │   │   │   │   ├── ⚛️ AccessibilitySettings.tsx
│   │   │   │   │   │   ├── ⚛️ AccessibleNavigationAnnouncer.tsx
│   │   │   │   │   │   ├── ⚛️ SkipNavigation.tsx
│   │   │   │   │   │   └── ⚛️ VoiceInput.tsx
│   │   │   │   │   ├── 📁 agents/
│   │   │   │   │   │   ├── ⚛️ AgentCoordinationTab.tsx
│   │   │   │   │   │   ├── ⚛️ AgentDeployDialog.tsx
│   │   │   │   │   │   ├── ⚛️ AgentPerformanceChart.tsx
│   │   │   │   │   │   ├── ⚛️ AgentPerformanceTab.tsx
│   │   │   │   │   │   ├── ⚛️ AgentSettingsTab.tsx
│   │   │   │   │   │   ├── ⚛️ AgentStatusCard.tsx
│   │   │   │   │   │   └── ⚛️ AgentTaskQueue.tsx
│   │   │   │   │   ├── 📁 ai/
│   │   │   │   │   │   └── ⚛️ AIHealthMonitor.tsx
│   │   │   │   │   ├── 📁 ai-agents/
│   │   │   │   │   │   └── ⚛️ AgentStatusCard.tsx
│   │   │   │   │   ├── 📁 analytics/
│   │   │   │   │   │   ├── ⚛️ AdvancedAnalyticsEngine.tsx
│   │   │   │   │   │   ├── ⚛️ AIInsightsAlert.tsx
│   │   │   │   │   │   ├── ⚛️ AIInsightsView.tsx
│   │   │   │   │   │   ├── ⚛️ CustomReportsView.tsx
│   │   │   │   │   │   ├── ⚛️ EnhancedCharts.tsx
│   │   │   │   │   │   ├── ⚛️ EnhancedKeyMetricsOverview.tsx
│   │   │   │   │   │   ├── ⚛️ ExecutiveDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ KeyMetricsOverview.tsx
│   │   │   │   │   │   ├── ⚛️ PortfolioAnalyticsView.tsx
│   │   │   │   │   │   ├── ⚛️ UserJourneyAnalytics.tsx
│   │   │   │   │   │   └── ⚛️ VentureAnalyticsView.tsx
│   │   │   │   │   ├── 📁 auth/
│   │   │   │   │   │   ├── ⚛️ AISecurityMonitor.tsx
│   │   │   │   │   │   ├── ⚛️ AuthenticationDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ EnhancedAuthenticationSystem.tsx
│   │   │   │   │   │   ├── ⚛️ ProtectedRoute.tsx
│   │   │   │   │   │   └── ⚛️ RoleBasedAccess.tsx
│   │   │   │   │   ├── 📁 chairman/
│   │   │   │   │   │   ├── 📁 feedback/
│   │   │   │   │   │   │   ├── ⚛️ AgentInstructions.tsx
│   │   │   │   │   │   │   ├── ⚛️ FeedbackForm.tsx
│   │   │   │   │   │   │   ├── ⚛️ FeedbackHistory.tsx
│   │   │   │   │   │   │   ├── ⚛️ ProcessingStatus.tsx
│   │   │   │   │   │   │   └── ⚛️ VoiceRecorder.tsx
│   │   │   │   │   │   ├── ⚛️ AIInsightsEngine.tsx
│   │   │   │   │   │   ├── ⚛️ ChairmanFeedbackPanel.tsx
│   │   │   │   │   │   ├── ⚛️ ChairmanOverridePanel.tsx
│   │   │   │   │   │   ├── ⚛️ CompanySelector.tsx
│   │   │   │   │   │   ├── ⚛️ ExecutiveAlerts.tsx
│   │   │   │   │   │   ├── ⚛️ PerformanceDriveCycle.tsx
│   │   │   │   │   │   └── ⚛️ SynergyOpportunities.tsx
│   │   │   │   │   ├── 📁 collaboration/
│   │   │   │   │   │   ├── ⚛️ AdvancedCollaboration.tsx
│   │   │   │   │   │   ├── ⚛️ CollaborationHub.tsx
│   │   │   │   │   │   ├── ⚛️ CreateThreadDialog.tsx
│   │   │   │   │   │   └── ⚛️ ThreadDetails.tsx
│   │   │   │   │   ├── 📁 completion/
│   │   │   │   │   │   └── ⚛️ PlatformCompletionSummary.tsx
│   │   │   │   │   ├── 📁 data/
│   │   │   │   │   │   └── ⚛️ KnowledgeBaseSystem.tsx
│   │   │   │   │   ├── 📁 data-management/
│   │   │   │   │   │   ├── ⚛️ DataGovernanceDashboard.tsx
│   │   │   │   │   │   └── ⚛️ DataLifecycleDashboard.tsx
│   │   │   │   │   ├── 📁 development/
│   │   │   │   │   │   └── ⚛️ TestingAutomationDashboard.tsx
│   │   │   │   │   ├── 📁 eva/
│   │   │   │   │   │   ├── ⚛️ ChatInput.tsx
│   │   │   │   │   │   ├── ⚛️ ElevenLabsVoice.tsx
│   │   │   │   │   │   ├── ⚛️ EVAOrchestrationDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ EVARealtimeVoice.tsx
│   │   │   │   │   │   ├── ⚛️ EVASetup.tsx
│   │   │   │   │   │   ├── ⚛️ EVATextToSpeechChat.tsx
│   │   │   │   │   │   ├── ⚛️ EVAVoiceInterface.tsx
│   │   │   │   │   │   └── ⚛️ FloatingEVAAssistant.tsx
│   │   │   │   │   ├── 📁 execution/
│   │   │   │   │   │   ├── ⚛️ ExecutionProgressChart.tsx
│   │   │   │   │   │   ├── ⚛️ StageExecutionDetails.tsx
│   │   │   │   │   │   └── ⚛️ WorkflowExecutionDashboard.tsx
│   │   │   │   │   ├── 📁 exit/
│   │   │   │   │   │   └── ⚛️ ExitDecisionWorkflow.tsx
│   │   │   │   │   ├── 📁 governance/
│   │   │   │   │   │   ├── ⚛️ AccessReviewDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ AuditTrailViewer.tsx
│   │   │   │   │   │   ├── ⚛️ ComplianceMonitoring.tsx
│   │   │   │   │   │   ├── ⚛️ GovernanceDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ PolicyManagement.tsx
│   │   │   │   │   │   └── ⚛️ ReportGenerator.tsx
│   │   │   │   │   ├── 📁 integration/
│   │   │   │   │   │   ├── ⚛️ ExternalIntegrationHub.tsx
│   │   │   │   │   │   ├── ⚛️ IntegrationConfigModal.tsx
│   │   │   │   │   │   ├── ⚛️ IntegrationHealthMonitor.tsx
│   │   │   │   │   │   ├── ⚛️ IntegrationHubDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ IntegrationStatusDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ ProductionReadiness.tsx
│   │   │   │   │   │   └── ⚛️ SystemOrchestration.tsx
│   │   │   │   │   ├── 📁 knowledge-management/
│   │   │   │   │   │   └── ⚛️ KnowledgeManagementDashboard.tsx
│   │   │   │   │   ├── 📁 layout/
│   │   │   │   │   │   ├── ⚛️ AppLayout.tsx
│   │   │   │   │   │   ├── ⚛️ AuthenticatedLayout.tsx
│   │   │   │   │   │   ├── ⚛️ Header.tsx
│   │   │   │   │   │   └── ⚛️ Navigation.tsx
│   │   │   │   │   ├── 📁 live-progress/
│   │   │   │   │   │   ├── ⚛️ LiveActivityFeed.tsx
│   │   │   │   │   │   ├── ⚛️ LivePerformanceDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ LiveWorkflowMap.tsx
│   │   │   │   │   │   └── ⚛️ PortfolioOverview.tsx
│   │   │   │   │   ├── 📁 monitoring/
│   │   │   │   │   │   ├── ⚛️ AIMonitoringAnalytics.tsx
│   │   │   │   │   │   ├── ⚛️ CreateIncidentDialog.tsx
│   │   │   │   │   │   └── ⚛️ IncidentManagement.tsx
│   │   │   │   │   ├── 📁 navigation/
│   │   │   │   │   │   ├── ⚛️ AccessibilityEnhancements.tsx
│   │   │   │   │   │   ├── ⚛️ AccessibleNavigationSidebar.tsx
│   │   │   │   │   │   ├── ⚛️ AINavigationAssistant.tsx
│   │   │   │   │   │   ├── ⚛️ BreadcrumbNavigation.tsx
│   │   │   │   │   │   ├── ⚛️ GlobalSearch.tsx
│   │   │   │   │   │   ├── ⚛️ KeyboardShortcuts.tsx
│   │   │   │   │   │   ├── ⚛️ MobileNavigationEnhancements.tsx
│   │   │   │   │   │   ├── ⚛️ ModernNavigationSidebar.tsx
│   │   │   │   │   │   ├── ⚛️ NavigationAssistant.tsx
│   │   │   │   │   │   └── ⚛️ NavigationSidebar.tsx
│   │   │   │   │   ├── 📁 notifications/
│   │   │   │   │   │   ├── ⚛️ NotificationCenter.tsx
│   │   │   │   │   │   ├── ⚛️ NotificationPreferencesDialog.tsx
│   │   │   │   │   │   └── ⚛️ NotificationSettings.tsx
│   │   │   │   │   ├── 📁 orchestration/
│   │   │   │   │   │   ├── ⚛️ ActiveWorkflowsView.tsx
│   │   │   │   │   │   ├── ⚛️ AgentCoordinationView.tsx
│   │   │   │   │   │   ├── ⚛️ EVAOrchestrationEngine.tsx
│   │   │   │   │   │   ├── ⚛️ OrchestrationAnalytics.tsx
│   │   │   │   │   │   ├── ⚛️ PerformanceDriveCycleCard.tsx
│   │   │   │   │   │   └── ⚛️ SystemHealthOverview.tsx
│   │   │   │   │   ├── 📁 parallel-exploration/
│   │   │   │   │   │   └── ⚛️ ParallelExplorationDashboard.tsx
│   │   │   │   │   ├── 📁 performance/
│   │   │   │   │   │   ├── ⚛️ AdvancedCacheOptimization.tsx
│   │   │   │   │   │   ├── ⚛️ AIPerformanceAnalytics.tsx
│   │   │   │   │   │   └── ⚛️ ScalingAutomation.tsx
│   │   │   │   │   ├── 📁 risk-forecasting/
│   │   │   │   │   │   └── ⚛️ RiskForecastingEngine.tsx
│   │   │   │   │   ├── 📁 search/
│   │   │   │   │   │   └── ⚛️ AccessibleGlobalSearch.tsx
│   │   │   │   │   ├── 📁 security/
│   │   │   │   │   │   ├── ⚛️ ComprehensiveSecurityDashboard.tsx
│   │   │   │   │   │   ├── ⚛️ SecurityDashboard.tsx
│   │   │   │   │   │   └── ⚛️ SecurityIncidentManager.tsx
│   │   │   │   │   ├── 📁 stages/
│   │   │   │   │   │   ├── ⚛️ CompleteWorkflowOrchestrator.tsx
│   │   │   │   │   │   ├── ⚛️ FoundationChunkWorkflow.tsx
│   │   │   │   │   │   ├── ⚛️ LaunchGrowthChunkWorkflow.tsx
│   │   │   │   │   │   ├── ⚛️ OperationsOptimizationChunkWorkflow.tsx
│   │   │   │   │   │   ├── ⚛️ PlanningChunkWorkflow.tsx
│   │   │   │   │   │   ├── ⚛️ Stage10TechnicalReview.tsx
│   │   │   │   │   │   ├── ⚛️ Stage11MVPDevelopment.tsx
│   │   │   │   │   │   ├── ⚛️ Stage11StrategicNaming.tsx
│   │   │   │   │   │   ├── ⚛️ Stage12AdaptiveNaming.tsx
│   │   │   │   │   │   ├── ⚛️ Stage12TechnicalImplementation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage13ExitOrientedDesign.tsx
│   │   │   │   │   │   ├── ⚛️ Stage13IntegrationTesting.tsx
│   │   │   │   │   │   ├── ⚛️ Stage14DevelopmentPreparation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage14QualityAssurance.tsx
│   │   │   │   │   │   ├── ⚛️ Stage15DeploymentPreparation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage15PricingStrategy.tsx
│   │   │   │   │   │   ├── ⚛️ Stage16AICEOAgent.tsx
│   │   │   │   │   │   ├── ⚛️ Stage17GTMStrategy.tsx
│   │   │   │   │   │   ├── ⚛️ Stage18DocumentationSync.tsx
│   │   │   │   │   │   ├── ⚛️ Stage19IntegrationVerification.tsx
│   │   │   │   │   │   ├── ⚛️ Stage1DraftIdea.tsx
│   │   │   │   │   │   ├── ⚛️ Stage20ContextLoading.tsx
│   │   │   │   │   │   ├── ⚛️ Stage21LaunchPreparation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage21PreFlightCheck.tsx
│   │   │   │   │   │   ├── ⚛️ Stage22GoToMarketExecution.tsx
│   │   │   │   │   │   ├── ⚛️ Stage22IterativeDevelopmentLoop.tsx
│   │   │   │   │   │   ├── ⚛️ Stage23ContinuousFeedbackLoops.tsx
│   │   │   │   │   │   ├── ⚛️ Stage23CustomerAcquisition.tsx
│   │   │   │   │   │   ├── ⚛️ Stage24GrowthMetricsOptimization.tsx
│   │   │   │   │   │   ├── ⚛️ Stage24MVPEngineIteration.tsx
│   │   │   │   │   │   ├── ⚛️ Stage25QualityAssurance.tsx
│   │   │   │   │   │   ├── ⚛️ Stage25ScalePlanning.tsx
│   │   │   │   │   │   ├── ⚛️ Stage26OperationalExcellence.tsx
│   │   │   │   │   │   ├── ⚛️ Stage27PerformanceOptimization.tsx
│   │   │   │   │   │   ├── ⚛️ Stage28CustomerSuccess.tsx
│   │   │   │   │   │   ├── ⚛️ Stage29RevenueOptimization.tsx
│   │   │   │   │   │   ├── ⚛️ Stage2AIReview.tsx
│   │   │   │   │   │   ├── ⚛️ Stage30TeamScaling.tsx
│   │   │   │   │   │   ├── ⚛️ Stage31AdvancedAnalytics.tsx
│   │   │   │   │   │   ├── ⚛️ Stage31MVPLaunch.tsx
│   │   │   │   │   │   ├── ⚛️ Stage32AIMLIntegration.tsx
│   │   │   │   │   │   ├── ⚛️ Stage32CustomerSuccess.tsx
│   │   │   │   │   │   ├── ⚛️ Stage33CapabilityExpansion.tsx
│   │   │   │   │   │   ├── ⚛️ Stage33InternationalExpansion.tsx
│   │   │   │   │   │   ├── ⚛️ Stage34CreativeMediaAutomation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage34StrategicPartnerships.tsx
│   │   │   │   │   │   ├── ⚛️ Stage35GTMTimingIntelligence.tsx
│   │   │   │   │   │   ├── ⚛️ Stage35InnovationPipeline.tsx
│   │   │   │   │   │   ├── ⚛️ Stage36ParallelExploration.tsx
│   │   │   │   │   │   ├── ⚛️ Stage37StrategicRiskForecasting.tsx
│   │   │   │   │   │   ├── ⚛️ Stage38TimingOptimization.tsx
│   │   │   │   │   │   ├── ⚛️ Stage39MultiVentureCoordination.tsx
│   │   │   │   │   │   ├── ⚛️ Stage3ComprehensiveValidation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage40VentureActive.tsx
│   │   │   │   │   │   ├── ⚛️ Stage4CompetitiveIntelligence.tsx
│   │   │   │   │   │   ├── ⚛️ Stage52DataManagementKB.tsx
│   │   │   │   │   │   ├── ⚛️ Stage5ProfitabilityForecasting.tsx
│   │   │   │   │   │   ├── ⚛️ Stage6RiskEvaluation.tsx
│   │   │   │   │   │   ├── ⚛️ Stage7ComprehensivePlanning.tsx
│   │   │   │   │   │   ├── ⚛️ Stage8ProblemDecomposition.tsx
│   │   │   │   │   │   ├── ⚛️ Stage9GapAnalysis.tsx
│   │   │   │   │   │   ├── ⚛️ StageProgressIndicator.tsx
│   │   │   │   │   │   └── ⚛️ ValidationChunkWorkflow.tsx
│   │   │   │   │   ├── 📁 team/
│   │   │   │   │   │   └── ⚛️ TeamManagementInterface.tsx
│   │   │   │   │   ├── 📁 test-runner/
│   │   │   │   │   │   ├── ⚛️ DirectOpenAITest.tsx
│   │   │   │   │   │   ├── ⚛️ OpenAIValidator.tsx
│   │   │   │   │   │   ├── ⚛️ TestExecutor.tsx
│   │   │   │   │   │   └── ⚛️ TestRunner.tsx
│   │   │   │   │   ├── 📁 testing/
│   │   │   │   │   │   ├── ⚛️ AITestGenerator.tsx
│   │   │   │   │   │   ├── ⚛️ ComprehensiveTestSuite.tsx
│   │   │   │   │   │   ├── ⚛️ Phase3VerificationTests.tsx
│   │   │   │   │   │   ├── ⚛️ QualityGatesManager.tsx
│   │   │   │   │   │   └── ⚛️ TestingDashboard.tsx
│   │   │   │   │   ├── 📁 timing-optimization/
│   │   │   │   │   │   └── ⚛️ TimingOptimizationDashboard.tsx
│   │   │   │   │   ├── 📁 ui/
│   │   │   │   │   │   ├── ⚛️ accessibility-helpers.tsx
│   │   │   │   │   │   ├── ⚛️ accordion.tsx
│   │   │   │   │   │   ├── ⚛️ alert-dialog.tsx
│   │   │   │   │   │   ├── ⚛️ alert.tsx
│   │   │   │   │   │   ├── ⚛️ aspect-ratio.tsx
│   │   │   │   │   │   ├── ⚛️ avatar.tsx
│   │   │   │   │   │   ├── ⚛️ badge.tsx
│   │   │   │   │   │   ├── ⚛️ breadcrumb.tsx
│   │   │   │   │   │   ├── ⚛️ button.tsx
│   │   │   │   │   │   ├── ⚛️ calendar.tsx
│   │   │   │   │   │   ├── ⚛️ card.tsx
│   │   │   │   │   │   ├── ⚛️ carousel.tsx
│   │   │   │   │   │   ├── ⚛️ chart.tsx
│   │   │   │   │   │   ├── ⚛️ checkbox.tsx
│   │   │   │   │   │   ├── ⚛️ collapsible.tsx
│   │   │   │   │   │   ├── ⚛️ command.tsx
│   │   │   │   │   │   ├── ⚛️ context-menu.tsx
│   │   │   │   │   │   ├── ⚛️ dialog.tsx
│   │   │   │   │   │   ├── ⚛️ drawer.tsx
│   │   │   │   │   │   ├── ⚛️ dropdown-menu.tsx
│   │   │   │   │   │   ├── ⚛️ enhanced-card.tsx
│   │   │   │   │   │   ├── ⚛️ form.tsx
│   │   │   │   │   │   ├── ⚛️ hover-card.tsx
│   │   │   │   │   │   ├── ⚛️ input-otp.tsx
│   │   │   │   │   │   ├── ⚛️ input.tsx
│   │   │   │   │   │   ├── ⚛️ label.tsx
│   │   │   │   │   │   ├── ⚛️ loading-states.tsx
│   │   │   │   │   │   ├── ⚛️ menubar.tsx
│   │   │   │   │   │   ├── ⚛️ mobile-optimized.tsx
│   │   │   │   │   │   ├── ⚛️ navigation-menu.tsx
│   │   │   │   │   │   ├── ⚛️ pagination.tsx
│   │   │   │   │   │   ├── ⚛️ performance-optimized.tsx
│   │   │   │   │   │   ├── ⚛️ popover.tsx
│   │   │   │   │   │   ├── ⚛️ progress.tsx
│   │   │   │   │   │   ├── ⚛️ radio-group.tsx
│   │   │   │   │   │   ├── ⚛️ resizable.tsx
│   │   │   │   │   │   ├── ⚛️ scroll-area.tsx
│   │   │   │   │   │   ├── ⚛️ select.tsx
│   │   │   │   │   │   ├── ⚛️ separator.tsx
│   │   │   │   │   │   ├── ⚛️ sheet.tsx
│   │   │   │   │   │   ├── ⚛️ sidebar.tsx
│   │   │   │   │   │   ├── ⚛️ skeleton.tsx
│   │   │   │   │   │   ├── ⚛️ slider.tsx
│   │   │   │   │   │   ├── ⚛️ sonner.tsx
│   │   │   │   │   │   ├── ⚛️ switch.tsx
│   │   │   │   │   │   ├── ⚛️ table.tsx
│   │   │   │   │   │   ├── ⚛️ tabs.tsx
│   │   │   │   │   │   ├── ⚛️ textarea.tsx
│   │   │   │   │   │   ├── ⚛️ toast.tsx
│   │   │   │   │   │   ├── ⚛️ toaster.tsx
│   │   │   │   │   │   ├── ⚛️ toggle-group.tsx
│   │   │   │   │   │   ├── ⚛️ toggle.tsx
│   │   │   │   │   │   ├── ⚛️ tooltip.tsx
│   │   │   │   │   │   └── 📘 use-toast.ts
│   │   │   │   │   ├── 📁 venture/
│   │   │   │   │   │   ├── ⚛️ ChairmanDashboard.tsx
│   │   │   │   │   │   └── ⚛️ VentureGrid.tsx
│   │   │   │   │   ├── 📁 venture-coordination/
│   │   │   │   │   │   └── ⚛️ MultiVentureCoordinationEngine.tsx
│   │   │   │   │   ├── 📁 ventures/
│   │   │   │   │   │   ├── ⚛️ CreateVentureDialog.tsx
│   │   │   │   │   │   ├── ⚛️ StartWorkflowButton.tsx
│   │   │   │   │   │   ├── ⚛️ UpdateFinancialsDialog.tsx
│   │   │   │   │   │   ├── ⚛️ VentureCard.tsx
│   │   │   │   │   │   ├── ⚛️ VentureDataTable.tsx
│   │   │   │   │   │   ├── ⚛️ VentureOverviewTab.tsx
│   │   │   │   │   │   ├── ⚛️ VenturesKanbanView.tsx
│   │   │   │   │   │   └── ⚛️ VentureStageNavigation.tsx
│   │   │   │   │   └── 📁 workflow/
│   │   │   │   │       ├── ⚛️ DynamicStageRenderer.tsx
│   │   │   │   │       ├── ⚛️ StageConfigurationForm.tsx
│   │   │   │   │       ├── ⚛️ StageDetailsPanel.tsx
│   │   │   │   │       ├── ⚛️ WorkflowProgress.tsx
│   │   │   │   │       └── ⚛️ WorkflowStageMap.tsx
│   │   │   │   ├── 📁 constants/
│   │   │   │   │   └── 📘 workflows.ts
│   │   │   │   ├── 📁 contexts/
│   │   │   │   │   └── ⚛️ AccessibilityContext.tsx
│   │   │   │   ├── 📁 features/
│   │   │   │   │   └── 📁 comprehensive_validation/
│   │   │   │   │       ├── ⚛️ ChairmanOverrideControls.tsx
│   │   │   │   │       ├── 📘 rules.ts
│   │   │   │   │       ├── 📘 schemas.ts
│   │   │   │   │       ├── 📘 service.ts
│   │   │   │   │       └── ⚛️ ValidationDashboard.tsx
│   │   │   │   ├── 📁 hooks/
│   │   │   │   │   ├── ⚛️ use-mobile.tsx
│   │   │   │   │   ├── 📘 use-toast.ts
│   │   │   │   │   ├── 📘 useActorModelSaga.ts
│   │   │   │   │   ├── 📘 useAdaptiveNaming.ts
│   │   │   │   │   ├── 📘 useAdvancedKeyboardNavigation.ts
│   │   │   │   │   ├── 📘 useAgentData.ts
│   │   │   │   │   ├── 📘 useAgents.ts
│   │   │   │   │   ├── 📘 useAICEOAgent.ts
│   │   │   │   │   ├── 📘 useAIReviewService.ts
│   │   │   │   │   ├── 📘 useAnalyticsData.ts
│   │   │   │   │   ├── ⚛️ useAuthenticationData.tsx
│   │   │   │   │   ├── 📘 useChairmanData.ts
│   │   │   │   │   ├── 📘 useChairmanFeedbackService.ts
│   │   │   │   │   ├── 📘 useCollaboration.ts
│   │   │   │   │   ├── 📘 useCompetitiveIntelligence.ts
│   │   │   │   │   ├── 📘 useComprehensivePlanning.ts
│   │   │   │   │   ├── 📘 useContextLoading.ts
│   │   │   │   │   ├── 📘 useContinuousFeedbackLoops.ts
│   │   │   │   │   ├── 📘 useCreativeMediaAutomation.ts
│   │   │   │   │   ├── 📘 useDevelopmentExcellence.ts
│   │   │   │   │   ├── 📘 useDevelopmentPreparation.ts
│   │   │   │   │   ├── 📘 useDocumentationSync.ts
│   │   │   │   │   ├── ⚛️ useExecutiveData.tsx
│   │   │   │   │   ├── 📘 useExitReadiness.ts
│   │   │   │   │   ├── 📘 useFinalPolish.ts
│   │   │   │   │   ├── 📘 useFocusManagement.ts
│   │   │   │   │   ├── ⚛️ useGlobalSearch.tsx
│   │   │   │   │   ├── 📘 useGovernanceData.ts
│   │   │   │   │   ├── 📘 useGTMStrategy.ts
│   │   │   │   │   ├── 📘 useIdeasService.ts
│   │   │   │   │   ├── 📘 useIntegrationVerification.ts
│   │   │   │   │   ├── 📘 useIterativeDevelopmentLoop.ts
│   │   │   │   │   ├── 📘 useKeyboardNavigation.ts
│   │   │   │   │   ├── 📘 useKnowledgeManagement.ts
│   │   │   │   │   ├── 📘 useLiveWorkflowProgress.ts
│   │   │   │   │   ├── 📘 useMonitoringData.ts
│   │   │   │   │   ├── 📘 useMultiVentureCoordination.ts
│   │   │   │   │   ├── 📘 useMVPEngineIteration.ts
│   │   │   │   │   ├── 📘 useMVPLaunch.ts
│   │   │   │   │   ├── ⚛️ useNavigationCounts.tsx
│   │   │   │   │   ├── 📘 useNotificationActions.ts
│   │   │   │   │   ├── 📘 useNotifications.ts
│   │   │   │   │   ├── 📘 useOrchestrationData.ts
│   │   │   │   │   ├── 📘 useParallelExploration.ts
│   │   │   │   │   ├── 📘 usePerformanceData.ts
│   │   │   │   │   ├── 📘 usePersonalization.ts
│   │   │   │   │   ├── 📘 usePreFlightCheck.ts
│   │   │   │   │   ├── 📘 usePricingStrategy.ts
│   │   │   │   │   ├── 📘 useProblemDecomposition.ts
│   │   │   │   │   ├── 📘 useProductionDeployment.ts
│   │   │   │   │   ├── 📘 useProfitabilityForecasting.ts
│   │   │   │   │   ├── 📘 useQualityAssuranceStage.ts
│   │   │   │   │   ├── 📘 useRiskEvaluation.ts
│   │   │   │   │   ├── 📘 useScreenReader.ts
│   │   │   │   │   ├── 📘 useSecurityCompliance.ts
│   │   │   │   │   ├── 📘 useSecurityData.ts
│   │   │   │   │   ├── 📘 useStrategicNaming.ts
│   │   │   │   │   ├── 📘 useTechnicalReview.ts
│   │   │   │   │   ├── 📘 useTimingOptimization.ts
│   │   │   │   │   ├── 📘 useUnifiedNotifications.ts
│   │   │   │   │   ├── ⚛️ useUserJourneyData.tsx
│   │   │   │   │   ├── 📘 useVentureData.ts
│   │   │   │   │   ├── 📘 useVentures.ts
│   │   │   │   │   ├── 📘 useWorkflowData.ts
│   │   │   │   │   ├── 📘 useWorkflowExecution.ts
│   │   │   │   │   └── 📘 useWorkflowPersistence.ts
│   │   │   │   ├── 📁 integrations/
│   │   │   │   │   └── 📁 supabase/
│   │   │   │   │       ├── 📘 client.ts
│   │   │   │   │       └── 📘 types.ts
│   │   │   │   ├── 📁 lib/
│   │   │   │   │   ├── 📁 ai/
│   │   │   │   │   │   ├── 📘 ai-analytics-engine.ts
│   │   │   │   │   │   ├── 📘 ai-database-service.ts
│   │   │   │   │   │   ├── 📘 ai-integration-service.ts
│   │   │   │   │   │   └── 📘 ai-service-manager.ts
│   │   │   │   │   ├── 📁 analytics/
│   │   │   │   │   │   ├── 📘 export-engine.ts
│   │   │   │   │   │   └── 📘 predictive-engine.ts
│   │   │   │   │   ├── 📁 api/
│   │   │   │   │   │   └── 📘 rate-limiter-client.ts
│   │   │   │   │   ├── 📁 i18n/
│   │   │   │   │   │   └── 📘 voice-internationalization.ts
│   │   │   │   │   ├── 📁 integration/
│   │   │   │   │   │   ├── 📘 api-gateway.ts
│   │   │   │   │   │   ├── 📘 generic-rest-connector.ts
│   │   │   │   │   │   └── 📘 integration-service.ts
│   │   │   │   │   ├── 📁 security/
│   │   │   │   │   │   ├── 📘 ai-security-monitor.ts
│   │   │   │   │   │   └── 📘 behavioral-auth.ts
│   │   │   │   │   ├── 📁 services/
│   │   │   │   │   │   ├── 📘 knowledgeManagementService.ts
│   │   │   │   │   │   ├── 📘 multiVentureCoordinationService.ts
│   │   │   │   │   │   ├── 📘 parallelExplorationService.ts
│   │   │   │   │   │   └── 📘 timingOptimizationService.ts
│   │   │   │   │   ├── 📁 voice/
│   │   │   │   │   │   ├── 📘 function-definitions.ts
│   │   │   │   │   │   └── 📘 real-time-voice-service.ts
│   │   │   │   │   ├── 📁 workflow/
│   │   │   │   │   │   ├── 📘 prd-mapper.ts
│   │   │   │   │   │   ├── 📘 workflow-configuration.ts
│   │   │   │   │   │   └── 📘 workflow-loader.ts
│   │   │   │   │   └── 📘 utils.ts
│   │   │   │   ├── 📁 middleware/
│   │   │   │   │   └── 📘 api-rate-limiter.ts
│   │   │   │   ├── 📁 pages/
│   │   │   │   │   ├── ⚛️ Agents.tsx
│   │   │   │   │   ├── ⚛️ AIAgentsPage.tsx
│   │   │   │   │   ├── ⚛️ AnalyticsDashboard.tsx
│   │   │   │   │   ├── ⚛️ DevelopmentWorkflow.tsx
│   │   │   │   │   ├── ⚛️ EVAAssistantPage.tsx
│   │   │   │   │   ├── ⚛️ EvaOrchestrationDashboard.tsx
│   │   │   │   │   ├── ⚛️ Governance.tsx
│   │   │   │   │   ├── ⚛️ Index.tsx
│   │   │   │   │   ├── ⚛️ Insights.tsx
│   │   │   │   │   ├── ⚛️ LandingPage.tsx
│   │   │   │   │   ├── ⚛️ LiveWorkflowProgress.tsx
│   │   │   │   │   ├── ⚛️ LoginPage.tsx
│   │   │   │   │   ├── ⚛️ NotFound.tsx
│   │   │   │   │   ├── ⚛️ Notifications.tsx
│   │   │   │   │   ├── ⚛️ NotificationsAndCollaboration.tsx
│   │   │   │   │   ├── ⚛️ Phase2TestExecution.tsx
│   │   │   │   │   ├── ⚛️ Phase2Testing.tsx
│   │   │   │   │   ├── ⚛️ Phase2TestingDashboard.tsx
│   │   │   │   │   ├── ⚛️ Portfolios.tsx
│   │   │   │   │   ├── ⚛️ PortfoliosPage.tsx
│   │   │   │   │   ├── ⚛️ Reports.tsx
│   │   │   │   │   ├── ⚛️ RiskForecastingDashboard.tsx
│   │   │   │   │   ├── ⚛️ TeamPage.tsx
│   │   │   │   │   ├── ⚛️ TestingQA.tsx
│   │   │   │   │   ├── ⚛️ VentureDetail.tsx
│   │   │   │   │   ├── ⚛️ VentureDetailEnhanced.tsx
│   │   │   │   │   ├── ⚛️ Ventures.tsx
│   │   │   │   │   ├── ⚛️ VenturesPage.tsx
│   │   │   │   │   └── ⚛️ Workflows.tsx
│   │   │   │   ├── 📁 services/
│   │   │   │   │   ├── 📘 competitiveIntelligenceService.ts
│   │   │   │   │   └── 📘 workflowExecutionService.ts
│   │   │   │   ├── 📁 types/
│   │   │   │   │   ├── 📘 agents.ts
│   │   │   │   │   ├── 📘 analytics.ts
│   │   │   │   │   ├── 📘 chairman.ts
│   │   │   │   │   ├── 📘 governance.ts
│   │   │   │   │   ├── 📘 ideas.ts
│   │   │   │   │   ├── 📘 liveProgress.ts
│   │   │   │   │   ├── 📘 notifications.ts
│   │   │   │   │   ├── 📘 orchestration.ts
│   │   │   │   │   ├── 📘 testing.ts
│   │   │   │   │   ├── 📘 venture.ts
│   │   │   │   │   ├── 📘 workflow.ts
│   │   │   │   │   ├── 📘 workflowExecution.ts
│   │   │   │   │   └── 📘 workflowStages.ts
│   │   │   │   ├── 📁 utils/
│   │   │   │   │   ├── 📘 immediate-openai-test.ts
│   │   │   │   │   ├── 📘 openai-validation-test.ts
│   │   │   │   │   ├── 📘 phase2-test-runner.ts
│   │   │   │   │   └── 📘 run-openai-test.ts
│   │   │   │   ├── 🎨 App.css
│   │   │   │   ├── ⚛️ App.tsx
│   │   │   │   ├── 🎨 index.css
│   │   │   │   ├── ⚛️ main.tsx
│   │   │   │   └── 📘 vite-env.d.ts
│   │   │   ├── 📁 supabase/
│   │   │   │   ├── 📁 functions/
│   │   │   │   │   ├── 📁 adaptive-naming/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-ceo-agent/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-exit-decision-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-generate/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-knowledge-discovery/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-monitoring-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-orchestration-coordinator/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-performance-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-review/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-security-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 ai-testing-automation-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 competitive-intelligence/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 comprehensive-planning/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 comprehensive-validation/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 context-loading/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 data-lifecycle-manager/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 development-preparation/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 documentation-sync/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eleven-sign-url/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-chat/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-database-query/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-nlp-processor/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-orchestrator/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-realtime-session/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 eva-tts-chat/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 exit-readiness/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 gtm-strategy/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 health-monitor/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 integration-hub/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 integration-verification/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 openai-function-executor/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 openai-realtime-relay/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 openai-realtime-token/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 parallel-exploration-ai/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 pricing-strategy/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 problem-decomposition/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 profitability-forecasting/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 realtime-voice/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 risk-evaluation/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 risk-forecasting-engine/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 strategic-naming/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 technical-review/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 testing-orchestrator/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 timing-optimization/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   ├── 📁 voice-transcription/
│   │   │   │   │   │   └── 📘 index.ts
│   │   │   │   │   └── 📁 workflow-execution/
│   │   │   │   │       └── 📘 index.ts
│   │   │   │   ├── 📁 migrations/
│   │   │   │   │   ├── 🗄️ 20250828094259_8d7885bb-3d16-4518-8816-b804e0fe894b.sql
│   │   │   │   │   ├── 🗄️ 20250828095134_d205058b-0784-4891-ad32-543c822ce88e.sql
│   │   │   │   │   ├── 🗄️ 20250828095254_0083514c-1da9-4b46-8627-bee94aa67ea2.sql
│   │   │   │   │   ├── 🗄️ 20250828095417_9a87912b-1ac1-4919-aa88-de6e83ac2820.sql
│   │   │   │   │   ├── 🗄️ 20250828095718_646fdabe-d8a5-40cf-8c7d-3db72b1158a5.sql
│   │   │   │   │   ├── 🗄️ 20250828111443_3e6446f8-dea8-468d-b33c-23074bcf83ea.sql
│   │   │   │   │   ├── 🗄️ 20250828111525_60ddebd0-4489-46e9-822c-86c1b48acc88.sql
│   │   │   │   │   ├── 🗄️ 20250828155709_ae75aaf0-8073-4c0b-9fef-a11540a5b061.sql
│   │   │   │   │   ├── 🗄️ 20250828161004_f7d7beb9-17ed-4c49-890b-9ddb94c26901.sql
│   │   │   │   │   ├── 🗄️ 20250828172739_482313fa-09ac-4be0-9101-a2b60753ac5d.sql
│   │   │   │   │   ├── 🗄️ 20250828172806_85f77080-8990-495d-9ff5-b022dbd16f77.sql
│   │   │   │   │   ├── 🗄️ 20250828172922_b877beff-6c9e-4ebf-aef0-9a77431b0824.sql
│   │   │   │   │   ├── 🗄️ 20250828191610_e7a39b5f-e2dd-4bcc-b438-29de5cdcf72f.sql
│   │   │   │   │   ├── 🗄️ 20250828191913_72abc906-91f4-4464-8198-81c10b8c7168.sql
│   │   │   │   │   ├── 🗄️ 20250828193601_c1d78de1-0d47-4d2a-b876-a146731fd6ee.sql
│   │   │   │   │   ├── 🗄️ 20250828200256_0a891029-93a6-4274-8408-a281bb6a3d95.sql
│   │   │   │   │   ├── 🗄️ 20250828214615_d3f6231c-5b29-469b-be2a-9fd6718613cb.sql
│   │   │   │   │   ├── 🗄️ 20250828222538_9ebfa569-ef68-469c-807f-4be8c1250c38.sql
│   │   │   │   │   ├── 🗄️ 20250828224304_bc046d64-7758-4f6e-9ab8-66bc85448794.sql
│   │   │   │   │   ├── 🗄️ 20250828233654_ad68a67f-9a34-49fa-8571-9a1da51629a5.sql
│   │   │   │   │   ├── 🗄️ 20250828234818_c8a501cd-d532-473e-afd6-dee995fa8719.sql
│   │   │   │   │   ├── 🗄️ 20250828234924_43b786fb-8da4-4607-910c-8cb349496e3a.sql
│   │   │   │   │   ├── 🗄️ 20250829000247_866f55bc-62a6-47a1-a999-7f218c37b05b.sql
│   │   │   │   │   ├── 🗄️ 20250829002305_7813e66f-9bfe-40cf-88bd-9a21205d5a48.sql
│   │   │   │   │   ├── 🗄️ 20250829003957_99f8f779-d6b9-4283-81b3-1b64679dc4e0.sql
│   │   │   │   │   ├── 🗄️ 20250829005823_dc552347-ac5e-41d2-a240-ece77c698741.sql
│   │   │   │   │   ├── 🗄️ 20250829011205_7769ec3c-4a74-488b-ab44-39e0ffeb5586.sql
│   │   │   │   │   ├── 🗄️ 20250829021855_af736656-6733-4752-9561-c0a2bf418c9f.sql
│   │   │   │   │   ├── 🗄️ 20250829100257_b9a6238f-257e-42ff-b8e5-54cec003a197.sql
│   │   │   │   │   ├── 🗄️ 20250829101141_514c5607-05df-4b83-ac5c-496b24cc0a40.sql
│   │   │   │   │   ├── 🗄️ 20250829103906_5c0d671c-6e50-4dc7-8ff4-1f8027ea858b.sql
│   │   │   │   │   ├── 🗄️ 20250829104002_44794c58-11f5-49af-b581-7dc6e968ddd3.sql
│   │   │   │   │   ├── 🗄️ 20250829104209_030eeaec-dbcf-4105-9ac5-b3ddd991ad1b.sql
│   │   │   │   │   ├── 🗄️ 20250829104435_9a7d0454-907f-4360-bd6e-fc27b19641e9.sql
│   │   │   │   │   ├── 🗄️ 20250829104518_e380d248-dfc4-4cfa-bb69-0f0a1cc688fb.sql
│   │   │   │   │   ├── 🗄️ 20250829104539_1c46926f-1a6f-4b5d-83a4-d88555c5e033.sql
│   │   │   │   │   ├── 🗄️ 20250829104555_307a4dfa-9973-4dfe-99f3-e65d18fd8cb3.sql
│   │   │   │   │   ├── 🗄️ 20250829105148_68cc66e7-4255-43b6-b483-1a4a930e6842.sql
│   │   │   │   │   ├── 🗄️ 20250829105252_0e17478b-d8df-4f4f-91be-6bbdff61fd31.sql
│   │   │   │   │   ├── 🗄️ 20250829105316_0db63f24-d248-47dc-8995-fc9683d466b9.sql
│   │   │   │   │   ├── 🗄️ 20250829105343_9da73fcb-c8a4-43a6-ba53-9faad6d6bf19.sql
│   │   │   │   │   ├── 🗄️ 20250829110022_231c7d6c-7325-4477-8475-68738894716a.sql
│   │   │   │   │   ├── 🗄️ 20250829110104_4b3cba61-e841-44b0-a3e9-0b9848334dbb.sql
│   │   │   │   │   ├── 🗄️ 20250829110132_caa5f67b-f459-41de-ab2d-ed66fef808ea.sql
│   │   │   │   │   ├── 🗄️ 20250829110149_4a244419-1617-459a-9d0a-c6406c844708.sql
│   │   │   │   │   ├── 🗄️ 20250829110217_8be9f00c-4387-44a6-b6f5-d53d94d504c6.sql
│   │   │   │   │   ├── 🗄️ 20250829110902_1db8ebe7-a651-4724-b999-b6058cf7498f.sql
│   │   │   │   │   ├── 🗄️ 20250829112853_b8d1062c-a196-4711-96dc-9a8afb067ad6.sql
│   │   │   │   │   ├── 🗄️ 20250829113003_c25b4cd7-574d-41b5-ae0d-08cbb65fcc31.sql
│   │   │   │   │   ├── 🗄️ 20250829113143_1bb36a07-aa6e-4c50-b5d7-6c6e03b8b939.sql
│   │   │   │   │   ├── 🗄️ 20250829113205_7e5cb10c-4803-431c-9978-10daca5abd36.sql
│   │   │   │   │   ├── 🗄️ 20250829113329_c6801088-e989-489c-87b2-4d26f807d19a.sql
│   │   │   │   │   ├── 🗄️ 20250829113545_dbe51449-c959-4c60-a6e0-ec64aef9188f.sql
│   │   │   │   │   ├── 🗄️ 20250829121222_fea897db-7238-49b8-8499-6a9dbfbfec3f.sql
│   │   │   │   │   ├── 🗄️ 20250829122937_dd62e853-f1a9-4756-b340-4eb2b2a3f1e0.sql
│   │   │   │   │   ├── 🗄️ 20250829123022_f998ce5c-ecd5-4360-98ce-38167083d7a9.sql
│   │   │   │   │   ├── 🗄️ 20250829131052_66ef1ec8-42ad-4515-ae84-fa61f3004a98.sql
│   │   │   │   │   ├── 🗄️ 20250829132027_ea30fc27-9251-4c4a-8034-774ed67fc0b4.sql
│   │   │   │   │   ├── 🗄️ 20250829132050_176f7e63-a120-4f8d-b22a-3a86777a84a4.sql
│   │   │   │   │   ├── 🗄️ 20250829132109_0274aaf8-58f6-43ca-88e6-1ea1d5c6eb02.sql
│   │   │   │   │   ├── 🗄️ 20250829141742_aa4b2f60-7830-4ad8-a830-775e52b4e9e5.sql
│   │   │   │   │   ├── 🗄️ 20250829141817_80213681-e522-4478-8a9c-f442460ea19d.sql
│   │   │   │   │   ├── 🗄️ 20250829141852_e48ca6ea-d7bb-43ba-9c32-d75aab06fa4a.sql
│   │   │   │   │   ├── 🗄️ 20250829141937_31b66776-e970-4673-95ee-8abcdba5de19.sql
│   │   │   │   │   ├── 🗄️ 20250829142829_caf34e41-9690-4d00-a8b9-79e9cac19c68.sql
│   │   │   │   │   ├── 🗄️ 20250829144908_a4af3c6b-8fd4-4b0b-afa8-cc8510e1a19a.sql
│   │   │   │   │   ├── 🗄️ 20250829151332_b3dab31f-cd24-4df8-a428-f85a255004d4.sql
│   │   │   │   │   ├── 🗄️ 20250829152544_d247b2dc-eb80-4738-af70-078656c1080a.sql
│   │   │   │   │   ├── 🗄️ 20250829165049_4cd87d07-a700-4fd1-bb45-a2ca027bc012.sql
│   │   │   │   │   ├── 🗄️ 20250829181246_16ea8638-0d0d-4e86-85e3-c658ab6be9d0.sql
│   │   │   │   │   ├── 🗄️ 20250829205633_39032358-e8c8-4edb-a15a-84e1b3c4f2dc.sql
│   │   │   │   │   └── 🗄️ 20250829205749_830a92e7-2b94-4523-9a3b-bcfbeb729714.sql
│   │   │   │   └── 📄 config.toml
│   │   │   ├── 📁 tests/
│   │   │   │   ├── 📁 a11y/
│   │   │   │   │   ├── 📘 governance.a11y.spec.ts
│   │   │   │   │   ├── 📘 onboarding.a11y.spec.ts
│   │   │   │   │   └── 📘 settings.a11y.spec.ts
│   │   │   │   ├── 📁 e2e/
│   │   │   │   │   ├── 📘 governance.spec.ts
│   │   │   │   │   ├── 📘 onboarding.spec.ts
│   │   │   │   │   └── 📘 settings.spec.ts
│   │   │   │   ├── 📁 integration/
│   │   │   │   │   └── 📁 api/
│   │   │   │   │       └── 📘 governance.test.ts
│   │   │   │   ├── 📁 performance/
│   │   │   │   │   └── 📘 load-testing.test.ts
│   │   │   │   ├── 📁 security/
│   │   │   │   │   └── 📘 security-validation.test.ts
│   │   │   │   ├── 📁 unit/
│   │   │   │   │   ├── 📁 components/
│   │   │   │   │   │   ├── ⚛️ button.test.tsx
│   │   │   │   │   │   └── ⚛️ card.test.tsx
│   │   │   │   │   └── 📁 hooks/
│   │   │   │   │       └── 📘 use-toast.test.ts
│   │   │   │   ├── 📁 utils/
│   │   │   │   │   └── ⚛️ test-helpers.tsx
│   │   │   │   ├── 📁 visual/
│   │   │   │   │   └── 📘 shimmer-verification.spec.ts
│   │   │   │   └── 📘 setup.ts
│   │   │   ├── 📄 .env
│   │   │   ├── 📄 .gitignore
│   │   │   ├── 📄 bun.lockb
│   │   │   ├── 📋 components.json
│   │   │   ├── 📜 eslint.config.js
│   │   │   ├── 🌐 index.html
│   │   │   ├── 📋 package.json
│   │   │   ├── 📋 performance-results.json
│   │   │   ├── 📜 performance-test.js
│   │   │   ├── 📜 postcss.config.js
│   │   │   ├── 📝 README.md
│   │   │   ├── 🌐 shimmer-test.html
│   │   │   ├── 📘 tailwind.config.ts
│   │   │   ├── 📋 tsconfig.app.json
│   │   │   ├── 📋 tsconfig.json
│   │   │   ├── 📋 tsconfig.node.json
│   │   │   ├── 📘 vite.config.ts
│   │   │   └── 📘 vitest.config.ts
│   │   └── 📋 config.json
│   ├── 📁 APP002/
│   │   ├── 📁 codebase/
│   │   └── 📁 credentials/
│   │       └── 📋 encrypted.json
│   ├── 📁 APP003/
│   │   ├── 📁 codebase/
│   │   └── 📁 credentials/
│   │       └── 📋 encrypted.json
│   ├── 📄 .gitignore
│   ├── 📝 README.md
│   └── 📋 registry.json
├── 📁 apps/
│   └── 📁 ingest/
│       └── 📘 vh_governance_ingest.ts
├── 📁 artifacts/
│   └── 📄 recovery.txt
├── 📁 config/
│   ├── 📋 a11y.routes.json
│   ├── 📋 allowed-deps.json
│   ├── 📋 bundle-budget.json
│   ├── 📋 coverage.json
│   └── 📋 databases.json
├── 📁 database/
│   ├── 📁 migrations/
│   │   ├── 🗄️ 2025-09-22-add-sd-key.sql
│   │   ├── 🗄️ 2025-09-22-integrity-metrics.sql
│   │   ├── 🗄️ 2025-09-22-prd-add-sd-id.sql
│   │   ├── 🗄️ 2025-09-22-prd-sd-sync-trigger.sql
│   │   ├── 🗄️ 2025-09-22-vh-bridge-tables.sql
│   │   ├── 🗄️ add_backlog_summary_columns.sql
│   │   ├── 🗄️ add_status_automation.sql
│   │   ├── 🗄️ add_strategic_directive_id_alias.sql
│   │   ├── 🗄️ add-sd-key-constraints.sql
│   │   ├── 🗄️ add-uat-description-field.sql
│   │   ├── 🗄️ allow-uat-cases-insert.sql
│   │   ├── 🗄️ create-set-active-test-function.sql
│   │   ├── 🗄️ create-uat-sd-linking.sql
│   │   ├── 🗄️ delete-manual-uat-tests.sql
│   │   ├── 🗄️ fix-uat-rls-policies.sql
│   │   ├── 🗄️ insert-manual-test-cases.sql
│   │   ├── 🗄️ leo-ci-cd-integration.sql
│   │   ├── 🗄️ remove_execution_order_column.sql
│   │   ├── 🗄️ safe-delete-uat-case-function.sql
│   │   ├── 🗄️ seed-uat-test-cases.sql
│   │   ├── 🗄️ strategic_directive_id_migration.sql
│   │   ├── 🗄️ uat-active-test-tracking.sql
│   │   ├── 🗄️ uat-credentials-tables.sql
│   │   ├── 🗄️ uat-simple-tracking.sql
│   │   ├── 🗄️ uat-structured-reports.sql
│   │   ├── 🗄️ uat-tracking-schema.sql
│   │   └── 🗄️ verify-uat-data.sql
│   ├── 📁 schema/
│   │   ├── 🗄️ 001_initial_schema.sql
│   │   ├── 🗄️ 002_multi_app_schema.sql
│   │   ├── 🗄️ 003_vision_qa_schema.sql
│   │   ├── 🗄️ 004_prd_schema.sql
│   │   ├── 🗄️ 005_test_failures_schema.sql
│   │   ├── 🗄️ 006_sdip_schema.sql
│   │   ├── 🗄️ 007_leo_protocol_schema_fixed.sql
│   │   ├── 🗄️ 007_leo_protocol_schema.sql
│   │   ├── 🗄️ 008_impact_analysis_schema.sql
│   │   ├── 🗄️ 009_context_learning_schema.sql
│   │   ├── 🗄️ 009_prd_playwright_integration.sql
│   │   ├── 🗄️ 010_ehg_backlog_schema.sql
│   │   ├── 🗄️ 010_plan_supervisor_schema.sql
│   │   ├── 🗄️ 011_agentic_reviews_schema.sql
│   │   ├── 🗄️ 011_extend_existing_tables.sql
│   │   ├── 🗄️ 012_create_prd_view_v2.sql
│   │   ├── 🗄️ 013_leo_protocol_dashboard_fixes.sql
│   │   ├── 🗄️ 013_leo_protocol_dashboard_schema.sql
│   │   ├── 🗄️ add_cancelled_status.sql
│   │   ├── 🗄️ add_deferred_status.sql
│   │   ├── 🗄️ cleanup_tech_debt.sql
│   │   ├── 🗄️ complete_subagent_integration.sql
│   │   ├── 🗄️ drop_execution_order.sql
│   │   ├── 🗄️ leo_commit_rules.sql
│   │   ├── 🗄️ sd_execution_timeline.sql
│   │   ├── 🗄️ strategic_directives.sql
│   │   ├── 🗄️ sub_agent_tracking.sql
│   │   └── 🗄️ v_sd_release_gate.sql
│   ├── 📁 seed/
│   │   └── 🗄️ leo_validation_rules.sql
│   └── 📝 README.md
├── 📁 db/
│   ├── 📁 migrations/
│   │   ├── 📁 eng/
│   │   │   ├── 📁 legacy/
│   │   │   │   ├── 🗄️ 001_add_status_field_to_sdip_submissions.sql
│   │   │   │   ├── 📜 001_ui_validation_schema.js
│   │   │   │   ├── 🗄️ 007_sdip_database_improvements.sql
│   │   │   │   ├── 🗄️ 008_ui_validation_schema.sql
│   │   │   │   ├── 🗄️ 009_create_learning_tables.sql
│   │   │   │   ├── 🗄️ 014_leo_gap_remediation.sql
│   │   │   │   ├── 🗄️ 015_leo_gap_remediation_polish.sql
│   │   │   │   ├── 🗄️ 2025-01-17-prod-hardening.sql
│   │   │   │   ├── 🗄️ 2025-01-17-user-stories-compat.sql
│   │   │   │   ├── 🗄️ 2025-01-17-user-stories.sql
│   │   │   │   ├── 🗄️ 2025-09-EMB-message-bus.sql
│   │   │   │   ├── 🗄️ create_directive_submissions_basic.sql
│   │   │   │   ├── 🗄️ create_directive_submissions_table.sql
│   │   │   │   ├── 🗄️ create-handoff-tracking-tables.sql
│   │   │   │   ├── 🗄️ hardening-fixes.sql
│   │   │   │   ├── 🗄️ prod-pilot-seed.sql
│   │   │   │   ├── 🗄️ prod-verification-queries.sql
│   │   │   │   ├── 🗄️ rollback-2025-01-17-user-stories.sql
│   │   │   │   ├── 🗄️ rollback-SD-2025-09-EMB.sql
│   │   │   │   ├── 🗄️ schema-discovery-queries.sql
│   │   │   │   ├── 🗄️ seed-test-data.sql
│   │   │   │   ├── 🗄️ verify-2025-01-17-user-stories.sql
│   │   │   │   └── 🗄️ verify-SD-2025-09-EMB.sql
│   │   │   ├── 🗄️ 202509221300__eng_sd_metadata.sql
│   │   │   ├── 🗄️ 202509221305__eng_prd_contract.sql
│   │   │   ├── 🗄️ 202509221310__eng_backlog_contract.sql
│   │   │   ├── 🗄️ 202509221315__eng_archive_legacy.sql
│   │   │   ├── 🗄️ 202509221320__eng_fix_prd_storage_fk.sql
│   │   │   └── 🗄️ 202509221325__eng_commit_pr_linkage.sql
│   │   └── 📁 vh/
│   │       ├── 📁 legacy/
│   │       │   ├── 🗄️ 001_initial_schema.sql
│   │       │   ├── 🗄️ 002_onboarding_progress.sql
│   │       │   ├── 🗄️ 003_analytics_events.sql
│   │       │   └── 🗄️ rollback.sql
│   │       ├── 🗄️ 202509221330__vh_namespace_core.sql
│   │       ├── 🗄️ 202509221335__vh_trace_columns.sql
│   │       └── 🗄️ 202509221340__vh_ingest_governance_views.sql
│   ├── 📁 policies/
│   │   ├── 📁 eng/
│   │   │   └── 🗄️ rls.sql
│   │   └── 📁 vh/
│   │       └── 🗄️ rls.sql
│   ├── 📁 seeds/
│   │   ├── 🗄️ ci_smoke_seed.sql
│   │   └── 🗄️ integrity_gaps_seed.sql
│   └── 📁 views/
│       ├── 📁 eng/
│       │   ├── 🗄️ v_eng_backlog_rollup.sql
│       │   ├── 🗄️ v_eng_prd_payload_v1.sql
│       │   └── 🗄️ v_eng_trace.sql
│       └── 📁 vh/
│           ├── 🗄️ v_vh_governance_snapshot.sql
│           └── 🗄️ v_vh_stage_progress.sql
├── 📁 deployment/
│   ├── 📝 GATE-BLOCKING-VERIFIED.md
│   └── 📝 PRODUCTION-GATES-ENABLED.md
├── 📁 docs/
│   ├── 📁 01_architecture/
│   │   ├── 📝 13b_exit_readiness_tracking.md
│   │   ├── 📝 CLAUDE-PLAN.md
│   │   ├── 📝 database_schema.md
│   │   ├── 📝 DEEP_RESEARCH_PROMPT_DATABASE_ARCHITECTURE.md
│   │   └── 📝 README.md
│   ├── 📁 02_api/
│   │   ├── 📝 01a_draft_idea.md
│   │   ├── 📝 02_ai_review.md
│   │   ├── 📝 03_comprehensive_validation.md
│   │   ├── 📝 04a_competitive_intelligence.md
│   │   ├── 📝 04c_competitive_kpi_tracking.md
│   │   ├── 📝 05_profitability_forecasting.md
│   │   ├── 📝 06_risk_evaluation.md
│   │   ├── 📝 07_comprehensive_planning_suite.md
│   │   ├── 📝 09a_gap_analysis.md
│   │   ├── 📝 10_technical_review.md
│   │   ├── 📝 11_strategic_naming.md
│   │   ├── 📝 12_adaptive_naming.md
│   │   ├── 📝 13a_exit_oriented_design.md
│   │   ├── 📝 14_development_preparation.md
│   │   ├── 📝 15_pricing_strategy.md
│   │   ├── 📝 19_integration_verification.md
│   │   ├── 📝 23b_feedback_loops_ai.md
│   │   ├── 📝 26_security_compliance.md
│   │   ├── 📝 27_actor_model_saga.md
│   │   ├── 📝 28_dev_excellence_caching.md
│   │   ├── 📝 30_production_deployment.md
│   │   ├── 📝 40b_portfolio_exit_sequencing.md
│   │   ├── 📝 ai_ceo_agent.md
│   │   ├── 📝 CLAUDE-API.md
│   │   ├── 📝 CLAUDE-DOCUMENTATION.md
│   │   ├── 📝 design_system_handcrafted.md
│   │   ├── 📝 EES-2025-001-execution-sequences.md
│   │   ├── 📝 HANDOFF-LEAD-PLAN-2025-001.md
│   │   ├── 📝 integration_hub.md
│   │   ├── 📝 LEAD-TO-PLAN-SDIP-2025-0903.md
│   │   ├── 📝 navigation-framework-audit-report.md
│   │   ├── 📝 onboarding_quickstart.md
│   │   ├── 📝 PRD_ARCHITECTURE_MAP.md
│   │   ├── 📝 PRD-2025-001-openai-realtime-voice.md
│   │   ├── 📝 README-EHG.md
│   │   ├── 📝 README.md
│   │   ├── 📝 security-handoff.md
│   │   ├── 📝 security-subagent-sdip-handoff.md
│   │   ├── 📝 settings_personalization.md
│   │   ├── 📝 stage1_data_contract.md
│   │   ├── 📝 TESTING_DEBUGGING_SUBAGENTS_REPORT.md
│   │   └── 📝 testing_qa_enhanced.md
│   ├── 📁 03_guides/
│   │   ├── 📝 61_venture_prd_generation.md
│   │   ├── 📝 AI_GUIDE.md
│   │   ├── 📝 cost-optimization-guide.md
│   │   ├── 📝 INTEGRATION_COMPLETE.md
│   │   ├── 📝 PROJECT_REGISTRATION_GUIDE.md
│   │   └── 📝 prompt_template_library.md
│   ├── 📁 03_protocols_and_standards/
│   │   ├── 📝 leo_git_commit_guidelines_v4.2.0.md
│   │   ├── 📝 leo_github_deployment_workflow_v4.1.2.md
│   │   ├── 📝 leo_helper_tools.md
│   │   ├── 📝 LEO_PROTOCOL_CHECKLIST_ENFORCEMENT.md
│   │   ├── 📝 leo_protocol_repository_guidelines.md
│   │   ├── 📝 leo_protocol_v3.1.5.md
│   │   ├── 📝 leo_protocol_v3.1.6_improvements.md
│   │   ├── 📝 leo_protocol_v3.2.0_handoff_control_points.md
│   │   ├── 📝 leo_protocol_v3.3.0_boundary_context_skills.md
│   │   ├── 📝 leo_protocol_v4.0.md
│   │   ├── 📝 leo_protocol_v4.1.1_update.md
│   │   ├── 📝 leo_protocol_v4.1.2_database_first.md
│   │   ├── 📝 leo_protocol_v4.1.md
│   │   ├── 📝 leo_status_line_integration.md
│   │   ├── 📝 leo_status_reference.md
│   │   ├── 📝 LEO_v4.1_SUB_AGENT_HANDOFFS.md
│   │   ├── 📝 LEO_v4.1_SUMMARY.md
│   │   ├── 📝 LEO_v4.2_HYBRID_SUB_AGENTS.md
│   │   ├── 📝 LEO_v4.2_PLAYWRIGHT_TESTING_INTEGRATION.md
│   │   └── 📝 leo_vision_qa_integration.md
│   ├── 📁 04_features/
│   │   ├── 📝 01b_idea_generation_intelligence.md
│   │   ├── 📝 04b_competitive_intelligence_analysis.md
│   │   ├── 📝 08_problem_decomposition.md
│   │   ├── 📝 09b_gap_analysis_intelligence.md
│   │   ├── 📝 18_documentation_sync.md
│   │   ├── 📝 20_enhanced_context_loading.md
│   │   ├── 📝 21_preflight_check.md
│   │   ├── 📝 23a_feedback_loops.md
│   │   ├── 📝 24_mvp_engine_iteration.md
│   │   ├── 📝 29_final_polish.md
│   │   ├── 📝 31_mvp_launch.md
│   │   ├── 📝 32a_customer_success.md
│   │   ├── 📝 32b_customer_success_ai.md
│   │   ├── 📝 33_post_mvp_expansion.md
│   │   ├── 📝 34a_creative_media_automation.md
│   │   ├── 📝 34b_creative_media_automation_enhanced.md
│   │   ├── 📝 34c_creative_media_handcrafted.md
│   │   ├── 📝 35_gtm_timing_intelligence.md
│   │   ├── 📝 36_parallel_exploration.md
│   │   ├── 📝 37_strategic_risk_forecasting.md
│   │   ├── 📝 38_timing_optimization.md
│   │   ├── 📝 39_multi_venture_coordination.md
│   │   ├── 📝 40a_venture_active.md
│   │   ├── 📝 ai_ceo_competitive_intelligence_integration.md
│   │   ├── 📝 ai_ceo_exit_decision_integration.md
│   │   ├── 📝 ai_leadership_agents.md
│   │   ├── 📝 analytics_reports_insights.md
│   │   ├── 📝 authentication_identity.md
│   │   ├── 📝 automated_replication_blueprint_generator.md
│   │   ├── 📝 chairman_console.md
│   │   ├── 📝 chairman-console-assessment-prompt.md
│   │   ├── 📝 CLAUDE-COST.md
│   │   ├── 📝 CLAUDE-DATABASE.md
│   │   ├── 📝 CLAUDE-DEBUGGING.md
│   │   ├── 📝 CLAUDE-DEPENDENCY.md
│   │   ├── 📝 CLAUDE-DESIGN.md
│   │   ├── 📝 CLAUDE-EXEC.md
│   │   ├── 📝 CLAUDE-LEAD.md
│   │   ├── 📝 CLAUDE-PERFORMANCE.md
│   │   ├── 📝 CLAUDE-SECURITY.md
│   │   ├── 📝 creative_quality_assurance_framework.md
│   │   ├── 📝 customer_success_retention_automation_integration.md
│   │   ├── 📝 data_management_kb.md
│   │   ├── 📝 database-handoff.md
│   │   ├── 📝 database-subagent-sdip-handoff.md
│   │   ├── 📝 design_system.md
│   │   ├── 📝 design-fixes.md
│   │   ├── 📝 design-handoff.md
│   │   ├── 📝 design-subagent-sdip-handoff.md
│   │   ├── 📝 development_excellence.md
│   │   ├── 📝 directive-lab-ui-recommendations.md
│   │   ├── 📝 EHG_ENGINEER_README.md
│   │   ├── 📝 ENHANCED_SUBAGENTS_SUCCESS_REPORT.md
│   │   ├── 📝 eva_assistant_orchestration.md
│   │   ├── 📝 FIX_HOOK_ERRORS.md
│   │   ├── 📝 FIX_TRUNCATION.md
│   │   ├── 📝 governance_compliance.md
│   │   ├── 📝 gtm_creative_assets.md
│   │   ├── 📝 gtm_strategist_agent.md
│   │   ├── 📝 gtm_strategist_marketing_automation.md
│   │   ├── 📝 HANDOFF-PLAN-EXEC-2025-001.md
│   │   ├── 📝 IMPORTANT_DATABASE_DISTINCTION.md
│   │   ├── 📝 lead-vision-qa-workflow.md
│   │   ├── 📝 LEO_CLI_ENHANCEMENT_SUMMARY.md
│   │   ├── 📝 LEO-Protocol-SD-002-Retrospective.md
│   │   ├── 📝 mvp_engine.md
│   │   ├── 📝 navigation_ui.md
│   │   ├── 📝 notifications_collaboration.md
│   │   ├── 📝 opportunity_matrix_analyzer.md
│   │   ├── 📝 performance-handoff.md
│   │   ├── 📝 performance-optimization-plan.md
│   │   ├── 📝 plan-vision-qa-workflow.md
│   │   ├── 📝 PRD-SD-002-shimmer-ai-avatar.md
│   │   ├── 📝 programmatic_seo_content_engine.md
│   │   ├── 📝 README-supabase-cli-backup.md
│   │   ├── 📝 REALTIME_VOICE_FUNCTIONS.md
│   │   ├── 📝 research-prompt.md
│   │   ├── 📝 schema-erd.md
│   │   ├── 📝 SD-002-shimmer-ai-avatar.md
│   │   ├── 📝 SD-002-With-Control-Points.md
│   │   ├── 📝 SD-2025-001-openai-realtime-voice.md
│   │   ├── 📝 security-fixes.md
│   │   ├── 📝 SIMPLE_PROJECT_SETUP.md
│   │   ├── 📝 strategic_intelligence_scaling.md
│   │   ├── 📝 SUPABASE_MIGRATION_INSTRUCTIONS.md
│   │   ├── 📝 UI_VALIDATION_SETUP_INSTRUCTIONS.md
│   │   └── 📝 user_stories_journeys.md
│   ├── 📁 05_testing/
│   │   ├── 📝 22_iterative_dev_loop.md
│   │   ├── 📝 25_quality_assurance.md
│   │   ├── 📝 CLAUDE-TESTING.md
│   │   ├── 📝 DIRECTIVE_LAB_UI_IMPROVEMENTS.md
│   │   ├── 📝 exec-vision-qa-workflow.md
│   │   ├── 📝 SD-TEST-001-shimmer-avatar.md
│   │   ├── 📝 testing_qa.md
│   │   ├── 📝 TESTING_REPORT_STAGES_1_20.md
│   │   ├── 📝 testing-handoff.md
│   │   ├── 📝 testing-subagent-sdip-handoff.md
│   │   └── 📝 VOICE_FUNCTION_TEST_SCENARIOS.md
│   ├── 📁 06_deployment/
│   │   └── 📝 deployment_ops.md
│   ├── 📁 approvals/
│   │   └── 📝 lead-final-production-approval.md
│   ├── 📁 EHG/
│   │   ├── 📁 data-contracts/
│   │   │   └── 📝 venture_entities.md
│   │   └── 📝 README.md
│   ├── 📁 EHG_Engineering/
│   │   ├── 📁 data-contracts/
│   │   │   ├── 📝 backlog.md
│   │   │   ├── 📝 product_requirements.md
│   │   │   └── 📝 strategic_directives.md
│   │   ├── 📝 README.md
│   │   └── 📝 SUPABASE-EXECUTION-GUIDE.md
│   ├── 📁 examples/
│   │   └── 📝 boundary_enforcement_example.md
│   ├── 📁 handoffs/
│   │   └── 📝 exec-to-plan-week1-verification.md
│   ├── 📁 implementation/
│   │   └── 📝 next_steps_execution_plan.md
│   ├── 📁 leo/
│   │   ├── 📝 api.md
│   │   └── 📝 gates.md
│   ├── 📁 product-requirements/
│   │   ├── 📝 SD-2025-01-15-A-PRD.md
│   │   └── 📝 SD-2025-09-EMB-README.md
│   ├── 📁 research/
│   │   ├── 📁 stages/
│   │   │   ├── 📝 01_brief.md
│   │   │   ├── 📋 01_prompt_gemini.json
│   │   │   ├── 📋 01_prompt_gpt5.json
│   │   │   ├── 📝 02_brief.md
│   │   │   ├── 📋 02_prompt_gemini.json
│   │   │   ├── 📋 02_prompt_gpt5.json
│   │   │   ├── 📝 03_brief.md
│   │   │   ├── 📋 03_prompt_gemini.json
│   │   │   ├── 📋 03_prompt_gpt5.json
│   │   │   ├── 📝 04_brief.md
│   │   │   ├── 📋 04_prompt_gemini.json
│   │   │   ├── 📋 04_prompt_gpt5.json
│   │   │   ├── 📝 05_brief.md
│   │   │   ├── 📋 05_prompt_gemini.json
│   │   │   ├── 📋 05_prompt_gpt5.json
│   │   │   ├── 📝 06_brief.md
│   │   │   ├── 📋 06_prompt_gemini.json
│   │   │   ├── 📋 06_prompt_gpt5.json
│   │   │   ├── 📝 07_brief.md
│   │   │   ├── 📋 07_prompt_gemini.json
│   │   │   ├── 📋 07_prompt_gpt5.json
│   │   │   ├── 📝 08_brief.md
│   │   │   ├── 📋 08_prompt_gemini.json
│   │   │   ├── 📋 08_prompt_gpt5.json
│   │   │   ├── 📝 09_brief.md
│   │   │   ├── 📋 09_prompt_gemini.json
│   │   │   ├── 📋 09_prompt_gpt5.json
│   │   │   ├── 📝 10_brief.md
│   │   │   ├── 📋 10_prompt_gemini.json
│   │   │   ├── 📋 10_prompt_gpt5.json
│   │   │   ├── 📝 11_brief.md
│   │   │   ├── 📋 11_prompt_gemini.json
│   │   │   ├── 📋 11_prompt_gpt5.json
│   │   │   ├── 📝 12_brief.md
│   │   │   ├── 📋 12_prompt_gemini.json
│   │   │   ├── 📋 12_prompt_gpt5.json
│   │   │   ├── 📝 13_brief.md
│   │   │   ├── 📋 13_prompt_gemini.json
│   │   │   ├── 📋 13_prompt_gpt5.json
│   │   │   ├── 📝 14_brief.md
│   │   │   ├── 📋 14_prompt_gemini.json
│   │   │   ├── 📋 14_prompt_gpt5.json
│   │   │   ├── 📝 15_brief.md
│   │   │   ├── 📋 15_prompt_gemini.json
│   │   │   ├── 📋 15_prompt_gpt5.json
│   │   │   ├── 📝 16_brief.md
│   │   │   ├── 📋 16_prompt_gemini.json
│   │   │   ├── 📋 16_prompt_gpt5.json
│   │   │   ├── 📝 17_brief.md
│   │   │   ├── 📋 17_prompt_gemini.json
│   │   │   ├── 📋 17_prompt_gpt5.json
│   │   │   ├── 📝 18_brief.md
│   │   │   ├── 📋 18_prompt_gemini.json
│   │   │   ├── 📋 18_prompt_gpt5.json
│   │   │   ├── 📝 19_brief.md
│   │   │   ├── 📋 19_prompt_gemini.json
│   │   │   ├── 📋 19_prompt_gpt5.json
│   │   │   ├── 📝 20_brief.md
│   │   │   ├── 📋 20_prompt_gemini.json
│   │   │   ├── 📋 20_prompt_gpt5.json
│   │   │   ├── 📝 21_brief.md
│   │   │   ├── 📋 21_prompt_gemini.json
│   │   │   ├── 📋 21_prompt_gpt5.json
│   │   │   ├── 📝 22_brief.md
│   │   │   ├── 📋 22_prompt_gemini.json
│   │   │   ├── 📋 22_prompt_gpt5.json
│   │   │   ├── 📝 23_brief.md
│   │   │   ├── 📋 23_prompt_gemini.json
│   │   │   ├── 📋 23_prompt_gpt5.json
│   │   │   ├── 📝 24_brief.md
│   │   │   ├── 📋 24_prompt_gemini.json
│   │   │   ├── 📋 24_prompt_gpt5.json
│   │   │   ├── 📝 25_brief.md
│   │   │   ├── 📋 25_prompt_gemini.json
│   │   │   ├── 📋 25_prompt_gpt5.json
│   │   │   ├── 📝 26_brief.md
│   │   │   ├── 📋 26_prompt_gemini.json
│   │   │   ├── 📋 26_prompt_gpt5.json
│   │   │   ├── 📝 27_brief.md
│   │   │   ├── 📋 27_prompt_gemini.json
│   │   │   ├── 📋 27_prompt_gpt5.json
│   │   │   ├── 📝 28_brief.md
│   │   │   ├── 📋 28_prompt_gemini.json
│   │   │   ├── 📋 28_prompt_gpt5.json
│   │   │   ├── 📝 29_brief.md
│   │   │   ├── 📋 29_prompt_gemini.json
│   │   │   ├── 📋 29_prompt_gpt5.json
│   │   │   ├── 📝 30_brief.md
│   │   │   ├── 📋 30_prompt_gemini.json
│   │   │   ├── 📋 30_prompt_gpt5.json
│   │   │   ├── 📝 31_brief.md
│   │   │   ├── 📋 31_prompt_gemini.json
│   │   │   ├── 📋 31_prompt_gpt5.json
│   │   │   ├── 📝 32_brief.md
│   │   │   ├── 📋 32_prompt_gemini.json
│   │   │   ├── 📋 32_prompt_gpt5.json
│   │   │   ├── 📝 33_brief.md
│   │   │   ├── 📋 33_prompt_gemini.json
│   │   │   ├── 📋 33_prompt_gpt5.json
│   │   │   ├── 📝 34_brief.md
│   │   │   ├── 📋 34_prompt_gemini.json
│   │   │   ├── 📋 34_prompt_gpt5.json
│   │   │   ├── 📝 35_brief.md
│   │   │   ├── 📋 35_prompt_gemini.json
│   │   │   ├── 📋 35_prompt_gpt5.json
│   │   │   ├── 📝 36_brief.md
│   │   │   ├── 📋 36_prompt_gemini.json
│   │   │   ├── 📋 36_prompt_gpt5.json
│   │   │   ├── 📝 37_brief.md
│   │   │   ├── 📋 37_prompt_gemini.json
│   │   │   ├── 📋 37_prompt_gpt5.json
│   │   │   ├── 📝 38_brief.md
│   │   │   ├── 📋 38_prompt_gemini.json
│   │   │   ├── 📋 38_prompt_gpt5.json
│   │   │   ├── 📝 39_brief.md
│   │   │   ├── 📋 39_prompt_gemini.json
│   │   │   ├── 📋 39_prompt_gpt5.json
│   │   │   ├── 📝 40_brief.md
│   │   │   ├── 📋 40_prompt_gemini.json
│   │   │   └── 📋 40_prompt_gpt5.json
│   │   ├── 📝 claude_code_context_research_findings.md
│   │   ├── 📝 claude_code_leo_integration_research_plan.md
│   │   ├── 📋 overall_prompt_gemini.json
│   │   ├── 📋 overall_prompt_gpt5.json
│   │   ├── 📝 overall_research_brief.md
│   │   └── 📝 README.md
│   ├── 📁 retrospectives/
│   │   └── 📝 2025-09-22-supabase-backlog-journey.md
│   ├── 📁 stages/
│   │   ├── 📁 individual/
│   │   │   ├── 📄 01.mmd
│   │   │   ├── 📄 02.mmd
│   │   │   ├── 📄 03.mmd
│   │   │   ├── 📄 04.mmd
│   │   │   ├── 📄 05.mmd
│   │   │   ├── 📄 06.mmd
│   │   │   ├── 📄 07.mmd
│   │   │   ├── 📄 08.mmd
│   │   │   ├── 📄 09.mmd
│   │   │   ├── 📄 10.mmd
│   │   │   ├── 📄 11.mmd
│   │   │   ├── 📄 12.mmd
│   │   │   ├── 📄 13.mmd
│   │   │   ├── 📄 14.mmd
│   │   │   ├── 📄 15.mmd
│   │   │   ├── 📄 16.mmd
│   │   │   ├── 📄 17.mmd
│   │   │   ├── 📄 18.mmd
│   │   │   ├── 📄 19.mmd
│   │   │   ├── 📄 20.mmd
│   │   │   ├── 📄 21.mmd
│   │   │   ├── 📄 22.mmd
│   │   │   ├── 📄 23.mmd
│   │   │   ├── 📄 24.mmd
│   │   │   ├── 📄 25.mmd
│   │   │   ├── 📄 26.mmd
│   │   │   ├── 📄 27.mmd
│   │   │   ├── 📄 28.mmd
│   │   │   ├── 📄 29.mmd
│   │   │   ├── 📄 30.mmd
│   │   │   ├── 📄 31.mmd
│   │   │   ├── 📄 32.mmd
│   │   │   ├── 📄 33.mmd
│   │   │   ├── 📄 34.mmd
│   │   │   ├── 📄 35.mmd
│   │   │   ├── 📄 36.mmd
│   │   │   ├── 📄 37.mmd
│   │   │   ├── 📄 38.mmd
│   │   │   ├── 📄 39.mmd
│   │   │   └── 📄 40.mmd
│   │   ├── 📄 01-ideation.mmd
│   │   ├── 📄 02-planning.mmd
│   │   ├── 📄 03-development.mmd
│   │   ├── 📄 04-launch.mmd
│   │   ├── 📄 05-operations.mmd
│   │   ├── 📄 overview.mmd
│   │   └── 📝 README.md
│   ├── 📁 templates/
│   │   ├── 📁 agent_communications/
│   │   │   ├── 📝 lead_to_plan_handoff.md
│   │   │   └── 📝 plan_to_exec_handoff.md
│   │   ├── 📁 leo_protocol/
│   │   │   ├── 📝 epic_execution_sequence_template.md
│   │   │   ├── 📝 lead_to_plan_handoff.md
│   │   │   ├── 📝 plan_to_exec_handoff.md
│   │   │   ├── 📝 prd_template.md
│   │   │   └── 📝 strategic_directive_template.md
│   │   └── 📝 PRD-template.md
│   ├── 📁 uat/
│   │   └── 📝 README.md
│   ├── 📁 validation/
│   │   └── 📝 PHASE4-VALIDATION-REPORT.md
│   ├── 📁 vision/
│   │   └── ⚙️ rubric.yaml
│   ├── 📁 wbs_artefacts/
│   │   ├── 📁 execution_sequences/
│   │   │   ├── 📝 EES-2025-01-15-A-01.md
│   │   │   └── 📝 EES-2025-01-15-A-02.md
│   │   └── 📁 strategic_directives/
│   │       ├── 📝 SD-2025-01-15-A.md
│   │       └── 📝 SD-2025-08-29-A.md
│   ├── 📁 workflow/
│   │   ├── 📁 backlog/
│   │   │   ├── 📁 issues/
│   │   │   │   ├── 📝 WF-001.md
│   │   │   │   ├── 📝 WF-002.md
│   │   │   │   ├── 📝 WF-003.md
│   │   │   │   ├── 📝 WF-004.md
│   │   │   │   ├── 📝 WF-005.md
│   │   │   │   ├── 📝 WF-006.md
│   │   │   │   ├── 📝 WF-007.md
│   │   │   │   ├── 📝 WF-008.md
│   │   │   │   ├── 📝 WF-009.md
│   │   │   │   ├── 📝 WF-010.md
│   │   │   │   ├── 📝 WF-011.md
│   │   │   │   ├── 📝 WF-012.md
│   │   │   │   ├── 📝 WF-013.md
│   │   │   │   ├── 📝 WF-014.md
│   │   │   │   └── 📝 WF-015.md
│   │   │   └── ⚙️ backlog.yaml
│   │   ├── 📁 critique/
│   │   │   ├── 📝 overview.md
│   │   │   ├── 📝 stage-01.md
│   │   │   ├── 📝 stage-02.md
│   │   │   ├── 📝 stage-03.md
│   │   │   ├── 📝 stage-04.md
│   │   │   ├── 📝 stage-05.md
│   │   │   ├── 📝 stage-06.md
│   │   │   ├── 📝 stage-07.md
│   │   │   ├── 📝 stage-08.md
│   │   │   ├── 📝 stage-09.md
│   │   │   ├── 📝 stage-10.md
│   │   │   ├── 📝 stage-11.md
│   │   │   ├── 📝 stage-12.md
│   │   │   ├── 📝 stage-13.md
│   │   │   ├── 📝 stage-14.md
│   │   │   ├── 📝 stage-15.md
│   │   │   ├── 📝 stage-16.md
│   │   │   ├── 📝 stage-17.md
│   │   │   ├── 📝 stage-18.md
│   │   │   ├── 📝 stage-19.md
│   │   │   ├── 📝 stage-20.md
│   │   │   ├── 📝 stage-21.md
│   │   │   ├── 📝 stage-22.md
│   │   │   ├── 📝 stage-23.md
│   │   │   ├── 📝 stage-24.md
│   │   │   ├── 📝 stage-25.md
│   │   │   ├── 📝 stage-26.md
│   │   │   ├── 📝 stage-27.md
│   │   │   ├── 📝 stage-28.md
│   │   │   ├── 📝 stage-29.md
│   │   │   ├── 📝 stage-30.md
│   │   │   ├── 📝 stage-31.md
│   │   │   ├── 📝 stage-32.md
│   │   │   ├── 📝 stage-33.md
│   │   │   ├── 📝 stage-34.md
│   │   │   ├── 📝 stage-35.md
│   │   │   ├── 📝 stage-36.md
│   │   │   ├── 📝 stage-37.md
│   │   │   ├── 📝 stage-38.md
│   │   │   ├── 📝 stage-39.md
│   │   │   └── 📝 stage-40.md
│   │   ├── 📁 metrics/
│   │   │   └── ⚙️ thresholds.yaml
│   │   ├── 📁 sop/
│   │   │   ├── 📝 01-draft-idea.md
│   │   │   ├── 📝 02-ai-review.md
│   │   │   ├── 📝 03-comprehensive-validation.md
│   │   │   ├── 📝 04-competitive-intelligence-market-defense.md
│   │   │   ├── 📝 05-profitability-forecasting.md
│   │   │   ├── 📝 06-risk-evaluation.md
│   │   │   ├── 📝 07-comprehensive-planning-suite.md
│   │   │   ├── 📝 08-problem-decomposition-engine.md
│   │   │   ├── 📝 09-gap-analysis-market-opportunity-modeling.md
│   │   │   ├── 📝 10-comprehensive-technical-review.md
│   │   │   ├── 📝 11-strategic-naming-brand-foundation.md
│   │   │   ├── 📝 12-adaptive-naming-module.md
│   │   │   ├── 📝 13-exit-oriented-design.md
│   │   │   ├── 📝 14-comprehensive-development-preparation.md
│   │   │   ├── 📝 15-pricing-strategy-revenue-architecture.md
│   │   │   ├── 📝 16-ai-ceo-agent-development.md
│   │   │   ├── 📝 17-gtm-strategist-agent-development.md
│   │   │   ├── 📝 18-documentation-sync-to-github.md
│   │   │   ├── 📝 19-tri-party-integration-verification.md
│   │   │   ├── 📝 20-enhanced-context-loading.md
│   │   │   ├── 📝 21-final-pre-flight-check.md
│   │   │   ├── 📝 22-iterative-development-loop.md
│   │   │   ├── 📝 23-continuous-feedback-loops.md
│   │   │   ├── 📝 24-mvp-engine-automated-feedback-iteration.md
│   │   │   ├── 📝 25-quality-assurance.md
│   │   │   ├── 📝 26-security-compliance-certification.md
│   │   │   ├── 📝 27-actor-model-saga-transaction-integration.md
│   │   │   ├── 📝 28-development-excellence-caching-optimizations.md
│   │   │   ├── 📝 29-final-polish.md
│   │   │   ├── 📝 30-production-deployment.md
│   │   │   ├── 📝 31-mvp-launch.md
│   │   │   ├── 📝 32-customer-success-retention-engineering.md
│   │   │   ├── 📝 33-post-mvp-expansion.md
│   │   │   ├── 📝 34-creative-media-automation.md
│   │   │   ├── 📝 35-gtm-timing-intelligence.md
│   │   │   ├── 📝 36-parallel-exploration.md
│   │   │   ├── 📝 37-strategic-risk-forecasting.md
│   │   │   ├── 📝 38-timing-optimization.md
│   │   │   ├── 📝 39-multi-venture-coordination.md
│   │   │   └── 📝 40-venture-active.md
│   │   ├── 📝 GENERATION_SUMMARY.md
│   │   ├── 📄 prd_crosswalk.csv
│   │   ├── 📝 prd_crosswalk.md
│   │   ├── 📝 README.md
│   │   ├── 📝 SOP_INDEX.md
│   │   └── ⚙️ stages.yaml
│   ├── 📝 AGENT_SUBAGENT_BACKSTORY_SYSTEM.md
│   ├── 📝 API-DOCUMENTATION.md
│   ├── 📝 ARCHITECTURAL_GUIDELINES.md
│   ├── 📝 BACKLOG_MANAGEMENT_GUIDE.md
│   ├── 📝 boundary-examples.md
│   ├── 📝 CODE_REVIEW_SD-2025-001.md
│   ├── 📝 DASHBOARD_AUDIT_REPORT.md
│   ├── 📝 DASHBOARD_RESILIENCE_IMPROVEMENTS.md
│   ├── 📝 DASHBOARD_TEST_REPORT.md
│   ├── 📝 DASHBOARD_UI_ANALYSIS_REPORT.md
│   ├── 📝 DASHBOARD_VERIFICATION_BUG_REPORT.md
│   ├── 📝 dashboard-guide.md
│   ├── 📝 DATABASE_ARCHITECTURE_GUIDE.md
│   ├── 📝 DATABASE_ARCHITECTURE.md
│   ├── 📝 DATABASE_CONNECTION_GUIDE.md
│   ├── 📝 DATABASE_LOADER_CONSOLIDATION.md
│   ├── 📝 DATABASE_SUB_AGENT_VERIFICATION_REPORT.md
│   ├── 📝 DESIGN_SUBAGENT_VERIFICATION_REPORT.md
│   ├── 📝 DOCUMENTATION_STANDARDS.md
│   ├── 📝 EHG_UAT_Script.md
│   ├── 📝 ENHANCED_TESTING_API_REFERENCE.md
│   ├── 📝 ENHANCED_TESTING_ARCHITECTURE.md
│   ├── 📝 ENHANCED_TESTING_DEBUGGING_README.md
│   ├── 📝 ENHANCED_TESTING_INDEX.md
│   ├── 📝 ENHANCED_TESTING_INTEGRATION_GUIDE.md
│   ├── 📝 ENHANCED_TESTING_TROUBLESHOOTING.md
│   ├── 📝 EXEC_AGENT_CLARIFICATION.md
│   ├── 📝 EXEC-TO-PLAN-HANDOFF-SD-2025-0904-JSY-FIX-COMPLETE.md
│   ├── 📋 integration-test-results.json
│   ├── 📝 LEAD_APPROVAL_DECISION.md
│   ├── 📝 LEAD_FINAL_APPROVAL_SD-2025-001.md
│   ├── 📝 LEO_CI_CD_INTEGRATION_SETUP.md
│   ├── 📝 LEO_PROTOCOL_COMPLIANCE_REPORT_SDIP.md
│   ├── 📝 LEO_PROTOCOL_OBSERVATIONS_2025-09-03.md
│   ├── 📝 LEO_PROTOCOL_QUICK_REFERENCE.md
│   ├── 📝 LEO_PROTOCOL_v4.2_DYNAMIC_CHECKLISTS.md
│   ├── 📝 LEO_PROTOCOL_v4.3_SUBAGENT_ENFORCEMENT.md
│   ├── 📝 leo-hook-feedback-system.md
│   ├── 📝 leo-protocol-enforcement-guide.md
│   ├── 📝 multi-app-protocol.md
│   ├── 📝 NAVIGATION_FIXES_COMPLETE.md
│   ├── 📝 orchestrator-bug-fix-summary.md
│   ├── 📝 PERFORMANCE_ANALYSIS_SD-2025-001.md
│   ├── 📝 PERFORMANCE_SUB_AGENT_FINAL_REPORT.md
│   ├── 📋 performance-validation-results.json
│   ├── 📝 PLAN_VERIFICATION_COMPLETE_SD-2025-001.md
│   ├── 📝 PLAN_VERIFICATION_REPORT.md
│   ├── 📝 PLAN-SD-2025-001-Technical-Specs.md
│   ├── 📝 PLAYWRIGHT_INTEGRATION_SUMMARY.md
│   ├── 📝 PRD_CREATION_PROCESS.md
│   ├── 📝 README.md
│   ├── 📝 RECOMMENDATIONS-FROM-EHG-PLATFORM.md
│   ├── 📝 REMEDIATION_COMPLETE.md
│   ├── 📝 sd-completion-critical-fields.md
│   ├── 📝 SUB_AGENT_ACTIVATION_GUIDE.md
│   ├── 📝 SUB_AGENT_IMPROVEMENTS_SUMMARY.md
│   ├── 📝 SUPABASE_CONNECTION_FIXED.md
│   ├── 📝 SUPABASE_CONNECTIVITY_GUIDE.md
│   ├── 📝 team-migration-guide.md
│   ├── 📝 TESTING_DEBUGGING_COLLABORATION_PLAYBOOK.md
│   ├── 📝 TUNING_PLAN_WEEK_1.md
│   ├── 📝 UI_VALIDATION_REPORT.md
│   └── 📝 vision-qa-system.md
├── 📁 events/
│   └── 📁 contracts/
│       └── 📋 story-events.json
├── 📁 examples/
│   └── 📜 vision-qa-scenarios.js
├── 📁 gitops/
│   ├── 📁 argocd/
│   │   ├── 📁 applications/
│   │   │   ├── ⚙️ observability-sync.yaml
│   │   │   └── ⚙️ policy-sync.yaml
│   │   └── 📁 drift-detection/
│   │       └── ⚙️ drift-monitor.yaml
│   ├── 📁 kustomize/
│   │   ├── 📁 base/
│   │   │   ├── ⚙️ kustomization.yaml
│   │   │   ├── ⚙️ namespaces.yaml
│   │   │   ├── ⚙️ network-policies.yaml
│   │   │   └── ⚙️ rbac.yaml
│   │   └── 📁 overlays/
│   │       ├── 📁 development/
│   │       │   └── ⚙️ kustomization.yaml
│   │       └── 📁 production/
│   │           └── ⚙️ kustomization.yaml
│   └── 📁 rollback/
│       └── ⚙️ rollback-procedures.yaml
├── 📁 hooks/
│   ├── 📁 wrappers/
│   │   ├── 🔧 post-tool-wrapper.sh
│   │   └── 🔧 pre-tool-wrapper.sh
│   └── 📝 README.md
├── 📁 kb/
│   └── 📁 ehg-review/
│       ├── 📝 00_foundations_ops_instructions.md
│       ├── 📝 01_vision_ehg_eva.md
│       ├── 📝 02_architecture_boundaries.md
│       ├── 📝 03_leo_protocol_roles_workflow.md
│       ├── 📝 04_governance_kpis_prompts.md
│       └── 📝 KB_REFRESH_REPORT.md
├── 📁 kyverno/
│   ├── ⚙️ require-image-digests.yaml
│   ├── ⚙️ require-signed-images.yaml
│   └── ⚙️ require-slsa-provenance.yaml
├── 📁 lib/
│   ├── 📁 agents/
│   │   ├── 📁 enhancements/
│   │   │   ├── 📜 agent-behavior-system.js
│   │   │   └── 📜 collaboration-engine.js
│   │   ├── 📁 personas/
│   │   │   ├── 📁 sub-agents/
│   │   │   │   ├── 📋 database-agent.json
│   │   │   │   ├── 📋 design-agent.json
│   │   │   │   ├── 📋 performance-agent.json
│   │   │   │   ├── 📋 security-agent.json
│   │   │   │   └── 📋 testing-agent.json
│   │   │   ├── 📋 exec-agent.json
│   │   │   ├── 📋 lead-agent.json
│   │   │   └── 📋 plan-agent.json
│   │   ├── 📜 api-sub-agent.js
│   │   ├── 📜 auto-fix-engine.js
│   │   ├── 📜 auto-selector.js
│   │   ├── 📜 base-sub-agent.js
│   │   ├── 📜 context-monitor.js
│   │   ├── 📜 cost-sub-agent.js
│   │   ├── 📜 database-sub-agent.js
│   │   ├── 📜 dependency-sub-agent.js
│   │   ├── 📜 design-sub-agent.js
│   │   ├── 📜 documentation-agent.js
│   │   ├── 📜 documentation-sub-agent-dynamic.js
│   │   ├── 📜 documentation-sub-agent.js
│   │   ├── 📜 dynamic-sub-agent-wrapper.js
│   │   ├── 📜 exec-coordination-tool.js
│   │   ├── 📜 github-review-coordinator.js
│   │   ├── 📜 incremental-analyzer.js
│   │   ├── 📜 intelligent-base-sub-agent.js
│   │   ├── 📜 intelligent-multi-selector.js
│   │   ├── 📜 learning-database.js
│   │   ├── 📜 learning-system.js
│   │   ├── 📜 performance-optimizer.js
│   │   ├── 📜 performance-sub-agent.js
│   │   ├── 📜 plan-verification-tool.js
│   │   ├── 📜 priority-engine.js
│   │   ├── 📜 prompt-enhancer.js
│   │   ├── 📜 response-integrator.js
│   │   ├── 📜 security-sub-agent.js
│   │   ├── 📜 shared-intelligence-hub.js
│   │   ├── 📜 testing-sub-agent.js
│   │   ├── 📜 type-mapping.js
│   │   └── 📜 uat-sub-agent.js
│   ├── 📁 ai/
│   │   └── 📜 multimodal-client.js
│   ├── 📁 middleware/
│   │   └── 📘 rate-limiter.ts
│   ├── 📁 security/
│   │   └── 📜 encryption.js
│   ├── 📁 sync/
│   │   └── 📜 sync-manager.js
│   ├── 📁 testing/
│   │   ├── 📜 enhanced-testing-debugging-agents.js
│   │   ├── 📜 fix-recommendation-engine.js
│   │   ├── 📜 playwright-bridge.js
│   │   ├── 📜 prd-playwright-generator.js
│   │   ├── 📜 prd-ui-validator.js
│   │   ├── 📜 test-reporter.js
│   │   ├── 📜 testing-sub-agent.js
│   │   ├── 📜 uat-vision-integration.js
│   │   ├── 📜 vision-analyzer.js
│   │   └── 📜 vision-qa-agent.js
│   ├── 📁 utils/
│   │   └── 📜 log-sanitizer.js
│   ├── 📁 validation/
│   │   ├── 📘 leo-schemas.ts
│   │   ├── 📜 prd-requirement-extractor.js
│   │   ├── 📜 ui-validator-playwright.js
│   │   └── 📜 validation-gate-enforcer.js
│   ├── 📁 websocket/
│   │   └── 📘 leo-events.ts
│   ├── 📜 supabase-client.js
│   └── 📜 timeline-tracker.js
├── 📁 ops/
│   ├── 📁 archives/
│   │   └── 📝 README.md
│   ├── 📁 audit/
│   │   ├── 📝 2025-09-22.md
│   ├── 📁 backfill/
│   │   ├── 🗄️ eng_backfill_governance.sql
│   │   └── 📄 eng_owner_map.csv
│   ├── 📁 checks/
│   │   ├── 🗄️ assert_ci_smoke.sql
│   │   ├── 🗄️ backlog_assert_critical.sql
│   │   ├── 🗄️ backlog_assert_cycles.sql
│   │   ├── 🗄️ backlog_integrity_staging.sql
│   │   ├── 🗄️ backlog_integrity.sql
│   │   ├── 🗄️ backlog_sequence_staging.sql
│   │   ├── 🗄️ schema_compatibility_check.sql
│   │   ├── 🗄️ test_connection.sql
│   │   ├── 🗄️ verify_objects.sql
│   │   ├── 🗄️ verify_rls.sql
│   │   ├── 🗄️ vh_ideation_integrity_staging.sql
│   │   ├── 🗄️ vision_alignment_staging.sql
│   │   ├── 🔧 vision_code_scan_simple.sh
│   │   ├── 🔧 vision_code_scan.sh
│   │   └── 🗄️ wsjf_recommendations_staging.sql
│   ├── 📁 ci/
│   │   └── 📄 bloat-allowlist.txt
│   ├── 📁 inbox/
│   │   ├── 📄 .gitkeep
│   │   ├── 📄 orphan_links.csv.example
│   │   ├── 📝 README.md
│   │   ├── 📄 vision_prd_manifest.csv
│   │   └── 📄 vision_sd_manifest.csv
│   ├── 📁 jobs/
│   │   ├── 🗄️ backlog_apply_fixes_staging.sql
│   │   ├── 🔧 hydrate_vh_linkage.sh
│   │   ├── 🗄️ hydrate_vh_linkage.sql
│   │   ├── 🗄️ orphan_apply_links_staging.sql
│   │   ├── 🗄️ vision_apply_governance_staging.sql
│   │   ├── 🗄️ vision_apply_stories_staging.sql
│   │   ├── 🗄️ wsjf_bulk_accept_staging.sql
│   │   └── 🗄️ wsjf_proposals_ingest_staging.sql
│   ├── 📁 runbooks/
│   │   ├── 📝 direct_to_prod_housekeeping.md
│   │   └── 📝 prod_promotion_housekeeping.md
│   ├── 📁 scripts/
│   │   ├── 📄 _apply_order.txt
│   │   ├── 🔧 psql_exec.sh
│   │   ├── 🔧 run_backfills.sh
│   │   ├── 🔧 run_checks.sh
│   │   ├── 🔧 staging_apply.sh
│   │   └── 🗄️ staging_apply.sql
│   ├── 📁 stage/
│   │   ├── 🔧 bootstrap.sh
│   │   ├── 🗄️ create_codex_user.sql
│   │   ├── ⚙️ docker-compose.yml
│   │   ├── 📝 README.md
│   │   └── 📝 run_codex_sequence.md
│   ├── 📝 CLOSE_OUT.md
│   ├── 📝 GITHUB_ACTIONS_SETUP.md
│   ├── 📝 NOTIFY_SLACK.md
│   ├── 📝 PROD_PREFLIGHT.md
│   ├── 📝 README_vision_apply.md
│   ├── 📝 SLOs.md
│   └── 📝 WORKFLOW_README.md
├── 📁 pages/
│   └── 📁 api/
│       └── 📁 leo/
│           ├── 📘 gate-scores.ts
│           ├── 📘 metrics.ts
│           └── 📘 sub-agent-reports.ts
├── 📁 policies/
│   └── 📁 kyverno/
│       ├── ⚙️ require-image-digests.yaml
│       ├── ⚙️ require-signed-images.yaml
│       └── ⚙️ require-slsa-provenance.yaml
├── 📁 prds/
│   ├── 📁 .backup/
│   │   ├── 📝 PRD-SD-001.md
│   │   ├── 📝 PRD-SD-002.md
│   │   └── 📝 PRD-SD-003.md
│   └── 📝 PRD-SD-016.md
├── 📁 press-kit/
│   └── 📁 2030/
│       ├── 📜 convert-to-docx.js
│       ├── 🔧 convert.sh
│       ├── 📝 deck.md
│       ├── 📄 EHG_Digital_Press_Kit_2030.pptx
│       ├── 📄 EHG_Press_Kit_2030.docx
│       ├── 📝 EHG_Press_Kit_2030.md
│       ├── 🌐 EHG_Press_Kit_Presentation.html
│       ├── 📜 make_deck.js
│       ├── 📋 package.json
│       ├── 📝 PowerPoint_Content_Structure.md
│       └── 📝 README.md
├── 📁 retrospectives/
│   ├── 📋 SD-008-template-system-2025-09-27.json
│   ├── 📝 SD-LEO-001-retrospective.md
│   ├── 📝 SD-LEO-002-retrospective.md
│   └── 📝 SD-LEO-003-retrospective.md
├── 📁 screenshots/
│   ├── 📄 directive-lab-desktop.png
│   ├── 📄 directive-lab-mobile.png
│   ├── 📄 directive-lab-tablet.png
│   └── 📄 directive-lab-wide.png
├── 📁 scripts/
│   ├── 📁 archive/
│   │   ├── 📁 codex-integration/
│   │   │   ├── 📁 artifacts/
│   │   │   │   ├── 📄 artifact.tar.gz
│   │   │   │   ├── 📄 attestation-1758336123385.intoto
│   │   │   │   ├── 📄 attestation-1758336124412.intoto
│   │   │   │   ├── 📄 attestation-1758336146768.intoto
│   │   │   │   ├── 📄 attestation-1758336147775.intoto
│   │   │   │   ├── 📄 attestation-1758336156689.intoto
│   │   │   │   ├── 📄 attestation-1758336632707.intoto
│   │   │   │   ├── 📄 attestation-1758336633758.intoto
│   │   │   │   ├── 📄 attestation-1758336644804.intoto
│   │   │   │   ├── 📄 attestation-1758336645952.intoto
│   │   │   │   ├── 📄 attestation-1758336647077.intoto
│   │   │   │   ├── 📄 attestation-1758336648188.intoto
│   │   │   │   ├── 📄 attestation-1758336649219.intoto
│   │   │   │   ├── 📄 attestation-20250920T042658Z.intoto
│   │   │   │   ├── 📄 changes-1758336123385.patch
│   │   │   │   ├── 📄 changes-1758336124412.patch
│   │   │   │   ├── 📄 changes-1758336146768.patch
│   │   │   │   ├── 📄 changes-1758336147775.patch
│   │   │   │   ├── 📄 changes-1758336156689.patch
│   │   │   │   ├── 📄 changes-1758336632707.patch
│   │   │   │   ├── 📄 changes-1758336633758.patch
│   │   │   │   ├── 📄 changes-1758336644804.patch
│   │   │   │   ├── 📄 changes-1758336645952.patch
│   │   │   │   ├── 📄 changes-1758336647077.patch
│   │   │   │   ├── 📄 changes-1758336648188.patch
│   │   │   │   ├── 📄 changes-1758336649219.patch
│   │   │   │   ├── 📄 changes-20250920T042658Z.patch
│   │   │   │   ├── 📄 changes-fixed.patch
│   │   │   │   ├── 📋 manifest-1758336123385.json
│   │   │   │   ├── 📋 manifest-1758336124412.json
│   │   │   │   ├── 📋 manifest-1758336146768.json
│   │   │   │   ├── 📋 manifest-1758336147775.json
│   │   │   │   ├── 📋 manifest-1758336156689.json
│   │   │   │   ├── 📋 manifest-1758336632707.json
│   │   │   │   ├── 📋 manifest-1758336633758.json
│   │   │   │   ├── 📋 manifest-1758336644804.json
│   │   │   │   ├── 📋 manifest-1758336645952.json
│   │   │   │   ├── 📋 manifest-1758336647077.json
│   │   │   │   ├── 📋 manifest-1758336648188.json
│   │   │   │   ├── 📋 manifest-1758336649219.json
│   │   │   │   ├── 📋 manifest-20250920T042658Z.json
│   │   │   │   ├── 📋 sbom-1758336123385.cdx.json
│   │   │   │   ├── 📋 sbom-1758336124412.cdx.json
│   │   │   │   ├── 📋 sbom-1758336146768.cdx.json
│   │   │   │   ├── 📋 sbom-1758336147775.cdx.json
│   │   │   │   ├── 📋 sbom-1758336156689.cdx.json
│   │   │   │   ├── 📋 sbom-1758336632707.cdx.json
│   │   │   │   ├── 📋 sbom-1758336633758.cdx.json
│   │   │   │   ├── 📋 sbom-1758336644804.cdx.json
│   │   │   │   ├── 📋 sbom-1758336645952.cdx.json
│   │   │   │   ├── 📋 sbom-1758336647077.cdx.json
│   │   │   │   ├── 📋 sbom-1758336648188.cdx.json
│   │   │   │   ├── 📋 sbom-1758336649219.cdx.json
│   │   │   │   └── 📋 sbom-20250920T042658Z.cdx.json
│   │   │   ├── 📁 database-migrations/
│   │   │   │   └── 🗄️ 014_codex_handoffs.sql
│   │   │   ├── 📁 documentation/
│   │   │   │   ├── 📝 CODEX_ACTIVE_VERIFICATION_REPORT.md
│   │   │   │   ├── 📝 CODEX_ANALYSIS_REPORT.md
│   │   │   │   ├── 📝 CODEX_API_IMPLEMENTATION_REPORT.md
│   │   │   │   ├── 📝 CODEX_REAL_EXECUTION_REPORT.md
│   │   │   │   └── 📝 DEEP_RESEARCH_PROMPT_DUAL_LANE_CODEX.md
│   │   │   ├── 📁 dual-lane-documentation/
│   │   │   │   ├── 📁 retrospective/
│   │   │   │   │   ├── 📝 dual-lane-R1-retro.md
│   │   │   │   │   └── 📝 plan-supervisor-ws4-verification.md
│   │   │   │   ├── 📁 retrospectives/
│   │   │   │   │   ├── 📝 2025-09-01-session-retrospective.md
│   │   │   │   │   ├── 📝 agentic-review-integration-retrospective.md
│   │   │   │   │   ├── 📝 dual-lane-week1-summary.md
│   │   │   │   │   ├── 📝 end-to-end-verification.md
│   │   │   │   │   ├── 📝 WS2-policy-supply-chain-retro.md
│   │   │   │   │   ├── 📝 WS3-gitops-enforcement-retro.md
│   │   │   │   │   ├── 📝 WS5-drift-alignment-retro.md
│   │   │   │   │   └── 📝 WS6-observability-retro.md
│   │   │   │   ├── 📁 verifications/
│   │   │   │   │   ├── 📝 plan-final-system-verification.md
│   │   │   │   │   └── 📝 plan-supervisor-week1-verdict.md
│   │   │   │   ├── 📁 workstreams/
│   │   │   │   │   ├── 📝 WS3-gitops-enforcement-plan.md
│   │   │   │   │   ├── 📝 WS5-drift-alignment-plan.md
│   │   │   │   │   └── 📝 WS6-observability-labels-plan.md
│   │   │   │   ├── 📝 dual-lane-alignment.md
│   │   │   │   ├── 📝 dual-lane-audit-pack.md
│   │   │   │   ├── 📝 dual-lane-branch-protection.md
│   │   │   │   ├── 📝 dual-lane-SOP.md
│   │   │   │   ├── 📝 IMPLEMENTATION_COMPLETE.md
│   │   │   │   └── 📝 ws4-credential-verification.md
│   │   │   ├── 📁 dual-lane-system/
│   │   │   │   ├── 📁 drift-detection/
│   │   │   │   │   ├── 📁 analytics/
│   │   │   │   │   │   └── ⚙️ drift-analytics.yaml
│   │   │   │   │   ├── 📁 operator/
│   │   │   │   │   │   └── ⚙️ drift-detector.yaml
│   │   │   │   │   └── 📁 policies/
│   │   │   │   │       └── ⚙️ alignment-rules.yaml
│   │   │   │   ├── 📁 observability/
│   │   │   │   │   ├── 📁 grafana/
│   │   │   │   │   │   └── 📁 dashboards/
│   │   │   │   │   │       └── 📋 supply-chain-security.json
│   │   │   │   │   ├── 📁 opentelemetry/
│   │   │   │   │   │   └── ⚙️ collector-config.yaml
│   │   │   │   │   └── 📁 prometheus/
│   │   │   │   │       └── ⚙️ metrics.yaml
│   │   │   │   ├── 📁 slsa/
│   │   │   │   │   ├── 📝 README.md
│   │   │   │   │   ├── 📋 sample-attestation.json
│   │   │   │   │   ├── 📋 sample-cosign-bundle.json
│   │   │   │   │   └── 📋 sample-sbom.cdx.json
│   │   │   │   ├── 📁 test-files/
│   │   │   │   │   ├── 📜 demo-target.js
│   │   │   │   │   └── 📜 sample-code.js
│   │   │   │   ├── 📜 demo-codex-live.js
│   │   │   │   ├── 📜 dual-lane-api-client.js
│   │   │   │   ├── 📜 dual-lane-controller-api.js
│   │   │   │   ├── 📜 dual-lane-controller-real.js
│   │   │   │   ├── 📜 dual-lane-controller.js
│   │   │   │   ├── 📜 dual-lane-orchestrator.js
│   │   │   │   ├── 📜 security-context-manager.js
│   │   │   │   ├── 📜 test-codex-real-execution.js
│   │   │   │   ├── 📜 test-credential-boundaries.js
│   │   │   │   ├── 📜 test-dual-lane-active.js
│   │   │   │   ├── 📜 test-dual-lane-api.js
│   │   │   │   └── 🔧 test-e2e-pipeline.sh
│   │   │   ├── 📝 AGENTS.md
│   │   │   ├── ⚙️ auto-labels-original.yml
│   │   │   ├── 📝 CODEX_WORKFLOW_QUICK_REFERENCE.md
│   │   │   ├── 📜 complete-codex-integration.js
│   │   │   ├── 📜 create-prd-from-test-sd.js
│   │   │   ├── 📜 create-test-sd-for-codex.js
│   │   │   ├── 📜 generate-codex-prompt.js
│   │   │   ├── 📜 get-codex-prompt.js
│   │   │   ├── 📜 monitor-codex-artifacts.js
│   │   │   ├── 📝 OPENAI_CODEX_INTEGRATION.md
│   │   │   ├── 📜 process-codex-artifacts.js
│   │   │   ├── 📝 README.md
│   │   │   ├── 📜 setup-codex-handoffs.js
│   │   │   ├── 📜 test-codex-validation.js
│   │   │   └── 📜 validate-codex-output.js
│   │   └── 📁 timeline-attempts/
│   │       ├── 📜 create-timeline-final.js
│   │       ├── 📜 create-timeline-tables.js
│   │       ├── 📜 create-timeline-via-rpc.js
│   │       ├── 📜 create-timeline-with-pooler.js
│   │       ├── 📜 execute-timeline-sql-properly.js
│   │       └── 📜 execute-timeline-sql.js
│   ├── 📁 archived-sd-scripts/
│   │   ├── 📜 create-lead-plan-handoff-sd028.js
│   │   ├── 📜 create-plan-exec-handoff-sd008.js
│   │   ├── 📜 execute-plan-sd008.js
│   │   ├── 📜 generate-prd-sd008.js
│   │   ├── 📜 generate-prd-sd027.js
│   │   ├── 📜 generate-prd-sd037.js
│   │   ├── 📜 generate-prd-sd039.js
│   │   ├── 📜 generate-prd-sd046.js
│   │   ├── 📝 migration-log.md
│   │   ├── 📜 sd003-lead-plan-handoff.js
│   │   ├── 📜 sd027-completion.js
│   │   ├── 📜 sd027-exec-completion.js
│   │   ├── 📜 sd027-lead-final-approval.js
│   │   ├── 📜 sd027-lead-plan-handoff.js
│   │   ├── 📜 sd027-lead-requirements-analysis.js
│   │   ├── 📜 sd027-plan-exec-handoff.js
│   │   ├── 📜 sd028-phase1-verification.js
│   │   ├── 📜 sd028-phase2-verification.js
│   │   ├── 📜 sd031-lead-plan-handoff.js
│   │   ├── 📜 sd037-lead-plan-handoff.js
│   │   ├── 📜 sd039-exec-plan-verification-handoff.js
│   │   ├── 📜 sd039-lead-final-approval.js
│   │   ├── 📜 sd039-lead-plan-handoff.js
│   │   ├── 📜 sd039-plan-exec-handoff.js
│   │   ├── 📜 sd039-plan-lead-approval-handoff.js
│   │   ├── 📜 sd039-plan-supervisor-verification.js
│   │   ├── 📜 sd046-exec-completion.js
│   │   ├── 📜 sd046-lead-final-approval.js
│   │   ├── 📜 sd046-lead-plan-handoff.js
│   │   ├── 📜 sd046-lead-requirements-analysis.js
│   │   ├── 📜 sd046-plan-exec-handoff.js
│   │   └── 📜 sd046-plan-supervisor-verification.js
│   ├── 📁 migrated/
│   │   ├── 📝 migration-analysis.md
│   │   └── 🔧 migration-commands.sh
│   ├── 📜 activate-invisible-subagent-system.js
│   ├── 📜 activate-leo-protocol-v4.2.0.js
│   ├── 🔧 activate-stories-staging.sh
│   ├── 📜 activate-sub-agents.js
│   ├── 📜 add-backlog-summary-columns.js
│   ├── 📜 add-backstories-to-all-subagents.js
│   ├── 📜 add-custom-sections-to-db.js
│   ├── 📜 add-debugging-subagent-to-leo.js
│   ├── 📜 add-ees-2025-001.js
│   ├── 📜 add-ees-to-database.js
│   ├── 📜 add-emb-backlog-items.js
│   ├── 📜 add-emb-to-existing-backlog.js
│   ├── 📜 add-leo-protocol-v4.1.2.js
│   ├── 📜 add-leo-protocol-v4.2.0-story-gates.js
│   ├── 📜 add-prd-to-database.js
│   ├── 📜 add-sd-2025-001-complete.js
│   ├── 📜 add-sd-2025-001-simple.js
│   ├── 📜 add-sd-2025-09-emb.js
│   ├── 📜 add-sd-to-database.js
│   ├── 📜 add-status-field-safe.js
│   ├── 📜 add-url-validation-rules.js
│   ├── 📜 add-venture-workflow-to-database.js
│   ├── 📜 analyze-and-reorder-high-priority-sds.js
│   ├── 📜 analyze-ehg-application.js
│   ├── 📜 analyze-prompt.js
│   ├── 📜 analyze-sd-tables.js
│   ├── 📜 apply-and-verify-emb-migration.js
│   ├── 📜 apply-ehg-backlog-schema.js
│   ├── 📜 apply-gap-remediation.js
│   ├── 📜 apply-plan-supervisor-migration.js
│   ├── 📜 apply-prd-view.js
│   ├── 📜 apply-remediation-polish.js
│   ├── 📜 apply-sdip-database-improvements.js
│   ├── 📜 apply-sequence-rank-migration.js
│   ├── 📜 apply-status-migration.js
│   ├── 📜 apply-strategic-directive-id-migration.js
│   ├── 📜 apply-subagent-tracking-schema.js
│   ├── 🗄️ apply-supervisor-safe.sql
│   ├── 📜 apply-ui-validation-schema.js
│   ├── 📜 audit-false-completions.js
│   ├── 📜 auto-fix-sd-generator.js
│   ├── 📜 auto-revert.js
│   ├── 📜 auto-supersede-protocols.js
│   ├── 📜 auto-sync-sd-to-database.js
│   ├── 📜 backup-sds-backlog.js
│   ├── 📜 boundary-check.js
│   ├── 📜 check-backlog-gaps.js
│   ├── 📜 check-backlog-structure.js
│   ├── 📜 check-dashboard-prd.js
│   ├── 📜 check-dashboard-sd-page.js
│   ├── 📜 check-database-constraints.js
│   ├── 📜 check-deps.js
│   ├── 📜 check-detailed-sequence.js
│   ├── 📜 check-directive-status.js
│   ├── 📜 check-directives-data.js
│   ├── 📜 check-duplicate-sd-keys.js
│   ├── 📜 check-ehg-backlog.js
│   ├── 📜 check-ehg-tables.js
│   ├── 📜 check-exec-detailed.js
│   ├── 📜 check-exec-status.js
│   ├── 📜 check-real-backlog-gaps.js
│   ├── 📜 check-sd-completion.js
│   ├── 📜 check-sd-sequencing.js
│   ├── 📜 check-sd-status-values.js
│   ├── 📜 check-sd-with-filter.js
│   ├── 📜 check-sdip-details.js
│   ├── 📜 check-sdip-tables.js
│   ├── 📜 check-sequence.js
│   ├── 📜 check-story-gates.js
│   ├── 📜 check-tables.js
│   ├── 📜 check-target-app.js
│   ├── 📜 check-uat-tables.js
│   ├── 📜 check-working-on.js
│   ├── 📜 claude-code-estimation-framework.js
│   ├── 📜 claude-hook.js
│   ├── 📜 claude-middleware-service.js
│   ├── 📜 cleanup-database-duplicates.js
│   ├── 📜 cleanup-duplicate-sds.js
│   ├── 📜 cleanup-duplicate-submissions.js
│   ├── 📜 cleanup-legacy-sd-keys.js
│   ├── 📜 cleanup-sd-tables.js
│   ├── 📜 clear-memory-duplicates.js
│   ├── 📜 close-foundation-sd.js
│   ├── 📜 complete-audit-sd.js
│   ├── 📜 complete-audit-verification.js
│   ├── 📜 complete-exec-checklist.js
│   ├── 📜 complete-exec-phase.js
│   ├── 📜 complete-lead-phase.js
│   ├── 📜 complete-plan-phase.js
│   ├── 📜 complete-plan-verification.js
│   ├── 📜 complete-prd-validation.js
│   ├── 📜 complete-sd-031.js
│   ├── 📜 complete-sd-037.js
│   ├── 📜 complete-sd-2025-001-correct.js
│   ├── 📜 complete-sd-2025-001-final.js
│   ├── 📜 complete-sd-2025-001-simple.js
│   ├── 📜 complete-sd-2025-001.js
│   ├── 📜 complete-sd-template.js
│   ├── 📜 complete-sd-uat-001-exec.js
│   ├── 📜 complete-strategic-directive.js
│   ├── 📜 complete-validation-ees.js
│   ├── 📜 conduct-lead-approval-assessment.js
│   ├── 📜 context-monitor.js
│   ├── 📜 convert-all-to-esm.js
│   ├── 📜 convert-to-esm.js
│   ├── 📜 create-auth-prd-detailed.js
│   ├── 📜 create-auth-setup-sd.js
│   ├── 📜 create-backlog-import-prd.js
│   ├── 📜 create-directive-submissions-table.js
│   ├── 📜 create-exec-to-plan-handoff.js
│   ├── 📜 create-governance-ui-prd.js
│   ├── 📜 create-handoff-tracking-tables.js
│   ├── 📜 create-handoff.js
│   ├── 📄 create-learning-tables-via-api.cjs
│   ├── 📜 create-leo-improvement-sds.js
│   ├── 📜 create-leo-protocol-tables.js
│   ├── 📜 create-leo-tables-via-supabase.js
│   ├── 📜 create-manual-test-cases.js
│   ├── 📜 create-manual-uat-session.js
│   ├── 📜 create-multiple-uat-strategic-directives.js
│   ├── 📜 create-plan-to-exec-handoff.js
│   ├── 📜 create-prd-dashboard-ui.js
│   ├── 🗄️ create-prd-table.sql
│   ├── 📜 create-prd-with-playwright.js
│   ├── 📜 create-progress-table.js
│   ├── 🗄️ create-progress-tracking-schema.sql
│   ├── 📜 create-sample-uat-run.js
│   ├── 📜 create-sd-pipeline-001-prd.js
│   ├── 📜 create-sd-timeline-tracking.js
│   ├── 📜 create-sd-uat-001.js
│   ├── 📜 create-sd006-prd.js
│   ├── 📜 create-sd009-prd.js
│   ├── 📜 create-sd014-prd.js
│   ├── 📜 create-sd015-prd.js
│   ├── 📜 create-sd021-prd.js
│   ├── 📜 create-sd025-prd.js
│   ├── 📜 create-sd029-prd.js
│   ├── 📜 create-sd036-prd.js
│   ├── 📜 create-sd044-prd.js
│   ├── 📜 create-sdip-prd.js
│   ├── 📜 create-sdip-strategic-directive.js
│   ├── 📜 create-sdip-tables.js
│   ├── 📜 create-tables-direct.js
│   ├── 📜 create-tables-via-api.js
│   ├── 📜 create-test-prd-for-stories.js
│   ├── 📜 create-uat-002-prd.js
│   ├── 📜 create-uat-003-prd.js
│   ├── 📜 create-uat-004-prd.js
│   ├── 📜 create-uat-005-prd.js
│   ├── 📜 create-uat-006-prd.js
│   ├── 📜 create-uat-database-schema.js
│   ├── 📜 create-uat-prd.js
│   ├── 📜 create-uat-test-run.js
│   ├── 📜 create-ui-validation-tables.js
│   ├── 📜 create-vision-alignment-sd.js
│   ├── 🔧 db-connect.sh
│   ├── 🔧 db-test.sh
│   ├── 📜 debug-dashboard-progress.js
│   ├── 📜 debug-progress-calculator.js
│   ├── 📜 debug-sd-uat-001-visibility.js
│   ├── 📜 debug-sorting.js
│   ├── 📜 debug-subagent-detection.js
│   ├── 📜 define-small-enhancement.js
│   ├── 📜 delete-manual-uat-tests.js
│   ├── 📜 demo-multi-agent-selection.js
│   ├── 📜 design-playwright-analyzer-improved.js
│   ├── 📜 design-playwright-analyzer.js
│   ├── 📜 devops-platform-architect-enhanced.js
│   ├── 📜 discover-backlog-schema.js
│   ├── 📜 docmon-analysis.js
│   ├── 📜 document-feature.js
│   ├── 📄 document-playwright-integration.cjs
│   ├── 📜 drop-execution-order-column.js
│   ├── 📜 dynamic-checklist-generator.js
│   ├── 📜 enhanced-priority-rubric.js
│   ├── 📜 evaluate-deferred-sds.js
│   ├── 📜 exec-checklist-enforcer.js
│   ├── 📜 exec-coordinate-subagents.js
│   ├── 📜 execute-database-sql.js
│   ├── 📜 execute-leo-protocol-sql.js
│   ├── 📜 execute-migration.js
│   ├── 📜 execute-phase.js
│   ├── 📜 execute-prd-sql.js
│   ├── 📜 execute-sd-leo-001.js
│   ├── 📜 execute-sd-leo-002.js
│   ├── 📜 execute-sd-leo-003.js
│   ├── 📜 execute-sd-uat-001.js
│   ├── 📜 execute-supervisor-migration.js
│   ├── 📜 execute-uat-migration.js
│   ├── 📜 execute-verification-tests.js
│   ├── 📜 final-stage1-audit.js
│   ├── 📜 find-backlog-tables.js
│   ├── 📜 find-pooler-region.js
│   ├── 📜 fix-audit-metadata.js
│   ├── 📜 fix-navigation-issues.js
│   ├── 📜 fix-old-sd-uat-001.js
│   ├── 📜 fix-prd-and-add-ees.js
│   ├── 📜 fix-prd-table-schema.js
│   ├── 📜 fix-sdip-completion.js
│   ├── 📜 fix-uat-sd-sequence-rank.js
│   ├── 📜 fix-version-detection-and-claude-md.js
│   ├── 📜 generate-ai-guide-from-db.js
│   ├── 📜 generate-boundary-examples.js
│   ├── 📜 generate-claude-md-from-db.js
│   ├── 📜 generate-comprehensive-uat-tests.js
│   ├── 📜 generate-file-trees.js
│   ├── 📜 generate-fix-request.js
│   ├── 📜 generate-playwright-tests-for-ehg.js
│   ├── 📜 generate-prd-from-sd.js
│   ├── 📜 generate-prd.js
│   ├── 📜 generate-session-prologue.js
│   ├── 📜 generate-uat-prd.js
│   ├── 📜 generate-workflow-docs.js
│   ├── 📜 get-latest-leo-protocol-from-db.js
│   ├── 📜 get-latest-leo-protocol-version.js
│   ├── 📜 get-sd-037-details.js
│   ├── 📜 get-sd-039-details.js
│   ├── 📜 get-sd-046-details.js
│   ├── 📜 get-working-on-sd.js
│   ├── 📜 github-deployment-subagent.js
│   ├── 📜 handoff-controller.js
│   ├── 📜 handoff-validator.js
│   ├── 📜 hook-subagent-activator.js
│   ├── 📜 import-ehg-backlog-v2.js
│   ├── 📜 import-ehg-backlog.js
│   ├── 📜 initialize-sd-003-dashboard.js
│   ├── 📜 insert-initiative-backlog-items.js
│   ├── 📜 insert-manual-tests-direct.js
│   ├── 📜 insert-stage1-backlog-items.js
│   ├── 📜 insert-uat-strategic-directive.js
│   ├── 📜 intelligent-checklist-system.js
│   ├── 📜 intelligent-reorder-active-high-priority-sds.js
│   ├── 📜 lead-approve-sdip.js
│   ├── 📜 lead-human-approval-system.js
│   ├── 📜 lead-over-engineering-rubric.js
│   ├── 📜 lead-review-submissions.js
│   ├── 🔧 leo_compliance_audit.sh
│   ├── 📜 leo-auto-init.js
│   ├── 📜 leo-bootstrap.js
│   ├── 📜 leo-checklist.js
│   ├── 📜 leo-ci-cd-validator.js
│   ├── 📜 leo-ci-monitor.js
│   ├── 📜 leo-cleanup.js
│   ├── 📜 leo-dashboard.js
│   ├── 📜 leo-evidence-capture.js
│   ├── 📜 leo-hook-feedback.js
│   ├── 📜 leo-maintenance.js
│   ├── 🔧 leo-no-truncate.sh
│   ├── 📜 leo-orchestrator-enforced.js
│   ├── 📜 leo-prd-validator.js
│   ├── 📜 leo-protocol-orchestrator.js
│   ├── 📜 leo-protocol-retrospective.js
│   ├── 📜 leo-protocol-smart-qa.js
│   ├── 📜 leo-protocol-to-existing-db.js
│   ├── 📜 leo-register-from-env.js
│   ├── 📜 leo-registration-wizard.js
│   ├── 📜 leo-sd-validator.js
│   ├── 📜 leo-status-line.js
│   ├── 🔧 leo-status.sh
│   ├── 📜 leo-watcher.js
│   ├── 📜 leo.js
│   ├── 📜 manage-uat-credentials.js
│   ├── 📜 mark-sd-027-complete.js
│   ├── 📜 mark-sd-027-working-on.js
│   ├── 📜 mark-sd-046-completed.js
│   ├── 📜 mark-sd-046-working-on.js
│   ├── 📜 mark-sds-complete-v2.js
│   ├── 📜 mark-sds-complete.js
│   ├── 📜 mark-uat-006-complete.js
│   ├── 📜 migrate-leo-protocols-to-database.js
│   ├── 📜 migrate-sd-scripts.js
│   ├── 📜 migrate-statuses.js
│   ├── 📜 migrate-to-sequence-rank.js
│   ├── 📜 new-strategic-directive.js
│   ├── 📜 pareto-exec-completion.js
│   ├── 📜 performance-benchmark-sd-2025-001.js
│   ├── 📜 plan-supervisor-verification.js
│   ├── 📜 plan-verification-sd-2025-001.js
│   ├── 📜 plan-verify-sdip.js
│   ├── 📜 post-import-checks.js
│   ├── 📜 prd-diagnostic-toolkit.js
│   ├── 📜 prd-format-validator.js
│   ├── 📜 prd-validation-checklist.js
│   ├── 📜 prepare-supervisor-migration.js
│   ├── 📜 push-integrity-metrics.js
│   ├── 📜 query-active-sds.js
│   ├── 📜 query-sdip-status.js
│   ├── 📜 quick-leo-protocol-execution.js
│   ├── 📜 quick-verify-improvements.js
│   ├── 📜 register-app.js
│   ├── 📜 register-uat-subagent.js
│   ├── 📜 restore-automated-test-results.js
│   ├── 📜 retro-comprehensive.js
│   ├── 📜 revert-sd-004-status.js
│   ├── 📜 review-sds.js
│   ├── 📜 run-integrity-metrics-migration.js
│   ├── 📜 run-uat-tests.js
│   ├── 📜 schema-discovery.js
│   ├── 📜 sd-leo-001-retrospective.js
│   ├── 📜 sd-leo-002-retrospective.js
│   ├── 📜 sd-leo-003-retrospective.js
│   ├── 📜 sd-uat-001-final-status.js
│   ├── 📜 sd028-retrospective.js
│   ├── 📜 search-uat-related-sds.js
│   ├── 📜 seed-uat-direct.js
│   ├── 📜 seed-uat-test-cases.js
│   ├── 📜 sequence-high-priority-sds.js
│   ├── 📜 session-manager-subagent.js
│   ├── 📜 setup-database-manager.js
│   ├── 📜 setup-database-supabase.js
│   ├── 📜 setup-database.js
│   ├── 📄 setup-learning-schema.cjs
│   ├── 📜 setup-prd-database.js
│   ├── 📜 simple-uat-test.js
│   ├── 📜 simulate-websocket-client.js
│   ├── 🔧 smoke-test-stories.sh
│   ├── 🔧 start-all-ehg.sh
│   ├── 🔧 start-ehg-engineer.sh
│   ├── 🔧 start-ehg-main.sh
│   ├── 📜 start-invisible-system.js
│   ├── 📜 start-lead-approval.js
│   ├── 📜 start-plan-verification.js
│   ├── 📜 strategic-priority-mapping.js
│   ├── 📜 subagent-enforcement-system.js
│   ├── 🗄️ supervisor-migration-clipboard.sql
│   ├── 📜 switch-context.js
│   ├── 📜 sync-github.js
│   ├── 📜 sync-manager.js
│   ├── 📜 sync-supabase.js
│   ├── 📜 test-all-dynamic-subagents.js
│   ├── 📜 test-all-improvements.js
│   ├── 📜 test-all-subagents.js
│   ├── 📜 test-backlog-tables.js
│   ├── 📜 test-checkbox-persistence.js
│   ├── 📜 test-complete-integrated-system.js
│   ├── 📜 test-connection.js
│   ├── 📜 test-connections.js
│   ├── 📜 test-consolidated-prd.js
│   ├── 📜 test-cost-subagent.js
│   ├── 📜 test-create-table.js
│   ├── 📄 test-dark-mode-toggle.cjs
│   ├── 📜 test-dashboard-ui.js
│   ├── 📜 test-database-subagent.js
│   ├── 📜 test-database.js
│   ├── 📜 test-debugging-subagent.js
│   ├── 📜 test-design-subagent.js
│   ├── 📜 test-direct-analysis.js
│   ├── 📜 test-direct-connection.js
│   ├── 📜 test-documentation-dynamic.js
│   ├── 📜 test-documentation-subagent.js
│   ├── 📜 test-dry-run.js
│   ├── 📜 test-e2e-pr-reviews.js
│   ├── 📜 test-ehg-connection.js
│   ├── 📜 test-ehg-integrated-properly.js
│   ├── 📜 test-ehg-with-all-improvements.js
│   ├── 📜 test-exec-coordination-improved.js
│   ├── 📜 test-exec-debug.js
│   ├── 📜 test-exec-simple.js
│   ├── 📜 test-feedback-loop-integration.js
│   ├── 📜 test-gate-trigger.js
│   ├── 📜 test-github-subagent-enhancements.js
│   ├── 📜 test-improved-subagents-on-ehg.js
│   ├── 📄 test-invisible-subagent-system.cjs
│   ├── 📜 test-invisible-subagent-system.js
│   ├── 📜 test-leo-ci-cd-integration.js
│   ├── 📜 test-multi-agent-selection.js
│   ├── 📜 test-performance-subagent.js
│   ├── 📜 test-plan-supervisor.js
│   ├── 📜 test-pr-review-insertion.js
│   ├── 📜 test-pr-reviews-ui.js
│   ├── 📜 test-progress-calculation.js
│   ├── 📜 test-realtime-refresh.js
│   ├── 📜 test-realtime-sync.js
│   ├── 📜 test-realtime-update.js
│   ├── 📜 test-realtime-updates.js
│   ├── 📜 test-sd-api.js
│   ├── 📜 test-sd-completion-fix.js
│   ├── 📜 test-sd-idempotency.js
│   ├── 📜 test-sd-navigation.js
│   ├── 📜 test-security-subagent.js
│   ├── 📜 test-sequence-sort.js
│   ├── 📜 test-status-validation.js
│   ├── 📜 test-step7-workflow.js
│   ├── 📜 test-supabase-db.js
│   ├── 📜 test-system-simple.js
│   ├── 📜 test-ui-rendering.js
│   ├── 📜 test-vision-qa-setup.js
│   ├── 📜 test-websocket-updates.js
│   ├── 📜 test-ws-sd-data.js
│   ├── 📜 trigger-subagent-with-backstory.js
│   ├── 📜 triple-check-e2e.js
│   ├── 📜 uat-alerting-system.js
│   ├── 📜 uat-comprehensive-analysis.js
│   ├── 📜 uat-continuous-monitoring.js
│   ├── 📜 uat-intelligent-agent.js
│   ├── 📜 uat-lead-simple.js
│   ├── 📘 uat-lead.ts
│   ├── 📝 uat-migration-guide.md
│   ├── 📜 uat-monitor-dashboard.js
│   ├── 📜 uat-quality-gate-checker.js
│   ├── 📜 uat-realtime-tracker.js
│   ├── 📜 uat-report-generator.js
│   ├── 📜 uat-test-executor.js
│   ├── 📜 uat-to-strategic-directive-ai.js
│   ├── 📘 uat-wizard.ts
│   ├── 📜 unified-consolidated-prd.js
│   ├── 📜 unified-handoff-system.js
│   ├── 📜 update-agent-responsibilities-parallel.js
│   ├── 📜 update-audit-prd.js
│   ├── 📜 update-backstories-for-saas.js
│   ├── 📜 update-claude-md-version.js
│   ├── 📜 update-dashboard-ui-sd.js
│   ├── 📜 update-directive-status.js
│   ├── 📜 update-documentation-subagent.js
│   ├── 📜 update-draft-sd-titles.js
│   ├── 📜 update-exec-checklist-proper.js
│   ├── 📜 update-exec-checklist.js
│   ├── 📜 update-exec-complete.js
│   ├── 📜 update-exec-progress.js
│   ├── 📜 update-plan-verification.js
│   ├── 📜 update-prd-checklist.js
│   ├── 📜 update-prd-fields.js
│   ├── 📜 update-prd-sd028.js
│   ├── 📜 update-prd-status.js
│   ├── 📜 update-sd-011-working-on.js
│   ├── 📜 update-sd-completion-metadata.js
│   ├── 📜 update-sd-content.js
│   ├── 📜 update-sd-details.js
│   ├── 📜 update-sd-metadata-only.js
│   ├── 📜 update-sd-priorities.js
│   ├── 📜 update-sds-backlog-stage1.js
│   ├── 📜 update-sds-to-high-priority.js
│   ├── 📜 update-stages-wave1.js
│   ├── 📜 update-test-planning-requirements.js
│   ├── 📜 update-test-sections.js
│   ├── 📜 validate-commit-message.js
│   ├── 📜 validate-fixes.js
│   ├── 📜 validate-implementation-target.js
│   ├── 📜 validate-new-prd.js
│   ├── 📜 validate-performance-sd-2025-001.js
│   ├── 📜 validate-sd-completion-evidence.js
│   ├── 📜 validate-sd-completion.js
│   ├── 📜 validate-stages.js
│   ├── 📜 validate-sub-agent-handoff.js
│   ├── 🗄️ verify_user_stories.sql
│   ├── 📜 verify-auth-linkage.js
│   ├── 📜 verify-backlog-visibility.js
│   ├── 📜 verify-connection.js
│   ├── 📜 verify-database-state.js
│   ├── 📜 verify-dynamic-subagents.js
│   ├── 📜 verify-emb-complete.js
│   ├── 📜 verify-handoff-lead-to-plan.js
│   ├── 📜 verify-handoff-plan-to-exec.js
│   ├── 📜 verify-navigation-fixes.js
│   ├── 📜 verify-sd-2025-09-emb.js
│   ├── 📜 verify-supervisor-setup.js
│   ├── 📜 verify-target-url.js
│   ├── 📜 verify-uat-description-carryover.js
│   ├── 📜 verify-uat-seeding.js
│   ├── 📜 vision-model-selector.js
│   ├── 📜 vision-qa-decision.js
│   └── 📜 wsjf-priority-fetcher.js
├── 📁 src/
│   ├── 📁 agents/
│   │   └── 📜 story-bootstrap.js
│   ├── 📁 api/
│   │   ├── 📁 stories/
│   │   │   └── 📜 index.js
│   │   └── 📜 stories.js
│   ├── 📁 client/
│   │   ├── 📁 src/
│   │   │   ├── 📁 animations/
│   │   │   │   ├── 📁 components/
│   │   │   │   │   ├── ⚛️ AnimatedButton.jsx
│   │   │   │   │   ├── ⚛️ AnimatedCard.jsx
│   │   │   │   │   ├── ⚛️ AnimatedList.jsx
│   │   │   │   │   └── ⚛️ AnimatedModal.jsx
│   │   │   │   ├── 📁 hooks/
│   │   │   │   │   └── 📜 useReducedMotion.js
│   │   │   │   ├── 📁 utils/
│   │   │   │   │   └── 📜 performance.js
│   │   │   │   ├── 📜 constants.js
│   │   │   │   ├── 📜 index.js
│   │   │   │   └── 📝 README.md
│   │   │   ├── 📁 components/
│   │   │   │   ├── 📁 backlog-import/
│   │   │   │   │   ├── ⚛️ BacklogImportManager.jsx
│   │   │   │   │   ├── 📜 index.js
│   │   │   │   │   ├── ⚛️ ReleaseGateCalculator.jsx
│   │   │   │   │   └── ⚛️ StoryGenerationEngine.jsx
│   │   │   │   ├── 📁 governance/
│   │   │   │   │   ├── 📜 index.js
│   │   │   │   │   ├── ⚛️ NotificationPanel.jsx
│   │   │   │   │   ├── ⚛️ ProposalWorkflow.jsx
│   │   │   │   │   └── ⚛️ RBACManager.jsx
│   │   │   │   ├── 📁 leo/
│   │   │   │   │   └── ⚛️ CIPipelineStatus.tsx
│   │   │   │   ├── 📁 pipeline/
│   │   │   │   │   ├── 📜 index.js
│   │   │   │   │   ├── ⚛️ PipelineMonitor.jsx
│   │   │   │   │   ├── ⚛️ QualityGates.jsx
│   │   │   │   │   └── ⚛️ SecurityScanning.jsx
│   │   │   │   ├── 📁 pr-reviews/
│   │   │   │   │   ├── ⚛️ ActiveReviews.jsx
│   │   │   │   │   ├── ⚛️ PRMetrics.jsx
│   │   │   │   │   ├── ⚛️ PRReviewSummary.jsx
│   │   │   │   │   └── ⚛️ ReviewHistory.jsx
│   │   │   │   ├── 📁 uat/
│   │   │   │   │   ├── ⚛️ CreateTestCaseModal.jsx
│   │   │   │   │   ├── ⚛️ EditTestCaseModal.jsx
│   │   │   │   │   ├── ⚛️ SDGenerationModal.jsx
│   │   │   │   │   ├── ⚛️ TestExecutionModal.jsx
│   │   │   │   │   └── ⚛️ UATDashboard.jsx
│   │   │   │   ├── 📁 ui/
│   │   │   │   │   ├── ⚛️ Button.jsx
│   │   │   │   │   ├── 🎨 design-tokens.css
│   │   │   │   │   ├── ⚛️ Input.jsx
│   │   │   │   │   ├── ⚛️ PolicyBadge.jsx
│   │   │   │   │   ├── ⚛️ ProgressBar.jsx
│   │   │   │   │   ├── ⚛️ tabs.jsx
│   │   │   │   │   └── ⚛️ Toast.jsx
│   │   │   │   ├── 📁 voice/
│   │   │   │   │   ├── ⚛️ EVAVoiceAssistant.tsx
│   │   │   │   │   ├── 📘 RealtimeClient.ts
│   │   │   │   │   └── 📘 types.ts
│   │   │   │   ├── ⚛️ ActiveSDProgress.jsx
│   │   │   │   ├── ⚛️ AnimatedAppLayout.jsx
│   │   │   │   ├── ⚛️ AnimatedCard.jsx
│   │   │   │   ├── ⚛️ AnimatedOverview.jsx
│   │   │   │   ├── ⚛️ AppLayout.jsx
│   │   │   │   ├── ⚛️ BacklogManager.jsx
│   │   │   │   ├── ⚛️ Breadcrumbs.jsx
│   │   │   │   ├── ⚛️ CardGrid.jsx
│   │   │   │   ├── ⚛️ ContextMonitor.jsx
│   │   │   │   ├── ⚛️ DarkModeToggle.jsx
│   │   │   │   ├── ⚛️ DirectiveLab.jsx
│   │   │   │   ├── 📄 DirectiveLab.jsx.backup
│   │   │   │   ├── ⚛️ EnhancedOverview.jsx
│   │   │   │   ├── ⚛️ ErrorBoundary.jsx
│   │   │   │   ├── ⚛️ GroupCreationModal.jsx
│   │   │   │   ├── ⚛️ HandoffCenter.jsx
│   │   │   │   ├── ⚛️ ImpactAnalysisPanel.jsx
│   │   │   │   ├── ⚛️ IntegrityMetrics.jsx
│   │   │   │   ├── ⚛️ LEADApprovalDialog.jsx
│   │   │   │   ├── ⚛️ LoadingSkeleton.jsx
│   │   │   │   ├── ⚛️ Overview.jsx
│   │   │   │   ├── ⚛️ PRDManager.jsx
│   │   │   │   ├── ⚛️ ProgressAudit.jsx
│   │   │   │   ├── ⚛️ ProgressIndicator.jsx
│   │   │   │   ├── ⚛️ PRReviews.jsx
│   │   │   │   ├── ⚛️ RecentSubmissions.jsx
│   │   │   │   ├── ⚛️ ReleaseGateWidget.jsx
│   │   │   │   ├── ⚛️ SDManager.jsx
│   │   │   │   ├── ⚛️ SmartRefreshButton.jsx
│   │   │   │   ├── ⚛️ StoryDetail.jsx
│   │   │   │   └── ⚛️ UserStories.jsx
│   │   │   ├── 📁 config/
│   │   │   │   ├── 📜 supabase.js
│   │   │   │   └── 📜 uat-sections.js
│   │   │   ├── 📁 hooks/
│   │   │   │   ├── 📜 useLocalStorage.js
│   │   │   │   └── 📜 useWebSocket.js
│   │   │   ├── 📁 lib/
│   │   │   │   └── 📘 supabase.ts
│   │   │   ├── 📁 pages/
│   │   │   │   ├── 📁 stories/
│   │   │   │   │   └── 📝 README.md
│   │   │   │   └── ⚛️ BacklogImportView.jsx
│   │   │   ├── 📁 styles/
│   │   │   │   ├── 🎨 index.css
│   │   │   │   └── 🎨 mobile-voice.css
│   │   │   ├── 📁 utils/
│   │   │   │   ├── 📜 animations.js
│   │   │   │   └── 📜 logger.js
│   │   │   ├── ⚛️ App.jsx
│   │   │   └── ⚛️ main.jsx
│   │   ├── 📄 .env
│   │   ├── 📄 final-test.png
│   │   ├── 🌐 index.html
│   │   ├── 📋 package.json
│   │   ├── 📜 postcss.config.js
│   │   ├── 📄 success-dark-mode.png
│   │   ├── 📜 tailwind.config.js
│   │   └── 📜 vite.config.js
│   ├── 📁 db/
│   │   └── 📁 loader/
│   │       ├── 📄 config.ts.template
│   │       └── 📝 README.md
│   ├── 📁 services/
│   │   ├── 📁 database-loader/
│   │   │   ├── 📜 connections.js
│   │   │   ├── 📘 connections.ts
│   │   │   ├── 📜 index.js
│   │   │   ├── 📘 index.ts
│   │   │   ├── 📜 migrations.js
│   │   │   ├── 📜 pr-reviews.js
│   │   │   ├── 📜 strategic-loaders.js
│   │   │   ├── 📜 submissions.js
│   │   │   ├── 📜 telemetry.js
│   │   │   └── 📜 utilities.js
│   │   ├── 📜 database-loader.js
│   │   ├── 📄 database-loader.js.backup
│   │   ├── 📜 DatabaseManager.js
│   │   ├── 📜 handoff-validator.js
│   │   ├── 📜 progress-calculator.js
│   │   ├── 📜 realtime-dashboard.js
│   │   ├── 📜 realtime-manager.js
│   │   ├── 📜 refresh-api.js
│   │   ├── 📜 status-validator.js
│   │   └── 📜 version-detector.js
│   └── 📁 utils/
│       └── 📜 timestamp.js
├── 📁 supabase/
│   ├── 📁 .temp/
│   │   ├── 📄 cli-latest
│   │   ├── 📄 gotrue-version
│   │   ├── 📄 pooler-url
│   │   ├── 📄 postgres-version
│   │   ├── 📄 project-ref
│   │   ├── 📄 rest-version
│   │   └── 📄 storage-version
│   ├── 📁 functions/
│   │   ├── 📁 openai-realtime-token/
│   │   │   └── 📘 index.ts
│   │   └── 📁 realtime-relay/
│   │       └── 📘 index.ts
│   ├── 📁 migrations/
│   │   ├── 🗄️ 004_voice_conversations.sql
│   │   └── 🗄️ 008_ui_validation_schema.sql
│   └── 📄 config.toml
├── 📁 templates/
│   ├── 📁 agent-workflows/
│   │   ├── 📝 exec-vision-qa-workflow.md
│   │   ├── 📝 lead-vision-qa-workflow.md
│   │   └── 📝 plan-vision-qa-workflow.md
│   ├── 📁 claude-md/
│   │   ├── 📁 agents/
│   │   │   ├── 📝 CLAUDE-EXEC.md
│   │   │   ├── 📝 CLAUDE-LEAD.md
│   │   │   └── 📝 CLAUDE-PLAN.md
│   │   ├── 📁 sub-agents/
│   │   │   ├── 📝 CLAUDE-DATABASE.md
│   │   │   ├── 📝 CLAUDE-DESIGN.md
│   │   │   ├── 📝 CLAUDE-PERFORMANCE.md
│   │   │   ├── 📝 CLAUDE-SECURITY.md
│   │   │   └── 📝 CLAUDE-TESTING.md
│   │   └── 📝 CLAUDE.md
│   ├── 📁 config/
│   │   ├── 📋 handoff-templates.json
│   │   └── 📋 phase-requirements.json
│   ├── 📁 utils/
│   ├── 📜 add-backlog-item.js
│   ├── 📜 create-handoff.js
│   ├── 📜 execute-phase.js
│   ├── 📜 generate-prd.js
│   ├── 📝 README.md
│   └── 📝 session-prologue.md
├── 📁 tests/
│   ├── 📁 e2e/
│   │   ├── 📜 directive-lab-debug.test.js
│   │   ├── 📜 directive-lab-e2e.test.js
│   │   ├── 📜 directive-lab-enhanced-features.test.js
│   │   ├── 📜 enhanced-directive-lab.test.js
│   │   ├── 📜 leo-protocol-journey.test.js
│   │   ├── 📜 step4-layout-fix-verification.test.js
│   │   ├── 📜 story-example.spec.js
│   │   ├── 📝 user-story-directive-lab.md
│   │   └── 📜 visual-inspection.spec.js
│   ├── 📁 integration/
│   │   └── 📜 database-operations.test.js
│   ├── 📁 negative/
│   │   ├── 🔧 provenance-replay.sh
│   │   ├── 🔧 run-all-negative-tests.sh
│   │   ├── 🔧 simulate-negative-tests.sh
│   │   ├── ⚙️ test-no-digest.yaml
│   │   ├── ⚙️ test-provenance-replay.yaml
│   │   └── ⚙️ test-unsigned-image.yaml
│   ├── 📁 sdip/
│   │   └── 📜 gate-validator.test.js
│   ├── 📁 setup/
│   │   ├── 📜 global-setup.js
│   │   └── 📜 global-teardown.js
│   ├── 📁 uat/
│   │   ├── 📁 .auth/
│   │   │   ├── 📄 .gitignore
│   │   │   ├── 📄 after-signin.png
│   │   │   ├── 📄 before-signin.png
│   │   │   ├── 📄 manual-after.png
│   │   │   ├── 📄 manual-before.png
│   │   │   └── 📋 user.json
│   │   ├── 📁 setup/
│   │   │   └── 📜 global-auth.js
│   │   ├── 📜 accessibility.spec.js
│   │   ├── 📜 aiAgents.spec.js
│   │   ├── 📜 analytics.spec.js
│   │   ├── 📜 auth-flow.spec.js
│   │   ├── 📜 auth.spec.js
│   │   ├── 📜 config.js
│   │   ├── 📜 dashboard.spec.js
│   │   ├── 📜 e2e-executiveReporting.spec.js
│   │   ├── 📜 e2e-ventureLifecycle.spec.js
│   │   ├── 📜 eva.spec.js
│   │   ├── 📜 governance.spec.js
│   │   ├── 📜 helpers.js
│   │   ├── 📜 integrations.spec.js
│   │   ├── 📜 landing.spec.js
│   │   ├── 📜 mobile.spec.js
│   │   ├── 📜 performance.spec.js
│   │   ├── 📜 poc-authenticated.spec.js
│   │   ├── 📜 portfolios.spec.js
│   │   ├── 📜 security.spec.js
│   │   ├── 📜 settings.spec.js
│   │   ├── 📜 team.spec.js
│   │   ├── 📜 test-auth-manual.js
│   │   ├── 📜 ventures.spec.js
│   │   └── 📜 workflows.spec.js
│   ├── 📁 unit/
│   │   └── 📜 progress-calculation.test.js
│   ├── 📁 visual/
│   │   └── 📜 visual.spec.js
│   ├── 📜 a11y.spec.js
│   ├── 📜 comprehensive-app-review.js
│   ├── 📜 integration.test.js
│   ├── 📜 setup.js
│   ├── 📜 subagent-workflow.test.js
│   ├── 📜 test-directive-lab-card.js
│   ├── 📜 test-directive-lab-compact-responsive.js
│   ├── 📜 test-directive-lab-responsive-final.js
│   ├── 📜 test-directive-lab-responsive.js
│   ├── 📜 test-directive-lab-route.js
│   ├── 📜 theme-performance.test.js
│   ├── 📜 validate-directive-lab-final.js
│   ├── 📜 verify-toggle-placement.js
│   ├── 📜 voice-components.test.js
│   └── 📜 wsjf-priority-fetcher.test.js
├── 📁 tools/
│   ├── 📁 dbexec/
│   │   ├── 📜 dbexec-simple.js
│   │   ├── 📄 dbexec.bundle.cjs
│   │   ├── 📄 dbexec.bundle.mjs
│   │   ├── 📘 dbexec.ts
│   │   ├── 📝 LICENSE.md
│   │   └── 📄 run-dbexec.mjs
│   ├── 📁 gates/
│   │   ├── 📁 lib/
│   │   │   ├── 📘 db.ts
│   │   │   ├── 📘 evidence.ts
│   │   │   ├── 📘 rules.ts
│   │   │   └── 📘 score.ts
│   │   ├── 📘 drift-check.ts
│   │   ├── 📘 gate2a.ts
│   │   ├── 📘 gate2b.ts
│   │   ├── 📘 gate2c.ts
│   │   ├── 📘 gate2d.ts
│   │   └── 📘 gate3.ts
│   ├── 📁 migrations/
│   │   └── 📘 prd-filesystem-to-database.ts
│   ├── 📁 subagents/
│   │   └── 📘 scan.ts
│   ├── 📁 supervisors/
│   │   └── 📘 plan-supervisor.ts
│   ├── 📁 validators/
│   │   └── 📘 exec-checklist.ts
│   └── 📄 post-playwright-results.mjs
├── 📁 verification-packages/
├── 📋 .claude-code-config.json
├── 📄 .claude-status-line
├── 📄 .current-uat-run
├── 📄 .env
├── 📋 .eslintrc.json
├── 📄 .gitignore
├── 📄 .gitmessage
├── 📋 .last-analysis.json
├── 📋 .leo-analysis-cache.json
├── 📋 .leo-cache.json
├── 📄 .leo-context
├── 📋 .leo-context-state.json
├── 📄 .leo-dashboard.pid
├── 📋 .leo-hook-failures.json
├── 🔧 .leo-init.sh
├── 📄 .leo-keys
├── 📋 .leo-learning-db.json
├── 📄 .leo-session-active
├── 📄 .leo-session-id
├── 📋 .leo-status.json
├── 📋 .leo-watcher.json
├── 📄 .session-prologue-completed
├── 📄 after-manual-toggle.png
├── 📄 after-toggle-click.png
├── 📝 AI_GUIDE.md
├── 📋 all-subagents-dynamic-report.json
├── 📜 analyze_excel.js
├── 📄 analyze_excel.mjs
├── 📄 analyze-priorities-temp.cjs
├── 📋 branch-protection-visual.json
├── 📋 branch-protection.json
├── 📄 button-collapsed-hover.png
├── 📄 button-collapsed.png
├── 📄 button-expanded.png
├── 📜 capture-current-layout.js
├── 📜 capture-dashboard.js
├── 📜 capture-padding-issue.js
├── 📝 CHANGELOG.md
├── 📝 CLAUDE-LEO.md
├── 📝 CLAUDE.md
├── 📝 CODEX_REMOVAL_SUMMARY.md
├── 📄 compact-layout-final.png
├── 📄 comprehensive_evidence_report.mjs
├── 📝 CONTRIBUTING.md
├── 📜 convert-to-esm.js
├── 📋 cost-analysis.json
├── 📋 cost-report-ehg.json
├── 📄 current-layout-issue.png
├── 📄 current-state-verification.png
├── 📄 dark-mode-final.png
├── 📄 dark-mode-initial.png
├── 📄 dark-mode-toggled.png
├── 📋 dashboard-config.json
├── 📄 dashboard-current-state.png
├── 📄 dashboard-main.png
├── 🗄️ database-optimization.sql
├── 📋 database-report-ehg.json
├── 📝 DAY_IN_THE_LIFE_EHG_1.5_YEAR.md
├── 📜 debug-dark-mode-deep.js
├── 📄 debug-deep-dive.png
├── 📜 debug-submissions.js
├── 📄 default-theme-test.png
├── 📜 demo-documentation-agent.js
├── 📜 demo-enhanced-subagents.js
├── 📋 design-report-ehg.json
├── 📄 detailed_evidence_part2.mjs
├── 📄 detailed_evidence_report.mjs
├── 📝 directive-lab-analysis-improved-report.md
├── 📋 directive-lab-analysis-improved.json
├── 📄 directive-lab-compact.png
├── 📄 directive-lab-full.png
├── 🌐 directive-lab-ui-analysis.html
├── 📋 directive-lab-ui-analysis.json
├── 📋 documentation-analysis.json
├── 📋 documentation-report-dynamic.json
├── 📋 documentation-report-ehg.json
├── 📝 EHG_ENGINEER_README.md
├── 📄 final_evidence_sections.mjs
├── 📝 FIX_HOOK_ERRORS.md
├── 📝 FIX_TRUNCATION.md
├── 📜 fix-all-modules.js
├── 📜 fix-module-system.js
├── 📜 fix-shebangs.js
├── 📄 fresh-browser-dark-mode.png
├── 📄 full-width-layout.png
├── 📄 generate_csv_tables.mjs
├── 📄 git-leo-commit
├── 📋 handoff-EXEC-PLAN-auto-prologue.json
├── 📋 handoff-EXEC-PLAN-axios-security-fix.json
├── 📋 handoff-EXEC-PLAN-boundary-examples.json
├── 📋 handoff-EXEC-PLAN-context-economy.json
├── 📋 handoff-EXEC-PLAN-dep-policy.json
├── 📋 handoff-EXEC-PLAN-error-recovery.json
├── 📋 handoff-EXEC-PLAN-hardening-ratchets.json
├── 📋 handoff-EXEC-PLAN-priority-fetcher.json
├── 📋 handoff-EXEC-PLAN-session-prologue.json
├── 📋 handoff-EXEC-PLAN-visual-regression.json
├── 📝 IMPORTANT_DATABASE_DISTINCTION.md
├── 📋 improved-subagents-test-results.json
├── 📝 INVISIBLE_SUBAGENT_SYSTEM_GUIDE.md
├── 📜 jest.config.js
├── 📄 leo
├── 📝 LEO_CLI_ENHANCEMENT_SUMMARY.md
├── 📝 LEO_COMMANDS.md
├── 📋 leo-protocol-config.json
├── 📄 LICENSE
├── 📋 lighthouserc.json
├── 📄 Makefile
├── 📄 map_bundles_to_code.mjs
├── 📄 navigation-repositioned.png
├── 📋 package.json
├── 📄 package.json.bak
├── 📄 padding-fixed-desktop.png
├── 📄 padding-fixed-mobile.png
├── 📄 padding-issue-full.png
├── 📄 padding-issue-top.png
├── 📋 performance-metrics.json
├── 📋 performance-report-ehg.json
├── 📜 playwright-uat-nosetup.config.js
├── 📜 playwright-uat.config.js
├── 📜 playwright.config.js
├── 📝 PRODUCTION_GO_LIVE.md
├── 📄 progress-desktop-1920.png
├── 📄 progress-desktop-small-1024.png
├── 📄 progress-mobile-375.png
├── 📄 progress-tablet-768.png
├── 📄 progress-tablet-small-640.png
├── 📝 PROJECT_REGISTRATION_GUIDE.md
├── 📝 README.md
├── 📄 sd-page-with-all-filter.png
├── 📋 security-report-dynamic.json
├── 📋 security-report-ehg.json
├── 📜 server.js
├── 📝 SIMPLE_PROJECT_SETUP.md
├── 📝 STORY_AGENT_STAGING_COMPLETE.md
├── 📄 strategic-directives-page.png
├── 📋 subagent-test-report.json
├── 📋 subagent-verification-report.json
├── 📝 SYSTEM_VERIFICATION_REPORT.md
├── 📝 temp-implementation-roadmap.md
├── 📜 test-clean-dark.js
├── 📜 test-compact-layout.js
├── 📜 test-dark-default.js
├── 🌐 test-dark-mode.html
├── 📜 test-dbloader-direct.js
├── 📜 test-directive-lab-integration.js
├── 📜 test-fresh-dark-mode.js
├── 📜 test-playwright-mapper.js
├── 🔧 test-pr4-complete.sh
├── 📄 test-responsive-button.cjs
├── 📜 test-responsive-progress.js
├── 📜 test-story-agent-e2e.js
├── 📜 test-subagents-demo.js
├── 📜 test-subagents-on-ehg.js
├── 📜 toggle-dark-mode.js
├── 📋 tsconfig.json
├── 📝 UAT_IMPLEMENTATION_SUMMARY.md
├── 📝 UI_VALIDATION_SETUP_INSTRUCTIONS.md
├── 📝 USER_STORIES_IMPLEMENTATION_SUMMARY.md
├── 📄 venture-test-results.txt
├── 📜 verify-compact-layout.js
├── 🌐 verify-dark-mode.html
├── 📜 verify-full-width.js
├── 📜 verify-navigation-position.js
└── 📜 verify-padding-fixed.js
```

---

## EHG (Unified Frontend - SD-ARCH-EHG-007)

**Path**: `/mnt/c/_EHG/EHG`
**Purpose**: Unified frontend (user + admin features at /admin/*)
**Database**: dedlbzhpgkmetvhbkyzq (CONSOLIDATED)
**Files**: 1339

```
├── 📁 .auth/
│   └── 📋 user.json
├── 📁 .github/
│   └── 📁 workflows/
│       ├── ⚙️ ci.yml
│       └── ⚙️ docker-build.yml
├── 📁 app/
│   ├── 📁 (onboarding)/
│   │   ├── 📁 getting-started/
│   │   │   └── ⚛️ page.tsx
│   │   ├── 📁 quickstart/
│   │   │   ├── ⚛️ page.tsx
│   │   │   └── ⚛️ QuickstartChecklist.tsx
│   │   ├── 📁 tour/
│   │   │   ├── ⚛️ OnboardingTour.tsx
│   │   │   └── ⚛️ page.tsx
│   │   └── ⚛️ layout.tsx
│   ├── 📁 api/
│   │   ├── 📁 ai-agents/
│   │   │   ├── 📁 start/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 status/
│   │   │   │   └── 📘 route.ts
│   │   │   └── 📁 stop/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 analytics/
│   │   │   └── 📁 events/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 companies/
│   │   │   └── 📘 route.ts
│   │   ├── 📁 data-management/
│   │   │   ├── 📁 quality/
│   │   │   │   └── 📘 route.ts
│   │   │   └── 📁 storage/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 eva-nlp/
│   │   │   └── 📘 route.ts
│   │   ├── 📁 eva-orchestration/
│   │   │   └── 📘 route.ts
│   │   ├── 📁 governance/
│   │   │   ├── 📁 compliance/
│   │   │   │   └── 📁 status/
│   │   │   │       └── 📘 route.ts
│   │   │   ├── 📁 metrics/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 reviews/
│   │   │   │   └── 📁 upcoming/
│   │   │   │       └── 📘 route.ts
│   │   │   └── 📁 violations/
│   │   │       └── 📁 recent/
│   │   │           └── 📘 route.ts
│   │   ├── 📁 integration/
│   │   │   ├── 📁 health-alerts/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 health-check/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 health-metrics/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 services/
│   │   │   │   └── 📘 route.ts
│   │   │   ├── 📁 status/
│   │   │   │   └── 📘 route.ts
│   │   │   └── 📁 webhooks/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 monitoring/
│   │   │   └── 📁 overview/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 onboarding/
│   │   │   └── 📁 complete/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 performance/
│   │   │   └── 📁 overview/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 security/
│   │   │   └── 📁 overview/
│   │   │       └── 📘 route.ts
│   │   ├── 📁 settings/
│   │   │   └── 📘 route.ts
│   │   └── 📁 ventures/
│   │       ├── 📁 create/
│   │       │   └── 📘 route.ts
│   │       └── 📁 list/
│   │           └── 📘 route.ts
│   ├── 📁 data-management/
│   │   └── ⚛️ page.tsx
│   ├── 📁 governance/
│   │   └── ⚛️ page.tsx
│   ├── 📁 integration/
│   │   └── ⚛️ page.tsx
│   ├── 📁 monitoring/
│   │   └── ⚛️ page.tsx
│   ├── 📁 performance/
│   │   └── ⚛️ page.tsx
│   ├── 📁 security/
│   │   └── ⚛️ page.tsx
│   └── 📁 settings/
│       ├── ⚛️ EVASettingsCard.tsx
│       ├── ⚛️ page.tsx
│       └── ⚛️ PreferencesForm.tsx
├── 📁 data/
│   └── 📁 decision_logs/
│       ├── 📁 archive/
│       │   └── 📁 2025-08/
│       └── 📄 venture_demo_decisions.jsonl
├── 📁 database/
│   ├── 📁 migrations/
│   │   ├── 🗄️ 011_decision_log_schema.sql
│   │   ├── 🗄️ add-demo-markers.sql
│   │   ├── 🗄️ apply-demo-markers-manual.sql
│   │   └── 🗄️ exit-workflow-schema.sql
│   ├── 📁 schema/
│   │   ├── 🗄️ automation_learning_schema.sql
│   │   ├── 🗄️ chairman_dashboard_tables.sql
│   │   └── 🗄️ validation_reports.sql
│   └── 📝 SCHEMA_SETUP_INSTRUCTIONS.md
├── 📁 db/
│   ├── 📁 migrations/
│   │   ├── 🗄️ 001_initial_schema.sql
│   │   ├── 🗄️ 002_onboarding_progress.sql
│   │   ├── 🗄️ 003_analytics_events.sql
│   │   └── 🗄️ rollback.sql
│   └── 📝 schema-erd.md
├── 📁 docs/
│   ├── 📁 app/
│   │   └── 📁 ventures/
│   │       ├── 📁 design/
│   │       │   ├── 📝 A11Y_AUDIT.md
│   │       │   ├── 📝 COMPONENT_GAPS.md
│   │       │   ├── 📝 COPY_DECK.md
│   │       │   ├── 📄 FINDINGS.csv
│   │       │   ├── 📝 SPEC_WIREFRAMES.md
│   │       │   ├── 📝 TESTABLE_CRITERIA.md
│   │       │   ├── 📝 THEME_QA_REPORT.md
│   │       │   ├── 📝 UI_AUDIT_SUMMARY.md
│   │       │   └── 📝 VISUAL_TOKENS.md
│   │       ├── 📁 prd/
│   │       │   ├── 📝 00-VENTURES-SPEC.md
│   │       │   ├── 📝 01-Stage-Distribution-PRD.md
│   │       │   ├── 📝 02-Advanced-Filters-PRD.md
│   │       │   ├── 📝 03-New-Venture-PRD.md
│   │       │   ├── 📝 04-Triage-and-Attention-PRD.md
│   │       │   ├── 📝 05-Data-Sources-Map.md
│   │       │   ├── 📝 06-Progression-Policy.md
│   │       │   ├── 📝 07-Instrumentation-and-Telemetry.md
│   │       │   ├── 📝 08-DoR-DoD.md
│   │       │   ├── 📝 09-Open-Questions.md
│   │       │   └── 📝 10-Decision-Log-and-Calibration.md
│   │       ├── 📝 DECISIONS.md
│   │       └── 📝 README.md
│   ├── 📁 prds/
│   │   ├── 📝 EES-2025-001-execution-sequences.md
│   │   ├── 📝 PRD-2025-001-openai-realtime-voice.md
│   │   └── 📝 PRD-SD-002-shimmer-ai-avatar.md
│   ├── 📁 research/
│   │   ├── 📁 outputs/
│   │   ├── 📁 stages/
│   │   │   ├── 📝 01_brief.md
│   │   │   ├── 📋 01_prompt_gemini.json
│   │   │   ├── 📋 01_prompt_gpt5.json
│   │   │   ├── 📝 02_brief.md
│   │   │   ├── 📋 02_prompt_gemini.json
│   │   │   ├── 📋 02_prompt_gpt5.json
│   │   │   ├── 📝 03_brief.md
│   │   │   ├── 📋 03_prompt_gemini.json
│   │   │   ├── 📋 03_prompt_gpt5.json
│   │   │   ├── 📝 04_brief.md
│   │   │   ├── 📋 04_prompt_gemini.json
│   │   │   ├── 📋 04_prompt_gpt5.json
│   │   │   ├── 📝 05_brief.md
│   │   │   ├── 📋 05_prompt_gemini.json
│   │   │   ├── 📋 05_prompt_gpt5.json
│   │   │   ├── 📝 06_brief.md
│   │   │   ├── 📋 06_prompt_gemini.json
│   │   │   ├── 📋 06_prompt_gpt5.json
│   │   │   ├── 📝 07_brief.md
│   │   │   ├── 📋 07_prompt_gemini.json
│   │   │   ├── 📋 07_prompt_gpt5.json
│   │   │   ├── 📝 08_brief.md
│   │   │   ├── 📋 08_prompt_gemini.json
│   │   │   ├── 📋 08_prompt_gpt5.json
│   │   │   ├── 📝 09_brief.md
│   │   │   ├── 📋 09_prompt_gemini.json
│   │   │   ├── 📋 09_prompt_gpt5.json
│   │   │   ├── 📝 10_brief.md
│   │   │   ├── 📋 10_prompt_gemini.json
│   │   │   ├── 📋 10_prompt_gpt5.json
│   │   │   ├── 📝 11_brief.md
│   │   │   ├── 📋 11_prompt_gemini.json
│   │   │   ├── 📋 11_prompt_gpt5.json
│   │   │   ├── 📝 12_brief.md
│   │   │   ├── 📋 12_prompt_gemini.json
│   │   │   ├── 📋 12_prompt_gpt5.json
│   │   │   ├── 📝 13_brief.md
│   │   │   ├── 📋 13_prompt_gemini.json
│   │   │   ├── 📋 13_prompt_gpt5.json
│   │   │   ├── 📝 14_brief.md
│   │   │   ├── 📋 14_prompt_gemini.json
│   │   │   ├── 📋 14_prompt_gpt5.json
│   │   │   ├── 📝 15_brief.md
│   │   │   ├── 📋 15_prompt_gemini.json
│   │   │   ├── 📋 15_prompt_gpt5.json
│   │   │   ├── 📝 16_brief.md
│   │   │   ├── 📋 16_prompt_gemini.json
│   │   │   ├── 📋 16_prompt_gpt5.json
│   │   │   ├── 📝 17_brief.md
│   │   │   ├── 📋 17_prompt_gemini.json
│   │   │   ├── 📋 17_prompt_gpt5.json
│   │   │   ├── 📝 18_brief.md
│   │   │   ├── 📋 18_prompt_gemini.json
│   │   │   ├── 📋 18_prompt_gpt5.json
│   │   │   ├── 📝 19_brief.md
│   │   │   ├── 📋 19_prompt_gemini.json
│   │   │   ├── 📋 19_prompt_gpt5.json
│   │   │   ├── 📝 20_brief.md
│   │   │   ├── 📋 20_prompt_gemini.json
│   │   │   ├── 📋 20_prompt_gpt5.json
│   │   │   ├── 📝 21_brief.md
│   │   │   ├── 📋 21_prompt_gemini.json
│   │   │   ├── 📋 21_prompt_gpt5.json
│   │   │   ├── 📝 22_brief.md
│   │   │   ├── 📋 22_prompt_gemini.json
│   │   │   ├── 📋 22_prompt_gpt5.json
│   │   │   ├── 📝 23_brief.md
│   │   │   ├── 📋 23_prompt_gemini.json
│   │   │   ├── 📋 23_prompt_gpt5.json
│   │   │   ├── 📝 24_brief.md
│   │   │   ├── 📋 24_prompt_gemini.json
│   │   │   ├── 📋 24_prompt_gpt5.json
│   │   │   ├── 📝 25_brief.md
│   │   │   ├── 📋 25_prompt_gemini.json
│   │   │   ├── 📋 25_prompt_gpt5.json
│   │   │   ├── 📝 26_brief.md
│   │   │   ├── 📋 26_prompt_gemini.json
│   │   │   ├── 📋 26_prompt_gpt5.json
│   │   │   ├── 📝 27_brief.md
│   │   │   ├── 📋 27_prompt_gemini.json
│   │   │   ├── 📋 27_prompt_gpt5.json
│   │   │   ├── 📝 28_brief.md
│   │   │   ├── 📋 28_prompt_gemini.json
│   │   │   ├── 📋 28_prompt_gpt5.json
│   │   │   ├── 📝 29_brief.md
│   │   │   ├── 📋 29_prompt_gemini.json
│   │   │   ├── 📋 29_prompt_gpt5.json
│   │   │   ├── 📝 30_brief.md
│   │   │   ├── 📋 30_prompt_gemini.json
│   │   │   ├── 📋 30_prompt_gpt5.json
│   │   │   ├── 📝 31_brief.md
│   │   │   ├── 📋 31_prompt_gemini.json
│   │   │   ├── 📋 31_prompt_gpt5.json
│   │   │   ├── 📝 32_brief.md
│   │   │   ├── 📋 32_prompt_gemini.json
│   │   │   ├── 📋 32_prompt_gpt5.json
│   │   │   ├── 📝 33_brief.md
│   │   │   ├── 📋 33_prompt_gemini.json
│   │   │   ├── 📋 33_prompt_gpt5.json
│   │   │   ├── 📝 34_brief.md
│   │   │   ├── 📋 34_prompt_gemini.json
│   │   │   ├── 📋 34_prompt_gpt5.json
│   │   │   ├── 📝 35_brief.md
│   │   │   ├── 📋 35_prompt_gemini.json
│   │   │   ├── 📋 35_prompt_gpt5.json
│   │   │   ├── 📝 36_brief.md
│   │   │   ├── 📋 36_prompt_gemini.json
│   │   │   ├── 📋 36_prompt_gpt5.json
│   │   │   ├── 📝 37_brief.md
│   │   │   ├── 📋 37_prompt_gemini.json
│   │   │   ├── 📋 37_prompt_gpt5.json
│   │   │   ├── 📝 38_brief.md
│   │   │   ├── 📋 38_prompt_gemini.json
│   │   │   ├── 📋 38_prompt_gpt5.json
│   │   │   ├── 📝 39_brief.md
│   │   │   ├── 📋 39_prompt_gemini.json
│   │   │   ├── 📋 39_prompt_gpt5.json
│   │   │   ├── 📝 40_brief.md
│   │   │   ├── 📋 40_prompt_gemini.json
│   │   │   └── 📋 40_prompt_gpt5.json
│   │   ├── 📝 claude_code_context_research_findings.md
│   │   ├── 📝 claude_code_leo_integration_research_plan.md
│   │   ├── 📋 overall_prompt_gemini.json
│   │   ├── 📋 overall_prompt_gpt5.json
│   │   ├── 📝 overall_research_brief.md
│   │   └── 📝 README.md
│   ├── 📁 retrospectives/
│   │   ├── 📝 LEO-Protocol-SD-002-Retrospective.md
│   │   └── 📝 SD-002-With-Control-Points.md
│   ├── 📁 stage1-framework/
│   │   ├── 📁 examples/
│   │   │   └── 📋 recombination-map-example.json
│   │   ├── 📁 guides/
│   │   ├── 📁 integration/
│   │   │   └── 📝 sd1a-handoff.md
│   │   ├── 📁 reference/
│   │   ├── 📁 schemas/
│   │   │   ├── 📋 component-scan-schema.json
│   │   │   └── 📋 dependency-dag-schema.json
│   │   ├── 📁 templates/
│   │   │   ├── 📝 anti-scenario-template.md
│   │   │   └── ⚙️ first-principles-canvas.yaml
│   │   └── 📝 README.md
│   ├── 📁 stages/
│   │   ├── 📁 individual/
│   │   │   ├── 📄 01.mmd
│   │   │   ├── 📄 02.mmd
│   │   │   ├── 📄 03.mmd
│   │   │   ├── 📄 04.mmd
│   │   │   ├── 📄 05.mmd
│   │   │   ├── 📄 06.mmd
│   │   │   ├── 📄 07.mmd
│   │   │   ├── 📄 08.mmd
│   │   │   ├── 📄 09.mmd
│   │   │   ├── 📄 10.mmd
│   │   │   ├── 📄 11.mmd
│   │   │   ├── 📄 12.mmd
│   │   │   ├── 📄 13.mmd
│   │   │   ├── 📄 14.mmd
│   │   │   ├── 📄 15.mmd
│   │   │   ├── 📄 16.mmd
│   │   │   ├── 📄 17.mmd
│   │   │   ├── 📄 18.mmd
│   │   │   ├── 📄 19.mmd
│   │   │   ├── 📄 20.mmd
│   │   │   ├── 📄 21.mmd
│   │   │   ├── 📄 22.mmd
│   │   │   ├── 📄 23.mmd
│   │   │   ├── 📄 24.mmd
│   │   │   ├── 📄 25.mmd
│   │   │   ├── 📄 26.mmd
│   │   │   ├── 📄 27.mmd
│   │   │   ├── 📄 28.mmd
│   │   │   ├── 📄 29.mmd
│   │   │   ├── 📄 30.mmd
│   │   │   ├── 📄 31.mmd
│   │   │   ├── 📄 32.mmd
│   │   │   ├── 📄 33.mmd
│   │   │   ├── 📄 34.mmd
│   │   │   ├── 📄 35.mmd
│   │   │   ├── 📄 36.mmd
│   │   │   ├── 📄 37.mmd
│   │   │   ├── 📄 38.mmd
│   │   │   ├── 📄 39.mmd
│   │   │   └── 📄 40.mmd
│   │   ├── 📄 01-ideation.mmd
│   │   ├── 📄 02-planning.mmd
│   │   ├── 📄 03-development.mmd
│   │   ├── 📄 04-launch.mmd
│   │   ├── 📄 05-operations.mmd
│   │   ├── 📄 overview.mmd
│   │   └── 📝 README.md
│   ├── 📁 strategic-directives/
│   │   ├── 📝 SD-002-shimmer-ai-avatar.md
│   │   ├── 📝 SD-2025-001-openai-realtime-voice.md
│   │   └── 📝 SD-TEST-001-shimmer-avatar.md
│   ├── 📁 workflow/
│   │   ├── 📁 backlog/
│   │   │   ├── 📁 issues/
│   │   │   │   ├── 📝 WF-001.md
│   │   │   │   ├── 📝 WF-002.md
│   │   │   │   ├── 📝 WF-003.md
│   │   │   │   ├── 📝 WF-004.md
│   │   │   │   ├── 📝 WF-005.md
│   │   │   │   ├── 📝 WF-006.md
│   │   │   │   ├── 📝 WF-007.md
│   │   │   │   ├── 📝 WF-008.md
│   │   │   │   ├── 📝 WF-009.md
│   │   │   │   ├── 📝 WF-010.md
│   │   │   │   ├── 📝 WF-011.md
│   │   │   │   ├── 📝 WF-012.md
│   │   │   │   ├── 📝 WF-013.md
│   │   │   │   ├── 📝 WF-014.md
│   │   │   │   └── 📝 WF-015.md
│   │   │   └── ⚙️ backlog.yaml
│   │   ├── 📁 critique/
│   │   │   ├── 📝 overview.md
│   │   │   ├── 📝 stage-01.md
│   │   │   ├── 📝 stage-02.md
│   │   │   ├── 📝 stage-03.md
│   │   │   ├── 📝 stage-04.md
│   │   │   ├── 📝 stage-05.md
│   │   │   ├── 📝 stage-06.md
│   │   │   ├── 📝 stage-07.md
│   │   │   ├── 📝 stage-08.md
│   │   │   ├── 📝 stage-09.md
│   │   │   ├── 📝 stage-10.md
│   │   │   ├── 📝 stage-11.md
│   │   │   ├── 📝 stage-12.md
│   │   │   ├── 📝 stage-13.md
│   │   │   ├── 📝 stage-14.md
│   │   │   ├── 📝 stage-15.md
│   │   │   ├── 📝 stage-16.md
│   │   │   ├── 📝 stage-17.md
│   │   │   ├── 📝 stage-18.md
│   │   │   ├── 📝 stage-19.md
│   │   │   ├── 📝 stage-20.md
│   │   │   ├── 📝 stage-21.md
│   │   │   ├── 📝 stage-22.md
│   │   │   ├── 📝 stage-23.md
│   │   │   ├── 📝 stage-24.md
│   │   │   ├── 📝 stage-25.md
│   │   │   ├── 📝 stage-26.md
│   │   │   ├── 📝 stage-27.md
│   │   │   ├── 📝 stage-28.md
│   │   │   ├── 📝 stage-29.md
│   │   │   ├── 📝 stage-30.md
│   │   │   ├── 📝 stage-31.md
│   │   │   ├── 📝 stage-32.md
│   │   │   ├── 📝 stage-33.md
│   │   │   ├── 📝 stage-34.md
│   │   │   ├── 📝 stage-35.md
│   │   │   ├── 📝 stage-36.md
│   │   │   ├── 📝 stage-37.md
│   │   │   ├── 📝 stage-38.md
│   │   │   ├── 📝 stage-39.md
│   │   │   └── 📝 stage-40.md
│   │   ├── 📁 data_contracts/
│   │   │   └── 📝 stage_common_fields.md
│   │   ├── 📁 metrics/
│   │   │   ├── 📁 deltas/
│   │   │   │   └── 📝 proposals_2025-09-06.md
│   │   │   ├── 📁 overrides/
│   │   │   │   ├── ⚙️ _TEMPLATE.yaml
│   │   │   │   └── ⚙️ venture_demo.yaml
│   │   │   ├── 📁 resolved/
│   │   │   │   ├── 📝 --venture_diff.md
│   │   │   │   ├── ⚙️ --venture.yaml
│   │   │   │   ├── 📝 venture_demo_diff.md
│   │   │   │   └── ⚙️ venture_demo.yaml
│   │   │   ├── 📝 calibration_wave1_QA.md
│   │   │   ├── 📝 decision_log_contract.md
│   │   │   ├── 📝 thresholds_report.md
│   │   │   ├── 📄 thresholds_worksheet.csv
│   │   │   ├── ⚙️ thresholds.yaml
│   │   │   ├── 📝 wave5_QA_report.md
│   │   │   └── 📝 wave6_progress.md
│   │   ├── 📁 sop/
│   │   │   ├── 📝 01-draft-idea.md
│   │   │   ├── 📝 02-ai-review.md
│   │   │   ├── 📝 03-comprehensive-validation.md
│   │   │   ├── 📝 04-competitive-intelligence-market-defense.md
│   │   │   ├── 📝 05-profitability-forecasting.md
│   │   │   ├── 📝 06-risk-evaluation.md
│   │   │   ├── 📝 07-comprehensive-planning-suite.md
│   │   │   ├── 📝 08-problem-decomposition-engine.md
│   │   │   ├── 📝 09-gap-analysis-market-opportunity-modeling.md
│   │   │   ├── 📝 10-comprehensive-technical-review.md
│   │   │   ├── 📝 11-strategic-naming-brand-foundation.md
│   │   │   ├── 📝 12-adaptive-naming-module.md
│   │   │   ├── 📝 13-exit-oriented-design.md
│   │   │   ├── 📝 14-comprehensive-development-preparation.md
│   │   │   ├── 📝 15-pricing-strategy-revenue-architecture.md
│   │   │   ├── 📝 16-ai-ceo-agent-development.md
│   │   │   ├── 📝 17-gtm-strategist-agent-development.md
│   │   │   ├── 📝 18-documentation-sync-to-github.md
│   │   │   ├── 📝 19-tri-party-integration-verification.md
│   │   │   ├── 📝 20-enhanced-context-loading.md
│   │   │   ├── 📝 21-final-pre-flight-check.md
│   │   │   ├── 📝 22-iterative-development-loop.md
│   │   │   ├── 📝 23-continuous-feedback-loops.md
│   │   │   ├── 📝 24-mvp-engine-automated-feedback-iteration.md
│   │   │   ├── 📝 25-quality-assurance.md
│   │   │   ├── 📝 26-security-compliance-certification.md
│   │   │   ├── 📝 27-actor-model-saga-transaction-integration.md
│   │   │   ├── 📝 28-development-excellence-caching-optimizations.md
│   │   │   ├── 📝 29-final-polish.md
│   │   │   ├── 📝 30-production-deployment.md
│   │   │   ├── 📝 31-mvp-launch.md
│   │   │   ├── 📝 32-customer-success-retention-engineering.md
│   │   │   ├── 📝 33-post-mvp-expansion.md
│   │   │   ├── 📝 34-creative-media-automation.md
│   │   │   ├── 📝 35-gtm-timing-intelligence.md
│   │   │   ├── 📝 36-parallel-exploration.md
│   │   │   ├── 📝 37-strategic-risk-forecasting.md
│   │   │   ├── 📝 38-timing-optimization.md
│   │   │   ├── 📝 39-multi-venture-coordination.md
│   │   │   └── 📝 40-venture-active.md
│   │   ├── 📁 taxonomy/
│   │   │   └── ⚙️ content_types.yaml
│   │   ├── 📝 GENERATION_SUMMARY.md
│   │   ├── 📄 prd_crosswalk.csv
│   │   ├── 📝 prd_crosswalk.md
│   │   ├── 📝 README.md
│   │   ├── 📝 RUNBOOK-Calibrate-and-Promote.md
│   │   ├── 📝 SOP_INDEX.md
│   │   └── ⚙️ stages.yaml
│   ├── 📝 REALTIME_VOICE_FUNCTIONS.md
│   ├── 📝 VENTURES_ENHANCEMENTS_COMPLETE.md
│   └── 📝 VOICE_FUNCTION_TEST_SCENARIOS.md
├── 📁 enhanced_prds/
│   ├── 📁 00_foundation/
│   │   └── 📝 database_schema.md
│   ├── 📁 10_platform/
│   │   ├── 📝 ai_ceo_competitive_intelligence_integration.md
│   │   ├── 📝 ai_ceo_exit_decision_integration.md
│   │   ├── 📝 analytics_reports_insights.md
│   │   ├── 📝 authentication_identity.md
│   │   ├── 📝 automated_replication_blueprint_generator.md
│   │   ├── 📝 chairman_console.md
│   │   ├── 📝 creative_quality_assurance_framework.md
│   │   ├── 📝 customer_success_retention_automation_integration.md
│   │   ├── 📝 data_management_kb.md
│   │   ├── 📝 deployment_ops.md
│   │   ├── 📝 design_system_handcrafted.md
│   │   ├── 📝 design_system.md
│   │   ├── 📝 development_excellence.md
│   │   ├── 📝 eva_assistant_orchestration.md
│   │   ├── 📝 governance_compliance.md
│   │   ├── 📝 integration_hub.md
│   │   ├── 📝 mvp_engine.md
│   │   ├── 📝 navigation_ui.md
│   │   ├── 📝 notifications_collaboration.md
│   │   ├── 📝 onboarding_quickstart.md
│   │   ├── 📝 opportunity_matrix_analyzer.md
│   │   ├── 📝 programmatic_seo_content_engine.md
│   │   ├── 📝 prompt_template_library.md
│   │   ├── 📝 settings_personalization.md
│   │   ├── 📝 testing_qa_enhanced.md
│   │   ├── 📝 testing_qa.md
│   │   └── 📝 user_stories_journeys.md
│   ├── 📁 20_workflows/
│   │   ├── 📝 01a_draft_idea.md
│   │   ├── 📝 01b_idea_generation_intelligence.md
│   │   ├── 📝 02_ai_review.md
│   │   ├── 📝 03_comprehensive_validation.md
│   │   ├── 📝 04a_competitive_intelligence.md
│   │   ├── 📝 04b_competitive_intelligence_analysis.md
│   │   ├── 📝 04c_competitive_kpi_tracking.md
│   │   ├── 📝 05_profitability_forecasting.md
│   │   ├── 📝 06_risk_evaluation.md
│   │   ├── 📝 07_comprehensive_planning_suite.md
│   │   ├── 📝 08_problem_decomposition.md
│   │   ├── 📝 09a_gap_analysis.md
│   │   ├── 📝 09b_gap_analysis_intelligence.md
│   │   ├── 📝 10_technical_review.md
│   │   ├── 📝 11_strategic_naming.md
│   │   ├── 📝 12_adaptive_naming.md
│   │   ├── 📝 13a_exit_oriented_design.md
│   │   ├── 📝 13b_exit_readiness_tracking.md
│   │   ├── 📝 14_development_preparation.md
│   │   ├── 📝 15_pricing_strategy.md
│   │   ├── 📝 18_documentation_sync.md
│   │   ├── 📝 19_integration_verification.md
│   │   ├── 📝 20_enhanced_context_loading.md
│   │   ├── 📝 21_preflight_check.md
│   │   ├── 📝 22_iterative_dev_loop.md
│   │   ├── 📝 23a_feedback_loops.md
│   │   ├── 📝 23b_feedback_loops_ai.md
│   │   ├── 📝 24_mvp_engine_iteration.md
│   │   ├── 📝 25_quality_assurance.md
│   │   ├── 📝 26_security_compliance.md
│   │   ├── 📝 27_actor_model_saga.md
│   │   ├── 📝 28_dev_excellence_caching.md
│   │   ├── 📝 29_final_polish.md
│   │   ├── 📝 30_production_deployment.md
│   │   ├── 📝 31_mvp_launch.md
│   │   ├── 📝 32a_customer_success.md
│   │   ├── 📝 32b_customer_success_ai.md
│   │   ├── 📝 33_post_mvp_expansion.md
│   │   ├── 📝 34a_creative_media_automation.md
│   │   ├── 📝 34b_creative_media_automation_enhanced.md
│   │   ├── 📝 34c_creative_media_handcrafted.md
│   │   ├── 📝 35_gtm_timing_intelligence.md
│   │   ├── 📝 36_parallel_exploration.md
│   │   ├── 📝 37_strategic_risk_forecasting.md
│   │   ├── 📝 38_timing_optimization.md
│   │   ├── 📝 39_multi_venture_coordination.md
│   │   ├── 📝 40a_venture_active.md
│   │   ├── 📝 40b_portfolio_exit_sequencing.md
│   │   └── 📝 61_venture_prd_generation.md
│   ├── 📁 30_agents/
│   │   ├── 📝 ai_ceo_agent.md
│   │   ├── 📝 ai_leadership_agents.md
│   │   ├── 📝 gtm_creative_assets.md
│   │   ├── 📝 gtm_strategist_agent.md
│   │   ├── 📝 gtm_strategist_marketing_automation.md
│   │   └── 📝 strategic_intelligence_scaling.md
│   ├── 📝 PRD_ARCHITECTURE_MAP.md
│   └── 📝 README.md
├── 📁 handoffs/
│   ├── 📝 HANDOFF-LEAD-PLAN-2025-001.md
│   └── 📝 HANDOFF-PLAN-EXEC-2025-001.md
├── 📁 lib/
│   ├── 📁 analytics/
│   │   └── 📘 onboarding.ts
│   └── 📁 auth/
│       └── 📘 useCurrentUser.ts
├── 📁 prd-analysis/
│   ├── 📋 confidence-scoring-report.json
│   ├── 📝 executive-summary.md
│   ├── 📝 gap-analysis-report.md
│   ├── 📝 gap-closure-summary.md
│   ├── 📋 implementation-analysis.json
│   ├── 📋 prd-requirements-extraction.json
│   └── 📝 README.md
├── 📁 public/
│   ├── 📄 favicon.ico
│   ├── 📄 placeholder.svg
│   └── 📄 robots.txt
├── 📁 scripts/
│   ├── 📁 seed/
│   │   ├── 📘 governance.seed.ts
│   │   └── 📘 onboarding.seed.ts
│   ├── 🗄️ add-leo-docs-to-database.sql
│   ├── 📜 add-sd-2025-001-simple.js
│   ├── 📜 add-sd-2025-001-to-database.js
│   ├── 📜 add-stage-metadata.js
│   ├── 📜 add-test-data.js
│   ├── 📜 append-decision-log.js
│   ├── 📜 apply-automation-schema.js
│   ├── 📜 apply-chairman-dashboard-schema.js
│   ├── 📜 apply-demo-migration-direct.js
│   ├── 📜 apply-demo-migration-pg.js
│   ├── 📜 apply-demo-migration-supabase.js
│   ├── 📜 apply-demo-migration.js
│   ├── 📜 apply-validation-schema.js
│   ├── 📜 cleanup-demo-data.js
│   ├── 📜 create-exit-workflow-schema.js
│   ├── 📜 create-venture-indexes.js
│   ├── 📜 csv-to-override.js
│   ├── 📜 derive-threshold-deltas.js
│   ├── 📜 e2e-test-ventures.js
│   ├── 📜 generate-thresholds-worksheet.js
│   ├── 📜 generate-workflow-docs.js
│   ├── 📜 remove-console-statements.js
│   ├── 📄 remove-console-statements.mjs
│   ├── 📜 repo-guard.js
│   ├── 📜 resolve-thresholds.js
│   ├── 📜 scrub-diagram-owners.js
│   ├── 🗄️ seed-test-data.sql
│   ├── 📜 test-demo-separation.js
│   ├── 📜 test-eva-conversation.js
│   ├── 📜 test-threshold-scenarios.js
│   ├── 📜 test-ventures-enhancements.js
│   ├── 📜 validate-thresholds.js
│   ├── 📜 validate-ventures-implementation.js
│   ├── 📜 verify-database-before-exec.js
│   └── 📜 verify-exit-workflow-schema.js
├── 📁 server/
│   ├── 📁 api/
│   │   └── 📁 onboarding/
│   │       └── 📘 progress.ts
│   ├── 📁 contracts/
│   │   ├── 📘 feedback.ts
│   │   ├── 📘 index.ts
│   │   └── 📘 ventures.ts
│   └── 📁 tests/
│       └── 📁 contracts/
│           ├── 📘 feedback.spec.ts
│           └── 📘 ventures.spec.ts
├── 📁 src/
│   ├── 📁 api/
│   │   ├── 📘 decisions.ts
│   │   └── 📘 deltas.ts
│   ├── 📁 app/
│   │   └── 📁 api/
│   │       └── 📁 transcribe/
│   │           └── 📘 route.ts
│   ├── 📁 components/
│   │   ├── 📁 accessibility/
│   │   │   ├── ⚛️ AccessibilityProvider.tsx
│   │   │   ├── ⚛️ AccessibilitySettings.tsx
│   │   │   ├── ⚛️ AccessibleNavigationAnnouncer.tsx
│   │   │   ├── ⚛️ SkipNavigation.tsx
│   │   │   └── ⚛️ VoiceInput.tsx
│   │   ├── 📁 agents/
│   │   │   ├── ⚛️ AgentCoordinationTab.tsx
│   │   │   ├── ⚛️ AgentDeployDialog.tsx
│   │   │   ├── ⚛️ AgentPerformanceChart.tsx
│   │   │   ├── ⚛️ AgentPerformanceTab.tsx
│   │   │   ├── ⚛️ AgentSettingsTab.tsx
│   │   │   ├── ⚛️ AgentStatusCard.tsx
│   │   │   └── ⚛️ AgentTaskQueue.tsx
│   │   ├── 📁 ai/
│   │   │   └── ⚛️ AIHealthMonitor.tsx
│   │   ├── 📁 ai-agents/
│   │   │   └── ⚛️ AgentStatusCard.tsx
│   │   ├── 📁 ai-ceo/
│   │   │   ├── ⚛️ BoardReporting.tsx
│   │   │   ├── ⚛️ ExecutiveDecisionSupport.tsx
│   │   │   ├── 📘 index.ts
│   │   │   └── ⚛️ StrategicInitiativeTracking.tsx
│   │   ├── 📁 analytics/
│   │   │   ├── ⚛️ AdvancedAnalyticsEngine.tsx
│   │   │   ├── ⚛️ AIInsightsAlert.tsx
│   │   │   ├── ⚛️ AIInsightsView.tsx
│   │   │   ├── ⚛️ AnalyticsDashboard.tsx
│   │   │   ├── ⚛️ CustomReportsView.tsx
│   │   │   ├── ⚛️ EnhancedCharts.tsx
│   │   │   ├── ⚛️ EnhancedKeyMetricsOverview.tsx
│   │   │   ├── ⚛️ ExecutiveDashboard.tsx
│   │   │   ├── 📘 index.ts
│   │   │   ├── ⚛️ KeyMetricsOverview.tsx
│   │   │   ├── ⚛️ KPIBuilder.tsx
│   │   │   ├── ⚛️ PortfolioAnalyticsView.tsx
│   │   │   ├── ⚛️ UserJourneyAnalytics.tsx
│   │   │   └── ⚛️ VentureAnalyticsView.tsx
│   │   ├── 📁 auth/
│   │   │   ├── ⚛️ AISecurityMonitor.tsx
│   │   │   ├── ⚛️ AuthenticationDashboard.tsx
│   │   │   ├── ⚛️ EnhancedAuthenticationSystem.tsx
│   │   │   ├── ⚛️ ProtectedRoute.tsx
│   │   │   └── ⚛️ RoleBasedAccess.tsx
│   │   ├── 📁 business-agents/
│   │   │   ├── ⚛️ AgentControlPanel.tsx
│   │   │   └── ⚛️ AgentMetricsChart.tsx
│   │   ├── 📁 chairman/
│   │   │   ├── 📁 feedback/
│   │   │   │   ├── ⚛️ AgentInstructions.tsx
│   │   │   │   ├── ⚛️ FeedbackForm.tsx
│   │   │   │   ├── ⚛️ FeedbackHistory.tsx
│   │   │   │   ├── ⚛️ ProcessingStatus.tsx
│   │   │   │   └── ⚛️ VoiceRecorder.tsx
│   │   │   ├── ⚛️ AIInsightsEngine.tsx
│   │   │   ├── ⚛️ ChairmanFeedbackPanel.tsx
│   │   │   ├── ⚛️ ChairmanOverridePanel.tsx
│   │   │   ├── ⚛️ CompanySelector.tsx
│   │   │   ├── ⚛️ ExecutiveAlerts.tsx
│   │   │   ├── ⚛️ FinancialAnalytics.tsx
│   │   │   ├── ⚛️ OperationalIntelligence.tsx
│   │   │   ├── ⚛️ PerformanceDriveCycle.tsx
│   │   │   ├── ⚛️ StrategicKPIMonitor.tsx
│   │   │   ├── ⚛️ SynergyOpportunities.tsx
│   │   │   └── ⚛️ VenturePortfolioOverview.tsx
│   │   ├── 📁 collaboration/
│   │   │   ├── ⚛️ AdvancedCollaboration.tsx
│   │   │   ├── ⚛️ CollaborationHub.tsx
│   │   │   ├── ⚛️ CreateThreadDialog.tsx
│   │   │   └── ⚛️ ThreadDetails.tsx
│   │   ├── 📁 competitive-intelligence/
│   │   │   ├── ⚛️ CompetitiveIntelligenceModule.tsx
│   │   │   ├── ⚛️ CompetitiveLandscapeMapping.tsx
│   │   │   ├── ⚛️ CompetitorAnalysisAutomation.tsx
│   │   │   ├── 📘 index.ts
│   │   │   └── ⚛️ UserCentricBenchmarking.tsx
│   │   ├── 📁 completion/
│   │   │   └── ⚛️ PlatformCompletionSummary.tsx
│   │   ├── 📁 creative-media/
│   │   │   ├── ⚛️ ContentGenerationEngine.tsx
│   │   │   ├── ⚛️ CreativeOptimization.tsx
│   │   │   ├── 📘 index.ts
│   │   │   └── ⚛️ VideoProductionPipeline.tsx
│   │   ├── 📁 data/
│   │   │   └── ⚛️ KnowledgeBaseSystem.tsx
│   │   ├── 📁 data-management/
│   │   │   ├── ⚛️ DataGovernanceDashboard.tsx
│   │   │   └── ⚛️ DataLifecycleDashboard.tsx
│   │   ├── 📁 development/
│   │   │   ├── ⚛️ DevelopmentEnvironment.tsx
│   │   │   ├── ⚛️ OnboardingChecklist.tsx
│   │   │   └── ⚛️ TestingAutomationDashboard.tsx
│   │   ├── 📁 eva/
│   │   │   ├── ⚛️ ChatInput.tsx
│   │   │   ├── ⚛️ EVAAnalyticsDashboard.tsx
│   │   │   ├── ⚛️ EVAChatInterface.tsx
│   │   │   ├── ⚛️ EVAComplianceDashboard.tsx
│   │   │   ├── ⚛️ EVAOrchestrationDashboard.tsx
│   │   │   ├── ⚛️ EVARealtimeVoice.tsx
│   │   │   ├── ⚛️ EVASetup.tsx
│   │   │   ├── ⚛️ EVATeamCollaboration.tsx
│   │   │   ├── ⚛️ EVATextToSpeechChat.tsx
│   │   │   ├── ⚛️ EVAVoiceInterface.tsx
│   │   │   ├── ⚛️ FloatingEVAAssistant.tsx
│   │   │   ├── ⚛️ FloatingEVAButton.tsx
│   │   │   └── ⚛️ KnowledgeBase.tsx
│   │   ├── 📁 execution/
│   │   │   ├── ⚛️ ExecutionProgressChart.tsx
│   │   │   ├── ⚛️ StageExecutionDetails.tsx
│   │   │   └── ⚛️ WorkflowExecutionDashboard.tsx
│   │   ├── 📁 exit/
│   │   │   └── ⚛️ ExitDecisionWorkflow.tsx
│   │   ├── 📁 feedback-loops/
│   │   │   ├── ⚛️ AIFeedbackAnalysis.tsx
│   │   │   ├── ⚛️ CustomerSatisfactionDashboard.tsx
│   │   │   ├── 📘 index.ts
│   │   │   └── ⚛️ RealTimeFeedbackCollection.tsx
│   │   ├── 📁 gap-analysis/
│   │   │   ├── ⚛️ CurrentStateAssessment.tsx
│   │   │   ├── ⚛️ GapIdentificationEngine.tsx
│   │   │   └── ⚛️ RemediationPlanning.tsx
│   │   ├── 📁 governance/
│   │   │   ├── ⚛️ AccessReviewDashboard.tsx
│   │   │   ├── ⚛️ AuditTrailViewer.tsx
│   │   │   ├── ⚛️ ComplianceMonitoring.tsx
│   │   │   ├── ⚛️ GovernanceDashboard.tsx
│   │   │   ├── ⚛️ PolicyManagement.tsx
│   │   │   └── ⚛️ ReportGenerator.tsx
│   │   ├── 📁 gtm/
│   │   │   ├── ⚛️ CampaignOrchestration.tsx
│   │   │   ├── ⚛️ GTMStrategyEngine.tsx
│   │   │   ├── ⚛️ GTMTimingDashboard.tsx
│   │   │   ├── 📘 index.ts
│   │   │   └── ⚛️ MarketReadinessAssessment.tsx
│   │   ├── 📁 insights/
│   │   │   ├── ⚛️ AutomatedInsightsGeneration.tsx
│   │   │   ├── 📘 index.ts
│   │   │   ├── ⚛️ PredictiveInsightsEngine.tsx
│   │   │   └── ⚛️ RealTimeAnalyticsDashboard.tsx
│   │   ├── 📁 integration/
│   │   │   ├── ⚛️ ExternalIntegrationHub.tsx
│   │   │   ├── ⚛️ IntegrationConfigModal.tsx
│   │   │   ├── ⚛️ IntegrationHealthMonitor.tsx
│   │   │   ├── ⚛️ IntegrationHubDashboard.tsx
│   │   │   ├── ⚛️ IntegrationStatusDashboard.tsx
│   │   │   ├── ⚛️ ProductionReadiness.tsx
│   │   │   └── ⚛️ SystemOrchestration.tsx
│   │   ├── 📁 knowledge-management/
│   │   │   └── ⚛️ KnowledgeManagementDashboard.tsx
│   │   ├── 📁 layout/
│   │   │   ├── ⚛️ AppLayout.tsx
│   │   │   ├── ⚛️ AuthenticatedLayout.tsx
│   │   │   ├── ⚛️ Header.tsx
│   │   │   └── ⚛️ Navigation.tsx
│   │   ├── 📁 live-progress/
│   │   │   ├── ⚛️ LiveActivityFeed.tsx
│   │   │   ├── ⚛️ LivePerformanceDashboard.tsx
│   │   │   ├── ⚛️ LiveWorkflowMap.tsx
│   │   │   └── ⚛️ PortfolioOverview.tsx
│   │   ├── 📁 monitoring/
│   │   │   ├── ⚛️ AIMonitoringAnalytics.tsx
│   │   │   ├── ⚛️ CreateIncidentDialog.tsx
│   │   │   └── ⚛️ IncidentManagement.tsx
│   │   ├── 📁 naming/
│   │   │   ├── ⚛️ EntityGlossary.tsx
│   │   │   └── ⚛️ NamingConventions.tsx
│   │   ├── 📁 navigation/
│   │   │   ├── ⚛️ AccessibilityEnhancements.tsx
│   │   │   ├── ⚛️ AINavigationAssistant.tsx
│   │   │   ├── ⚛️ BreadcrumbNavigation.tsx
│   │   │   ├── ⚛️ GlobalSearch.tsx
│   │   │   ├── ⚛️ KeyboardShortcuts.tsx
│   │   │   ├── ⚛️ MobileNavigationEnhancements.tsx
│   │   │   ├── ⚛️ ModernNavigationSidebar.tsx
│   │   │   └── ⚛️ NavigationAssistant.tsx
│   │   ├── 📁 notifications/
│   │   │   ├── ⚛️ NotificationCenter.tsx
│   │   │   ├── ⚛️ NotificationPreferencesDialog.tsx
│   │   │   └── ⚛️ NotificationSettings.tsx
│   │   ├── 📁 onboarding/
│   │   │   └── ⚛️ FirstRunWizard.tsx
│   │   ├── 📁 opportunities/
│   │   │   ├── ⚛️ ManualEntryForm.jsx
│   │   │   └── ⚛️ OpportunitySourcingDashboard.jsx
│   │   ├── 📁 opportunity-sourcing/
│   │   ├── 📁 orchestration/
│   │   │   ├── ⚛️ ActiveWorkflowsView.tsx
│   │   │   ├── ⚛️ AgentCoordinationView.tsx
│   │   │   ├── ⚛️ EVAOrchestrationEngine.tsx
│   │   │   ├── ⚛️ OrchestrationAnalytics.tsx
│   │   │   ├── ⚛️ PerformanceDriveCycleCard.tsx
│   │   │   ├── ⚛️ SystemHealthOverview.tsx
│   │   │   ├── ⚛️ TaskQueue.tsx
│   │   │   └── ⚛️ WorkflowEngine.tsx
│   │   ├── 📁 parallel-exploration/
│   │   │   └── ⚛️ ParallelExplorationDashboard.tsx
│   │   ├── 📁 performance/
│   │   │   ├── ⚛️ AdvancedCacheOptimization.tsx
│   │   │   ├── ⚛️ AIPerformanceAnalytics.tsx
│   │   │   └── ⚛️ ScalingAutomation.tsx
│   │   ├── 📁 quality-assurance/
│   │   │   ├── ⚛️ AutomatedTestSuiteManagement.tsx
│   │   │   ├── 📘 index.ts
│   │   │   ├── ⚛️ IntelligentTestGeneration.tsx
│   │   │   └── ⚛️ RealTimeQualityMetrics.tsx
│   │   ├── 📁 risk-forecasting/
│   │   │   └── ⚛️ RiskForecastingEngine.tsx
│   │   ├── 📁 search/
│   │   │   └── ⚛️ AccessibleGlobalSearch.tsx
│   │   ├── 📁 security/
│   │   │   ├── ⚛️ ComprehensiveSecurityDashboard.tsx
│   │   │   ├── ⚛️ SecurityDashboard.tsx
│   │   │   └── ⚛️ SecurityIncidentManager.tsx
│   │   ├── 📁 settings/
│   │   │   ├── ⚛️ SystemConfiguration.tsx
│   │   │   └── ⚛️ UserProfileSettings.tsx
│   │   ├── 📁 stages/
│   │   │   ├── ⚛️ CompleteWorkflowOrchestrator.tsx
│   │   │   ├── ⚛️ FoundationChunkWorkflow.tsx
│   │   │   ├── ⚛️ LaunchGrowthChunkWorkflow.tsx
│   │   │   ├── ⚛️ OperationsOptimizationChunkWorkflow.tsx
│   │   │   ├── ⚛️ PlanningChunkWorkflow.tsx
│   │   │   ├── ⚛️ Stage10TechnicalReview.tsx
│   │   │   ├── ⚛️ Stage11MVPDevelopment.tsx
│   │   │   ├── ⚛️ Stage11StrategicNaming.tsx
│   │   │   ├── ⚛️ Stage12AdaptiveNaming.tsx
│   │   │   ├── ⚛️ Stage12TechnicalImplementation.tsx
│   │   │   ├── ⚛️ Stage13ExitOrientedDesign.tsx
│   │   │   ├── ⚛️ Stage13IntegrationTesting.tsx
│   │   │   ├── ⚛️ Stage14DevelopmentPreparation.tsx
│   │   │   ├── ⚛️ Stage14QualityAssurance.tsx
│   │   │   ├── ⚛️ Stage15DeploymentPreparation.tsx
│   │   │   ├── ⚛️ Stage15PricingStrategy.tsx
│   │   │   ├── ⚛️ Stage16AICEOAgent.tsx
│   │   │   ├── ⚛️ Stage17GTMStrategy.tsx
│   │   │   ├── ⚛️ Stage18DocumentationSync.tsx
│   │   │   ├── ⚛️ Stage19IntegrationVerification.tsx
│   │   │   ├── ⚛️ Stage1DraftIdea.tsx
│   │   │   ├── ⚛️ Stage20ContextLoading.tsx
│   │   │   ├── ⚛️ Stage21LaunchPreparation.tsx
│   │   │   ├── ⚛️ Stage21PreFlightCheck.tsx
│   │   │   ├── ⚛️ Stage22GoToMarketExecution.tsx
│   │   │   ├── ⚛️ Stage22IterativeDevelopmentLoop.tsx
│   │   │   ├── ⚛️ Stage23ContinuousFeedbackLoops.tsx
│   │   │   ├── ⚛️ Stage23CustomerAcquisition.tsx
│   │   │   ├── ⚛️ Stage24GrowthMetricsOptimization.tsx
│   │   │   ├── ⚛️ Stage24MVPEngineIteration.tsx
│   │   │   ├── ⚛️ Stage25QualityAssurance.tsx
│   │   │   ├── ⚛️ Stage25ScalePlanning.tsx
│   │   │   ├── ⚛️ Stage26OperationalExcellence.tsx
│   │   │   ├── ⚛️ Stage27PerformanceOptimization.tsx
│   │   │   ├── ⚛️ Stage28CustomerSuccess.tsx
│   │   │   ├── ⚛️ Stage29RevenueOptimization.tsx
│   │   │   ├── ⚛️ Stage2AIReview.tsx
│   │   │   ├── ⚛️ Stage30TeamScaling.tsx
│   │   │   ├── ⚛️ Stage31AdvancedAnalytics.tsx
│   │   │   ├── ⚛️ Stage31MVPLaunch.tsx
│   │   │   ├── ⚛️ Stage32AIMLIntegration.tsx
│   │   │   ├── ⚛️ Stage32CustomerSuccess.tsx
│   │   │   ├── ⚛️ Stage33CapabilityExpansion.tsx
│   │   │   ├── ⚛️ Stage33InternationalExpansion.tsx
│   │   │   ├── ⚛️ Stage34CreativeMediaAutomation.tsx
│   │   │   ├── ⚛️ Stage34StrategicPartnerships.tsx
│   │   │   ├── ⚛️ Stage35GTMTimingIntelligence.tsx
│   │   │   ├── ⚛️ Stage35InnovationPipeline.tsx
│   │   │   ├── ⚛️ Stage36ParallelExploration.tsx
│   │   │   ├── ⚛️ Stage37StrategicRiskForecasting.tsx
│   │   │   ├── ⚛️ Stage38TimingOptimization.tsx
│   │   │   ├── ⚛️ Stage39MultiVentureCoordination.tsx
│   │   │   ├── ⚛️ Stage3ComprehensiveValidation.tsx
│   │   │   ├── ⚛️ Stage40VentureActive.tsx
│   │   │   ├── ⚛️ Stage4CompetitiveIntelligence.tsx
│   │   │   ├── ⚛️ Stage52DataManagementKB.tsx
│   │   │   ├── ⚛️ Stage5ProfitabilityForecasting.tsx
│   │   │   ├── ⚛️ Stage6RiskEvaluation.tsx
│   │   │   ├── ⚛️ Stage7ComprehensivePlanning.tsx
│   │   │   ├── ⚛️ Stage8ProblemDecomposition.tsx
│   │   │   ├── ⚛️ Stage9GapAnalysis.tsx
│   │   │   ├── ⚛️ StageProgressIndicator.tsx
│   │   │   └── ⚛️ ValidationChunkWorkflow.tsx
│   │   ├── 📁 team/
│   │   │   └── ⚛️ TeamManagementInterface.tsx
│   │   ├── 📁 test-runner/
│   │   │   ├── ⚛️ DirectOpenAITest.tsx
│   │   │   ├── ⚛️ OpenAIValidator.tsx
│   │   │   ├── ⚛️ TestExecutor.tsx
│   │   │   └── ⚛️ TestRunner.tsx
│   │   ├── 📁 testing/
│   │   │   ├── ⚛️ AITestGenerator.tsx
│   │   │   ├── ⚛️ ComprehensiveTestSuite.tsx
│   │   │   ├── ⚛️ Phase3VerificationTests.tsx
│   │   │   ├── ⚛️ QualityGatesManager.tsx
│   │   │   └── ⚛️ TestingDashboard.tsx
│   │   ├── 📁 timing-optimization/
│   │   │   └── ⚛️ TimingOptimizationDashboard.tsx
│   │   ├── 📁 ui/
│   │   │   ├── ⚛️ accessibility-helpers.tsx
│   │   │   ├── ⚛️ accordion.tsx
│   │   │   ├── ⚛️ alert-dialog.tsx
│   │   │   ├── ⚛️ alert.tsx
│   │   │   ├── ⚛️ aspect-ratio.tsx
│   │   │   ├── ⚛️ avatar.tsx
│   │   │   ├── ⚛️ badge.tsx
│   │   │   ├── ⚛️ breadcrumb.tsx
│   │   │   ├── ⚛️ button.tsx
│   │   │   ├── ⚛️ calendar.tsx
│   │   │   ├── ⚛️ card.tsx
│   │   │   ├── ⚛️ carousel.tsx
│   │   │   ├── ⚛️ chart.tsx
│   │   │   ├── ⚛️ checkbox.tsx
│   │   │   ├── ⚛️ collapsible.tsx
│   │   │   ├── ⚛️ command.tsx
│   │   │   ├── ⚛️ context-menu.tsx
│   │   │   ├── ⚛️ DarkModeToggle.tsx
│   │   │   ├── ⚛️ DemoModeIndicator.tsx
│   │   │   ├── ⚛️ dialog.tsx
│   │   │   ├── ⚛️ drawer.tsx
│   │   │   ├── ⚛️ dropdown-menu.tsx
│   │   │   ├── ⚛️ EmptyState.tsx
│   │   │   ├── ⚛️ enhanced-card.tsx
│   │   │   ├── ⚛️ FocusTrap.tsx
│   │   │   ├── ⚛️ form.tsx
│   │   │   ├── ⚛️ hover-card.tsx
│   │   │   ├── ⚛️ input-otp.tsx
│   │   │   ├── ⚛️ input.tsx
│   │   │   ├── ⚛️ label.tsx
│   │   │   ├── ⚛️ loading-states.tsx
│   │   │   ├── ⚛️ menubar.tsx
│   │   │   ├── ⚛️ mobile-optimized.tsx
│   │   │   ├── ⚛️ navigation-menu.tsx
│   │   │   ├── ⚛️ pagination.tsx
│   │   │   ├── ⚛️ performance-optimized.tsx
│   │   │   ├── ⚛️ popover.tsx
│   │   │   ├── ⚛️ progress.tsx
│   │   │   ├── ⚛️ radio-group.tsx
│   │   │   ├── ⚛️ resizable.tsx
│   │   │   ├── ⚛️ scroll-area.tsx
│   │   │   ├── ⚛️ select.tsx
│   │   │   ├── ⚛️ separator.tsx
│   │   │   ├── ⚛️ sheet.tsx
│   │   │   ├── ⚛️ sidebar.tsx
│   │   │   ├── ⚛️ skeleton.tsx
│   │   │   ├── ⚛️ SkeletonLoader.tsx
│   │   │   ├── ⚛️ slider.tsx
│   │   │   ├── ⚛️ sonner.tsx
│   │   │   ├── ⚛️ switch.tsx
│   │   │   ├── ⚛️ table.tsx
│   │   │   ├── ⚛️ tabs.tsx
│   │   │   ├── ⚛️ textarea.tsx
│   │   │   ├── ⚛️ toast.tsx
│   │   │   ├── ⚛️ toaster.tsx
│   │   │   ├── ⚛️ toggle-group.tsx
│   │   │   ├── ⚛️ toggle.tsx
│   │   │   ├── ⚛️ tooltip.tsx
│   │   │   └── 📘 use-toast.ts
│   │   ├── 📁 validation/
│   │   │   └── ⚛️ ValidationDashboard.tsx
│   │   ├── 📁 venture/
│   │   │   ├── ⚛️ ChairmanDashboard.tsx
│   │   │   └── ⚛️ VentureGrid.tsx
│   │   ├── 📁 venture-coordination/
│   │   │   └── ⚛️ MultiVentureCoordinationEngine.tsx
│   │   ├── 📁 ventures/
│   │   │   ├── ⚛️ AdvancedFilters.tsx
│   │   │   ├── ⚛️ AutomationDashboard.tsx
│   │   │   ├── ⚛️ AutomationStateBadge.tsx
│   │   │   ├── ⚛️ CalibrationReview.tsx
│   │   │   ├── ⚛️ ChairmanFeedbackDisplay.tsx
│   │   │   ├── ⚛️ ColorTest.tsx
│   │   │   ├── ⚛️ ConfigurableMetrics.tsx
│   │   │   ├── ⚛️ CreateVentureDialog.tsx
│   │   │   ├── ⚛️ DecisionsInbox.tsx
│   │   │   ├── ⚛️ EnhancedMilestoneView.tsx
│   │   │   ├── ⚛️ ESGBlackoutBadge.tsx
│   │   │   ├── ⚛️ MilestoneDistribution.tsx
│   │   │   ├── ⚛️ StageAnalysisDashboard.tsx
│   │   │   ├── ⚛️ StartWorkflowButton.tsx
│   │   │   ├── ⚛️ TriageSummary.tsx
│   │   │   ├── ⚛️ UpdateFinancialsDialog.tsx
│   │   │   ├── ⚛️ VentureCard.tsx
│   │   │   ├── ⚛️ VentureCreateDialog.tsx
│   │   │   ├── ⚛️ VentureCreationDialog.tsx
│   │   │   ├── ⚛️ VentureDataTable.tsx
│   │   │   ├── ⚛️ VentureEditDialog.tsx
│   │   │   ├── ⚛️ VentureOverviewTab.tsx
│   │   │   ├── ⚛️ VenturesKanbanView.tsx
│   │   │   ├── ⚛️ VentureStageNavigation.tsx
│   │   │   └── ⚛️ VoiceCapture.tsx
│   │   ├── 📁 workflow/
│   │   │   ├── ⚛️ DynamicStageRenderer.tsx
│   │   │   ├── ⚛️ StageConfigurationForm.tsx
│   │   │   ├── ⚛️ StageDetailsPanel.tsx
│   │   │   ├── ⚛️ WorkflowProgress.tsx
│   │   │   └── ⚛️ WorkflowStageMap.tsx
│   │   └── ⚛️ LoadingFallback.tsx
│   ├── 📁 constants/
│   │   ├── 📘 featureFlags.ts
│   │   ├── 📘 gating.ts
│   │   └── 📘 workflows.ts
│   ├── 📁 contexts/
│   │   ├── ⚛️ AccessibilityContext.tsx
│   │   └── ⚛️ EVAContext.tsx
│   ├── 📁 data/
│   │   └── 📘 mockVentures.ts
│   ├── 📁 features/
│   │   └── 📁 comprehensive_validation/
│   │       ├── ⚛️ ChairmanOverrideControls.tsx
│   │       ├── 📘 rules.ts
│   │       ├── 📘 schemas.ts
│   │       ├── 📘 service.ts
│   │       └── ⚛️ ValidationDashboard.tsx
│   ├── 📁 hooks/
│   │   ├── ⚛️ use-mobile.tsx
│   │   ├── 📘 use-toast.ts
│   │   ├── 📘 useActorModelSaga.ts
│   │   ├── 📘 useAdaptiveNaming.ts
│   │   ├── 📘 useAdvancedKeyboardNavigation.ts
│   │   ├── 📘 useAgentData.ts
│   │   ├── 📘 useAgents.ts
│   │   ├── 📘 useAICEOAgent.ts
│   │   ├── 📘 useAIReviewService.ts
│   │   ├── 📘 useAnalyticsData.ts
│   │   ├── ⚛️ useAuthenticationData.tsx
│   │   ├── 📘 useBusinessAgents.ts
│   │   ├── 📘 useChairmanData.ts
│   │   ├── 📘 useChairmanFeedbackService.ts
│   │   ├── 📘 useCollaboration.ts
│   │   ├── 📘 useCompetitiveIntelligence.ts
│   │   ├── 📘 useComprehensivePlanning.ts
│   │   ├── 📘 useContextLoading.ts
│   │   ├── 📘 useContinuousFeedbackLoops.ts
│   │   ├── 📘 useCreativeMediaAutomation.ts
│   │   ├── 📘 useDevelopmentExcellence.ts
│   │   ├── 📘 useDevelopmentPreparation.ts
│   │   ├── 📘 useDocumentationSync.ts
│   │   ├── ⚛️ useExecutiveData.tsx
│   │   ├── 📘 useExitReadiness.ts
│   │   ├── 📘 useFinalPolish.ts
│   │   ├── 📘 useFocusManagement.ts
│   │   ├── ⚛️ useGlobalSearch.tsx
│   │   ├── 📘 useGovernanceData.ts
│   │   ├── 📘 useGTMStrategy.ts
│   │   ├── 📘 useIdeasService.ts
│   │   ├── 📘 useIntegrationVerification.ts
│   │   ├── 📘 useIterativeDevelopmentLoop.ts
│   │   ├── 📘 useKeyboardNavigation.ts
│   │   ├── 📘 useKnowledgeManagement.ts
│   │   ├── 📘 useLiveWorkflowProgress.ts
│   │   ├── 📘 useMonitoringData.ts
│   │   ├── 📘 useMultiVentureCoordination.ts
│   │   ├── 📘 useMVPEngineIteration.ts
│   │   ├── 📘 useMVPLaunch.ts
│   │   ├── ⚛️ useNavigationCounts.tsx
│   │   ├── 📘 useNotificationActions.ts
│   │   ├── 📘 useNotifications.ts
│   │   ├── 📘 useOrchestrationData.ts
│   │   ├── 📘 useParallelExploration.ts
│   │   ├── 📘 usePerformanceData.ts
│   │   ├── 📘 usePersonalization.ts
│   │   ├── 📘 usePreFlightCheck.ts
│   │   ├── 📘 usePricingStrategy.ts
│   │   ├── 📘 useProblemDecomposition.ts
│   │   ├── 📘 useProductionDeployment.ts
│   │   ├── 📘 useProfitabilityForecasting.ts
│   │   ├── 📘 useQualityAssuranceStage.ts
│   │   ├── 📘 useRealTimeVentures.ts
│   │   ├── 📘 useRiskEvaluation.ts
│   │   ├── 📘 useScreenReader.ts
│   │   ├── 📘 useSecurityCompliance.ts
│   │   ├── 📘 useSecurityData.ts
│   │   ├── 📘 useStrategicNaming.ts
│   │   ├── 📘 useTechnicalReview.ts
│   │   ├── 📘 useTimingOptimization.ts
│   │   ├── 📘 useUnifiedNotifications.ts
│   │   ├── 📘 useUrlFilters.ts
│   │   ├── ⚛️ useUserJourneyData.tsx
│   │   ├── 📘 useVentureData.ts
│   │   ├── 📘 useVentures.ts
│   │   ├── 📘 useWorkflowData.ts
│   │   ├── 📘 useWorkflowExecution.ts
│   │   └── 📘 useWorkflowPersistence.ts
│   ├── 📁 integrations/
│   │   └── 📁 supabase/
│   │       ├── 📘 client.ts
│   │       └── 📘 types.ts
│   ├── 📁 lib/
│   │   ├── 📁 ai/
│   │   │   ├── 📘 ai-analytics-engine.ts
│   │   │   ├── 📘 ai-database-service.ts
│   │   │   ├── 📘 ai-integration-service.ts
│   │   │   └── 📘 ai-service-manager.ts
│   │   ├── 📁 analytics/
│   │   │   ├── 📘 export-engine.ts
│   │   │   └── 📘 predictive-engine.ts
│   │   ├── 📁 api/
│   │   │   └── 📘 rate-limiter-client.ts
│   │   ├── 📁 i18n/
│   │   │   └── 📘 voice-internationalization.ts
│   │   ├── 📁 integration/
│   │   │   ├── 📘 api-gateway.ts
│   │   │   ├── 📘 generic-rest-connector.ts
│   │   │   └── 📘 integration-service.ts
│   │   ├── 📁 security/
│   │   │   ├── 📘 ai-security-monitor.ts
│   │   │   └── 📘 behavioral-auth.ts
│   │   ├── 📁 services/
│   │   │   ├── 📘 knowledgeManagementService.ts
│   │   │   ├── 📘 multiVentureCoordinationService.ts
│   │   │   ├── 📘 parallelExplorationService.ts
│   │   │   └── 📘 timingOptimizationService.ts
│   │   ├── 📁 voice/
│   │   │   ├── 📘 function-definitions.ts
│   │   │   └── 📘 real-time-voice-service.ts
│   │   ├── 📁 workflow/
│   │   │   ├── 📘 prd-mapper.ts
│   │   │   ├── 📘 workflow-configuration.ts
│   │   │   └── 📘 workflow-loader.ts
│   │   └── 📘 utils.ts
│   ├── 📁 middleware/
│   │   └── 📘 api-rate-limiter.ts
│   ├── 📁 pages/
│   │   ├── 📁 __tests__/
│   │   ├── ⚛️ Agents.tsx
│   │   ├── ⚛️ ai-ceo-agent.tsx
│   │   ├── ⚛️ AIAgentsPage.tsx
│   │   ├── ⚛️ analytics.tsx
│   │   ├── ⚛️ AnalyticsDashboard.tsx
│   │   ├── ⚛️ BusinessAgentsPage.tsx
│   │   ├── ⚛️ competitive-intelligence.tsx
│   │   ├── ⚛️ creative-media-automation.tsx
│   │   ├── ⚛️ development.tsx
│   │   ├── ⚛️ DevelopmentWorkflow.tsx
│   │   ├── ⚛️ EVAAssistantPage.tsx
│   │   ├── ⚛️ EvaOrchestrationDashboard.tsx
│   │   ├── ⚛️ feedback-loops.tsx
│   │   ├── ⚛️ gap-analysis.tsx
│   │   ├── ⚛️ Governance.tsx
│   │   ├── ⚛️ gtm-strategist.tsx
│   │   ├── ⚛️ Index.tsx
│   │   ├── ⚛️ Insights.tsx
│   │   ├── ⚛️ LandingPage.tsx
│   │   ├── ⚛️ LiveWorkflowProgress.tsx
│   │   ├── ⚛️ LoginPage.tsx
│   │   ├── ⚛️ mobile-companion-app.tsx
│   │   ├── ⚛️ naming.tsx
│   │   ├── ⚛️ NotFound.tsx
│   │   ├── ⚛️ Notifications.tsx
│   │   ├── ⚛️ NotificationsAndCollaboration.tsx
│   │   ├── ⚛️ orchestration.tsx
│   │   ├── ⚛️ Phase2TestExecution.tsx
│   │   ├── ⚛️ Phase2Testing.tsx
│   │   ├── ⚛️ Phase2TestingDashboard.tsx
│   │   ├── ⚛️ Portfolios.tsx
│   │   ├── ⚛️ PortfoliosPage.tsx
│   │   ├── ⚛️ quality-assurance.tsx
│   │   ├── ⚛️ Reports.tsx
│   │   ├── ⚛️ RiskForecastingDashboard.tsx
│   │   ├── ⚛️ settings.tsx
│   │   ├── ⚛️ TeamPage.tsx
│   │   ├── ⚛️ TestingQA.tsx
│   │   ├── ⚛️ VentureDetail.tsx
│   │   ├── ⚛️ VentureDetailEnhanced.tsx
│   │   ├── ⚛️ Ventures.tsx
│   │   ├── ⚛️ VenturesPage.tsx
│   │   └── ⚛️ Workflows.tsx
│   ├── 📁 services/
│   │   ├── 📁 __tests__/
│   │   ├── 📁 analytics/
│   │   │   └── 📘 AnalyticsEngine.ts
│   │   ├── 📁 competitive-intelligence/
│   │   │   └── 📘 AICompetitiveResearchService.ts
│   │   ├── 📘 automationEngine.ts
│   │   ├── 📘 calibration.ts
│   │   ├── 📘 competitiveIntelligenceService.ts
│   │   ├── 📘 evaAdvanced.ts
│   │   ├── 📘 evaConversation.ts
│   │   ├── 📘 evaEnterprise.ts
│   │   ├── 📘 evaValidation.ts
│   │   ├── 📘 gtmIntelligence.ts
│   │   ├── 📘 validationFramework.ts
│   │   ├── 📘 ventures.ts
│   │   └── 📘 workflowExecutionService.ts
│   ├── 📁 styles/
│   │   └── 🎨 scrollbars.css
│   ├── 📁 types/
│   │   ├── 📘 agents.ts
│   │   ├── 📘 analytics.ts
│   │   ├── 📘 chairman.ts
│   │   ├── 📘 governance.ts
│   │   ├── 📘 ideas.ts
│   │   ├── 📘 liveProgress.ts
│   │   ├── 📘 notifications.ts
│   │   ├── 📘 orchestration.ts
│   │   ├── 📘 testing.ts
│   │   ├── 📘 venture.ts
│   │   ├── 📘 workflow.ts
│   │   ├── 📘 workflowExecution.ts
│   │   └── 📘 workflowStages.ts
│   ├── 📁 utils/
│   │   ├── 📘 calculateAttentionScore.ts
│   │   ├── 📘 calculateTriageCounts.ts
│   │   ├── 📘 openai-validation-test.ts
│   │   ├── 📘 phase2-test-runner.ts
│   │   └── 📘 urlFilters.ts
│   ├── 🎨 App.css
│   ├── ⚛️ App.tsx
│   ├── 🎨 index.css
│   ├── ⚛️ main.tsx
│   └── 📘 vite-env.d.ts
├── 📁 supabase/
│   ├── 📁 functions/
│   │   ├── 📁 adaptive-naming/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-ceo-agent/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-exit-decision-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-generate/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-knowledge-discovery/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-monitoring-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-orchestration-coordinator/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-performance-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-review/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-security-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 ai-testing-automation-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 competitive-intelligence/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 comprehensive-planning/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 comprehensive-validation/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 context-loading/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 data-lifecycle-manager/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 development-preparation/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 documentation-sync/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eleven-sign-url/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-chat/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-database-query/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-nlp-processor/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-orchestrator/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-realtime-session/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 eva-tts-chat/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 exit-readiness/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 gtm-strategy/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 health-monitor/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 integration-hub/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 integration-verification/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 openai-function-executor/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 openai-realtime-relay/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 openai-realtime-token/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 parallel-exploration-ai/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 pricing-strategy/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 problem-decomposition/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 profitability-forecasting/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 realtime-voice/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 risk-evaluation/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 risk-forecasting-engine/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 strategic-naming/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 technical-review/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 testing-orchestrator/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 timing-optimization/
│   │   │   └── 📘 index.ts
│   │   ├── 📁 voice-transcription/
│   │   │   └── 📘 index.ts
│   │   └── 📁 workflow-execution/
│   │       └── 📘 index.ts
│   ├── 📁 migrations/
│   │   ├── 🗄️ 20250828094259_8d7885bb-3d16-4518-8816-b804e0fe894b.sql
│   │   ├── 🗄️ 20250828095134_d205058b-0784-4891-ad32-543c822ce88e.sql
│   │   ├── 🗄️ 20250828095254_0083514c-1da9-4b46-8627-bee94aa67ea2.sql
│   │   ├── 🗄️ 20250828095417_9a87912b-1ac1-4919-aa88-de6e83ac2820.sql
│   │   ├── 🗄️ 20250828095718_646fdabe-d8a5-40cf-8c7d-3db72b1158a5.sql
│   │   ├── 🗄️ 20250828111443_3e6446f8-dea8-468d-b33c-23074bcf83ea.sql
│   │   ├── 🗄️ 20250828111525_60ddebd0-4489-46e9-822c-86c1b48acc88.sql
│   │   ├── 🗄️ 20250828155709_ae75aaf0-8073-4c0b-9fef-a11540a5b061.sql
│   │   ├── 🗄️ 20250828161004_f7d7beb9-17ed-4c49-890b-9ddb94c26901.sql
│   │   ├── 🗄️ 20250828172739_482313fa-09ac-4be0-9101-a2b60753ac5d.sql
│   │   ├── 🗄️ 20250828172806_85f77080-8990-495d-9ff5-b022dbd16f77.sql
│   │   ├── 🗄️ 20250828172922_b877beff-6c9e-4ebf-aef0-9a77431b0824.sql
│   │   ├── 🗄️ 20250828191610_e7a39b5f-e2dd-4bcc-b438-29de5cdcf72f.sql
│   │   ├── 🗄️ 20250828191913_72abc906-91f4-4464-8198-81c10b8c7168.sql
│   │   ├── 🗄️ 20250828193601_c1d78de1-0d47-4d2a-b876-a146731fd6ee.sql
│   │   ├── 🗄️ 20250828200256_0a891029-93a6-4274-8408-a281bb6a3d95.sql
│   │   ├── 🗄️ 20250828214615_d3f6231c-5b29-469b-be2a-9fd6718613cb.sql
│   │   ├── 🗄️ 20250828222538_9ebfa569-ef68-469c-807f-4be8c1250c38.sql
│   │   ├── 🗄️ 20250828224304_bc046d64-7758-4f6e-9ab8-66bc85448794.sql
│   │   ├── 🗄️ 20250828233654_ad68a67f-9a34-49fa-8571-9a1da51629a5.sql
│   │   ├── 🗄️ 20250828234818_c8a501cd-d532-473e-afd6-dee995fa8719.sql
│   │   ├── 🗄️ 20250828234924_43b786fb-8da4-4607-910c-8cb349496e3a.sql
│   │   ├── 🗄️ 20250829000247_866f55bc-62a6-47a1-a999-7f218c37b05b.sql
│   │   ├── 🗄️ 20250829002305_7813e66f-9bfe-40cf-88bd-9a21205d5a48.sql
│   │   ├── 🗄️ 20250829003957_99f8f779-d6b9-4283-81b3-1b64679dc4e0.sql
│   │   ├── 🗄️ 20250829005823_dc552347-ac5e-41d2-a240-ece77c698741.sql
│   │   ├── 🗄️ 20250829011205_7769ec3c-4a74-488b-ab44-39e0ffeb5586.sql
│   │   ├── 🗄️ 20250829021855_af736656-6733-4752-9561-c0a2bf418c9f.sql
│   │   ├── 🗄️ 20250829100257_b9a6238f-257e-42ff-b8e5-54cec003a197.sql
│   │   ├── 🗄️ 20250829101141_514c5607-05df-4b83-ac5c-496b24cc0a40.sql
│   │   ├── 🗄️ 20250829103906_5c0d671c-6e50-4dc7-8ff4-1f8027ea858b.sql
│   │   ├── 🗄️ 20250829104002_44794c58-11f5-49af-b581-7dc6e968ddd3.sql
│   │   ├── 🗄️ 20250829104209_030eeaec-dbcf-4105-9ac5-b3ddd991ad1b.sql
│   │   ├── 🗄️ 20250829104435_9a7d0454-907f-4360-bd6e-fc27b19641e9.sql
│   │   ├── 🗄️ 20250829104518_e380d248-dfc4-4cfa-bb69-0f0a1cc688fb.sql
│   │   ├── 🗄️ 20250829104539_1c46926f-1a6f-4b5d-83a4-d88555c5e033.sql
│   │   ├── 🗄️ 20250829104555_307a4dfa-9973-4dfe-99f3-e65d18fd8cb3.sql
│   │   ├── 🗄️ 20250829105148_68cc66e7-4255-43b6-b483-1a4a930e6842.sql
│   │   ├── 🗄️ 20250829105252_0e17478b-d8df-4f4f-91be-6bbdff61fd31.sql
│   │   ├── 🗄️ 20250829105316_0db63f24-d248-47dc-8995-fc9683d466b9.sql
│   │   ├── 🗄️ 20250829105343_9da73fcb-c8a4-43a6-ba53-9faad6d6bf19.sql
│   │   ├── 🗄️ 20250829110022_231c7d6c-7325-4477-8475-68738894716a.sql
│   │   ├── 🗄️ 20250829110104_4b3cba61-e841-44b0-a3e9-0b9848334dbb.sql
│   │   ├── 🗄️ 20250829110132_caa5f67b-f459-41de-ab2d-ed66fef808ea.sql
│   │   ├── 🗄️ 20250829110149_4a244419-1617-459a-9d0a-c6406c844708.sql
│   │   ├── 🗄️ 20250829110217_8be9f00c-4387-44a6-b6f5-d53d94d504c6.sql
│   │   ├── 🗄️ 20250829110902_1db8ebe7-a651-4724-b999-b6058cf7498f.sql
│   │   ├── 🗄️ 20250829112853_b8d1062c-a196-4711-96dc-9a8afb067ad6.sql
│   │   ├── 🗄️ 20250829113003_c25b4cd7-574d-41b5-ae0d-08cbb65fcc31.sql
│   │   ├── 🗄️ 20250829113143_1bb36a07-aa6e-4c50-b5d7-6c6e03b8b939.sql
│   │   ├── 🗄️ 20250829113205_7e5cb10c-4803-431c-9978-10daca5abd36.sql
│   │   ├── 🗄️ 20250829113329_c6801088-e989-489c-87b2-4d26f807d19a.sql
│   │   ├── 🗄️ 20250829113545_dbe51449-c959-4c60-a6e0-ec64aef9188f.sql
│   │   ├── 🗄️ 20250829121222_fea897db-7238-49b8-8499-6a9dbfbfec3f.sql
│   │   ├── 🗄️ 20250829122937_dd62e853-f1a9-4756-b340-4eb2b2a3f1e0.sql
│   │   ├── 🗄️ 20250829123022_f998ce5c-ecd5-4360-98ce-38167083d7a9.sql
│   │   ├── 🗄️ 20250829131052_66ef1ec8-42ad-4515-ae84-fa61f3004a98.sql
│   │   ├── 🗄️ 20250829132027_ea30fc27-9251-4c4a-8034-774ed67fc0b4.sql
│   │   ├── 🗄️ 20250829132050_176f7e63-a120-4f8d-b22a-3a86777a84a4.sql
│   │   ├── 🗄️ 20250829132109_0274aaf8-58f6-43ca-88e6-1ea1d5c6eb02.sql
│   │   ├── 🗄️ 20250829141742_aa4b2f60-7830-4ad8-a830-775e52b4e9e5.sql
│   │   ├── 🗄️ 20250829141817_80213681-e522-4478-8a9c-f442460ea19d.sql
│   │   ├── 🗄️ 20250829141852_e48ca6ea-d7bb-43ba-9c32-d75aab06fa4a.sql
│   │   ├── 🗄️ 20250829141937_31b66776-e970-4673-95ee-8abcdba5de19.sql
│   │   ├── 🗄️ 20250829142829_caf34e41-9690-4d00-a8b9-79e9cac19c68.sql
│   │   ├── 🗄️ 20250829144908_a4af3c6b-8fd4-4b0b-afa8-cc8510e1a19a.sql
│   │   ├── 🗄️ 20250829151332_b3dab31f-cd24-4df8-a428-f85a255004d4.sql
│   │   ├── 🗄️ 20250829152544_d247b2dc-eb80-4738-af70-078656c1080a.sql
│   │   ├── 🗄️ 20250829165049_4cd87d07-a700-4fd1-bb45-a2ca027bc012.sql
│   │   ├── 🗄️ 20250829181246_16ea8638-0d0d-4e86-85e3-c658ab6be9d0.sql
│   │   ├── 🗄️ 20250829205633_39032358-e8c8-4edb-a15a-84e1b3c4f2dc.sql
│   │   └── 🗄️ 20250829205749_830a92e7-2b94-4523-9a3b-bcfbeb729714.sql
│   └── 📄 config.toml
├── 📁 tests/
│   ├── 📁 a11y/
│   │   ├── 📘 governance.a11y.spec.ts
│   │   ├── 📘 onboarding.a11y.spec.ts
│   │   └── 📘 settings.a11y.spec.ts
│   ├── 📁 e2e/
│   │   ├── 📁 fixtures/
│   │   │   └── 📘 ventures.fixture.ts
│   │   ├── 📁 helpers/
│   │   │   ├── 📘 assertions.ts
│   │   │   └── 📘 navigation.ts
│   │   ├── 📁 utils/
│   │   │   ├── 📘 journey-simulator.ts
│   │   │   ├── 📘 test-data-generator.ts
│   │   │   └── 📘 test-report-generator.ts
│   │   ├── 📘 actual-content-analysis.spec.ts
│   │   ├── 📘 auth-check.spec.ts
│   │   ├── 📘 automation-learning.test.ts
│   │   ├── 📘 calibration.spec.ts
│   │   ├── 📘 check-current-state.spec.ts
│   │   ├── 📘 comprehensive-prd-validation.spec.ts
│   │   ├── 📘 correct-ehg-app-test.spec.ts
│   │   ├── 📘 data-flow.test.ts
│   │   ├── 📘 debug-console.spec.ts
│   │   ├── 📘 debug.spec.ts
│   │   ├── 📘 decisions.spec.ts
│   │   ├── 📘 detailed-navigation.spec.ts
│   │   ├── 📘 distribution.spec.ts
│   │   ├── 📘 ehg-login-and-navigation.spec.ts
│   │   ├── 📘 filters.spec.ts
│   │   ├── 📘 gap-closure-validation.spec.ts
│   │   ├── 📘 governance.spec.ts
│   │   ├── 📘 implementation-reality-check.spec.ts
│   │   ├── 📘 integration.test.ts
│   │   ├── 📘 manual-login-ehg.spec.ts
│   │   ├── 📘 manual-login-extended.spec.ts
│   │   ├── 📘 manual-login.spec.ts
│   │   ├── 📘 new-venture.spec.ts
│   │   ├── 📘 onboarding.spec.ts
│   │   ├── 📘 prd-audit-simple.spec.ts
│   │   ├── 📘 prd-audit.spec.ts
│   │   ├── 📘 prd-verified-features.spec.ts
│   │   ├── 📘 robust-ehg-login.spec.ts
│   │   ├── 📘 run-comprehensive-tests.ts
│   │   ├── 📄 run-tests-simple.cjs
│   │   ├── 📘 settings.spec.ts
│   │   ├── 📘 setup.ts
│   │   ├── 📘 special-logic.test.ts
│   │   ├── 📘 triage.spec.ts
│   │   ├── 📘 user-workflow-navigation.spec.ts
│   │   ├── 📘 user-workflow.spec.ts
│   │   ├── 📘 venture-lifecycle-complete.test.ts
│   │   ├── 📘 ventures-authenticated.spec.ts
│   │   ├── 📘 ventures-crud.spec.ts
│   │   ├── 📘 ventures-delete-fix.spec.ts
│   │   ├── 📘 ventures-enhancements.test.ts
│   │   ├── 📘 ventures-ui-wave7.spec.ts
│   │   ├── 📘 ventures.spec.ts
│   │   └── 📜 visual-qa-comprehensive.spec.js
│   ├── 📁 fixtures/
│   │   └── 📘 auth.ts
│   ├── 📁 integration/
│   │   └── 📁 api/
│   │       └── 📘 governance.test.ts
│   ├── 📁 performance/
│   │   └── 📘 load-testing.test.ts
│   ├── 📁 security/
│   │   └── 📘 security-validation.test.ts
│   ├── 📁 setup/
│   │   ├── 📘 auth-test.spec.ts
│   │   └── 📘 global-setup.ts
│   ├── 📁 unit/
│   │   ├── 📁 components/
│   │   │   ├── ⚛️ button.test.tsx
│   │   │   └── ⚛️ card.test.tsx
│   │   ├── 📁 hooks/
│   │   │   └── 📘 use-toast.test.ts
│   │   └── 📘 evaValidation.test.ts
│   ├── 📁 utils/
│   │   └── ⚛️ test-helpers.tsx
│   ├── 📁 visual/
│   │   └── 📘 shimmer-verification.spec.ts
│   ├── 📘 auth-test.spec.ts
│   ├── ⚛️ PortfoliosPage.test.tsx
│   ├── 📝 README.md
│   └── 📘 setup.ts
├── 📁 theme-evaluation-screenshots/
│   ├── 📄 dark-full-page.png
│   └── 📄 light-full-page.png
├── 📄 .cliodev-banner.txt
├── 📄 .dockerignore
├── 📄 .env
├── 📄 .gitignore
├── 📄 .prettierignore
├── 📄 .prettierrc
├── 📄 bun.lockb
├── 📝 chairman-console-assessment-prompt.md
├── 📄 check-tables.cjs
├── 📋 components.json
├── 📝 COMPREHENSIVE_TEST_FINDINGS.md
├── 📄 css-debug-screenshot.png
├── 📄 css-verification-screenshot.png
├── 📄 current-page-login.png
├── 📄 current-page-root.png
├── 📄 dashboard-state.png
├── 📜 debug-css-loading.js
├── 📄 debug-ventures-page.png
├── 📄 detailed-test-final.png
├── ⚙️ docker-compose.yml
├── 📄 Dockerfile
├── 📄 Dockerfile.dev
├── 📝 E2E_TEST_REPORT.md
├── 📄 ehg-authenticated-success.png
├── 📄 ehg-chairman-dashboard.png
├── 📄 ehg-manual-login-page.png
├── 📄 ehg-step1-initial.png
├── 📄 ehg-step2-authenticated.png
├── 📄 ehg-ventures-current-state.png
├── 📜 eslint.config.js
├── 📝 FINAL_DEPLOYMENT_CONFIRMATION.md
├── 📝 IMPLEMENTATION_SUMMARY.md
├── 🌐 index.html
├── 📜 jest.config.js
├── 📄 manual-testing-approach.png
├── 📝 navigation-framework-audit-report.md
├── 📋 package.json
├── 📘 playwright.config.ts
├── 📜 postcss.config.js
├── 📄 prd-audit-screenshot.png
├── 📄 prd-component-integration-status.png
├── 📄 prd-validation-authenticated.png
├── 📄 prd-validation-chairman-analysis.png
├── 📄 prd-validation-ventures-analysis.png
├── 📝 PRODUCTION_READINESS_REPORT.md
├── 📝 README.md
├── 📝 research-prompt.md
├── 📄 robust-login-initial.png
├── 📄 robust-login-success-method2.png
├── 📄 route-rootdashboard.png
├── 📄 route-roothome.png
├── 📄 route-rootventures.png
├── 📄 scrollbar-current-state.png
├── 📄 scrollbar-dark-forced.png
├── 📄 scrollbar-light-forced.png
├── 📜 setup-test-credentials.js
├── 🌐 shimmer-test.html
├── 📘 tailwind.config.ts
├── 🌐 test-colors.html
├── 📜 test-dark-mode.js
├── 📜 test-scrollbar-theme.js
├── 📜 test-scrollbar-visual.js
├── 📜 test-triage-cards-theme.js
├── 📜 test-visual-qa-framework.js
├── 📝 TESTING_REPORT_STAGES_1_20.md
├── 📝 TESTING_SETUP_GUIDE.md
├── 📝 THEME_VERIFICATION_SUMMARY.md
├── 📜 theme-deep-dive-evaluation.js
├── 📋 theme-evaluation-report.json
├── 📜 theme-evaluation-with-login.js
├── 📋 tsconfig.app.json
├── 📋 tsconfig.json
├── 📋 tsconfig.node.json
├── 📄 update-sd018.cjs
├── 📝 VENTURES_DEPLOYMENT_GUIDE.md
├── 📄 ventures-after-login.png
├── 📄 ventures-dark-mode.png
├── 📄 ventures-light-mode.png
├── 📄 ventures-reality.png
├── 📜 verify-css-tokens.js
├── 📜 verify-theme-changes.js
├── 📘 vite.config.ts
├── 📘 vitest.config.ts
├── 📄 workflow-debug-empty-app.png
├── 📄 workflow-step1-landing.png
├── 📄 workflow-step3-current-state.png
└── 📄 workflow-step4-ventures-final.png
```

---

## How to Use These Trees

### For EXEC Agent
1. **Before implementing**: Consult these trees to identify correct file paths
2. **Application routing**: Match PRD requirements to correct application
3. **Component location**: Find exact file paths using tree structure
4. **Verification**: Cross-reference `pwd` output with tree paths

### Critical Distinctions
- **EHG_Engineer**: Dashboard, protocol management (don't implement features here!)
- **EHG App**: All customer features go here

### Refresh Strategy
- **Auto-refresh**: Every 4 hours
- **Manual refresh**: `npm run context:refresh` or `node scripts/generate-file-trees.js --force`
- **Next refresh**: 9/29/2025, 11:07:16 PM

