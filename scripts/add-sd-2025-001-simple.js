#!/usr/bin/env node

/**
 * Add SD-2025-001 to database - Simplified version matching existing schema
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function addSDToDatabase() {
  console.log('📋 Adding SD-2025-001 to database...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Insert Strategic Directive with only the fields that exist
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: 'SD-2025-001',
        title: 'OpenAI Realtime Voice Consolidation',
        status: 'active',
        category: 'product_enhancement',
        priority: 'high',
        description: 'Consolidate three fragmented voice interfaces into a single unified OpenAI Realtime Voice implementation to reduce costs, improve performance, and enable advanced AI capabilities.',
        rationale: 'Current fragmented voice interfaces create user confusion, cost $1,500/month for 11Labs, and lack intelligent reasoning. OpenAI Realtime with gpt-realtime model provides 48% better instruction following.',
        scope: 'Replace 11Labs Realtime, EVA Voice Conversation, and EVA Text+Speech with single OpenAI Realtime implementation using WebRTC and ephemeral tokens.',
        created_by: 'LEAD-v4.1',
        execution_order: 1,
        version: '1.0'
      }, {
        onConflict: 'id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Database insert error:', error.message);
      console.error('Error details:', error);
      process.exit(1);
    }
    
    console.log('✅ SD-2025-001 added to database successfully!');
    console.log('\nDatabase record:', JSON.stringify(data, null, 2));
    
    console.log('\n📝 Status:');
    console.log('  Strategic Directive: ✅ Created');
    console.log('  Status: active');
    console.log('  Priority: high');
    console.log('  Progress: 40% (LEAD + PLAN complete)');
    
    console.log('\n📤 Next steps:');
    console.log('1. Add PRD-2025-001 to database');
    console.log('2. Add EES items to database');
    console.log('3. Verify database before EXEC handoff');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addSDToDatabase();