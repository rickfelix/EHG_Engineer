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
  password: process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('🔍 Checking TESTING Sub-Agent Execution for SD-BOARD-GOVERNANCE-001');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Check if TESTING sub-agent was executed
    const testingResults = await client.query(`
      SELECT 
        sub_agent_code,
        sub_agent_name,
        verdict,
        confidence,
        created_at,
        detailed_analysis
      FROM sub_agent_execution_results
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
        AND sub_agent_code = 'TESTING'
      ORDER BY created_at DESC
    `);

    if (testingResults.rows.length === 0) {
      console.log('❌ TESTING sub-agent was NOT executed!');
      console.log('');
      console.log('LEO Protocol Violation:');
      console.log('   - QA Engineering Director (TESTING) is MANDATORY for PLAN verification');
      console.log('   - Dual test execution (unit + E2E) is REQUIRED');
      console.log('   - 100% user story E2E validation is REQUIRED for approval');
      console.log('');
    } else {
      console.log(`✅ TESTING sub-agent executed ${testingResults.rows.length} time(s)\n`);
      testingResults.rows.forEach((result, idx) => {
        console.log(`Execution ${idx + 1}:`);
        console.log(`   Verdict: ${result.verdict}`);
        console.log(`   Confidence: ${result.confidence}%`);
        console.log(`   Date: ${result.created_at}`);
        console.log('');
      });
    }

    // Check all sub-agent executions for this SD
    console.log('All Sub-Agent Executions:\n');
    const allResults = await client.query(`
      SELECT sub_agent_code, verdict, confidence, created_at
      FROM sub_agent_execution_results
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
      ORDER BY created_at
    `);

    if (allResults.rows.length === 0) {
      console.log('   None found');
    } else {
      allResults.rows.forEach(r => {
        console.log(`   ${r.sub_agent_code}: ${r.verdict} (${r.confidence}%) - ${r.created_at}`);
      });
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('RECOMMENDATION');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Execute QA Engineering Director v2.0 to:');
    console.log('1. Generate E2E test cases from 8 user stories');
    console.log('2. Verify infrastructure blocker claims');
    console.log('3. Attempt E2E test execution');
    console.log('4. Document actual test results with evidence');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
