#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * Setup PRD Database Tables
 * Creates product_requirements_v2 table in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function setupPRDDatabase() {
  console.log('📊 Setting up PRD database tables...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Read the SQL schema
  const schemaPath = path.join(__dirname, '..', 'database', 'schema', '004_prd_schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  
  console.log('📋 Executing PRD schema SQL...');
  console.log('Note: You may need to run this SQL directly in Supabase SQL Editor:\n');
  console.log('----------------------------------------');
  console.log(schemaSql);
  console.log('----------------------------------------\n');
  
  console.log('Steps to complete setup:');
  console.log('1. Go to your Supabase dashboard: ' + supabaseUrl);
  console.log('2. Navigate to SQL Editor');
  console.log('3. Copy and paste the SQL above');
  console.log('4. Click "Run" to execute');
  console.log('5. Verify the table was created in Table Editor');
  
  // Try to check if table exists
  try {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.message.includes('table') || error.message.includes('relation')) {
        console.log('\n⚠️  Table does not exist yet - please create it using the SQL above');
      } else {
        console.log('\n❌ Error checking table:', error.message);
      }
    } else {
      console.log('\n✅ Table product_requirements_v2 exists!');
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

setupPRDDatabase();
