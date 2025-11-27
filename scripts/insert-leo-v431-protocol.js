#!/usr/bin/env node
/**
 * Insert LEO Protocol v4.3.1 (SD-LEO-4-3-1-HARDENING)
 *
 * This script:
 * 1. Deactivates existing active protocols
 * 2. Inserts new v4.3.1 protocol with updated sections
 * 3. Verifies the transition
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const PROTOCOL_ID = 'leo-v4-3-1-hardening';

const newProtocol = {
  id: PROTOCOL_ID,
  version: '4.3.1',
  title: 'LEO Protocol v4.3.1 - Hardening & Constraint Documentation',
  description: `LEO Protocol v4.3.1 introduces hardening improvements:
- Schema constraints documentation in database (leo_schema_constraints table)
- Process scripts documentation with examples (leo_process_scripts table)
- Pre-validation before database inserts
- Version consistency checking (check-leo-version.js)
- KB generation tracking (leo_kb_generation_log table)`,
  status: 'active'
};

async function insertProtocol() {
  console.log('🔄 LEO Protocol v4.3.1 Installation');
  console.log('='.repeat(50));

  try {
    // Step 1: Deactivate existing active protocols
    console.log('\n📦 Step 1: Deactivating existing active protocols...');
    const { data: existing, error: fetchError } = await supabase
      .from('leo_protocols')
      .select('id, version, status')
      .eq('status', 'active');

    if (fetchError) {
      throw new Error(`Failed to fetch existing protocols: ${fetchError.message}`);
    }

    if (existing && existing.length > 0) {
      console.log(`   Found ${existing.length} active protocol(s):`);
      for (const proto of existing) {
        console.log(`   - ${proto.id} (${proto.version})`);
      }

      const { error: deactivateError } = await supabase
        .from('leo_protocols')
        .update({ status: 'superseded' })
        .eq('status', 'active');

      if (deactivateError) {
        throw new Error(`Failed to deactivate protocols: ${deactivateError.message}`);
      }
      console.log('   ✅ Superseded existing active protocols');
    } else {
      console.log('   No active protocols found');
    }

    // Step 2: Check if v4.3.1 already exists
    console.log('\n📦 Step 2: Checking for existing v4.3.1...');
    const { data: existingV431, error: checkError } = await supabase
      .from('leo_protocols')
      .select('id, status')
      .eq('id', PROTOCOL_ID)
      .single();

    if (existingV431) {
      console.log(`   Protocol ${PROTOCOL_ID} already exists with status: ${existingV431.status}`);
      console.log('   Updating to active status...');

      const { error: updateError } = await supabase
        .from('leo_protocols')
        .update({
          status: 'active',
          description: newProtocol.description
        })
        .eq('id', PROTOCOL_ID);

      if (updateError) {
        throw new Error(`Failed to update protocol: ${updateError.message}`);
      }
      console.log('   ✅ Protocol updated to active');
    } else {
      // Step 3: Insert new protocol
      console.log('\n📦 Step 3: Inserting new protocol...');
      const { error: insertError } = await supabase
        .from('leo_protocols')
        .insert(newProtocol);

      if (insertError) {
        throw new Error(`Failed to insert protocol: ${insertError.message}`);
      }
      console.log('   ✅ Protocol v4.3.1 inserted');
    }

    // Step 4: Copy sections from previous version
    console.log('\n📦 Step 4: Copying sections from previous version...');
    const { data: oldSections, error: sectionsError } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .eq('protocol_id', 'leo-v4-2-0-story-gates')
      .order('order_index');

    if (oldSections && oldSections.length > 0) {
      console.log(`   Found ${oldSections.length} sections to copy`);

      // Check if sections already exist for v4.3.1
      const { data: existingSections } = await supabase
        .from('leo_protocol_sections')
        .select('id')
        .eq('protocol_id', PROTOCOL_ID);

      if (!existingSections || existingSections.length === 0) {
        const newSections = oldSections.map(section => ({
          ...section,
          id: randomUUID(),
          protocol_id: PROTOCOL_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: copySectionsError } = await supabase
          .from('leo_protocol_sections')
          .insert(newSections);

        if (copySectionsError) {
          console.warn(`   ⚠️  Could not copy sections: ${copySectionsError.message}`);
        } else {
          console.log(`   ✅ Copied ${newSections.length} sections`);
        }
      } else {
        console.log(`   Sections already exist for v4.3.1 (${existingSections.length} sections)`);
      }
    } else {
      console.log('   No sections found in previous version to copy');
    }

    // Step 5: Verify
    console.log('\n📦 Step 5: Verifying installation...');
    const { data: finalProto, error: verifyError } = await supabase
      .from('leo_protocols')
      .select('*')
      .eq('status', 'active')
      .single();

    if (verifyError || !finalProto) {
      throw new Error(`Verification failed: ${verifyError?.message || 'No active protocol found'}`);
    }

    console.log('');
    console.log('='.repeat(50));
    console.log('✅ LEO Protocol v4.3.1 Installation Complete');
    console.log('='.repeat(50));
    console.log(`   ID: ${finalProto.id}`);
    console.log(`   Version: ${finalProto.version}`);
    console.log(`   Status: ${finalProto.status}`);
    console.log(`   Title: ${finalProto.title}`);
    console.log('');
    console.log('Next steps:');
    console.log('   1. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   2. Verify: node scripts/check-leo-version.js');

  } catch (error) {
    console.error('\n❌ Installation failed:', error.message);
    process.exit(1);
  }
}

insertProtocol();
