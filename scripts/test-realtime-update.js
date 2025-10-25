#!/usr/bin/env node

/**
 * Test real-time subscription updates
 * This will update the database and verify that real-time subscriptions detect it
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testRealtimeUpdate() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  console.log('🧪 Testing real-time subscription updates...\n');
  
  try {
    // Update SD-2025-001's description
    const testDescription = `OpenAI Realtime Voice consolidation - Updated at ${new Date().toLocaleTimeString()}`;
    
    console.log('📝 Updating SD-2025-001 description...');
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        description: testDescription,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-2025-001');
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Database updated successfully!');
    console.log('📡 Check server logs for real-time update notification');
    console.log('\n💡 The dashboard should automatically update without refresh');
    console.log('   Check: http://localhost:3000/dashboard');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testRealtimeUpdate();