#!/usr/bin/env node

/**
 * Verify newly created Strategic Directives
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority, status, progress, current_phase')
    .in('id', ['SD-VWC-A11Y-002', 'SD-INFRASTRUCTURE-FIX-001'])
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Created Strategic Directives:');
  console.log('='.repeat(70));
  data.forEach(sd => {
    console.log(`\nID: ${sd.id}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Category: ${sd.category}`);
    console.log(`Priority: ${sd.priority}`);
    console.log(`Status: ${sd.status}`);
    console.log(`Phase: ${sd.current_phase}`);
    console.log(`Progress: ${sd.progress}%`);
  });
}

main().catch(console.error);
