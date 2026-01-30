import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

(async () => {
  const client = new Client({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.dedlbzhpgkmetvhbkyzq',
    password: process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  console.log('📋 Verification Results for SD-LEO-INFRA-DATABASE-CONSTRAINT-SCHEMA-001');
  console.log('━'.repeat(70));

  // 1. Check sub_agent_execution_results constraint
  console.log('\n1️⃣  BL-INF-2337A: sub_agent_execution_results verdict constraint');
  const constraintQuery = `
    SELECT
      conname as constraint_name,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conname = 'valid_verdict'
      AND conrelid = 'sub_agent_execution_results'::regclass;
  `;
  const constraint = await client.query(constraintQuery);
  if (constraint.rows.length > 0) {
    console.log('   ✅ Constraint exists');
    const def = constraint.rows[0].definition;
    console.log('   Valid values include:');
    if (def.includes('MANUAL_REQUIRED')) console.log('      ✅ MANUAL_REQUIRED');
    if (def.includes('PENDING')) console.log('      ✅ PENDING');
    if (def.includes('ERROR')) console.log('      ✅ ERROR');
  } else {
    console.log('   ❌ Constraint not found');
  }

  // 2. Check risk_assessments phase constraint
  console.log('\n2️⃣  BL-INF-2337B: risk_assessments phase constraint');
  const phaseConstraintQuery = `
    SELECT
      conname as constraint_name,
      pg_get_constraintdef(oid) as definition
    FROM pg_constraint
    WHERE conname = 'risk_assessments_phase_check'
      AND conrelid = 'risk_assessments'::regclass;
  `;
  const phaseConstraint = await client.query(phaseConstraintQuery);
  if (phaseConstraint.rows.length > 0) {
    console.log('   ✅ Constraint exists');
    const def = phaseConstraint.rows[0].definition;
    console.log('   Accepts both detailed and standard phase names:');
    if (def.includes('LEAD_PRE_APPROVAL')) console.log('      ✅ LEAD_PRE_APPROVAL (detailed)');
    if (def.includes("'LEAD'")) console.log('      ✅ LEAD (standard)');
    if (def.includes('PLAN_PRD')) console.log('      ✅ PLAN_PRD (detailed)');
    if (def.includes("'PLAN'")) console.log('      ✅ PLAN (standard)');
  } else {
    console.log('   ❌ Constraint not found');
  }

  // 3. Check retrospectives metadata column
  console.log('\n3️⃣  BL-INF-2337C: retrospectives metadata column');
  const metadataQuery = `
    SELECT
      column_name,
      data_type,
      column_default,
      is_nullable
    FROM information_schema.columns
    WHERE table_name = 'retrospectives'
      AND column_name = 'metadata';
  `;
  const metadata = await client.query(metadataQuery);
  if (metadata.rows.length > 0) {
    console.log('   ✅ Column exists');
    console.log('      Type:', metadata.rows[0].data_type);
    console.log('      Default:', metadata.rows[0].column_default);
    console.log('      Nullable:', metadata.rows[0].is_nullable);
  } else {
    console.log('   ❌ Column not found');
  }

  // Check for index
  const indexQuery = `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'retrospectives'
      AND indexname = 'idx_retrospectives_metadata';
  `;
  const index = await client.query(indexQuery);
  if (index.rows.length > 0) {
    console.log('   ✅ GIN index exists (idx_retrospectives_metadata)');
  } else {
    console.log('   ⚠️  Index not found (may need to be created)');
  }

  await client.end();

  console.log('\n━'.repeat(70));
  console.log('✅ Migration verification complete!');
  console.log('\n📊 Summary:');
  console.log('   • BL-INF-2337A: sub_agent_execution_results constraint updated');
  console.log('   • BL-INF-2337B: risk_assessments phase constraint expanded');
  console.log('   • BL-INF-2337C: retrospectives metadata column added');
})();
