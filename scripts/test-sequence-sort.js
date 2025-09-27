import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Simulate the exact sorting function from SDManager
function performMultiLevelSort(directives, levels) {
  return [...directives].sort((a, b) => {
    for (const level of levels) {
      let aValue = a[level.field];
      let bValue = b[level.field];

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = level.direction === 'asc' ? 999999 : -999999;
      if (bValue === null || bValue === undefined) bValue = level.direction === 'asc' ? 999999 : -999999;

      // Compare values based on direction
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;

      if (comparison !== 0) {
        return level.direction === 'asc' ? comparison : -comparison;
      }
    }
    return 0;
  });
}

async function test() {
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sequence_rank, priority, status')
    .eq('priority', 'high')
    .in('status', ['active', 'draft']);

  // Transform to match frontend (snake_case to camelCase)
  const directives = data.map(sd => ({
    id: sd.id,
    title: sd.title,
    sequenceRank: sd.sequence_rank,  // This is the transformation
    priority: sd.priority,
    status: sd.status
  }));

  console.log('\n📊 TESTING SEQUENCE RANK SORTING');
  console.log('=================================\n');

  // Test 1: Raw values
  console.log('Raw sequenceRank values:');
  directives.forEach(d => {
    console.log(`  ${d.id}: ${d.sequenceRank} (type: ${typeof d.sequenceRank})`);
  });

  // Test 2: Ascending sort
  console.log('\n📈 ASCENDING SORT (sequenceRank):');
  const ascSorted = performMultiLevelSort(directives, [{ field: 'sequenceRank', direction: 'asc' }]);
  ascSorted.slice(0, 5).forEach((d, i) => {
    console.log(`  ${i+1}. ${d.id.padEnd(10)} rank: ${d.sequenceRank}`);
  });

  // Test 3: Descending sort
  console.log('\n📉 DESCENDING SORT (sequenceRank):');
  const descSorted = performMultiLevelSort(directives, [{ field: 'sequenceRank', direction: 'desc' }]);
  descSorted.slice(0, 5).forEach((d, i) => {
    console.log(`  ${i+1}. ${d.id.padEnd(10)} rank: ${d.sequenceRank}`);
  });

  // Test 4: Check if sorting is actually different
  console.log('\n🔍 VERIFICATION:');
  const firstAsc = ascSorted[0].id;
  const firstDesc = descSorted[0].id;
  if (firstAsc === firstDesc) {
    console.log(`  ❌ PROBLEM: Both ASC and DESC have ${firstAsc} first!`);
    console.log(`     This means sorting is NOT working correctly.`);
  } else {
    console.log(`  ✅ ASC first: ${firstAsc}, DESC first: ${firstDesc}`);
  }

  // Test 5: Manual numeric comparison
  console.log('\n📐 MANUAL NUMERIC TEST:');
  const val1 = directives.find(d => d.id === 'SD-1B')?.sequenceRank;
  const val2 = directives.find(d => d.id === 'SD-001')?.sequenceRank;
  console.log(`  SD-1B sequenceRank: ${val1} (type: ${typeof val1})`);
  console.log(`  SD-001 sequenceRank: ${val2} (type: ${typeof val2})`);
  console.log(`  val1 < val2: ${val1 < val2}`);
  console.log(`  val1 > val2: ${val1 > val2}`);
}

test();