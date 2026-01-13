#!/usr/bin/env node

/**
 * Add Exploration Summary for SD-HARDENING-V1-000
 * Based on three-way AI assessment (Claude, OpenAI, Gemini)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addExplorationSummary() {
  const sdId = 'SD-HARDENING-V1-000';

  // Get SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    console.error('SD not found:', sdError?.message);
    return;
  }

  console.log('Found SD:', sd.id);

  // Exploration findings from three-way AI assessment
  const explorationSummary = {
    exploration_date: new Date().toISOString(),
    files_explored: [
      {
        path: './database/migrations/20251214_add_missing_rls_policies.sql',
        findings: 'RLS policies use USING(true) pattern - grants anyone read/modify access. 165 files found with this pattern across both repos.',
        relevance: 'critical - security issue'
      },
      {
        path: '../ehg/src/pages/api/v2/chairman/decisions.ts',
        findings: 'Queries venture_decisions table. N+1 query pattern at lines 93-134 - loops through decisions calling getDecisionEvidence per-decision instead of batch.',
        relevance: 'high - performance and split-brain issue'
      },
      {
        path: '../ehg/src/services/evaStateMachines.ts',
        findings: 'Venture state machine maps status to states. Uses ventures table for status. Split-brain concern - UI writes to venture_decisions, state machine reads from ventures.',
        relevance: 'high - correctness issue'
      },
      {
        path: './database/migrations/20251206_factory_architecture.sql',
        findings: 'Contains advance_venture_stage function (without fn_ prefix). Function naming drift between fn_advance_venture_stage and advance_venture_stage.',
        relevance: 'medium - consistency issue'
      },
      {
        path: '../ehg/src/services/chairmanEvidenceService.ts',
        findings: 'Multiple as any casts at lines 129, 142, 202, 220 for epistemic_evidence JSONB field. Type safety compromised.',
        relevance: 'medium - type safety issue'
      },
      {
        path: '../ehg/database/migrations/20251030_RLS_PROPER_PATTERN.sql',
        findings: 'Shows documented pattern for RLS - uses USING(true) for public read, authenticated full access. Pattern confirmed across multiple files.',
        relevance: 'critical - confirms security pattern'
      }
    ],
    summary: 'Three-way AI assessment (Claude, OpenAI, Gemini) identified: 1) RLS USING(true) in 165+ files - critical security, 2) Decision split-brain - UI writes venture_decisions, state machine reads chairman_decisions, 3) Function naming drift - fn_advance_venture_stage vs advance_venture_stage, 4) N+1 query pattern in decisions API, 5) Type safety - as any casts in chairmanEvidenceService.ts',
    source: 'three_way_ai_assessment'
  };

  // Get current metadata
  const { data: currentData, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', sd.id)
    .single();

  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    return;
  }

  // Merge exploration summary into metadata
  const updatedMetadata = {
    ...(currentData?.metadata || {}),
    exploration_summary: explorationSummary
  };

  // Update SD with exploration summary in metadata
  const { data: _updated, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id)
    .select('id, metadata');

  if (updateError) {
    console.error('Update error:', updateError.message);
    return;
  }

  console.log('✅ Exploration summary added to SD');
  console.log('Files documented:', explorationSummary.files_explored.length);
}

addExplorationSummary().catch(console.error);
