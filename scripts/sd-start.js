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

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { execSync } from 'child_process';
import os from 'os';
import dotenv from 'dotenv';
import { getOrCreateSession, updateHeartbeat } from '../lib/session-manager.mjs';
import { resolveOwnSession } from '../lib/resolve-own-session.js';
import { assertValidClaim, ClaimIdentityError } from '../lib/claim-validity-gate.js';
import { claimGuard, formatClaimFailure } from '../lib/claim-guard.mjs';
import { isSDClaimed } from '../lib/session-conflict-checker.mjs';
import { isProcessRunning } from '../lib/heartbeat-manager.mjs';
import { getEstimatedDuration, formatEstimateDetailed } from './lib/duration-estimator.js';
import { resolve as resolveWorkdir } from './resolve-sd-workdir.js';
import { classifyWorktreeError } from '../lib/worktree-manager.js';
import { getNextReadyChild } from './modules/handoff/child-sd-selector.js';
import { checkSDAge, handleTimelineViolation, formatBlockMessage } from './modules/governance/timeline-violation-handler.js';

dotenv.config();

const supabase = createSupabaseServiceClient();

const MAX_FALLBACK_ATTEMPTS = 3;

/**
 * Display fleet roster — all active sessions with their claimed SDs and heartbeat ages.
 * SD-FLEETAWARE-SESSION-IDENTITY-HARDENING-ORCH-001-A
 */
async function displayFleetRoster() {
  try {
    const { data: sessions } = await supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, pid')
      .in('computed_status', ['active', 'idle', 'stale']);

    if (!sessions || sessions.length === 0) {
      console.log(`\n${colors.dim}  No active fleet sessions${colors.reset}`);
      return;
    }

    console.log(`\n${colors.bold}📡 Fleet Roster (${sessions.length} session${sessions.length !== 1 ? 's' : ''}):${colors.reset}`);
    for (const s of sessions) {
      const shortId = s.session_id.substring(0, 12);
      const hbAge = s.heartbeat_age_human || formatHbAge(s.heartbeat_age_seconds);
      const staleTag = (s.heartbeat_age_seconds || 0) > 900 ? ` ${colors.red}STALE${colors.reset}` : '';
      const sdLabel = s.sd_key
        ? `→ ${s.sd_title || s.sd_key}`
        : `${colors.dim}(idle)${colors.reset}`;
      console.log(`   ${shortId}  ${hbAge}${staleTag}  ${sdLabel}`);
    }
  } catch {
    // Non-blocking — roster display is informational
  }
}

function formatHbAge(seconds) {
  if (!seconds || seconds < 0) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

/**
 * Check if auto-proceed is active for the current session.
 * Returns true by default (auto-proceed is ON unless explicitly disabled).
 */
async function getSessionAutoProceed(sessionId) {
  try {
    const { data } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .single();
    return data?.metadata?.auto_proceed ?? true;
  } catch {
    return true; // Default ON
  }
}

/**
 * Get the next workable SD from the queue, excluding specified SD keys.
 * Returns { sdKey, title, phase } or null if no workable SDs remain.
 *
 * SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Used by auto-fallback when claim conflicts occur.
 */
async function getNextWorkableSD(excludeKeys = []) {
  // Get all active sessions to identify claimed SDs
  const { data: activeSessions } = await supabase
    .from('claude_sessions')
    .select('sd_key')
    .not('sd_key', 'is', null)
    .in('status', ['active', 'idle']);

  const claimedSdKeys = new Set((activeSessions || []).map(s => s.sd_key));

  // Query for workable SDs: not completed, not cancelled, not blocked
  const { data: candidates } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, current_phase, status, priority, progress_percentage')
    .in('status', ['draft', 'active', 'planning', 'ready', 'in_progress'])
    .not('sd_key', 'is', null)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (!candidates || candidates.length === 0) return null;

  // Filter: exclude specified keys, exclude claimed SDs, exclude blocked
  for (const sd of candidates) {
    if (excludeKeys.includes(sd.sd_key)) continue;
    if (claimedSdKeys.has(sd.sd_key)) continue;
    return { sdKey: sd.sd_key, title: sd.title, phase: sd.current_phase };
  }

  return null;
}

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
    .select('id, sd_key, from_phase, to_phase, status, created_at, rejection_reason, resolved_at')
    .eq('sd_key', sdUuid)
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
    .select('id, sd_key, title, status, current_phase, priority, progress_percentage, is_working_on, sd_type, created_at, target_application, venture_id')
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
 *
 * FIX: parent_sd_id stores the UUID `id`, not `sd_key`. Query by both
 * to handle both legacy (id === sd_key) and modern (id is UUID) SDs.
 */
async function getOrchestratorChildren(sdKeyOrId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, priority, claiming_session_id, progress_percentage, sd_type')
    .or(`parent_sd_id.eq.${sdKeyOrId}`);

  if (error || !data || data.length === 0) {
    // If sdKeyOrId was a sd_key, resolve its UUID id and retry
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('sd_key', sdKeyOrId)
      .single();

    if (parent && parent.id !== sdKeyOrId) {
      const { data: children, error: childErr } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, status, current_phase, priority, claiming_session_id, progress_percentage, sd_type')
        .eq('parent_sd_id', parent.id);

      if (!childErr && children) return children;
    }
    return data || [];
  }
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
    .not('sd_key', 'is', null)
    .in('status', ['active', 'idle']);
  return new Set((data || []).map(r => r.session_id));
}

/**
 * Recursively find a leaf-level (non-orchestrator) work item from an orchestrator hierarchy.
 * Traverses orchestrator → sub-orchestrator → ... → leaf SD.
 *
 * When a child is itself an orchestrator (sd_type === 'orchestrator' or has children),
 * recurse into it instead of claiming it directly. This ensures that `sd:start` on a
 * top-level orchestrator drills down to the actual grandchild that needs work.
 *
 * @param {string} parentSdKey - The orchestrator SD key to search from
 * @param {number} depth - Current recursion depth (safety limit)
 * @param {string[]} routingPath - Accumulated routing path for display
 * @returns {Promise<{child: object|null, allComplete: boolean, reason: string, routingPath: string[]}>}
 */
async function findLeafWorkItem(parentSdKey, depth = 0, routingPath = []) {
  const MAX_DEPTH = 5; // Safety limit for deeply nested orchestrators

  if (depth >= MAX_DEPTH) {
    return {
      child: null,
      allComplete: false,
      reason: `Max orchestrator nesting depth (${MAX_DEPTH}) exceeded`,
      routingPath
    };
  }

  const { child, allComplete, reason } = await findUnclaimedChild(parentSdKey);

  if (!child) {
    return { child: null, allComplete, reason, routingPath };
  }

  const childKey = child.sd_key || child.id;
  const updatedPath = [...routingPath, childKey];

  // Check if this child is itself an orchestrator (has its own children)
  const grandchildren = await getOrchestratorChildren(childKey);

  if (grandchildren.length > 0) {
    // Sub-orchestrator detected — check if all its children are done
    const allGrandchildrenComplete = grandchildren.every(gc => gc.status === 'completed');

    if (allGrandchildrenComplete) {
      // Sub-orchestrator needs its own completion handoff — return it as the work item
      return {
        child,
        allComplete: false,
        reason: `Sub-orchestrator ${childKey}: all ${grandchildren.length} children completed — needs completion handoff`,
        routingPath: updatedPath
      };
    }

    // Recurse into the sub-orchestrator to find a leaf grandchild
    console.log(`   ${colors.cyan}↳ ${childKey} is a sub-orchestrator (${grandchildren.length} children) — drilling deeper...${colors.reset}`);
    return findLeafWorkItem(childKey, depth + 1, updatedPath);
  }

  // Leaf-level SD found
  return { child, allComplete: false, reason, routingPath: updatedPath };
}

/**
 * Find the first unclaimed child SD that's ready to work on.
 * Uses child-sd-selector for urgency-based sorting, then filters out claimed children.
 *
 * FIX: validates claiming_session_id against active claude_sessions rows.
 * A child with a stale/released claiming_session_id is treated as unclaimed.
 */
async function findUnclaimedChild(parentSdKey) {
  // FIX: parent_sd_id stores UUID `id`, not sd_key.
  // Resolve sd_key → UUID id so getNextReadyChild and getOrchestratorChildren
  // can query parent_sd_id correctly.
  let parentId = parentSdKey;
  const { data: parentRow } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', parentSdKey)
    .single();
  if (parentRow) {
    parentId = parentRow.id;
  }

  // Use the existing getNextReadyChild which handles urgency sorting and blocker filtering
  const result = await getNextReadyChild(supabase, parentId);

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

  // 1.1 SD-LEO-INFRA-CONDITIONAL-QUEUE-GOVERNANCE-001: Reject claims on deferred SDs
  if (sd.metadata?.do_not_advance_without_trigger === true) {
    console.log(`\n${colors.red}❌ SD is DEFERRED — cannot be claimed${colors.reset}`);
    console.log('   This SD has a governance gate: do_not_advance_without_trigger=true');
    if (sd.metadata?.trigger_condition) {
      const tc = sd.metadata.trigger_condition;
      console.log(`\n   ${colors.cyan}Trigger condition:${colors.reset}`);
      console.log(`   Type: ${tc.type || 'unknown'}`);
      console.log(`   Threshold: ${tc.threshold || 'unknown'}`);
      if (tc.decision_venue) console.log(`   Decision venue: ${tc.decision_venue}`);
      if (tc.chairman_decision_required) console.log(`   ${colors.yellow}Chairman decision required${colors.reset}`);
    }
    if (sd.metadata?.auto_cancel_after_days) {
      console.log(`   Auto-cancel: ${sd.metadata.auto_cancel_after_days} days from creation`);
    }
    console.log(`\n   ${colors.dim}This SD will be promoted automatically when trigger conditions are met via EVA Friday.${colors.reset}`);
    process.exit(1);
  }

  // 1.5. Orchestrator detection — route to child instead of claiming parent
  const explicitChild = process.argv.includes('--child') ? process.argv[process.argv.indexOf('--child') + 1] : null;
  if (!explicitChild) {
    const children = await getOrchestratorChildren(effectiveId);
    if (children.length > 0) {
      console.log(`\n${colors.cyan}🔀 ORCHESTRATOR DETECTED${colors.reset} (${children.length} children)`);
      console.log(`   ${colors.dim}Routing to leaf-level work item (recursive through sub-orchestrators)${colors.reset}`);

      const { child, allComplete, reason, routingPath } = await findLeafWorkItem(effectiveId);

      if (allComplete) {
        // Ensure session row exists before exit — handoff.js needs it for claim validity gate.
        // Without this, the orchestrator completion handoff fails with no_deterministic_identity.
        try {
          const resolved = await resolveOwnSession(supabase, {
            select: 'session_id',
            warnOnFallback: false,
            requireDeterministic: true
          });
          if (!resolved.data) {
            const newSession = await getOrCreateSession();
            if (newSession) {
              console.log(`${colors.dim}(Session created: ${newSession.session_id})${colors.reset}`);
            }
          }
        } catch { /* non-fatal — handoff will surface the error */ }

        console.log(`\n${colors.green}✅ All children completed${colors.reset}`);
        console.log(`   Run orchestrator completion: node scripts/handoff.js execute PLAN-TO-LEAD ${effectiveId}`);
        console.log('═'.repeat(50));
        process.exit(0);
      }

      if (!child) {
        console.log(`\n${colors.yellow}⚠️  No unclaimed leaf work items available${colors.reset}`);
        console.log(`   ${colors.dim}Reason: ${reason}${colors.reset}`);

        if (routingPath && routingPath.length > 0) {
          console.log(`   ${colors.dim}Routing reached: ${routingPath.join(' → ')}${colors.reset}`);
        }

        // Show current top-level child status for visibility
        const claimed = children.filter(c => c.claiming_session_id);
        const completed = children.filter(c => c.status === 'completed');
        console.log(`\n   ${colors.bold}Top-level children:${colors.reset} Claimed: ${claimed.length} | Completed: ${completed.length} | Total: ${children.length}`);

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

      // Route to the leaf work item — update the SD reference for the rest of the flow
      const childId = child.sd_key || child.id;

      // Show routing path if we traversed through sub-orchestrators
      if (routingPath && routingPath.length > 1) {
        console.log(`\n${colors.green}→ Routing path (${routingPath.length} levels deep):${colors.reset}`);
        routingPath.forEach((key, i) => {
          const indent = '  '.repeat(i + 1);
          const arrow = i < routingPath.length - 1 ? `${colors.cyan}↳${colors.reset}` : `${colors.green}★${colors.reset}`;
          console.log(`   ${indent}${arrow} ${key}`);
        });
      } else {
        console.log(`\n${colors.green}→ Routing to child: ${childId}${colors.reset}`);
      }
      console.log(`   ${child.title}`);

      // Re-fetch the child SD details for the rest of the flow
      const childSd = await getSDDetails(childId);
      if (childSd.error || !childSd) {
        console.log(`${colors.red}Error fetching child SD: ${childSd?.error || 'not found'}${colors.reset}`);
        process.exit(1);
      }
      Object.assign(sd, childSd);
      effectiveId = childId;
      console.log(`   ${colors.dim}(Orchestrator ${sdId} not claimed — only leaf ${childId} will be claimed)${colors.reset}`);
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

  // 2. Ensure session row exists BEFORE claim validation.
  // SD-MAN-INFRA-SESSION-IDENTITY-BIRTH-001: The fail-closed gate (assertValidClaim)
  // requires a claude_sessions row to match against. Previously, getOrCreateSession()
  // ran AFTER assertValidClaim(), so new sessions always failed with
  // no_deterministic_identity. Fix: resolve or create the session first, then validate.
  let session = null;
  try {
    const resolved = await resolveOwnSession(supabase, {
      select: 'session_id, sd_key, status, heartbeat_at, terminal_id',
      warnOnFallback: false,
      requireDeterministic: true
    });
    // SD-MAN-INFRA-PARSE-SESSIONSTART-CLAUDE-001: Only accept env_var and marker_file.
    // terminal_id is non-deterministic (shared SSE port across CC Desktop windows).
    if (resolved.data && (resolved.source === 'env_var' || resolved.source === 'marker_file')) {
      session = resolved.data;
      const ccPid = resolved.data?.metadata?.cc_pid || process.pid;
      console.log(`${colors.dim}(Identity: source=${resolved.source} session=${session.session_id} cc_pid=${ccPid})${colors.reset}`);
    }
  } catch { /* fall through — will create new session */ }

  if (!session) {
    session = await getOrCreateSession();
  }

  // 2a. Validate claim identity + ownership now that session row exists.
  // SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001: Invoke the fail-closed gate so cross-CC collisions
  // are surfaced with a structured error instead of silently merged via "newest heartbeat".
  // allowMainRepoForAcquisition=true because sd-start is the one operation legitimately
  // allowed to run from the main repo (it creates the worktree).
  try {
    await assertValidClaim(supabase, effectiveId, {
      operation: 'sd_start',
      allowMainRepoForAcquisition: true
    });
  } catch (e) {
    if (e instanceof ClaimIdentityError) {
      console.error(e.toBanner());
      await displayFleetRoster();
      process.exit(2);
    }
    throw e;
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
  // SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Auto-fallback on claim conflict
  const autoProceed = await getSessionAutoProceed(session.session_id);
  const fallbackEnabled = autoProceed || process.argv.includes('--fallback');
  let claimResult = await claimGuard(effectiveId, session.session_id, { autoFallback: fallbackEnabled });
  const skippedSDs = [];

  if (!claimResult.success) {
    // SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-001: Heartbeat TTL check (cross-machine compatible)
    // Releases claims from sessions whose heartbeat is >30 minutes stale, regardless of PID visibility.
    let autoReleased = false;
    const CLAIM_TTL_MS = 30 * 60 * 1000; // 30 minutes
    if (claimResult.owner?.session_id) {
      const { data: ownerSession } = await supabase
        .from('claude_sessions')
        .select('heartbeat_at, status')
        .eq('session_id', claimResult.owner.session_id)
        .maybeSingle();

      const heartbeatAge = ownerSession?.heartbeat_at
        ? Date.now() - new Date(ownerSession.heartbeat_at).getTime()
        : Infinity;
      const isStale = heartbeatAge > CLAIM_TTL_MS;
      const isInactive = !ownerSession || ownerSession.status !== 'active';

      if (isStale || isInactive) {
        const ageMin = Math.round(heartbeatAge / 60000);
        const reason = isInactive ? 'session inactive' : `heartbeat stale (${ageMin}m)`;
        console.log(`[claimGuard] ${reason} for ${claimResult.owner.session_id} — auto-releasing claim on ${effectiveId}`);
        const { error: releaseError } = await supabase.rpc('release_sd', {
          p_session_id: claimResult.owner.session_id,
          p_reason: 'ttl_expired'
        });
        if (!releaseError) {
          console.log(`${colors.green}   ✅ TTL-expired claim released. Retrying...${colors.reset}`);
          autoReleased = true;
        }
      }
    }

    // PID-based liveness check for enhanced diagnostics (same machine only)
    if (!autoReleased && claimResult.owner) {
      const sameHost = claimResult.owner.hostname === os.hostname();
      const pidMatch = claimResult.owner.session_id?.match(/-(\d+)$/);
      const ownerPid = pidMatch ? parseInt(pidMatch[1]) : null;

      if (sameHost && ownerPid) {
        const pidAlive = isProcessRunning(ownerPid);
        if (pidAlive) {
          console.log(`\n${colors.yellow}🔒 ${effectiveId} claimed by active process (PID: ${ownerPid})${colors.reset}`);
        } else {
          console.log(`\n${colors.green}💀 PROCESS EXITED (PID: ${ownerPid} is dead) — auto-releasing orphaned claim${colors.reset}`);
          const { error: releaseError } = await supabase.rpc('release_sd', {
            p_session_id: claimResult.owner.session_id,
            p_reason: 'manual'
          });

          if (!releaseError) {
            console.log(`${colors.green}   ✅ Orphaned claim released. Retrying...${colors.reset}`);
            autoReleased = true;
          }
        }
      }
    }

    if (autoReleased) {
      claimResult = await claimGuard(effectiveId, session.session_id);
      if (claimResult.success) {
        console.log(`${colors.green}   ✅ Claim acquired on retry${colors.reset}`);
      }
    }

    // SD-LEO-INFRA-PRE-CLAIM-CHECK-001: Auto-fallback to next workable SD
    if (!claimResult.success && fallbackEnabled) {
      skippedSDs.push({ sdKey: effectiveId, reason: claimResult.error, owner: claimResult.owner?.session_id });
      console.log(`\n${colors.cyan}🔄 AUTO-FALLBACK: ${effectiveId} is claimed — searching for next workable SD...${colors.reset}`);

      const excludeKeys = [effectiveId];
      let fallbackAttempt = 0;
      let fallbackSuccess = false;

      while (fallbackAttempt < MAX_FALLBACK_ATTEMPTS) {
        fallbackAttempt++;
        const nextSD = await getNextWorkableSD(excludeKeys);

        if (!nextSD) {
          console.log(`${colors.yellow}   ⚠️  No more workable SDs in queue (attempt ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS})${colors.reset}`);
          break;
        }

        console.log(`${colors.dim}   Attempt ${fallbackAttempt}/${MAX_FALLBACK_ATTEMPTS}: Trying ${nextSD.sdKey} — ${nextSD.title}${colors.reset}`);
        claimResult = await claimGuard(nextSD.sdKey, session.session_id, { autoFallback: true });

        if (claimResult.success) {
          // Update effectiveId and SD details to the fallback SD
          effectiveId = nextSD.sdKey;
          const fallbackSd = await getSDDetails(nextSD.sdKey);
          if (fallbackSd && !fallbackSd.error) {
            Object.assign(sd, fallbackSd);
          }
          fallbackSuccess = true;
          console.log(`${colors.green}   ✅ Claimed fallback SD: ${nextSD.sdKey}${colors.reset}`);
          break;
        }

        skippedSDs.push({ sdKey: nextSD.sdKey, reason: claimResult.error, owner: claimResult.owner?.session_id });
        excludeKeys.push(nextSD.sdKey);
        console.log(`${colors.yellow}   ⚠️  ${nextSD.sdKey} also claimed — skipping${colors.reset}`);
      }

      if (!fallbackSuccess) {
        console.log(`\n${colors.red}${colors.bold}❌ AUTO-FALLBACK EXHAUSTED${colors.reset}`);
        console.log(`   Attempted ${skippedSDs.length} SD(s), all claimed or unavailable:`);
        skippedSDs.forEach(s => {
          console.log(`   ${colors.dim}• ${s.sdKey} — ${s.reason}${s.owner ? ` (by ${s.owner})` : ''}${colors.reset}`);
        });
        await displayFleetRoster();
        console.log(`\n${colors.bold}Action:${colors.reset} Wait for a session to release, or run ${colors.cyan}npm run sd:next${colors.reset} to review the queue.`);
        console.log('═'.repeat(50));
        process.exit(1);
      }

      // Show summary of skipped SDs
      if (skippedSDs.length > 0) {
        console.log(`\n${colors.cyan}📋 Fallback Summary:${colors.reset}`);
        skippedSDs.forEach(s => {
          console.log(`   ${colors.dim}⏭️  Skipped ${s.sdKey} — ${s.reason}${colors.reset}`);
        });
      }
    } else if (!claimResult.success) {
      // Non-fallback path: show error and exit (original behavior)
      console.log(formatClaimFailure(claimResult));
      await displayFleetRoster();
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
  // SD-LEO-INFRA-AUTO-WORKTREE-START-001: single entry point for worktree creation
  let worktreeInfo = null;
  try {
    const repoRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: 'pipe'
    }).trim();
    worktreeInfo = await resolveWorkdir(effectiveId, 'claim', repoRoot);
    if (worktreeInfo && !worktreeInfo.success) {
      // SD-MULTISESSION-WORKTREE-SAFETY-ATOMIC-ORCH-001-C: Hard-fail on worktree failure
      // instead of silently continuing on main (which caused data loss from wrong-branch commits)
      const detail = worktreeInfo.error || worktreeInfo.errorCode || 'unknown';
      const { hint } = classifyWorktreeError(detail);
      console.error(`${colors.red}   ❌  Worktree creation failed: ${detail}${colors.reset}`);
      if (hint) console.error(`${colors.yellow}   💡  ${hint}${colors.reset}`);
      console.error(`${colors.red}   Cannot proceed without worktree isolation. Pick a different SD or resolve the conflict.${colors.reset}`);
      process.exit(1);
    }
  } catch (wtErr) {
    // SD-MULTISESSION-WORKTREE-SAFETY-ATOMIC-ORCH-001-C: Hard-fail on worktree error
    const { hint } = classifyWorktreeError(wtErr.message);
    console.error(`${colors.red}   ❌  Worktree resolution error: ${wtErr.message}${colors.reset}`);
    if (hint) console.error(`${colors.yellow}   💡  ${hint}${colors.reset}`);
    console.error(`${colors.red}   Cannot proceed without worktree isolation. Pick a different SD or resolve the conflict.${colors.reset}`);
    process.exit(1);
  }

  // 4.9. SD-LEO-INFRA-HANDOFF-INTEGRITY-RECOVERY-001: Pre-claim health check
  // Verify handoff chain integrity before proceeding
  try {
    const phase = sd.current_phase || 'LEAD';
    const PHASE_REQUIRES = {
      PLAN_PRD: { from: 'LEAD', to: 'PLAN' },
      PLAN: { from: 'LEAD', to: 'PLAN' },
      EXEC: { from: 'PLAN', to: 'EXEC' },
      EXEC_ACTIVE: { from: 'PLAN', to: 'EXEC' },
      EXEC_COMPLETE: { from: 'PLAN', to: 'EXEC' },
    };
    const req = PHASE_REQUIRES[phase];
    if (req) {
      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('from_phase, to_phase, status')
        .eq('sd_key', sd.id)
        .eq('status', 'accepted');
      const hasRequired = (handoffs || []).some(h => h.from_phase === req.from && h.to_phase === req.to);
      if (!hasRequired) {
        console.log(`\n${colors.bgYellow}${colors.bold} STUCK SD WARNING ${colors.reset}`);
        console.log(`   ${colors.yellow}SD is in phase ${phase} but has no accepted ${req.from}→${req.to} handoff${colors.reset}`);
        console.log('   This SD may have a broken handoff chain.');
        console.log(`   ${colors.cyan}Run: npm run sd:recover -- ${effectiveId} --fix${colors.reset}`);
        console.log('');
      }
    }
  } catch (e) {
    // Non-fatal: health check failure should not block claiming
    console.debug('[sd-start] Health check error:', e?.message || e);
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

  // 5.05. SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Set venture context on claim
  // When an SD has target_application or venture_id, propagate to session metadata
  if (sd.target_application && sd.target_application !== 'EHG_Engineer') {
    try {
      const { VentureContextManager } = await import('../lib/eva/venture-context-manager.js');
      const vcm = new VentureContextManager({ supabaseClient: supabase });
      if (sd.venture_id) {
        await vcm.setActiveVenture(sd.venture_id);
        console.log(`\n${colors.cyan}   🏢 Venture context set: ${sd.target_application} (from SD venture_id)${colors.reset}`);
      } else {
        // Store target_application in session metadata even without venture_id
        await supabase.from('claude_sessions')
          .update({ metadata: supabase.rpc ? undefined : { active_target_application: sd.target_application } })
          .eq('session_id', session.session_id);
        console.log(`\n${colors.cyan}   🏢 Target application: ${sd.target_application}${colors.reset}`);
      }
    } catch {
      // Non-fatal — venture context is advisory
    }
  }

  // 5.1. Show worktree info + machine-readable activation directive
  if (worktreeInfo?.success && worktreeInfo.worktree?.exists) {
    console.log(`\n${colors.bold}Worktree:${colors.reset}`);
    console.log(`   Path:   ${colors.cyan}${worktreeInfo.cwd}${colors.reset}`);
    console.log(`   Branch: ${worktreeInfo.worktree.branch || 'unknown'}`);
    console.log(`   Source: ${worktreeInfo.source}${worktreeInfo.worktree.created ? ' (newly created)' : ''}`);
    // Machine-readable directive for agent consumption (PAT-WORKTREE-LIFECYCLE-001)
    console.log(`\n>>> WORKTREE_CWD=${worktreeInfo.cwd}`);

    // SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001: Persist worktree_path so claim-validity-gate
    // can enforce cwd isolation on subsequent handoff/PRD operations. Non-fatal on error.
    try {
      await supabase
        .from('strategic_directives_v2')
        .update({ worktree_path: worktreeInfo.cwd })
        .eq('sd_key', effectiveId);
    } catch (e) {
      console.warn(`   ${colors.yellow}⚠️  Failed to persist worktree_path: ${e?.message || e}${colors.reset}`);
    }

    // QF-20260314-250: Child claim verification gate
    // Warn when orchestrator sd:start resolves to a child's worktree
    const wtBranch = worktreeInfo.worktree.branch || '';
    if (sd.sd_type === 'orchestrator' && wtBranch && !wtBranch.includes(effectiveId)) {
      const childMatch = wtBranch.match(/SD-[A-Z0-9-]+/);
      if (childMatch) {
        console.log(`\n${colors.yellow}⚠️  CHILD CLAIM VERIFICATION REQUIRED${colors.reset}`);
        console.log(`   Worktree resolved to child: ${childMatch[0]}`);
        console.log(`   You MUST run: npm run sd:start ${childMatch[0]}`);
        console.log('   Parent auto-routing is NOT a substitute for explicit child claim.');
      }
    }
  }

  // 5.45. SD-MAN-INFRA-FLEET-NPM-INSTALL-001: node_modules health check with coordination lock
  // If worktree's node_modules is broken, coordinate npm install across fleet
  if (worktreeInfo?.success && worktreeInfo.cwd) {
    try {
      const { acquireLock, waitForLock, releaseLock } = require('../lib/npm-install-lock.cjs');
      const fs = await import('fs');
      const path = await import('path');

      // Check if node_modules is functional by testing a critical dependency
      const testPath = path.join(worktreeInfo.cwd, 'node_modules', '@supabase', 'supabase-js');
      if (!fs.existsSync(testPath)) {
        console.log(`\n${colors.yellow}   ⚠️  node_modules missing or broken — coordinating install...${colors.reset}`);
        const lock = await acquireLock(supabase, session.session_id);

        if (lock.held) {
          console.log(`   ⏳ Session ${lock.holder.slice(0, 8)} is installing dependencies — waiting...`);
          const waitResult = await waitForLock(supabase, {
            timeout: 120000,
            pollInterval: 5000,
            onPoll: ({ elapsed }) => {
              console.log(`   ⏳ Still waiting... (${Math.round(elapsed / 1000)}s)`);
            }
          });
          if (waitResult.resolved) {
            console.log(`   ${colors.green}✓ Dependencies ready (${waitResult.reason})${colors.reset}`);
          } else {
            console.log(`   ${colors.yellow}⚠️  Lock wait timed out — attempting install anyway${colors.reset}`);
          }
        } else if (lock.acquired) {
          console.log('   🔒 Lock acquired — running npm install...');
          try {
            // Install in the repo root (worktrees symlink from there)
            const repoRoot = execSync('git rev-parse --show-toplevel', {
              encoding: 'utf8', cwd: worktreeInfo.cwd, stdio: 'pipe'
            }).trim();
            execSync('npm install --ignore-scripts', {
              cwd: repoRoot, stdio: 'pipe', timeout: 120000
            });
            console.log(`   ${colors.green}✓ npm install complete${colors.reset}`);
          } catch (npmErr) {
            console.log(`   ${colors.yellow}⚠️  npm install failed: ${npmErr.message?.split('\n')[0]}${colors.reset}`);
          } finally {
            await releaseLock(supabase, session.session_id);
            console.log('   🔓 Lock released');
          }
        }
      }
    } catch (lockErr) {
      // Non-fatal — lock system failure should not block sd-start
      console.debug(`[sd-start] node_modules lock check error: ${lockErr?.message || lockErr}`);
    }
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
      .eq('sd_key', sd.id);
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

  // 7.5. SD-LEO-INFRA-OKR-AUTO-COMPLEXITY-001: Brainstorm gate for high-complexity auto-SDs
  const needsBrainstorm = sd.metadata?.needs_brainstorm === true;
  if (needsBrainstorm && sd.status === 'draft' && sd.current_phase === 'LEAD') {
    console.log(`\n${colors.bgYellow}${colors.bold} BRAINSTORM REQUIRED ${colors.reset}`);
    console.log(`${colors.yellow}   This SD was auto-generated from a stale OKR and classified as high-complexity.${colors.reset}`);
    console.log(`${colors.yellow}   Run /brainstorm before proceeding to LEAD approval.${colors.reset}`);
    console.log(`${colors.dim}   Complexity: score ${sd.metadata.complexity_score || '?'}, reasons: ${(sd.metadata.complexity_reasons || []).join(', ') || 'n/a'}${colors.reset}`);
    console.log('\n>>> NEEDS_BRAINSTORM=true');
  }

  // 8. Show next action
  const nextHandoff = await getNextHandoff(sd);

  if (needsBrainstorm && sd.status === 'draft') {
    console.log(`\n${colors.bold}Next Action:${colors.reset}`);
    console.log(`   ${colors.cyan}/brainstorm ${sd.title}${colors.reset}`);
    console.log(`${colors.dim}   After brainstorm completes with vision+arch, then:${colors.reset}`);
    console.log(`   ${colors.dim}CLAUDE_SESSION_ID=${session.session_id} node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);
  } else {
    console.log(`\n${colors.bold}Next Action:${colors.reset}`);
    console.log(`   ${colors.cyan}CLAUDE_SESSION_ID=${session.session_id} node scripts/handoff.js execute ${nextHandoff} ${effectiveId}${colors.reset}`);
    console.log(`${colors.dim}   ⚠  Save this CLAUDE_SESSION_ID — all subsequent node script calls (handoff.js, etc.) require it.${colors.reset}`);
    console.log(`${colors.dim}   After context compaction, re-check SessionStart hook output or use the session ID shown above.${colors.reset}`);
    console.log(`${colors.dim}   Omitting it causes no_deterministic_identity failures at claim-validity gate.${colors.reset}`);
  }

  console.log(`\n${colors.dim}Session: ${session.session_id}${colors.reset}`);
  console.log('═'.repeat(50));
}

main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
