#!/usr/bin/env node

/**
 * Create User Stories for SD-AGENT-PLATFORM-001
 * Advanced AI Research Platform with Full Agent Suite
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g'
);

const SD_ID = 'SD-AGENT-PLATFORM-001';

const userStories = [
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-001`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'EVA Assistant as Central Coordinator Integration',
    user_role: 'developer',
    user_want: 'to preserve EVA Assistant as the central coordinator while integrating with unified CrewAI agent platform',
    user_benefit: 'EVA retains orchestration capabilities and coordinates other agents within CrewAI framework',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'EVA retains central coordinator role in agent orchestration',
      'Existing orchestration tables (eva_orchestration_sessions, eva_agent_communications, eva_actions, orchestration_metrics) remain functional',
      'EVA can coordinate other CrewAI agents (LEAD, PLAN, EXEC, specialized research agents)',
      'EVA manages multi-agent workflows and session lifecycles',
      'Integration completed without breaking existing EVA orchestration features'
    ],
    definition_of_done: [],
    technical_notes: 'Preserve EVA as orchestration coordinator, integrate with CrewAI agent framework while maintaining existing orchestration infrastructure, ensure EVA coordinates other agents rather than being just another agent',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-002`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Regulatory Risk Assessor Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to identify regulatory barriers and compliance requirements',
    user_benefit: 'I understand compliance risks before investing resources',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Agent deployed with role: Compliance and Risk Analyst',
      'Identifies industry-specific regulations (FDA, FTC, state licensing)',
      'Generates compliance checklist',
      'Completes analysis within 3-5 minutes',
      'Returns risk assessment with regulatory requirements'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with regulatory database APIs, legal research tools, compliance checklist generator',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-003`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Technology Feasibility Checker Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to assess technical feasibility and implementation complexity',
    user_benefit: 'I know if we can realistically build the solution with available technology',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 1',
    acceptance_criteria: [
      'Agent deployed with role: Senior Technical Architect',
      'Analyzes technology stack requirements',
      'Estimates cloud costs and infrastructure needs',
      'Completes analysis within 2-4 minutes',
      'Returns feasibility score with implementation roadmap'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with technology stack analyzer, architecture pattern matcher, cloud cost estimator',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-004`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Idea Enhancement Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to enhance and refine venture concepts based on research findings',
    user_benefit: 'the final venture concept is stronger and more viable than my initial idea',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Creative Business Strategist',
      'Synthesizes insights from all other agents',
      'Generates refined value proposition and business model canvas',
      'Completes enhancement within 3-5 minutes',
      'Returns enhanced concept with clear improvements documented'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with idea refinement engine, business model canvas generator, value proposition designer. Must run AFTER all research agents complete. Dependencies: US-002 (Regulatory), US-003 (Tech Feasibility).',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-005`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Duplicate Detection Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to detect duplicate or overlapping venture concepts with 95%+ accuracy',
    user_benefit: 'I avoid creating duplicate ventures and can merge similar ideas',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Portfolio Intelligence Analyst',
      'Uses cosine similarity for semantic matching',
      'Searches all existing ventures and past rejected ideas',
      'Achieves 95%+ duplicate detection accuracy',
      'Completes analysis within 1-2 minutes',
      'Returns duplicate matches with similarity scores'
    ],
    definition_of_done: [],
    technical_notes: 'Implement similarity detection engine using vector embeddings, configure portfolio database access, semantic search',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-006`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Financial Viability Agent',
    user_role: 'chairman',
    user_want: 'an AI agent to assess basic financial feasibility and unit economics',
    user_benefit: 'I understand if the venture can be profitable',
    story_points: 5,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 2',
    acceptance_criteria: [
      'Agent deployed with role: Financial Analysis Specialist',
      'Analyzes unit economics (CAC/LTV)',
      'Compares against industry benchmarks',
      'Completes analysis within 2-4 minutes',
      'Returns financial viability assessment with projections'
    ],
    definition_of_done: [],
    technical_notes: 'Configure agent with financial modeling templates, unit economics calculator, CAC/LTV analyzer, industry benchmark data',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-007`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'HackerNews Data Integration',
    user_role: 'developer',
    user_want: 'to integrate HackerNews API for tech trends and product launch insights',
    user_benefit: 'agents have access to developer community sentiment and tech trends',
    story_points: 3,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'HackerNews API integrated via GenericRestConnector extension',
      'Accesses topstories, newstories, beststories, item endpoints',
      'Rate limiting: 100 requests/min (conservative)',
      'Data available to all relevant agents',
      'Cached for 24 hours to reduce API calls'
    ],
    definition_of_done: [],
    technical_notes: 'Extend GenericRestConnector with HackerNews Official API support',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-008`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'ProductHunt Data Integration',
    user_role: 'developer',
    user_want: 'to integrate ProductHunt GraphQL API for product launch and competitive tracking',
    user_benefit: 'agents know what products are launching and gaining traction',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'ProductHunt GraphQL API integrated via GenericRestConnector with GraphQL support',
      'OAuth2 authentication configured',
      'Rate limiting: 1000 requests/hour',
      'Data available to competitive and market agents',
      'Cached for 24 hours'
    ],
    definition_of_done: [],
    technical_notes: 'Extend GenericRestConnector with GraphQL support for ProductHunt API',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-009`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Crunchbase Data Integration',
    user_role: 'developer',
    user_want: 'to integrate Crunchbase Enterprise API for funding and company intelligence',
    user_benefit: 'agents have access to funding data and M&A activity',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 3',
    acceptance_criteria: [
      'Crunchbase Enterprise API integrated via GenericRestConnector',
      'API Key authentication configured',
      'Aggressive caching to minimize cost (~$300/month subscription)',
      'Data available to market and competitive agents',
      'Rate limiting handled per plan requirements'
    ],
    definition_of_done: [],
    technical_notes: 'Extend GenericRestConnector with Crunchbase API, implement aggressive caching strategy',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-010`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Shared Knowledge Base with pgvector',
    user_role: 'developer',
    user_want: 'to build a shared knowledge base using Supabase pgvector for agent memory',
    user_benefit: 'agents learn from past decisions and build institutional knowledge',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'agent_shared_knowledge table created with pgvector extension',
      'OpenAI ada-002 embeddings (1536 dimensions)',
      'ivfflat index for vector cosine similarity',
      'Knowledge types: chairman_feedback_pattern, successful_venture_characteristic, rejected_venture_pattern, market_trend, regulatory_requirement, technology_best_practice',
      'Agents can query and store knowledge'
    ],
    definition_of_done: [],
    technical_notes: 'Create database table with VECTOR(1536) column, enable pgvector extension, implement embedding generation pipeline',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-011`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Pattern Recognition from Chairman Feedback',
    user_role: 'system',
    user_want: 'to implement learning mechanisms that capture patterns from Chairman decisions',
    user_benefit: 'AI agents improve over time by learning from human feedback',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 4',
    acceptance_criteria: [
      'Chairman accept → store as positive pattern',
      'Chairman reject → analyze diff and store as negative pattern',
      'Chairman edit → extract improvement patterns',
      'Venture reaches Stage 10 → store success characteristics',
      'Venture archived → store failure indicators',
      'Target: >100 patterns in first month'
    ],
    definition_of_done: [],
    technical_notes: 'Implement feedback capture hooks, pattern analysis algorithms, knowledge base storage integration. Dependency: US-010 (Shared Knowledge Base must be created first).',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-012`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'CrewAI Flows Orchestration',
    user_role: 'developer',
    user_want: 'to deploy CrewAI Flows for event-driven workflow orchestration',
    user_benefit: 'complex agent workflows are managed with granular control and error handling',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'CrewAI Flows configured for event-driven execution',
      'Parallel agent execution (market sizing + pain points + competitive)',
      'Sequential execution for dependent tasks (idea enhancement after research)',
      'Error handling with retry and fallback strategies',
      'Dynamic agent selection based on venture category',
      'Progress reporting and status updates'
    ],
    definition_of_done: [],
    technical_notes: 'Implement CrewAI Flows architecture with conditional execution, parallel/sequential optimization, error handling',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-013`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Performance Optimization and Caching',
    user_role: 'developer',
    user_want: 'to optimize agent performance with parallel execution and caching',
    user_benefit: 'research completes faster with lower external API costs',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'Parallel execution for independent agents (market sizing, pain points, competitive)',
      'External API results cached for 24 hours',
      'Progressive loading returns partial results as agents complete',
      'Fallback strategies if external API fails (use cached data or skip)',
      'Total research duration: 8-20 minutes depending on complexity'
    ],
    definition_of_done: [],
    technical_notes: 'Implement caching layer for external APIs, parallel agent execution, progressive result streaming, fallback logic',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-014`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'EVA Orchestration Session Management',
    user_role: 'developer',
    user_want: 'to preserve EVA\'s session management capabilities for multi-agent coordination',
    user_benefit: 'orchestration sessions track agent activities, manage lifecycle, and support Chairman oversight',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'eva_orchestration_sessions table remains functional and integrated',
      'Session lifecycle management (active, paused, completed, failed) preserved',
      'Chairman oversight capabilities maintained',
      'Active agents tracking works across CrewAI agents',
      'Performance summaries and error logs captured'
    ],
    definition_of_done: [],
    technical_notes: 'Preserve existing eva_orchestration_sessions table structure, integrate with CrewAI agent framework, maintain session management logic, ensure Chairman oversight workflows remain functional',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-015`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'EVA Agent-to-Agent Communication System',
    user_role: 'developer',
    user_want: 'to preserve EVA\'s inter-agent messaging and handoff infrastructure',
    user_benefit: 'agents communicate seamlessly with request/response/handoff/escalation patterns',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'eva_agent_communications table remains functional',
      'Message types supported (request, response, notification, handoff, escalation, broadcast)',
      'Agent handoff workflows preserved',
      'Message priority and acknowledgment tracking works',
      'In-reply-to threading maintained'
    ],
    definition_of_done: [],
    technical_notes: 'Preserve existing eva_agent_communications table, integrate CrewAI agents as message participants, maintain message routing and delivery logic, ensure handoff protocols remain functional',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-016`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'EVA Action Execution & Coordination',
    user_role: 'developer',
    user_want: 'to preserve EVA\'s action execution and coordination infrastructure',
    user_benefit: 'orchestration actions are tracked, prioritized, and support rollback capabilities',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 5',
    acceptance_criteria: [
      'eva_actions table remains functional',
      'Priority-based action scheduling works',
      'Rollback capabilities preserved',
      'Chairman approval workflows maintained',
      'Action status tracking (pending, in_progress, completed, failed) functional'
    ],
    definition_of_done: [],
    technical_notes: 'Preserve existing eva_actions table, integrate action assignment with CrewAI agents, maintain execution context and rollback_data structures, ensure Chairman approval flows remain functional',
    created_by: 'SYSTEM'
  },
  // ===========================================================================================
  // ORGANIZATIONAL HIERARCHY USER STORIES (US-017 through US-032)
  // CrewAI Hierarchical Structure + 10 Department Teams
  // ===========================================================================================
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-017`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'CrewAI Hierarchical Agent Configuration',
    user_role: 'developer',
    user_want: 'to configure CrewAI agents with hierarchical relationships (reports_to, manager, subordinates)',
    user_benefit: 'agents understand reporting structure and can delegate/escalate tasks appropriately',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'reports_to field added to ai_agents table (UUID reference to manager)',
      'Hierarchical query functions (get_subordinates, get_reporting_chain, get_department_agents)',
      'Agent can delegate tasks to subordinates based on workload and specialty',
      'Agent can escalate to manager when confidence < 70% or task exceeds authority',
      'Circular reporting relationships prevented via database constraint',
      'Org chart API endpoint returns full hierarchy'
    ],
    definition_of_done: [],
    technical_notes: 'ALTER TABLE ai_agents ADD COLUMN reports_to UUID REFERENCES ai_agents(id), create recursive CTE functions for hierarchy queries, implement delegation logic in CrewAI framework, add CHECK constraint to prevent self-reporting',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-018`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Organizational Structure Framework',
    user_role: 'chairman',
    user_want: 'comprehensive SaaS organizational structure (CEO → COO → VPs → Department Heads → Specialists)',
    user_benefit: 'ventures have complete org structure mirroring real SaaS companies for realistic business planning',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'organizational_departments table created (id, company_id, name, parent_dept_id, vp_agent_id, description, budget_allocation)',
      '10 departments configured: Product, Marketing, Advertising, Branding, Sales, Customer Success, Finance, Legal, Engineering, AI Agent Management',
      'Department hierarchy supports sub-departments (e.g., Branding has Copy, Website, Naming sub-teams)',
      'Org chart visualization in admin UI with interactive drill-down',
      'Department assignment required for all non-executive agents',
      'Budget allocation per department tracked'
    ],
    definition_of_done: [],
    technical_notes: 'Create organizational_departments table, build recursive department hierarchy, develop React org chart component using react-organizational-chart library, link agents to departments via department_id foreign key',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-019`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'CEO & COO Executive Agents',
    user_role: 'chairman',
    user_want: 'CEO and COO executive agents for strategic oversight and operational coordination',
    user_benefit: 'top-level decision-making and cross-departmental coordination automated',
    story_points: 5,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 6',
    acceptance_criteria: [
      'CEO agent configured with role: Chief Executive Officer',
      'COO agent configured with role: Chief Operating Officer',
      'All VPs report to CEO (Product VP, Marketing VP, Sales VP, Finance VP, etc.)',
      'COO coordinates daily operations across departments',
      'CEO makes final strategic decisions (approve/reject ventures, resource allocation)',
      'CEO escalation threshold: 95% confidence required for auto-approve',
      'Integration with EVA orchestration for coordination'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 2 executive agents with highest authority levels, set reports_to NULL for CEO, COO reports to CEO, integrate with existing venture approval workflows, leverage EVA for executive-level orchestration',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-020`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Agent Backstory Management System',
    user_role: 'admin',
    user_want: 'to configure agent backstories that inform decision-making, communication style, and role context',
    user_benefit: 'agents have context-aware personalities and make decisions aligned with their roles and experience',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 7',
    acceptance_criteria: [
      'agent_backstory JSONB field added to ai_agents table',
      'Backstory schema: { role_title, years_experience, expertise_areas[], personality_traits[], decision_making_style, communication_style, past_achievements[], goals[] }',
      'Admin UI for backstory creation and editing with templates',
      'Backstory automatically injected into agent system prompts',
      'Version control for backstory changes with audit log',
      'Pre-configured backstory templates for each role (e.g., "Experienced SaaS Sales Executive", "Technical SEO Specialist")'
    ],
    definition_of_done: [],
    technical_notes: 'Extend ai_agents table with agent_backstory JSONB, create backstory_templates table, build backstory editor UI component with rich text, integrate backstory into CrewAI agent prompt engineering via template injection',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-021`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Task Delegation Framework',
    user_role: 'system',
    user_want: 'hierarchical task delegation where managers assign tasks to subordinates and specialists escalate to managers',
    user_benefit: 'complex projects decomposed appropriately across organizational hierarchy with accountability tracking',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 8',
    acceptance_criteria: [
      'agent_tasks table created (task_id, assigned_by, assigned_to, task_type, priority, status, due_date, completion_data, escalation_reason)',
      'Delegation rules: managers delegate to subordinates only, specialists can only escalate upward',
      'Task routing algorithm considers agent specialty, current workload, and expertise match score',
      'Escalation triggers: complexity > agent authority, confidence < 70%, deadline at risk, blocker encountered',
      'Task completion workflows with approval chains (specialist → manager → VP → CEO)',
      'Task dependency tracking (task B depends on task A completion)'
    ],
    definition_of_done: [],
    technical_notes: 'Create agent_tasks table, implement task routing engine with specialty matching algorithm, build escalation logic with configurable triggers, integrate with eva_agent_communications for task notifications, create task dependency graph resolver',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-022`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Tool Assignment & Access Control',
    user_role: 'admin',
    user_want: 'to assign specific tools/APIs to agent roles and control access based on hierarchy and department',
    user_benefit: 'agents have appropriate tools for their role, don\'t access unauthorized resources, and costs are controlled',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 8',
    acceptance_criteria: [
      'agent_tools table created (id, agent_id, tool_name, access_level: read/write/execute, cost_limit_usd, granted_by, granted_at)',
      'Tool categories: data_sources (Reddit, HN, ProductHunt, Crunchbase), analytics_tools (Mixpanel, Amplitude), creative_tools (Midjourney, Runway), admin_tools (database access)',
      'Role-based tool assignment (e.g., SEO Specialist gets SEMrush API, Naming Specialist gets domain availability checker, Finance gets Stripe API)',
      'Tool access enforcement in agent execution middleware',
      'Cost limits per tool per agent with overage alerts',
      'Admin UI for tool assignment with search and filter'
    ],
    definition_of_done: [],
    technical_notes: 'Create agent_tools table, implement access control middleware in GenericRestConnector, build tool assignment UI component, add cost tracking integration with tool usage metrics',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-023`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'AI Agent Management Dashboard',
    user_role: 'admin',
    user_want: 'centralized dashboard for monitoring agent performance, workload, and resource allocation',
    user_benefit: 'identify underperforming agents, rebalance workload, optimize resource allocation',
    story_points: 5,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 9',
    acceptance_criteria: [
      'Route: /admin/agent-management',
      'Displays all agents organized by department with drill-down',
      'Metrics per agent: tasks completed, success rate, avg response time, current workload, cost per task',
      'Workload distribution visualization (who is overloaded vs idle)',
      'Performance trends (7d, 30d, all time)',
      'Agent status controls (activate, deactivate, reassign department)',
      'Bulk operations (reassign multiple agents, update tool access for department)'
    ],
    definition_of_done: [],
    technical_notes: 'Create AgentManagementDashboard component, query agent_tasks for workload metrics, integrate orchestration_metrics for performance data, build workload visualization using Recharts, implement bulk operations API endpoints',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-024`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Product Management Department Team',
    user_role: 'chairman',
    user_want: 'Product Management Department with strategy, marketing, UX research, and analytics agents',
    user_benefit: 'comprehensive product planning, positioning, and user research for venture products',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 10',
    acceptance_criteria: [
      'Product VP agent (manages product team, reports to CEO)',
      'Product Strategy Agent (roadmap planning, feature prioritization, competitive positioning) - reports to VP',
      'Product Marketing Agent (GTM strategy, positioning, messaging, launch plans) - reports to VP',
      'UX Research Agent (user interviews, usability testing, research synthesis) - reports to VP',
      'Product Analytics Agent (metrics definition, funnel analysis, retention analysis) - reports to VP',
      'Integration with ventures table for product roadmap storage',
      'All agents have appropriate backstories and tool assignments'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Product agents with product management backstories, assign tools (ProductBoard, Mixpanel, UserTesting), integrate with venture_stages for product development phases',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-025`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Marketing Department Team',
    user_role: 'chairman',
    user_want: 'Marketing Department with content, SEO, growth hacking, and analytics specialists',
    user_benefit: 'comprehensive marketing strategy and execution capabilities for venture growth',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 10',
    acceptance_criteria: [
      'Marketing VP agent (manages marketing team, reports to CEO)',
      'Content Strategist Agent (content calendar, editorial strategy, content distribution) - reports to VP',
      'SEO Specialist Agent (keyword research, on-page optimization, technical SEO, backlink strategy) - reports to VP',
      'Growth Hacker Agent (viral loops, referral programs, growth experiments, conversion optimization) - reports to VP',
      'Marketing Analytics Agent (attribution modeling, funnel analysis, campaign ROI) - reports to VP',
      'Integration with Creative Media for content assets',
      'All agents collaborate on marketing campaigns'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Marketing agents, assign tools (SEMrush, Ahrefs, Google Analytics, Hotjar), integrate with creative_campaigns table, build marketing campaign workflow',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-026`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Advertising Department Team',
    user_role: 'chairman',
    user_want: 'Advertising Department with campaign management, media buying, ad copy, and optimization',
    user_benefit: 'automated ad campaign creation, execution, and optimization across channels',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 11',
    acceptance_criteria: [
      'Advertising VP agent (manages advertising team, reports to CEO)',
      'Campaign Manager Agent (campaign strategy, budget allocation, channel selection, performance goals) - reports to VP',
      'Media Buyer Agent (platform selection, bid optimization, audience targeting, budget pacing) - reports to VP',
      'Ad Copywriter Agent (ad copy generation, A/B test variants, headline optimization, CTA testing) - reports to VP',
      'Performance Optimizer Agent (real-time bid adjustments, creative rotation, budget reallocation) - reports to VP',
      'Integration with Creative Media assets for ad creatives',
      'Campaign performance tracking and reporting'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Advertising agents, assign tools (Google Ads, Facebook Ads Manager, AdEspresso), integrate with creative_campaigns and creative_media_assets tables, build campaign performance dashboard',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-027`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Branding Department Team',
    user_role: 'chairman',
    user_want: 'Branding Department with brand strategy, copywriting, website content, and naming specialists',
    user_benefit: 'complete brand identity creation and management for all ventures',
    story_points: 8,
    priority: 'critical',
    status: 'ready',
    sprint: 'Sprint 11',
    acceptance_criteria: [
      'Branding VP agent (manages branding team, reports to CEO)',
      'Brand Strategist Agent (brand positioning, voice, values, personality, competitive differentiation) - reports to VP',
      'Copywriter Agent (taglines, product descriptions, marketing copy, email copy, microcopy) - reports to VP',
      'Website Content Creator Agent (homepage copy, landing pages, about us, feature pages, value props) - reports to VP',
      'Naming Specialist Agent (venture names, product names, feature names, tagline ideation, domain availability) - reports to VP',
      'Domain availability checker integration for naming',
      'Brand identity storage in ventures.metadata',
      'All agents reference brand guidelines for consistency'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Branding agents, assign tools (domain availability APIs, trademark search, brand guideline templates), integrate with ventures table for brand storage, build brand identity management UI',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-028`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Sales Department Team',
    user_role: 'chairman',
    user_want: 'Sales Department with SDR, account executive, sales engineering, and sales ops agents',
    user_benefit: 'comprehensive sales strategy and execution for venture customer acquisition',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 12',
    acceptance_criteria: [
      'Sales VP agent (manages sales team, reports to CEO)',
      'Sales Development Rep Agent (lead qualification, cold outreach, discovery calls, lead scoring) - reports to VP',
      'Account Executive Agent (demos, proposals, negotiations, closing, objection handling) - reports to VP',
      'Sales Engineering Agent (technical demos, POCs, custom integrations, technical Q&A) - reports to VP',
      'Sales Ops Agent (CRM management, pipeline tracking, forecasting, sales enablement) - reports to VP',
      'Integration with Customer Success for handoff workflows',
      'Sales playbook generation per venture'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Sales agents, assign tools (Salesforce, Gong, Outreach.io), create sales_pipeline table for opportunity tracking, build lead scoring algorithm',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-029`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Customer Success Department Team',
    user_role: 'chairman',
    user_want: 'Customer Success Department with onboarding, support, account management, and analytics',
    user_benefit: 'customer retention, expansion, and advocacy strategies for venture growth',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 12',
    acceptance_criteria: [
      'Customer Success VP agent (manages CS team, reports to CEO)',
      'Onboarding Specialist Agent (user onboarding flows, activation sequences, time-to-value optimization) - reports to VP',
      'Support Strategy Agent (help docs, FAQs, chatbot scripts, support SLAs, ticket routing) - reports to VP',
      'Account Manager Agent (upsells, cross-sells, renewals, churn prevention, expansion revenue) - reports to VP',
      'Success Analytics Agent (health scores, usage metrics, churn prediction, NPS tracking) - reports to VP',
      'Integration with Sales for customer handoff',
      'Customer success playbooks per venture stage'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Customer Success agents, assign tools (Intercom, Zendesk, ChurnZero), create customer_health table for health score tracking, build churn prediction model',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-030`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Finance Department Team',
    user_role: 'chairman',
    user_want: 'Finance Department with FP&A, pricing, unit economics, and revenue ops specialists',
    user_benefit: 'financial modeling, pricing strategy, and revenue optimization for ventures',
    story_points: 8,
    priority: 'high',
    status: 'ready',
    sprint: 'Sprint 13',
    acceptance_criteria: [
      'Finance VP agent (manages finance team, reports to CEO)',
      'Financial Planning Agent (3-year projections, scenario modeling, fundraising prep, cap tables) - reports to VP',
      'Pricing Strategy Agent (pricing models, packaging, price optimization, discounting strategy) - reports to VP',
      'Unit Economics Agent (CAC, LTV, payback period, burn rate, runway calculations) - reports to VP',
      'Revenue Ops Agent (billing systems, subscription management, MRR tracking, revenue recognition) - reports to VP',
      'Integration with existing Financial Viability Agent (US-006)',
      'Financial models stored in ventures.metadata'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Finance agents, assign tools (Stripe, ChartMogul, financial modeling templates), create financial_projections table, build revenue dashboard, integrate with existing unit economics calculator',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-031`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Legal & Compliance Department Team',
    user_role: 'chairman',
    user_want: 'Legal & Compliance Department for entity formation, regulatory compliance, and legal docs',
    user_benefit: 'legal risk assessment and compliance guidance for all ventures',
    story_points: 8,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 13',
    acceptance_criteria: [
      'Legal VP agent (manages legal team, reports to CEO)',
      'Legal Structure Agent (entity formation advice, business structure, incorporation, operating agreements) - reports to VP',
      'Compliance Agent (GDPR, CCPA, HIPAA, SOC2, industry regulations, compliance checklists) - reports to VP',
      'Privacy Agent (data protection, privacy policies, cookie consent, data retention, privacy by design) - reports to VP',
      'Terms & Conditions Agent (ToS, Privacy Policy, SLA, EULA, vendor agreements) - reports to VP',
      'Integration with existing Regulatory Risk Assessor Agent (US-002)',
      'Legal document templates per venture type'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 5 Legal agents, assign legal research tools and document templates, create legal_documents table, integrate with existing regulatory database APIs from US-002',
    created_by: 'SYSTEM'
  },
  {
    id: randomUUID(),
    story_key: `${SD_ID}:US-032`,
    sd_id: SD_ID,
    prd_id: null,
    title: 'Technical/Engineering Department Team',
    user_role: 'chairman',
    user_want: 'Technical/Engineering Department for architecture, dev strategy, DevOps, security, and QA',
    user_benefit: 'comprehensive technical planning and implementation guidance for ventures',
    story_points: 7,
    priority: 'medium',
    status: 'ready',
    sprint: 'Sprint 14',
    acceptance_criteria: [
      'Engineering VP agent (manages engineering team, reports to CEO)',
      'Solutions Architect Agent (tech stack selection, architecture design, scalability planning) - reports to VP',
      'Development Strategy Agent (build vs buy decisions, MVP scoping, sprint planning, release strategy) - reports to VP',
      'DevOps Strategy Agent (infrastructure selection, CI/CD pipelines, deployment strategy, monitoring) - reports to VP',
      'Security Architecture Agent (security design, threat modeling, penetration testing, incident response) - reports to VP',
      'QA Strategy Agent (testing approach, test automation, quality gates, regression testing) - reports to VP',
      'Integration with existing Technology Feasibility Checker Agent (US-003)',
      'Technical architecture docs stored per venture'
    ],
    definition_of_done: [],
    technical_notes: 'Configure 6 Engineering agents (note: 6 agents, not 5), assign technical tools (AWS cost calculator, threat modeling tools, testing frameworks), integrate with existing tech feasibility analyzer from US-003',
    created_by: 'SYSTEM'
  }
];

async function createUserStories() {
  console.log(`🎯 Creating User Stories for ${SD_ID}`);
  console.log('='.repeat(80));

  try {
    // Insert user stories
    const { data, error } = await supabase
      .from('user_stories')
      .insert(userStories)
      .select();

    if (error) throw error;

    console.log(`\n✅ Successfully created ${data.length} user stories!\n`);

    data.forEach((story, i) => {
      console.log(`${i + 1}. ${story.story_key}: ${story.title}`);
      console.log(`   Priority: ${story.priority} | Points: ${story.story_points} | Sprint: ${story.sprint}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log(`Total Story Points: ${userStories.reduce((sum, s) => sum + s.story_points, 0)}`);
    console.log('='.repeat(80) + '\n');

    return data;
  } catch (error) {
    console.error('❌ Error creating user stories:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createUserStories();
}

export { createUserStories };
