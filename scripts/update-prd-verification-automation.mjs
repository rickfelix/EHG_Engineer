import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  try {
    const client = await createDatabaseClient('engineer', { verify: false });

    const result = await client.query(`
      UPDATE product_requirements_v2
      SET
        title = 'PRD: Automated Database Verification & Schema Health Monitoring',
        executive_summary = 'Implement automated GitHub Actions workflow to verify database schema and connection health for Stage 5 recursion and CrewAI infrastructure. Prevents false positive "table not found" errors caused by connection misconfiguration (L16 lesson).',
        business_context = 'Stage 5 review revealed L16 (Verification vs Configuration) gap: initial assessment incorrectly identified database as "not deployed" due to querying wrong database (EHG_Engineer governance DB instead of EHG application DB). Database was actually deployed 2025-11-03. Automation prevents future wasted effort.',
        technical_context = 'Database schema (recursion_events, crewai_agents, crewai_crews, crewai_tasks, llm_recommendations) deployed via migrations on 2025-11-03 and 2025-11-06. Verification requires correct connection config: VITE_SUPABASE_URL (liapbndqlqxdcgpwntbv application DB) not governance DB (dedlbzhpgkmetvhbkyzq).',
        acceptance_criteria = jsonb_build_array(
          'GitHub Actions workflow runs daily (cron) and on-demand (workflow_dispatch)',
          'Verification script checks all 5 Stage 5 tables using to_regclass() queries',
          'Script uses correct database connection config (application DB liapbndqlqxdcgpwntbv, not governance DB)',
          'Alerts triggered on actual table missing or connection failure (Slack/email notification)',
          'RLS policies verified active on all tables',
          '/docs/reference/database-connection-patterns.md created with correct vs incorrect examples',
          'Stage N review template updated with connection verification step',
          'Zero false positives in 7-day monitoring period'
        ),
        functional_requirements = jsonb_build_array(
          jsonb_build_object('id', 'FR-1', 'priority', 'HIGH', 'requirement', 'Daily automated verification of all 5 Stage 5 database tables via GitHub Actions'),
          jsonb_build_object('id', 'FR-2', 'priority', 'HIGH', 'requirement', 'Connection health check validates correct database target (application DB) before running queries'),
          jsonb_build_object('id', 'FR-3', 'priority', 'MEDIUM', 'requirement', 'Slack/email alerts on verification failure with connection diagnostics'),
          jsonb_build_object('id', 'FR-4', 'priority', 'MEDIUM', 'requirement', 'RLS policy verification for each table'),
          jsonb_build_object('id', 'FR-5', 'priority', 'LOW', 'requirement', 'Verification history logged to database (verification_audit table)')
        ),
        test_scenarios = jsonb_build_array(
          jsonb_build_object('id', 'TS-1', 'scenario', 'Verify workflow runs on schedule (daily cron)', 'test_type', 'integration'),
          jsonb_build_object('id', 'TS-2', 'scenario', 'Verify workflow detects actually missing table', 'test_type', 'integration'),
          jsonb_build_object('id', 'TS-3', 'scenario', 'Verify workflow does NOT false-positive on connection misconfiguration', 'test_type', 'integration'),
          jsonb_build_object('id', 'TS-4', 'scenario', 'Verify RLS policy check returns correct status', 'test_type', 'unit'),
          jsonb_build_object('id', 'TS-5', 'scenario', 'Verify alert sent on failure', 'test_type', 'integration')
        ),
        metadata = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{lessons_applied}',
                '["L11", "L15", "L16"]'::jsonb
              ),
              '{repurposed_from}',
              '"SD-STAGE5-DB-SCHEMA-DEPLOY-001 deployment to verification automation"'
            ),
            '{lesson_references}',
            jsonb_build_object(
              'L11', 'Verification-First Pattern',
              'L15', 'Database-First Completion',
              'L16', 'Verification vs Configuration (Stage 5 discovery)'
            )
          ),
          '{governance_update_date}',
          '"2025-11-08"'
        ),
        priority = 'medium',
        updated_at = NOW()
      WHERE id = 'PRD-SD-STAGE5-DB-SCHEMA-DEPLOY-001'
      RETURNING id, title, status, priority, updated_at
    `);

    if (result.rows.length > 0) {
      const prd = result.rows[0];
      console.log('✅ PRD Updated Successfully');
      console.log('ID:', prd.id);
      console.log('Title:', prd.title);
      console.log('Status:', prd.status);
      console.log('Priority:', prd.priority);
      console.log('Updated:', prd.updated_at);
    } else {
      console.log('❌ PRD update failed - no rows returned');
    }

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
