#!/usr/bin/env node

/**
 * Update PRD-CREWAI-ARCHITECTURE-001 with massively expanded scope
 *
 * Changes:
 * - Expand from 8 FRs to 25 FRs (code generation, UI, CrewAI 1.3.0 upgrade)
 * - Update executive summary to reflect full platform scope
 * - Add detailed implementation approach (12-13 weeks, 9 phases)
 * - Expand database schema (11 tables)
 * - Add 46 API endpoints
 * - Add UI component requirements
 * - Update risks and acceptance criteria
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function updatePRD() {
  console.log('📋 Updating PRD-CREWAI-ARCHITECTURE-001 with expanded scope...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const prdId = 'PRD-CREWAI-ARCHITECTURE-001';

  try {
    // Get current PRD
    const { data: currentPRD, error: fetchError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (fetchError || !currentPRD) {
      console.log(`❌ PRD ${prdId} not found`);
      process.exit(1);
    }

    console.log(`✅ Found PRD: ${currentPRD.title}`);
    console.log(`   Current FRs: ${currentPRD.functional_requirements?.length || 0}`);
    console.log(`   Expanding to: 25 FRs\n`);

    // Updated PRD data
    const updatedPRD = {
      executive_summary: `Comprehensive CrewAI Management Platform with dynamic Python code generation. Transform UI-driven agent configuration into production-ready Python code. Support all 67 CrewAI 1.3.0 parameters. Migrate 40+ existing agents. Full-stack platform: database (11 tables) + APIs (46 endpoints) + UI (Agent Wizard, Crew Builder, Execution Monitor) + Code Generation Service + Knowledge Source (RAG) Management.`,

      business_context: `Current state: CrewAI 0.70.1 with 40+ agents across 11 departments, 5 crews. Manual Python coding required for new agents. No UI-driven configuration. Governance gap: operational agents not tracked by LEO Protocol. Target state: CrewAI 1.3.0 platform where users create/configure agents entirely from UI, system generates Python code, manual review before deployment, full governance integration. Enables non-developers to create agents, reduces development time from hours to minutes, ensures code quality via templates and validation.`,

      technical_context: `Upgrade from CrewAI 0.70.1 → 1.3.0 (memory, planning, reasoning, multimodal). Two-database architecture: EHG_Engineer (governance, dedlbzhpgkmetvhbkyzq) + EHG Application (operations, liapbndqlqxdcgpwntbv). Python server at /ehg/agent-platform/ (FastAPI). React frontend (Vite). Code generation: Jinja2 templates + AST validation + security pipeline. Manual review workflow before deployment. Git commit generated code for audit trail.`,

      // Expanded functional requirements (8 → 25)
      functional_requirements: [
        // Original requirements (FR-001 to FR-008) - keeping them
        ...currentPRD.functional_requirements,

        // NEW requirements (FR-009 to FR-025)
        {
          id: 'FR-009',
          requirement: 'Upgrade CrewAI from 0.70.1 to 1.3.0 with backward compatibility',
          priority: 'HIGH',
          acceptance_criteria: [
            'CrewAI 1.3.0 installed in Python server',
            'All existing agents functional after upgrade',
            'New features available: memory, planning, reasoning, multimodal',
            'Backward compatibility layer for 0.70.1 patterns'
          ]
        },
        {
          id: 'FR-010',
          requirement: 'Dynamic Python code generation system with Jinja2 templates',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'Agent code generated from database configuration',
            'Jinja2 templates for agents, crews, tasks',
            'AST validation of generated code',
            'Security pipeline (import blacklist, sanitization)',
            'File system management (/app/agents/generated/)',
            'Git integration (commit generated code)'
          ]
        },
        {
          id: 'FR-011',
          requirement: 'Agent Creation Wizard (6-step UI) supporting all 35 agent parameters',
          priority: 'HIGH',
          acceptance_criteria: [
            'Step 1: Basic info (name, role, goal, backstory)',
            'Step 2: Tool selection (multi-select from 40+ tools)',
            'Step 3: LLM config (model, temp, tokens, function_calling_llm)',
            'Step 4: Advanced settings (delegation, code execution, memory, reasoning)',
            'Step 5: Code preview (read-only Monaco editor)',
            'Step 6: Review and deploy',
            'Form validation at each step',
            'Save draft capability'
          ]
        },
        {
          id: 'FR-012',
          requirement: 'Crew Builder with drag-and-drop agent assignment',
          priority: 'HIGH',
          acceptance_criteria: [
            'Visual workflow designer (sequential, hierarchical, consensual)',
            'Drag agents from palette to crew canvas',
            'Reorder agents via drag-and-drop',
            'Configure crew parameters (18 total)',
            'Task editor nested under agents',
            'Dependency graph visualizer',
            'Process type selector with preview'
          ]
        },
        {
          id: 'FR-013',
          requirement: 'Task management system with 14 configurable parameters',
          priority: 'MEDIUM',
          acceptance_criteria: [
            'Task CRUD operations',
            'Task dependencies (context tasks)',
            'Task-specific tool assignment',
            'Output configuration (file, JSON, Pydantic schema)',
            'Guardrail configuration',
            'Human input flag',
            'Async execution support'
          ]
        },
        {
          id: 'FR-014',
          requirement: 'Knowledge source (RAG) management system',
          priority: 'HIGH',
          acceptance_criteria: [
            'File upload (PDF, TXT, MD, DOCX)',
            'URL scraping with preview',
            'Embedding configuration (provider, model)',
            'Assignment to agents/crews',
            'Knowledge source registry',
            'Processing status tracking'
          ]
        },
        {
          id: 'FR-015',
          requirement: 'Tool registry with custom tool registration (metadata only)',
          priority: 'MEDIUM',
          acceptance_criteria: [
            '40+ built-in CrewAI tools registered',
            'Custom tool registration via UI (name, description, args schema)',
            'Tool categorization (search, scraping, database, LLM)',
            'Tool configuration storage',
            'API key management (per tool)',
            'Tool usage analytics'
          ]
        },
        {
          id: 'FR-016',
          requirement: 'Live execution monitoring with WebSocket updates',
          priority: 'HIGH',
          acceptance_criteria: [
            'Execute agent/crew from UI',
            'Real-time progress updates (WebSocket)',
            'Current step indicator',
            'Elapsed time tracking',
            'Live log streaming (if verbose=true)',
            'Result viewer (summary, detailed, JSON, tool usage)',
            'Execution history table'
          ]
        },
        {
          id: 'FR-017',
          requirement: 'Manual code review workflow before deployment',
          priority: 'HIGH',
          acceptance_criteria: [
            'Generated code status: pending_review',
            'Review interface with code diff',
            'Approve/reject/request changes actions',
            'Reviewer assignment',
            'Review comments/feedback',
            'Auto-deploy on approval',
            'Rollback on rejection'
          ]
        },
        {
          id: 'FR-018',
          requirement: 'Git integration for generated agent code',
          priority: 'MEDIUM',
          acceptance_criteria: [
            'Generated code committed to Git',
            'Commit message with metadata (agent, version, generator)',
            'Clear markers for generated code',
            'Branch strategy (feature branches for review)',
            'PR creation for code review',
            'Tag generated files in .gitattributes'
          ]
        },
        {
          id: 'FR-019',
          requirement: 'Migration system for 40+ existing agents to new schema',
          priority: 'HIGH',
          acceptance_criteria: [
            'Migration script for agent data',
            'Backfill new parameters (memory, reasoning, etc.)',
            'Preserve existing functionality',
            'Validation of migrated agents',
            'Rollback capability',
            'Migration report (success/failures)'
          ]
        },
        {
          id: 'FR-020',
          requirement: 'Security validation pipeline for generated code',
          priority: 'CRITICAL',
          acceptance_criteria: [
            'AST parsing for syntax validation',
            'Import blacklist enforcement (os, subprocess, eval, exec)',
            'String sanitization (escape dangerous patterns)',
            'Tool whitelist validation',
            'File path validation (prevent traversal)',
            'Resource limit checks',
            'Security audit log'
          ]
        },
        {
          id: 'FR-021',
          requirement: 'Template management system for code generation',
          priority: 'MEDIUM',
          acceptance_criteria: [
            'Base agent template (Jinja2)',
            'Crew template',
            'Task template',
            'Template versioning',
            'Template variables documentation',
            'Template testing framework'
          ]
        },
        {
          id: 'FR-022',
          requirement: 'Execution history and analytics dashboard',
          priority: 'LOW',
          acceptance_criteria: [
            'Execution logs stored in database',
            'Analytics: success rate, avg execution time, token usage',
            'Agent performance comparison',
            'Tool usage statistics',
            'Cost tracking (tokens × price)',
            'Export to CSV/JSON'
          ]
        },
        {
          id: 'FR-023',
          requirement: 'Multi-agent crew orchestration with process types',
          priority: 'MEDIUM',
          acceptance_criteria: [
            'Sequential process (agents run in order)',
            'Hierarchical process (manager agent delegates)',
            'Consensual process (agents vote)',
            'Manager agent configuration',
            'Task dependencies enforced',
            'Error handling per process type'
          ]
        },
        {
          id: 'FR-024',
          requirement: 'Governance audit integration with LEO Protocol',
          priority: 'MEDIUM',
          acceptance_criteria: [
            'Agent executions linked to ventures/SDs',
            'Approval workflows tracked',
            'Audit log entries for all changes',
            'Compliance reporting',
            'Strategic directive phase tracking'
          ]
        },
        {
          id: 'FR-025',
          requirement: 'Comprehensive API documentation and testing',
          priority: 'LOW',
          acceptance_criteria: [
            'OpenAPI/Swagger documentation',
            'Example requests/responses',
            'Postman collection',
            'API versioning strategy',
            'Rate limiting documentation',
            'Error code reference'
          ]
        }
      ],

      // Expanded non-functional requirements
      non_functional_requirements: [
        {
          type: 'security',
          requirement: 'Multi-layer security for code generation',
          target_metric: 'Zero code injection vulnerabilities. AST validation + import blacklist + manual review. All generated code passes security audit.'
        },
        {
          type: 'performance',
          requirement: 'Fast code generation and execution',
          target_metric: 'Code generation <5 seconds. Agent execution monitoring <100ms latency. WebSocket updates <500ms.'
        },
        {
          type: 'scalability',
          requirement: 'Support 100+ agents and 50+ crews',
          target_metric: 'Database queries <100ms. UI responsive with 100+ agents. Pagination for large lists.'
        },
        {
          type: 'usability',
          requirement: 'Non-developers can create agents',
          target_metric: 'Agent creation wizard completable without technical knowledge. Inline help text. Validation feedback.'
        },
        {
          type: 'reliability',
          requirement: 'Generated code always valid Python',
          target_metric: '100% syntax validation. Rollback on generation failure. No breaking changes to existing agents.'
        },
        {
          type: 'maintainability',
          requirement: 'Template-based code generation',
          target_metric: 'Templates versionable and testable. Code generation logic isolated. Clear separation of concerns.'
        }
      ],

      // Expanded system architecture
      system_architecture: `## Three-Layer Architecture

**Frontend Layer** (React 18 + TypeScript):
- Agent Creation Wizard (6 steps, 35 parameters)
- Crew Builder (drag-and-drop, React Flow)
- Task Editor (nested, dependencies)
- Execution Monitor (WebSocket, live updates)
- Knowledge Source Manager (file upload, URL scraping)
- Tool Registry (40+ tools, custom registration)
- Dashboard (analytics, history)

**API Layer** (FastAPI + Python 3.12):
- 46 REST endpoints (agents, crews, tasks, tools, knowledge, execution)
- WebSocket endpoint (live execution updates)
- Code generation service (Jinja2, validation)
- Security pipeline (AST, import blacklist)
- Review workflow (approve/reject)
- Git integration (commit generated code)

**Data Layer** (PostgreSQL/Supabase):
- 11 tables (agents, crews, tasks, tools, knowledge, code, logs)
- RLS policies (authenticated users only)
- Audit logging (all changes tracked)
- Two-database architecture (governance + operational)

**Code Generation Pipeline**:
1. User configures agent in UI (35 parameters)
2. Frontend POSTs to /api/agents/generate
3. Backend validates input (sanitize, whitelist)
4. Jinja2 renders template
5. AST validates syntax
6. Security checks (imports, strings)
7. Write to /app/agents/generated/{department}/{agent_key}.py
8. Git commit with metadata
9. Status → pending_review
10. Manual review → approve
11. Deploy (module reload)

**Database Architecture**:
- **crewai_agents** (expanded): 35 parameters, execution metrics
- **crewai_crews** (expanded): 18 parameters, process config
- **crewai_tasks** (NEW): 14 parameters, dependencies
- **agent_tools** (expanded): 40+ tools, custom registration
- **agent_tool_assignments** (NEW): agent-tool join table
- **task_tool_assignments** (NEW): task-tool join table
- **agent_knowledge_sources** (NEW): RAG sources
- **agent_knowledge_assignments** (NEW): agent-knowledge join
- **crew_knowledge_assignments** (NEW): crew-knowledge join
- **crew_agent_assignments** (NEW): crew-agent join with order
- **generated_agent_code** (NEW): code versioning, review status
- **agent_execution_logs** (NEW): execution history, analytics`,

      // Expanded implementation approach
      implementation_approach: `## 12-13 Week Implementation (9 Phases)

### Phase 0: Planning & Architecture (1 week)
- Finalize 11 database table schemas
- Design UI wireframes (Figma/Sketch)
- Code generation architecture review
- CrewAI 1.3.0 upgrade plan
- Security audit of generation approach
- Migration strategy for 40+ agents

### Phase 1: Database Schema Expansion (1 week)
- Create migration scripts (11 tables)
- Add indexes and foreign keys
- Implement RLS policies
- Seed data (tools, departments, existing agents)
- Test data integrity

### Phase 2: CrewAI Upgrade & Agent Migration (1 week)
- Upgrade Python server 0.70.1 → 1.3.0
- Test backward compatibility
- Migrate 40+ existing agents
- Register 14 existing crews
- Populate tool registry (40+ CrewAI tools)
- Validate migrated agents

### Phase 3: Python Server APIs (2 weeks)
**Week 1: Core CRUD APIs**
- Agent APIs (15 endpoints)
- Crew APIs (12 endpoints)
- Task APIs (8 endpoints)

**Week 2: Advanced APIs**
- Tool APIs (6 endpoints)
- Knowledge APIs (5 endpoints)
- Code generation endpoints
- Review workflow endpoints

### Phase 4: Code Generation Service (2 weeks)
**Week 1: Template System**
- Jinja2 templates (agent, crew, task)
- Template versioning
- Variable documentation

**Week 2: Generation Pipeline**
- CodeGenerationService class
- Security validation (AST, imports, sanitization)
- File system management
- Git integration
- Module reloading

### Phase 5: Frontend UI (3 weeks)
**Week 1: Agent Management**
- Agent Creation Wizard (6 steps)
- Agent List View (filterable, sortable)
- Agent Detail View
- Agent Edit Form
- Tool Selection Interface

**Week 2: Crew Management**
- Crew Builder (drag-and-drop, React Flow)
- Task Editor (nested, dependencies)
- Process Type Selector
- Crew Configuration Panel
- Crew List/Detail Views

**Week 3: Execution & Monitoring**
- Execution Panel (input form)
- Live Execution View (WebSocket, progress, logs)
- Results Viewer (tabs: summary, detailed, JSON, tools)
- Execution History Table
- Dashboard (analytics)

### Phase 6: Knowledge Source (RAG) System (1 week)
- File upload component (drag-and-drop)
- URL scraping interface
- Embedding configuration UI
- Knowledge source registry
- Assignment to agents/crews
- Processing status display

### Phase 7: Execution Engine Integration (1 week)
- WebSocket server (live updates)
- Execution queue (background jobs)
- Result storage and retrieval
- Error handling and recovery
- Timeout enforcement
- Resource monitoring

### Phase 8: Bridge Table + Governance (1 week)
- Link agents to strategic directives
- Approval workflows
- Audit logging integration
- Compliance reporting
- Governance dashboard

### Phase 9: Testing & Documentation (1 week)
- Unit tests (code generation, APIs)
- Integration tests (database, APIs)
- E2E tests (UI flows with Playwright)
- Security testing (penetration, code injection)
- Load testing (execution queue)
- API documentation (Swagger/OpenAPI)
- User guide (screenshots, videos)
- Architecture documentation`,

      // Updated test scenarios
      test_scenarios: [
        { id: 'TS-001', scenario: 'Agent creation via wizard with all 35 parameters', expected_result: 'Agent created, code generated, review pending', test_type: 'e2e' },
        { id: 'TS-002', scenario: 'Code generation produces valid Python', expected_result: 'AST validation passes, no syntax errors', test_type: 'unit' },
        { id: 'TS-003', scenario: 'Security validation blocks dangerous imports', expected_result: 'Reject code with os, subprocess, eval, exec', test_type: 'security' },
        { id: 'TS-004', scenario: 'Manual review workflow (approve/reject)', expected_result: 'Reviewer can approve or reject generated code', test_type: 'e2e' },
        { id: 'TS-005', scenario: 'Agent execution with live WebSocket updates', expected_result: 'Real-time progress, logs, results displayed', test_type: 'e2e' },
        { id: 'TS-006', scenario: 'Crew builder drag-and-drop', expected_result: 'Agents reordered, crew saved, visualization updated', test_type: 'e2e' },
        { id: 'TS-007', scenario: 'Knowledge source upload and assignment', expected_result: 'File uploaded, embedded, assigned to agent, agent uses knowledge', test_type: 'integration' },
        { id: 'TS-008', scenario: 'Migration of 40+ existing agents', expected_result: 'All agents migrated, functional, no data loss', test_type: 'integration' },
        { id: 'TS-009', scenario: 'CrewAI 1.3.0 upgrade', expected_result: 'Upgraded, new features available, backward compatible', test_type: 'integration' },
        { id: 'TS-010', scenario: 'Tool registry with 40+ tools', expected_result: 'All tools listed, searchable, assignable to agents', test_type: 'smoke' },
        { id: 'TS-011', scenario: 'Agent execution at scale (10 parallel)', expected_result: '10 agents execute concurrently, no errors, <5s avg', test_type: 'performance' },
        { id: 'TS-012', scenario: 'Code injection attempt via UI input', expected_result: 'Sanitization blocks injection, security audit log entry', test_type: 'security' }
      ],

      // Updated acceptance criteria
      acceptance_criteria: [
        { id: 'AC-001', criterion: 'All 40+ existing agents migrated to new schema', verification_method: 'Query crewai_agents returns 40+ rows with new fields populated' },
        { id: 'AC-002', criterion: 'Users can create agents entirely from UI (no Python coding)', verification_method: 'Complete wizard, generate code, review, deploy - all via UI' },
        { id: 'AC-003', criterion: 'Generated code passes security validation 100%', verification_method: 'AST validation, import blacklist, string sanitization all pass' },
        { id: 'AC-004', criterion: 'Manual review workflow functional', verification_method: 'Generated code status=pending_review, reviewer approves, status=deployed' },
        { id: 'AC-005', criterion: 'All 67 CrewAI 1.3.0 parameters configurable via UI', verification_method: 'Agent wizard covers 35, crew builder covers 18, task editor covers 14' },
        { id: 'AC-006', criterion: 'Live execution monitoring with WebSocket', verification_method: 'Execute agent, see real-time progress, logs, results in UI' },
        { id: 'AC-007', criterion: 'Knowledge sources uploadable and assignable', verification_method: 'Upload PDF, assign to agent, agent uses knowledge in execution' },
        { id: 'AC-008', criterion: 'Generated code committed to Git', verification_method: 'Check Git log, see commit with metadata, generated files tagged' },
        { id: 'AC-009', criterion: 'CrewAI upgraded from 0.70.1 to 1.3.0', verification_method: 'Check requirements.txt, verify new features (memory, planning) available' },
        { id: 'AC-010', criterion: '46 API endpoints documented and functional', verification_method: 'Swagger UI shows all endpoints, Postman collection tests pass' }
      ],

      // Updated risks
      risks: [
        { risk: 'Code generation produces invalid Python', impact: 'HIGH', probability: 'MEDIUM', mitigation: 'Multi-layer validation: AST parsing, linting (flake8), security checks, manual review. Template testing framework.' },
        { risk: 'Security vulnerability in generated code', impact: 'CRITICAL', probability: 'MEDIUM', mitigation: 'Import blacklist, string sanitization, tool whitelist, manual review, security audit log, penetration testing.' },
        { risk: 'Migration breaks existing agents', impact: 'HIGH', probability: 'LOW', mitigation: 'Extensive testing, rollback plan, migration validation, backup before writes, dry-run scripts.' },
        { risk: 'CrewAI 1.3.0 upgrade incompatibility', impact: 'HIGH', probability: 'LOW', mitigation: 'Backward compatibility layer, incremental upgrade, test all agents post-upgrade, version pinning.' },
        { risk: 'UI complexity overwhelms users', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'User testing, inline help, tooltips, progressive disclosure, wizard approach, save draft capability.' },
        { risk: 'Performance degradation with 100+ agents', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'Database indexing, pagination, lazy loading, query optimization, caching, load testing.' },
        { risk: 'Timeline slip due to scope', impact: 'LOW', probability: 'LOW', mitigation: 'Fixed scope per user decisions, phased implementation, buffer in estimates, not a concern per user.' }
      ],

      // Update progress
      progress: 5, // 5% for PRD expansion complete

      updated_at: new Date().toISOString()
    };

    // Update PRD
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .update(updatedPRD)
      .eq('id', prdId)
      .select()
      .single();

    if (error) {
      console.error('❌ Update error:', error.message);
      process.exit(1);
    }

    console.log(`\n✅ PRD ${prdId} updated successfully!`);
    console.log(`   Functional Requirements: ${data.functional_requirements.length} (was 8, now 25)`);
    console.log(`   Non-Functional Requirements: ${data.non_functional_requirements.length}`);
    console.log(`   Test Scenarios: ${data.test_scenarios.length} (was 8, now 12)`);
    console.log(`   Acceptance Criteria: ${data.acceptance_criteria.length} (was 7, now 10)`);
    console.log(`   Risks: ${data.risks.length} (was 4, now 7)`);
    console.log(`   Progress: ${data.progress}%`);

    console.log('\n📊 Scope Comparison:');
    console.log('   Original: 8 FRs, 2-3 weeks, basic CRUD');
    console.log('   Expanded: 25 FRs, 12-13 weeks, full platform with code generation');
    console.log('   Multiplier: 3x requirements, 5x timeline, 10x functionality');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updatePRD();
