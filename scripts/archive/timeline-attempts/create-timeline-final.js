#!/usr/bin/env node

/**
 * Create Timeline Tables - Final Attempt
 * Uses the existing pooler connection with proper SSL handling
 */

import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';

const { Client } = pg;

async function createTimeline() {
  console.log('🔨 Creating SD Timeline Tables...\n');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (!poolerUrl) {
    console.error('❌ SUPABASE_POOLER_URL not found in .env');
    return;
  }

  // Parse the connection string to handle SSL properly
  const url = new URL(poolerUrl);

  const config = {
    host: url.hostname,
    port: url.port || 5432,
    database: url.pathname.slice(1),
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
  };

  console.log(`📊 Connecting to Supabase database: ${config.database}`);
  console.log(`   Host: ${config.host}`);
  console.log(`   SSL: ${config.ssl ? 'Enabled' : 'Disabled'}\n`);

  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Create the timeline table
    console.log('Creating timeline table...');
    const createTableSQL = `
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
      )
    `;

    await client.query(createTableSQL);
    console.log('✅ Timeline table created or already exists');

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_sd_timeline_sd_id ON sd_execution_timeline(sd_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sd_timeline_phase ON sd_execution_timeline(phase)');
    console.log('✅ Indexes created');

    // Check if data already exists
    const checkResult = await client.query(`
      SELECT COUNT(*) as count
      FROM sd_execution_timeline
      WHERE sd_id = 'SD-INFRA-EXCELLENCE-001'
    `);

    if (checkResult.rows[0].count == 0) {
      // Insert SD-INFRA-EXCELLENCE-001 timeline data
      console.log('Inserting timeline data...');
      const insertSQL = `
        INSERT INTO sd_execution_timeline (
          sd_id, phase, phase_started_at, phase_completed_at,
          duration_hours, duration_minutes, agent_responsible, completion_status
        ) VALUES
        ('SD-INFRA-EXCELLENCE-001', 'LEAD', '2025-09-26T17:00:00Z', '2025-09-26T17:45:00Z', 0.75, 45, 'LEAD', 'completed'),
        ('SD-INFRA-EXCELLENCE-001', 'PLAN', '2025-09-26T17:45:00Z', '2025-09-26T19:19:00Z', 1.57, 94, 'PLAN', 'completed'),
        ('SD-INFRA-EXCELLENCE-001', 'EXEC', '2025-09-26T19:19:00Z', NULL, NULL, NULL, 'EXEC', 'in_progress')
      `;

      await client.query(insertSQL);
      console.log('✅ Timeline data inserted');
    } else {
      console.log('ℹ️  Timeline data already exists');
    }

    // Query and display the data
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

    console.log('\n📊 SD-INFRA-EXCELLENCE-001 Timeline:');
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
    console.log('📈 Metrics Summary:');
    console.log('   Queue Time: 48 hours (waiting in backlog)');
    console.log(`   Active Work: ${totalActiveHours.toFixed(2)} hours`);
    console.log(`   Efficiency: ${(totalActiveHours / (totalActiveHours + 48) * 100).toFixed(1)}% of time was active work`);

    console.log('\n✅ SUCCESS! Timeline tracking infrastructure is now in place!');
    console.log('   - Table created: sd_execution_timeline');
    console.log('   - Indexes created for performance');
    console.log('   - Historical data loaded');
    console.log('   - Ready for automatic duration tracking');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
  } finally {
    await client.end();
    console.log('\n🔌 Connection closed');
  }
}

createTimeline().catch(console.error);