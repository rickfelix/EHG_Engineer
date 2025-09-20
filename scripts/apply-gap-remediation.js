#!/usr/bin/env node

/**
 * Apply LEO Protocol Gap Remediation
 * Fixes critical gaps between PLAN and EXEC phases
 */

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyMigration() {
  console.log('🔧 LEO Protocol Gap Remediation');
  console.log('================================\n');

  try {
    // Read the migration SQL
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '014_leo_gap_remediation.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    console.log('📝 Migration includes:');
    console.log('  1. Add structured fields to PRDs table');
    console.log('  2. Populate PLAN→EXEC handoff templates');
    console.log('  3. Create gate validation trigger');
    console.log('  4. Add test plan matrix validation\n');

    // Since we can't execute raw SQL via Supabase JS client with anon key,
    // we'll show the SQL and instructions
    console.log('⚠️  To apply this migration, execute the following SQL in Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('2. Paste the contents of: database/migrations/014_leo_gap_remediation.sql');
    console.log('3. Click "Run"\n');

    // Test current state
    console.log('📊 Current System State:');
    console.log('------------------------\n');

    // Check PRDs structure
    const { data: prds, error: prdError } = await supabase
      .from('prds')
      .select('id, title, target_url, component_name')
      .limit(3);

    if (prdError) {
      console.log('❌ Cannot query PRDs:', prdError.message);
    } else {
      console.log('PRDs with target info:');
      prds.forEach(prd => {
        const hasTarget = prd.target_url ? '✅' : '❌';
        const hasComponent = prd.component_name ? '✅' : '❌';
        console.log(`  ${prd.id}: Target ${hasTarget}, Component ${hasComponent}`);
      });
    }

    // Check handoff templates
    const { data: handoffs, error: handoffError } = await supabase
      .from('leo_handoff_templates')
      .select('from_agent, to_agent, handoff_type')
      .eq('active', true);

    if (handoffError) {
      console.log('\n❌ Cannot query handoff templates (table may not exist)');
    } else {
      console.log('\nHandoff templates:');
      if (handoffs && handoffs.length > 0) {
        handoffs.forEach(h => {
          console.log(`  ✅ ${h.from_agent} → ${h.to_agent} (${h.handoff_type})`);
        });
      } else {
        console.log('  ❌ No handoff templates found');
      }
    }

    // Check gate scores
    const { data: gates, error: gateError } = await supabase
      .from('leo_gate_reviews')
      .select('prd_id, gate, score')
      .order('created_at', { ascending: false })
      .limit(5);

    if (gateError) {
      console.log('\n❌ Cannot query gate reviews:', gateError.message);
    } else {
      console.log('\nRecent gate reviews:');
      if (gates && gates.length > 0) {
        gates.forEach(g => {
          const passed = g.score >= 85 ? '✅' : '❌';
          console.log(`  ${g.prd_id} Gate ${g.gate}: ${g.score}% ${passed}`);
        });
      } else {
        console.log('  No gate reviews found');
      }
    }

    // Test EXEC readiness logic
    console.log('\n🔍 EXEC Readiness Check:');
    console.log('------------------------\n');

    if (prds && prds.length > 0) {
      for (const prd of prds) {
        console.log(`PRD ${prd.id}:`);

        // Check gates
        const { data: gateScores } = await supabase
          .from('leo_gate_reviews')
          .select('gate, score')
          .eq('prd_id', prd.id)
          .in('gate', ['2A', '2B', '2C', '2D']);

        const gateStatus = ['2A', '2B', '2C', '2D'].map(gate => {
          const review = gateScores?.find(g => g.gate === gate);
          const score = review ? review.score : 0;
          return `${gate}:${score >= 85 ? '✅' : '❌'}`;
        }).join(' ');

        console.log(`  Gates: ${gateStatus}`);
        console.log(`  Target URL: ${prd.target_url ? '✅' : '❌ Missing'}`);
        console.log(`  Component: ${prd.component_name ? '✅' : '❌ Missing'}`);

        const allGatesPassed = gateScores &&
          ['2A', '2B', '2C', '2D'].every(gate =>
            gateScores.some(g => g.gate === gate && g.score >= 85)
          );

        const hasRequiredFields = prd.target_url && prd.component_name;
        const execReady = allGatesPassed && hasRequiredFields;

        console.log(`  EXEC Ready: ${execReady ? '✅ YES' : '❌ NO'}\n`);
      }
    }

    console.log('\n✅ Analysis complete!');
    console.log('\n📝 Next Steps:');
    console.log('1. Apply the migration via Supabase Dashboard');
    console.log('2. Update PRDs with target_url and component_name');
    console.log('3. Run gate validations to score ≥85%');
    console.log('4. EXEC will be automatically authorized when ready');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
applyMigration().catch(console.error);