import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function migrateToSequenceRank() {
  console.log('=== MIGRATING TO SEQUENCE_RANK ===\n');

  // Step 1: Ensure all execution_order values are copied to sequence_rank
  console.log('Step 1: Syncing execution_order values to sequence_rank...');

  // Get all SDs with execution_order
  const { data: sdsWithExecOrder, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, execution_order, sequence_rank')
    .not('execution_order', 'is', null);

  if (fetchError) {
    console.error('Error fetching data:', fetchError);
    return;
  }

  // Update sequence_rank where needed
  let updateCount = 0;
  for (const sd of sdsWithExecOrder) {
    if (sd.sequence_rank !== sd.execution_order) {
      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({ sequence_rank: sd.execution_order })
        .eq('id', sd.id);

      if (updateError) {
        console.error(`Failed to update ${sd.id}:`, updateError);
      } else {
        updateCount++;
        console.log(`  Updated ${sd.id}: sequence_rank = ${sd.execution_order}`);
      }
    }
  }

  console.log(`✅ Synced ${updateCount} records\n`);

  // Step 2: Update all JS files to use sequence_rank
  console.log('Step 2: Updating JavaScript files...');

  const filesToUpdate = [
    'scripts/sequence-high-priority-sds.js',
    'scripts/update-sd-content.js',
    'scripts/create-tables-direct.js',
    'scripts/add-sd-to-database.js',
    'scripts/update-directive-status.js',
    'scripts/check-directives-data.js'
  ];

  for (const file of filesToUpdate) {
    const filePath = path.join(__dirname, '..', file);

    try {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;

        // Replace execution_order with sequence_rank
        content = content.replace(/execution_order/g, 'sequence_rank');

        if (content !== originalContent) {
          fs.writeFileSync(filePath, content);
          console.log(`  ✅ Updated ${file}`);
        } else {
          console.log(`  ⏭️  No changes needed in ${file}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Error updating ${file}:`, err.message);
    }
  }

  // Step 3: Verify the migration
  console.log('\nStep 3: Verification...');

  const { data: verifyData, error: verifyError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sequence_rank')
    .not('sequence_rank', 'is', null)
    .order('sequence_rank')
    .limit(10);

  if (verifyError) {
    console.error('Verification error:', verifyError);
  } else {
    console.log(`Found ${verifyData.length} SDs with sequence_rank values`);
    console.log('Sample:');
    verifyData.slice(0, 5).forEach(sd => {
      console.log(`  ${sd.id}: sequence_rank = ${sd.sequence_rank}`);
    });
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('Next steps:');
  console.log('1. Run the SQL migration to drop execution_order column');
  console.log('2. Update any dashboard components that reference execution_order');
  console.log('3. Test that sorting still works correctly');
}

migrateToSequenceRank().catch(console.error);