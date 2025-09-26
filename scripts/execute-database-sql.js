#!/usr/bin/env node

/**
 * Universal Database SQL Executor
 * Works with both EHG_Engineer and EHG customer databases
 *
 * Usage:
 *   node scripts/execute-database-sql.js path/to/schema.sql           # Uses EHG_Engineer DB by default
 *   node scripts/execute-database-sql.js path/to/schema.sql --ehg     # Uses EHG customer DB
 *   node scripts/execute-database-sql.js path/to/schema.sql --engineer # Explicitly uses Engineer DB
 */

import dotenv from "dotenv";
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configurations
const DATABASES = {
  engineer: {
    name: 'EHG_Engineer Management DB',
    projectId: 'dedlbzhpgkmetvhbkyzq',
    envVar: 'SUPABASE_POOLER_URL',
    description: 'Strategic Directives, PRDs, LEO Protocol',
    color: '\x1b[36m' // Cyan
  },
  ehg: {
    name: 'EHG Customer Application DB',
    projectId: 'liapbndqlqxdcgpwntbv',
    envVar: 'EHG_POOLER_URL',
    description: 'Customer data, business features',
    color: '\x1b[33m' // Yellow
  }
};

async function executeSQLFile(sqlFilePath, targetDb = 'engineer') {
  const dbConfig = DATABASES[targetDb];
  const resetColor = '\x1b[0m';

  console.log(`${dbConfig.color}🔨 Database SQL Executor${resetColor}`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`📊 Target Database: ${dbConfig.color}${dbConfig.name}${resetColor}`);
  console.log(`   Project ID: ${dbConfig.projectId}`);
  console.log(`   Purpose: ${dbConfig.description}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Get connection string
  const poolerUrl = process.env[dbConfig.envVar];

  if (!poolerUrl) {
    console.error(`❌ ${dbConfig.envVar} not found in .env`);
    console.error(`   This is required to connect to ${dbConfig.name}`);

    if (targetDb === 'ehg') {
      console.log('\n📝 To connect to EHG customer database, add to .env:');
      console.log(`   EHG_POOLER_URL=postgresql://postgres.${dbConfig.projectId}:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`);
    }

    process.exit(1);
  }

  // Read SQL file
  try {
    const sqlContent = await fs.readFile(sqlFilePath, 'utf8');
    console.log(`📄 SQL File: ${path.basename(sqlFilePath)}`);
    console.log(`   Size: ${(sqlContent.length / 1024).toFixed(2)} KB`);

    // Count statements (rough estimate)
    const statements = sqlContent.split(';').filter(s => s.trim()).length;
    console.log(`   Estimated statements: ${statements}\n`);

    // Parse connection string
    const url = new URL(poolerUrl);
    const config = {
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: decodeURIComponent(url.password),
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false
    };

    console.log('🔗 Connecting to database...');
    const client = new Client(config);

    await client.connect();
    console.log('✅ Connected successfully!\n');

    console.log('⚙️  Executing SQL...');

    // Execute the SQL
    try {
      await client.query(sqlContent);
      console.log(`${dbConfig.color}✅ SQL executed successfully!${resetColor}\n`);

      // Try to get some info about what was created
      const tableCheck = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_catalog = $1
        ORDER BY table_name
        LIMIT 10
      `, [config.database]);

      if (tableCheck.rows.length > 0) {
        console.log('📊 Sample tables in database:');
        tableCheck.rows.forEach(row => {
          console.log(`   • ${row.table_name}`);
        });
      }

    } catch (execError) {
      if (execError.code === '42P07') {
        console.log('ℹ️  Some objects already exist (this is normal)');
      } else {
        console.error('❌ Execution error:', execError.message);
        if (execError.detail) {
          console.error('   Detail:', execError.detail);
        }
        if (execError.hint) {
          console.error('   Hint:', execError.hint);
        }
      }
    }

    await client.end();
    console.log('\n🔌 Connection closed');
    console.log(`${dbConfig.color}✨ Operation complete!${resetColor}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Universal Database SQL Executor\n');
    console.log('Usage:');
    console.log('  node scripts/execute-database-sql.js <sql-file>           # Default: EHG_Engineer DB');
    console.log('  node scripts/execute-database-sql.js <sql-file> --ehg     # Use EHG customer DB');
    console.log('  node scripts/execute-database-sql.js <sql-file> --engineer # Explicit Engineer DB\n');
    console.log('Examples:');
    console.log('  node scripts/execute-database-sql.js database/schema/sd_execution_timeline.sql');
    console.log('  node scripts/execute-database-sql.js migrations/001_init.sql --ehg\n');
    console.log('Available Databases:');
    console.log('  • EHG_Engineer (dedlbzhpgkmetvhbkyzq) - Management/LEO Protocol');
    console.log('  • EHG Customer (liapbndqlqxdcgpwntbv) - Business application');
    process.exit(0);
  }

  const sqlFile = args[0];
  let targetDb = 'engineer'; // Default to Engineer DB

  if (args.includes('--ehg')) {
    targetDb = 'ehg';
  } else if (args.includes('--engineer')) {
    targetDb = 'engineer';
  }

  // Verify file exists
  try {
    await fs.access(sqlFile);
  } catch {
    console.error(`❌ File not found: ${sqlFile}`);
    process.exit(1);
  }

  // Confirm database selection for safety
  const dbConfig = DATABASES[targetDb];
  console.log(`\n⚠️  You are about to execute SQL on:`);
  console.log(`   ${dbConfig.color}${dbConfig.name}${'\x1b[0m'}`);
  console.log(`   Project: ${dbConfig.projectId}`);
  console.log(`   File: ${sqlFile}\n`);

  if (targetDb === 'ehg') {
    console.log('   ⚠️  WARNING: This is the CUSTOMER database!');
    console.log('   Changes here affect the production application.\n');
  }

  await executeSQLFile(sqlFile, targetDb);
}

main().catch(console.error);