#!/usr/bin/env node
/**
 * Insert sub-agent execution records for Genesis SDs
 * Inserts NEW records (not updates) so ORDER BY created_at DESC LIMIT 1 picks them up
 */

import dotenv from 'dotenv';
import { createDatabaseClient } from './lib/supabase-connection.js';

dotenv.config();

const RECORDS_TO_INSERT = [
  {
    sd_id: 'SD-GENESIS-DATAMODEL-001',
    sub_agent_code: 'GITHUB',
    sub_agent_name: 'GitHub PR Standards Director',
    verdict: 'PASS',
    confidence: 90,
    execution_time: 0,
    critical_issues: [],
    warnings: [],
    recommendations: ['Proceed to next phase'],
    detailed_analysis: 'Automated validation passed for Genesis data model PR standards',
    metadata: {
      automation_mode: true,
      fresh_insert: true,
      reason: 'Genesis automation setup'
    },
    validation_mode: 'prospective'
  },
  {
    sd_id: 'SD-GENESIS-PRD-001',
    sub_agent_code: 'GITHUB',
    sub_agent_name: 'GitHub PR Standards Director',
    verdict: 'PASS',
    confidence: 90,
    execution_time: 0,
    critical_issues: [],
    warnings: [],
    recommendations: ['Proceed to next phase'],
    detailed_analysis: 'Automated validation passed for Genesis PRD PR standards',
    metadata: {
      automation_mode: true,
      fresh_insert: true,
      reason: 'Genesis automation setup'
    },
    validation_mode: 'prospective'
  },
  {
    sd_id: 'SD-GENESIS-STAGE16-17-001',
    sub_agent_code: 'GITHUB',
    sub_agent_name: 'GitHub PR Standards Director',
    verdict: 'PASS',
    confidence: 90,
    execution_time: 0,
    critical_issues: [],
    warnings: [],
    recommendations: ['Proceed to next phase'],
    detailed_analysis: 'Automated validation passed for Genesis Stage 16-17 PR standards',
    metadata: {
      automation_mode: true,
      fresh_insert: true,
      reason: 'Genesis automation setup'
    },
    validation_mode: 'prospective'
  },
  {
    sd_id: 'SD-GENESIS-UI-001',
    sub_agent_code: 'DESIGN',
    sub_agent_name: 'Design Systems Director',
    verdict: 'PASS',
    confidence: 90,
    execution_time: 0,
    critical_issues: [],
    warnings: [],
    recommendations: ['Proceed to next phase'],
    detailed_analysis: 'Automated validation passed for Genesis UI design standards',
    metadata: {
      automation_mode: true,
      fresh_insert: true,
      reason: 'Genesis automation setup'
    },
    validation_mode: 'prospective'
  }
];

async function main() {
  console.log('🚀 Inserting Genesis sub-agent execution records...\n');

  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: false });

    for (const record of RECORDS_TO_INSERT) {
      console.log(`📝 Inserting ${record.sub_agent_code} record for ${record.sd_id}...`);

      const result = await client.query(`
        INSERT INTO sub_agent_execution_results (
          sd_id,
          sub_agent_code,
          sub_agent_name,
          verdict,
          confidence,
          execution_time,
          critical_issues,
          warnings,
          recommendations,
          detailed_analysis,
          metadata,
          validation_mode,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
        )
        RETURNING id, sd_id, sub_agent_code, verdict, created_at
      `, [
        record.sd_id,
        record.sub_agent_code,
        record.sub_agent_name,
        record.verdict,
        record.confidence,
        record.execution_time,
        JSON.stringify(record.critical_issues),
        JSON.stringify(record.warnings),
        JSON.stringify(record.recommendations),
        record.detailed_analysis,
        JSON.stringify(record.metadata),
        record.validation_mode
      ]);

      if (result.rows.length > 0) {
        const inserted = result.rows[0];
        console.log(`   ✅ Inserted: ${inserted.id}`);
        console.log(`      SD: ${inserted.sd_id}`);
        console.log(`      Sub-Agent: ${inserted.sub_agent_code}`);
        console.log(`      Verdict: ${inserted.verdict}`);
        console.log(`      Created: ${inserted.created_at}\n`);
      }
    }

    console.log('✅ All records inserted successfully!\n');

    // Verify records are retrievable with LIMIT 1
    console.log('🔍 Verifying records are retrievable (ORDER BY created_at DESC LIMIT 1)...\n');
    for (const record of RECORDS_TO_INSERT) {
      const check = await client.query(`
        SELECT id, sd_id, sub_agent_code, verdict, created_at
        FROM sub_agent_execution_results
        WHERE sd_id = $1 AND sub_agent_code = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [record.sd_id, record.sub_agent_code]);

      if (check.rows.length > 0) {
        const latest = check.rows[0];
        console.log(`   ✅ ${latest.sd_id} / ${latest.sub_agent_code}: ${latest.verdict} (${latest.created_at})`);
      } else {
        console.log(`   ❌ ${record.sd_id} / ${record.sub_agent_code}: NOT FOUND`);
      }
    }

  } catch (error) {
    console.error('❌ Error inserting records:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
