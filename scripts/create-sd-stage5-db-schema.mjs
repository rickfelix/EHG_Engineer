import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for INSERT

if (!supabaseKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Insert Strategic Directive
const sdData = {
  id: 'SD-STAGE5-DB-SCHEMA-DEPLOY-001',
  sd_key: 'SD-STAGE5-DB-SCHEMA-DEPLOY-001',
  title: 'Deploy Stage 5 Database Schema & Verification for Recursion + CrewAI Registry',
  priority: 'critical',
  category: 'database',
  sd_type: 'database',
  current_phase: 'LEAD',
  status: 'draft',
  description: 'Deploy missing database migrations for recursion_events and crewai_agents tables to unblock Stage 5 runtime. Existing code path (recursionEngine.ts + Stage5ROIValidator.tsx + E2E tests) fully implemented but blocked by missing database infrastructure.',
  rationale: 'Stage 5 review identified CRITICAL gaps where database tables referenced in production code (recursion_events, crewai_agents, crewai_crews, crewai_tasks) do not exist, causing "relation does not exist" runtime errors. Migration files exist but have not been deployed to the EHG application database.',
  scope: 'Deploy 4 missing database tables (recursion_events, crewai_agents, crewai_crews, crewai_tasks) with RLS policies and indexes. Verify runtime code can successfully insert records. Execute E2E tests to confirm functionality. Document baseline and verification results.',
  strategic_objectives: [
    { objective: 'Deploy recursion_events table to EHG database', metric: 'Table exists query returns TRUE' },
    { objective: 'Deploy CrewAI registry tables (agents, crews, tasks)', metric: 'All 3 tables exist' },
    { objective: 'Verify RLS policies configured', metric: 'All 4 tables have RLS policies' },
    { objective: 'Verify indexes created', metric: 'Performance indexes present' },
    { objective: 'Runtime code validation', metric: 'INSERT operations succeed' },
    { objective: 'E2E test execution', metric: '20/20 scenarios pass' },
    { objective: 'Documentation complete', metric: 'Verification.md file created' }
  ],
  success_criteria: [
    { criterion: 'Tables exist', measure: 'SELECT to_regclass returns non-NULL for all 4 tables' },
    { criterion: 'Columns present', measure: 'All required columns exist per schema spec' },
    { criterion: 'RLS policies active', measure: 'pg_policies shows policies for each table' },
    { criterion: 'Indexes created', measure: 'pg_indexes shows expected indexes' },
    { criterion: 'Runtime INSERT works', measure: 'recursionEngine.ts successfully inserts events' },
    { criterion: 'E2E tests pass', measure: 'recursion-workflows.spec.ts runs without errors' }
  ],
  dependencies: [
    { dependency: 'Migration file: 20251103131938_create_recursion_events_table.sql', type: 'technical', status: 'ready' },
    { dependency: 'CrewAI tables migration file (to be located)', type: 'technical', status: 'pending' },
    { dependency: 'EHG database connection (liapbndqlqxdcgpwntbv)', type: 'technical', status: 'ready' }
  ],
  risks: [
    { risk: 'Migration file not found for CrewAI tables', severity: 'high', mitigation: 'Database agent will locate or create migration' },
    { risk: 'RLS policies block runtime operations', severity: 'medium', mitigation: 'Database agent designs proper policies or documents manual steps' },
    { risk: 'Existing data conflicts', severity: 'low', mitigation: 'Baseline verification confirms tables do not exist' }
  ],
  target_application: 'EHG',
  sequence_rank: 1,
  metadata: {
    source_stage: 5,
    source_stage_name: 'Stage 5 — Profitability & Recursion',
    spawned_from_review: true,
    review_date: '2025-11-07',
    review_decision_file: '/docs/workflow/stage_reviews/stage-05/04_decision_record.md',
    lessons_drivers: ['L1','L2','L4','L8','L11','L14','L15'],
    crewai_verified: false,
    db_readiness: 'pending',
    migration_files: [
      '/mnt/c/_EHG/ehg/supabase/migrations/20251103131938_create_recursion_events_table.sql',
      'crewai_agents migration (to be located)'
    ],
    blocking_code: [
      '/mnt/c/_EHG/ehg/src/services/recursionEngine.ts:268-272',
      '/mnt/c/_EHG/ehg/src/components/ventures/Stage5ROIValidator.tsx:95-99'
    ],
    target_database: 'EHG (liapbndqlqxdcgpwntbv)',
    repository: '/mnt/c/_EHG/ehg/'
  }
};

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sdData])
    .select('id, sd_key, title, priority, status, current_phase, uuid_id, created_at');

  if (error) {
    console.error('ERROR inserting SD:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }

  console.log('✅ SD Created Successfully:');
  console.log('');
  console.log('ID:', data[0].id);
  console.log('UUID:', data[0].uuid_id);
  console.log('Key:', data[0].sd_key);
  console.log('Title:', data[0].title);
  console.log('Priority:', data[0].priority, '(CRITICAL)');
  console.log('Status:', data[0].status);
  console.log('Phase:', data[0].current_phase);
  console.log('Created:', data[0].created_at);
  console.log('');
  console.log('🎯 Next Step: Invoke database agent');
  console.log('Command: node lib/sub-agent-executor.js DATABASE', data[0].uuid_id);
})();
