/**
 * QF-20260705-633: minimal, side-effect-free DB writers for the convergence-loop
 * remediation router (lib/eva/convergence-loop.js routeRemediation -> fileAdherenceFix).
 *
 * The full CLI creation paths (scripts/create-quick-fix.js, scripts/leo-create-sd.js)
 * are NOT reused directly here: create-quick-fix.js's createQuickFix() also creates a
 * git branch/worktree as a side effect (unsafe to invoke from an automated gate call
 * site), and leo-create-sd.js is a large CLI module. These writers do ONLY the DB
 * insert, via the same canonical helpers (routeWorkItem, generateSDKey, createSD) the
 * CLIs use internally, so filed items still get correct tiering/key generation.
 */

import { routeWorkItem } from '../utils/work-item-router.js';
import { generateSDKey } from '../../scripts/modules/sd-key-generator.js';
import { createSD, resolveVenturePrefix } from '../../scripts/leo-create-sd.js';

function generateQuickFixId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `QF-${year}${month}${day}-${random}`;
}

/**
 * Build a createQuickFixFn for routeRemediation's tier-1/2 path.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {(gap: {title: string, dimension: string}) => Promise<string>}
 */
export function createQuickFixWriter(supabase) {
  return async function createQuickFixFn({ title, dimension }) {
    const description = `Post-build convergence-gate remediation: adherence gap on dimension "${dimension}". ${title}`;
    const routingDecision = await routeWorkItem({
      estimatedLoc: 10, type: 'bug', description, entryPoint: 'convergence-gate-remediation',
    }, supabase);
    const qfId = generateQuickFixId();
    const { error } = await supabase.from('quick_fixes').insert({
      id: qfId,
      title,
      type: 'bug',
      severity: 'medium',
      description,
      target_application: 'EHG',
      estimated_loc: 10,
      status: routingDecision.tier === 3 ? 'escalated' : 'open',
      escalation_reason: routingDecision.tier === 3 ? routingDecision.escalationReason : null,
      routing_tier: routingDecision.tier,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(`[convergence-remediation-writers] createQuickFixFn insert failed: ${error.message}`);
    return qfId;
  };
}

/**
 * Build a createSdFn for routeRemediation's tier-3 path. No supabase param -- unlike
 * routeWorkItem, createSD/resolveVenturePrefix instantiate their own internal client.
 * @returns {(gap: {title: string, dimension: string}) => Promise<string>}
 */
export function createSdWriter() {
  return async function createSdFn({ title, dimension }) {
    const venturePrefix = await resolveVenturePrefix(null, 'bugfix');
    const sdKey = await generateSDKey({ source: 'LEO', type: 'bugfix', title, venturePrefix });
    const sd = await createSD({
      sdKey,
      title,
      description: `Post-build convergence-gate remediation: adherence gap on dimension "${dimension}". ${title}`,
      type: 'bugfix',
      priority: 'high',
      rationale: `Filed by the post-build adherence-scorer convergence loop for a below-floor dimension (${dimension}) that requires more than a quick-fix scope.`,
      metadata: { source: 'convergence_gate_remediation', dimension, sourced_by: 'convergence-remediation' },
    });
    return sd.sd_key || sdKey;
  };
}
