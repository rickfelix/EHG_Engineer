#!/usr/bin/env node
/**
 * SD Verify - Strategic Directive Verification Workflow
 *
 * Purpose: Handle SDs in EXEC_COMPLETE/review status that need verification
 * Control Gap Fix: Provides explicit workflow for closing out completed SDs
 *
 * Usage:
 *   node scripts/sd-verify.js <SD-ID>     - Run verification for an SD
 *   node scripts/sd-verify.js --list      - List all SDs needing verification
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { checkUncommittedChanges, getAffectedRepos } from '../lib/multi-repo/index.js';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgMagenta: '\x1b[45m',
};

/**
 * List all SDs needing verification
 */
async function listPendingVerification() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} SDs PENDING VERIFICATION${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, current_phase, status, progress_percentage, updated_at')
    .eq('is_active', true)
    .or('current_phase.eq.EXEC_COMPLETE,status.eq.review')
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('updated_at', { ascending: false });

  if (error) {
    console.log(`${colors.red}Error querying SDs: ${error.message}${colors.reset}`);
    return;
  }

  if (!sds || sds.length === 0) {
    console.log(`${colors.green}✓ No SDs pending verification${colors.reset}\n`);
    return;
  }

  console.log(`Found ${sds.length} SD(s) needing verification:\n`);

  for (const sd of sds) {
    const sdId = sd.sd_key || sd.id;
    console.log(`${colors.magenta}${colors.bold}${sdId}${colors.reset}`);
    console.log(`  Title: ${sd.title}`);
    console.log(`  Phase: ${sd.current_phase} | Status: ${sd.status}`);
    console.log(`  Progress: ${sd.progress_percentage || 0}%`);
    console.log(`  Last Updated: ${new Date(sd.updated_at).toLocaleDateString()}`);
    console.log(`  ${colors.dim}Run: npm run sd:verify ${sdId}${colors.reset}\n`);
  }
}

/**
 * Run verification workflow for a specific SD
 */
async function verifySD(sdId) {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} SD VERIFICATION WORKFLOW${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Get SD details
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error || !sd) {
    console.log(`${colors.red}✗ SD not found: ${sdId}${colors.reset}\n`);
    return;
  }

  const actualSdId = sd.sd_key || sd.id;
  console.log(`${colors.bold}SD: ${actualSdId}${colors.reset}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Phase: ${sd.current_phase} | Status: ${sd.status}`);
  console.log(`Progress: ${sd.progress_percentage || 0}%\n`);

  // Verify this SD needs verification
  if (sd.current_phase !== 'EXEC_COMPLETE' && sd.status !== 'review') {
    console.log(`${colors.yellow}⚠️  This SD is not in verification state${colors.reset}`);
    console.log(`  Current phase: ${sd.current_phase}`);
    console.log(`  Current status: ${sd.status}\n`);
    console.log('  Only SDs in EXEC_COMPLETE phase or \'review\' status need verification.\n');
    return;
  }

  // Check for PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, version, status')
    .eq('sd_id', sd.id)
    .single();

  console.log(`${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}VERIFICATION CHECKLIST${colors.reset}\n`);

  // 1. PRD exists
  if (prd) {
    console.log(`${colors.green}✓${colors.reset} PRD exists (version ${prd.version}, status: ${prd.status})`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No PRD found - may be acceptable for non-feature SDs`);
  }

  // 2. Check for handoff records
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('direction, from_phase, to_phase, created_at')
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (handoffs && handoffs.length > 0) {
    console.log(`${colors.green}✓${colors.reset} Handoff records exist (${handoffs.length} transitions)`);
    const lastHandoff = handoffs[0];
    console.log(`  ${colors.dim}Last: ${lastHandoff.from_phase} → ${lastHandoff.to_phase}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No handoff records found`);
  }

  // 3. Check smoke test steps
  if (sd.smoke_test_steps && sd.smoke_test_steps.length > 0) {
    console.log(`${colors.green}✓${colors.reset} Smoke test steps defined (${sd.smoke_test_steps.length} steps)`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No smoke test steps defined`);
  }

  // 4. Check feature branch
  const featureBranch = sd.metadata?.feature_branch;
  if (featureBranch) {
    console.log(`${colors.green}✓${colors.reset} Feature branch: ${featureBranch}`);

    // Check if branch was merged
    try {
      const merged = execSync(`git branch -a --merged main | grep "${featureBranch}" 2>/dev/null || echo ""`, { encoding: 'utf8' });
      if (merged.trim()) {
        console.log(`  ${colors.green}✓ Branch merged to main${colors.reset}`);
      } else {
        console.log(`  ${colors.yellow}⚠ Branch may not be merged yet${colors.reset}`);
      }
    } catch {
      console.log(`  ${colors.dim}Could not check merge status${colors.reset}`);
    }
  } else {
    console.log(`${colors.dim}○${colors.reset} No feature branch recorded`);
  }

  // 5. Check for retrospective
  const { data: retro } = await supabase
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', actualSdId)
    .single();

  if (retro) {
    console.log(`${colors.green}✓${colors.reset} Retrospective exists`);
  } else {
    console.log(`${colors.yellow}⚠${colors.reset} No retrospective found (recommended for learning capture)`);
  }

  // 6. Phase 2 Enhancement: Check multi-repo status
  console.log('');
  let multiRepoClean = true;
  try {
    const multiRepoStatus = checkUncommittedChanges(true);
    if (multiRepoStatus && multiRepoStatus.hasChanges) {
      // Get affected repos for this SD
      const affectedRepos = getAffectedRepos({
        title: sd.title || '',
        description: sd.description || '',
        sd_type: sd.sd_type || 'feature'
      });

      // Check if any affected repo has uncommitted changes
      const relevantChanges = multiRepoStatus.summary.filter(repo => {
        const repoName = repo.name.toLowerCase();
        return affectedRepos.some(ar => ar.toLowerCase() === repoName);
      });

      const hasRelevantChanges = relevantChanges.some(r =>
        r.uncommittedCount > 0 || r.unpushedCount > 0
      );

      if (hasRelevantChanges) {
        console.log(`${colors.yellow}⚠${colors.reset} Multi-repo status: UNCOMMITTED CHANGES`);
        for (const repo of relevantChanges) {
          if (repo.uncommittedCount > 0 || repo.unpushedCount > 0) {
            console.log(`  ${colors.dim}${repo.displayName}: ${repo.uncommittedCount} uncommitted, ${repo.unpushedCount} unpushed${colors.reset}`);
          }
        }
        multiRepoClean = false;
      } else {
        console.log(`${colors.green}✓${colors.reset} Multi-repo status: All affected repositories clean`);
      }
    } else {
      console.log(`${colors.green}✓${colors.reset} Multi-repo status: All repositories clean`);
    }
  } catch {
    console.log(`${colors.dim}○${colors.reset} Multi-repo status: Could not check`);
  }

  console.log(`\n${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}RECOMMENDED ACTIONS${colors.reset}\n`);

  // Phase 2: Warn about uncommitted changes
  if (!multiRepoClean) {
    console.log(`${colors.yellow}${colors.bold}⚠️  MULTI-REPO WARNING${colors.reset}`);
    console.log('  Uncommitted changes found in related repositories.');
    console.log('  Ship changes before completing SD to avoid losing work.');
    console.log(`  ${colors.dim}Run: node scripts/multi-repo-status.js for details${colors.reset}\n`);
  }

  // Determine next action based on state
  if (sd.status === 'review' && sd.current_phase === 'EXEC_COMPLETE') {
    console.log(`${colors.cyan}Option 1: Complete the SD${colors.reset}`);
    console.log('  If verification passed, mark SD as complete:');
    console.log(`  ${colors.dim}npm run sd:complete ${actualSdId}${colors.reset}\n`);

    console.log(`${colors.cyan}Option 2: Continue work${colors.reset}`);
    console.log('  If more work is needed, create a follow-up SD or reopen:');
    console.log(`  ${colors.dim}npm run sd:reopen ${actualSdId}${colors.reset}\n`);

    console.log(`${colors.cyan}Option 3: Run UAT${colors.reset}`);
    console.log('  Execute manual smoke tests to verify functionality:');
    console.log(`  ${colors.dim}npm run uat:execute ${actualSdId}${colors.reset}\n`);
  }

  console.log(`${colors.bold}───────────────────────────────────────────────────────────────────${colors.reset}\n`);
}

/**
 * Complete an SD (mark as completed)
 */
async function completeSD(sdId) {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} COMPLETING SD${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Get SD
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, current_phase, status, sd_type, description')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error || !sd) {
    console.log(`${colors.red}✗ SD not found: ${sdId}${colors.reset}\n`);
    return;
  }

  const actualSdId = sd.sd_key || sd.id;
  console.log(`SD: ${actualSdId}`);
  console.log(`Title: ${sd.title}\n`);

  // Phase 2 Enhancement: Check multi-repo status before completing
  try {
    const multiRepoStatus = checkUncommittedChanges(true);
    if (multiRepoStatus && multiRepoStatus.hasChanges) {
      const affectedRepos = getAffectedRepos({
        title: sd.title || '',
        description: sd.description || '',
        sd_type: sd.sd_type || 'feature'
      });

      const relevantChanges = multiRepoStatus.summary.filter(repo => {
        const repoName = repo.name.toLowerCase();
        return affectedRepos.some(ar => ar.toLowerCase() === repoName);
      });

      const hasRelevantChanges = relevantChanges.some(r =>
        r.uncommittedCount > 0 || r.unpushedCount > 0
      );

      if (hasRelevantChanges) {
        console.log(`${colors.yellow}${colors.bold}⚠️  MULTI-REPO WARNING${colors.reset}`);
        console.log('  Uncommitted changes found in related repositories:');
        for (const repo of relevantChanges) {
          if (repo.uncommittedCount > 0 || repo.unpushedCount > 0) {
            console.log(`    ${repo.displayName}: ${repo.uncommittedCount} uncommitted, ${repo.unpushedCount} unpushed`);
          }
        }
        console.log('');
        console.log(`${colors.yellow}  Ship changes in all repos before completing SD.${colors.reset}`);
        console.log(`  ${colors.dim}Run: node scripts/multi-repo-status.js for details${colors.reset}\n`);
        console.log(`${colors.red}✗ SD completion blocked - ship uncommitted changes first${colors.reset}\n`);
        return;
      }
    }
  } catch {
    // If check fails, proceed with completion
  }

  // Update to completed
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      current_phase: 'COMPLETED',
      progress_percentage: 100,
      completion_date: new Date().toISOString(),
    })
    .eq('id', sd.id);

  if (updateError) {
    console.log(`${colors.red}✗ Failed to complete SD: ${updateError.message}${colors.reset}\n`);
    return;
  }

  console.log(`${colors.green}${colors.bold}✓ SD COMPLETED SUCCESSFULLY${colors.reset}\n`);
  console.log('  Status: completed');
  console.log('  Phase: COMPLETED');
  console.log('  Progress: 100%\n');

  console.log(`${colors.dim}Recommended: Create retrospective to capture learnings${colors.reset}`);
  console.log(`${colors.dim}Run: npm run retro:create ${actualSdId}${colors.reset}\n`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
${colors.bold}SD Verify - Strategic Directive Verification Workflow${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npm run sd:verify <SD-ID>     Run verification for a specific SD
  npm run sd:verify --list      List all SDs needing verification
  npm run sd:complete <SD-ID>   Mark SD as completed

${colors.cyan}Examples:${colors.reset}
  npm run sd:verify SD-FEATURE-001
  npm run sd:verify --list
  npm run sd:complete SD-FEATURE-001

${colors.cyan}Purpose:${colors.reset}
  Handles SDs in EXEC_COMPLETE/review phase that need verification
  before being marked as complete. This is part of the LEO Protocol
  control gap fix to ensure proper SD lifecycle management.
`);
  process.exit(0);
}

if (command === '--list' || command === '-l') {
  await listPendingVerification();
} else if (command === '--complete' || args[0] === 'complete') {
  const sdIdArg = command === '--complete' ? args[1] : args[1];
  if (!sdIdArg) {
    console.log(`${colors.red}Error: SD-ID required${colors.reset}`);
    console.log('Usage: npm run sd:complete <SD-ID>');
    process.exit(1);
  }
  await completeSD(sdIdArg);
} else {
  await verifySD(command);
}
