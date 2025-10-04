#!/usr/bin/env node

/**
 * Add PLAN-to-LEAD handoff template to database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const template = {
  from_agent: 'PLAN',
  to_agent: 'LEAD',
  handoff_type: 'verification_to_approval',
  template_structure: {
    sections: [
      'Executive Summary',
      'Completeness Report',
      'Deliverables Manifest',
      'Key Decisions & Rationale',
      'Known Issues & Risks',
      'Resource Utilization',
      'Action Items for Receiver'
    ]
  },
  required_elements: [
    {
      element: 'EXEC work complete',
      required: true
    },
    {
      element: 'Sub-agent verifications complete',
      required: true
    },
    {
      element: 'EXEC checklist >= 80%',
      required: true
    }
  ],
  validation_rules: [
    {
      rule: 'prd_status_verification',
      required: true
    },
    {
      rule: 'exec_handoff_exists',
      required: true
    },
    {
      rule: 'minimum_score',
      threshold: 70
    }
  ],
  active: true,
  version: 1
};

console.log('📝 Adding PLAN-to-LEAD handoff template...\n');

const { data, error } = await supabase
  .from('leo_handoff_templates')
  .insert(template)
  .select();

if (error) {
  console.error('❌ Error adding template:', error);
  process.exit(1);
}

console.log('✅ Template Added Successfully');
console.log('   ID:', data[0].id);
console.log('   Type:', data[0].handoff_type);
console.log('   Sections:', data[0].template_structure.sections.length);
console.log('\n📊 PLAN-to-LEAD handoff now supported');
