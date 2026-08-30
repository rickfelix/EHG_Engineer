/**
 * Sub-Agent Evidence PRE-check (QF-20260830-878).
 *
 * A read-only, print-only echo of the blocking SUBAGENT_EVIDENCE gate
 * (./subagent-evidence-gate.js), surfaced BEFORE the gate pipeline runs so a
 * worker sees "missing evidence" at the start of `execute` / via `precheck`
 * instead of discovering it after the full gate chain has already run.
 *
 * RECONCILE, not a rebuild: this calls the gate's own `validateSubagentEvidence`
 * resolver directly — it does not re-derive the required-agent list or re-query
 * `sub_agent_execution_results` itself. Never build a second list here.
 *
 * Two-sided by construction: it changes NOTHING about which agents are
 * required and does NOT invoke any missing agent — it only prints what the
 * gate would find. The gate itself remains the sole enforcer.
 */
import { validateSubagentEvidence } from './subagent-evidence-gate.js';
import { getRequiredSubAgents } from '../required-subagents.js';

/**
 * Print a preview of the SUBAGENT_EVIDENCE gate's verdict for a handoff.
 * Never throws, never blocks — advisory only.
 *
 * @param {Object} params
 * @param {string} params.handoffType - e.g. 'EXEC-TO-PLAN'
 * @param {Object} [params.sd] - SD row (needs .id / .sd_key) if already resolved
 * @param {string} [params.sdId] - SD UUID or key fallback when `sd` is unavailable
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase
 * @returns {Promise<{passed: boolean, checked: boolean}>}
 */
export async function printSubagentEvidencePrecheck({ handoffType, sd, sdId, supabase }) {
  const required = getRequiredSubAgents(handoffType);

  console.log('');
  console.log('SUB-AGENT EVIDENCE PRE-CHECK (advisory — the SUBAGENT_EVIDENCE gate is the real enforcer)');
  console.log('-'.repeat(50));

  if (required.length === 0) {
    console.log(`   ℹ️  No required sub-agents for ${handoffType || 'unknown'} — nothing to pre-check`);
    return { passed: true, checked: false };
  }

  if (!supabase || !(sd?.id || sdId)) {
    console.log('   ⚠️  Pre-check skipped: no Supabase client or SD identifier available yet');
    return { passed: true, checked: false };
  }

  try {
    const result = await validateSubagentEvidence({ sd, sdId, handoffType, supabase }, supabase);
    if (result.passed) {
      console.log(`   ✅ All required sub-agent evidence present for ${handoffType}: ${required.join(', ')}`);
    } else {
      const missing = result.details?.missing?.length ? result.details.missing : required;
      console.log(`   ❌ Missing sub-agent evidence for ${handoffType}: ${missing.join(', ')}`);
      if (result.remediation) {
        console.log(`   Remediation: ${result.remediation}`);
      }
    }
    return { passed: result.passed, checked: true };
  } catch (e) {
    console.log(`   ⚠️  Pre-check failed to run (non-blocking): ${e?.message || e}`);
    return { passed: true, checked: false };
  }
}
