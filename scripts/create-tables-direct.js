#!/usr/bin/env node

import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createTables() {
  console.log('🔧 Creating EHG_Engineer database tables...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Try a different approach - insert a test record to force table creation
    console.log('📋 Attempting to create strategic_directives_v2 table...');
    
    // First, let's try to create a simple test to see what's possible
    const { data: testData, error: testError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: 'SD-2025-01-15-A',
        title: 'EHG_Engineer Platform Foundation',
        version: '1.0',
        status: 'draft',
        category: 'platform',
        priority: 'critical',
        description: 'Establish a minimal, clean LEO Protocol v3.1.5 implementation',
        rationale: 'Need clean LEO Protocol foundation without EHG platform complexity',
        scope: 'Core LEO Protocol implementation with database, templates, and agent communication',
        created_by: 'LEAD',
        sequence_rank: 1
      })
      .select();
    
    if (testError) {
      if (testError.code === '42P01') {
        console.log('⚠️  Table does not exist. Attempting alternate method...');
        
        // Try using RPC to execute SQL
        const { data: _data, error } = await supabase.rpc('exec_sql', {
          sql: `
            CREATE TABLE IF NOT EXISTS strategic_directives_v2 (
              id VARCHAR(50) PRIMARY KEY,
              title VARCHAR(500) NOT NULL,
              version VARCHAR(20) NOT NULL DEFAULT '1.0',
              status VARCHAR(50) NOT NULL,
              category VARCHAR(50) NOT NULL,
              priority VARCHAR(20) NOT NULL,
              description TEXT NOT NULL,
              rationale TEXT NOT NULL,
              scope TEXT NOT NULL,
              created_by VARCHAR(100),
              sequence_rank INTEGER,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `
        });
        
        if (error) {
          console.log('❌ RPC method not available:', error.message);
        } else {
          console.log('✅ Table created via RPC!');
        }
      } else {
        console.log('❌ Error:', testError.message);
      }
    } else {
      console.log('✅ Successfully inserted test record!');
      console.log('Data:', testData);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log('\nNote: Direct table creation via client API is restricted.');
    console.log('Please use the Supabase Dashboard SQL Editor to create tables.');
  }
}

createTables();