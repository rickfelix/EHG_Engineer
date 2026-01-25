#!/usr/bin/env node

/**
 * Fix User Stories Quality for SD-VISION-V2-001
 * Addresses PLAN-TO-EXEC handoff quality gate failures
 */

import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Note: Story keys include SD-ID prefix
const LOW_SCORING_STORIES = [
  'SD-VISION-V2-001:US-002',
  'SD-VISION-V2-001:US-004',
  'SD-VISION-V2-001:US-005',
  'SD-VISION-V2-001:US-006',
  'SD-VISION-V2-001:US-009',
  'SD-VISION-V2-001:US-010',
  'SD-VISION-V2-001:US-011',
  'SD-VISION-V2-001:US-012'
];

async function fetchStories() {
  console.log('📖 Fetching low-scoring user stories...\n');

  const { data, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-VISION-V2-001')
    .in('story_key', LOW_SCORING_STORIES)
    .order('story_key');

  if (error) {
    console.error('❌ Error fetching stories:', error);
    process.exit(1);
  }

  return data;
}

async function updateStory(storyKey, updates) {
  const { error } = await supabase
    .from('user_stories')
    .update(updates)
    .eq('story_key', storyKey)
    .eq('sd_id', 'SD-VISION-V2-001');

  if (error) {
    console.error(`❌ Error updating ${storyKey}:`, error);
    return false;
  }

  console.log(`✅ Updated ${storyKey}`);
  return true;
}

// Story-specific improvements based on quality gate failures
// Focus: Database deployment and EVA agent workflow stories
const STORY_IMPROVEMENTS = {
  'SD-VISION-V2-001:US-002': {
    user_benefit: 'Establishes the foundational data model for venture portfolio management, enabling EVA agents to track, analyze, and optimize venture performance across the entire lifecycle from inception through exit. Without these core tables, no venture operations or AI crew coordination can function.',
    acceptance_criteria: [
      'Given the migration script is executed, When the DBA runs the Core Tables migration, Then portfolios table is created with columns: id, name, description, created_at, owner_id and appropriate constraints (PK, NOT NULL, FK to users)',
      'Given the migration completes successfully, When querying information_schema, Then ventures table exists with all required columns: id, portfolio_id, name, stage_id, status, metrics (JSONB), created_at and foreign key relationships to portfolios and venture_stages are enforced',
      'Given the migration completes successfully, When querying information_schema, Then crewai_crews table exists with columns: id, crew_name, crew_type, agent_composition (JSONB), capabilities (JSONB), status and appropriate indexes for crew_name and crew_type lookups',
      'Given all tables are created, When the DBA tests basic CRUD operations, Then INSERT, SELECT, UPDATE, DELETE operations succeed on all three tables with proper referential integrity enforcement (e.g., cannot delete portfolio if ventures exist)'
    ],
    implementation_context: {
      migration_file: 'Create database/migrations/002_core_tables.sql with CREATE TABLE statements. Follow naming conventions: snake_case, singular table names avoided, use created_at/updated_at timestamps.',
      schema_design: 'portfolios: Primary entity for grouping ventures. ventures: Core business entity with JSONB for flexible metrics. crewai_crews: Registry of AI agent teams with capability metadata.',
      indexes: 'Add indexes: portfolios(owner_id), ventures(portfolio_id, stage_id, status), crewai_crews(crew_name, crew_type). Use GIN index for JSONB columns if querying nested fields.',
      rls_policies: 'Enable RLS on all tables. Create policies: portfolios (owner can CRUD), ventures (portfolio owner can CRUD), crewai_crews (admin only can write, all can read).',
      rollback: 'Create corresponding down migration: 003_rollback_core_tables.sql with DROP TABLE statements in reverse dependency order.'
    }
  },

  'SD-VISION-V2-001:US-004': {
    user_benefit: 'Enables EVA to automatically process incoming business opportunities through AI-powered analysis and blueprint generation, transforming raw deal flow into structured, actionable venture proposals that can be rapidly evaluated and prioritized for investment decisions.',
    acceptance_criteria: [
      'Given the Opportunity Discovery migration runs, When executed successfully, Then opportunities table is created with columns: id, source (email/form/api), raw_content (JSONB), status (new/analyzing/blueprinted/rejected), created_at and ingestion_metadata (JSONB) for tracking source details',
      'Given opportunities table exists, When the migration completes, Then ai_blueprints table is created with columns: id, opportunity_id (FK), blueprint_data (JSONB containing business model, market analysis, risk assessment), confidence_score (0-100), generated_at, and approved_by (FK to users)',
      'Given both tables are created, When testing foreign key relationships, Then deleting an opportunity cascades to delete its ai_blueprints OR raises error preventing deletion if blueprints exist (based on business rule choice)',
      'Given EVA ingests a test opportunity, When the opportunity record is inserted, Then triggers or functions automatically set status="analyzing" and log ingestion_metadata with timestamp, source type, and user_id if applicable'
    ],
    implementation_context: {
      migration_file: 'database/migrations/004_opportunity_discovery.sql. Include both table creation and any triggers/functions for status automation.',
      jsonb_structure: 'raw_content: {subject, body, attachments[], sender}. blueprint_data: {executive_summary, market_size, competitive_landscape, revenue_model, risk_factors[], recommendation}.',
      triggers: 'CREATE TRIGGER set_opportunity_analyzing BEFORE INSERT ON opportunities to auto-set status. CREATE FUNCTION validate_blueprint_score() to ensure confidence_score is 0-100.',
      integration_points: 'opportunities.source links to external ingestion APIs (email parser, web form, Zapier). ai_blueprints.opportunity_id links to opportunities for 1:N relationship (multiple blueprint versions).',
      testing: 'Include test data: INSERT sample opportunity with mock email content. Verify trigger sets status correctly. Query ai_blueprints to confirm FK constraint works.'
    }
  },

  'SD-VISION-V2-001:US-005': {
    user_benefit: 'Creates transparent audit trail of all directives from Rick through EVA to crewAI execution, ensuring accountability, enabling debugging of agent decisions, and providing historical context for retrospective analysis of what instructions led to what outcomes.',
    acceptance_criteria: [
      'Given the Command Chain migration executes, When completed successfully, Then directives table exists with columns: id, issuer_id (FK to users), directive_text, intent_classification (JSONB), status (pending/claimed/executing/completed/failed), issued_at, priority (1-5) and metadata (JSONB)',
      'Given directives table is created, When the migration finishes, Then task_leases table exists with columns: id, directive_id (FK), agent_id (varchar for EVA agent identifier), claimed_at, lease_expires_at, heartbeat_at, status (active/expired/released) for distributed task coordination',
      'Given both tables exist, When testing the schema, Then delegation_chain table is created with columns: id, directive_id (FK), from_agent (varchar), to_agent (varchar), delegation_reason (text), delegated_at to track Rick→EVA→crew delegation path',
      'Given a directive is inserted, When queried with joins, Then the full command chain can be reconstructed: SELECT directive + task_lease + delegation_chain to show who issued what, which agent claimed it, and how it was delegated downstream'
    ],
    implementation_context: {
      migration_file: 'database/migrations/005_command_chain.sql. Include tables + indexes for directive_id, agent_id, and timestamp columns for performance.',
      command_flow: 'Rick issues directive → EVA classifies intent → EVA creates task_lease → EVA delegates to crew → crew records in delegation_chain. All tracked in database.',
      lease_management: 'task_leases.lease_expires_at prevents zombie tasks. Heartbeat mechanism: UPDATE task_leases SET heartbeat_at=NOW() WHERE id=X every 30 seconds. Expired leases are auto-released by cleanup job.',
      intent_classification: 'directive.intent_classification JSONB stores NLP output: {category: "venture_analysis", confidence: 0.95, extracted_entities: {venture_name: "Acme Corp"}}.',
      audit_queries: 'Create view v_command_chain_full that joins all three tables for easy audit trail querying. Index directive_id, agent_id, timestamps for fast lookups.'
    }
  },

  'SD-VISION-V2-001:US-006': {
    user_benefit: 'Enforces structured venture lifecycle progression through 25 defined stages with mandatory quality gates, preventing ventures from advancing prematurely and ensuring each stage completion criteria is met before capital deployment or strategic commitments are made.',
    acceptance_criteria: [
      'Given the Venture Stage Management migration runs, When completed, Then venture_stages table exists with all 25 stages pre-seeded with columns: id (1-25), stage_name, stage_number, description, typical_duration_days, gate_criteria (JSONB array of checkpoint requirements)',
      'Given venture_stages exists, When the migration finishes, Then stage_gates table is created with columns: id, venture_id (FK), stage_id (FK), gate_status (pending/passed/failed), assessed_at, assessor_id (FK to users), assessment_notes (text), criteria_results (JSONB)',
      'Given both tables exist, When a venture attempts stage transition, Then database function check_stage_gate_passed(venture_id, current_stage_id) returns boolean TRUE only if all gate criteria for that stage have gate_status="passed" in stage_gates table',
      'Given stage gate data exists, When querying venture progress, Then join ventures + venture_stages + stage_gates shows current stage, gate pass/fail status, and blockers preventing advancement to next stage'
    ],
    implementation_context: {
      migration_file: 'database/migrations/006_venture_stage_management.sql. Include CREATE TABLE + seed data INSERT for 25 stages + CREATE FUNCTION for gate checking.',
      stage_definitions: 'venture_stages seed data: Stage 1 (Idea Validation), Stage 2 (Market Research), ... Stage 25 (Exit/Liquidity). Each with gate_criteria JSONB: [{criterion: "Market size >$100M", type: "quantitative", required: true}].',
      gate_enforcement: 'Function: CREATE FUNCTION check_stage_gate_passed(v_id, s_id) RETURNS boolean. Logic: SELECT COUNT(*) FROM stage_gates WHERE venture_id=v_id AND stage_id=s_id AND gate_status="passed" AND required=true = total required criteria.',
      transitions: 'Trigger on ventures table: BEFORE UPDATE OF stage_id, call check_stage_gate_passed(). If FALSE, RAISE EXCEPTION "Stage gate not passed, cannot advance". Prevent manual stage jumping.',
      reporting: 'Create view v_venture_stage_progress: venture details + current stage + gate completion % + estimated days remaining based on typical_duration_days.'
    }
  },

  'SD-VISION-V2-001:US-009': {
    user_benefit: 'Provides complete observability into EVA agent runtime behavior including task execution, decision reasoning, and inter-agent communication, enabling rapid debugging of agent failures, performance optimization, and compliance auditing of autonomous AI actions.',
    acceptance_criteria: [
      'Given the Blue Sky Architecture migration executes, When completed, Then agent_runtime_logs table exists with columns: id, agent_id (varchar), event_type (task_start/decision/communication/error), event_data (JSONB), timestamp, execution_context (JSONB with session_id, parent_task_id) for distributed tracing',
      'Given runtime logging is active, When an EVA agent performs any action, Then an entry is automatically inserted into agent_runtime_logs with event_type matching the action, event_data containing relevant parameters, and execution_context linking to parent tasks for trace reconstruction',
      'Given agent communication occurs, When one agent sends a message to another, Then agent_communication_log table records: id, from_agent_id, to_agent_id, message_type, message_payload (JSONB), sent_at, received_at, acknowledged_at for full message tracking',
      'Given agent errors occur, When an exception is raised during task execution, Then error details are logged to agent_runtime_logs with event_type="error", event_data containing {error_class, error_message, stack_trace, context} and alerting triggers notify monitoring systems'
    ],
    implementation_context: {
      migration_file: 'database/migrations/009_blue_sky_architecture.sql. Include tables for runtime_logs, communication_logs, and error tracking.',
      logging_strategy: 'agent_runtime_logs is append-only, high-volume table. Use partitioning by timestamp (monthly partitions) for performance. Retention policy: keep 90 days, archive older to S3.',
      tracing: 'execution_context.session_id = UUID for request tracing. execution_context.parent_task_id enables building task dependency graphs. Use recursive CTE to query full task tree.',
      observability_tools: 'Create materialized view mv_agent_performance: agent_id, avg_task_duration, error_rate, task_count for dashboards. Refresh every 5 minutes.',
      integration: 'Agent SDKs must call log_agent_event(agent_id, event_type, event_data) function after each significant action. Function handles JSONB serialization and timestamp.'
    }
  },

  'SD-VISION-V2-001:US-010': {
    user_benefit: 'Enables natural language interaction with EVA without requiring Rick to learn specific command syntax or navigate complex UIs, accelerating directive issuance and reducing cognitive load by allowing business intent expression in plain English that EVA automatically translates to structured crewAI task assignments.',
    acceptance_criteria: [
      'Given Rick types a natural language directive like "Analyze the Acme Corp opportunity and generate investment memo", When submitted through EVA interface, Then EVA NLP engine parses the text, extracts intent (venture_analysis), entities (company: Acme Corp, output: investment_memo), and creates directive record in directives table',
      'Given EVA receives a parsed directive, When intent classification completes with confidence >80%, Then EVA automatically selects the appropriate crewAI crew (e.g., VentureAnalysisCrew) from crewai_crews table based on intent→crew mapping and creates task delegation in delegation_chain table',
      'Given intent confidence is <80% (ambiguous directive), When EVA cannot confidently classify, Then EVA prompts Rick with clarification questions: "Did you mean: A) Analyze financials, B) Analyze market fit, C) Both?" and waits for Rick response before proceeding',
      'Given EVA delegates to a crew, When delegation completes, Then Rick receives confirmation message: "Directive received. VentureAnalysisCrew is analyzing Acme Corp. Estimated completion: 2 hours. I will notify you when ready." with task tracking link'
    ],
    implementation_context: {
      nlp_engine: 'Use OpenAI GPT-4 or Claude for intent classification. System prompt: "Extract intent category and entities from this venture directive." Parse JSON response: {intent, entities[], confidence}.',
      intent_mapping: 'Create intent_crew_mapping table: intent_category (varchar), crew_name (FK to crewai_crews), priority. Query this table after classification to determine which crew handles which intent.',
      workflow: 'Rick input → EVA /api/directives POST → NLP parse → confidence check → if >80%: auto-delegate, else: ask clarification → create directive record → create delegation_chain → return confirmation.',
      ui_components: 'Simple textarea for directive input. Submit button. Response area showing EVA acknowledgment or clarification questions. Task tracking panel showing active directives status.',
      error_handling: 'If NLP API fails, log error, show Rick: "EVA is temporarily unavailable. Please try again." Store directive as status="pending_nlp" for retry queue.'
    }
  },

  'SD-VISION-V2-001:US-011': {
    user_benefit: 'Provides Rick with comprehensive daily situational awareness of portfolio health, pending critical decisions, and anomalies requiring executive attention, consolidating information from multiple systems into one prioritized briefing that saves 30+ minutes of manual status checking every morning.',
    acceptance_criteria: [
      'Given Rick logs in each morning, When accessing the Briefing page, Then EVA generates a briefing showing: 1) Portfolio summary (total ventures, by stage, capital deployed), 2) Ventures requiring decisions (stage gates pending approval, budget variance >10%), 3) Yesterday key events (new opportunities, completed analyses, crew task completions)',
      'Given the briefing loads portfolio data, When displaying venture status, Then each venture shows current stage, days in stage vs typical duration (flag if >20% over), gate pass/fail status, and RAG health indicator (Red/Amber/Green based on predefined metrics)',
      'Given pending decisions exist, When the briefing highlights them, Then each decision shows context: venture name, decision type (stage gate approval, budget increase, exit recommendation), recommendation from EVA/crew with confidence score, and action buttons (Approve/Reject/Defer)',
      'Given Rick clicks an action button, When processing the decision, Then the system records decision in decisions_log table with Rick user_id, decision timestamp, action taken, and propagates changes (e.g., Approve stage gate → UPDATE ventures SET stage_id=stage_id+1, UPDATE stage_gates SET gate_status="passed")'
    ],
    implementation_context: {
      briefing_query: 'CREATE FUNCTION generate_daily_briefing(user_id) RETURNS JSONB. Aggregates data from portfolios, ventures, stage_gates, opportunities, agent_runtime_logs (yesterday events). Cache result for 5 minutes.',
      rag_calculation: 'Health score formula: Green (on-time, in-budget, gates passing), Amber (10-20% over time/budget OR 1 gate failed), Red (>20% over OR 2+ gates failed OR critical error in logs).',
      ui_components: 'Dashboard with 3 sections: Portfolio Overview (charts), Decision Queue (sortable table with action buttons), Recent Activity (timeline of events). Use shadcn/ui components.',
      decisions_log: 'Table: id, user_id, venture_id, decision_type, action (approved/rejected/deferred), decision_notes, decided_at. Audit trail for all executive decisions.',
      real_time_updates: 'Use Supabase real-time subscriptions on ventures and stage_gates tables to auto-refresh briefing when data changes (e.g., crew completes analysis while Rick is viewing briefing).'
    }
  },

  'SD-VISION-V2-001:US-012': {
    user_benefit: 'Prevents duplicate work and race conditions in distributed multi-agent system by implementing atomic task claiming with time-based leases, ensuring exactly-once task execution even when multiple EVA agent instances are running concurrently across different processes or servers.',
    acceptance_criteria: [
      'Given a new directive is created with status="pending", When an idle EVA agent queries for available tasks, Then the agent executes atomic claim operation: UPDATE directives SET status="claimed", claimed_by=agent_id, claimed_at=NOW(), lease_expires_at=NOW() + interval "5 minutes" WHERE id=X AND status="pending" RETURNING * and receives the directive only if update succeeded',
      'Given an agent successfully claims a task, When the agent begins execution, Then the agent starts heartbeat mechanism: UPDATE directives SET lease_expires_at=NOW() + interval "5 minutes", heartbeat_at=NOW() WHERE id=X AND claimed_by=agent_id every 60 seconds to prevent lease expiration',
      'Given an agent fails or crashes mid-execution, When the lease_expires_at timestamp passes without heartbeat, Then a cleanup job (cron function) runs every 2 minutes: UPDATE directives SET status="pending", claimed_by=NULL WHERE status="claimed" AND lease_expires_at < NOW() to release expired leases for retry by other agents',
      'Given multiple agents attempt to claim the same task simultaneously, When concurrent UPDATE queries execute, Then database serialization ensures only ONE agent update succeeds (returns row), others return zero rows, preventing duplicate execution, and failed claimants immediately query for next available task'
    ],
    implementation_context: {
      atomic_claim: 'Use PostgreSQL row-level locking with UPDATE...WHERE...RETURNING pattern. This is atomic - no explicit transactions needed for single-statement claim.',
      lease_duration: 'Default 5 minutes for most tasks. Configurable per directive_type. Long-running analyses may need 30-minute leases. Store in directive_types.default_lease_duration.',
      heartbeat_pattern: 'Agent SDK includes heartbeat_manager.start(directive_id, interval=60) that runs background thread/async task to UPDATE heartbeat every 60 sec until task completes.',
      cleanup_job: 'Deploy PostgreSQL cron extension: SELECT cron.schedule("release-expired-leases", "*/2 * * * *", $$UPDATE directives SET status="pending", claimed_by=NULL WHERE status="claimed" AND lease_expires_at < NOW()$$);',
      monitoring: 'Create metrics: lease_expiration_rate (% of tasks that expired without completion), claim_contention (# of failed claim attempts), average_task_duration. Alert if lease_expiration_rate >5%.'
    }
  }
};

async function main() {
  console.log('🔧 User Story Quality Fixer for SD-VISION-V2-001\n');
  console.log('Targets: benefit_articulation, given_when_then_format, story_independence_implementability\n');

  const stories = await fetchStories();

  console.log(`Found ${stories.length} stories to fix:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const story of stories) {
    console.log(`\n📝 ${story.story_key}: ${story.title}`);
    console.log(`   Current benefit length: ${story.user_benefit?.length || 0} chars`);
    console.log(`   Current AC count: ${story.acceptance_criteria?.length || 0}`);

    const improvements = STORY_IMPROVEMENTS[story.story_key];

    if (!improvements) {
      console.log(`   ⚠️  No improvements defined for ${story.story_key}`);
      failCount++;
      continue;
    }

    const updates = {
      user_benefit: improvements.user_benefit,
      acceptance_criteria: improvements.acceptance_criteria,
      implementation_context: improvements.implementation_context,
      updated_at: new Date().toISOString()
    };

    const success = await updateStory(story.story_key, updates);

    if (success) {
      successCount++;
      console.log(`   ✅ New benefit length: ${improvements.user_benefit.length} chars`);
      console.log(`   ✅ New AC count: ${improvements.acceptance_criteria.length} (Given-When-Then format)`);
      console.log('   ✅ Enhanced implementation context');
    } else {
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Successfully updated: ${successCount} stories`);
  console.log(`❌ Failed: ${failCount} stories`);
  console.log('='.repeat(60));

  if (successCount > 0) {
    console.log('\n📊 Next steps:');
    console.log('1. Clear AI assessment cache by running quality gate with AI_SKIP_CACHE=true');
    console.log('2. Re-run handoff validation: npm run handoff:validate SD-VISION-V2-001');
    console.log('3. Target: Average score should improve from 67% to 75%+');
  }
}

main().catch(console.error);
