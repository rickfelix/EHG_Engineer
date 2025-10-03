#!/usr/bin/env node

/**
 * Update All Strategic Directives to CRITICAL or HIGH Priority
 *
 * Changes all MEDIUM and LOW priority SDs to HIGH priority
 * Keeps existing CRITICAL SDs as-is
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SDs to update from MEDIUM/LOW to HIGH
const sdsToUpdate = [
  // Originally MEDIUM priority
  'SD-RECONNECT-005',  // Component Directory Consolidation
  'SD-RECONNECT-007',  // Component Library Integration
  'SD-RECONNECT-008',  // Service Layer Completeness
  'SD-RECONNECT-009',  // Feature Documentation
  'SD-RECONNECT-015',  // Global Voice & Translation
  'SD-BACKEND-003',    // Placeholder Feature Evaluation

  // Originally LOW priority
  'SD-RECONNECT-010',  // Automated Feature Testing
  'SD-RECONNECT-014'   // System Observability Suite
];

async function updatePriorities() {
  console.log('🔄 Updating Strategic Directive Priorities');
  console.log('='.repeat(70));
  console.log('📊 Converting all MEDIUM and LOW priorities to HIGH');
  console.log(`   SDs to update: ${sdsToUpdate.length}`);
  console.log('='.repeat(70));
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const sdId of sdsToUpdate) {
    try {
      console.log(`📋 Updating ${sdId}...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update({
          priority: 'high',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId)
        .select('id, title, priority')
        .single();

      if (error) {
        console.error(`   ❌ Error updating ${sdId}:`, error.message);
        errorCount++;
      } else if (data) {
        console.log(`   ✅ ${sdId} updated to HIGH priority`);
        console.log(`      ${data.title}`);
        successCount++;
      } else {
        console.log(`   ⚠️  ${sdId} not found in database`);
        errorCount++;
      }
    } catch (error) {
      console.error(`   ❌ Unexpected error with ${sdId}:`, error.message);
      errorCount++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('✅ Priority Update Complete!');
  console.log('='.repeat(70));
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Successfully updated: ${successCount}/${sdsToUpdate.length}`);
  console.log(`   Errors: ${errorCount}`);
  console.log('');

  // Get final priority breakdown
  const { data: allSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, priority')
    .in('id', [
      'SD-QUALITY-001', 'SD-RELIABILITY-001', 'SD-DATA-001',
      'SD-UX-001', 'SD-EXPORT-001', 'SD-ACCESSIBILITY-001', 'SD-REALTIME-001',
      'SD-RECONNECT-001', 'SD-RECONNECT-002', 'SD-RECONNECT-003', 'SD-RECONNECT-004',
      'SD-RECONNECT-005', 'SD-RECONNECT-006', 'SD-RECONNECT-007', 'SD-RECONNECT-008',
      'SD-RECONNECT-009', 'SD-RECONNECT-010', 'SD-RECONNECT-011', 'SD-RECONNECT-012',
      'SD-RECONNECT-013', 'SD-RECONNECT-014', 'SD-RECONNECT-015',
      'SD-BACKEND-001', 'SD-BACKEND-002', 'SD-BACKEND-003'
    ]);

  if (allSDs) {
    const critical = allSDs.filter(sd => sd.priority === 'critical').length;
    const high = allSDs.filter(sd => sd.priority === 'high').length;
    const medium = allSDs.filter(sd => sd.priority === 'medium').length;
    const low = allSDs.filter(sd => sd.priority === 'low').length;

    console.log('📈 Final Priority Breakdown (25 Total SDs):');
    console.log(`   CRITICAL: ${critical}`);
    console.log(`   HIGH: ${high}`);
    console.log(`   MEDIUM: ${medium}`);
    console.log(`   LOW: ${low}`);
    console.log('');

    if (medium === 0 && low === 0) {
      console.log('✅ SUCCESS: All SDs are now CRITICAL or HIGH priority!');
    } else {
      console.log(`⚠️  WARNING: Still have ${medium + low} MEDIUM/LOW priority SDs`);
    }
  }
  console.log('='.repeat(70));
}

updatePriorities().catch(console.error);
