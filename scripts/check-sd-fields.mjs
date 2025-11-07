import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-VENTURE-UNIFICATION-001')
  .maybeSingle();

if (error) {
  console.log('Error:', error.message);
} else if (!data) {
  console.log('❌ SD not found');
} else {
  console.log('✅ SD found');
  console.log('\nColumn check:');
  console.log('  id:', data.id || 'missing');
  console.log('  uuid_id:', data.uuid_id || 'NOT PRESENT');
  console.log('  sd_uuid:', data.sd_uuid || 'NOT PRESENT');
  console.log('  title:', data.title ? 'present' : 'missing');
  console.log('\nAll columns:', Object.keys(data).slice(0, 20).join(', '));
}
