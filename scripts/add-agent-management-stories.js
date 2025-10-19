#!/usr/bin/env node

/**
 * Add 8 new Agent Management user stories to SD-AGENT-ADMIN-001
 * US-012 through US-019: Comprehensive AI Agent Management Page
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-AGENT-ADMIN-001';

const newStories = [
  {
    story_key: `${SD_ID}:US-012`,
    title: 'Enhanced Agent List View with Search/Filter/Sort',
    user_role: 'administrator',
    user_want: 'to view, search, filter, and sort all AI agents in a comprehensive list view',
    user_benefit: 'quickly finding agents by name, status, department, or organization and taking quick actions',
    acceptance_criteria: [
      'Agent list table shows: name, role, status, organization/department, uptime, last activity',
      'Search bar filters agents by name or role (real-time)',
      'Filter dropdowns: status (active/idle/busy/error), department (11 departments), agent type (EVA/LEAD/PLAN/EXEC/AI_CEO)',
      'Sort columns: name, status, uptime, performance, cost (ascending/descending)',
      'Organization/department column displays agent\'s assigned department',
      'Quick action buttons per row: View Details, Enable/Disable, Restart',
      'Pagination with 25/50/100 rows per page options',
      'Total agent count and active agent count displayed',
      'Row click opens agent detail page',
      'Empty state when no agents match filters'
    ],
    technical_notes: 'Extend AIAgentsPage.tsx with Shadcn Table component, implement client-side filtering/sorting for <100 agents (or server-side for larger datasets), use existing agent type from ai_agents table, add department_id foreign key to ai_agents table linking to organizational_departments table, integrate with useAgents hook',
    story_points: 8,
    priority: 'critical',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-013`,
    title: 'Agent Detail Page with Tabs',
    user_role: 'administrator',
    user_want: 'to view comprehensive details about a specific agent with tabbed interface',
    user_benefit: 'understanding agent configuration, activity, performance, and version history in one place',
    acceptance_criteria: [
      'Overview tab: Agent summary card (name, role, status, uptime, last activity, organization)',
      'Tools tab: List of assigned tools with permissions (read/write/execute), cost limits, usage count',
      'Activity tab: Current task display + task history table (task name, status, duration, confidence, timestamp)',
      'Performance tab: Real-time charts (success rate over time, average response time, task completion trend, error rate), extends US-009',
      'Versions tab: Version history table (version number, deployed date, changes summary), rollback button',
      'Agent detail page accessible via /ai-agents/:agentId route',
      'Breadcrumb navigation: AI Agents > [Agent Name]',
      'Edit button opens agent configuration modal',
      'Delete button with confirmation dialog',
      'Back button returns to agent list'
    ],
    technical_notes: 'Create AgentDetailPage.tsx component, use Shadcn Tabs component, create sub-components: AgentOverviewTab, AgentToolsTab, AgentActivityTab (enhance existing AgentPerformanceTab), AgentVersionsTab, implement React Router route /ai-agents/:agentId, fetch agent data + related tools/tasks/versions via useAgentDetail custom hook',
    story_points: 13,
    priority: 'critical',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-014`,
    title: 'Agent Creation Wizard',
    user_role: 'administrator',
    user_want: 'to create new AI agents through a guided multi-step form',
    user_benefit: 'easily deploying new agents with proper configuration without missing required fields',
    acceptance_criteria: [
      'Step 1 - Define Role: Agent name, agent type dropdown (EVA/LEAD/PLAN/EXEC/AI_CEO), role description, goal definition, backstory (optional)',
      'Step 2 - Select Tools: Tool selection checkboxes with search, permission level per tool (read/write/execute), cost limit per tool slider',
      'Step 3 - Configure Settings: Auto-assignment toggle, max concurrent tasks, confidence threshold, working hours config, notification settings',
      'Step 4 - Review & Deploy: Summary of all selections, edit buttons to go back to specific steps, deploy button creates agent',
      'Wizard accessible via "+ New Agent" button on agent list page',
      'Form validation: required fields highlighted, invalid inputs show error messages',
      'Configuration presets available (e.g., "Standard EVA Setup", "High-Performance EXEC")',
      'Cancel button at any step with unsaved changes warning',
      'Success toast notification after deployment with link to agent detail page',
      'Loading state during agent creation API call'
    ],
    technical_notes: 'Create AgentCreationWizard.tsx component, use Shadcn Form + Stepper pattern, implement multi-step form state management (React Hook Form or Zustand), integrate with createAgent mutation from useAgents hook, POST /api/ai-agents endpoint, insert into ai_agents table with all configuration, auto-generate agent ID and initial version',
    story_points: 8,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-015`,
    title: 'Tools Management System',
    user_role: 'administrator',
    user_want: 'to manage the registry of all available tools that agents can use',
    user_benefit: 'maintaining a centralized catalog of tools with permissions, costs, and documentation',
    acceptance_criteria: [
      'Tools list page at /tools route showing all available tools',
      'Tool card displays: name, description, category, API endpoint, cost per call, rate limits',
      'Search and filter tools by category (Research/Communication/Data/Analytics/Execution)',
      'Create new tool button opens tool creation form',
      'Tool creation form: name, description, category, API endpoint, authentication type, cost per call, rate limit, documentation URL',
      'Edit tool button opens pre-filled form',
      'Delete tool button (only if no agents using it, otherwise show warning)',
      'Tool detail modal shows: full documentation, usage statistics (calls per day, total cost, agents using it)',
      'Shared tools vs agent-specific tools toggle',
      'Tool status indicator (active/deprecated/beta)',
      'Export tools catalog to JSON',
      'Import tools from JSON file'
    ],
    technical_notes: 'Create new tools table (tool_id, name, description, category, api_endpoint, auth_type, cost_per_call, rate_limit_per_minute, documentation_url, is_shared, status, created_at, updated_at), create ToolsPage.tsx component, create ToolCard and ToolForm components, implement CRUD API endpoints (/api/tools), link tools to agents via agent_tools junction table (agent_id, tool_id, permission_level, cost_limit, granted_at)',
    story_points: 8,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-016`,
    title: 'Role-Based Tool Assignment',
    user_role: 'administrator',
    user_want: 'to assign tools to agents based on their roles with specific permissions and limits',
    user_benefit: 'ensuring agents have appropriate tool access for their responsibilities while controlling costs',
    acceptance_criteria: [
      'Tool assignment interface in agent detail page Tools tab',
      'Add tool button opens tool selector modal with search',
      'Permission level dropdown per tool: Read Only, Write Access, Full Execute',
      'Cost limit per tool per day slider (in USD)',
      'Bulk assignment: Select multiple agents, assign same tools with same permissions',
      'Role templates: Pre-defined tool sets for each role (EVA gets orchestration tools, EXEC gets development tools)',
      'Usage tracking: Real-time display of tool calls made and costs incurred',
      'Remove tool button (with confirmation if tool was recently used)',
      'Tool access audit log: History of who granted/revoked access and when',
      'Warning if agent tries to use tool without permission',
      'Department-level templates: All agents in Marketing get marketing tools'
    ],
    technical_notes: 'Enhance agent_tools table with permission_level ENUM, daily_cost_limit DECIMAL, usage_count INTEGER, last_used_at TIMESTAMP, granted_by UUID, create ToolAssignmentModal component, implement POST /api/agents/:id/tools/:toolId endpoint, implement bulk assignment via POST /api/agents/bulk-assign-tools, create role_tool_templates table for predefined sets',
    story_points: 5,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-017`,
    title: 'Real-Time Activity Dashboard',
    user_role: 'administrator',
    user_want: 'to see real-time activity of all agents with live charts and metrics',
    user_benefit: 'monitoring agent performance, identifying issues quickly, and understanding resource utilization',
    acceptance_criteria: [
      'Activity dashboard at /ai-agents/activity route',
      'Live uptime chart (line chart, last 24 hours)',
      'Cost tracking chart (bar chart per hour, shows total cost across all agents)',
      'Success rate chart (area chart, % successful tasks over time)',
      'Task queue visualization (shows pending/in_progress/completed counts)',
      'Activity feed: Real-time list of "Agent X started task Y" events (auto-updates)',
      'Resource utilization metrics: Total API calls, total cost today, average response time',
      '"What\'s it working on now" section: Grid of active agents showing current task',
      'Agent status distribution pie chart (active/idle/busy/error counts)',
      'Refresh rate selector (5s/10s/30s/manual)',
      'Export dashboard data to CSV',
      'Date range selector for historical data',
      'Filter by department or agent type'
    ],
    technical_notes: 'Create ActivityDashboardPage.tsx component, use Recharts for LineChart/BarChart/AreaChart/PieChart, implement WebSocket connection or polling (every 5-10s) for live updates, query agent_tasks table for task queue, query agent_performance_logs for metrics, create activity_events table for feed (event_id, agent_id, event_type, description, timestamp), implement real-time subscriptions via Supabase Realtime',
    story_points: 8,
    priority: 'high',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-018`,
    title: 'Version Management System',
    user_role: 'administrator',
    user_want: 'to track agent versions, compare changes, and rollback to previous versions',
    user_benefit: 'maintaining version history for audit trails and safely reverting problematic updates',
    acceptance_criteria: [
      'Versions tab in agent detail page (US-013)',
      'Version history table: version number (e.g., v1.0.0), deployed date, deployed by, changes summary, status (current/previous)',
      'Version comparison view: Side-by-side diff of configuration changes between two versions',
      'Rollback button on previous versions (confirmation dialog, requires reason)',
      'Current version highlighted with badge',
      'Auto-versioning on configuration changes (semantic versioning: major.minor.patch)',
      'Change log automatically generated from configuration diff',
      'Version notes field (administrator can add manual notes)',
      'Filter versions by date range',
      'Export version history to JSON',
      'Rollback creates new version (doesn\'t delete history)'
    ],
    technical_notes: 'Create agent_versions table (version_id, agent_id, version_number, configuration_snapshot JSONB, changes_summary TEXT[], deployed_by UUID, deployed_at TIMESTAMP, status ENUM, notes TEXT), create AgentVersionsTab component, implement version comparison logic (JSON diff), implement rollback as INSERT new version with old configuration, auto-increment version on UPDATE to ai_agents.configuration',
    story_points: 5,
    priority: 'medium',
    status: 'ready'
  },
  {
    story_key: `${SD_ID}:US-019`,
    title: 'Organization Integration UI',
    user_role: 'administrator',
    user_want: 'to view and manage agent assignments to organizational departments and hierarchy',
    user_benefit: 'understanding which agents belong to which departments and how they coordinate',
    acceptance_criteria: [
      'Department assignment dropdown in agent creation wizard and agent edit form',
      'Organization column in agent list view showing department name',
      'Organizational hierarchy tree view at /ai-agents/organization route',
      'Tree view shows: CEO/COO at top, 11 departments below, agents nested under departments',
      'Click department to filter agent list by that department',
      'Reports_to relationship display in agent detail Overview tab',
      'Team coordination view: Visual diagram of agent interactions within department',
      'Department-level metrics: Total agents, active agents, average performance per department',
      'Drag-and-drop agent between departments (updates department_id)',
      'Hierarchy view collapsible/expandable nodes',
      'Search within hierarchy tree',
      'Export org chart to PNG or PDF'
    ],
    technical_notes: 'Create organizational_departments table (dept_id, company_id, name, parent_dept_id, vp_agent_id, description) if not exists, add department_id and reports_to foreign keys to ai_agents table, create OrganizationTreePage.tsx component using react-d3-tree or similar library, implement drag-and-drop with @dnd-kit, create AgentCoordinationView component showing department-level task flows',
    story_points: 5,
    priority: 'medium',
    status: 'ready'
  }
];

async function addAgentManagementStories() {
  console.log('🔄 Adding 8 new Agent Management user stories...');
  console.log('='.repeat(80));

  const storiesWithIds = newStories.map(story => ({
    ...story,
    id: randomUUID(),
    sd_id: SD_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  try {
    const { data, error } = await supabase
      .from('user_stories')
      .insert(storiesWithIds)
      .select();

    if (error) throw error;

    console.log(`✅ Successfully added ${data.length} new user stories!`);
    console.log('');

    data.forEach((story, i) => {
      console.log(`${i + 1}. ${story.story_key}: ${story.title}`);
      console.log(`   Points: ${story.story_points}, Priority: ${story.priority}`);
      console.log('');
    });

    const totalPoints = data.reduce((sum, s) => sum + s.story_points, 0);
    console.log('='.repeat(80));
    console.log(`📊 Total new story points: ${totalPoints}`);
    console.log('='.repeat(80));

    return data;
  } catch (error) {
    console.error('❌ Error adding user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  addAgentManagementStories();
}

export { addAgentManagementStories };
