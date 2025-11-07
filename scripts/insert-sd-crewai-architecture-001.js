#!/usr/bin/env node
/**
 * Insert SD-CREWAI-ARCHITECTURE-001 into strategic_directives_v2
 *
 * Strategic Directive: CrewAI Architecture Assessment & Consolidation
 * Priority: CRITICAL (P0)
 *
 * Purpose: Evaluate and consolidate CrewAI agent/crew infrastructure
 * across Python platform and database tables to establish clean foundation
 * for Stage Operating Dossier system.
 *
 * Run: node scripts/insert-sd-crewai-architecture-001.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sdData = {
  // PRIMARY KEY and UNIQUE identifier
  id: 'SD-CREWAI-ARCHITECTURE-001',
  sd_key: 'SD-CREWAI-ARCHITECTURE-001',

  // Required fields
  title: 'CrewAI Architecture Assessment & Agent/Crew Registry Consolidation',
  category: 'infrastructure',
  priority: 'critical', // P0 - blocks Stage Dossier project
  status: 'draft',
  version: '1.0',
  sd_type: 'feature',
  target_application: 'EHG',
  current_phase: 'LEAD_APPROVAL',
  created_by: 'human:Chairman',

  // Core content
  description: `Comprehensive assessment of CrewAI infrastructure to resolve duplication between Python code (/ehg/agent-platform/) and empty database tables (crewai_agents, crewai_crews, etc.). Establish clean agent/crew registry architecture as foundation for Stage Operating Dossier system.

**Discovery Context:**
During Phase 0 discovery for Stage Operating Dossier project, found operational Python CrewAI platform (/ehg/agent-platform/, port 8000) with 15+ crews and 15+ agents in code, but ALL related database tables empty (0 rows). This creates:
- No single source of truth for agent/crew registry
- Cannot query which agents/crews exist
- Cannot map stages → agents/crews
- Cannot track execution history
- Blocks Stage Dossier generation

**Estimated Effort:** 80 hours (2 weeks)`,

  rationale: `BUSINESS RATIONALE:
- Stage Operating Dossier project blocked until CrewAI architecture is clarified
- Cannot map 40 stages → agents/crews without knowing source of truth
- Risk of building on duplicate/inconsistent systems
- Future UI for agent management requires database foundation

TECHNICAL RATIONALE:
- Python platform has 15+ crews operational in code
- Database tables (crewai_agents, crewai_crews, crew_members) have 0 rows
- No single source of truth for "which agents/crews exist"
- Can't query, track, or configure agents without DB registry
- Stage → agent/crew mappings have no storage location

ARCHITECTURAL IMPACT:
- Affects both EHG app (/ehg/agent-platform/) and EHG_Engineer governance
- Impacts future visual workflow builder (crewai_flows table exists but unused)
- Determines how Stage Dossiers reference agent orchestration
- Establishes pattern for future agent system expansions`,

  scope: `INCLUDED IN SCOPE:
1. **Discovery & Documentation** (Phase 1)
   - Audit all Python agents in /ehg/agent-platform/app/agents/
   - Audit all Python crews in /ehg/agent-platform/app/crews/
   - Document current CrewAI table schemas (both databases)
   - Map which stages use which agents/crews (known: Stages 1-3)

2. **Architecture Decision** (Phase 2)
   - Source of truth: Python code vs. database vs. hybrid?
   - Agent/crew registration strategy (manual vs. auto-scan)
   - Execution tracking approach (DB only or code+DB)
   - Stage → agent/crew mapping storage location

3. **Database Consolidation** (Phase 3)
   - Populate crewai_agents table (scan Python or manual)
   - Populate crewai_crews table
   - Populate crew_members table (agent-to-crew mappings)
   - Create stage_agent_mappings table (new)
   - Seed initial data for operational agents/crews

4. **Integration Layer** (Phase 4)
   - Python registration script (scan code → insert DB)
   - Query layer for Stage Dossiers (DB → agent metadata)
   - Execution tracking (crewai_flow_executions)
   - Documentation of patterns for future agents

EXCLUDED FROM SCOPE:
- Refactoring Python code to read from DB (future iteration)
- Building visual workflow UI (uses crewai_flows, future work)
- Migrating Node.js sub-agents to database (separate system)
- Agent performance optimization (SD-AGENT-OPTIMIZATION-002)

SYSTEMS AFFECTED:
- /ehg/agent-platform/ (Python CrewAI platform, port 8000)
- crewai_agents, crewai_crews, crew_members tables (EHG DB)
- crewai_flows, crewai_flow_executions tables (EHG_Engineer DB)
- Stage Operating Dossier generation system (blocked)
- Future stage → agent orchestration automation`,

  success_criteria: `COMPLETION CRITERIA:
1. All existing CrewAI agents documented (count, capabilities, dept)
2. All existing CrewAI crews documented (count, goals, process)
3. Architecture decision made and documented (source of truth)
4. Database tables populated with agent/crew registry
5. Stage → agent/crew mappings identified (at least Stages 1-20)
6. Query pattern established for Stage Dossiers
7. Execution tracking functional (can log crew runs to DB)
8. Registration script created (Python scan → DB insert)

QUALITY GATES:
- ≥85% code review score on architecture decision doc
- Zero duplicate agent definitions (code and DB in sync)
- Stage Dossier team confirms can proceed with foundation
- All CrewAI tables have >0 rows (no empty registries)
- Query performance <100ms for agent/crew lookups

ACCEPTANCE CRITERIA:
- Documentation: Architecture decision document approved
- Database: crewai_agents, crewai_crews, crew_members populated
- Code: Registration script tested and verified
- Integration: Stage Dossier pilot can query agent metadata
- Testing: Can track execution of at least 1 crew to database`,

  dependencies: JSON.stringify([
    {
      type: 'blocks',
      sd_id: 'SD-STAGE-DOSSIER-001',
      reason: 'Stage Dossier system needs clean CrewAI foundation'
    },
    {
      type: 'related',
      sd_id: 'SD-VENTURE-UNIFICATION-001',
      reason: 'Venture unification uses CrewAI agents for stages'
    }
  ]),

  risks: JSON.stringify([
    {
      risk: 'Migration complexity if Python code must be refactored',
      severity: 'high',
      mitigation: 'Use hybrid approach: keep logic in code, metadata in DB'
    },
    {
      risk: 'Empty tables may indicate intentional separation',
      severity: 'medium',
      mitigation: 'Validate architecture decision with stakeholders first'
    },
    {
      risk: 'Two-week delay to Stage Dossier project',
      severity: 'medium',
      mitigation: 'Critical priority (P0) to minimize delay'
    }
  ]),

  metadata: JSON.stringify({
    discovery_date: '2025-11-05',
    discovery_context: 'Stage Operating Dossier Phase 0 discovery',
    python_platform_location: '/mnt/c/_EHG/ehg/agent-platform/',
    python_agents_count: '15+',
    python_crews_count: '15+',
    empty_tables: [
      'crewai_agents (EHG DB)',
      'crewai_crews (EHG DB)',
      'crew_members (EHG DB)',
      'ai_ceo_agents (EHG DB)',
      'agent_departments (EHG DB)',
      'agent_tools (EHG DB)',
      'crewai_flows (EHG_Engineer DB)',
      'crewai_flow_executions (EHG_Engineer DB)'
    ],
    operational_agents: [
      'market_sizing.py',
      'complexity_assessment.py',
      'ceo_agent.py',
      'coo_agent.py',
      'tech_feasibility.py',
      'regulatory_risk.py'
    ],
    operational_crews: [
      'quick_validation_crew.py',
      'deep_research_crew.py',
      'board_directors_crew.py',
      'hierarchical_crew.py',
      'sequential_crew.py'
    ],
    known_stage_mappings: {
      'Stage 1 (Draft Idea)': 'Python research agents',
      'Stage 2 (AI Review)': 'Python validation crews',
      'Stage 3 (Comprehensive Validation)': 'quick_validation_crew.py'
    },
    crewai_version: '0.70.1',
    fastapi_port: 8000,
    leo_stack_startup: 'bash scripts/leo-stack.sh start-agent'
  })
};

async function insertSD() {
  console.log('📋 Inserting SD-CREWAI-ARCHITECTURE-001...\n');

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Database insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }

    console.log('✅ SD-CREWAI-ARCHITECTURE-001 inserted successfully!\n');
    console.log('📊 Record Details:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Title: ${data.title}`);
    console.log(`   Priority: ${data.priority} (P0 - CRITICAL)`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Category: ${data.category}`);
    console.log(`   Estimated Effort: ${data.estimated_effort_hours} hours (2 weeks)`);

    console.log('\n📝 Next Steps:');
    console.log('1. LEAD Phase: Review and approve architecture assessment approach');
    console.log('2. PLAN Phase: Create detailed PRD with architecture options');
    console.log('3. EXEC Phase: Implement chosen architecture (populate tables)');
    console.log('4. Stage Dossier project can proceed with clean foundation');

    console.log('\n🔗 View in Dashboard:');
    console.log('   http://localhost:3000/dashboard (Strategic Directives section)');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

insertSD();
