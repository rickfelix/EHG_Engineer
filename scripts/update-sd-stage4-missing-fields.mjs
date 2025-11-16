#!/usr/bin/env node
/**
 * Update SD-STAGE4-AI-FIRST-UX-001 with missing validation fields
 * Required for LEAD→PLAN handoff (completeness score 45% → 100%)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function updateMissingFields() {
  console.log('Updating SD-STAGE4-AI-FIRST-UX-001 with missing validation fields...\n');

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
    ]
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', 'SD-STAGE4-AI-FIRST-UX-001')
      .select('id, title, strategic_objectives, success_metrics, key_principles')
      .single();

    if (error) {
      console.error('❌ Update failed:', error.message);
      if (error.details) console.error('Details:', error.details);
      process.exit(1);
    }

    console.log('✅ SD updated successfully with missing fields!\n');
    console.log('Updated fields:');
    console.log('- strategic_objectives:', data.strategic_objectives.length, 'items');
    console.log('- success_metrics:', data.success_metrics.length, 'items');
    console.log('- key_principles:', data.key_principles.length, 'items');
    console.log('\n📊 Validation Completeness: Should now be 100%');
    console.log('\n📋 Next step: Retry LEAD→PLAN handoff');
    console.log('Command: node scripts/unified-handoff-system.js execute LEAD-TO-PLAN SD-STAGE4-AI-FIRST-UX-001');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateMissingFields();