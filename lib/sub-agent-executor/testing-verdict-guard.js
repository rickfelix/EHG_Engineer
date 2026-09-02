/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-1.
 *
 * storeSubAgentResults() must refuse a TESTING PASS/CONDITIONAL_PASS write that lacks a
 * genuine, well-formed metadata.test_execution block (TESTING sub-agent evidence 42436060:
 * source='manual' is not a usable discriminator -- the column defaults to 'manual' in
 * Postgres and is never explicitly set, so it cannot distinguish a hand-authored row from a
 * sub-agent-code-path one). The guard therefore applies unconditionally to every TESTING
 * PASS/CONDITIONAL_PASS write, keyed only on verdict, and reuses isMeasuredExecution() (TR-1)
 * rather than hand-rolling a second "is this a real run" definition. Non-accepting verdicts
 * (ERROR, FAIL, WARNING, ...) are never checked here -- TR-4 preserves the file's existing
 * fail-soft doctrine for failure evidence.
 */
import { isMeasuredExecution } from '../sub-agents/testing/test-execution-record.js';

const GUARDED_VERDICTS = new Set(['PASS', 'CONDITIONAL_PASS']);
const REQUIRED_NUMERIC_FIELDS = ['tests_executed', 'tests_passed', 'tests_failed', 'tests_skipped'];

/**
 * @param {{sub_agent_code?: string, verdict?: string, metadata?: object}} record
 * @throws {Error} naming the missing/malformed field, when a TESTING PASS/CONDITIONAL_PASS
 *   record lacks a genuine metadata.test_execution block
 */
export function validateTestExecutionShape(record) {
  if (record?.sub_agent_code !== 'TESTING') return;
  if (!GUARDED_VERDICTS.has(record?.verdict)) return;

  const testExecution = record?.metadata?.test_execution;
  if (!testExecution || typeof testExecution !== 'object') {
    throw new Error(
      `storeSubAgentResults: TESTING verdict=${record.verdict} refused -- metadata.test_execution is missing. ` +
      'A PASS/CONDITIONAL_PASS TESTING row must carry a real test_execution block (build one via buildTestExecution()).'
    );
  }

  const malformed = REQUIRED_NUMERIC_FIELDS.filter(
    (field) => typeof testExecution[field] !== 'number' || !Number.isFinite(testExecution[field])
  );
  if (malformed.length > 0) {
    throw new Error(
      `storeSubAgentResults: TESTING verdict=${record.verdict} refused -- metadata.test_execution.${malformed.join(', metadata.test_execution.')} ` +
      `must be a real number, not missing or a coerced string (got ${malformed.map((f) => JSON.stringify(testExecution[f])).join(', ')}).`
    );
  }

  if (!isMeasuredExecution(testExecution)) {
    throw new Error(
      `storeSubAgentResults: TESTING verdict=${record.verdict} refused -- metadata.test_execution.tests_executed is ${testExecution.tests_executed}, ` +
      'not a genuine measured run (isMeasuredExecution requires tests_executed > 0).'
    );
  }
}
