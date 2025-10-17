#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getSDDetails() {
  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-BOARD-VISUAL-BUILDER-001')
    .single();

  if (sdError) {
    console.error('Error fetching SD:', sdError.message);
    process.exit(1);
  }

  console.log('=== SD-BOARD-VISUAL-BUILDER-001 Details ===\n');
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Priority:', sd.priority);
  console.log('Target App:', sd.target_app || 'NOT SPECIFIED');
  console.log('Current Phase:', sd.current_phase || 'NOT STARTED');
  console.log('Progress:', sd.progress_percentage + '%');
  console.log('\nDescription:', sd.description || 'No description');
  console.log('\nScope:', sd.scope || 'No scope');

  // Check for PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status')
    .eq('strategic_directive_id', 'SD-BOARD-VISUAL-BUILDER-001')
    .maybeSingle();

  if (prd) {
    console.log('\n=== Existing PRD ===');
    console.log('PRD ID:', prd.id);
    console.log('Title:', prd.title);
    console.log('Status:', prd.status);
  } else {
    console.log('\n=== PRD Status: NOT FOUND (will need to create) ===');
  }

  // Check for backlog linkage
  const { data: backlog, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, backlog_title, item_description, priority, completion_status, extras')
    .eq('sd_id', 'SD-BOARD-VISUAL-BUILDER-001')
    .order('priority', { ascending: false });

  if (backlog && backlog.length > 0) {
    console.log('\n=== Linked Backlog Items ===');
    backlog.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.backlog_title} (Priority: ${item.priority})`);
      console.log('   Description:', item.item_description || 'N/A');
      console.log('   Status:', item.completion_status);
      if (item.extras?.Description_1) {
        console.log('   Details:', item.extras.Description_1.substring(0, 200));
      }
    });
  } else {
    console.log('\n=== Backlog Linkage: NO LINKED BACKLOG ITEMS ===');
  }

  // Check for handoffs
  const { data: handoffs, error: handoffsError } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, status, created_at')
    .eq('sd_id', 'SD-BOARD-VISUAL-BUILDER-001')
    .order('created_at', { ascending: true });

  if (handoffs && handoffs.length > 0) {
    console.log('\n=== Existing Handoffs ===');
    handoffs.forEach((h, idx) => {
      console.log(`${idx + 1}. ${h.from_phase} → ${h.to_phase} (${h.status})`);
    });
  } else {
    console.log('\n=== No Handoffs Yet ===');
  }
}

getSDDetails();
