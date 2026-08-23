/**
 * RCA Gate Validation for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Validates that P0/P1 RCRs have verified CAPAs.
 *
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-2/FR-2b: this gate previously destructured
 * only `{ data }` from the Supabase response, never `error`. supabase-js does not throw on
 * a missing/renamed table — it resolves `{data:null, error:PGRST205}` — so the query fell
 * through to `passed:true, score:100` unconditionally, and the try/catch's fail-closed
 * comment ("CRITICAL: Do not return PASS when root_cause_analyses table is missing") was
 * dead code that never ran. Also fixed: the real table is root_cause_reports (columns
 * severity_priority/status, not priority/capa_status).
 *
 * Enforcement is gated by LEO_RCA_GATE_ENFORCE (default unset = warn-only): a blocking
 * condition returns `passed:true, gate_status:'WARN'` and logs the blocking RCR ids, so the
 * disposition loop (FR-4) and any operator can see the signal without EXEC-TO-PLAN
 * hard-blocking on a resolve/CAPA workflow that has resolved only 2 of 1271 lifetime RCRs.
 * Hard enforcement (flag=on) is deferred to a follow-on SD gated on measured, non-zero RCR
 * resolution throughput.
 */

// Blocking statuses, per the existing precedent at lib/rca/rca-orchestrator.js:81
// (['OPEN', 'IN_REVIEW', 'CAPA_PENDING']). STALE is explicitly EXCLUDED — a stale RCR has
// gone dormant and re-litigating it at every EXEC-TO-PLAN is not this gate's job.
const BLOCKING_STATUSES = ['OPEN', 'IN_REVIEW', 'CAPA_PENDING'];

/** True when hard enforcement is requested; default (unset/anything else) is warn-only. */
function isEnforceEnabled() {
  const v = process.env.LEO_RCA_GATE_ENFORCE;
  return v === '1' || String(v).toLowerCase() === 'true';
}

/**
 * Create the RCA_GATE validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createRCAGate(supabase) {
  return {
    name: 'RCA_GATE',
    validator: async (ctx) => {
      console.log('\n🔍 Step 1: RCA Gate Validation');
      console.log('-'.repeat(50));

      const enforce = isEnforceEnabled();
      const { data: openRCRs, error } = await supabase
        .from('root_cause_reports')
        .select('id, severity_priority, status')
        .eq('sd_id', ctx.sdId)
        .in('severity_priority', ['P0', 'P1'])
        .in('status', BLOCKING_STATUSES);

      if (error) {
        const msg = `RCA gate check failed: ${error.message || 'root_cause_reports table may not exist'}. Cannot verify CAPA status.`;
        console.warn(`[RCAGate] ${msg}`);
        if (enforce) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [msg],
            warnings: [],
            gate_status: 'FAIL'
          };
        }
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`RCA_GATE_WARN: ${msg} (warn-only — LEO_RCA_GATE_ENFORCE is not set)`],
          gate_status: 'WARN'
        };
      }

      if (openRCRs && openRCRs.length > 0) {
        const blockingIds = openRCRs.map(r => r.id);
        if (enforce) {
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [`${openRCRs.length} P0/P1 RCRs without verified CAPAs`],
            warnings: [],
            gate_status: 'BLOCKED',
            open_rcr_count: openRCRs.length,
            blocking_rcr_ids: blockingIds
          };
        }
        const warnMsg = `RCA_GATE_WARN: ${openRCRs.length} P0/P1 RCR(s) without verified CAPAs (ids: ${blockingIds.join(', ')}) — warn-only, LEO_RCA_GATE_ENFORCE is not set`;
        console.warn(`[RCAGate] ${warnMsg}`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [warnMsg],
          gate_status: 'WARN',
          open_rcr_count: openRCRs.length,
          blocking_rcr_ids: blockingIds
        };
      }

      console.log('✅ RCA gate passed');
      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        gate_status: 'PASS'
      };
    },
    required: true
  };
}
