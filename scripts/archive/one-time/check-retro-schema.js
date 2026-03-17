import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data } = await supabase.from('retrospectives').select('*').limit(1);
if (data && data[0]) {
  console.log('Retrospectives columns:', Object.keys(data[0]).join(', '));
} else {
  console.log('No retrospectives found or table doesnt exist');
}
