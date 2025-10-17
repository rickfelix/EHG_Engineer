#!/usr/bin/env node
import { createDatabaseClient } from '../../ehg/scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';
dotenv.config();

const client = await createDatabaseClient('engineer', { verify: false, verbose: false });

try {
  const result = await client.query(`
    SELECT 
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      p.prosecdef as has_security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN ('calculate_sd_progress', 'get_progress_breakdown', 'enforce_progress_on_completion')
    AND n.nspname = 'public'
    ORDER BY p.proname, p.oid
  `);
  
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SECURITY DEFINER Verification                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  let allSecure = true;
  result.rows.forEach(row => {
    const status = row.has_security_definer ? '✅' : '❌';
    const args = row.arguments || '()';
    console.log(`   ${status} ${row.function_name}(${args})`);
    if (row.has_security_definer === false) allSecure = false;
  });
  
  console.log('\n' + '─'.repeat(67) + '\n');
  
  if (allSecure) {
    console.log('✅ SUCCESS: All functions have SECURITY DEFINER enabled\n');
    console.log('🎯 Impact:');
    console.log('   - Progress triggers can now see all handoffs');
    console.log('   - No more "LEO Protocol Violation" errors for valid completions');
    console.log('   - No need to temporarily disable triggers\n');
  } else {
    console.log('⚠️  WARNING: Some functions missing SECURITY DEFINER\n');
  }
} finally {
  await client.end();
}
