import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function markComplete() {
  console.log('✅ Marking SD-VWC-INTUITIVE-FLOW-001 as completed...');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      progress_percentage: 100,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-VWC-INTUITIVE-FLOW-001')
    .select();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ SD-VWC-INTUITIVE-FLOW-001 marked as completed!');
  console.log(JSON.stringify(data, null, 2));
}

markComplete().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
