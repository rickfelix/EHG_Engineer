#!/usr/bin/env node
/**
 * Fix SD-DOCS-ARCH-001 PRD with proper content
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPRD() {
  const prdId = 'PRD-SD-DOCS-ARCH-001';

  // Fix acceptance criteria with real content
  const acceptance_criteria = [
    'Documentation folder hierarchy is defined with clear purpose for each folder (docs/, reference/, guides/, api/)',
    'File naming conventions are documented with kebab-case examples and required prefixes',
    'Cross-reference linking system is specified with markdown link format and related-docs section pattern',
    'Migration guide for existing documentation is created with step-by-step instructions'
  ];

  // Fix test scenarios with real content
  const test_scenarios = [
    {
      id: 'TS-1',
      scenario: 'Verify folder structure is documented',
      description: 'Check that docs/, reference/, guides/, api/ folders have purpose descriptions',
      expected_result: 'Each folder has a README explaining its purpose',
      test_type: 'manual'
    },
    {
      id: 'TS-2',
      scenario: 'Verify naming conventions are clear',
      description: 'Check that file naming rules are documented with examples',
      expected_result: 'Naming convention document includes 3+ examples per doc type',
      test_type: 'manual'
    },
    {
      id: 'TS-3',
      scenario: 'Verify cross-reference format works',
      description: 'Test that cross-reference links work correctly between docs',
      expected_result: 'Links render correctly in markdown preview',
      test_type: 'manual'
    }
  ];

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({ acceptance_criteria, test_scenarios })
    .eq('id', prdId);

  if (error) {
    console.error('Failed to update PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ Updated PRD with proper acceptance_criteria and test_scenarios');

  // Delete old user stories
  const { error: deleteError, count } = await supabase
    .from('user_stories')
    .delete()
    .eq('sd_id', 'SD-DOCS-ARCH-001')
    .select('id', { count: 'exact' });

  if (deleteError) {
    console.error('Failed to delete user stories:', deleteError.message);
  } else {
    console.log(`✅ Deleted ${count || 0} old user stories`);
  }

  console.log('📝 Now re-run: node scripts/execute-subagent.js --code STORIES --sd-id SD-DOCS-ARCH-001');
}

fixPRD().catch(console.error);
