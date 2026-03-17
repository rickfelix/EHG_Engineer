#!/usr/bin/env node

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function findPoolerRegion() {
  console.log('🔍 Searching for correct Supabase pooler region...\n');
  
  // Common AWS regions used by Supabase
  const regions = [
    'us-east-1',
    'us-west-1', 
    'us-west-2',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-southeast-1',
    'ap-southeast-2',
    'ap-south-1',
    'ca-central-1',
    'eu-central-1',
    'eu-west-1',
    'eu-west-2',
    'eu-west-3',
    'sa-east-1'
  ];
  
  const projectRef = 'dedlbzhpgkmetvhbkyzq';
  const password = process.env.SUPABASE_DB_PASSWORD;
  
  if (!password) {
    console.error('❌ SUPABASE_DB_PASSWORD not found in environment');
    process.exit(1);
  }
  
  console.log(`Testing ${regions.length} regions for project: ${projectRef}\n`);
  
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const config = {
      host: host,
      port: 5432,
      database: 'postgres',
      user: `postgres.${projectRef}`,
      password: password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000 // Quick timeout for faster testing
    };
    
    process.stdout.write(`Testing ${region}... `);
    
    const pool = new Pool(config);
    
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT current_database()');
      
      console.log('✅ SUCCESS!');
      console.log('\n🎉 Found working configuration!');
      console.log('================================');
      console.log(`Region: ${region}`);
      console.log(`Host: ${host}`);
      console.log(`Database: ${result.rows[0].current_database}`);
      console.log('================================\n');
      
      // Test DDL capability
      console.log('Testing DDL capability...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS pooler_test (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ DDL execution successful!');
      
      await client.query('DROP TABLE IF EXISTS pooler_test');
      console.log('✅ Cleanup successful!');
      
      client.release();
      await pool.end();
      
      // Update configuration
      console.log('\n📝 Configuration to use:');
      console.log(`dbHost: '${host}'`);
      console.log('dbPort: 5432');
      console.log(`dbUser: 'postgres.${projectRef}'`);
      console.log('dbPassword: process.env.SUPABASE_DB_PASSWORD');
      
      return { region, host };
      
    } catch (error) {
      if (error.message.includes('Tenant or user not found')) {
        console.log('❌ Wrong region');
      } else if (error.message.includes('timeout')) {
        console.log('⏱️ Timeout');
      } else {
        console.log(`❌ ${error.message.substring(0, 30)}...`);
      }
      await pool.end();
    }
  }
  
  console.log('\n❌ No working region found.');
  console.log('Your project might be in a region not listed or use a different configuration.');
  console.log('\nPlease check your Supabase dashboard:');
  console.log('https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/settings/database');
}

findPoolerRegion().catch(console.error);