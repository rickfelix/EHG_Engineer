#!/usr/bin/env node
/**
 * VENTURE_STACK sub-agent wrapper
 * SD-LEO-INFRA-WIRE-PRE-BUILD-001 — FR-1
 *
 * Makes the deterministic panel compliance dimension (lib/eva/bridge/venture-stack-agent.js
 * runVentureStackAgent) runnable as a first-class LEO sub-agent: it fetches the leaf SD,
 * runs the pure policy scan, and returns a results object the executor persists via the
 * canonical storeSubAgentResults. No LLM, no repo scan — it reads the leaf's own text.
 *
 *   verdict PASS  => leaf is venture-stack compliant (missing REQUIRED tech is advisory)
 *   verdict FAIL  => leaf positively specifies forbidden tech (blocking; orchestrator holds)
 *
 * @module lib/sub-agents/venture_stack
 *
 * NOTE: filename is underscore (venture_stack.js) — the canonical executor
 * (lib/sub-agent-executor/executor.js) loads modules by convention
 * `../sub-agents/${code.toLowerCase()}.js`, and 'VENTURE_STACK'.toLowerCase()
 * is 'venture_stack' (underscore). A hyphen here would silently fall through to
 * MANUAL_REQUIRED, never running execute(). Keep this aligned with the code.
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { runVentureStackAgent } from '../eva/bridge/venture-stack-agent.js';

/**
 * Execute the VENTURE_STACK compliance review for a leaf SD.
 * @param {string} sdId - leaf SD UUID
 * @param {object} [subAgent] - sub-agent row (unused; deterministic)
 * @param {object} [options] - { supabase?, priorSections? } — supabase injectable for tests
 * @returns {Promise<object>} results consumed by storeSubAgentResults
 */
export async function execute(sdId, subAgent, options = {}) {
  const supabase = options.supabase || (await createSupabaseServiceClient('engineer', { verbose: false }));
  const priorSections = options.priorSections || [];

  const results = {
    sd_id: sdId,
    sub_agent_code: 'VENTURE_STACK',
    timestamp: new Date().toISOString(),
    verdict: 'PASS',
    confidence_score: 95, // deterministic policy scan
    summary: '',
    findings: {},
    recommendations: [],
    blockers: [],
    warnings: [],
  };

  try {
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, description')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      throw new Error(`Failed to fetch SD ${sdId}: ${error?.message || 'not found'}`);
    }

    const scan = runVentureStackAgent({
      leaf: { title: sd.title, description: sd.description },
      priorSections,
    });

    results.findings = {
      compliant: scan.ok,
      violations: scan.violations,
      missing: scan.missing,
      reason: scan.reason,
      section: scan.section,
    };
    results.recommendations = (scan.missing || []).map(
      (m) => `Specify required EHG-stack element: ${m}`
    );

    // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-5): observe-only signal for the asymmetry —
    // logs what WOULD fail-closed once bound, without changing verdict/ok (never blocks).
    if (scan.observeOnly?.wouldFailClosed) {
      results.warnings.push(
        `OBSERVE-ONLY: missing required stack element(s) [${scan.observeOnly.missing.join(', ')}] — `
        + 'will fail-closed once the symmetric gate binds, see SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001'
      );
      try {
        const stamp = new Date().toISOString();
        await supabase.from('system_events').insert({
          event_type: 'VENTURE_STACK_OBSERVE_ONLY',
          sd_id: sdId,
          idempotency_key: `VENTURE_STACK_OBSERVE_ONLY:${sdId}:${Date.parse(stamp)}`,
          payload: { sd_id: sdId, missing: scan.observeOnly.missing, would_fail: true },
          details: { sd_id: sdId, missing: scan.observeOnly.missing, would_fail: true },
          created_at: stamp,
        });
      } catch (logErr) {
        // Non-fatal — the observe-only signal is diagnostic, not load-bearing.
        results.warnings.push(`(observe-only event log failed, non-fatal: ${logErr.message})`);
      }
    }

    if (scan.ok) {
      results.verdict = 'PASS';
      results.summary = `Venture-stack compliant${
        scan.missing?.length ? ` (advisory: ${scan.missing.length} REQUIRED element(s) unspecified)` : ''
      }.`;
    } else {
      results.verdict = 'FAIL';
      results.blockers = scan.violations.map((v) => `Forbidden venture-stack tech specified: ${v}`);
      results.summary = `Venture-stack NON-compliant: ${scan.violations.join(', ')} (${scan.reason}).`;
    }
  } catch (err) {
    results.verdict = 'FAIL';
    results.confidence_score = 0;
    results.summary = `VENTURE_STACK sub-agent error: ${err.message}`;
    results.blockers.push(err.message);
  }

  return results;
}

export default { execute };
