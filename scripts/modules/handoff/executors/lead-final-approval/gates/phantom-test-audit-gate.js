/**
 * Phantom Test Audit Gate — LEAD-FINAL-APPROVAL handoff gate.
 *
 * SD-FDBK-ENH-PAT-PHANTOM-TABLE-001 / PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 CAPA-2+CAPA-3.
 * Wraps scripts/phantom-test-audit.js (collectAndAudit) into the canonical
 * { name, validator, required } gate shape mirroring wire-check-gate.js.
 *
 * Bypass mechanism (two paths):
 *   1. env PHANTOM_TEST_AUDIT_BYPASS=1
 *   2. sd.metadata.governance_metadata.bypass_reason contains the literal
 *      token "PHANTOM_TEST_AUDIT_BYPASS"
 * Either path emits a warning, returns passed=true, and surfaces the bypass
 * invocation text inline so operators can discover it from the failure
 * message itself.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAndAudit } from '../../../../../phantom-test-audit.js';

const GATE_NAME = 'PHANTOM_TEST_AUDIT';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve the repo root: this file is at scripts/modules/handoff/executors/lead-final-approval/gates/
const ROOT_DIR = path.resolve(__dirname, '../../../../../..');

export function createPhantomTestAuditGate(_supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🪞 GATE: Phantom Test Audit');
      console.log('-'.repeat(50));

      const sd = ctx?.sd || null;
      const bypassReason = sd?.metadata?.governance_metadata?.bypass_reason || '';
      const envBypass = process.env.PHANTOM_TEST_AUDIT_BYPASS === '1';
      const metaBypass = typeof bypassReason === 'string' && bypassReason.includes('PHANTOM_TEST_AUDIT_BYPASS');

      if (envBypass || metaBypass) {
        const source = envBypass ? 'env PHANTOM_TEST_AUDIT_BYPASS=1' : 'sd.metadata.governance_metadata.bypass_reason';
        console.log(`   ⚠️  Bypass active via ${source} — gate auto-passing.`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`PHANTOM_TEST_AUDIT bypassed via ${source}`],
          details: { bypassed: true, source },
        };
      }

      let triggered, result;
      try {
        ({ triggered, result } = collectAndAudit({ repoPath: ROOT_DIR }));
      } catch (err) {
        const message = err?.message || String(err);
        console.log(`   ❌ Audit failed: ${message}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: [`PHANTOM_TEST_AUDIT failed to collect inputs: ${message}`],
          warnings: [],
          details: { error: message },
        };
      }

      if (!triggered) {
        console.log('   No commit subject matches /phantom.*table|dead.*query/i — early-return PASS.');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { triggered: false },
        };
      }

      if (result.passed) {
        console.log(`   PASS — same-PR test edits matched: ${result.details.matched_edits.length}`);
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { triggered: true, ...result.details },
        };
      }

      console.log(`   ❌ FAIL — ${result.details.orphaned_tests.length} orphaned test reference(s)`);
      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: result.issues,
        warnings: [],
        details: { triggered: true, ...result.details },
      };
    },
    required: true,
  };
}
