#!/usr/bin/env node

/**
 * Get Working On SD Script
 * Retrieves the Strategic Directive marked as "working on" that is not 100% complete
 * Respects user's explicit UI selection over WSJF priority
 *
 * Enhanced with resume eligibility validation (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001):
 * - Checks last handoff integrity before recommending resume
 * - Outputs phase-appropriate context file
 * - Warns if last handoff was rejected/failed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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
 * Check resume eligibility by verifying the last handoff for an SD.
 *
 * @param {string} sdUuid - The UUID of the SD
 * @param {string} currentPhase - The SD's current phase
 * @returns {Promise<Object>} Resume eligibility result
 */
async function checkResumeEligibility(sdUuid, currentPhase) {
  const { data: handoffs, error } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, from_phase, to_phase, status, created_at, rejection_reason')
    .eq('sd_id', sdUuid)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return {
      canResume: true,
      warning: 'Could not query handoff history',
      contextFile: getPhaseContextFile(currentPhase),
      lastHandoff: null
    };
  }

  // No handoffs yet — fresh SD in LEAD phase, safe to resume
  if (!handoffs || handoffs.length === 0) {
    const isFreshLead = !currentPhase || currentPhase === 'LEAD' || currentPhase === 'LEAD_APPROVAL';
    return {
      canResume: isFreshLead,
      warning: isFreshLead ? null : 'No handoff history found for non-LEAD phase SD',
      contextFile: getPhaseContextFile(currentPhase),
      lastHandoff: null,
      recoveryHint: isFreshLead ? null : 'Run the appropriate handoff for this phase'
    };
  }

  const last = handoffs[0];

  if (last.status === 'accepted' || last.status === 'completed') {
    return {
      canResume: true,
      warning: null,
      contextFile: getPhaseContextFile(currentPhase),
      lastHandoff: {
        id: last.id,
        status: last.status,
        transition: `${last.from_phase} → ${last.to_phase}`,
        created_at: last.created_at
      }
    };
  }

  // Last handoff was rejected or failed — warn before resuming
  return {
    canResume: false,
    warning: `Last handoff ${last.status}: ${last.from_phase} → ${last.to_phase}`,
    reason: last.rejection_reason || 'No reason provided',
    contextFile: getPhaseContextFile(last.from_phase || currentPhase),
    effectivePhase: last.from_phase || currentPhase,
    lastHandoff: {
      id: last.id,
      status: last.status,
      transition: `${last.from_phase} → ${last.to_phase}`,
      rejection_reason: last.rejection_reason,
      created_at: last.created_at
    },
    recoveryHint: `Re-run ${last.from_phase} → ${last.to_phase} handoff after addressing: ${last.rejection_reason || 'rejection issues'}`
  };
}

async function getWorkingOnSD() {
  try {
    // SD-LEO-INFRA-CLAIM-GUARD-001: Prefer claiming_session_id, fall back to is_working_on
    const { data: workingOn, error: workingError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, is_working_on, claiming_session_id, created_at, current_phase, progress, description')
      .or('claiming_session_id.not.is.null,is_working_on.eq.true')
      .lt('progress', 100);  // Less than 100% complete

    if (workingError) {
      console.error('Error querying working_on SD:', workingError);
      return null;
    }

    if (workingOn && workingOn.length > 0) {
      const sd = workingOn[0]; // Should only be one
      const effectiveId = sd.sd_key || sd.id;

      console.log('\n🎯 Strategic Directive Currently Being Worked On:');
      console.log('═══════════════════════════════════════════════════');
      console.log(`
📌 ${effectiveId}
   Title: ${sd.title}
   Status: ${sd.status}
   Priority: ${sd.priority || 'not set'}
   Current Phase: ${sd.current_phase || 'not set'}
   Progress: ${sd.progress || 0}%
   Claimed by: ${sd.claiming_session_id || 'unknown (legacy is_working_on)'}
   Created: ${new Date(sd.created_at).toLocaleDateString()}

   Description:
   ${sd.description || 'No description available'}
      `);

      // Resume eligibility check (SD-LEO-INFRA-RESUME-INTEGRITY-HANDOFF-001)
      const eligibility = await checkResumeEligibility(sd.id, sd.current_phase);

      if (eligibility.canResume) {
        console.log('✅ Resume eligible — last handoff verified');
        if (eligibility.lastHandoff) {
          console.log(`   Last handoff: ${eligibility.lastHandoff.status} (${eligibility.lastHandoff.transition})`);
        }
      } else {
        console.log('⚠️  RESUME WARNING: Last handoff was not successful');
        console.log(`   ${eligibility.warning}`);
        if (eligibility.reason) {
          console.log(`   Reason: ${eligibility.reason}`);
        }
        if (eligibility.recoveryHint) {
          console.log(`\n   💡 Recovery: ${eligibility.recoveryHint}`);
        }
        if (eligibility.effectivePhase) {
          console.log(`   Effective phase: ${eligibility.effectivePhase} (rolled back from ${sd.current_phase})`);
        }
      }

      console.log(`\n📚 Load context: ${eligibility.contextFile}`);

      return { ...sd, resumeEligibility: eligibility };
    } else {
      console.log('\n❌ No Strategic Directive is currently marked as "Working On"');
      console.log('   (or the marked SD is 100% complete and should be ignored)\n');

      // Suggest using WSJF priority instead
      console.log('💡 Suggestion: Use WSJF priority to select next SD:');
      console.log('   Run: npm run prio:top3\n');

      // Also check if there's a completed SD still marked
      const { data: completedWorking } = await supabase
        .from('strategic_directives_v2')
        .select('id, title, progress, claiming_session_id')
        .or('claiming_session_id.not.is.null,is_working_on.eq.true')
        .gte('progress', 100);

      if (completedWorking && completedWorking.length > 0) {
        console.log('⚠️  Note: The following completed SD still has working_on flag:');
        completedWorking.forEach(sd => {
          console.log(`   - ${sd.id}: ${sd.title} (${sd.progress}% complete)`);
        });
        console.log('   This SD is being ignored since it\'s 100% complete.\n');
      }

      return null;
    }
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Export for use in other scripts
export default getWorkingOnSD;

// Run if called directly (cross-platform: Windows uses file:///C:/... vs C:\...)
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;

if (isMain) {
  getWorkingOnSD().then(sd => {
    if (sd) {
      // Return just the ID for scripting
      const effectiveId = sd.sd_key || sd.id;
      if (process.argv.includes('--id-only')) {
        console.log(effectiveId);
      }
    }
    process.exit(sd ? 0 : 1);
  });
}