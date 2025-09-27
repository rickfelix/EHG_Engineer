import { fileURLToPath } from 'url';
import { dirname } from 'path';




import { createClient } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config(); });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateDraftSDTitles() {
  try {
    console.log('\n=== UPDATING DRAFT SD TITLES ===\n');
    
    // Update SD-DASHBOARD-UI-2025-08-31-A
    console.log('Updating SD-DASHBOARD-UI-2025-08-31-A...');
    const { error: error1 } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        title: 'Dashboard UI/UX Improvements',
        description: 'Future improvements for dashboard user interface and experience',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-DASHBOARD-UI-2025-08-31-A');
    
    if (error1) {
      console.error('  ❌ Error:', error1.message);
    } else {
      console.log('  ✅ Title updated to: Dashboard UI/UX Improvements');
    }
    
    // Update SD-003-dashboard
    console.log('\nUpdating SD-003-dashboard...');
    const { error: error2 } = await supabase
      .from('strategic_directives_v2')
      .update({ 
        title: 'Dashboard Feature Enhancements',
        description: 'Placeholder for future dashboard feature development',
        updated_at: new Date().toISOString()
      })
      .eq('id', 'SD-003-dashboard');
    
    if (error2) {
      console.error('  ❌ Error:', error2.message);
    } else {
      console.log('  ✅ Title updated to: Dashboard Feature Enhancements');
    }
    
    // Verify the updates
    console.log('\n=== VERIFICATION ===\n');
    const { data: allSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .order('created_at', { ascending: false });
    
    if (allSDs) {
      console.log('Current Strategic Directives:');
      allSDs.forEach(sd => {
        const icon = sd.status === 'active' ? '⚡' : '📝';
        console.log(`${icon} ${sd.id}`);
        console.log(`   Title: ${sd.title}`);
        console.log('');
      });
    }
    
    console.log('✅ Draft SD titles updated successfully');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

updateDraftSDTitles();