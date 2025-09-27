import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkPriorityValues() {
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, priority, status')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Analyze based on text priority field
    const critical = data.filter(sd => sd.priority === 'critical');
    const high = data.filter(sd => sd.priority === 'high');
    const medium = data.filter(sd => sd.priority === 'medium');
    const low = data.filter(sd => sd.priority === 'low');

    console.log('=== PRIORITY DISTRIBUTION (Text Values) ===');
    console.log('Critical:', critical.length);
    console.log('High:', high.length);
    console.log('Medium:', medium.length);
    console.log('Low:', low.length);

    console.log('');
    console.log('=== CRITICAL AND HIGH PRIORITY SDs ===');
    console.log('Critical SDs:', critical.length);
    critical.forEach(sd => {
      console.log(`  - ${sd.id || 'N/A'}: ${sd.title} [Status: ${sd.status}]`);
    });

    console.log('');
    console.log('High Priority SDs:', high.length);
    high.forEach(sd => {
      console.log(`  - ${sd.id || 'N/A'}: ${sd.title} [Status: ${sd.status}]`);
    });

    // Check completion status for critical and high
    const criticalCompleted = critical.filter(sd => sd.status === 'completed');
    const highCompleted = high.filter(sd => sd.status === 'completed');

    console.log('');
    console.log('=== COMPLETION SUMMARY ===');
    console.log(`Critical SDs Completed: ${criticalCompleted.length}/${critical.length}`);
    console.log(`High SDs Completed: ${highCompleted.length}/${high.length}`);

    const criticalIncomplete = critical.filter(sd => sd.status !== 'completed');
    const highIncomplete = high.filter(sd => sd.status !== 'completed');

    if (criticalIncomplete.length === 0 && highIncomplete.length === 0) {
      console.log('');
      console.log('✅ CONFIRMED: ALL CRITICAL AND HIGH PRIORITY STRATEGIC DIRECTIVES ARE COMPLETED!');
    } else {
      console.log('');
      console.log('⚠️ INCOMPLETE CRITICAL/HIGH SDs:');
      if (criticalIncomplete.length > 0) {
        console.log('Critical Incomplete:', criticalIncomplete.length);
        criticalIncomplete.forEach(sd => {
          console.log(`  - ${sd.id}: ${sd.title} [Status: ${sd.status}]`);
        });
      }
      if (highIncomplete.length > 0) {
        console.log('High Incomplete:', highIncomplete.length);
        highIncomplete.forEach(sd => {
          console.log(`  - ${sd.id}: ${sd.title} [Status: ${sd.status}]`);
        });
      }
    }

    // Also show all completed SDs regardless of priority
    console.log('');
    console.log('=== ALL COMPLETED STRATEGIC DIRECTIVES ===');
    const allCompleted = data.filter(sd => sd.status === 'completed');
    console.log(`Total Completed: ${allCompleted.length}/${data.length}`);
    allCompleted.forEach(sd => {
      console.log(`  - ${sd.identifier || 'N/A'} [Priority: ${sd.priority}]: ${sd.title}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPriorityValues();