#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// EHG_Engineer database (source)
const engineerClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// EHG App database (destination)
const ehgClient = createClient(
  process.env.EHG_SUPABASE_URL,
  process.env.EHG_SUPABASE_ANON_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔄 Board Members Migration: EHG_Engineer → EHG App');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Step 1: Query source database
  console.log('Step 1: Querying EHG_Engineer database...');
  const { data: sourceMembers, error: sourceError } = await engineerClient
    .from('board_members')
    .select('*')
    .order('created_at', { ascending: true });

  if (sourceError) {
    console.error('❌ Error querying source:', sourceError.message);
    process.exit(1);
  }

  console.log(`✅ Found ${sourceMembers.length} board members in source database\n`);

  // Step 2: Check destination database
  console.log('Step 2: Checking EHG App database...');
  const { data: destMembers, error: destError } = await ehgClient
    .from('board_members')
    .select('id');

  if (destError) {
    console.error('❌ Error querying destination:', destError.message);
    process.exit(1);
  }

  console.log(`📊 Current count in EHG App: ${destMembers?.length || 0} board members\n`);

  if (destMembers && destMembers.length > 0) {
    console.log('⚠️  WARNING: Destination database already has board members!');
    console.log('   Proceeding with upsert (will update existing records)...\n');
  }

  // Step 3: Copy members to destination
  console.log('Step 3: Copying board members to EHG App database...');

  // Map fields from EHG_Engineer schema to EHG App schema
  const membersToInsert = sourceMembers.map(member => ({
    id: member.id,
    agent_id: member.agent_id,
    position: member.board_role,  // board_role → position
    voting_weight: member.voting_weight,
    expertise_domains: member.expertise_domains,
    appointed_at: member.appointment_date,  // appointment_date → appointed_at
    status: member.status,
    // Note: EHG App schema doesn't have 'metadata' column
    // Member names are in member.metadata.name, but can't store them
    created_at: member.created_at,
    updated_at: member.updated_at
  }));

  console.log('📦 Members to migrate:');
  membersToInsert.forEach((member, i) => {
    // Get name from source data before transformation
    const name = sourceMembers[i].metadata?.name || 'Unknown';
    console.log(`   ${i + 1}. ${name} - ${member.position}`);
  });
  console.log('');

  const { data: insertedMembers, error: insertError } = await ehgClient
    .from('board_members')
    .upsert(membersToInsert, { onConflict: 'id' })
    .select();

  if (insertError) {
    console.error('❌ Error inserting members:', insertError.message);
    console.error('   Details:', insertError);
    process.exit(1);
  }

  console.log(`✅ Successfully migrated ${insertedMembers.length} board members!\n`);

  // Step 4: Verify migration
  console.log('Step 4: Verifying migration...');
  const { data: verifyMembers, error: verifyError } = await ehgClient
    .from('board_members')
    .select('id, position, status, expertise_domains')
    .order('created_at', { ascending: true });

  if (verifyError) {
    console.error('❌ Error verifying:', verifyError.message);
    process.exit(1);
  }

  console.log(`✅ Verification complete: ${verifyMembers.length} members in EHG App database\n`);

  verifyMembers.forEach((member, i) => {
    console.log(`   ${i + 1}. ${member.position} (${member.status})`);
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ Migration Complete!');
  console.log('════════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
