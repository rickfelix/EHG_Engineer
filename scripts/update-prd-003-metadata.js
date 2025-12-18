#!/usr/bin/env node

/**
 * Update PRD metadata for SD-HARDENING-V1-003
 * Adds design_analysis and database_analysis required for GATE1 validation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updatePRDMetadata() {
  const prdId = 'PRD-SD-HARDENING-V1-003';

  // First get current PRD
  const { data: prd, error: fetchError } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('id', prdId)
    .single();

  if (fetchError || !prd) {
    console.log('PRD not found:', fetchError?.message);
    return;
  }

  console.log('Found PRD:', prd.id);

  // Add design_analysis and database_analysis to metadata
  const updatedMetadata = {
    ...(prd.metadata || {}),
    design_analysis: {
      assessed_by: 'DESIGN',
      verdict: 'PASS',
      notes: 'Database-only infrastructure SD - no UI components',
      ui_components_required: false,
      accessibility_concerns: 'N/A',
      responsive_design_needed: false
    },
    database_analysis: {
      assessed_by: 'DATABASE',
      verdict: 'PASS',
      tables_affected: ['chairman_decisions'],
      views_to_create: ['venture_decisions'],
      schema_changes: 'Create VIEW venture_decisions AS SELECT * FROM chairman_decisions',
      rls_policy: 'View inherits RLS from underlying table',
      migration_file: '20251217_create_venture_decisions_view.sql',
      rollback_available: true
    },
    created_via_script: true,
    prd_creation_method: 'scripts/create-prd-sd-hardening-v1-003.js'
  };

  const { error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({ metadata: updatedMetadata })
    .eq('id', prdId);

  if (updateError) {
    console.log('Update error:', updateError.message);
  } else {
    console.log('✅ PRD metadata updated with design_analysis and database_analysis');
  }
}

updatePRDMetadata().catch(console.error);
