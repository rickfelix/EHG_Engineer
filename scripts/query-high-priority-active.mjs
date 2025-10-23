#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase.from('strategic_directives_v2')
  .select('id, title, priority, status, current_phase, category, description')
  .eq('priority', 'high')
  .not('status', 'in', '(deferred,canceled,cancelled,completed)')
  .order('status');

if (error) {
  console.log('Error:', error.message);
  process.exit(1);
}

console.log('HIGH PRIORITY STRATEGIC DIRECTIVES (In Progress)');
console.log('='.repeat(70));
console.log('Total:', data.length);
console.log('');

const statusGroups = data.reduce((acc, sd) => {
  const status = sd.status || 'unknown';
  if (!acc[status]) acc[status] = [];
  acc[status].push(sd);
  return acc;
}, {});

Object.entries(statusGroups).forEach(([status, sds]) => {
  console.log('STATUS:', status.toUpperCase());
  console.log('-'.repeat(70));
  sds.forEach((sd, i) => {
    console.log(`${i+1}. ${sd.id}`);
    console.log(`   ${sd.title}`);
    console.log(`   Phase: ${sd.current_phase} | Category: ${sd.category}`);
    const desc = sd.description || 'N/A';
    console.log(`   ${desc.substring(0, 100)}${desc.length > 100 ? '...' : ''}`);
    console.log('');
  });
});
