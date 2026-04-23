/**
 * Protocol Consistency Linter — engine.
 *
 * Runs every registered rule against a context object containing the
 * `leo_protocol_sections` snapshot (and optionally other inputs such as
 * generator code for hardcoded-vs-DB rules). Collects violations, applies
 * severity, and returns a result suitable for persistence to
 * `leo_lint_run_history` + `leo_lint_violations`.
 *
 * SD-PROTOCOL-LINTER-001, slice 2/n.
 */

import { loadRules } from './rule-loader.mjs';

/**
 * @typedef {object} LintContext
 * @property {Array<{id:string, section_name?:string, content?:string, section_type?:string, anchor_topic?:string|null}>} sections
 * @property {object} [protocol]
 * @property {string} [generatorCode]
 */

/**
 * @typedef {object} LintViolation
 * @property {string} rule_id
 * @property {'warn'|'block'} severity
 * @property {string} message
 * @property {string|null} section_id
 * @property {string|null} file_path
 * @property {object} context
 */

/**
 * @typedef {object} LintResult
 * @property {'audit'|'regen'|'precommit'} mode
 * @property {number} duration_ms
 * @property {number} rules_evaluated
 * @property {LintViolation[]} violations
 * @property {number} critical_count
 * @property {boolean} passed
 */

/**
 * Run the protocol linter.
 * @param {{mode?:'audit'|'regen'|'precommit', ctx?:LintContext, rules?:Array}} opts
 * @returns {Promise<LintResult>}
 */
export async function runProtocolLint({ mode = 'audit', ctx = {}, rules } = {}) {
  const loaded = rules ?? await loadRules();
  const violations = [];
  const started = Date.now();

  for (const rule of loaded) {
    if (rule.enabled === false) continue;
    try {
      const out = await rule.check(ctx);
      for (const v of (out || [])) {
        violations.push({
          rule_id: rule.id,
          severity: rule.severity,
          message: v.message,
          section_id: v.section_id ?? null,
          file_path: v.file_path ?? null,
          context: v.context ?? {}
        });
      }
    } catch (err) {
      // Rule crashes are themselves warn-severity violations so the sweep
      // never aborts on a buggy rule.
      violations.push({
        rule_id: rule.id,
        severity: 'warn',
        message: `Rule check threw: ${err.message}`,
        section_id: null,
        file_path: null,
        context: { error: err.stack }
      });
    }
  }

  const critical_count = violations.filter(v => v.severity === 'block').length;
  return {
    mode,
    duration_ms: Date.now() - started,
    rules_evaluated: loaded.length,
    violations,
    critical_count,
    passed: critical_count === 0
  };
}
