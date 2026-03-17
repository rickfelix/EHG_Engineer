import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDPriorities() {
  // List of SDs to update to high priority
  const sdsToUpdate = [
    'SD-004', // Analytics: Consolidated
    'SD-010', // Stage 16 - AI CEO Agent: Consolidated
    'SD-022', // Stage 4 - Competitive Intelligence: Consolidated
    'SD-011', // Stage 17 - GTM Strategist: Consolidated
    'SD-019', // Stage 5 - Profitability Forecasting: Consolidated
    'SD-024', // Stage 34 - Creative Media Automation: Consolidated
    'SD-008', // Integrations: Consolidated
    'SD-015', // Stage 25 - Quality Assurance: Consolidated
    'SD-023', // Agents: Consolidated
    'SD-014'  // Stage 23 - Feedback Loops: Consolidated
  ];

  console.log('=== UPDATING STRATEGIC DIRECTIVES TO HIGH PRIORITY ===');
  console.log(`Total SDs to update: ${sdsToUpdate.length}`);
  console.log('');

  let successCount = 0;
  let failCount = 0;

  for (const sdId of sdsToUpdate) {
    try {
      // Update the priority to high
      const { data: _data, error } = await supabase
        .from('strategic_directives_v2')
        .update({
          priority: 'high',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId)
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to update ${sdId}:`, error.message);
        failCount++;
      } else {
        console.log(`✅ Updated ${sdId}: ${data.title}`);
        console.log(`   Previous: medium → New: ${data.priority}`);
        successCount++;
      }
    } catch (_err) {
      console.error(`❌ Error updating ${sdId}:`, err.message);
      failCount++;
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Successfully updated: ${successCount}/${sdsToUpdate.length}`);
  if (failCount > 0) {
    console.log(`Failed updates: ${failCount}`);
  }

  // Verify the updates
  console.log('');
  console.log('=== VERIFICATION ===');
  const { data: verifyData, error: verifyError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status')
    .in('id', sdsToUpdate)
    .order('id');

  if (verifyError) {
    console.error('Verification error:', verifyError);
  } else {
    console.log('Current status of updated SDs:');
    verifyData.forEach(sd => {
      console.log(`- ${sd.id}: [${sd.priority.toUpperCase()}] ${sd.title} (${sd.status})`);
    });
  }
}

updateSDPriorities().catch(console.error);