#!/usr/bin/env node

/**
 * Activate LEO Protocol v4.2.0 and supersede v4.1.2
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function activateProtocol() {
  console.log('🔄 Activating LEO Protocol v4.2.0...\n');

  try {
    // Step 1: First supersede all active versions
    const { data: superseded, error: supersedeError } = await supabase
      .from('leo_protocols')
      .update({ status: 'superseded' })
      .eq('status', 'active')
      .select('version');

    if (supersedeError) {
      console.warn('⚠️  Warning superseding active versions:', supersedeError);
    } else if (superseded && superseded.length > 0) {
      console.log('📦 Superseded versions:');
      superseded.forEach(p => console.log('   -', p.version));
    }

    // Step 2: Now activate v4.2.0
    const { data: activated, error: activateError } = await supabase
      .from('leo_protocols')
      .update({ status: 'active' })
      .eq('version', 'v4.2.0_story_gates')
      .select()
      .single();

    if (activateError) {
      throw activateError;
    }

    console.log('\n✅ Activated v4.2.0_story_gates');
    console.log('   ID:', activated.id);
    console.log('   Title:', activated.title);

    // Step 3: Verify current status
    const { data: current } = await supabase
      .from('leo_protocols')
      .select('version, status')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n📋 Current Protocol Status:');
    current.forEach(p => {
      const icon = p.status === 'active' ? '🟢' : '⚪';
      console.log(`   ${icon} ${p.version}: ${p.status}`);
    });

    console.log('\n🎯 LEO Protocol v4.2.0 is now ACTIVE!');
    console.log('\n📝 Key Features:');
    console.log('   - User Story Verification System');
    console.log('   - Release Gates (80% threshold)');
    console.log('   - Branch Protection Integration');
    console.log('   - CI/CD Webhook Support');
    console.log('   - Automated Merge Blocking');

  } catch (error) {
    console.error('❌ Error activating protocol:', error);
    process.exit(1);
  }
}

// Run the script
activateProtocol();