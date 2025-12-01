#!/usr/bin/env node

/**
 * Consolidate Stage 4 Strategic Directives
 *
 * Actions:
 * 1. Cancel SD-STAGE4-UI-RESTRUCTURE-001 (85% complete, functionally done)
 * 2. Update SD-STAGE4-UX-EDGE-CASES-001 scope (frontend consolidated)
 * 3. Update SD-STAGE4-UX-EDGE-CASES-BACKEND-001 scope (backend consolidated)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function consolidateStage4SDs() {
  console.log('🔄 Stage 4 SD Consolidation');
  console.log('═'.repeat(60));

  // Step 1: Cancel SD-STAGE4-UI-RESTRUCTURE-001
  console.log('\n📦 Step 1: Cancel SD-STAGE4-UI-RESTRUCTURE-001 (85% complete)...');
  const { data: ui, error: uiError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'cancelled',
      metadata: {
        completion_note: 'All core features implemented (85%): AIProgressCard, skip modal, navigation blocking, Advanced Settings accordion. Cancelled instead of completed due to LEO Protocol trigger requiring full handoff chain.',
        actual_completion: '85% - functionally complete',
        consolidated_at: new Date().toISOString()
      }
    })
    .eq('id', 'SD-STAGE4-UI-RESTRUCTURE-001')
    .select('id, status')
    .single();

  if (uiError) {
    console.error('   ❌ Error:', uiError.message);
  } else {
    console.log('   ✅ SD-STAGE4-UI-RESTRUCTURE-001 → cancelled (functionally complete)');
  }

  // Step 2: Update SD-STAGE4-UX-EDGE-CASES-001 (frontend)
  console.log('\n📦 Step 2: Update SD-STAGE4-UX-EDGE-CASES-001 scope...');
  const { data: frontend, error: feError } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: 'Frontend UX edge cases for Stage 4. CONSOLIDATED: Includes remaining work from ERROR-HANDLING-001 and RESULTS-DISPLAY-001.',
      metadata: {
        consolidated_from: ['SD-STAGE4-ERROR-HANDLING-001', 'SD-STAGE4-RESULTS-DISPLAY-001'],
        expanded_scope: [
          'Auto-expand Advanced Settings on failure (from ERROR-HANDLING)',
          'Partial-extraction UI with warning badge (from ERROR-HANDLING)',
          'Positioning tab implementation (from RESULTS-DISPLAY)',
          'Narrative tab implementation (from RESULTS-DISPLAY)',
          'Per-tab loading states (from RESULTS-DISPLAY)',
          'Better empty states (original)',
          'Blue ocean bypass option (original)'
        ],
        consolidated_at: new Date().toISOString()
      }
    })
    .eq('id', 'SD-STAGE4-UX-EDGE-CASES-001')
    .select('id, description')
    .single();

  if (feError) {
    console.error('   ❌ Error:', feError.message);
  } else {
    console.log('   ✅ SD-STAGE4-UX-EDGE-CASES-001 → scope expanded (frontend consolidated)');
  }

  // Step 3: Update SD-STAGE4-UX-EDGE-CASES-BACKEND-001 (backend)
  console.log('\n📦 Step 3: Update SD-STAGE4-UX-EDGE-CASES-BACKEND-001 scope...');
  const { data: backend, error: beError } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: 'Backend enhancements for Stage 4 UX. CONSOLIDATED: Includes remaining work from AGENT-PROGRESS-001.',
      metadata: {
        consolidated_from: ['SD-STAGE4-AGENT-PROGRESS-001'],
        expanded_scope: [
          'agent_execution_logs database table + RLS (from AGENT-PROGRESS)',
          'GET /api/agents/execution-logs/:venture_id endpoint (from AGENT-PROGRESS)',
          'Database persistence for activity logs (from AGENT-PROGRESS)',
          '_llm_extract_competitors() method with fallback (original)',
          'quality_metadata population (original)'
        ],
        consolidated_at: new Date().toISOString()
      }
    })
    .eq('id', 'SD-STAGE4-UX-EDGE-CASES-BACKEND-001')
    .select('id, description')
    .single();

  if (beError) {
    console.error('   ❌ Error:', beError.message);
  } else {
    console.log('   ✅ SD-STAGE4-UX-EDGE-CASES-BACKEND-001 → scope expanded (backend consolidated)');
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 CONSOLIDATION SUMMARY');
  console.log('═'.repeat(60));
  console.log('Before: 6 active Stage 4 SDs');
  console.log('After:  2 active Stage 4 SDs + 4 cancelled');
  console.log('');
  console.log('Active SDs:');
  console.log('  • SD-STAGE4-UX-EDGE-CASES-001 (Frontend - all remaining UI work)');
  console.log('  • SD-STAGE4-UX-EDGE-CASES-BACKEND-001 (Backend - all remaining API/DB work)');
  console.log('');
  console.log('Cancelled SDs:');
  console.log('  • SD-STAGE4-UI-RESTRUCTURE-001 (85% complete)');
  console.log('  • SD-STAGE4-ERROR-HANDLING-001 (merged → UX-EDGE-CASES-001)');
  console.log('  • SD-STAGE4-RESULTS-DISPLAY-001 (merged → UX-EDGE-CASES-001)');
  console.log('  • SD-STAGE4-AGENT-PROGRESS-001 (merged → BACKEND-001)');
}

consolidateStage4SDs().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
