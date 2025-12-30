/**
 * Child SD Progression Gate
 * LEO Protocol v4.3.3 - Hard Enforcement
 *
 * PURPOSE: BLOCKS starting work on child SD P(N) until P(N-1) is verified complete
 * ROOT CAUSE FIX: Prevents "Pending Approval Trap" where handoffs are skipped
 *
 * ENFORCEMENT:
 * - Called by phase-preflight.js before ANY phase work
 * - Exits with error code 1 if gate fails (blocks execution)
 * - Requires LEAD-FINAL-APPROVAL handoff (not just status change)
 *
 * Usage:
 *   import { enforceChildProgressionGate } from './modules/child-progression-gate.js';
 *   const result = await enforceChildProgressionGate(childSdId);
 *   if (!result.canProceed) process.exit(1);
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Completion verification criteria
 * ALL must pass for a child SD to be considered "complete"
 */
const COMPLETION_REQUIREMENTS = {
  status: 'completed',
  requiredHandoff: 'LEAD-FINAL-APPROVAL',
  requiredTimestamp: 'completion_date'
};

/**
 * Get the execution order position of a child SD
 * Uses parent's dependency_chain or child index
 */
async function getChildPosition(childSd, parentSd) {
  // Check if parent has explicit dependency_chain
  const dependencyChain = parentSd.dependency_chain || parentSd.metadata?.dependency_chain;

  if (Array.isArray(dependencyChain) && dependencyChain.length > 0) {
    const position = dependencyChain.findIndex(
      id => id === childSd.id || id === childSd.legacy_id || id === childSd.sd_key
    );
    return position >= 0 ? position : null;
  }

  // Fallback: use sd_key pattern (e.g., SD-PARENT-001-P0, SD-PARENT-001-P1)
  // Case-insensitive match for -p0, -P0, etc.
  const match = childSd.sd_key?.match(/-[pP](\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Another pattern: SD-XXX-001, SD-XXX-002
  const legacyMatch = childSd.legacy_id?.match(/-[pP]?(\d+)$/);
  if (legacyMatch) {
    return parseInt(legacyMatch[1], 10);
  }

  return null;
}

/**
 * Get all siblings in execution order
 */
async function getSiblingsInOrder(parentSd) {
  const { data: children, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, status, completion_date')
    .eq('parent_sd_id', parentSd.id)
    .order('created_at', { ascending: true });

  if (error || !children) {
    return [];
  }

  // Check for explicit dependency_chain
  const dependencyChain = parentSd.dependency_chain || parentSd.metadata?.dependency_chain;

  if (Array.isArray(dependencyChain) && dependencyChain.length > 0) {
    // Sort by dependency_chain order
    return children.sort((a, b) => {
      const posA = dependencyChain.findIndex(id => id === a.id || id === a.legacy_id || id === a.sd_key);
      const posB = dependencyChain.findIndex(id => id === b.id || id === b.legacy_id || id === b.sd_key);
      return posA - posB;
    });
  }

  // Fallback: sort by sd_key pattern (p0, p1, P0, P1, etc.)
  return children.sort((a, b) => {
    const matchA = a.sd_key?.match(/-[pP](\d+)$/);
    const matchB = b.sd_key?.match(/-[pP](\d+)$/);
    if (matchA && matchB) {
      return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
    }

    // Final fallback: legacy_id numeric suffix
    const legacyMatchA = a.legacy_id?.match(/-[pP]?(\d+)$/);
    const legacyMatchB = b.legacy_id?.match(/-[pP]?(\d+)$/);
    if (legacyMatchA && legacyMatchB) {
      return parseInt(legacyMatchA[1], 10) - parseInt(legacyMatchB[1], 10);
    }

    return 0;
  });
}

/**
 * Verify a child SD is FULLY complete (not just status)
 */
async function verifyChildCompletion(childId) {
  // Get SD status
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, status, completion_date, progress')
    .or(`id.eq.${childId},sd_key.eq.${childId},legacy_id.eq.${childId}`)
    .single();

  if (sdError || !sd) {
    return {
      complete: false,
      reason: `SD not found: ${childId}`,
      missing: ['SD_NOT_FOUND']
    };
  }

  const missing = [];

  // Check 1: Status must be 'completed'
  if (sd.status !== COMPLETION_REQUIREMENTS.status) {
    missing.push(`STATUS (current: ${sd.status}, required: ${COMPLETION_REQUIREMENTS.status})`);
  }

  // Check 2: completion_date must be set
  if (!sd.completion_date) {
    missing.push('COMPLETION_DATE timestamp (currently NULL)');
  }

  // Check 3: LEAD-FINAL-APPROVAL handoff must exist
  // Check both sd_phase_handoffs AND leo_handoff_executions (where it's typically recorded)
  let handoff = null;

  // First check sd_phase_handoffs
  const { data: sphHandoff } = await supabase
    .from('sd_phase_handoffs')
    .select('id, status, created_at')
    .eq('sd_id', sd.id)
    .eq('handoff_type', COMPLETION_REQUIREMENTS.requiredHandoff)
    .eq('status', 'accepted')
    .maybeSingle();

  if (sphHandoff) {
    handoff = sphHandoff;
  } else {
    // Also check leo_handoff_executions (LEAD-FINAL-APPROVAL is recorded here)
    const { data: lheHandoff } = await supabase
      .from('leo_handoff_executions')
      .select('id, status, created_at')
      .eq('sd_id', sd.id)
      .eq('handoff_type', COMPLETION_REQUIREMENTS.requiredHandoff)
      .eq('status', 'accepted')
      .maybeSingle();

    if (lheHandoff) {
      handoff = lheHandoff;
    }
  }

  if (!handoff) {
    missing.push('LEAD-FINAL-APPROVAL handoff (required for proper completion)');
  }

  return {
    complete: missing.length === 0,
    sd,
    handoff,
    missing,
    reason: missing.length > 0
      ? `Missing: ${missing.join(', ')}`
      : 'All completion requirements met'
  };
}

/**
 * MAIN GATE: Enforce child progression order
 *
 * @param {string} childSdId - The child SD attempting to start work
 * @param {Object} options - Optional settings
 * @returns {Object} Result with canProceed, blockedBy, and required actions
 */
export async function enforceChildProgressionGate(childSdId, options = {}) {
  const { verbose = true } = options;

  if (verbose) {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║       CHILD PROGRESSION GATE - Sequential Enforcement          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
  }

  // Get the target child SD
  const { data: childSd, error: childError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .or(`id.eq.${childSdId},sd_key.eq.${childSdId},legacy_id.eq.${childSdId}`)
    .single();

  if (childError || !childSd) {
    if (verbose) console.log(`\n   ERROR: SD not found: ${childSdId}`);
    return { canProceed: false, error: `SD not found: ${childSdId}` };
  }

  // Check if this is a child SD
  if (!childSd.parent_sd_id) {
    if (verbose) {
      console.log('\n   SD Type: STANDALONE (no parent)');
      console.log('   Gate: BYPASSED (no sequential dependency)\n');
    }
    return { canProceed: true, reason: 'Not a child SD' };
  }

  // Get parent SD
  const { data: parentSd, error: parentError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', childSd.parent_sd_id)
    .single();

  if (parentError || !parentSd) {
    if (verbose) console.log('\n   WARNING: Parent SD not found, allowing proceed');
    return { canProceed: true, reason: 'Parent not found' };
  }

  if (verbose) {
    console.log(`\n   Target SD: ${childSd.sd_key || childSd.legacy_id}`);
    console.log(`   Parent:    ${parentSd.sd_key || parentSd.legacy_id}`);
    console.log(`   Title:     ${childSd.title}`);
  }

  // Get siblings in execution order
  const siblings = await getSiblingsInOrder(parentSd);
  const position = siblings.findIndex(s => s.id === childSd.id);

  if (verbose) {
    console.log('\n   Execution Order:');
    siblings.forEach((s, i) => {
      const marker = s.id === childSd.id ? '>>>' : '   ';
      const statusIcon = s.status === 'completed' && s.completion_date ? '✅' :
                         s.status === 'in_progress' ? '🔄' : '📋';
      console.log(`   ${marker} ${i}. ${s.sd_key || s.legacy_id} [${statusIcon} ${s.status}]`);
    });
  }

  // If first in sequence (position 0), no predecessor required
  if (position === 0) {
    if (verbose) {
      console.log('\n   Position: FIRST in sequence (P0)');
      console.log('   Gate: PASSED (no predecessor required)\n');
    }
    return { canProceed: true, reason: 'First in sequence' };
  }

  if (position < 0) {
    if (verbose) console.log('\n   WARNING: Position not found in siblings');
    return { canProceed: true, reason: 'Position unknown' };
  }

  // Get predecessor (P(N-1))
  const predecessor = siblings[position - 1];

  if (verbose) {
    console.log(`\n   Position: ${position} (P${position})`);
    console.log(`   Predecessor: ${predecessor.sd_key || predecessor.legacy_id} (P${position - 1})`);
    console.log('\n   Verifying predecessor completion...');
  }

  // Verify predecessor is FULLY complete
  const verification = await verifyChildCompletion(predecessor.id);

  if (verification.complete) {
    if (verbose) {
      console.log('\n   ✅ PREDECESSOR VERIFIED COMPLETE');
      console.log(`      Status: ${verification.sd.status}`);
      console.log(`      Completion Date: ${verification.sd.completion_date}`);
      console.log('      LEAD-FINAL-APPROVAL: Present');
      console.log('\n   Gate: PASSED\n');
    }
    return {
      canProceed: true,
      reason: 'Predecessor verified complete',
      predecessor: verification.sd
    };
  }

  // GATE BLOCKED
  if (verbose) {
    console.log('\n   ❌ GATE BLOCKED - Predecessor NOT Complete');
    console.log(`\n   Predecessor: ${predecessor.sd_key || predecessor.legacy_id}`);
    console.log(`   Current Status: ${verification.sd?.status || 'unknown'}`);
    console.log('\n   Missing Requirements:');
    verification.missing.forEach(m => console.log(`      • ${m}`));

    console.log('\n   ╔════════════════════════════════════════════════════════════╗');
    console.log('   ║                    REQUIRED ACTION                         ║');
    console.log('   ╠════════════════════════════════════════════════════════════╣');
    console.log('   ║ Complete predecessor before starting this SD:              ║');
    console.log('   ║                                                            ║');
    console.log('   ║ node scripts/handoff.js execute LEAD-FINAL-APPROVAL \\      ║');
    console.log(`   ║   ${(predecessor.sd_key || predecessor.legacy_id).padEnd(54)}║`);
    console.log('   ║                                                            ║');
    console.log('   ║ Then re-run phase-preflight for this SD.                   ║');
    console.log('   ╚════════════════════════════════════════════════════════════╝\n');
  }

  return {
    canProceed: false,
    reason: 'Predecessor not complete',
    blockedBy: predecessor,
    verification,
    requiredAction: `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${predecessor.sd_key || predecessor.legacy_id}`
  };
}

/**
 * Quick check without verbose output
 */
export async function checkChildProgression(childSdId) {
  return enforceChildProgressionGate(childSdId, { verbose: false });
}

// CLI execution
if (process.argv[1].includes('child-progression-gate')) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.log(`
Child Progression Gate
═══════════════════════

Enforces sequential completion of child SDs in an orchestrator.

Usage:
  node scripts/modules/child-progression-gate.js <SD-ID>

Example:
  node scripts/modules/child-progression-gate.js SD-STAGE-ARCH-001-P3

Exit Codes:
  0 - Gate passed (can proceed)
  1 - Gate blocked (predecessor incomplete)
`);
    process.exit(0);
  }

  enforceChildProgressionGate(sdId)
    .then(result => {
      if (!result.canProceed) {
        process.exit(1); // HARD BLOCK
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Gate error:', err.message);
      process.exit(1);
    });
}
