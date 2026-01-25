#!/usr/bin/env node

/**
 * Fix product_requirements_v2 table schema by adding missing strategic_directive_id column
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixPRDTableSchema() {
  console.log('🔧 Fixing product_requirements_v2 table schema...');

  try {
    // First, check if the table exists and what columns it has
    console.log('🔍 Checking current table structure...');

    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === 'PGRST106') {
        console.log('❌ Table does not exist. Creating product_requirements_v2 table...');

        // Create the table with all required columns
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS product_requirements_v2 (
            id SERIAL PRIMARY KEY,
            strategic_directive_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            acceptance_criteria JSONB,
            user_stories JSONB,
            technical_requirements JSONB,
            status TEXT DEFAULT 'draft',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          -- Create index for strategic_directive_id for better performance
          CREATE INDEX IF NOT EXISTS idx_prd_v2_strategic_directive_id
          ON product_requirements_v2(strategic_directive_id);
        `;

        // Execute via direct database connection if available
        console.log('📝 Creating table via SQL...');
        console.log('SQL to execute:', createTableSQL);
        console.log('⚠️  Please execute this SQL in Supabase dashboard SQL editor');

        return;
      } else if (error.message.includes('strategic_directive_id')) {
        console.log('❌ Table exists but missing strategic_directive_id column');

        const alterTableSQL = `
          ALTER TABLE product_requirements_v2
          ADD COLUMN IF NOT EXISTS strategic_directive_id TEXT;

          -- Create index for the new column
          CREATE INDEX IF NOT EXISTS idx_prd_v2_strategic_directive_id
          ON product_requirements_v2(strategic_directive_id);
        `;

        console.log('📝 SQL to add missing column:');
        console.log(alterTableSQL);
        console.log('⚠️  Please execute this SQL in Supabase dashboard SQL editor');

        return;
      } else {
        console.log('❌ Error accessing table:', error);
        return;
      }
    }

    // If we get here, table exists and is accessible
    console.log('✅ Table exists and accessible');

    if (data && data[0]) {
      const columns = Object.keys(data[0]);
      console.log('📊 Current columns:', columns.join(', '));

      if (!columns.includes('strategic_directive_id')) {
        console.log('❌ Missing strategic_directive_id column');
        console.log('📝 Need to add column via Supabase dashboard');
      } else {
        console.log('✅ strategic_directive_id column exists');
      }
    } else {
      console.log('📊 Table is empty, cannot determine column structure');
    }

  } catch (err) {
    console.error('❌ Script error:', err.message);
  }
}

// Run the fix
fixPRDTableSchema();