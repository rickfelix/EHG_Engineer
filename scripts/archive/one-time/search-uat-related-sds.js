import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function searchUATRelatedSDs() {
  console.log('🔍 Searching for UAT-related Strategic Directives...\n');

  // Search for SDs with UAT in the key, title, or description
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or('sd_key.ilike.%UAT%,title.ilike.%UAT%,description.ilike.%UAT%,title.ilike.%test%,description.ilike.%test%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`📊 Found ${sds.length} UAT/test-related Strategic Directive(s)\n`);
  console.log('='.repeat(100));

  sds.forEach((sd, index) => {
    console.log(`\n📋 #${index + 1}:`);
    console.log('  SD Key:', sd.sd_key);
    console.log('  Title:', sd.title);
    console.log('  Description:', sd.description?.substring(0, 150) + (sd.description?.length > 150 ? '...' : ''));
    console.log('  Status:', sd.status);
    console.log('  Priority:', sd.priority);
    console.log('  Category:', sd.category);
    console.log('  Target Application:', sd.target_application);
    console.log('  Sequence Rank:', sd.sequence_rank);
    console.log('  Created:', sd.created_at);
    console.log('  Database ID:', sd.id);
  });

  console.log('\n' + '='.repeat(100));

  // Also check if there are any SDs with similar description to our UAT one
  console.log('\n🔍 Looking for SDs with "Priority Alerts" or "Chairman Console" in title/description...\n');

  const { data: similarSDs } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or('title.ilike.%priority alerts%,title.ilike.%chairman console%,description.ilike.%priority alerts%,description.ilike.%chairman console%')
    .order('created_at', { ascending: false });

  if (similarSDs && similarSDs.length > 0) {
    console.log(`📊 Found ${similarSDs.length} SD(s) related to Priority Alerts or Chairman Console:\n`);
    similarSDs.forEach((sd, index) => {
      console.log(`\n📋 #${index + 1}:`);
      console.log('  SD Key:', sd.sd_key);
      console.log('  Title:', sd.title);
      console.log('  Status:', sd.status);
      console.log('  Created:', sd.created_at);
    });
  }
}

searchUATRelatedSDs();