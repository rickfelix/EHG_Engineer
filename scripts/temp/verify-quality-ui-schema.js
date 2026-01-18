import { createDatabaseClient } from '../lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('\n📊 SCHEMA VERIFICATION FOR SD-QUALITY-UI-001\n');
  console.log('Verifying tables from dependency SD-QUALITY-DB-001...\n');

  // Check feedback table
  console.log('1️⃣  Checking feedback table...');
  const feedbackSchema = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feedback'
    ORDER BY ordinal_position
  `);

  if (feedbackSchema.rows.length > 0) {
    console.log('   ✅ feedback table EXISTS');
    console.log('   📋 Columns:');
    feedbackSchema.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
  } else {
    console.log('   ❌ feedback table NOT FOUND');
  }

  // Check releases table
  console.log('\n2️⃣  Checking releases table...');
  const releasesSchema = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'releases'
    ORDER BY ordinal_position
  `);

  if (releasesSchema.rows.length > 0) {
    console.log('   ✅ releases table EXISTS');
    console.log('   📋 Columns:');
    releasesSchema.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
  } else {
    console.log('   ❌ releases table NOT FOUND');
  }

  // Check feedback_sd_map junction table
  console.log('\n3️⃣  Checking feedback_sd_map junction table...');
  const junctionSchema = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feedback_sd_map'
    ORDER BY ordinal_position
  `);

  if (junctionSchema.rows.length > 0) {
    console.log('   ✅ feedback_sd_map table EXISTS');
    console.log('   📋 Columns:');
    junctionSchema.rows.forEach(col => {
      console.log(`      - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
  } else {
    console.log('   ❌ feedback_sd_map table NOT FOUND');
  }

  // Check RLS policies
  console.log('\n4️⃣  Checking RLS policies...');
  const rlsPolicies = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('feedback', 'releases', 'feedback_sd_map')
    ORDER BY tablename, policyname
  `);

  if (rlsPolicies.rows.length > 0) {
    console.log(`   ✅ Found ${rlsPolicies.rows.length} RLS policies`);
    rlsPolicies.rows.forEach(policy => {
      const roles = Array.isArray(policy.roles) ? policy.roles.join(', ') : 'N/A';
      console.log(`      - ${policy.tablename}.${policy.policyname} (cmd: ${policy.cmd}, roles: ${roles})`);
    });
  } else {
    console.log('   ⚠️  No RLS policies found (tables may not have RLS enabled)');
  }

  // Check foreign key relationships
  console.log('\n5️⃣  Checking foreign key relationships...');
  const foreignKeys = await client.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('feedback', 'releases', 'feedback_sd_map')
  `);

  if (foreignKeys.rows.length > 0) {
    console.log(`   ✅ Found ${foreignKeys.rows.length} foreign key relationships`);
    foreignKeys.rows.forEach(fk => {
      console.log(`      - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
  } else {
    console.log('   ⚠️  No foreign key relationships found');
  }

  console.log('\n📊 SCHEMA VERIFICATION COMPLETE\n');

  await client.end();
})();
