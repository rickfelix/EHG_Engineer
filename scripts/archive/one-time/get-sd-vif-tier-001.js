import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSD() {
  try {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-VIF-TIER-001')
      .single();

    if (error) {
      console.error('Error:', error.message);
      return;
    }

    console.log('\n=== SD-VIF-TIER-001 DETAILS ===\n');
    console.log('ID:', sd.id);
    console.log('Title:', sd.title);
    console.log('Description:', sd.description?.substring(0, 200) + '...');
    console.log('Priority:', sd.priority);
    console.log('Status:', sd.status);
    console.log('Phase:', sd.current_phase);
    console.log('Progress:', sd.progress + '%');
    console.log('\nStrategic Objectives:', sd.strategic_objectives?.length || 0, 'items');
    console.log('Success Metrics:', sd.success_metrics?.length || 0, 'metrics');
    console.log('Risks:', sd.risks?.length || 0, 'risks');

  } catch (err) {
    console.error('Failed:', err.message);
  }
}

getSD();
