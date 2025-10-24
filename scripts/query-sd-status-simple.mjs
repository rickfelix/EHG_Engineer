#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SD_ID = process.argv[2] || 'SD-VWC-PRESETS-001';

async function queryStatus() {
  console.log(`\n📊 Querying ${SD_ID}...\n`);

  // SD status
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress_percentage, prd_id')
    .eq('id', SD_ID)
    .single();

  if (sd) {
    console.log('📋 SD Status:');
    console.log(`  Title: ${sd.title}`);
    console.log(`  Status: ${sd.status}`);
    console.log(`  Phase: ${sd.current_phase}`);
    console.log(`  Progress: ${sd.progress_percentage}%`);
    console.log(`  PRD ID: ${sd.prd_id}`);
  }

  // PRD status
  if (sd?.prd_id) {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, status, exec_checklist')
      .eq('id', sd.prd_id)
      .single();

    if (prd) {
      const checkedItems = prd.exec_checklist ? Object.keys(prd.exec_checklist).filter(k => prd.exec_checklist[k]).length : 0;
      console.log(`\n📄 PRD Status:`);
      console.log(`  Status: ${prd.status}`);
      console.log(`  EXEC Checklist: ${checkedItems}/7 items`);
    }
  }

  // Handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at, status')
    .eq('sd_id', SD_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`\n🔄 Recent Handoffs (${handoffs?.length || 0}):`);
  if (handoffs && handoffs.length > 0) {
    handoffs.forEach(h => {
      const date = new Date(h.created_at).toISOString().split('T')[0];
      console.log(`  ${h.from_phase} → ${h.to_phase} | ${h.status} | ${date}`);
    });
  }

  // User stories
  const { data: stories } = await supabase
    .from('user_stories')
    .select('story_key, title, status, e2e_status')
    .eq('sd_id', SD_ID);

  console.log(`\n📝 User Stories (${stories?.length || 0}):`);
  if (stories && stories.length > 0) {
    const statusCounts = {};
    stories.forEach(s => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });
    Object.keys(statusCounts).forEach(status => {
      console.log(`  ${status}: ${statusCounts[status]}`);
    });
  }
}

queryStatus().catch(console.error);
