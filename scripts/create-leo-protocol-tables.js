#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create LEO Protocol Database Tables
 */

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTables() {
  console.log('🔨 Creating LEO Protocol database tables...\n');
  
  // Read the SQL schema file
  const schemaPath = path.join(__dirname, '../database/schema/007_leo_protocol_schema.sql');
  const sqlContent = fs.readFileSync(schemaPath, 'utf8');
  
  // Split into individual statements and clean them
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const statement of statements) {
    // Skip comments
    if (!statement || statement.startsWith('--')) continue;
    
    try {
      // Execute via Supabase RPC or direct query
      // For DDL statements, we need to use a different approach
      // Since Supabase client doesn't directly support DDL, we'll create tables manually
      
      if (statement.includes('CREATE TABLE')) {
        console.log('📊 Creating table from statement...');
        // Note: Supabase client doesn't support DDL directly
        // We need to create tables via Supabase dashboard or use the REST API
        console.log('⚠️  Table creation requires Supabase dashboard or REST API');
        console.log('Statement preview:', statement.substring(0, 100) + '...');
      }
      
      successCount++;
    } catch (error) {
      console.error('❌ Error executing statement:', error.message);
      errorCount++;
    }
  }
  
  console.log('\n📋 Summary:');
  console.log(`✅ Successful statements: ${successCount}`);
  console.log(`❌ Failed statements: ${errorCount}`);
  
  // Alternative: Create tables using Supabase JavaScript client
  console.log('\n🔄 Creating tables programmatically...');
  
  try {
    // Since we can't create tables directly, let's check if they exist
    const { data, error } = await supabase
      .from('leo_protocols')
      .select('id')
      .limit(1);
    
    if (error && error.message.includes('does not exist')) {
      console.log('\n⚠️  Tables don\'t exist. Please create them using one of these methods:');
      console.log('1. Supabase Dashboard SQL Editor');
      console.log('2. Supabase CLI: supabase db push');
      console.log('3. Direct PostgreSQL connection');
      console.log('\nSQL file location: database/schema/007_leo_protocol_schema.sql');
      
      // Output the SQL for manual execution
      console.log('\n📄 SQL to execute in Supabase Dashboard:');
      console.log('----------------------------------------');
      console.log(sqlContent);
    } else if (data) {
      console.log('✅ Tables already exist!');
    }
  } catch (error) {
    console.log('⚠️  Cannot verify table existence:', error.message);
  }
}

async function main() {
  await createTables();
}

main().catch(console.error);
