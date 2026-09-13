/**
 * @wire-check-exempt: foundation shared library — Part B's mock-mode executor primitive.
 * The orchestrating runner that invokes runMockOutreachSend() with a real buildSend adapter
 * is out of scope for this SD (no mock-run trigger/scheduler has shipped yet); today it is
 * exercised only by tests/unit/marketing/mock-outreach-executor.test.js and the CI negative
 * test. Same status as lib/eva/lifecycle/gate-conformance.js: available infrastructure with
 * no production runtime caller yet, by design — wired when the orchestrating SD lands.
 *
 * Mock first-stranger-run executor — SD-LEO-INFRA-DEMAND-ENGINE-PART-001.
 *
 * Part B of the demand engine: a mock-mode outreach pipeline that exercises the REAL
 * authorization choke point (assertOutreachAuthorized, lib/governance/stage-gate-predicate.js,
 * shipped by Part A) and the REAL ledger discriminator (execution_mode, also Part A) without
 * ever constructing or calling a real channel adapter or Resend client -- this module has no
 * import of either, by construction, so "zero real adapter calls / zero real Resend calls"
 * (FR-3, FR-8) is a structural property, not a runtime check.
 *
 * FR-1: mock_run_id is the SOLE input that can put the executor into mock mode. There is no
 * env var, caller option, or wrapper field that substitutes -- declareMockRun() is the only
 * place a mock_run_id is minted, and runMockOutreachSend() only branches into mock mode when
 * the caller explicitly passes one.
 *
 * FR-2: the wrapper's own `mode` field is never read here. assertOutreachAuthorized()'s result
 * is destructured to exactly { authorized, reason, snapshot } -- `mode` is not even bound to a
 * local name, so a future edit that tried to read it would need to add the binding back,
 * visibly, rather than silently reuse one already in scope.
 */
import { randomUUID } from 'crypto';
import { assertOutreachAuthorized } from '../governance/stage-gate-predicate.js';
import { executionModeField, invalidateExecutionModeProbeCache } from './ledger-execution-mode-probe.js';

/** FR-4: the one refusal reason this module itself produces (assertOutreachAuthorized supplies the rest). */
export const NO_MOCK_RUN_DECLARED = 'no_mock_run_declared';

/**
 * FR-1: declare a mock run. The returned id is the sole token a caller can pass to
 * runMockOutreachSend() to enter mock mode -- generating one is the ONLY declaration
 * mechanism; there is deliberately no second way (env var, flag) to reach the same effect.
 * @returns {string} a fresh mock_run_id (UUID v4)
 */
export function declareMockRun() {
  return randomUUID();
}

/**
 * FR-5 / SEC-H1-R: identical self-healing insert used by Part A's autonomy-gate.js
 * (insertLedgerRowSelfHealing) -- duplicated rather than imported because that function is
 * module-private there; the probe/retry CONTRACT is what must stay identical, not the call
 * site. If this drifts from the Part A copy, that is the signal to extract a shared helper.
 */
async function insertLedgerRowSelfHealing(supabase, baseRow, mode) {
  const stamp = await executionModeField(supabase, mode);
  let result = await supabase.from('venture_channel_publish_ledger').insert({ ...baseRow, ...stamp }).select('id').single();
  if (result.error && Object.keys(stamp).length === 0 && result.error?.code === '23502' && /execution_mode/.test(result.error?.message || '')) {
    invalidateExecutionModeProbeCache();
    const retryStamp = await executionModeField(supabase, mode);
    result = await supabase.from('venture_channel_publish_ledger').insert({ ...baseRow, ...retryStamp }).select('id').single();
  }
  return result;
}

/**
 * The Part B executor. Runs the authorization check, then EITHER the full simulated send
 * pipeline (mock mode) OR a clean refusal -- never a third, silently-reinterpreted outcome.
 *
 * @param {object} params
 * @param {{from: Function}} params.supabase
 * @param {string} params.ventureId
 * @param {string} params.channelType
 * @param {string} params.contentId - marketing_content.id this send would publish
 * @param {string|undefined} params.mockRunId - FR-1: the SOLE mock-mode trigger; omit for a real attempt
 * @param {'campaign'|'channel_publish'} [params.actorType]
 * @param {string} [params.actorId]
 * @param {string} [params.correlationId]
 * @param {(ctx: {mode:'mock'|'live', ventureId:string, channelType:string, contentId:string, mockRunId:string|undefined}) => Promise<any>} params.buildSend
 *   FR-3: the actual simulated-send pipeline (persona selection + content generation for mock
 *   mode). Injected so this module never hardcodes the pipeline and stays independently
 *   testable (CLAUDE_EXEC.md Testability-Aware Implementation) -- it is the ONLY place outside
 *   this file that could construct a real adapter call, and for a genuine mock run the caller
 *   supplies a pipeline that never does so.
 * @returns {Promise<{executed:boolean, mode:'mock'|'live'|null, reason:string|null, snapshot:object, ledgerEntryId:string|null, correlationId?:string, send?:any}>}
 */
export async function runMockOutreachSend({ supabase, ventureId, channelType, contentId, mockRunId, actorType = 'channel_publish', actorId, correlationId, buildSend }) {
  const resolvedActorId = actorId || `${channelType}:${contentId}`;

  // FR-2: destructure ONLY authorized/reason/snapshot. `mode` is deliberately not bound.
  const { authorized, reason, snapshot } = await assertOutreachAuthorized({
    supabase,
    ventureId,
    actorType,
    actorId: resolvedActorId,
  });

  // FR-4: authorized=false AND no mock run declared -> clean refusal, zero ledger rows, never
  // silently reinterpreted as a mock send.
  if (!authorized && !mockRunId) {
    return { executed: false, mode: null, reason, snapshot, ledgerEntryId: null };
  }

  // FR-3: authorized=false AND mock_run_id set -> full simulated pipeline, mock mode.
  // Else (authorized=true): the live-confirmed path, exercised here only so FR-5's stamping
  // requirement ("a live send stamps execution_mode='live'") is testable from one function --
  // Part A's publisher/index.js remains the production live-send chokepoint; this branch never
  // constructs a real adapter itself either way (buildSend is the caller's own pipeline).
  const mode = authorized ? 'live' : 'mock';

  const send = await buildSend({ mode, ventureId, channelType, contentId, mockRunId });

  const finalCorrelationId = correlationId || `${ventureId}:${channelType}:${contentId}:${mode}:${Date.now()}`;
  const { data: inserted, error: insertError } = await insertLedgerRowSelfHealing(supabase, {
    venture_id: ventureId,
    channel_type: channelType,
    content_ref: contentId,
    correlation_id: finalCorrelationId,
    decision: 'accepted',
    decision_by: mode === 'mock' ? 'system:mock-first-stranger-run' : 'system:outreach-executor',
    decision_at: new Date().toISOString(),
    // FR-6: mock_run_id correlates this ledger row to the declared run; NULL for a live send
    // (a real send has no run to correlate -- mirrors the FR-4 migration's own column comment).
    mock_run_id: mode === 'mock' ? mockRunId : null,
  }, mode);

  if (insertError) {
    return { executed: false, mode, reason: `LEDGER_WRITE_FAILED: ${insertError.message}`, snapshot, ledgerEntryId: null };
  }

  return { executed: true, mode, reason: null, snapshot, ledgerEntryId: inserted?.id, correlationId: finalCorrelationId, send };
}

export default { declareMockRun, runMockOutreachSend, NO_MOCK_RUN_DECLARED };
