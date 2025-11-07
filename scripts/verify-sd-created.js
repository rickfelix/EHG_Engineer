#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function verifySD() {
  console.log('🔍 Verifying SD-CREWAI-COMPETITIVE-INTELLIGENCE-001...\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, category, priority, created_at')
    .eq('id', 'SD-CREWAI-COMPETITIVE-INTELLIGENCE-001')
    .maybeSingle();

  if (error) {
    console.log('❌ Error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.log('❌ SD not found in database');
    process.exit(1);
  }

  console.log('✅ SD found in database:\n');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n✅ SD creation verified!');
}

verifySD();
