import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testInsert() {
  const minimal = {
    sd_id: 'SD-AGENT-MIGRATION-001',
    from_phase: 'exec',
    to_phase: 'plan',
    status: 'pending',
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .insert(minimal)
    .select();

  if (error) {
    console.log('Minimal insert error:', error.message);
  } else {
    console.log('Minimal insert success! Columns:', Object.keys(data[0]));
  }
}

testInsert();
