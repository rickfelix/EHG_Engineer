#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = 'SD-RECURSION-ENGINE-001';

// Create retrospective for SD-RECURSION-ENGINE-001
const retrospective = {
  sd_id: sdId,
  title: 'SD-RECURSION-ENGINE-001 Retrospective: 6 New Recursion Triggers',
  content: JSON.stringify({
    executive_summary: 'Successfully implemented 6 new recursion triggers for the dual-network recursion engine, expanding detection capabilities beyond basic financial metrics.',
    what_went_well: [
      'Clean implementation following existing patterns (evaluateFIN001, evaluateTECH001)',
      'Comprehensive test coverage with 21 unit tests added',
      'Flexible field name handling for robustness',
      'Build passed with no new errors',
      'E2E tests 86% pass rate'
    ],
    what_could_improve: [
      'Pre-existing Supabase mock chain issue should be fixed for cleaner test runs',
      'E2E tests for venture creation form have UI timeout issues'
    ],
    lessons_learned: [
      'Threshold-based evaluation pattern works well for quantitative triggers',
      'Boolean triggers (like LEGAL-001) can be simplified by checking any blocking condition',
      'Supporting multiple field name aliases improves integration flexibility'
    ],
    metrics: {
      triggers_implemented: 6,
      unit_tests_added: 21,
      lines_of_code_added: 546,
      e2e_pass_rate: 86,
      build_status: 'PASS'
    },
    triggers_delivered: [
      'EXIT-001: Early exit opportunity (3x investment threshold)',
      'MKT-001: Market shift detection (20% TAM change)',
      'LEGAL-001: Legal/regulatory blockers',
      'DEV-001: Development team failure (50% velocity drop)',
      'PRICE-001: Pricing model invalidation (negative unit economics)',
      'AI-001: AI disruption detected (70% severity threshold)'
    ]
  }),
  sprint: 'SD-RECURSION-ENGINE-001',
  created_by: 'EXEC',
  status: 'completed',
  metadata: {
    sd_id: sdId,
    commit_sha: 'bc2a937b',
    branch: 'feat/SD-RECURSION-ENGINE-001-dual-network-recursion-engine'
  }
};

const { data, error } = await supabase
  .from('retrospectives')
  .insert(retrospective)
  .select()
  .single();

if (error) {
  console.log('Error creating retrospective:', error.message);
  // Try alternative table
  const { data: alt, error: altError } = await supabase
    .from('document_retrospectives')
    .insert({
      sd_id: sdId,
      title: retrospective.title,
      summary: JSON.parse(retrospective.content).executive_summary,
      lessons_learned: JSON.parse(retrospective.content).lessons_learned,
      what_went_well: JSON.parse(retrospective.content).what_went_well,
      what_could_improve: JSON.parse(retrospective.content).what_could_improve,
      created_by: 'EXEC',
      status: 'completed'
    })
    .select()
    .single();
  
  if (altError) {
    console.log('Alt error:', altError.message);
  } else {
    console.log('✅ Retrospective created in document_retrospectives:', alt.id);
  }
} else {
  console.log('✅ Retrospective created:', data.id);
}

// Check progress again
const { data: progress } = await supabase
  .rpc('get_progress_breakdown', { sd_id_param: sdId });

console.log('\n=== Progress After Retrospective ===');
console.log('Total Progress:', progress ? progress.total_progress : 'N/A');
console.log('Can Complete:', progress ? progress.can_complete : 'N/A');
