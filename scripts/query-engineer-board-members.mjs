#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// EHG_Engineer database
const engineerClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('🔍 Querying EHG_Engineer database for board members...\n');

  const { data, error } = await engineerClient
    .from('board_members')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Found ${data.length} board members:\n`);
  data.forEach((member, i) => {
    console.log(`${i + 1}. ${member.name} (${member.title})`);
    console.log(`   ID: ${member.id}`);
    console.log(`   Role: ${member.role_name}`);
    console.log(`   Expertise: ${member.primary_expertise}`);
    console.log(`   Status: ${member.status}\n`);
  });

  console.log('📋 Full data for migration:');
  console.log(JSON.stringify(data, null, 2));
}

main();
