import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRDData() {
  return {
  id: `PRD-SD-045-${randomUUID()}`,
  ...await createPRDLink('SD-045'),
  title: 'AI Research & Development Team Management Dashboard',
  executive_summary: `Create an AI Agent Management Dashboard in the EHG application to display and manage the company's AI R&D team (EVA, LEAD, PLAN, EXEC, and AI_CEO agents). This dashboard will provide visibility into AI agent status, performance metrics, current workload, and enable venture assignment capabilities.

**Business Value**: Unlock AI team management capability worth $150K-$200K with 92% effort reduction (8-12h vs 95h original estimate).

**Key Innovation**: Reuse existing TeamManagementInterface.tsx pattern (622 LOC) and agents.ts TypeScript interfaces (182 LOC) for 85-90% code reuse.`,

  status: 'draft',
  priority: 'high',
  category: 'Team & AI Management',
  phase: 'design',
  version: '1.0',

  functional_requirements: JSON.stringify([
    'Display 5 AI agents: EVA (Executive Virtual Assistant), LEAD (Strategic Leadership), PLAN (Technical Planning), EXEC (Implementation), AI_CEO (Chief Executive AI)',
    'Show real-time agent status with visual indicators: active (green), idle (gray), busy (yellow), error (red), maintenance (blue)',
    'Display performance metrics: tasks completed, tasks failed, success rate, average response time, uptime percentage',
    'Show current agent workload: assigned ventures count, current task details (if any), task queue depth',
    'Enable venture assignment: dropdown to assign/unassign agents to specific ventures',
    'Provide basic configuration: toggle auto-assignment on/off, set max concurrent tasks, adjust confidence threshold',
    'Display agent capabilities list for each agent type',
    'Show last activity timestamp and last 24-hour task summary',
    'Implement search/filter functionality by agent type, status, or assigned venture',
    'Provide tabs for: All Agents, Configuration, Activity Log'
  ]),

  non_functional_requirements: JSON.stringify([
    'Page load time: < 2 seconds',
    'Responsive design: works on desktop, tablet, and mobile',
    'Accessibility: WCAG 2.1 AA compliant',
    'Browser compatibility: Chrome, Firefox, Safari, Edge (latest 2 versions)',
    'Consistent with EHG design system (Shadcn UI components)',
    'Type-safe: Full TypeScript implementation with no any types'
  ]),

  technical_requirements: JSON.stringify([
    'Use existing agents.ts TypeScript interfaces (AIAgent, AgentTask, AgentPerformanceMetrics)',
    'Implement in ../ehg/src/pages/Agents.tsx (target application: EHG)',
    'Reuse UI patterns from TeamManagementInterface.tsx (card layout, tabs, badges)',
    'Use Shadcn UI components: Card, Badge, Tabs, Avatar, Select, Button, Dialog',
    'Mock data structure: Array of AIAgent objects matching agents.ts interface',
    'No database integration in MVP (use in-memory mock data)',
    'React hooks: useState for data, useEffect for initialization',
    'Icons from lucide-react: Bot, Activity, Zap, Settings, AlertCircle',
    'Routing: Verify /agents route exists in React Router configuration'
  ]),

  test_scenarios: JSON.stringify([
    'Page loads successfully and displays 5 AI agent cards',
    'Each agent card shows correct status badge with appropriate color',
    'Performance metrics display for each agent (tasks, success rate, uptime)',
    'Clicking on agent card expands to show detailed view with full metrics',
    'Venture assignment dropdown shows available ventures',
    'Selecting a venture assigns it to the agent and updates the display',
    'Status indicators update when mock data changes',
    'Search/filter by agent type returns correct results',
    'Tabs switch between All Agents, Configuration, and Activity Log',
    'Configuration panel allows toggling auto-assignment setting',
    'Responsive layout adapts to mobile viewport',
    'Activity log shows placeholder text for future implementation'
  ]),

  acceptance_criteria: JSON.stringify([
    'AC-001: Navigate to /agents in EHG app and page loads without errors',
    'AC-002: All 5 AI agents displayed in card format with names (EVA, LEAD, PLAN, EXEC, AI_CEO)',
    'AC-003: Each agent card shows status badge (active/idle/busy/error/maintenance) with correct color',
    'AC-004: Performance metrics visible: tasks completed, success rate (%), uptime (%)',
    'AC-005: Current workload displayed: assigned ventures count, current task (if any)',
    'AC-006: Venture assignment dropdown functional with at least 3 mock ventures',
    'AC-007: Configuration panel displays with auto-assignment toggle',
    'AC-008: All Agents tab shows full grid of agent cards',
    'AC-009: Configuration tab shows settings panel',
    'AC-010: Activity Log tab shows placeholder text',
    'AC-011: Search input filters agents by name or status',
    'AC-012: Page is responsive (tested at 320px, 768px, 1024px, 1920px widths)',
    'AC-013: No TypeScript errors in build output',
    'AC-014: Code follows existing patterns from TeamManagementInterface.tsx'
  ]),

  dependencies: JSON.stringify([
    'Existing TypeScript interfaces: ../ehg/src/types/agents.ts',
    'Existing UI pattern: ../ehg/src/components/team/TeamManagementInterface.tsx',
    'Shadcn UI library (already installed in EHG app)',
    'React Router configuration (verify /agents route)',
    'lucide-react icons library'
  ]),

  risks: JSON.stringify([
    {
      risk: 'Implementation in wrong application directory (EHG_Engineer instead of EHG)',
      severity: 'critical',
      mitigation: 'EXEC must verify pwd shows ../ehg before starting',
      probability: 'low'
    },
    {
      risk: 'Mock data structure doesn\'t match agents.ts interfaces',
      severity: 'medium',
      mitigation: 'Use TypeScript strict mode to catch type mismatches at compile time',
      probability: 'low'
    },
    {
      risk: 'UI pattern from TeamManagementInterface may not fit AI agents',
      severity: 'low',
      mitigation: 'Design Sub-Agent will review and recommend modifications',
      probability: 'low'
    },
    {
      risk: 'Dev server not restarted after changes',
      severity: 'medium',
      mitigation: 'Follow mandatory server restart protocol from CLAUDE.md',
      probability: 'medium'
    }
  ]),

  constraints: JSON.stringify([
    'Must use mock data (no database integration in MVP)',
    'Must implement in EHG app, NOT EHG_Engineer dashboard',
    'Must reuse existing UI patterns (no custom design system)',
    'Must complete in 8-12 hours total (all phases)',
    'Must achieve 85-90% code reuse target',
    'No new dependencies allowed (use existing libraries only)'
  ]),

  assumptions: JSON.stringify([
    'React Router already configured with /agents route',
    'Shadcn UI components are fully installed and working',
    'TypeScript configuration is strict mode enabled',
    'EHG dev server runs on port 5173 (Vite default)',
    'User has access to both ../ehg/ and ./',
    'TeamManagementInterface.tsx is a good reference pattern',
    'Mock data will be sufficient for MVP validation'
  ]),

  stakeholders: JSON.stringify([
    'Product Owner: Requires AI team visibility',
    'Development Team: Uses LEAD, PLAN, EXEC agents',
    'AI Team: EVA assistant and AI_CEO coordination',
    'Operations: Needs agent assignment and monitoring'
  ]),

  plan_checklist: JSON.stringify([
    {
      text: 'Review LEAD handoff and confirm scope',
      checked: true
    },
    {
      text: 'Create comprehensive PRD with all sections',
      checked: false
    },
    {
      text: 'Design mock data structure matching agents.ts',
      checked: false
    },
    {
      text: 'Create UI wireframe based on TeamManagementInterface pattern',
      checked: false
    },
    {
      text: 'Trigger Design Sub-Agent for UI/UX review',
      checked: false
    },
    {
      text: 'Verify target application path and routing',
      checked: false
    },
    {
      text: 'Create PLAN→EXEC handoff with implementation guide',
      checked: false
    },
    {
      text: 'Update SD-045 progress to 40%',
      checked: false
    }
  ]),

  exec_checklist: JSON.stringify([]),
  validation_checklist: JSON.stringify([]),

  approved_by: null,
  approval_date: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
  };
}

async function createPRD() {
  console.log('📝 Creating PRD for SD-045...\n');

  const prdData = await createPRDData();

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating PRD:', error);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!\n');
  console.log('📋 PRD Details:');
  console.log(`- ID: ${data.id}`);
  console.log(`- Title: ${data.title}`);
  console.log(`- Directive: ${data.directive_id}`);
  console.log(`- Status: ${data.status}`);
  console.log(`- Priority: ${data.priority}`);
  console.log('\n📊 Requirements Summary:');

  const funcReqs = JSON.parse(data.functional_requirements);
  const techReqs = JSON.parse(data.technical_requirements);
  const acceptance = JSON.parse(data.acceptance_criteria);

  console.log(`- Functional Requirements: ${funcReqs.length}`);
  console.log(`- Technical Requirements: ${techReqs.length}`);
  console.log(`- Acceptance Criteria: ${acceptance.length}`);
  console.log(`- Test Scenarios: ${JSON.parse(data.test_scenarios).length}`);
  console.log('\n✅ PRD ready for EXEC implementation phase');

  return data;
}

createPRD().catch(console.error);
