#!/usr/bin/env node

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('Testing direct PostgreSQL connection to Supabase...\n');

  // Try different connection configurations with various regions
  const configs = [
    {
      name: 'Pooler Session Mode - US East 1',
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.dedlbzhpgkmetvhbkyzq',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    {
      name: 'Pooler Session Mode - US West 1',
      host: 'aws-0-us-west-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.dedlbzhpgkmetvhbkyzq',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    {
      name: 'Pooler Session Mode - US West 2',
      host: 'aws-0-us-west-2.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.dedlbzhpgkmetvhbkyzq',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    {
      name: 'Pooler Transaction Mode - US East 1',
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      user: 'postgres.dedlbzhpgkmetvhbkyzq',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    {
      name: 'Direct Connection (will fail with IPv6)',
      host: 'db.dedlbzhpgkmetvhbkyzq.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    }
  ];

  for (const config of configs) {
    console.log(`Testing: ${config.name}`);
    console.log(`Host: ${config.host}:${config.port}`);
    console.log(`User: ${config.user}`);
    
    const pool = new Pool(config);
    
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log(`✅ SUCCESS! Connected at: ${result.rows[0].now}`);
      
      // Test DDL capability
      await client.query(`
        CREATE TABLE IF NOT EXISTS connection_test (
          id SERIAL PRIMARY KEY,
          test_time TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ DDL execution successful!\n');
      
      // Clean up
      await client.query('DROP TABLE IF EXISTS connection_test');
      client.release();
      
      await pool.end();
      
      // If successful, save this configuration
      console.log('🎉 This configuration works! Use these settings:\n');
      console.log(`dbHost: '${config.host}'`);
      console.log(`dbPort: ${config.port}`);
      console.log(`dbUser: '${config.user}'`);
      console.log('dbPassword: process.env.SUPABASE_DB_PASSWORD');
      console.log('dbName: \'postgres\'\n');
      
      return config;
      
    } catch (_error) {
      console.log(`❌ FAILED: ${error.message}\n`);
      await pool.end();
    }
  }
  
  console.log('All connection attempts failed. Please check:');
  console.log('1. Database password is correct');
  console.log('2. Network connectivity to Supabase');
  console.log('3. Supabase project is active');
}

testConnection().catch(console.error);