#!/usr/bin/env node

/**
 * Vision Brief Approval Script
 *
 * Allows Chairman to approve or reject generated vision briefs.
 * Updates sd.metadata.vision_discovery.approval status.
 *
 * Part of: PR #5 - Vision Brief Generator
 * Related: generate-vision-brief.js, persona-extractor.js
 *
 * Usage:
 *   node scripts/approve-vision-brief.js SD-FEATURE-001
 *   node scripts/approve-vision-brief.js SD-FEATURE-001 --reject "Reason text"
 *
 * @module approve-vision-brief
 * @version 1.0.0
 */

import readline from 'readline';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';

dotenv.config();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const sdId = args.find(arg => !arg.startsWith('--'));

  // Check for --reject flag and extract reason
  const rejectIndex = args.indexOf('--reject');
  let rejectReason = null;
  if (rejectIndex !== -1 && args[rejectIndex + 1]) {
    rejectReason = args[rejectIndex + 1];
  }

  return { sdId, rejectReason };
}

/**
 * Prompt user for yes/no confirmation
 */
function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      const normalized = (answer || '').toLowerCase().trim();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const { sdId, rejectReason } = parseArgs();
  const isRejectMode = rejectReason !== null;

  // Validate input
  if (!sdId) {
    console.log('Usage: node scripts/approve-vision-brief.js <SD-ID> [--reject "reason"]');
    console.log('');
    console.log('Options:');
    console.log('  --reject "reason"  Reject the vision brief with a reason');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/approve-vision-brief.js SD-FEATURE-001');
    console.log('  node scripts/approve-vision-brief.js SD-FEATURE-001 --reject "Missing end-user persona"');
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('VISION BRIEF APPROVAL');
  console.log('='.repeat(60));
  console.log('');
  console.log(`   SD: ${sdId}`);
  console.log(`   Mode: ${isRejectMode ? 'REJECT' : 'APPROVE'}`);
  console.log('');

  // Initialize Supabase client
  const supabase = await createSupabaseServiceClient('engineer');

  // Step 1: Fetch SD record
  console.log('Step 1: Fetching SD record...');
  const { data: sdData, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, metadata')
    .eq('id', sdId)
    .single();

  if (fetchError || !sdData) {
    console.error(`   ERROR: SD not found: ${sdId}`);
    console.error(`   ${fetchError?.message || 'No data returned'}`);
    process.exit(1);
  }

  console.log(`   Title: ${sdData.title}`);
  console.log(`   Type: ${sdData.sd_type || 'not set'}`);
  console.log('');

  // Step 2: Validate vision_discovery exists
  console.log('Step 2: Validating vision_discovery...');
  const visionDiscovery = sdData.metadata?.vision_discovery;

  if (!visionDiscovery) {
    console.error('   ERROR: No vision_discovery found in SD metadata.');
    console.error('');
    console.error('   Run first: node scripts/generate-vision-brief.js ' + sdId + ' --confirm');
    process.exit(1);
  }

  const approval = visionDiscovery.approval || {};
  const personas = visionDiscovery.stakeholder_personas || [];
  const currentStatus = approval.status || 'unknown';
  const version = approval.version || 0;

  console.log(`   Status: ${currentStatus}`);
  console.log(`   Version: ${version}`);
  console.log(`   Personas: ${personas.length}`);
  console.log('');

  // Step 3: Display summary
  console.log('Vision Brief Summary:');
  console.log('-'.repeat(40));
  console.log(`   SD ID: ${sdId}`);
  console.log(`   Title: ${sdData.title}`);
  console.log(`   Current Status: ${currentStatus}`);
  console.log(`   Version: ${version}`);
  console.log(`   Persona Count: ${personas.length}`);
  console.log('');
  console.log('   Personas:');
  for (const persona of personas) {
    console.log(`     - ${persona.name} (${persona.persona_id})`);
  }
  console.log('-'.repeat(40));
  console.log('');

  // Step 4: Process approval or rejection
  if (isRejectMode) {
    // Reject flow - no prompt needed (explicit intent via --reject flag)
    console.log(`Rejecting with reason: "${rejectReason}"`);
    console.log('');

    const updatedApproval = {
      ...approval,
      status: 'rejected',
      approved_at: null,
      approved_by: null,
      reviewer_notes: rejectReason
    };

    const updatedVisionDiscovery = {
      ...visionDiscovery,
      approval: updatedApproval
    };

    const updatedMetadata = {
      ...(sdData.metadata || {}),
      vision_discovery: updatedVisionDiscovery
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', sdId);

    if (updateError) {
      console.error(`   ERROR: Failed to update SD: ${updateError.message}`);
      process.exit(1);
    }

    console.log(`   Status: ${currentStatus} → rejected`);
    console.log('   DB update confirmed.');
    console.log('');
    console.log('Vision brief rejected. Regenerate with:');
    console.log(`   node scripts/generate-vision-brief.js ${sdId} --confirm`);

  } else {
    // Approve flow - prompt for confirmation
    const confirmed = await promptYesNo(`Approve vision brief for ${sdId}? (y/n) `);

    if (!confirmed) {
      console.log('');
      console.log('No changes made.');
      process.exit(0);
    }

    console.log('');
    console.log('Approving vision brief...');

    const updatedApproval = {
      ...approval,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: 'Chairman',
      reviewer_notes: null
    };

    const updatedVisionDiscovery = {
      ...visionDiscovery,
      approval: updatedApproval
    };

    const updatedMetadata = {
      ...(sdData.metadata || {}),
      vision_discovery: updatedVisionDiscovery
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', sdId);

    if (updateError) {
      console.error(`   ERROR: Failed to update SD: ${updateError.message}`);
      process.exit(1);
    }

    console.log(`   Status: ${currentStatus} → approved`);
    console.log('   DB update confirmed.');
    console.log('');
    console.log('Vision brief approved. PRD generation can now proceed.');
  }

  console.log('');
  console.log('Done.');
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
