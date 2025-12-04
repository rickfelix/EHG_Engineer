#!/usr/bin/env node

/**
 * Verify Retrospective Quality
 * Checks for boilerplate content and validates quality score
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const sdId = process.argv[2] || 'SD-VERIFY-LADDER-001';

async function main() {
  const { data, error } = await supabase
    .from('retrospectives')
    .select('sd_id, quality_score, what_went_well, what_needs_improvement, key_learnings, action_items, improvement_areas, success_patterns, failure_patterns')
    .eq('sd_id', sdId)
    .single();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('=== Retrospective Quality Check ===');
  console.log('SD:', data.sd_id);
  console.log('Quality Score:', data.quality_score);
  console.log('');

  // Check for boilerplate
  const boilerplatePhrases = [
    'Database-first architecture maintained',
    'LEO Protocol phases followed',
    'Sub-agent automation improved',
    'Review retrospective learnings',
    'Apply patterns from this SD',
    'Update sub-agent instructions',
    'Complete LEO Protocol workflow',
    'Multi-dimensional verification'
  ];

  let boilerplateFound = [];

  const checkForBoilerplate = (arr, field) => {
    if (!arr) return;
    arr.forEach(item => {
      const text = typeof item === 'string' ? item : item.text;
      boilerplatePhrases.forEach(phrase => {
        if (text && text.includes(phrase)) {
          boilerplateFound.push({ field, phrase, text: text.substring(0, 50) + '...' });
        }
      });
    });
  };

  checkForBoilerplate(data.what_went_well, 'what_went_well');
  checkForBoilerplate(data.what_needs_improvement, 'what_needs_improvement');
  checkForBoilerplate(data.key_learnings, 'key_learnings');
  checkForBoilerplate(data.action_items, 'action_items');

  console.log('=== Content Summary ===');
  console.log('what_went_well:', (data.what_went_well || []).length, 'items');
  console.log('what_needs_improvement:', (data.what_needs_improvement || []).length, 'items');
  console.log('key_learnings:', (data.key_learnings || []).length, 'items');
  console.log('action_items:', (data.action_items || []).length, 'items');
  console.log('improvement_areas:', (data.improvement_areas || []).length, 'items');
  console.log('success_patterns:', (data.success_patterns || []).length, 'items');
  console.log('failure_patterns:', (data.failure_patterns || []).length, 'items');
  console.log('');

  if (boilerplateFound.length > 0) {
    console.log('=== BOILERPLATE DETECTED ===');
    boilerplateFound.forEach(b => console.log('-', b.field, ':', b.phrase));
    process.exit(1);
  } else {
    console.log('=== NO BOILERPLATE DETECTED ===');
  }

  console.log('');
  console.log('=== Sample Content ===');
  console.log('Key Learning 1:', (data.key_learnings || [])[0]);
  console.log('');
  console.log('Action Item 1:', JSON.stringify((data.action_items || [])[0]));
  console.log('');
  console.log('Improvement Area 1:', (data.improvement_areas || [])[0]);

  console.log('');
  console.log('=== VALIDATION PASSED ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
