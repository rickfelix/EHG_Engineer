#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { createClient  } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkBacklogGaps() {
  console.log('Checking for backlog integrity gaps...\n');

  // 1. Check PRD issues
  const { data: prdIssues, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, completeness_score, risk_rating, acceptance_criteria')
    .or('completeness_score.lt.0,completeness_score.gt.100,risk_rating.not.in.(low,medium,high),acceptance_criteria.is.null');

  console.log('PRD Contract Issues:');
  if (prdError) {
    console.log('  Error:', prdError.message);
  } else {
    console.log('  Found:', prdIssues?.length || 0, 'issues');
    if (prdIssues?.length > 0) {
      console.log('  Sample:', prdIssues[0]);
    }
  }

  // 2. Check for orphaned backlogs (if eng_backlog table exists)
  const { data: backlogOrphans, error: backlogError } = await supabase
    .from('eng_backlog')
    .select('id, prd_id, priority')
    .is('prd_id', null);

  console.log('\nBacklog Orphans:');
  if (backlogError) {
    console.log('  Table might not exist:', backlogError.message);
  } else {
    console.log('  Found:', backlogOrphans?.length || 0, 'orphans');
  }

  // 3. Check for invalid priorities in backlog
  const { data: invalidPriorities, error: priorityError } = await supabase
    .from('eng_backlog')
    .select('id, priority')
    .not('priority', 'in', '(P0,P1,P2,P3)');

  console.log('\nInvalid Priorities:');
  if (priorityError) {
    console.log('  Error:', priorityError.message);
  } else {
    console.log('  Found:', invalidPriorities?.length || 0, 'items');
  }

  // 4. Check what tables exist
  console.log('\nChecking available tables...');
  const { data: sdCount } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true });

  const { data: prdCount } = await supabase
    .from('product_requirements_v2')
    .select('id', { count: 'exact', head: true });

  const { data: backlogCount } = await supabase
    .from('eng_backlog')
    .select('id', { count: 'exact', head: true });

  console.log('Table counts:');
  console.log('  strategic_directives_v2:', sdCount || 'exists');
  console.log('  product_requirements_v2:', prdCount || 'exists');
  console.log('  eng_backlog:', backlogCount || 'not found');
}

checkBacklogGaps();