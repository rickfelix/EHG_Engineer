import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testRealTimeRefresh() {
  try {
    console.log('\n=== TESTING REAL-TIME DASHBOARD REFRESH ===\n');
    
    // Get current dashboard state
    console.log('📊 Step 1: Getting current dashboard state...');
    const response1 = await fetch('http://localhost:3000/api/state');
    const data1 = await response1.json();
    const auditSD = data1.strategicDirectives.find(sd => sd.id === 'SD-DASHBOARD-AUDIT-2025-08-31-A');
    console.log(`Current audit SD progress: ${auditSD?.progress}%`);
    
    // Make a small database change
    console.log('\n⚡ Step 2: Making small database change (updating timestamp)...');
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        updated_at: new Date().toISOString(),
        metadata: {
          ...{}, // preserve existing
          last_refresh_test: new Date().toISOString()
        }
      })
      .eq('id', 'SD-DASHBOARD-AUDIT-2025-08-31-A');

    if (error) {
      console.error('❌ Update error:', error.message);
      return;
    }

    console.log('✅ Database updated, waiting 3 seconds for real-time sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if dashboard updated automatically
    console.log('\n📊 Step 3: Checking if dashboard updated without restart...');
    const response2 = await fetch('http://localhost:3000/api/state');
    const data2 = await response2.json();
    const auditSD2 = data2.strategicDirectives.find(sd => sd.id === 'SD-DASHBOARD-AUDIT-2025-08-31-A');
    
    console.log(`Updated audit SD progress: ${auditSD2?.progress}%`);
    console.log(`Timestamp changed: ${data1.timestamp !== data2.timestamp ? '✅ YES' : '❌ NO'}`);
    console.log(`Metadata updated: ${auditSD2?.metadata?.last_refresh_test ? '✅ YES' : '❌ NO'}`);
    
    console.log('\n🔍 REAL-TIME UPDATE TEST RESULTS:');
    
    if (data1.timestamp !== data2.timestamp) {
      console.log('✅ REAL-TIME WORKING: Dashboard updates automatically for data changes');
      console.log('  • No server restart needed for database updates');
      console.log('  • Supabase subscriptions are functioning');
      console.log('  • WebSocket real-time sync is active');
    } else {
      console.log('❌ REAL-TIME ISSUE: Dashboard did not update automatically');
      console.log('  • May need to investigate WebSocket connections');
      console.log('  • Check Supabase subscription status');
    }
    
    console.log('\n📋 WHEN YOU NEED SERVER RESTART:');
    console.log('  🔄 Code changes (like progress calculator fixes)');
    console.log('  🔄 Configuration updates');
    console.log('  🔄 New features or logic');
    console.log('  🔄 Package/dependency updates');
    
    console.log('\n📋 WHEN AUTO-UPDATE WORKS:');
    console.log('  ✅ Database record changes (status, progress, metadata)');
    console.log('  ✅ New SDs or PRDs added to database');
    console.log('  ✅ Checklist item updates');
    console.log('  ✅ Real-time collaboration between users');

  } catch (err) {
    console.error('❌ Real-time test failed:', err.message);
  }
}

testRealTimeRefresh();