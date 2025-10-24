import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handoffId = '36eb83b3-595b-4d2c-b841-fb149d82f868';

const { data, error } = await supabase
  .from('sd_phase_handoffs')
  .select('*')
  .eq('handoff_id', handoffId)
  .single();

if (error) {
  console.log('Error:', error.message);
} else {
  console.log('✅ Handoff Record Retrieved\n');
  console.log('Handoff ID:', data.handoff_id);
  console.log('SD ID:', data.sd_id);
  console.log('Type:', data.handoff_type);
  console.log('Status:', data.status);
  console.log('\n7-Element Handoff Structure:');
  console.log('1. executive_summary:', data.executive_summary?.substring(0, 100) + '...');
  console.log('2. deliverables_manifest:', data.deliverables_manifest?.substring(0, 100) + '...');
  console.log('3. key_decisions:', data.key_decisions?.substring(0, 100) + '...');
  console.log('4. known_issues:', data.known_issues?.substring(0, 100) + '...');
  console.log('5. resource_utilization:', data.resource_utilization || '(empty)');
  console.log('6. action_items:', data.action_items?.substring(0, 100) + '...');
  console.log('7. completeness_report:', data.completeness_report?.substring(0, 100) + '...');
  console.log('\nValidation Fields:');
  console.log('- validation_score:', data.validation_score);
  console.log('- validation_passed:', data.validation_passed);
  console.log('- validation_details:', JSON.stringify(data.validation_details, null, 2).substring(0, 200) + '...');
}
