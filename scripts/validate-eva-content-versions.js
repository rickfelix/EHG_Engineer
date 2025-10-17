#!/usr/bin/env node

/**
 * Validate EVA Content Versions
 * Validates version history integrity: sequential versions, no gaps, rollback accuracy
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function validateVersions(catalogueId = null) {
  console.log('🔍 Validating EVA Content Version History');
  console.log('==========================================\n');

  try {
    // Get all catalogue items (or specific one)
    let query = supabase
      .from('content_catalogue')
      .select('id, title, current_version');

    if (catalogueId) {
      query = query.eq('id', catalogueId);
    }

    const { data: items, error: itemsError } = await query;

    if (itemsError) throw itemsError;

    if (!items || items.length === 0) {
      console.log('No catalogue items found.');
      return;
    }

    console.log(`📦 Validating ${items.length} catalogue item(s)...\n`);

    let totalIssues = 0;

    for (const item of items) {
      console.log(`📄 ${item.title}`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Current Version: ${item.current_version}`);

      // Get all versions for this item
      const { data: versions, error: versionsError } = await supabase
        .from('content_versions')
        .select('*')
        .eq('catalogue_id', item.id)
        .order('version_number', { ascending: true });

      if (versionsError) throw versionsError;

      console.log(`   Total Versions: ${versions?.length || 0}`);

      if (!versions || versions.length === 0) {
        console.log('   ⚠️  WARNING: No version history found!');
        totalIssues++;
        console.log('');
        continue;
      }

      // VALIDATION 1: Sequential version numbers (no gaps)
      let hasGaps = false;
      for (let i = 0; i < versions.length; i++) {
        const expectedVersion = i + 1;
        if (versions[i].version_number !== expectedVersion) {
          console.log(`   ❌ ERROR: Version gap detected! Expected v${expectedVersion}, found v${versions[i].version_number}`);
          hasGaps = true;
          totalIssues++;
        }
      }

      if (!hasGaps) {
        console.log('   ✅ Sequential versions: No gaps');
      }

      // VALIDATION 2: Current version matches latest version
      const latestVersion = Math.max(...versions.map(v => v.version_number));
      if (item.current_version !== latestVersion) {
        console.log(`   ❌ ERROR: Current version (${item.current_version}) doesn't match latest version (${latestVersion})`);
        totalIssues++;
      } else {
        console.log(`   ✅ Current version matches latest: v${item.current_version}`);
      }

      // VALIDATION 3: Version data snapshots are not null
      const nullSnapshots = versions.filter(v => !v.data_snapshot || Object.keys(v.data_snapshot).length === 0);
      if (nullSnapshots.length > 0) {
        console.log(`   ❌ ERROR: ${nullSnapshots.length} version(s) have null/empty data snapshots`);
        totalIssues++;
      } else {
        console.log(`   ✅ All versions have data snapshots`);
      }

      // VALIDATION 4: Version timestamps are sequential
      let timestampIssues = false;
      for (let i = 1; i < versions.length; i++) {
        const prevTime = new Date(versions[i - 1].created_at);
        const currTime = new Date(versions[i].created_at);
        if (currTime < prevTime) {
          console.log(`   ❌ ERROR: Version timestamp out of order: v${versions[i].version_number} < v${versions[i - 1].version_number}`);
          timestampIssues = true;
          totalIssues++;
        }
      }

      if (!timestampIssues) {
        console.log(`   ✅ Version timestamps are sequential`);
      }

      // VALIDATION 5: Change types are valid
      const validChangeTypes = ['create', 'update', 'rollback', 'merge'];
      const invalidTypes = versions.filter(v => v.change_type && !validChangeTypes.includes(v.change_type));
      if (invalidTypes.length > 0) {
        console.log(`   ❌ ERROR: ${invalidTypes.length} version(s) have invalid change_type`);
        totalIssues++;
      } else {
        console.log(`   ✅ All change types are valid`);
      }

      // VALIDATION 6: First version is type 'create'
      if (versions[0].change_type !== 'create') {
        console.log(`   ⚠️  WARNING: First version is not type 'create' (found: ${versions[0].change_type})`);
      } else {
        console.log(`   ✅ First version is type 'create'`);
      }

      // Display version history
      console.log(`\n   📜 Version History:`);
      for (const v of versions) {
        const timestamp = new Date(v.created_at).toLocaleString();
        console.log(`      v${v.version_number}: ${v.change_type || 'unknown'} - ${v.change_description || 'No description'} (${timestamp})`);
      }

      console.log('');
    }

    console.log('==========================================');
    if (totalIssues === 0) {
      console.log('✅ VALIDATION PASSED: All version histories are valid!');
    } else {
      console.log(`❌ VALIDATION FAILED: Found ${totalIssues} issue(s)`);
      console.log('\n💡 Recommended actions:');
      console.log('   1. Review error messages above');
      console.log('   2. Check version creation logic');
      console.log('   3. Ensure atomic version + catalogue updates');
      console.log('   4. Consider running data migration to fix gaps');
    }

    // Summary statistics
    const { count: totalVersions } = await supabase
      .from('content_versions')
      .select('*', { count: 'exact', head: true });

    const { count: totalItems } = await supabase
      .from('content_catalogue')
      .select('*', { count: 'exact', head: true });

    console.log('\n📊 Overall Statistics:');
    console.log(`   Total catalogue items: ${totalItems || 0}`);
    console.log(`   Total versions: ${totalVersions || 0}`);
    if (totalItems > 0 && totalVersions > 0) {
      const avgVersions = (totalVersions / totalItems).toFixed(1);
      console.log(`   Average versions per item: ${avgVersions}`);
    }

  } catch (error) {
    console.error('❌ Error validating versions:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let catalogueId = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--id') {
    catalogueId = args[i + 1];
    i++;
  }
}

// Export for use in other scripts
export { validateVersions };

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateVersions(catalogueId);
}
