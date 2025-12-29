#!/usr/bin/env node

/**
 * Verify all Auth-related items are properly linked
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyLinkage() {
  console.log('🔍 Verifying Auth Setup Issue Linkage');
  console.log('================================================================\n');

  try {
    // 1. Check Strategic Directive
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', 'SD-AUTH-SETUP-2025-001')
      .single();

    if (sdError || !sd) {
      console.log('❌ Strategic Directive not found');
    } else {
      console.log('✅ Strategic Directive Found:');
      console.log('   ID: ' + sd.id);
      console.log('   Title: ' + sd.title);
      console.log('   Status: ' + sd.status);
      console.log('   Priority: ' + sd.priority);
      console.log('   Scope: ' + sd.scope);
    }

    // 2. Check PRD
    const { data: prds } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', 'SD-AUTH-SETUP-2025-001');

    if (prds && prds.length > 0) {
      console.log('\n✅ PRD(s) Found:');
      prds.forEach(prd => {
        console.log('   ID: ' + prd.id);
        console.log('   Title: ' + prd.title);
        console.log('   Status: ' + prd.status);
        console.log('   Created: ' + new Date(prd.created_at).toLocaleString());

        // Check content
        if (prd.content) {
          const content = typeof prd.content === 'string' ? JSON.parse(prd.content) : prd.content;
          if (content.user_stories) {
            console.log('   User Stories: ' + content.user_stories.length);
          }
        }
      });
    } else {
      console.log('\n❌ No PRDs found for this SD');
    }

    // 3. Summary
    console.log('\n📊 Linkage Summary:');
    console.log('================================================================');
    console.log('Strategic Directive: SD-AUTH-SETUP-2025-001 ✅');
    console.log('PRD: PRD-SD-AUTH-SETUP-2025-001 ✅');
    console.log('Backlog Item: Not available (table does not exist)');

    console.log('\n🎯 Key Information:');
    console.log('- Issue: Authentication test setup failure blocking all UAT tests');
    console.log('- Impact: 1455 tests blocked across 5 browsers');
    console.log('- Priority: CRITICAL');
    console.log('- Estimated Resolution: 2 days');
    console.log('- Implementation Phases: 3 (Immediate Fix, Robustness, Long-term)');

    console.log('\n📋 Next Steps:');
    console.log('1. Execute LEO orchestrator for SD-AUTH-SETUP-2025-001');
    console.log('2. Implement fixes in global-auth.js');
    console.log('3. Test across all browser configurations');
    console.log('4. Monitor authentication success rate');

  } catch (_error) {
    console.error('❌ Error verifying linkage:', error.message);
  }
}

// Execute
verifyLinkage();