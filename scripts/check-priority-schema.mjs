#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking Priority Field Schema and Valid Values\n');

// Query existing SDs to see what priority values are used
const { data: existingSDs, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, priority, status')
  .order('priority', { ascending: false })
  .limit(10);

if (error) {
  console.error('❌ Error querying SDs:', error);
  process.exit(1);
}

console.log('📊 Existing SD Priority Values:\n');
existingSDs.forEach(sd => {
  console.log(`${sd.id}: priority=${sd.priority} (${typeof sd.priority}) - ${sd.title}`);
});

console.log('\n📝 Priority Value Analysis:');
const uniquePriorities = [...new Set(existingSDs.map(sd => sd.priority))].sort((a, b) => b - a);
console.log('Unique values:', uniquePriorities);
console.log('Data type:', typeof existingSDs[0]?.priority);
console.log('Range:', `${Math.min(...uniquePriorities)} to ${Math.max(...uniquePriorities)}`);
