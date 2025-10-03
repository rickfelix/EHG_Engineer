import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSections() {
  const { data, error } = await supabase
    .from('uat_cases')
    .select('id, title, section, test_type')
    .eq('test_type', 'manual')
    .order('id');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Manual UAT Test Cases - Section Values:');
  console.log('=======================================\n');

  let nullCount = 0;
  let populatedCount = 0;

  data.forEach(test => {
    const hasSection = test.section !== null && test.section !== undefined && test.section !== '';
    if (!hasSection) nullCount++;
    else populatedCount++;

    const status = hasSection ? '✅' : '❌ NULL/EMPTY';
    console.log(`${status} ${test.id}`);
    console.log(`   Title: ${test.title}`);
    console.log(`   Section: ${test.section || '(null/empty)'}`);
    console.log('');
  });

  console.log('=================');
  console.log(`Total: ${data.length}`);
  console.log(`✅ With section: ${populatedCount}`);
  console.log(`❌ Without section: ${nullCount}`);
}

checkSections().catch(console.error);
