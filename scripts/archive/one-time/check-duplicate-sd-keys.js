import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDuplicates() {
  console.log('🔍 Checking for duplicate SD-UAT-001 records...\n');

  // Find all records with SD-UAT-001
  const { data: duplicates, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-UAT-001')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`📊 Found ${duplicates.length} record(s) with sd_key = 'SD-UAT-001'\n`);

  if (duplicates.length === 0) {
    console.log('✅ No records found');
    return;
  }

  if (duplicates.length === 1) {
    console.log('✅ Only one record found (no duplicates)');
    const sd = duplicates[0];
    console.log('\nDetails:');
    console.log('  ID:', sd.id);
    console.log('  SD Key:', sd.sd_key);
    console.log('  Title:', sd.title);
    console.log('  Created:', sd.created_at);
    console.log('  Status:', sd.status);
    console.log('  Sequence Rank:', sd.sequence_rank);
    return;
  }

  console.log('⚠️  DUPLICATES DETECTED!\n');
  console.log('='.repeat(80));

  duplicates.forEach((sd, index) => {
    console.log(`\n📋 Record #${index + 1}:`);
    console.log('  Database ID:', sd.id);
    console.log('  SD Key:', sd.sd_key);
    console.log('  Title:', sd.title);
    console.log('  Description:', sd.description?.substring(0, 100) + '...');
    console.log('  Status:', sd.status);
    console.log('  Priority:', sd.priority);
    console.log('  Category:', sd.category);
    console.log('  Target Application:', sd.target_application);
    console.log('  Sequence Rank:', sd.sequence_rank);
    console.log('  Created At:', sd.created_at);
    console.log('  Updated At:', sd.updated_at);
    console.log('  Is Active:', sd.is_active);
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Recommendation:');
  console.log('   Keep the most recent/correct record and delete the others.');
  console.log('   Or update one of them to use a different SD key (e.g., SD-UAT-002).');
}

checkDuplicates();