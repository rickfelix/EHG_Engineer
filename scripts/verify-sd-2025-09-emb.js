#!/usr/bin/env node

/**
 * Verify SD-2025-09-EMB installation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function verifyInstallation() {
  console.log('🔍 Verifying SD-2025-09-EMB Installation...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Check Strategic Directive
    console.log('1️⃣ Checking Strategic Directive...');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-2025-09-EMB')
      .single();

    if (sdError) {
      console.error('❌ SD not found:', sdError);
      return false;
    }

    console.log('✅ Strategic Directive found:');
    console.log(`   - ID: ${sdData.id}`);
    console.log(`   - Title: ${sdData.title}`);
    console.log(`   - Status: ${sdData.status}`);
    console.log(`   - Priority: ${sdData.priority}`);
    console.log(`   - Category: ${sdData.category}`);
    console.log(`   - Created By: ${sdData.created_by}`);
    console.log(`   - Execution Order: ${sdData.execution_order}`);

    if (sdData.scope) {
      console.log(`   - Scope: ${sdData.scope.substring(0, 80)}...`);
    }
    if (sdData.rationale) {
      console.log(`   - Rationale: ${sdData.rationale.substring(0, 80)}...`);
    }

    // 2. Check PRD (if table exists)
    console.log('\n2️⃣ Checking PRD...');
    const { data: prdData, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', 'SD-2025-09-EMB')
      .single();

    if (prdError) {
      if (prdError.code === 'PGRST116') {
        console.log('⚠️ PRD table does not exist yet');
        console.log('   Run the full SQL migration to create PRD and backlog tables');
      } else if (prdError.code === 'PGRST116' || prdError.message.includes('not found')) {
        console.log('⚠️ No PRD found for this SD yet');
      } else {
        console.log('⚠️ PRD check error:', prdError.message);
      }
    } else {
      console.log('✅ PRD found:');
      console.log(`   - ID: ${prdData.id}`);
      console.log(`   - Title: ${prdData.title}`);
      console.log(`   - Status: ${prdData.status}`);
      console.log(`   - Version: ${prdData.version}`);
    }

    // 3. Check related SDs
    console.log('\n3️⃣ Checking other Strategic Directives...');
    const { data: allSDs, error: _allSDsError } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, priority')
      .order('execution_order', { ascending: true })
      .limit(10);

    if (allSDs && allSDs.length > 0) {
      console.log(`✅ Found ${allSDs.length} total Strategic Directives:`);
      allSDs.forEach(sd => {
        const marker = sd.id === 'SD-2025-09-EMB' ? ' ← NEW' : '';
        console.log(`   - ${sd.id}: ${sd.title?.substring(0, 50)}...${marker}`);
      });
    }

    // 4. Dashboard integration check
    console.log('\n4️⃣ Dashboard Integration:');
    console.log('   📊 The SD should now appear in the dashboard at:');
    console.log('   http://localhost:3000 (Strategic Directives section)');
    console.log('   🔄 If not visible, restart the dashboard server:');
    console.log('   npm run dev');

    // 5. Next steps
    console.log('\n📝 Next Steps:');
    console.log('1. ✅ SD-2025-09-EMB is in the database');
    console.log('2. 📄 Review the full migration SQL for backlog structure:');
    console.log('   database/migrations/2025-09-EMB-message-bus.sql');
    console.log('3. 🚀 Apply full migration via Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('4. 📋 This will create:');
    console.log('   - Extended SD fields (kpis, acceptance_criteria, tags)');
    console.log('   - PRD with full specifications');
    console.log('   - 5 Epics with stories and tasks');
    console.log('   - Views for reporting (v_prd_sd_payload, v_sd_backlog_flat)');
    console.log('5. 🔧 Update SD status when ready:');
    console.log('   UPDATE strategic_directives_v2 SET status = \'active\' WHERE id = \'SD-2025-09-EMB\';');

    console.log('\n✅ Verification complete!');
    return true;

  } catch (_error) {
    console.error('❌ Verification failed:', error);
    return false;
  }
}

// Run verification
verifyInstallation().catch(console.error);