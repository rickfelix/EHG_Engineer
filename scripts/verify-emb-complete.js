#!/usr/bin/env node

/**
 * Comprehensive verification for SD-2025-09-EMB
 * Checks all artifacts are properly in place
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyComplete() {
  console.log('🔍 Comprehensive Verification for SD-2025-09-EMB\n');
  console.log('=' .repeat(60));

  let allChecks = true;

  try {
    // 1. Check Strategic Directive
    console.log('\n1️⃣ Strategic Directive (strategic_directives_v2):');
    const { data: sd, error: _sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-2025-09-EMB')
      .single();

    if (sd) {
      console.log('   ✅ Found SD-2025-09-EMB');
      console.log(`      Title: ${sd.title}`);
      console.log(`      Status: ${sd.status}`);
      console.log(`      Priority: ${sd.priority}`);
      console.log(`      Category: ${sd.category}`);
      console.log(`      Owner: ${sd.created_by}`);
    } else {
      console.log('   ❌ SD-2025-09-EMB not found');
      allChecks = false;
    }

    // 2. Check PRD
    console.log('\n2️⃣ Product Requirements Document (product_requirements_v2):');
    const { data: prd, error: _prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', 'SD-2025-09-EMB')
      .single();

    if (prd) {
      console.log('   ✅ Found PRD for SD-2025-09-EMB');
      console.log(`      PRD ID: ${prd.id}`);
      console.log(`      Title: ${prd.title}`);
      console.log(`      Status: ${prd.status}`);
      console.log(`      Version: ${prd.version}`);
    } else {
      console.log('   ❌ PRD not found');
      allChecks = false;
    }

    // 3. Check Backlog Items
    console.log('\n3️⃣ Backlog Items (sd_backlog_map):');
    const { data: backlog, error: _backlogError, count: _count } = await supabase
      .from('sd_backlog_map')
      .select('*', { count: 'exact' })
      .eq('sd_id', 'SD-2025-09-EMB')
      .order('phase')
      .order('backlog_id');

    if (backlog && backlog.length > 0) {
      console.log(`   ✅ Found ${backlog.length} backlog items`);

      // Group by phase
      const phases = {};
      backlog.forEach(item => {
        if (!phases[item.phase]) {
          phases[item.phase] = { items: [], priorities: {} };
        }
        phases[item.phase].items.push(item);
        phases[item.phase].priorities[item.priority] =
          (phases[item.phase].priorities[item.priority] || 0) + 1;
      });

      Object.keys(phases).sort().forEach(phase => {
        console.log(`      Phase ${phase}: ${phases[phase].items.length} items`);
        Object.entries(phases[phase].priorities).forEach(([priority, count]) => {
          console.log(`         ${priority}: ${count}`);
        });
      });

      // Show priority totals
      const priorityTotals = {};
      backlog.forEach(item => {
        priorityTotals[item.priority] = (priorityTotals[item.priority] || 0) + 1;
      });

      console.log('\n   📊 Overall Priority Distribution:');
      Object.entries(priorityTotals).forEach(([priority, total]) => {
        console.log(`      ${priority}: ${total} items`);
      });

    } else {
      console.log('   ❌ No backlog items found');
      allChecks = false;
    }

    // 4. Cross-reference check
    console.log('\n4️⃣ Cross-Reference Validation:');

    // Check if SD appears alongside other SDs
    const { data: otherSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title')
      .in('id', ['SD-023', 'SD-024', 'SD-025', 'SD-2025-09-EMB'])
      .order('id');

    if (otherSDs && otherSDs.find(s => s.id === 'SD-2025-09-EMB')) {
      console.log('   ✅ SD-2025-09-EMB appears alongside other SDs');
      otherSDs.forEach(s => {
        const marker = s.id === 'SD-2025-09-EMB' ? ' ← Our SD' : '';
        console.log(`      ${s.id}${marker}`);
      });
    }

    // 5. Database files check
    console.log('\n5️⃣ Supporting Files:');
    const files = [
      'database/migrations/2025-09-EMB-message-bus.sql',
      'database/migrations/verify-SD-2025-09-EMB.sql',
      'database/migrations/rollback-SD-2025-09-EMB.sql',
      'docs/product-requirements/SD-2025-09-EMB-README.md'
    ];

    const fs = await import('fs');
    files.forEach(file => {
      const exists = fs.existsSync(file);
      console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });

    // 6. Summary
    console.log('\n' + '=' .repeat(60));
    console.log('📊 SUMMARY:\n');

    if (allChecks) {
      console.log('✅ All core database artifacts verified successfully!');
      console.log('\n📈 Statistics:');
      console.log(`   • 1 Strategic Directive (${sd?.status || 'unknown'} status)`);
      console.log(`   • 1 PRD document (version ${prd?.version || '1.0'})`);
      console.log(`   • ${backlog?.length || 0} backlog items across ${Object.keys(phases || {}).length} phases`);

      console.log('\n🎯 Next Actions:');
      console.log('1. View in dashboard: http://localhost:3000');
      console.log('2. Update status when ready to start:');
      console.log('   UPDATE strategic_directives_v2 SET status = \'active\' WHERE id = \'SD-2025-09-EMB\';');
      console.log('3. Track progress via backlog items in sd_backlog_map');
    } else {
      console.log('⚠️ Some verification checks failed. Review the output above.');
    }

    console.log('\n💾 Database: EHG_Engineer (Supabase)');
    console.log('🎯 Target System: EHG Application (40-stage venture workflow)');
    console.log('📝 Governance: All artifacts stored in EHG_Engineer database');

  } catch (err) {
    console.error('❌ Verification error:', err);
  }
}

// Run verification
verifyComplete().catch(console.error);