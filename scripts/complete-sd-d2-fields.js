#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const sdId = 'SD-VISION-TRANSITION-001D2';

  console.log('🔧 Completing SD-D2 fields for LEAD-TO-PLAN handoff...\n');

  // Add risks field
  const risks = [
    {
      risk: 'Component integration with existing v1 workflow',
      probability: 'medium',
      impact: 'medium',
      mitigation: 'Leverage Stage 1-5 v2 patterns from SD-D1, test integration incrementally'
    },
    {
      risk: 'UI/UX complexity for Business Model Canvas',
      probability: 'medium',
      impact: 'low',
      mitigation: 'Use proven BMC frameworks, reuse existing Card/Tab patterns'
    },
    {
      risk: 'Data contract misalignment with lifecycle_stage_config',
      probability: 'low',
      impact: 'high',
      mitigation: 'Validate against existing stage config before implementation'
    }
  ];

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      risks: risks,
      updated_at: new Date().toISOString()
    })
    .eq('id', sdId);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('✅ Risks field added');

  // Verify completeness
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, strategic_objectives, success_metrics, key_principles, risks')
    .eq('id', sdId)
    .single();

  console.log('\n📋 SD-D2 Completeness Check:');
  console.log('   Strategic Objectives:', sd.strategic_objectives?.length || 0, 'defined');
  console.log('   Success Metrics:', sd.success_metrics?.length || 0, 'defined');
  console.log('   Key Principles:', sd.key_principles?.length || 0, 'defined');
  console.log('   Risks:', sd.risks?.length || 0, 'defined');

  const complete =
    (sd.strategic_objectives?.length > 0) &&
    (sd.success_metrics?.length > 0) &&
    (sd.key_principles?.length > 0) &&
    (sd.risks?.length > 0);

  console.log('\n', complete ? '✅ SD-D2 is complete for LEAD-TO-PLAN' : '❌ Still missing required fields');
}

main();
