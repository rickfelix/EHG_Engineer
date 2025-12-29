#!/usr/bin/env node

/**
 * Insert SD-VISION-TRANSITION-001 into strategic_directives_v2 table
 * This script uses service role to bypass RLS for administrative operations.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function insertSD() {
  console.log('🔄 Inserting SD-VISION-TRANSITION-001...\n');

  const sdData = {
    id: 'SD-VISION-TRANSITION-001',
    sd_key: 'vision-transition-001',
    title: 'Venture Vision v2.0 Migration (40-Stage to 25-Stage)',
    status: 'draft',
    category: 'infrastructure',
    priority: 'critical',
    sd_type: 'infrastructure',
    complexity_level: 'complex',
    relationship_type: 'standalone',
    target_application: 'EHG_Engineer',
    description: 'Migrate EHG from legacy 40-stage workflow to streamlined 25-stage Venture Vision v2.0. This critical infrastructure SD includes: 1. Archive 412+ legacy documentation files 2. Archive 38 stage-workflow SDs 3. Delete 139 orphaned test SDs 4. Update 3 database CHECK constraints 5. Update 3 API validation schemas 6. Update 2 scripts 7. Generate stages_v2.yaml 8. Create lifecycle_stage_config table. Reference: ADR-002-VENTURE-FACTORY-ARCHITECTURE.md (APPROVED)',
    rationale: 'The current 40-stage workflow was designed for team-based enterprises. The Chairman operates as a Solo AI Entrepreneur, requiring a streamlined 25-stage approach optimized for reduced cognitive overhead, faster venture validation cycles, Chairman Advisory soft gates, and Platform-as-a-Factory model. This migration is foundational for all future venture creation workflows.',
    scope: 'IN SCOPE: Documentation archival (412+ files), Database SD cleanup (177 records), Database constraint updates (3 CHECK constraints), API schema updates (3 Zod validators), Script updates (2 files), stages_v2.yaml generation, lifecycle_stage_config table creation. OUT OF SCOPE: Chairman Advisory Engine (separate SD), Factory Console UI (separate SD), Venture-specific migrations.',
    strategic_intent: 'Establish foundation for 25-stage Venture Vision v2.0 workflow that enables efficient solo entrepreneur venture creation.',
    current_phase: 'LEAD_APPROVAL',
    phase_progress: 0,
    progress: 0,
    progress_percentage: 0,
    is_working_on: false,
    is_active: true,
    sequence_rank: 1,
    strategic_objectives: JSON.stringify([
      'Archive legacy 40-stage documentation safely with proper manifest',
      'Clean database of obsolete and test SDs',
      'Update all code integration points',
      'Create clean 25-stage configuration',
      'Verify zero broken references post-migration'
    ]),
    success_criteria: JSON.stringify([
      'All 412+ legacy files archived',
      'Archive manifest created',
      '38 stage-workflow SDs archived',
      '139 test SDs deleted',
      'stages_v2.yaml created',
      'Database CHECK constraints updated',
      'leo-schemas.ts updated',
      'compliance-check.js updated',
      'lifecycle_stage_config table created',
      'Zero broken links',
      'npm run sd:next works'
    ]),
    key_changes: JSON.stringify([
      { area: 'Documentation', change: 'Archive 412+ files', impact: 'Clean active docs' },
      { area: 'Database', change: 'Archive/delete SDs', impact: 'Clean SD queue' },
      { area: 'Constraints', change: '40 to 25 limit', impact: 'Valid data only' }
    ]),
    dependencies: JSON.stringify([
      { type: 'document', id: 'ADR-002', name: 'ADR-002-VENTURE-FACTORY-ARCHITECTURE.md', status: 'APPROVED' }
    ]),
    risks: JSON.stringify([
      { risk: 'Scripts break during transition', probability: 'medium', impact: 'high', mitigation: 'Copy-first archive strategy' }
    ]),
    implementation_guidelines: JSON.stringify([
      'Phase 1: Archive Creation',
      'Phase 2: Database Cleanup',
      'Phase 3: Constraint Updates',
      'Phase 4: Code Updates',
      'Phase 5: New Configuration',
      'Phase 6: Verification'
    ]),
    success_metrics: JSON.stringify([
      { metric: 'Files Archived', target: '412+' },
      { metric: 'SDs Archived', target: '38' },
      { metric: 'Test SDs Deleted', target: '139' }
    ]),
    created_by: 'LEAD',
    scope_reduction_percentage: 0,
    metadata: JSON.stringify({
      adr_reference: 'ADR-002-VENTURE-FACTORY-ARCHITECTURE.md',
      migration_type: '40-stage-to-25-stage'
    }),
    governance_metadata: JSON.stringify({
      chairman_approval_required: true,
      affects_production: false,
      estimated_duration_hours: 4
    }),
    version: '1.0'
  };

  // Insert the SD
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select('id, uuid_id, sd_key, title, status, current_phase')
    .single();

  if (error) {
    console.error('❌ Failed to insert SD:', error);
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    console.error('   Details:', error.details);
    process.exit(1);
  }

  console.log('✅ Successfully inserted SD-VISION-TRANSITION-001\n');
  console.log('📋 Record Details:');
  console.log('   ID:', data.id);
  console.log('   UUID:', data.uuid_id);
  console.log('   SD Key:', data.sd_key);
  console.log('   Title:', data.title);
  console.log('   Status:', data.status);
  console.log('   Phase:', data.current_phase);
  console.log('\n🔑 UUID for foreign key references:', data.uuid_id);

  return data.uuid_id;
}

// Run the insertion
insertSD()
  .then((_uuid) => {
    console.log('\n✨ Operation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Unexpected error:', error);
    process.exit(1);
  });
