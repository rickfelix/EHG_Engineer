#!/usr/bin/env node

/**
 * Migrate Existing Database Records to Use Preferred Status Values
 * Updates deprecated status values to their recommended equivalents
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import StatusValidator from '../lib/dashboard/status-validator';

async function migrateStatuses() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const validator = new StatusValidator();
  let totalUpdated = 0;

  console.log('🔄 Starting status migration to preferred values...\n');

  try {
    // Migrate Strategic Directives
    console.log('📋 Migrating Strategic Directives...');
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, status');

    if (!sdError && sds) {
      for (const sd of sds) {
        const normalized = validator.normalizeStatus('SD', sd.status);
        if (normalized !== sd.status) {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .update({ status: normalized })
            .eq('id', sd.id);

          if (!error) {
            console.log(`  ✅ SD ${sd.id}: "${sd.status}" → "${normalized}"`);
            totalUpdated++;
          } else {
            console.log(`  ❌ Failed to update SD ${sd.id}: ${error.message}`);
          }
        }
      }
      console.log(`  Checked ${sds.length} SDs\n`);
    }

    // Migrate Product Requirements Documents
    console.log('📋 Migrating Product Requirements Documents...');
    const { data: prds, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, status');

    if (!prdError && prds) {
      for (const prd of prds) {
        const normalized = validator.normalizeStatus('PRD', prd.status);
        if (normalized !== prd.status) {
          const { error } = await supabase
            .from('product_requirements_v2')
            .update({ status: normalized })
            .eq('id', prd.id);

          if (!error) {
            console.log(`  ✅ PRD ${prd.id}: "${prd.status}" → "${normalized}"`);
            totalUpdated++;
          } else {
            console.log(`  ❌ Failed to update PRD ${prd.id}: ${error.message}`);
          }
        }
      }
      console.log(`  Checked ${prds.length} PRDs\n`);
    }

    // Migrate Execution Sequences
    console.log('📋 Migrating Execution Sequences...');
    const { data: eess, error: eesError } = await supabase
      .from('execution_sequences_v2')
      .select('id, status');

    if (!eesError && eess) {
      for (const ees of eess) {
        const normalized = validator.normalizeStatus('EES', ees.status);
        if (normalized !== ees.status) {
          const { error } = await supabase
            .from('execution_sequences_v2')
            .update({ status: normalized })
            .eq('id', ees.id);

          if (!error) {
            console.log(`  ✅ EES ${ees.id}: "${ees.status}" → "${normalized}"`);
            totalUpdated++;
          } else {
            console.log(`  ❌ Failed to update EES ${ees.id}: ${error.message}`);
          }
        }
      }
      console.log(`  Checked ${eess.length} EES\n`);
    }

    // Generate status report
    console.log('📊 Migration Summary:');
    console.log(`  Total records updated: ${totalUpdated}`);
    
    if (totalUpdated === 0) {
      console.log('  ✨ All records already using preferred status values!');
    } else {
      console.log('  ✅ Migration completed successfully!');
    }

    // Show current status distribution
    console.log('\n📈 Current Status Distribution:');
    
    // SD status distribution
    const { data: sdStats } = await supabase
      .rpc('get_status_distribution', { table_name: 'strategic_directives_v2' });
    
    if (sdStats) {
      console.log('\n  Strategic Directives:');
      sdStats.forEach(stat => {
        const isPreferred = validator.isPreferredStatus('SD', stat.status);
        console.log(`    ${stat.status}: ${stat.count} ${isPreferred ? '✅' : '⚠️'}`);
      });
    }

    // PRD status distribution
    const { data: prdStats } = await supabase
      .rpc('get_status_distribution', { table_name: 'product_requirements_v2' });
    
    if (prdStats) {
      console.log('\n  Product Requirements:');
      prdStats.forEach(stat => {
        const isPreferred = validator.isPreferredStatus('PRD', stat.status);
        console.log(`    ${stat.status}: ${stat.count} ${isPreferred ? '✅' : '⚠️'}`);
      });
    }

    // EES status distribution
    const { data: eesStats } = await supabase
      .rpc('get_status_distribution', { table_name: 'execution_sequences_v2' });
    
    if (eesStats) {
      console.log('\n  Execution Sequences:');
      eesStats.forEach(stat => {
        const isPreferred = validator.isPreferredStatus('EES', stat.status);
        console.log(`    ${stat.status}: ${stat.count} ${isPreferred ? '✅' : '⚠️'}`);
      });
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

// Add dry-run mode
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
  
  // Just report what would be changed
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const validator = new StatusValidator();
  
  Promise.all([
    supabase.from('strategic_directives_v2').select('id, status'),
    supabase.from('product_requirements_v2').select('id, status'),
    supabase.from('execution_sequences_v2').select('id, status')
  ]).then(([sds, prds, eess]) => {
    let changes = [];
    
    sds.data?.forEach(sd => {
      const normalized = validator.normalizeStatus('SD', sd.status);
      if (normalized !== sd.status) {
        changes.push(`SD ${sd.id}: "${sd.status}" → "${normalized}"`);
      }
    });
    
    prds.data?.forEach(prd => {
      const normalized = validator.normalizeStatus('PRD', prd.status);
      if (normalized !== prd.status) {
        changes.push(`PRD ${prd.id}: "${prd.status}" → "${normalized}"`);
      }
    });
    
    eess.data?.forEach(ees => {
      const normalized = validator.normalizeStatus('EES', ees.status);
      if (normalized !== ees.status) {
        changes.push(`EES ${ees.id}: "${ees.status}" → "${normalized}"`);
      }
    });
    
    if (changes.length === 0) {
      console.log('✨ No changes needed - all statuses already preferred!');
    } else {
      console.log(`📋 Would update ${changes.length} records:\n`);
      changes.forEach(change => console.log(`  ${change}`));
      console.log('\nRun without --dry-run to apply changes.');
    }
  });
} else {
  migrateStatuses();
}