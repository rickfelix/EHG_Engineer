/**
 * Update SD-STAGE4-AI-FIRST-UX-001 with missing fields for LEAD→PLAN handoff validation
 *
 * Purpose: Add strategic_objectives, success_metrics, and key_principles
 * Context: Handoff rejected with 45% completeness score
 *
 * Created: 2025-11-08
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function updateSDFields() {
  console.log('\n📊 Updating SD-STAGE4-AI-FIRST-UX-001 with missing fields...\n');

  const supabase = await createSupabaseServiceClient('engineer', { verbose: true });

  try {
    // Define the update data
    const updateData = {
      strategic_objectives: [
        {
          objective: "Transform Stage 4 from manual-first to AI-first workflow",
          rationale: "Users explicitly stated they will not manually enter competitor data. AI automation should be the primary path, with manual entry as fallback only.",
          success_indicator: "90%+ of users proceed through Stage 4 via AI auto-start path (vs manual entry)"
        },
        {
          objective: "Showcase AI capabilities prominently to enhance perceived product value",
          rationale: "Visible AI agent progress tracking demonstrates EHG's automation capabilities and justifies platform value proposition.",
          success_indicator: "User engagement time on Stage 4 increases by 30% due to progress visibility"
        },
        {
          objective: "Reduce user friction and time-to-completion for competitive intelligence stage",
          rationale: "Automated research completes faster than manual entry, reducing abandonment rates during venture creation workflow.",
          success_indicator: "Stage 4 completion time reduces from avg 15min (manual) to avg 5min (AI-automated)"
        }
      ],
      success_metrics: [
        {
          metric: "AI Auto-Start Adoption Rate",
          target: "≥90% of Stage 4 sessions trigger AI auto-start",
          measurement: "Analytics: (sessions with auto-start / total Stage 4 sessions) × 100",
          baseline: "0% (current: manual entry required)"
        },
        {
          metric: "Stage 4 Completion Rate",
          target: "≥80% of users complete Stage 4 (up from baseline)",
          measurement: "Analytics: (completed Stage 4 / started Stage 4) × 100",
          baseline: "~60% (estimated from manual workflow)"
        },
        {
          metric: "Time to Complete Stage 4",
          target: "≤5 minutes average (67% reduction)",
          measurement: "Analytics: Avg time from Stage 4 mount to Stage 5 navigation",
          baseline: "~15 minutes (manual competitor entry)"
        },
        {
          metric: "Manual Fallback Rate",
          target: "≤15% of sessions fallback to manual entry",
          measurement: "Analytics: (sessions using manual entry / total sessions) × 100",
          baseline: "100% (current: all manual)"
        }
      ],
      key_principles: [
        "AI-first by default: Automation should be the primary path, not an optional feature",
        "Progress transparency: Show users what AI is doing in real-time to build trust",
        "Graceful degradation: Always provide manual fallback when AI fails",
        "Non-blocking UX: Navigation blocked during AI analysis, but Skip button always available after 10s",
        "Reuse existing infrastructure: Leverage CompetitiveMapperAgent without modification",
        "Polling over WebSockets: Start with simple polling (MVP), optimize to WebSockets later"
      ],
      updated_at: new Date().toISOString()
    };

    console.log('📝 Update payload prepared:');
    console.log(`   - strategic_objectives: ${updateData.strategic_objectives.length} items`);
    console.log(`   - success_metrics: ${updateData.success_metrics.length} items`);
    console.log(`   - key_principles: ${updateData.key_principles.length} items`);
    console.log('');

    // Execute the update
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', 'SD-STAGE4-AI-FIRST-UX-001')
      .select('id, title, strategic_objectives, success_metrics, key_principles, updated_at');

    if (error) {
      console.error('❌ Update failed:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.error('❌ No record found with ID: SD-STAGE4-AI-FIRST-UX-001');
      process.exit(1);
    }

    console.log('✅ Update successful!\n');
    console.log('📊 Updated record:');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   Title: ${data[0].title}`);
    console.log(`   Updated At: ${data[0].updated_at}`);
    console.log('');
    console.log('📋 Field Summary:');
    console.log(`   strategic_objectives: ${data[0].strategic_objectives?.length || 0} items`);
    console.log(`   success_metrics: ${data[0].success_metrics?.length || 0} items`);
    console.log(`   key_principles: ${data[0].key_principles?.length || 0} items`);
    console.log('');

    // Display the actual values for verification
    console.log('🔍 Verification:');
    console.log('\nStrategic Objectives:');
    data[0].strategic_objectives?.forEach((obj, i) => {
      console.log(`   ${i + 1}. ${obj.objective}`);
    });

    console.log('\nSuccess Metrics:');
    data[0].success_metrics?.forEach((metric, i) => {
      console.log(`   ${i + 1}. ${metric.metric}: ${metric.target}`);
    });

    console.log('\nKey Principles:');
    data[0].key_principles?.forEach((principle, i) => {
      console.log(`   ${i + 1}. ${principle}`);
    });

    console.log('\n✅ All fields populated successfully!');
    console.log('\n💡 Next step: Retry LEAD→PLAN handoff validation');
    console.log('   Expected: Completeness score should reach 100%');

  } catch (error) {
    console.error('\n❌ Script execution failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Execute the update
updateSDFields();
