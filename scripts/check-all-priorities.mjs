#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Checking All Priority Values in Database\n');

// Query all SDs to see all priority values
const { data: allSDs, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, priority, status')
  .order('created_at', { ascending: false });

if (error) {
  console.error('❌ Error querying SDs:', error);
  process.exit(1);
}

console.log(`📊 Found ${allSDs.length} Strategic Directives\n`);

const priorityCounts = {};
allSDs.forEach(sd => {
  if (!priorityCounts[sd.priority]) {
    priorityCounts[sd.priority] = 0;
  }
  priorityCounts[sd.priority]++;
});

console.log('📝 Priority Value Distribution:');
Object.entries(priorityCounts).sort((a, b) => b[1] - a[1]).forEach(([priority, count]) => {
  console.log(`  ${priority}: ${count} SDs`);
});

console.log('\n📋 Valid Priority Values (enum):');
console.log(Object.keys(priorityCounts).sort().join(', '));

// Show examples of high priority SDs
console.log('\n🎯 Example High Priority SDs:');
const highPriority = allSDs.filter(sd => sd.priority === 'high').slice(0, 5);
if (highPriority.length > 0) {
  highPriority.forEach(sd => {
    console.log(`  ${sd.id}: ${sd.title}`);
  });
} else {
  console.log('  (No "high" priority SDs found)');
  console.log('\n  Showing first 5 SDs:');
  allSDs.slice(0, 5).forEach(sd => {
    console.log(`  ${sd.id} (${sd.priority}): ${sd.title}`);
  });
}
