/**
 * LEO 5.0 CLI Commands
 *
 * Extends the handoff CLI with LEO 5.0 task system commands:
 * - walls: View wall states for an SD
 * - retry-gate: Retry a failed gate
 * - kickback: Create manual kickback to previous phase
 * - invalidate: Invalidate a wall for correction
 * - resume: Resume after correction
 * - failures: View failure history
 * - subagents: View sub-agent status
 *
 * Part of SD-LEO-INFRA-LEO-TASK-SYSTEM-001 Phase 5
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WallManager } from '../../../../lib/tasks/wall-manager.js';
import { WallEnforcement } from '../../../../lib/tasks/wall-enforcement.js';
import { KickbackManager, KICKBACK_STATUS } from '../../../../lib/tasks/kickback-manager.js';
import { CorrectionManager, CORRECTION_TYPE } from '../../../../lib/tasks/correction-manager.js';
import { SubAgentOrchestrator } from '../../../../lib/tasks/subagent-orchestrator.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize managers
const _wallManager = new WallManager(supabase);
const wallEnforcement = new WallEnforcement(supabase);
const kickbackManager = new KickbackManager(supabase);
const correctionManager = new CorrectionManager(supabase);
const subAgentOrchestrator = new SubAgentOrchestrator(supabase);

/**
 * Display LEO 5.0 CLI help
 */
export function displayLeo5Help() {
  console.log('');
  console.log('LEO 5.0 WALL & TASK COMMANDS:');
  console.log('-'.repeat(50));
  console.log('  walls SD-ID              - View wall states for an SD');
  console.log('  retry-gate SD-ID GATE-ID - Retry a failed gate');
  console.log('  kickback SD-ID [opts]    - Create manual kickback');
  console.log('  invalidate WALL SD-ID    - Invalidate wall for correction');
  console.log('  resume SD-ID             - Resume after correction');
  console.log('  failures SD-ID           - View failure history');
  console.log('  subagents SD-ID [PHASE]  - View sub-agent status');
  console.log('');
  console.log('KICKBACK OPTIONS:');
  console.log('  --from PHASE      Source phase (e.g., EXEC)');
  console.log('  --to PHASE        Target phase (e.g., PLAN)');
  console.log('  --reason "..."    Reason for kickback');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  node scripts/handoff.js walls SD-FEATURE-001');
  console.log('  node scripts/handoff.js retry-gate SD-001 GATE-PRD');
  console.log('  node scripts/handoff.js kickback SD-001 --from EXEC --to PLAN --reason "Tests failing"');
  console.log('  node scripts/handoff.js invalidate PLAN-WALL SD-001 --reason "PRD scope change"');
  console.log('  node scripts/handoff.js failures SD-001');
  console.log('  node scripts/handoff.js subagents SD-001 PLAN');
  console.log('');
}

/**
 * Handle walls command - View wall states for an SD
 */
export async function handleWallsCommand(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/handoff.js walls SD-ID');
    console.log('');
    console.log('Shows all wall states for a Strategic Directive.');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Wall Status Overview');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log('');

  try {
    const overview = await wallEnforcement.getWallOverview(sdId);

    if (overview.error) {
      console.log(`  ❌ Error: ${overview.error}`);
      return { success: false };
    }

    console.log(`  Track: ${overview.track}`);
    console.log(`  Current Phase: ${overview.currentPhase || 'N/A'}`);
    console.log(`  Progress: ${overview.passedWalls}/${overview.totalWalls} walls passed`);
    console.log('');
    console.log('  WALL STATUS');
    console.log('  ' + '-'.repeat(60));

    if (!overview.walls || overview.walls.length === 0) {
      console.log('  No walls defined for this track');
    } else {
      for (const wall of overview.walls) {
        const statusIcon = {
          'pending': '⏳',
          'blocked': '🔒',
          'ready': '🟢',
          'passed': '✅',
          'invalidated': '❌',
          'not_initialized': '⚪'
        }[wall.status] || '❓';

        console.log(`  ${statusIcon} ${wall.wallName.padEnd(18)} | ${wall.status.padEnd(16)}`);

        if (wall.blockedBy && wall.blockedBy.length > 0) {
          console.log(`     Blocked by: ${wall.blockedBy.join(', ')}`);
        }

        if (wall.passedAt) {
          console.log(`     Passed: ${new Date(wall.passedAt).toLocaleString()}`);
        }

        if (wall.validationScore) {
          console.log(`     Score: ${wall.validationScore}%`);
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle retry-gate command - Retry a failed gate
 */
export async function handleRetryGateCommand(sdId, gateId) {
  if (!sdId || !gateId) {
    console.log('Usage: node scripts/handoff.js retry-gate SD-ID GATE-ID');
    console.log('');
    console.log('Retries a failed gate (resets retry count if under max).');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js retry-gate SD-001 GATE-PRD');
    console.log('  node scripts/handoff.js retry-gate SD-001 GATE-BMAD');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Gate Retry');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log(`  Gate: ${gateId}`);
  console.log('');

  try {
    // Check current retry count
    const retryCount = await kickbackManager.getGateRetryCount(sdId, gateId);
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      console.log(`  ❌ Gate ${gateId} has exceeded max retries (${retryCount}/${maxRetries})`);
      console.log('     A kickback has likely been created.');
      console.log('     Use: node scripts/handoff.js failures SD-ID');
      return { success: false };
    }

    // Reset gate for retry
    await kickbackManager.resetGateRetries(sdId, gateId);

    console.log('  ✅ Gate reset for retry');
    console.log(`     Previous attempts: ${retryCount}`);
    console.log(`     Remaining retries: ${maxRetries - retryCount}`);
    console.log('');
    console.log('  Next: Re-run the handoff that includes this gate');
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle kickback command - Create manual kickback
 */
export async function handleKickbackCommand(sdId, args) {
  // Parse args
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const reasonIdx = args.indexOf('--reason');

  const fromPhase = fromIdx !== -1 ? args[fromIdx + 1] : null;
  const toPhase = toIdx !== -1 ? args[toIdx + 1] : null;
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : null;

  if (!sdId || !fromPhase || !toPhase || !reason) {
    console.log('Usage: node scripts/handoff.js kickback SD-ID --from PHASE --to PHASE --reason "..."');
    console.log('');
    console.log('Creates a manual kickback from one phase to another.');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js kickback SD-001 --from EXEC --to PLAN --reason "Tests failing"');
    console.log('  node scripts/handoff.js kickback SD-001 --from PLAN --to LEAD --reason "Scope unclear"');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Manual Kickback');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log(`  From: ${fromPhase.toUpperCase()}`);
  console.log(`  To: ${toPhase.toUpperCase()}`);
  console.log(`  Reason: ${reason}`);
  console.log('');

  try {
    const result = await kickbackManager.createKickback(sdId, {
      fromPhase: fromPhase.toUpperCase(),
      toPhase: toPhase.toUpperCase(),
      reason,
      isManual: true
    });

    if (!result.success) {
      console.log(`  ❌ Kickback failed: ${result.error}`);
      return { success: false };
    }

    console.log('  ✅ Kickback created');
    console.log(`     Kickback ID: ${result.kickbackId}`);
    console.log(`     Wall invalidated: ${result.wallInvalidated}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`     1. Address the issue in ${toPhase.toUpperCase()} phase`);
    console.log('     2. Re-validate the invalidated wall');
    console.log('     3. Resume execution');
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle invalidate command - Invalidate wall for correction
 */
export async function handleInvalidateCommand(wallName, sdId, args) {
  // Parse reason
  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1] : null;

  // Parse correction type
  const typeIdx = args.indexOf('--type');
  const correctionType = typeIdx !== -1 ? args[typeIdx + 1] : CORRECTION_TYPE.REQUIREMENTS_CHANGE;

  if (!wallName || !sdId) {
    console.log('Usage: node scripts/handoff.js invalidate WALL-NAME SD-ID [--reason "..."] [--type TYPE]');
    console.log('');
    console.log('Invalidates a wall to allow corrections without restarting the SD.');
    console.log('');
    console.log('Correction Types:');
    console.log('  prd_scope_change       - PRD needs scope adjustment');
    console.log('  implementation_rework  - Code needs significant rework');
    console.log('  design_revision        - Design decisions need updating');
    console.log('  requirements_change    - Requirements have changed (default)');
    console.log('  architecture_update    - Architecture needs updating');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js invalidate PLAN-WALL SD-001 --reason "PRD scope change"');
    console.log('  node scripts/handoff.js invalidate EXEC-WALL SD-001 --reason "Tests need rewrite" --type implementation_rework');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Wall Invalidation');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log(`  Wall: ${wallName.toUpperCase()}`);
  console.log(`  Reason: ${reason || 'Correction required'}`);
  console.log(`  Type: ${correctionType}`);
  console.log('');

  try {
    const result = await correctionManager.invalidateWallForCorrection(sdId, wallName.toUpperCase(), {
      reason: reason || 'Correction required',
      correctionType
    });

    if (!result.success) {
      console.log(`  ❌ Invalidation failed: ${result.error}`);
      return { success: false };
    }

    console.log('  ✅ Wall invalidated');
    console.log(`     Correction ID: ${result.correctionId}`);
    console.log(`     New wall: ${result.newWallName}`);
    console.log(`     Tasks paused: ${result.pausedTasks}`);
    console.log(`     From: ${result.fromPhase} → To: ${result.toPhase}`);
    console.log('');
    console.log('  Next steps:');
    console.log(`     1. Fix the issues in ${result.toPhase} phase`);
    console.log(`     2. Re-validate via ${result.newWallName}`);
    console.log(`     3. Resume with: node scripts/handoff.js resume ${sdId}`);
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle resume command - Resume after correction
 */
export async function handleResumeCommand(sdId, args) {
  // Parse correction ID if provided
  const correctionIdx = args.indexOf('--correction');
  const correctionId = correctionIdx !== -1 ? args[correctionIdx + 1] : null;

  // Parse notes
  const notesIdx = args.indexOf('--notes');
  const notes = notesIdx !== -1 ? args[notesIdx + 1] : null;

  if (!sdId) {
    console.log('Usage: node scripts/handoff.js resume SD-ID [--correction ID] [--notes "..."]');
    console.log('');
    console.log('Resumes work after a correction is complete.');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js resume SD-001');
    console.log('  node scripts/handoff.js resume SD-001 --notes "PRD updated per feedback"');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Resume After Correction');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log('');

  try {
    // Get active corrections
    const corrections = await correctionManager.getActiveCorrections(sdId);

    if (corrections.length === 0) {
      console.log('  ℹ️  No active corrections found for this SD');
      console.log('     SD may resume normally.');
      return { success: true };
    }

    // If multiple corrections, require specific ID
    if (corrections.length > 1 && !correctionId) {
      console.log('  ⚠️  Multiple active corrections found:');
      corrections.forEach((c, i) => {
        console.log(`     ${i + 1}. ${c.id} - ${c.correction_type} (${c.wall_name})`);
      });
      console.log('');
      console.log('  Specify which to complete with: --correction ID');
      return { success: false };
    }

    const targetCorrection = correctionId
      ? corrections.find(c => c.id === correctionId)
      : corrections[0];

    if (!targetCorrection) {
      console.log(`  ❌ Correction not found: ${correctionId}`);
      return { success: false };
    }

    console.log(`  Completing correction: ${targetCorrection.id}`);
    console.log(`  Type: ${targetCorrection.correction_type}`);
    console.log(`  Wall: ${targetCorrection.wall_name} → ${targetCorrection.new_wall_name}`);

    const result = await correctionManager.completeCorrection(targetCorrection.id, {
      notes,
      validationScore: 100
    });

    if (!result.success) {
      console.log(`  ❌ Resume failed: ${result.error}`);
      return { success: false };
    }

    console.log('');
    console.log('  ✅ Correction completed');
    console.log(`     Wall passed: ${result.wallPassed}`);
    console.log(`     Tasks resumed: ${result.resumedTasks}`);
    console.log(`     Completed at: ${result.completedAt}`);
    console.log('');
    console.log('  Work may now resume from where it left off.');
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle failures command - View failure history
 */
export async function handleFailuresCommand(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/handoff.js failures SD-ID');
    console.log('');
    console.log('Shows failure history including kickbacks and corrections.');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Failure History');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log('');

  try {
    // Get kickbacks
    const kickbacks = await kickbackManager.getPendingKickbacks(sdId);
    const hasUnresolved = await kickbackManager.hasUnresolvedKickbacks(sdId);

    console.log('  KICKBACKS');
    console.log('  ' + '-'.repeat(55));

    if (kickbacks.length === 0) {
      console.log('  No kickbacks found');
    } else {
      for (const kb of kickbacks) {
        const statusIcon = {
          [KICKBACK_STATUS.PENDING]: '⏳',
          [KICKBACK_STATUS.IN_PROGRESS]: '🔄',
          [KICKBACK_STATUS.RESOLVED]: '✅',
          [KICKBACK_STATUS.ESCALATED]: '⚠️'
        }[kb.resolution_status] || '❓';

        console.log(`  ${statusIcon} ${kb.from_phase} → ${kb.to_phase}`);
        console.log(`     Reason: ${kb.failure_reason}`);
        console.log(`     Retries: ${kb.retry_count}/${kb.max_retries}`);
        console.log(`     Status: ${kb.resolution_status}`);
        console.log(`     Created: ${new Date(kb.created_at).toLocaleString()}`);
        console.log('');
      }
    }

    // Get corrections
    const corrections = await correctionManager.getCorrectionHistory(sdId);

    console.log('  CORRECTIONS');
    console.log('  ' + '-'.repeat(55));

    if (corrections.length === 0) {
      console.log('  No corrections found');
    } else {
      for (const c of corrections) {
        const statusIcon = c.status === 'completed' ? '✅' : c.status === 'cancelled' ? '❌' : '🔄';

        console.log(`  ${statusIcon} ${c.wall_name} → ${c.new_wall_name}`);
        console.log(`     Type: ${c.correction_type}`);
        console.log(`     Reason: ${c.reason}`);
        console.log(`     Status: ${c.status}`);
        console.log(`     Created: ${new Date(c.created_at).toLocaleString()}`);
        if (c.completed_at) {
          console.log(`     Completed: ${new Date(c.completed_at).toLocaleString()}`);
        }
        console.log('');
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');

    if (hasUnresolved) {
      console.log('');
      console.log('  ⚠️  Unresolved kickbacks exist - progress may be blocked');
    }

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

/**
 * Handle subagents command - View sub-agent status
 */
export async function handleSubagentsCommand(sdId, phase) {
  if (!sdId) {
    console.log('Usage: node scripts/handoff.js subagents SD-ID [PHASE]');
    console.log('');
    console.log('Shows sub-agent execution status for an SD.');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js subagents SD-001');
    console.log('  node scripts/handoff.js subagents SD-001 PLAN');
    return { success: false };
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 Sub-Agent Status');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  if (phase) {
    console.log(`  Phase: ${phase.toUpperCase()}`);
  }
  console.log('');

  try {
    // Get required sub-agents
    const phasesToCheck = phase
      ? [phase.toUpperCase()]
      : ['PLAN', 'EXEC', 'FINAL'];

    for (const p of phasesToCheck) {
      const required = await subAgentOrchestrator.getRequiredSubAgents(sdId, p);

      if (required.all.length === 0) {
        continue;
      }

      console.log(`  ${p} PHASE SUB-AGENTS`);
      console.log('  ' + '-'.repeat(55));

      // Get synthesis readiness
      const synthesis = await subAgentOrchestrator.checkSynthesisReady(sdId, p);

      console.log(`  Required: ${required.required.join(', ') || 'none'}`);
      console.log(`  Recommended: ${required.recommended.join(', ') || 'none'}`);
      console.log(`  Synthesis Ready: ${synthesis.ready ? '✅ YES' : '⏳ NO'}`);

      if (synthesis.completed && synthesis.completed.length > 0) {
        console.log('');
        console.log('  Completed:');
        for (const agent of synthesis.completed) {
          const verdictIcon = agent.verdict === 'PASS' ? '✅' : '❌';
          console.log(`    ${verdictIcon} ${agent.agent} (${agent.verdict})`);
        }
      }

      if (synthesis.pending && synthesis.pending.length > 0) {
        console.log('');
        console.log('  Pending:');
        for (const agent of synthesis.pending) {
          console.log(`    ⏳ ${agent.agent} (${agent.status})`);
        }
      }

      if (synthesis.failed && synthesis.failed.length > 0) {
        console.log('');
        console.log('  Failed:');
        for (const agent of synthesis.failed) {
          console.log(`    ❌ ${agent.agent}: ${agent.error}`);
        }
      }

      console.log('');
    }

    // Get synthesis summary for latest phase with outputs
    if (!phase) {
      console.log('  SYNTHESIS SUMMARIES');
      console.log('  ' + '-'.repeat(55));

      for (const p of phasesToCheck) {
        const summary = await subAgentOrchestrator.getSynthesisSummary(sdId, p);
        if (summary.hasOutputs) {
          console.log(`  ${p}: ${summary.agentCount} agent(s), overall ${summary.overallVerdict}`);
          if (summary.allRecommendations.length > 0) {
            console.log(`     Recommendations: ${summary.allRecommendations.length}`);
          }
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true };

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return { success: false };
  }
}

