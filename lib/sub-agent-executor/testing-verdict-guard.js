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
 *
 * EXEMPTION (found by TESTING sub-agent evidence 4e655ac0 during this SD's own EXEC-TO-PLAN
 * review): a row that explicitly declares metadata.measured === false is an HONEST unmeasured
 * verdict, not a fabricated one -- SD-FDBK-INFRA-TESTING-SUB-AGENT-001 designed exactly this
 * shape (lib/sub-agents/testing/index.js's policy_non_applicable_* branches, and the
 * e2e_not_applicable branch via FR-4's buildMainlinePhase3TestExecution) specifically so
 * mandatory-testing-validation.js's tiered ADVISORY/REQUIRED gate could decide what to do with
 * "genuinely nothing to measure," rather than the writer silently accepting a fabricated PASS.
 * Refusing these at write time would collapse that two-tier decision the gate already owns.
 * The exemption still requires test_execution to be present and well-formed (only the final
 * measured-run check is skipped) -- a row cannot merely claim measured:false with no shape at
 * all and pass.
 */
import { isMeasuredExecution } from '../sub-agents/testing/test-execution-record.js';

const GUARDED_VERDICTS = new Set(['PASS', 'CONDITIONAL_PASS']);
const REQUIRED_NUMERIC_FIELDS = ['tests_executed', 'tests_passed', 'tests_failed', 'tests_skipped'];
const ECHO_TRUNCATE_LENGTH = 200;

/**
 * SECURITY finding (evidence a600d8e5): the malformed-field error message echoes the caller's
 * own value back for diagnostics. A bare JSON.stringify() on unvalidated caller data can throw
 * (circular references, extreme nesting) -- losing the diagnostic entirely -- and an
 * unbounded-length value (a huge string, or an accidental secret) would otherwise be persisted
 * verbatim into metadata.error on the row executor.js writes for the caught throw. Truncate and
 * never let the echo itself fail.
 */
function safeEchoValue(value) {
  try {
    const str = JSON.stringify(value);
    return str.length > ECHO_TRUNCATE_LENGTH ? `${str.slice(0, ECHO_TRUNCATE_LENGTH)}...(truncated)` : str;
  } catch {
    return `<unstringifiable ${typeof value}>`;
  }
}

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
      `must be a real number, not missing or a coerced string (got ${malformed.map((f) => safeEchoValue(testExecution[f])).join(', ')}).`
    );
  }

  const declaredUnmeasured = record?.metadata?.measured === false;
  if (!declaredUnmeasured && !isMeasuredExecution(testExecution)) {
    throw new Error(
      `storeSubAgentResults: TESTING verdict=${record.verdict} refused -- metadata.test_execution.tests_executed is ${testExecution.tests_executed}, ` +
      'not a genuine measured run (isMeasuredExecution requires tests_executed > 0), and metadata.measured is not explicitly false ' +
      '(an honest "nothing to measure" row must declare metadata.measured === false).'
    );
  }
}
