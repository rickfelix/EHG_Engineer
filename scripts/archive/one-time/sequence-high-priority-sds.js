import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function sequenceHighPrioritySDs() {
  console.log('=== LOGICAL SEQUENCING OF HIGH-PRIORITY SDs ===\n');

  // Define logical execution sequence based on dependencies
  // Foundation → Analytics → Intelligence → Automation → Validation → Scaling
  const logicalSequence = [
    // FOUNDATION LAYER (Build core infrastructure first)
    { id: 'SD-008', order: 1, rationale: 'Integrations: Core foundation - MCPs, APIs, external tools needed by all other systems' },
    { id: 'SD-023', order: 2, rationale: 'Agents: Core AI agents framework that powers automation across the platform' },

    // INTELLIGENCE LAYER (Gather data and insights)
    { id: 'SD-022', order: 3, rationale: 'Competitive Intelligence: Understand market before building features' },
    { id: 'SD-004', order: 4, rationale: 'Analytics: Measurement foundation for tracking all venture metrics' },
    { id: 'SD-019', order: 5, rationale: 'Profitability Forecasting: Financial modeling based on competitive/analytics data' },

    // EXECUTION LAYER (Build and launch)
    { id: 'SD-011', order: 6, rationale: 'GTM Strategist: Go-to-market planning using intelligence gathered' },
    { id: 'SD-010', order: 7, rationale: 'AI CEO Agent: Orchestrates execution using all prior components' },
    { id: 'SD-024', order: 8, rationale: 'Creative Media Automation: Content generation for GTM execution' },

    // VALIDATION & OPTIMIZATION LAYER (Test and improve)
    { id: 'SD-015', order: 9, rationale: 'Quality Assurance: Validate all implementations before scaling' },
    { id: 'SD-014', order: 10, rationale: 'Feedback Loops: Continuous improvement based on QA and user data' }
  ];

  console.log('SEQUENCING LOGIC:');
  console.log('1. Foundation Layer: Build core infrastructure (Integrations, Agents)');
  console.log('2. Intelligence Layer: Gather market/financial insights');
  console.log('3. Execution Layer: Launch ventures with GTM and automation');
  console.log('4. Validation Layer: QA and feedback for continuous improvement\n');

  console.log('=== UPDATING EXECUTION ORDER ===\n');

  let successCount = 0;

  for (const item of logicalSequence) {
    try {
      // First get current data
      const { data: currentData } = await supabase
        .from('strategic_directives_v2')
        .select('sequence_rank, metadata')
        .eq('id', item.id)
        .single();

      // Update with new execution order
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update({
          sequence_rank: item.order,
          metadata: {
            ...(currentData?.metadata || {}),
            sequence_rationale: item.rationale,
            sequence_updated_at: new Date().toISOString(),
            sequence_updated_by: 'Logical Dependency Analysis'
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to update ${item.id}:`, error.message);
      } else {
        console.log(`${item.order.toString().padStart(2, ' ')}. ${item.id}: ${data.title}`);
        console.log(`    → ${item.rationale}`);
        console.log(`    Previous order: ${currentData?.sequence_rank || 'none'} → New order: ${item.order}\n`);
        successCount++;
      }
    } catch (err) {
      console.error(`❌ Error updating ${item.id}:`, err.message);
    }
  }

  console.log('=== SUMMARY ===');
  console.log(`Successfully sequenced: ${successCount}/${logicalSequence.length} SDs\n`);

  // Verify the final sequence
  console.log('=== FINAL EXECUTION SEQUENCE ===\n');
  const { data: verifyData, error: verifyError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sequence_rank, status')
    .in('id', logicalSequence.map(s => s.id))
    .order('sequence_rank');

  if (verifyError) {
    console.error('Verification error:', verifyError);
  } else {
    verifyData.forEach(sd => {
      const seq = logicalSequence.find(s => s.id === sd.id);
      console.log(`${(sd.sequence_rank || '?').toString().padStart(2, ' ')}. [${sd.id}] ${sd.title}`);
      if (seq) {
        console.log(`    Rationale: ${seq.rationale}`);
      }
    });
  }
}

sequenceHighPrioritySDs().catch(console.error);