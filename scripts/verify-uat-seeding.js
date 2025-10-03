#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';

const { Client } = pg;

async function verifyUATData() {
  const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ No database connection string found');
    console.log('Please ensure SUPABASE_POOLER_URL or DATABASE_URL is set in .env');
    return;
  }

  // Parse connection string and add SSL config
  const isPooler = connectionString.includes('pooler.supabase.com');
  const client = new Client({
    connectionString: connectionString.replace('?sslmode=require', ''),
    ssl: isPooler ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔗 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // Count total test cases
    const totalResult = await client.query('SELECT COUNT(*) as count FROM uat_cases');
    const totalCount = totalResult.rows[0].count;

    console.log('📊 UAT Test Cases Summary');
    console.log('═══════════════════════════════════════════');
    console.log(`Total Test Cases: ${totalCount}`);

    if (totalCount > 0) {
      // Count by section
      console.log('\n📂 By Section:');
      const sectionResult = await client.query(`
        SELECT section, COUNT(*) as count
        FROM uat_cases
        GROUP BY section
        ORDER BY section
      `);

      sectionResult.rows.forEach(row => {
        console.log(`   ${row.section}: ${row.count}`);
      });

      // Count by priority
      console.log('\n🎯 By Priority:');
      const priorityResult = await client.query(`
        SELECT priority, COUNT(*) as count
        FROM uat_cases
        GROUP BY priority
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END
      `);

      priorityResult.rows.forEach(row => {
        const emoji = row.priority === 'critical' ? '🔴' :
                     row.priority === 'high' ? '🟡' : '🟢';
        console.log(`   ${emoji} ${row.priority}: ${row.count}`);
      });

      // Show sample test cases
      console.log('\n📝 Sample Test Cases:');
      const sampleResult = await client.query(`
        SELECT id, section, title, priority
        FROM uat_cases
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END
        LIMIT 5
      `);

      sampleResult.rows.forEach(row => {
        console.log(`   • ${row.id}: ${row.title} (${row.priority})`);
      });

      console.log('\n✨ UAT test cases successfully seeded!');
      console.log('🚀 Ready to start testing:');
      console.log('   1. Create a test run: node scripts/uat-lead.js');
      console.log('   2. Execute tests: node scripts/uat-wizard.js');
      console.log('   3. View dashboard: http://localhost:3000/uat-dashboard');
    } else {
      console.log('\n⚠️  No test cases found in database');
      console.log('Run: node scripts/execute-database-sql.js database/migrations/seed-uat-test-cases.sql');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Connection closed');
  }
}

verifyUATData();