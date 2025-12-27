#!/usr/bin/env node

/**
 * Create Test Refactoring SD
 * Tests the new refactoring workflow with intensity_level field
 * Per LEO Protocol v4.3.3
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SD_KEY = 'SD-REFACTOR-TEST-001';
const INTENSITY_LEVEL = 'structural'; // cosmetic | structural | architectural

async function createTestRefactoringSD() {
  console.log('🔧 Creating Test Refactoring SD...\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Step 1: Check if SD already exists
    console.log('1️⃣ Checking for existing SD...');
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .eq('sd_key', SD_KEY)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${SD_KEY} already exists (status: ${existing.status})`);
      console.log('   Deleting existing record for clean test...');

      await supabase
        .from('strategic_directives_v2')
        .delete()
        .eq('sd_key', SD_KEY);
    }

    // Step 2: Create the refactoring SD with intensity_level
    console.log('\n2️⃣ Creating refactoring SD with intensity_level...');
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .insert({
        id: randomUUID(),
        sd_key: SD_KEY,
        title: 'Test: Extract Service Layer from CalibrationService',
        description: 'Refactor CalibrationService.js to extract multiplier calculation logic into a separate service module for better testability and separation of concerns.',
        status: 'draft',
        category: 'strategic',
        priority: 'low',
        sd_type: 'refactor',
        intensity_level: INTENSITY_LEVEL,
        rationale: 'CalibrationService.js is 500+ LOC with mixed concerns. Extracting multiplier logic will improve maintainability and enable unit testing.',
        scope: 'Single file refactoring affecting CalibrationService.js and creating new MultiplierService.js',
        created_by: 'LEAD',
        sequence_rank: 999,
        version: '1.0',
        metadata: {
          test_sd: true,
          created_for: 'Refactoring workflow verification',
          files_affected: [
            'src/services/CalibrationService.js',
            'src/services/multiplier-service.js (new)'
          ],
          risk_level: 'low',
          backward_compatible: true
        }
      })
      .select()
      .single();

    if (sdError) {
      console.error('❌ Failed to create SD:', sdError.message);
      process.exit(1);
    }

    console.log('✅ Created SD:', sd.sd_key);
    console.log('   ID:', sd.id);
    console.log('   Type:', sd.sd_type);
    console.log('   Intensity:', sd.intensity_level);

    // Step 3: Verify intensity adjustments are available
    console.log('\n3️⃣ Checking intensity adjustments for refactor/' + INTENSITY_LEVEL + '...');
    const { data: adjustments, error: adjError } = await supabase
      .from('sd_intensity_adjustments')
      .select('*')
      .eq('sd_type', 'refactor')
      .eq('intensity_level', INTENSITY_LEVEL)
      .single();

    if (adjError) {
      console.log('⚠️  No intensity adjustments found (table may not exist yet)');
      console.log('   Error:', adjError.message);
    } else if (adjustments) {
      console.log('✅ Intensity adjustments found:');
      console.log('   - Requires PRD: ', adjustments.requires_prd_override ?? 'default');
      console.log('   - Requires E2E: ', adjustments.requires_e2e_override ?? 'default');
      console.log('   - Requires Retro:', adjustments.requires_retrospective_override ?? 'default');
      console.log('   - Min Handoffs:  ', adjustments.min_handoffs_override ?? 'default');
    }

    // Step 4: Check gate exemptions for this intensity
    console.log('\n4️⃣ Checking gate exemptions...');
    const { data: exemptions, error: exError } = await supabase
      .from('sd_intensity_gate_exemptions')
      .select('gate_name, exemption_type, reason')
      .eq('sd_type', 'refactor')
      .eq('intensity_level', INTENSITY_LEVEL);

    if (exError) {
      console.log('⚠️  Gate exemptions table not found:', exError.message);
    } else if (exemptions && exemptions.length > 0) {
      console.log(`✅ Found ${exemptions.length} gate exemptions:`);
      exemptions.forEach(e => {
        const icon = e.exemption_type === 'SKIP' ? '⏭️ ' :
                     e.exemption_type === 'OPTIONAL' ? '❓' : '✓ ';
        console.log(`   ${icon} ${e.gate_name}: ${e.exemption_type}`);
      });
    } else {
      console.log('ℹ️  No specific gate exemptions for this intensity');
    }

    // Step 5: Check REGRESSION sub-agent trigger
    console.log('\n5️⃣ Checking REGRESSION sub-agent registration...');
    const { data: regression, error: regError } = await supabase
      .from('leo_sub_agents')
      .select('id, code, name, priority')
      .eq('code', 'REGRESSION')
      .single();

    if (regError) {
      console.log('⚠️  REGRESSION sub-agent not found:', regError.message);
    } else {
      console.log('✅ REGRESSION sub-agent registered:');
      console.log('   - ID:', regression.id);
      console.log('   - Code:', regression.code);
      console.log('   - Priority:', regression.priority);

      // Check triggers
      const { data: triggers } = await supabase
        .from('leo_sub_agent_triggers')
        .select('trigger_keyword')
        .eq('sub_agent_id', regression.id)
        .limit(5);

      if (triggers && triggers.length > 0) {
        console.log('   - Sample triggers:', triggers.map(t => t.trigger_keyword).join(', '));
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST REFACTORING SD CREATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`\nSD Key:          ${SD_KEY}`);
    console.log('Type:            refactor');
    console.log(`Intensity:       ${INTENSITY_LEVEL}`);
    console.log('Status:          draft');
    console.log('\nNext steps to test the workflow:');
    console.log(`1. Approve SD:   node scripts/handoff.js LEAD-TO-PLAN ${SD_KEY}`);
    console.log(`2. Create Brief: node scripts/create-refactor-brief.js ${SD_KEY}`);
    console.log(`3. Verify gates: npm run sd:status ${SD_KEY}`);
    console.log('\nTo clean up after testing:');
    console.log(`   node -e "require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).from('strategic_directives_v2').delete().eq('sd_key', '${SD_KEY}').then(() => console.log('Deleted'))"`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestRefactoringSD();
