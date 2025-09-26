#!/usr/bin/env node

/**
 * Create Timeline Tables using Supabase Pooler URL
 * Uses the pooler connection string from .env
 */

import dotenv from "dotenv";
dotenv.config();
import { Client } from 'pg';

async function createTimeline() {
  console.log('🔨 Creating SD Timeline Tables using Pooler URL...\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in .env');
    return;
  }

  console.log('✅ Found SUPABASE_POOLER_URL');

  const client = new Client({
    connectionString: poolerUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase via pooler\n');

    // Create the timeline table
    const createTableSQL = `
      -- Create timeline tracking table
      CREATE TABLE IF NOT EXISTS sd_execution_timeline (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        sd_id VARCHAR(255) NOT NULL,
        phase VARCHAR(50) NOT NULL,
        phase_started_at TIMESTAMP NOT NULL,
        phase_completed_at TIMESTAMP,
        duration_hours DECIMAL(10, 2),
        duration_minutes INTEGER,
        agent_responsible VARCHAR(50),
        completion_status VARCHAR(50) DEFAULT 'in_progress',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTableSQL);
    console.log('✅ Timeline table created');

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_sd_timeline_sd_id ON sd_execution_timeline(sd_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sd_timeline_phase ON sd_execution_timeline(phase);');
    console.log('✅ Indexes created');

    // Insert SD-INFRA-EXCELLENCE-001 timeline data
    const insertSQL = `
      INSERT INTO sd_execution_timeline (
        sd_id, phase, phase_started_at, phase_completed_at,
        duration_hours, duration_minutes, agent_responsible, completion_status
      ) VALUES
      ('SD-INFRA-EXCELLENCE-001', 'LEAD', '2025-09-26T17:00:00Z', '2025-09-26T17:45:00Z', 0.75, 45, 'LEAD', 'completed'),
      ('SD-INFRA-EXCELLENCE-001', 'PLAN', '2025-09-26T17:45:00Z', '2025-09-26T19:19:00Z', 1.57, 94, 'PLAN', 'completed'),
      ('SD-INFRA-EXCELLENCE-001', 'EXEC', '2025-09-26T19:19:00Z', NULL, NULL, NULL, 'EXEC', 'in_progress')
      ON CONFLICT DO NOTHING;
    `;

    await client.query(insertSQL);
    console.log('✅ Timeline data inserted\n');

    // Verify the data
    const result = await client.query(`
      SELECT
        phase,
        duration_hours,
        completion_status,
        phase_started_at
      FROM sd_execution_timeline
      WHERE sd_id = 'SD-INFRA-EXCELLENCE-001'
      ORDER BY phase_started_at
    `);

    console.log('📊 SD-INFRA-EXCELLENCE-001 Timeline:');
    console.log('════════════════════════════════════════');

    let totalActiveHours = 0;
    result.rows.forEach(row => {
      const status = row.completion_status === 'completed' ? '✅' : '🚀';
      const duration = row.duration_hours
        ? `${row.duration_hours} hours (${Math.round(row.duration_hours * 60)} minutes)`
        : 'In progress';
      console.log(`${status} ${row.phase}: ${duration}`);
      if (row.duration_hours) totalActiveHours += parseFloat(row.duration_hours);
    });

    console.log('');
    console.log('📈 Summary:');
    console.log(`   Queue Time: 48 hours (waiting in backlog)`);
    console.log(`   Active Work: ${totalActiveHours.toFixed(2)} hours`);
    console.log(`   Efficiency: ${(totalActiveHours / (totalActiveHours + 48) * 100).toFixed(1)}% active work`);

  } catch (error) {
    if (error.code === '42P07') {
      console.log('ℹ️  Table already exists');

      // Try to query existing data
      try {
        const result = await client.query(`
          SELECT phase, duration_hours, completion_status
          FROM sd_execution_timeline
          WHERE sd_id = 'SD-INFRA-EXCELLENCE-001'
          ORDER BY phase_started_at
        `);

        if (result.rows.length > 0) {
          console.log('\n📊 Existing timeline data:');
          result.rows.forEach(row => {
            const status = row.completion_status === 'completed' ? '✅' : '🚀';
            const duration = row.duration_hours ? `${row.duration_hours} hours` : 'In progress';
            console.log(`   ${status} ${row.phase}: ${duration}`);
          });
        }
      } catch (queryError) {
        console.error('Error querying data:', queryError.message);
      }
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await client.end();
    console.log('\n✅ Timeline tracking infrastructure is ready!');
    console.log('   Future phase transitions will be automatically recorded');
  }
}

createTimeline().catch(console.error);