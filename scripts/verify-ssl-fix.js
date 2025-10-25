#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function verifyFix() {
  console.log('✅ SSL Fix Verification\n');
  console.log('═'.repeat(60));
  
  // Test both database connections
  const tests = [
    {
      name: 'EHG_Engineer Database',
      url: process.env.SUPABASE_POOLER_URL,
      projectId: 'dedlbzhpgkmetvhbkyzq'
    },
    {
      name: 'EHG Customer Database',
      url: process.env.EHG_POOLER_URL,
      projectId: 'liapbndqlqxdcgpwntbv'
    }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    console.log(`\n📊 Testing: ${test.name}`);
    console.log(`   Project: ${test.projectId}`);
    console.log(`   URL contains ?sslmode: ${test.url.includes('?sslmode')}`);
    
    const client = new Client({
      connectionString: test.url,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      const result = await client.query('SELECT current_database(), current_user, version()');
      
      console.log('   ✅ Connection: SUCCESS');
      console.log(`   ✅ Database: ${result.rows[0].current_database}`);
      console.log(`   ✅ User: ${result.rows[0].current_user}`);
      
      await client.end();
    } catch (error) {
      console.log('   ❌ Connection: FAILED');
      console.log(`   ❌ Error: ${error.message}`);
      allPassed = false;
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  if (allPassed) {
    console.log('✅ VERIFICATION PASSED');
    console.log('   All database connections working correctly!');
    console.log('   Sub-agent orchestration should now function properly.');
  } else {
    console.log('❌ VERIFICATION FAILED');
    console.log('   Some connections still failing. Check configuration.');
  }
  console.log('═'.repeat(60) + '\n');
}

verifyFix();
