require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('Running implementation_context migration...\n');

  // Step 1: Check if column already exists
  console.log('Step 1: Checking if column exists...');
  const { data: existingColumn } = await supabase
    .from('strategic_directives_v2')
    .select('implementation_context')
    .limit(1);

  if (existingColumn && !existingColumn.error) {
    console.log('  Column implementation_context already exists');
  } else {
    console.log('  Column does not exist - will need manual SQL execution');
    console.log('\n⚠️  MANUAL STEP REQUIRED:');
    console.log('  Execute this SQL in Supabase Dashboard > SQL Editor:');
    console.log('\n  ALTER TABLE strategic_directives_v2');
    console.log('  ADD COLUMN IF NOT EXISTS implementation_context TEXT DEFAULT \'web\';');
    console.log('\n  Then re-run this script.');
    process.exit(1);
  }

  // Step 2: Update infrastructure SDs
  console.log('\nStep 2: Updating infrastructure SDs...');
  const { data: infraUpdated, error: infraError } = await supabase
    .from('strategic_directives_v2')
    .update({ implementation_context: 'infrastructure' })
    .eq('sd_type', 'infrastructure')
    .or('implementation_context.is.null,implementation_context.eq.web')
    .select('id, sd_key, sd_type');

  if (infraError) {
    console.error('  Error:', infraError.message);
  } else {
    console.log(`  Updated ${infraUpdated?.length || 0} infrastructure SDs`);
  }

  // Step 3: Update database SDs
  console.log('\nStep 3: Updating database SDs...');
  const { data: dbUpdated, error: dbError } = await supabase
    .from('strategic_directives_v2')
    .update({ implementation_context: 'database' })
    .eq('sd_type', 'database')
    .or('implementation_context.is.null,implementation_context.eq.web')
    .select('id, sd_key, sd_type');

  if (dbError) {
    console.error('  Error:', dbError.message);
  } else {
    console.log(`  Updated ${dbUpdated?.length || 0} database SDs`);
  }

  // Step 4: Verify
  console.log('\nStep 4: Verification...');
  const { data: counts } = await supabase
    .from('strategic_directives_v2')
    .select('sd_type, implementation_context')
    .in('sd_type', ['infrastructure', 'database', 'feature', 'bugfix']);

  const summary = {};
  if (counts) {
    counts.forEach(row => {
      const key = `${row.sd_type}:${row.implementation_context}`;
      summary[key] = (summary[key] || 0) + 1;
    });
  }
  console.log('  Context distribution:');
  Object.entries(summary).sort().forEach(([key, count]) => {
    console.log(`    ${key}: ${count}`);
  });

  console.log('\n✅ Migration complete!');
}

runMigration().catch(console.error);
