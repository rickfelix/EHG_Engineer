/**
 * Post-Completion Validation
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-F
 *
 * Validates that post-completion commands were executed:
 * - /ship (BLOCK if missing) - Required for all completed SDs
 * - /learn (WARN if missing) - Recommended for code SDs
 * - /document (WARN if missing) - Recommended for feature SDs
 *
 * @module stop-subagent-enforcement/post-completion-validator
 */

import { execSync } from 'child_process';

/**
 * Validate that post-completion commands were executed for a completed SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 */
export async function validatePostCompletion(supabase, sd, sdKey) {
  // Get post-completion records (stored in command_invocations or similar)
  // For now, we check for ship by looking for a PR linked to the SD
  const { data: prRecords } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status, metadata')
    .eq('sd_id', sd.id)
    .ilike('deliverable_name', '%PR%');

  // Also check for retrospectives (indicates /learn was run)
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, status')
    .eq('sd_id', sd.id);

  // Check for documentation updates (indicates /document was run)
  const { data: docmonResults } = await supabase
    .from('sub_agent_execution_results')
    .select('verdict')
    .eq('sd_id', sd.id)
    .eq('sub_agent_code', 'DOCMON')
    .order('created_at', { ascending: false })
    .limit(1);

  const missingRequired = [];
  const missingRecommended = [];

  // Check /ship - Required for all completed SDs
  // Ship is considered done if there's a PR or the SD has a completion_date
  const hasShip = (prRecords && prRecords.length > 0) || sd.completion_date;
  if (!hasShip) {
    // Check if there were any commits on the branch
    // Only block if there's actual code to ship
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      if (diffOutput) {
        missingRequired.push('SHIP');
      }
    } catch {
      // If diff fails (branch deleted after merge, or on main), don't assume ship is needed
      // The completion_date check above should handle completed/shipped SDs
      // Only log for debugging - don't block
      console.error(`   ℹ️  Git diff failed for ${sdKey} - branch may already be merged`);
    }
  }

  // Check /learn - Recommended for code-producing SDs
  const codeProducingTypes = ['feature', 'bugfix', 'security', 'enhancement', 'performance'];
  const isCodeProducing = codeProducingTypes.includes(sd.sd_type);

  if (isCodeProducing) {
    const hasLearn = retros && retros.length > 0;
    if (!hasLearn) {
      missingRecommended.push('LEARN');
    }

    // Check /document - Recommended for feature SDs
    if (sd.sd_type === 'feature' || sd.sd_type === 'enhancement') {
      const hasDocument = docmonResults && docmonResults.length > 0 &&
        ['PASS', 'CONDITIONAL_PASS'].includes(docmonResults[0].verdict);
      if (!hasDocument) {
        missingRecommended.push('DOCUMENT');
      }
    }
  }

  // Output results
  if (missingRequired.length > 0) {
    console.error(`\n⚠️  Post-Completion Validation for ${sdKey}`);
    console.error(`   ❌ BLOCKING: Missing required post-completion commands: ${missingRequired.join(', ')}`);
    console.error('\n   LEO Protocol requires /ship before completing an SD with code changes.');
    console.error('   Action: Run /ship to commit, create PR, and merge the changes.');

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} completed without running required post-completion commands`,
      details: {
        sd_key: sdKey,
        sd_type: sd.sd_type,
        status: 'completed',
        missing_required: missingRequired,
        missing_recommended: missingRecommended
      },
      remediation: {
        action: 'Run /ship command to commit and merge changes',
        command: 'Use /ship in Claude Code'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Warn about missing recommended
  if (missingRecommended.length > 0) {
    console.error(`\n💡 Post-Completion Advisory for ${sdKey}`);
    console.error(`   Missing recommended: ${missingRecommended.join(', ')}`);
    if (missingRecommended.includes('LEARN')) {
      console.error('   Consider running /learn to capture insights from this SD');
    }
    if (missingRecommended.includes('DOCUMENT')) {
      console.error('   Consider running /document to update documentation');
    }
    console.error('   (Not blocking - these improve continuous improvement)');
  } else {
    console.error(`✅ Post-Completion Validation: ${sdKey} passed`);
  }
}
