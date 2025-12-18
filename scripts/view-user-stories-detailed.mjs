#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function viewUserStories() {
  const { data, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-HARDENING-V1-002')
    .order('story_key');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('\n📊 User Stories for SD-HARDENING-V1-002');
  console.log('='.repeat(100));

  data.forEach((story, idx) => {
    console.log(`\n${idx + 1}. ${story.story_key}: ${story.title}`);
    console.log(`   👤 Persona: ${story.user_persona || 'N/A'}`);
    console.log(`   💡 Benefit: ${story.benefit || 'N/A'}`);
    console.log(`   📊 Quality Score: ${story.quality_score || 'N/A'}%`);
    console.log(`   📋 Status: ${story.validation_status || 'pending'}`);
    
    console.log(`\n   ✓ Acceptance Criteria (${story.acceptance_criteria?.length || 0} items):`);
    if (story.acceptance_criteria && story.acceptance_criteria.length > 0) {
      story.acceptance_criteria.forEach((ac, i) => {
        const text = typeof ac === 'object' ? JSON.stringify(ac, null, 2) : ac;
        console.log(`      ${i + 1}. ${text}`);
      });
    }
    
    if (story.implementation_context) {
      console.log(`\n   🔧 Implementation Context Keys: ${Object.keys(story.implementation_context).join(', ')}`);
    }
    
    if (story.architecture_references) {
      console.log(`\n   🏗️  Architecture References:`);
      if (typeof story.architecture_references === 'object') {
        console.log(JSON.stringify(story.architecture_references, null, 6));
      } else {
        console.log(`      ${story.architecture_references}`);
      }
    }
    
    if (story.testing_scenarios) {
      console.log(`\n   🧪 Testing Scenarios:`);
      if (typeof story.testing_scenarios === 'object') {
        console.log(JSON.stringify(story.testing_scenarios, null, 6));
      } else {
        console.log(`      ${story.testing_scenarios}`);
      }
    }
    
    console.log('\n   ' + '-'.repeat(96));
  });

  console.log('\n' + '='.repeat(100));
  console.log(`\n✅ Total User Stories: ${data.length}\n`);
}

viewUserStories().catch(console.error);
