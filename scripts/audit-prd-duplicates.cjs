require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function auditPRDTable() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== QUERY 1: SDs with Multiple PRDs ===\n');

  // Query 1: Find duplicates
  const { data: duplicates, error: dupError } = await supabase
    .from('product_requirements_v2')
    .select('sd_id')
    .not('sd_id', 'is', null);

  if (dupError) {
    console.log('Error:', dupError.message);
  } else {
    // Group by sd_id manually
    const sdMap = new Map();
    duplicates.forEach(row => {
      if (!sdMap.has(row.sd_id)) {
        sdMap.set(row.sd_id, []);
      }
      sdMap.get(row.sd_id).push(row);
    });

    const dupsWithCount = Array.from(sdMap.entries())
      .filter(([_, rows]) => rows.length > 1)
      .map(([sd_id, rows]) => ({ sd_id, prd_count: rows.length }));

    console.log('SDs with duplicate PRDs:', dupsWithCount.length);
    if (dupsWithCount.length > 0) {
      console.log(JSON.stringify(dupsWithCount, null, 2));

      // Get full details for each duplicate
      console.log('\n--- Full Details for Duplicates ---\n');
      for (const dup of dupsWithCount) {
        const { data: details } = await supabase
          .from('product_requirements_v2')
          .select('directive_id, sd_id, status, created_at')
          .eq('sd_id', dup.sd_id)
          .order('created_at', { ascending: true });

        console.log(`\nSD: ${dup.sd_id} (${dup.prd_count} PRDs)`);
        details.forEach((prd, idx) => {
          console.log(`  ${idx + 1}. ${prd.directive_id} | ${prd.status} | ${prd.created_at}`);
        });
      }
    } else {
      console.log('(No duplicates found)');
    }
  }

  console.log('\n=== QUERY 2: Table Constraints ===\n');

  // Query 2: Check constraints (raw SQL via rpc or direct query)
  const { data: constraints, error: conError } = await supabase
    .rpc('exec_raw_sql', {
      sql: `
        SELECT conname, contype, pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint
        WHERE conrelid = 'product_requirements_v2'::regclass
        ORDER BY contype, conname;
      `
    });

  if (conError) {
    console.log('Error querying constraints:', conError.message);
    console.log('(Using information_schema fallback...)');

    // Fallback: Check for unique constraints via information_schema
    const { data: uniqueConstraints } = await supabase
      .rpc('exec_raw_sql', {
        sql: `
          SELECT constraint_name, constraint_type
          FROM information_schema.table_constraints
          WHERE table_name = 'product_requirements_v2'
          ORDER BY constraint_type, constraint_name;
        `
      });

    if (uniqueConstraints) {
      console.log('Constraints via information_schema:', uniqueConstraints.length);
      uniqueConstraints.forEach(row => {
        console.log(`  [${row.constraint_type}] ${row.constraint_name}`);
      });
    }
  } else {
    console.log('Constraints:', constraints?.length || 0);
    constraints?.forEach(row => {
      console.log(`\n[${row.contype}] ${row.conname}`);
      console.log(`  ${row.constraint_def}`);
    });
  }

  console.log('\n=== QUERY 3: PRDs with NULL sd_id ===\n');

  const { data: nulls, error: nullError } = await supabase
    .from('product_requirements_v2')
    .select('directive_id, sd_id, status, created_at')
    .is('sd_id', null)
    .order('created_at', { ascending: false });

  if (nullError) {
    console.log('Error:', nullError.message);
  } else {
    console.log('PRDs with NULL sd_id:', nulls?.length || 0);
    if (nulls && nulls.length > 0) {
      console.log(JSON.stringify(nulls, null, 2));
    } else {
      console.log('(No NULL sd_id PRDs found)');
    }
  }

  console.log('\n=== BONUS: Total PRD Count ===\n');

  const { count, error: countError } = await supabase
    .from('product_requirements_v2')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.log('Error:', countError.message);
  } else {
    console.log('Total PRDs in table:', count);
  }
}

auditPRDTable().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
