#!/usr/bin/env node
/**
 * SD Start - Claim an SD and begin work
 *
 * Usage: npm run sd:start <SD-ID>
 *
 * Actions:
 * 1. Claims the SD for current session (sets is_working_on = true)
 * 2. Displays SD info, current phase, and next recommended action
 *
 * This is the recommended way to start work on an SD outside of
 * the formal handoff workflow.
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import os from 'os';
import dotenv from 'dotenv';
import { getOrCreateSession, updateHeartbeat } from '../lib/session-manager.mjs';
import { resolveOwnSession } from '../lib/resolve-own-session.js';
import { claimGuard, formatClaimFailure } from '../lib/claim-guard.mjs';
import { isSDClaimed } from '../lib/session-conflict-checker.mjs';
import { isProcessRunning } from '../lib/heartbeat-manager.mjs';
import { getEstimatedDuration, formatEstimateDetailed } from './lib/duration-estimator.js';
import { resolve as resolveWorkdir } from './resolve-sd-workdir.js';
import { getNextReadyChild } from './modules/handoff/child-sd-selector.js';
import { checkSDAge, handleTimelineViolation, formatBlockMessage } from './modules/governance/timeline-violation-handler.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Map a phase to the appropriate CLAUDE_*.md context file.
 */
function getPhaseContextFile(phase) {
  if (!phase) return 'CLAUDE_LEAD.md';
  const p = phase.toUpperCase();
  if (p.startsWith('LEAD')) return 'CLAUDE_LEAD.md';
  if (p.startsWith('PLAN') || p.startsWith('PRD')) return 'CLAUDE_PLAN.md';
  if (p.startsWith('EXEC') || p.startsWith('IMPLEMENTATION')) return 'CLAUDE_EXEC.md';
  return 'CLAUDE_LEAD.md';
}

/**
 * Verify handoff integrity for an SD before resuming work.
 * Checks the last handoff in sd_phase_handoffs to ensure it was accepted.
 *
 * @returns {{ valid: boolean, lastHandoff: Object|null, message: string, recoveryOptions: string[] }}
 */
async function verifyHandoffIntegrity(sdUuid) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status, created_at, rejection_reason, resolved_at')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return { valid: true, lastHandoff: null, message: 'Could not query handoffs (proceeding)', recoveryOptions: [] };
  }

  if (!handoffs || handoffs.length === 0) {
    return {
      valid: false,
      lastHandoff: null,
      status: 'missing',
      message: 'No prior handoff found',
      recoveryOptions: [
        'Run the appropriate handoff for this phase',
        'Use --force flag to proceed without handoff verification'
      ]
    };
  }

  const last = handoffs[0];

  if (last.status === 'accepted' || last.status === 'completed') {
    return {
      valid: true,
      lastHandoff: last,
      status: last.status,
      message: `Last handoff: ${last.status} (${last.from_phase} → ${last.to_phase})`,
      recoveryOptions: []
    };
  }

  // Handoff was rejected or failed — but check if it was already resolved
  if (last.resolved_at) {
    return {
      valid: true,
      lastHandoff: last,
      status: 'resolved',
      message: `Last handoff ${last.status} but resolved at ${new Date(last.resolved_at).toLocaleString()} (${last.from_phase} → ${last.to_phase})`,
      recoveryOptions: []
    };
  }

  const reason = last.rejection_reason || 'No reason provided';
  return {
    valid: false,
    lastHandoff: last,
    status: last.status,
    message: `Last handoff ${last.status}: ${last.from_phase} → ${last.to_phase}`,
    reason,
    recoveryOptions: [
      `View handoff details: node -e "..." (handoff ID: ${last.id})`,
      `Re-run the ${last.from_phase} → ${last.to_phase} handoff after addressing issues`,
      'Use --force flag to override and continue (not recommended)'
    ]
  };
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

async function getSDDetails(sdId) {
  // Note: legacy_id column was deprecated and removed - using sd_key instead
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, progress_percentage, is_working_on, sd_type, created_at')
    .or(`sd_key.eq.${sdId},id.eq.${sdId}`)
    .single();

  if (error) {
    return { error: error.message };
  }

  return data;
}

/**
 * Check if an SD is an orchestrator (has children).
 * Returns the list of children if found, empty array otherwise.
 */
async function getOrchestratorChildren(sdKey) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, claiming_session_id, progress_percentage')
    .eq('parent_sd_id', sdKey);

  if (error || !data) return [];
  return data;
}

/**
 * Get the set of session IDs that currently hold an active claim in claude_sessions.
 * A session is "active" if status is 'active' or 'idle' (not released/stale).
 * This is the source of truth — the claiming_session_id on the SD can be stale.
 */
async function getActiveClaimSessionIds() {
  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id')
    .not('sd_id', 'is', null)
    .in('status', ['active', 'idle']);
  return new Set((data || []).map(r => r.session_id));
}

/**
 * Find the first unclaimed child SD that's ready to work on.
 * Uses child-sd-selector for urgency-based sorting, then filters out claimed children.
 *
 * FIX: validates claiming_session_id against active claude_sessions rows.
 * A child with a stale/released claiming_session_id is treated as unclaimed.
 */
async function findUnclaimedChild(parentSdKey) {
  // Use the existing getNextReadyChild which handles urgency sorting and blocker filtering
  const result = await getNextReadyChild(supabase, parentSdKey);

  if (!result.sd) {
    return { child: null, allComplete: result.allComplete, reason: result.reason };
  }

  // Get sessions that genuinely hold an active claim in claude_sessions
  const activeSessionIds = await getActiveClaimSessionIds();

  // A child is truly claimed only if its claiming_session_id maps to an active session
  const isTrulyClaimed = (child) =>
    child.claiming_session_id && activeSessionIds.has(child.claiming_session_id);

  // Check if the selected child is already claimed by another active session
  if (isTrulyClaimed(result.sd)) {
    // The top-priority child is claimed — check all children for an unclaimed one
    const children = await getOrchestratorChildren(parentSdKey);
    const readyChildren = children.filter(c =>
      !isTrulyClaimed(c) &&
      c.status !== 'completed' &&
      c.status !== 'blocked'
    );

    if (readyChildren.length > 0) {
      return { child: readyChildren[0], allComplete: false, reason: 'First unclaimed child' };
    }

    // All children are either truly claimed or not ready
    const allClaimed = children.filter(c => isTrulyClaimed(c) && c.status !== 'completed');
    if (allClaimed.length > 0) {
      return {
        child: null,
        allComplete: false,
        reason: `No ready children: ${allClaimed.length} active`
      };
    }
  }

  return { child: result.sd, allComplete: false, reason: result.reason };
}

async function getNextHandoff(sd) {
  const phase = sd.current_phase || 'LEAD';

  const handoffMap = {
    'LEAD': 'LEAD-TO-PLAN',
    'LEAD_APPROVAL': 'LEAD-TO-PLAN',
    'PLAN': 'PLAN-TO-EXEC',
    'EXEC': 'EXEC-TO-PLAN',
    'PLAN_VERIFY': 'PLAN-TO-LEAD',
    'LEAD_FINAL': 'LEAD-FINAL-APPROVAL'
  };

  return handoffMap[phase] || 'LEAD-TO-PLAN';
}

async function main() {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log(`${colors.red}${colors.bold}Error: SD ID required${colors.reset}`);
    console.log(`\nUsage: ${colors.cyan}npm run sd:start <SD-ID>${colors.reset}`);
    console.log(`\nExample: ${colors.dim}npm run sd:start SD-HARDENING-V2-001C${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.bold}${colors.blue}SD START${colors.reset}`);
  console.log('═'.repeat(50));

  // 1. Get SD details
  const sd = await getSDDetails(sdId);

  if (sd.error) {
    console.log(`${colors.red}Error: ${sd.error}${colors.reset}`);
    process.exit(1);
  }

  if (!sd) {
    console.log(`${colors.red}Error: SD not found: ${sdId}${colors.reset}`);
    process.exit(1);
  }

  let effectiveId = sd.sd_key || sd.id;

  // 1.5. Orchestrator detection — route to child instead of claiming parent
  const explicitChild = process.argv.includes('--child') ? process.argv[process.argv.indexOf('--child') + 1] : null;
  if (!explicitChild) {
    const children = await getOrchestratorChildren(effectiveId);
    if (children.length > 0) {
      console.log(`\n${colors.cyan}🔀 ORCHESTRATOR DETECTED${colors.reset} (${children.length} children)`);
      console.log(`   ${colors.dim}Routing to first unclaimed child instead of claiming orchestrator${colors.reset}`);

      const { child, allComplete, reason } = await findUnclaimedChild(effectiveId);

      if (allComplete) {
        console.log(`\n${colors.green}✅ All children completed${colors.reset}`);
        console.log(`   Run orchestrator completion: node scripts/handoff.js execute PLAN-TO-LEAD ${effectiveId}`);
        console.log('═'.repeat(50));
        process.exit(0);
      }

      if (!child) {
        console.log(`\n${colors.yellow}⚠️  No unclaimed children available: ${reason}${colors.reset}`);

        // Show current child status for visibility
        const claimed = children.filter(c => c.claiming_session_id);
        const completed = children.filter(c => c.status === 'completed');
        console.log(`   Claimed: ${claimed.length} | Completed: ${completed.length} | Total: ${children.length}`);

        if (claimed.length > 0) {
          console.log(`\n${colors.bold}Currently claimed children:${colors.reset}`);
          claimed.forEach(c => {
            console.log(`   ${colors.yellow}🔒${colors.reset} ${c.sd_key} - ${c.title} (${c.current_phase || 'LEAD'})`);
          });
        }

        console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
        console.log('═'.repeat(50));
        process.exit(1);
      }

      // Route to the child — update the SD reference for the rest of the flow
      const childId = child.sd_key || child.id;
      console.log(`\n${colors.green}→ Routing to child: ${childId}${colors.reset}`);
      console.log(`   ${child.title}`);

      // Re-fetch the child SD details for the rest of the flow
      const childSd = await getSDDetails(childId);
      if (childSd.error || !childSd) {
        console.log(`${colors.red}Error fetching child SD: ${childSd?.error || 'not found'}${colors.reset}`);
        process.exit(1);
      }
      Object.assign(sd, childSd);
      effectiveId = childId;
      console.log(`   ${colors.dim}(Orchestrator ${sdId} not claimed — only child ${childId} will be claimed)${colors.reset}`);
    }
  }

  // 1.7. Day-28 blocking age gate (FR-001: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03)
  // Block SDs older than threshold (default 28 days). Chairman override via --force.
  const forceOverride = process.argv.includes('--force');
  const ageCheck = await checkSDAge({
    supabase,
    sdKey: effectiveId,
    sdUuid: sd.id,
    createdAt: sd.created_at,
  });

  if (ageCheck.blocked) {
    const { escalationEventId, priorityBumped } = await handleTimelineViolation({
      supabase,
      sdKey: effectiveId,
      sdUuid: sd.id,
      ageDays: ageCheck.ageDays,
      threshold: ageCheck.threshold,
      currentPriority: sd.priority,
      isOverride: forceOverride,
    });

    if (!forceOverride) {
      console.log(formatBlockMessage({
        sdKey: effectiveId,
        ageDays: ageCheck.ageDays,
        threshold: ageCheck.threshold,
      }));
      if (escalationEventId) {
        console.log(`  ${colors.dim}Escalation event: ${escalationEventId}${colors.reset}`);
      }
      if (priorityBumped) {
        console.log(`  ${colors.yellow}Priority bumped to CRITICAL${colors.reset}`);
      }
      process.exit(1);
    } else {
      console.log(`\n  ${colors.yellow}⚠️  CHAIRMAN OVERRIDE: SD age ${ageCheck.ageDays}d > ${ageCheck.threshold}d threshold${colors.reset}`);
      console.log(`  ${colors.dim}Override logged to eva_orchestration_events${colors.reset}`);
      if (escalationEventId) {
        console.log(`  ${colors.dim}Event: ${escalationEventId}${colors.reset}`);
      }
    }
  }

  // 2. Get existing session by terminal_id first, then fall back to creating new one.
  // After context compaction, the old session's DB row still exists with the same
  // terminal_id — reuse it instead of creating a duplicate.
  let session = null;
  try {
    const resolved = await resolveOwnSession(supabase, {
      select: 'session_id, sd_id, status, heartbeat_at, terminal_id',
      warnOnFallback: false
    });
    if (resolved.data && resolved.source !== 'heartbeat_fallback') {
      session = resolved.data;
      console.log(`${colors.dim}(Reusing session ${session.session_id} via ${resolved.source})${colors.reset}`);
    }
  } catch { /* fall through */ }

  if (!session) {
    session = await getOrCreateSession();
  }

  if (!session) {
    console.log(`${colors.red}Error: Could not create session${colors.reset}`);
    process.exit(1);
  }

  // 2b. Check adopted session (heartbeat guard adopted the existing session)
  // When adopted=true, we're reusing the main Claude process's session (same terminal).
  // This is normal for child processes like sd-start.js.
  if (session.adopted) {
    if (session.adopted_sd_id && session.adopted_sd_id === effectiveId) {
      console.log(`\n${colors.yellow}Note: Session already working on ${effectiveId}, refreshing claim...${colors.reset}`);
    } else if (session.adopted_sd_id) {
      console.log(`\n${colors.yellow}Note: Session currently working on ${session.adopted_sd_id}, switching to ${effectiveId}${colors.reset}`);
    }
  }

  // 3. SD-LEO-INFRA-CLAIM-GUARD-001: Use centralized claimGuard
  const claimResult = await claimGuard(effectiveId, session.session_id);

  if (!claimResult.success) {
    console.log(formatClaimFailure(claimResult));

    // PID-based liveness check for enhanced diagnostics (same machine only)
    let autoReleased = false;
    if (claimResult.owner) {
      const sameHost = claimResult.owner.hostname === os.hostname();
      // Extract PID from session ID if available (format: win-cc-{ssePort}-{pid})
      const pidMatch = claimResult.owner.session_id?.match(/-(\d+)$/);
      const ownerPid = pidMatch ? parseInt(pidMatch[1]) : null;

      if (sameHost && ownerPid) {
        const pidAlive = isProcessRunning(ownerPid);
        if (pidAlive) {
          console.log(`\n${colors.red}${colors.bold}🔒 PROCESS IS RUNNING (PID: ${ownerPid})${colors.reset}`);
          console.log(`${colors.red}   Another Claude Code instance is actively using this SD.${colors.reset}`);
        } else {
          console.log(`\n${colors.green}${colors.bold}💀 PROCESS EXITED (PID: ${ownerPid} is dead) — auto-releasing orphaned claim${colors.reset}`);

          // Auto-release the orphaned claim and retry
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claimResult.owner.session_id,
            p_reason: 'manual'
          });

          if (releaseError) {
            console.log(`${colors.yellow}   ⚠️  Auto-release failed: ${releaseError.message}${colors.reset}`);
          } else {
            console.log(`${colors.green}   ✅ Orphaned claim released. Retrying...${colors.reset}`);
            autoReleased = true;
          }
        }
      }
    }

    if (autoReleased) {
      // Retry the claim after releasing the orphaned session
      const retryResult = await claimGuard(effectiveId, session.session_id);
      if (retryResult.success) {
        console.log(`${colors.green}   ✅ Claim acquired on retry${colors.reset}`);
        // Replace claimResult for downstream use
        Object.assign(claimResult, retryResult);
      } else {
        console.log(`${colors.red}   ❌ Retry failed: ${retryResult.error}${colors.reset}`);
        console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
        console.log('═'.repeat(50));
        process.exit(1);
      }
    } else {
      console.log(`\n${colors.bold}Action:${colors.reset} Pick a different SD with ${colors.cyan}npm run sd:next${colors.reset}`);
      console.log('═'.repeat(50));
      process.exit(1);
    }
  }

  // 4. Cross-path verification via v_active_sessions VIEW (independent of direct table query)
  // Non-blocking: logs warning on mismatch, doesn't abort (view can lag behind direct table)
  try {
    const viewCheck = await isSDClaimed(effectiveId, session.session_id);
    if (viewCheck.claimed) {
      console.log(`${colors.yellow}[Verify] ⚠️  Cross-path mismatch: v_active_sessions shows ${effectiveId} claimed by ${viewCheck.claimedBy}${colors.reset}`);
      console.log(`${colors.dim}   (View may lag — direct table query took precedence)${colors.reset}`);
    } else if (viewCheck.queryFailed) {
      console.log(`${colors.dim}[Verify] View query failed (non-blocking): ${viewCheck.error}${colors.reset}`);
    } else {
      console.log(`${colors.green}[Verify] Independent claim verification passed${colors.reset}`);
    }
  } catch {
    // Non-blocking — cross-path verification is defense-in-depth
  }

  // 4.5. Resolve worktree (creates if needed in claim mode)
  let worktreeInfo = null;
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: 'pipe'
    }).trim();
    worktreeInfo = await resolveWorkdir(effectiveId, 'claim', repoRoot);
  } catch {
    // Worktree resolution is optional - don't block SD start
  }

  // 5. Display SD info
  console.log(`\n${colors.green}✓ SD claimed successfully (${claimResult.claim.status})${colors.reset}`);
  console.log(`\n${colors.bold}SD: ${effectiveId}${colors.reset}`);
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Phase: ${sd.current_phase || 'LEAD'}`);
  console.log(`Progress: ${sd.progress_percentage || 0}%`);
  console.log(`Type: ${sd.sd_type || 'feature'}`);
  console.log(`claiming_session_id: ${colors.green}${session.session_id}${colors.reset}`);

  // 5.1. Show worktree info + machine-readable activation directive
  if (worktreeInfo?.success && worktreeInfo.worktree?.exists) {
    console.log(`\n${colors.bold}Worktree:${colors.reset}`);
    console.log(`   Path:   ${colors.cyan}${worktreeInfo.cwd}${colors.reset}`);
    console.log(`   Branch: ${worktreeInfo.worktree.branch || 'unknown'}`);
    console.log(`   Source: ${worktreeInfo.source}${worktreeInfo.worktree.created ? ' (newly created)' : ''}`);
    // Machine-readable directive for agent consumption (PAT-WORKTREE-LIFECYCLE-001)
    console.log(`\n>>> WORKTREE_CWD=${worktreeInfo.cwd}`);
  }

  // 5.5. Show duration estimate
  try {
    // Note: legacy_id was deprecated - using sd_key instead
    const { data: sdFull } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_type, category, priority')
      .eq('sd_key', effectiveId)
      .single();

    if (sdFull) {
      const estimate = await getEstimatedDuration(supabase, sdFull);
      console.log(`\n${colors.bold}Duration Estimate:${colors.reset}`);
      const lines = formatEstimateDetailed(estimate);
      lines.forEach(line => {
        if (line.startsWith('  •')) {
          console.log(`${colors.dim}${line}${colors.reset}`);
        } else if (line === '') {
          console.log();
        } else {
          console.log(`   ${line}`);
        }
      });
    }
  } catch {
    // Silent fail - estimate is optional
  }

  // 6. Handoff integrity verification (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const forceResume = process.argv.includes('--force');
  const handoffCheck = await verifyHandoffIntegrity(sd.id);

  if (handoffCheck.valid) {
    if (handoffCheck.lastHandoff) {
      console.log(`\n${colors.green}✓ ${handoffCheck.message}${colors.reset}`);
      console.log(`   ${colors.dim}Handoff ID: ${handoffCheck.lastHandoff.id} | ${new Date(handoffCheck.lastHandoff.created_at).toLocaleString()}${colors.reset}`);
    }
  } else if (handoffCheck.status === 'missing' && (sd.current_phase === 'LEAD' || sd.current_phase === 'LEAD_APPROVAL')) {
    // No handoff expected for fresh LEAD phase SDs
    console.log(`\n${colors.dim}ℹ  No prior handoffs (expected for LEAD phase)${colors.reset}`);
  } else if (!forceResume) {
    console.log(`\n${colors.red}❌ HANDOFF INTEGRITY CHECK FAILED${colors.reset}`);
    console.log(`   ${colors.bold}Status:${colors.reset} ${handoffCheck.status}`);
    console.log(`   ${colors.bold}Detail:${colors.reset} ${handoffCheck.message}`);
    if (handoffCheck.reason) {
      console.log(`   ${colors.bold}Reason:${colors.reset} ${handoffCheck.reason}`);
    }
    if (handoffCheck.lastHandoff) {
      console.log(`   ${colors.bold}Handoff ID:${colors.reset} ${handoffCheck.lastHandoff.id}`);
    }
    console.log(`\n${colors.yellow}Recovery Options:${colors.reset}`);
    handoffCheck.recoveryOptions.forEach((opt, i) => {
      console.log(`   ${i + 1}. ${opt}`);
    });
    console.log(`\n${colors.dim}Use --force to override this check${colors.reset}`);
    console.log('═'.repeat(50));
    process.exit(1);
  } else {
    console.log(`\n${colors.yellow}⚠️  Handoff integrity: ${handoffCheck.message} (--force override)${colors.reset}`);
  }

  // 6.5. Phase-appropriate context file (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
  const contextFile = getPhaseContextFile(sd.current_phase);
  console.log(`\n${colors.bold}Load context:${colors.reset} ${colors.cyan}${contextFile}${colors.reset}`);

  // 6.7. Handoff count warning (SD-LEO-INFRA-SESSION-COMPACTION-CLAIM-001)
  // Warns when claiming an SD with extensive prior work — possible compacted session
  try {
    const { data: handoffRows } = await supabase
      .from('sd_phase_handoffs')
      .select('id', { count: 'exact', head: false })
      .eq('sd_id', sd.id);
    const handoffCount = handoffRows?.length || 0;
    if (handoffCount >= 3) {
      console.log(`\n${colors.yellow}⚠️  PRIOR WORK WARNING: This SD has ${handoffCount} prior handoffs.${colors.reset}`);
      console.log(`${colors.dim}   Another session may have been working on this before context compaction.${colors.reset}`);
      console.log(`${colors.dim}   Check for local worktree: .worktrees/${effectiveId}${colors.reset}`);
    }
  } catch {
    // Non-blocking — handoff count warning is advisory
  }

  // 7. Show warnings if any
  if (claimResult.warnings?.length > 0) {
    console.log(`\n${colors.yellow}Warnings:${colors.reset}`);
    claimResult.warnings.forEach(w => {
      console.log(`   ⚠️  ${w.message}`);
    });
  }

  // 8. Show next action
  const nextHandoff = await getNextHandoff(sd);

  console.log(`\n${colors.bold}Next Action:${colors.reset}`);
  console.log(`   ${colors.cyan}node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);

  console.log(`\n${colors.dim}Session: ${session.session_id}${colors.reset}`);
  console.log('═'.repeat(50));
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
