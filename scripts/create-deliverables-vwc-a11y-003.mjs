#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('📋 Creating deliverables for SD-VWC-A11Y-003...\n');

// Get SD uuid_id
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('uuid_id')
  .eq('id', 'SD-VWC-A11Y-003')
  .single();

if (!sd) {
  console.error('❌ SD not found');
  process.exit(1);
}

const deliverables = [
  {
    sd_id: 'SD-VWC-A11Y-003',
    deliverable_type: 'ui_feature',
    deliverable_name: 'Fix ProgressStepper Current Step Title Contrast',
    description: 'Update color classes in ProgressStepper.tsx line 150 to achieve 4.5:1 minimum contrast ratio for current step title text (currently 1.01:1)',
    completion_status: 'pending',
    priority: 'required'
  },
  {
    sd_id: 'SD-VWC-A11Y-003',
    deliverable_type: 'ui_feature',
    deliverable_name: 'Fix ProgressStepper Current Step Description Contrast',
    description: 'Update color classes in ProgressStepper.tsx line 157 to achieve 4.5:1 minimum contrast ratio for current step description text (currently 1.47:1)',
    completion_status: 'pending',
    priority: 'required'
  },
  {
    sd_id: 'SD-VWC-A11Y-003',
    deliverable_type: 'ui_feature',
    deliverable_name: 'Fix PersonaToggle Active Button Contrast',
    description: 'Update color classes in PersonaToggle.tsx line 66 to achieve 4.5:1 minimum contrast ratio for active button (currently 3.76:1)',
    completion_status: 'pending',
    priority: 'required'
  }
];

const { data, error } = await supabase
  .from('sd_scope_deliverables')
  .insert(deliverables)
  .select();

if (error) {
  console.error('❌ Failed:', error.message);
  console.error('Error:', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('✅ Created', data.length, 'deliverables:');
data.forEach((d, i) => {
  console.log(`   ${i + 1}. ${d.deliverable_name}`);
});

console.log('\n🎯 Deliverables created successfully');
console.log('📋 Next: Create user stories');
