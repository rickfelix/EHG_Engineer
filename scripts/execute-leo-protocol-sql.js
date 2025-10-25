#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Execute LEO Protocol SQL Schema
 * Uses direct PostgreSQL connection to create tables
 */

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

async function executeSQLSchema() {
  console.log('🔨 Creating LEO Protocol database tables...\n');
  
  // Parse DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Missing DATABASE_URL');
    process.exit(1);
  }
  
  // Create PostgreSQL client
  const client = new Client({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Read SQL schema
    const schemaPath = path.join(__dirname, '../database/schema/007_leo_protocol_schema.sql');
    const sqlContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the entire SQL file
    await client.query(sqlContent);
    console.log('✅ LEO Protocol tables created successfully!');
    
    // Verify tables exist
    const tableCheckQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'leo_%'
      ORDER BY table_name;
    `;
    
    const result = await client.query(tableCheckQuery);
    console.log('\n📊 Created tables:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Error executing SQL:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

async function main() {
  await executeSQLSchema();
}

main().catch(console.error);
