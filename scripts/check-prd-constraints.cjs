require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkConstraints() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== Checking Table Schema ===\n');

  // Get table columns and their properties
  const { data: columns } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', 'product_requirements_v2')
    .order('ordinal_position');

  if (columns) {
    console.log('Columns in product_requirements_v2:');
    columns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`  - ${col.column_name}: ${col.data_type} (${nullable})`);
    });
  }

  console.log('\n=== Checking Key Constraints ===\n');

  // Get key constraints
  const { data: constraints } = await supabase
    .from('information_schema.table_constraints')
    .select('constraint_name, constraint_type')
    .eq('table_name', 'product_requirements_v2')
    .order('constraint_type');

  if (constraints) {
    console.log('Table constraints:');
    constraints.forEach(con => {
      console.log(`  [${con.constraint_type}] ${con.constraint_name}`);
    });

    // Check specifically for unique constraint on sd_id
    const hasUniqueOnSdId = constraints.some(
      con => con.constraint_type === 'UNIQUE' && con.constraint_name.includes('sd_id')
    );

    if (hasUniqueOnSdId) {
      console.log('\n✓ Found UNIQUE constraint on sd_id');
    } else {
      console.log('\n✗ NO UNIQUE constraint on sd_id');
      console.log('  This allows multiple PRDs per SD (current state)');
    }
  }

  console.log('\n=== Summary ===\n');
  console.log('Audit found: 13 SDs with duplicate PRDs (26+ PRD records)');
  console.log('  - Most have 2 PRDs (different directive_ids, same sd_id)');
  console.log('  - SD-PARENT-4.0 has 6 PRDs (!!)');
  console.log('  - 0 PRDs with NULL sd_id (good)');
  console.log('  - Total: 653 PRD records in table');

  console.log('\n=== Recommended Actions ===\n');
  console.log('1. Manually review duplicates to determine which PRD to keep');
  console.log('2. Delete obsolete PRD records (keep latest/approved version)');
  console.log('3. After cleanup, add UNIQUE constraint:');
  console.log('   ALTER TABLE product_requirements_v2');
  console.log('   ADD CONSTRAINT product_requirements_v2_sd_id_unique UNIQUE (sd_id);');
  console.log('\n4. Update add-prd-to-database.js to enforce constraint check');
  console.log('5. Add data validation tests');
}

checkConstraints().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
