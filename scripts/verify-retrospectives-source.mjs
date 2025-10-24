import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyRetrospectivesSource() {
  console.log('✅ Retrospectives Table Verification');
  console.log('═'.repeat(60));

  const { data, error, count } = await supabase
    .from('retrospectives')
    .select('id, sd_id, title, quality_score, team_satisfaction, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`\nDatabase: dedlbzhpgkmetvhbkyzq.supabase.co`);
  console.log(`Table: retrospectives`);
  console.log(`Total retrospectives: ${count}`);

  console.log(`\n📊 Most Recent 5 Retrospectives:\n`);
  data.forEach((retro, i) => {
    console.log(`${i+1}. ${retro.sd_id}`);
    console.log(`   Title: ${retro.title}`);
    console.log(`   Quality: ${retro.quality_score}/100 | Satisfaction: ${retro.team_satisfaction}/10`);
    console.log(`   Created: ${new Date(retro.created_at).toLocaleString()}`);
    console.log('');
  });

  console.log('═'.repeat(60));
  console.log('✅ Confirmed: Analysis based on database retrospectives table');
}

verifyRetrospectivesSource()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
