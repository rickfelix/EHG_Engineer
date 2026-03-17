#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

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
  console.log('='.repeat(80));

  data.forEach((story, idx) => {
    console.log(`\n${idx + 1}. ${story.story_key}: ${story.title}`);
    console.log(`   👤 Persona: ${story.user_persona}`);
    console.log(`   💡 Benefit: ${story.benefit}`);
    console.log(`   📊 Quality Score: ${story.quality_score}%`);
    console.log(`   ✓ Acceptance Criteria: ${story.acceptance_criteria?.length || 0} items`);
    if (story.acceptance_criteria && story.acceptance_criteria.length > 0) {
      story.acceptance_criteria.forEach((ac, i) => {
        const preview = ac.length > 100 ? ac.substring(0, 100) + '...' : ac;
        console.log(`      ${i + 1}. ${preview}`);
      });
    }
    console.log(`   🔧 Implementation Context: ${story.implementation_context ? 'YES (' + Object.keys(story.implementation_context).length + ' keys)' : 'NO'}`);
    console.log(`   🏗️  Architecture Refs: ${story.architecture_references ? 'YES' : 'NO'}`);
    console.log(`   🧪 Testing Scenarios: ${story.testing_scenarios ? 'YES' : 'NO'}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\n✅ Total User Stories: ${data.length}\n`);
}

viewUserStories().catch(console.error);
