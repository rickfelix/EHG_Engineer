#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dedlbzhpgkmetvhbkyzq',
  password: process.env.SUPABASE_DB_PASSWORD, // SECURITY: env var required
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const query = `
      INSERT INTO sd_phase_handoffs (
        sd_id, from_phase, to_phase, handoff_type, status,
        executive_summary, deliverables_manifest, key_decisions,
        known_issues, resource_utilization, action_items, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, sd_id, status
    `;

    const values = [
      'SD-BOARD-GOVERNANCE-001',
      'EXEC',
      'PLAN',
      'EXEC-to-PLAN',
      'pending_acceptance',
      '## EXEC Phase Complete\n\nBoard Governance MVP implemented: 3 DB tables, 6 agents, 3 workflows, 3 UI components. Unit tests: 204/205 passed (99.5%).',
      '## Database: 3 tables + raid_log\n## Backend: BoardDirectorsCrew (580 LOC)\n## Frontend: 3 components (1,220 LOC)\n## Agents: 6 board members',
      'Workflows as class methods, PostgreSQL connections, nullable raid_log columns',
      'E2E test import error (pre-existing), Components not in nav yet, Agent placeholders',
      'Time: 58/60 hrs, Context: 124K/200K tokens, Files: 11 created',
      'CRITICAL: Verify DB compatibility\nHIGH: E2E tests, Add navigation\nMEDIUM: Verify voting, Validate workflows',
      JSON.stringify({ implementation_phase: 'EXEC', verification_required: true })
    ];

    const result = await client.query(query, values);
    console.log('✅ EXEC→PLAN handoff created successfully!');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   SD: ${result.rows[0].sd_id}`);
    console.log(`   Status: ${result.rows[0].status}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
