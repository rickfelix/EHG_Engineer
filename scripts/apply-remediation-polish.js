#!/usr/bin/env node

/**
 * Apply LEO Protocol Gap Remediation Polish
 * Surgical improvements including Gate 3 authority, RLS, and execution plans
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get Supabase client
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

async function testPolishMigration() {
  console.log('🔧 LEO Protocol Gap Remediation Polish');
  console.log('=====================================\n');

  const supabase = getSupabaseClient();

  try {
    // Read the polish migration SQL
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '015_leo_gap_remediation_polish.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    console.log('📝 Polish improvements include:');
    console.log('  1. Gate 3 as single source of EXEC authorization');
    console.log('  2. RLS policies on exec_authorizations');
    console.log('  3. Enhanced validation constraints');
    console.log('  4. Performance indexes');
    console.log('  5. EXEC readiness dashboard indicator');
    console.log('  6. Structured execution plan table\n');

    console.log('⚠️  To apply this migration, execute the following SQL in Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Paste the contents of: database/migrations/015_leo_gap_remediation_polish.sql');
    console.log('3. Click "Run"\n');

    // Test current Gate 3 status
    console.log('📊 Current Gate 3 Status:');
    console.log('------------------------\n');

    // Check if any Gate 3 reviews exist
    const { data: gate3Reviews, error: gate3Error } = await supabase
      .from('leo_gate_reviews')
      .select('prd_id, score')
      .eq('gate', '3')
      .order('created_at', { ascending: false })
      .limit(5);

    if (gate3Error) {
      console.log('❌ Cannot query Gate 3 reviews:', gate3Error.message);
    } else if (gate3Reviews && gate3Reviews.length > 0) {
      console.log('Recent Gate 3 (Supervisor) reviews:');
      gate3Reviews.forEach(review => {
        const passed = review.score >= 85 ? '✅' : '❌';
        console.log(`  ${review.prd_id}: ${review.score}% ${passed}`);
      });
    } else {
      console.log('  No Gate 3 reviews found (expected - supervisor not yet run)');
    }

    // Check current EXEC readiness
    console.log('\n🔍 Current EXEC Readiness (without Gate 3):');
    console.log('------------------------------------------\n');

    const { data: prds } = await supabase
      .from('product_requirements_v2')
      .select('id, target_url, component_name')
      .limit(3);

    if (prds) {
      for (const prd of prds) {
        // Check gates 2A-2D
        const { data: gateScores } = await supabase
          .from('leo_gate_reviews')
          .select('gate, score')
          .eq('prd_id', prd.id)
          .in('gate', ['2A', '2B', '2C', '2D']);

        const gates2Status = ['2A', '2B', '2C', '2D'].map(gate => {
          const review = gateScores?.find(g => g.gate === gate);
          const score = review ? review.score : 0;
          return `${gate}:${score >= 85 ? '✅' : '❌'}`;
        }).join(' ');

        console.log(`PRD ${prd.id}:`);
        console.log(`  Gates 2A-2D: ${gates2Status}`);
        console.log(`  Fields: URL ${prd.target_url ? '✅' : '❌'}, Component ${prd.component_name ? '✅' : '❌'}`);
        console.log('  Gate 3: ❌ (Not yet run)');
        console.log('  EXEC Ready: ❌ (Needs Gate 3)\n');
      }
    }

    // Show what the execution plan table will provide
    console.log('📋 Execution Plan Table Benefits:');
    console.log('--------------------------------\n');
    console.log('The new leo_execution_plan table will provide:');
    console.log('  • Structured task breakdown with dependencies');
    console.log('  • File-level tracking of what EXEC will modify');
    console.log('  • Acceptance criteria references per task');
    console.log('  • Progress tracking at task granularity');
    console.log('  • Audit trail of who executed what and when\n');

    console.log('Example execution plan structure:');
    console.log(`{
  task_id: 'PRD-SD-001-T001',
  description: 'Add dark mode toggle to Dashboard settings',
  files: ['src/components/Dashboard.tsx', 'src/styles/theme.css'],
  depends_on: [],
  acceptance_refs: [
    { type: 'gate', ref: '2B', criteria: 'WCAG 2.1 AA compliance' },
    { type: 'test', ref: 'e2e-dark-mode', criteria: 'Toggle persists across sessions' }
  ]
}\n`);

    console.log('✅ Analysis complete!\n');
    console.log('📝 Next Steps:');
    console.log('1. Apply the polish migration via Supabase Dashboard');
    console.log('2. Run Gate 3 (PLAN Supervisor) validation');
    console.log('3. Populate execution plans from PRD breakdowns');
    console.log('4. Update dashboard to show readiness indicators');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
testPolishMigration().catch(console.error);