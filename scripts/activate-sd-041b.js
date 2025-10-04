#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function activateSD() {
  console.log('🎯 Activating SD-041B: Competitive Intelligence - Cloning Process\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      sd_key: 'SD-041B',
      status: 'active',
      metadata: {
        integration_points: [
          'Stage 4: Competitive Intelligence (primary)',
          'Stage 16: AI CEO Agent (decision support)',
          'Knowledge Base: AI agent coordination'
        ],
        approach: 'simplicity-first',
        reuses: 'SD-041A knowledge base infrastructure',
        activation_date: new Date().toISOString()
      }
    })
    .eq('id', 'SD-041B')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-041B activated successfully!');
  console.log('\n📊 SD Details:');
  console.log('   SD Key:', data[0].sd_key);
  console.log('   Status:', data[0].status);
  console.log('   Priority:', data[0].priority);
  console.log('   Title:', data[0].title);
}

activateSD().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
