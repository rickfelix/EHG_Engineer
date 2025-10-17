#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating PRD for SD-AGENT-ADMIN-001');
console.log('='.repeat(60));

const prdContent = {
  directive_id: 'SD-AGENT-ADMIN-001',
  title: 'Agent Engineering Department - Admin Tooling Suite',
  story_points: 115,
  priority: 'high',
  status: 'active',

  overview: `
# Product Requirements Document: Agent Engineering Department

## Executive Summary
The Agent Engineering Department admin tooling suite enables non-technical users to configure, manage, and optimize the 42-agent AI research platform without code changes. This comprehensive interface reduces agent configuration time from 30+ minutes (manual code edits) to <5 minutes (UI-based workflows) and provides data-driven optimization capabilities through A/B testing and performance monitoring.

## Business Context
With 42 specialized agents across 14 departments (completed in SD-AGENT-PLATFORM-001), the platform requires sophisticated admin tooling to:
1. Enable business users to configure agents without developer intervention
2. Provide visibility into agent performance across all departments
3. Support iterative optimization through prompt A/B testing
4. Establish reusable configuration patterns for common use cases
5. Customize search behavior per venture or user context

## Success Metrics
- **Configuration Time**: <5 minutes per agent (down from 30+ minutes)
- **User Adoption**: 80% of agent configurations done via UI (not code)
- **Performance Visibility**: 100% of agents monitored in real-time dashboard
- **A/B Test Velocity**: 5+ prompt tests per week per high-usage agent
- **Preset Reuse**: 60% of configurations use existing presets
`,

  strategic_alignment: `
## Alignment with Strategic Objectives

**SD-AGENT-PLATFORM-001**: This PRD builds on the 42-agent foundation delivered in Sprint 14.
**EVA/GTM Readiness**: Admin UI democratizes AI agent access for business teams.
**Stage 1 Priorities**: Performance monitoring enables data-driven optimization.

## Value Proposition
- **For Business Users**: Self-service agent configuration without engineering dependencies
- **For Engineering**: Reduced maintenance burden, focus on new capabilities
- **For Leadership**: Performance visibility and data-driven optimization
- **For Customers**: Faster iteration cycles, better agent performance
`,

  technical_overview: `
## Technical Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **UI Library**: Shadcn UI (consistency with existing EHG app)
- **State Management**: React Context API + Zustand for complex state
- **Data Fetching**: TanStack Query (React Query) for server state
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts (for Performance Dashboard)

### Backend
- **Database**: Existing PostgreSQL (Supabase)
- **Primary Table**: agent_configs (no new schema required)
- **API Layer**: Supabase client (direct from frontend)
- **Real-time**: Supabase subscriptions for performance monitoring
- **Authentication**: Existing Supabase Auth with RLS policies

### Key Design Principles
1. **Leverage Existing Infrastructure**: Reuse agent_configs table, no migrations
2. **Component Sizing**: Target 300-600 lines per component (learned from retrospectives)
3. **SIMPLICITY FIRST**: Use proven patterns, avoid premature optimization
4. **Progressive Enhancement**: Start with core features, add complexity only when needed
`,

  subsystem_1_preset_management: `
## Subsystem 1: Preset Management System
**Story Points**: 20-25 | **Priority**: HIGH | **Sprint**: 1-2

### Overview
Enable users to save, load, and share agent configuration presets for common use cases. Reduces repeated configuration by providing templates for standard scenarios (e.g., "Competitive Analysis", "Market Sizing", "Technical Feasibility").

### User Stories (US-1 through US-5)
**US-1**: As a business analyst, I want to save my frequently-used agent configurations as presets so that I don't have to reconfigure agents for similar ventures.
- **AC-1.1**: Save button visible after configuring any agent
- **AC-1.2**: Preset naming modal with description field
- **AC-1.3**: Preset saved to database with user_id, agent_key, configuration JSON
- **AC-1.4**: Success notification with "Load Preset" quick action

**US-2**: As a team lead, I want to browse available presets so that I can use team-validated configurations.
- **AC-2.1**: Preset library accessible from agent configuration page
- **AC-2.2**: Grid/list view with preset name, description, creator, usage count
- **AC-2.3**: Filter by agent type (e.g., "All Market Sizing Presets")
- **AC-2.4**: Search by name or description

**US-3**: As a user, I want to load a preset to quickly configure an agent.
- **AC-3.1**: "Load Preset" button in configuration panel
- **AC-3.2**: Preset selection modal with preview
- **AC-3.3**: One-click apply populates all configuration fields
- **AC-3.4**: Ability to modify preset values before saving

**US-4**: As a preset creator, I want to see who's using my presets so that I know which ones are valuable.
- **AC-4.1**: Usage analytics per preset (view count, apply count)
- **AC-4.2**: User feedback mechanism (thumbs up/down)
- **AC-4.3**: Last used timestamp

**US-5**: As an admin, I want to mark presets as "official" so that team members use vetted configurations.
- **AC-5.1**: Admin toggle for "official" status
- **AC-5.2**: Official presets appear at top of list
- **AC-5.3**: Badge/indicator for official presets

### Technical Specifications
**Database Schema** (extends existing agent_configs):
\`\`\`sql
-- No new table required - store as metadata in agent_configs
-- Structure:
{
  "preset_name": "Competitive Analysis - Tech Startups",
  "preset_description": "Analyze competitors in B2B SaaS space",
  "is_official": false,
  "created_by": "user_uuid",
  "usage_count": 12,
  "last_used": "2025-01-15T10:30:00Z",
  "configuration": {
    "temperature": 0.7,
    "max_tokens": 2000,
    "prompt_template_id": "competitive-analysis-v2"
  }
}
\`\`\`

**React Components**:
1. **PresetManager.tsx** (~400 lines)
   - Main container component
   - Tabs: "My Presets" | "Team Presets" | "Official Presets"
   - CRUD operations for presets

2. **PresetCard.tsx** (~150 lines)
   - Display preset details (name, description, usage stats)
   - Load/Edit/Delete actions
   - Official badge rendering

3. **PresetModal.tsx** (~250 lines)
   - Create/Edit preset form
   - Zod validation schema
   - React Hook Form integration

**API Operations**:
- GET /api/presets?agent_key={key} - List presets for agent
- POST /api/presets - Create new preset
- PUT /api/presets/:id - Update preset
- DELETE /api/presets/:id - Delete preset
- POST /api/presets/:id/apply - Increment usage count

### Acceptance Criteria (Subsystem-Level)
✅ Users can save agent configurations as named presets
✅ Presets load instantly (<500ms) when selected
✅ Usage analytics track preset adoption
✅ Official presets distinguished from user-created
✅ Preset library supports 100+ presets without performance degradation

### Test Plan
**Smoke Tests** (3 tests):
1. **Create Preset**: Save configuration, verify database insertion
2. **Load Preset**: Apply preset, verify fields populated correctly
3. **Delete Preset**: Remove preset, verify removal from list

**E2E Tests** (deferred to post-MVP):
- Cross-user preset sharing workflow
- Official preset promotion workflow
- Preset usage analytics accuracy
`,

  subsystem_2_prompt_library: `
## Subsystem 2: Prompt Library Admin UI with A/B Testing
**Story Points**: 30-35 | **Priority**: CRITICAL | **Sprint**: 3-5

### Overview
Centralized management of all prompt templates used by 42 agents, with A/B testing capabilities to optimize prompt performance through data-driven iteration.

### User Stories (US-6 through US-11)
**US-6**: As a prompt engineer, I want to view all prompts used by agents so that I can audit and improve them.
- **AC-6.1**: Prompt library lists all prompts with agent association
- **AC-6.2**: Grouping by department (Technical, Marketing, Finance, etc.)
- **AC-6.3**: Search by prompt name or content
- **AC-6.4**: Filter by agent, department, or status (active/archived)

**US-7**: As a prompt engineer, I want to edit prompts without touching code so that I can iterate quickly.
- **AC-7.1**: Inline editing or modal-based prompt editor
- **AC-7.2**: Syntax highlighting for prompt variables ({{venture_name}}, etc.)
- **AC-7.3**: Version history (last 10 versions saved)
- **AC-7.4**: Preview with sample data before saving

**US-8**: As a prompt engineer, I want to create A/B tests for prompts so that I can validate improvements.
- **AC-8.1**: "Create A/B Test" button on any prompt
- **AC-8.2**: Side-by-side editor for variant A vs variant B
- **AC-8.3**: Test configuration: traffic split (50/50 or custom), success metric selection
- **AC-8.4**: Start/Stop test controls

**US-9**: As a product manager, I want to see A/B test results so that I know which prompts perform better.
- **AC-9.1**: Test results dashboard showing:
  - **Performance**: Response quality score (1-10)
  - **Latency**: Average response time per variant
  - **Cost**: Token usage per variant
  - **Statistical Significance**: P-value, confidence interval
- **AC-9.2**: Winner declaration when significance threshold met (p < 0.05)
- **AC-9.3**: One-click promote winner to production

**US-10**: As a prompt engineer, I want to version prompts so that I can roll back if needed.
- **AC-10.1**: Version history sidebar (similar to Git log)
- **AC-10.2**: Diff view between versions
- **AC-10.3**: One-click rollback to any version
- **AC-10.4**: Version tagging (e.g., "v2-improved-specificity")

**US-11**: As an agent admin, I want to see which prompts are used by which agents so that I understand dependencies.
- **AC-11.1**: Prompt detail view shows "Used by X agents"
- **AC-11.2**: Click to see list of dependent agents
- **AC-11.3**: Warning before editing prompts with high usage

### Technical Specifications
**Database Schema** (new table: prompt_templates):
\`\`\`sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  variables JSONB, -- [{name: "venture_name", type: "string", required: true}]
  department TEXT,
  created_by UUID REFERENCES auth.users,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  status TEXT CHECK (status IN ('active', 'archived', 'testing')),
  metadata JSONB -- {usage_count: 42, avg_quality_score: 8.5}
);

CREATE TABLE prompt_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID REFERENCES prompt_templates,
  variant_a TEXT NOT NULL, -- Original prompt
  variant_b TEXT NOT NULL, -- Test variant
  traffic_split JSONB DEFAULT '{"a": 50, "b": 50}',
  metrics JSONB, -- {quality_a: [8,9,7], quality_b: [9,9,8], ...}
  status TEXT CHECK (status IN ('running', 'completed', 'stopped')),
  winner TEXT CHECK (winner IN (null, 'a', 'b', 'inconclusive')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
\`\`\`

**React Components**:
1. **PromptLibrary.tsx** (~500 lines)
   - Main library view with filtering/search
   - Grid/list toggle
   - Bulk operations (archive, export)

2. **PromptEditor.tsx** (~400 lines)
   - Code editor (Monaco or CodeMirror)
   - Variable highlighting and validation
   - Live preview panel

3. **ABTestManager.tsx** (~450 lines)
   - Test creation wizard
   - Side-by-side variant editor
   - Test status monitoring

4. **ABTestResults.tsx** (~350 lines)
   - Statistical analysis visualization (Recharts)
   - Winner recommendation
   - Detailed metrics breakdown

**API Operations**:
- GET /api/prompts - List all prompts
- GET /api/prompts/:id - Get prompt details
- POST /api/prompts - Create new prompt
- PUT /api/prompts/:id - Update prompt (creates new version)
- GET /api/prompts/:id/versions - Version history
- POST /api/prompts/:id/ab-test - Create A/B test
- GET /api/ab-tests/:id/results - Test results

### Acceptance Criteria (Subsystem-Level)
✅ Prompt library displays 100+ prompts without performance issues
✅ A/B tests support 1000+ iterations for statistical significance
✅ Version history preserved for 12 months minimum
✅ Rollback completes in <2 seconds
✅ Test results update in real-time (WebSocket or polling)

### Test Plan
**Smoke Tests** (5 tests):
1. **Create Prompt**: Add new prompt, verify database insertion
2. **Edit Prompt**: Update prompt, verify new version created
3. **Create A/B Test**: Start test, verify traffic split works
4. **View Results**: Check test metrics calculation
5. **Promote Winner**: Winner promotion updates production prompt

**Integration Tests**:
- A/B test statistical significance calculation
- Version diff algorithm accuracy
- Concurrent edits conflict resolution
`,

  subsystem_3_agent_settings: `
## Subsystem 3: Agent Settings Panel
**Story Points**: 15-20 | **Priority**: HIGH | **Sprint**: 6-7

### Overview
Unified configuration interface for all agent parameters (temperature, max_tokens, timeout, tools enabled, etc.). Provides validation, defaults, and reset capabilities.

### User Stories (US-12 through US-15)
**US-12**: As a user, I want to configure agent parameters via UI so that I don't need to edit code.
- **AC-12.1**: Settings panel accessible from agent detail page
- **AC-12.2**: Form fields for all configurable parameters:
  - Temperature (0.0 - 1.0 slider)
  - Max Tokens (input with validation)
  - Timeout (seconds)
  - Tools Enabled (multi-select checkboxes)
  - Verbosity (toggle)
  - Allow Delegation (toggle)
  - Cache Enabled (toggle)
- **AC-12.3**: Real-time validation with error messages
- **AC-12.4**: Save button with confirmation

**US-13**: As a user, I want to see parameter descriptions so that I understand what each setting does.
- **AC-13.1**: Tooltip on hover for each parameter
- **AC-13.2**: Help modal with detailed explanations
- **AC-13.3**: Example values for guidance

**US-14**: As a user, I want to reset to default settings so that I can recover from misconfiguration.
- **AC-14.1**: "Reset to Defaults" button
- **AC-14.2**: Confirmation modal before reset
- **AC-14.3**: Defaults loaded from agent definition

**US-15**: As an admin, I want to set system-wide defaults so that all new agent instances use vetted configurations.
- **AC-15.1**: Global defaults configuration page (admin only)
- **AC-15.2**: Per-department default overrides
- **AC-15.3**: Defaults cascade: System → Department → Agent → User

### Technical Specifications
**Database Schema** (extends agent_configs):
\`\`\`sql
-- Store in existing agent_configs table:
{
  "agent_key": "market_sizing_agent",
  "user_id": "uuid",
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 2000,
    "timeout_seconds": 30,
    "tools_enabled": ["web_search", "calculator"],
    "verbose": true,
    "allow_delegation": false,
    "cache_enabled": true
  },
  "is_default": false,
  "last_updated": "2025-01-15T10:30:00Z"
}
\`\`\`

**React Components**:
1. **AgentSettingsPanel.tsx** (~400 lines)
   - Form layout with sections (Model, Execution, Tools)
   - React Hook Form + Zod validation
   - Save/Reset/Cancel actions

2. **ParameterField.tsx** (~150 lines)
   - Reusable field component with tooltip
   - Type-specific inputs (slider, checkbox, multi-select)
   - Validation error display

3. **DefaultsManager.tsx** (~300 lines) - Admin only
   - System-wide defaults editor
   - Department override configuration
   - Preview mode showing effective defaults

**API Operations**:
- GET /api/agents/:key/settings - Get current settings
- PUT /api/agents/:key/settings - Update settings
- POST /api/agents/:key/settings/reset - Reset to defaults
- GET /api/settings/defaults - Get system defaults (admin)
- PUT /api/settings/defaults - Update defaults (admin)

### Acceptance Criteria (Subsystem-Level)
✅ Settings save within 1 second
✅ Validation prevents invalid configurations
✅ Defaults cascade correctly (System → Dept → Agent → User)
✅ Reset restores all parameters correctly
✅ Parameter changes reflected in next agent execution

### Test Plan
**Smoke Tests** (3 tests):
1. **Update Settings**: Change parameters, save, verify persistence
2. **Validation**: Submit invalid values, verify error messages
3. **Reset**: Reset to defaults, verify correct values loaded
`,

  subsystem_4_search_preferences: `
## Subsystem 4: Search Preference Engine
**Story Points**: 15-20 | **Priority**: MEDIUM | **Sprint**: 7-8

### Overview
Customize search behavior for agents that use web search tools. Configure search providers, result count, geographic focus, and content filtering per use case.

### User Stories (US-16 through US-18)
**US-16**: As a user, I want to configure search preferences so that agents find more relevant information.
- **AC-16.1**: Search preferences panel in agent settings
- **AC-16.2**: Configurable parameters:
  - Search Providers (Serper, Exa, Brave, etc.)
  - Max Results (1-50)
  - Geographic Focus (US, EU, Global)
  - Date Range (any, past year, past month, custom)
  - Content Types (articles, PDFs, videos)
  - Domain Allowlist/Blocklist
- **AC-16.3**: Preview search results with current settings

**US-17**: As a researcher, I want to save search preferences as profiles so that I can reuse them across ventures.
- **AC-17.1**: "Save as Profile" button
- **AC-17.2**: Profile naming and description
- **AC-17.3**: Profile library with load/edit/delete

**US-18**: As an admin, I want to set default search preferences per agent type so that specialized agents use appropriate sources.
- **AC-18.1**: Default profiles per agent (e.g., Market Sizing uses financial data sources)
- **AC-18.2**: Override user preferences with admin-locked settings
- **AC-18.3**: Audit log of preference changes

### Technical Specifications
**Database Schema** (new table: search_preferences):
\`\`\`sql
CREATE TABLE search_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users,
  agent_key TEXT,
  preferences JSONB NOT NULL, -- {providers: [], max_results: 10, ...}
  is_default BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false, -- Admin-only override
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

**React Components**:
1. **SearchPreferencesPanel.tsx** (~350 lines)
   - Form for all search parameters
   - Provider selection with logos
   - Domain allowlist/blocklist editor

2. **SearchPreviewModal.tsx** (~250 lines)
   - Live search preview with current settings
   - Results display (title, URL, snippet)
   - "Apply These Settings" confirmation

3. **SearchProfileManager.tsx** (~200 lines)
   - Profile library
   - CRUD operations
   - Default profile indicator

**API Operations**:
- GET /api/search-preferences?agent_key={key} - Get preferences
- POST /api/search-preferences - Create profile
- PUT /api/search-preferences/:id - Update profile
- DELETE /api/search-preferences/:id - Delete profile
- POST /api/search-preferences/preview - Test search with settings

### Acceptance Criteria (Subsystem-Level)
✅ Search preferences apply to next agent execution
✅ Preview returns results within 3 seconds
✅ Allowlist/blocklist support 100+ domains
✅ Profiles load instantly
✅ Admin-locked preferences cannot be overridden

### Test Plan
**Smoke Tests** (3 tests):
1. **Create Profile**: Save preferences, verify database insertion
2. **Preview Search**: Execute preview, verify results match settings
3. **Apply Profile**: Load profile, verify agent uses correct settings
`,

  subsystem_5_performance_dashboard: `
## Subsystem 5: Performance Monitoring Dashboard
**Story Points**: 25-30 | **Priority**: HIGH | **Sprint**: 8-10

### Overview
Real-time visibility into agent performance across all 42 agents. Track execution metrics (latency, token usage, success rate), identify bottlenecks, and support data-driven optimization.

### User Stories (US-19 through US-23)
**US-19**: As a platform admin, I want to see all agent metrics in one dashboard so that I can monitor system health.
- **AC-19.1**: Dashboard displays:
  - **Total Executions**: Last 24h, 7d, 30d
  - **Average Latency**: Per agent, per department
  - **Token Usage**: Total cost, per agent
  - **Success Rate**: % successful executions
  - **Error Rate**: Categorized errors (timeout, validation, API)
- **AC-19.2**: Filterable by date range, department, agent
- **AC-19.3**: Auto-refresh every 30 seconds

**US-20**: As a user, I want to see performance trends over time so that I can identify degradation.
- **AC-20.1**: Time series charts (Recharts LineChart):
  - Latency trend (7 days, 30 days)
  - Token usage trend
  - Success rate trend
- **AC-20.2**: Anomaly highlighting (outliers in red)
- **AC-20.3**: Drill-down to specific agent execution details

**US-21**: As a product manager, I want to compare agent performance so that I know which agents need optimization.
- **AC-21.1**: Agent comparison table:
  - Sortable columns (latency, cost, success rate)
  - Color-coded performance indicators (green/yellow/red)
  - Sparkline charts per agent
- **AC-21.2**: Export to CSV for analysis

**US-22**: As a developer, I want to see error details so that I can debug failures.
- **AC-22.1**: Error log table with:
  - Timestamp, Agent, Error Type, Message
  - Stack trace (expandable)
  - Execution context (input parameters)
- **AC-22.2**: Filter by error type
- **AC-22.3**: Search by error message

**US-23**: As an admin, I want to set performance alerts so that I'm notified of issues.
- **AC-23.1**: Alert configuration UI:
  - Trigger conditions (latency > 10s, error rate > 5%, token usage > budget)
  - Notification channels (email, Slack webhook)
  - Alert frequency (immediate, hourly digest)
- **AC-23.2**: Alert history log
- **AC-23.3**: Snooze/disable alerts temporarily

### Technical Specifications
**Database Schema** (new table: agent_executions):
\`\`\`sql
CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  department TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  latency_ms INTEGER,
  token_count INTEGER,
  cost_usd DECIMAL(10, 4),
  status TEXT CHECK (status IN ('success', 'error', 'timeout')),
  error_message TEXT,
  input_params JSONB,
  output_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_executions_agent_key ON agent_executions(agent_key);
CREATE INDEX idx_agent_executions_started_at ON agent_executions(started_at DESC);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);

CREATE TABLE performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  condition JSONB NOT NULL, -- {metric: "latency", threshold: 10000, operator: ">"}
  notification_channel JSONB, -- {type: "email", recipients: [...]}
  enabled BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
\`\`\`

**React Components**:
1. **PerformanceDashboard.tsx** (~600 lines)
   - Main dashboard layout
   - Metric cards (executions, latency, cost, success rate)
   - Time series charts (Recharts)
   - Agent comparison table

2. **MetricCard.tsx** (~100 lines)
   - Reusable card for key metrics
   - Trend indicator (↑↓)
   - Sparkline mini-chart

3. **PerformanceChart.tsx** (~250 lines)
   - Line chart for time series data
   - Tooltip with detailed breakdown
   - Zoom/pan controls (Recharts Brush)

4. **ErrorLog.tsx** (~300 lines)
   - Error table with filtering
   - Expandable rows for stack trace
   - Search functionality

5. **AlertManager.tsx** (~350 lines)
   - Alert configuration form
   - Alert history table
   - Enable/disable toggles

**API Operations**:
- GET /api/performance/summary - Overall metrics
- GET /api/performance/trends?period=7d - Time series data
- GET /api/performance/agents - Per-agent comparison
- GET /api/performance/errors?limit=100 - Error log
- POST /api/performance/alerts - Create alert
- GET /api/performance/alerts - List alerts
- PUT /api/performance/alerts/:id - Update alert

**Real-time Updates**:
- WebSocket connection for live metric updates
- Supabase subscriptions on agent_executions table
- Fallback to polling every 30 seconds

### Acceptance Criteria (Subsystem-Level)
✅ Dashboard loads within 2 seconds
✅ Real-time updates reflect within 5 seconds of agent execution
✅ Charts support 10,000+ data points without lag
✅ Error log searchable across 100,000+ records
✅ Alerts trigger within 60 seconds of condition met

### Test Plan
**Smoke Tests** (4 tests):
1. **Dashboard Load**: Load dashboard, verify all metrics display
2. **Chart Rendering**: Render time series, verify data accuracy
3. **Error Filtering**: Filter errors by type, verify results
4. **Alert Creation**: Create alert, trigger condition, verify notification
`,

  cross_cutting_concerns: `
## Cross-Cutting Concerns

### Security & Authentication
- **RLS Policies**: All database tables have row-level security
- **Admin Roles**: admin_users table defines admin privileges
- **API Protection**: Supabase Auth middleware on all endpoints
- **Audit Logging**: All configuration changes logged with user_id, timestamp

### Performance Requirements
- **Page Load**: <2 seconds for all pages
- **API Response**: <500ms for 95th percentile
- **Real-time Updates**: <5 seconds latency
- **Concurrent Users**: Support 50+ simultaneous users

### Data Integrity
- **Validation**: Zod schemas for all form inputs
- **Transactions**: Use Supabase transactions for multi-table updates
- **Optimistic UI**: Update UI immediately, rollback on error
- **Conflict Resolution**: Last-write-wins for settings, version history for prompts

### Monitoring & Observability
- **Error Tracking**: Integrate Sentry or similar
- **Performance Monitoring**: Track Web Vitals (LCP, FID, CLS)
- **Analytics**: Posthog or Mixpanel for usage tracking
- **Logging**: Structured logs for all API calls

### Accessibility (A11y)
- **WCAG 2.1 AA Compliance**: All components accessible
- **Keyboard Navigation**: Full keyboard support
- **Screen Reader**: ARIA labels, semantic HTML
- **Color Contrast**: Minimum 4.5:1 ratio
`,

  testing_strategy: `
## Testing Strategy

### Test Pyramid
1. **Unit Tests** (50+ tests)
   - React component rendering
   - Utility functions (validation, formatting)
   - Hooks (custom React hooks)
   - Target: 70% code coverage

2. **Integration Tests** (20+ tests)
   - API integration (Supabase client)
   - Form submission flows
   - Real-time subscription handling
   - Target: Critical paths covered

3. **E2E Tests** (15+ tests) - Playwright
   - Complete user workflows
   - Cross-subsystem interactions
   - Admin vs. user role scenarios
   - Target: All user stories validated

4. **A11y Tests** (5+ tests)
   - Lighthouse CI integration
   - Axe DevTools automated scans
   - Manual screen reader testing
   - Target: WCAG 2.1 AA compliance

### Smoke Tests (Per Subsystem)
**Sprint completion criteria**: All smoke tests passing

**Subsystem 1 - Preset Management** (3 tests):
1. Create preset → Verify database insertion
2. Load preset → Verify field population
3. Delete preset → Verify removal

**Subsystem 2 - Prompt Library** (5 tests):
1. Create prompt → Verify database insertion
2. Edit prompt → Verify new version
3. Create A/B test → Verify traffic split
4. View results → Verify metrics calculation
5. Promote winner → Verify production update

**Subsystem 3 - Agent Settings** (3 tests):
1. Update settings → Verify persistence
2. Validation → Verify error messages
3. Reset → Verify defaults loaded

**Subsystem 4 - Search Preferences** (3 tests):
1. Create profile → Verify database insertion
2. Preview search → Verify results match settings
3. Apply profile → Verify agent uses settings

**Subsystem 5 - Performance Dashboard** (4 tests):
1. Dashboard load → Verify metrics display
2. Chart rendering → Verify data accuracy
3. Error filtering → Verify results
4. Alert creation → Verify notification

**Total Smoke Tests**: 18 tests (~30 minutes execution time)

### Test Infrastructure
- **Framework**: Vitest (unit/integration), Playwright (E2E)
- **Coverage**: nyc/istanbul
- **CI Integration**: GitHub Actions
- **Test Data**: Seed scripts for consistent test data
`,

  implementation_plan: `
## Implementation Plan

### Sprint Breakdown
**Sprint 1-2**: Subsystem 1 - Preset Management (20-25 points)
- Week 1: Database schema, API endpoints, basic CRUD
- Week 2: React components, presets library, usage analytics

**Sprint 3-5**: Subsystem 2 - Prompt Library with A/B Testing (30-35 points)
- Week 3: Prompt templates table, version history
- Week 4: Prompt editor, A/B test creation
- Week 5: Test results dashboard, statistical analysis

**Sprint 6-7**: Subsystem 3 - Agent Settings Panel (15-20 points)
- Week 6: Settings form, validation, defaults
- Week 7: Admin defaults manager, cascade logic

**Sprint 7-8**: Subsystem 4 - Search Preferences Engine (15-20 points)
- Week 7 (overlap): Search preferences schema
- Week 8: Preferences UI, search preview, profiles

**Sprint 8-10**: Subsystem 5 - Performance Monitoring Dashboard (25-30 points)
- Week 8 (overlap): agent_executions schema, data collection
- Week 9: Dashboard UI, charts, metric cards
- Week 10: Error log, alerts, real-time updates

### Parallel Development Opportunities
- Subsystem 3 & 4 can partially overlap (both use similar form patterns)
- Subsystem 5 data collection can start in Sprint 1 (background)
- Testing infrastructure setup in Sprint 1, used throughout

### Dependencies
- **Blocker**: SD-AGENT-PLATFORM-001 must be complete (✅ DONE)
- **Required**: Existing agent_configs table (✅ EXISTS)
- **Required**: Supabase Auth setup (✅ EXISTS)
- **Optional**: Monitoring tools (Sentry) - can be added later

### Risk Mitigation
- **Large Scope**: User confirmed - no reduction
- **A/B Testing Complexity**: Use proven statistical libraries (jStat)
- **Real-time Performance**: Supabase subscriptions well-documented
- **Component Reuse**: Shadcn UI provides 80% of components needed
`,

  success_criteria: `
## Success Criteria (Overall PRD)

### Must-Have (Sprint 1-10)
✅ All 5 subsystems delivered per specifications
✅ 18 smoke tests passing
✅ Database schema deployed to production
✅ RLS policies enforced on all tables
✅ Admin UI accessible at /admin/agents route
✅ Configuration changes reflected in agent behavior within 1 execution

### Should-Have (Post-MVP)
⚠️ Comprehensive E2E test coverage (15+ tests)
⚠️ Performance monitoring alerts functional
⚠️ A/B test statistical significance automated

### Could-Have (Future Sprints)
❌ Preset marketplace (sharing across organizations)
❌ Advanced analytics (cost optimization recommendations)
❌ Multi-language prompt support
❌ Workflow automation (trigger config changes based on metrics)

### KPIs (3 Months Post-Launch)
- **Adoption**: 80% of agent configurations via UI (not code)
- **Efficiency**: <5 minutes average configuration time
- **Performance**: 95% of pages load <2 seconds
- **Reliability**: <0.5% error rate on configuration saves
- **Optimization**: 10+ A/B tests completed, 3+ winners promoted
`
};

// Insert PRD into database
const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert([{
    directive_id: prdContent.directive_id,
    title: prdContent.title,
    story_points: prdContent.story_points,
    priority: prdContent.priority,
    status: prdContent.status,
    overview: prdContent.overview,
    technical_architecture: prdContent.technical_overview,
    success_criteria: prdContent.success_criteria,
    metadata: {
      subsystems: [
        {
          name: 'Preset Management System',
          story_points: '20-25',
          sprint: '1-2',
          user_stories: ['US-1', 'US-2', 'US-3', 'US-4', 'US-5'],
          content: prdContent.subsystem_1_preset_management
        },
        {
          name: 'Prompt Library Admin UI with A/B Testing',
          story_points: '30-35',
          sprint: '3-5',
          user_stories: ['US-6', 'US-7', 'US-8', 'US-9', 'US-10', 'US-11'],
          content: prdContent.subsystem_2_prompt_library
        },
        {
          name: 'Agent Settings Panel',
          story_points: '15-20',
          sprint: '6-7',
          user_stories: ['US-12', 'US-13', 'US-14', 'US-15'],
          content: prdContent.subsystem_3_agent_settings
        },
        {
          name: 'Search Preference Engine',
          story_points: '15-20',
          sprint: '7-8',
          user_stories: ['US-16', 'US-17', 'US-18'],
          content: prdContent.subsystem_4_search_preferences
        },
        {
          name: 'Performance Monitoring Dashboard',
          story_points: '25-30',
          sprint: '8-10',
          user_stories: ['US-19', 'US-20', 'US-21', 'US-22', 'US-23'],
          content: prdContent.subsystem_5_performance_dashboard
        }
      ],
      total_user_stories: 23,
      cross_cutting: prdContent.cross_cutting_concerns,
      testing: prdContent.testing_strategy,
      implementation: prdContent.implementation_plan,
      strategic_alignment: prdContent.strategic_alignment
    }
  }])
  .select();

if (error) {
  console.error('❌ Error inserting PRD:', error);
  process.exit(1);
}

console.log('✅ PRD Created Successfully');
console.log('\n📊 PRD Summary:');
console.log(`   PRD ID: ${data[0].id}`);
console.log(`   Title: ${prdContent.title}`);
console.log(`   Story Points: ${prdContent.story_points}`);
console.log(`   Total User Stories: 23 (US-1 through US-23)`);
console.log('\n🏗️ Subsystems:');
console.log('   1. Preset Management System (20-25 points) - Sprint 1-2');
console.log('   2. Prompt Library Admin UI (30-35 points) - Sprint 3-5');
console.log('   3. Agent Settings Panel (15-20 points) - Sprint 6-7');
console.log('   4. Search Preference Engine (15-20 points) - Sprint 7-8');
console.log('   5. Performance Dashboard (25-30 points) - Sprint 8-10');
console.log('\n' + '='.repeat(60));
console.log('🚀 Next: Engage Product Requirements Expert for User Stories');
console.log('='.repeat(60));
