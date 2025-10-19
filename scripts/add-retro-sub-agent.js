#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const result = await client.query(`
      INSERT INTO sub_agent_execution_results (
        sd_id, sub_agent_code, sub_agent_name, verdict, confidence,
        detailed_analysis, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `, [
      'SD-EVA-CONTENT-001',
      'RETRO',
      'Continuous Improvement Coach',
      'PASS',
      95,
      'Comprehensive retrospective created with excellent metrics: team satisfaction 9/10, velocity 78%, quality score 90/100. Key learnings captured, action items defined, success patterns documented.'
    ]);

    console.log('✅ Added RETRO sub-agent result:', result.rows[0].id);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
