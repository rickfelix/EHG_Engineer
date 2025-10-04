import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  const { data, error } = await supabase
    .from('retrospectives')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('Table structure (from error):', error);
  } else {
    console.log('Sample row:', JSON.stringify(data, null, 2));
  }
}

checkSchema();
