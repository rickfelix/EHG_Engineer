/**
 * Stage-keyed data/config census disposition-table renderer (SD-LEO-INFRA-STAGE-KEYED-DATA-001,
 * FR-1/FR-2/TR-4). Pure function -- takes an aggregated result object, returns a markdown string.
 * Sibling to report-writer.mjs's code-census renderer, but this one is a DISPOSITION table (per
 * surface: shift | shim | accepted-as-broken with owner+re_review_by), not a raw findings dump --
 * the data/config surface needs a decision recorded, not just a count, per this SD's own success
 * criteria: "every surface identified... carries an explicit recorded disposition."
 */

const RE_RUN_COMMAND = 'node scripts/audits/stage-keyed-data-config-census.mjs';
const SD_KEY = 'SD-LEO-INFRA-STAGE-KEYED-DATA-001';

/**
 * @param {object} result
 * @param {string} result.generatedAt - ISO timestamp (caller-supplied; this module never calls Date.now())
 * @param {{ok: boolean, count: number}} result.negativeControl
 * @param {Array<{surface:string, column:string, liveRowCount:number, disposition:string, reason:string, owner:string, reReviewBy:string}>} result.dispositions
 * @param {Array<{table_name:string, constraint_name:string, definition:string, columns:string[]}>} result.checkConstraints
 * @returns {string}
 */
export function renderDataConfigCensusReport(result) {
  const { generatedAt, negativeControl, dispositions = [], checkConstraints = [] } = result;

  const lines = [];
  lines.push('# Stage-Keyed Data & Config Census');
  lines.push('');
  lines.push(`- **Generated**: ${generatedAt}`);
  lines.push(`- **SD**: ${SD_KEY}`);
  lines.push(`- **Re-run command**: \`${RE_RUN_COMMAND}\``);
  lines.push('- **Scope**: DATA and CONFIG surfaces (live rows + CHECK constraints), the counterpart to the CODE-side census in docs/audits/stage-21-26-census.md (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A)');
  lines.push('');

  lines.push('## Negative Control');
  lines.push('');
  if (negativeControl?.ok) {
    lines.push(`PASS -- ${negativeControl.count} live CHECK constraint(s) containing the literal '26' on a stage-bearing column were detected, meeting the measured floor.`);
  } else {
    lines.push('**FAILED** -- see instrument exit code / logs. This document should not be trusted if committed with a failed negative control.');
  }
  lines.push('');

  lines.push('## Disposition Table');
  lines.push('');
  lines.push(`${dispositions.length} surfaces carry an explicit recorded disposition.`);
  lines.push('');
  lines.push('| Surface | Column | Live Row Count (23-26) | Disposition | Reason | Owner | Re-review By |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const d of dispositions) {
    lines.push(
      `| ${d.surface} | ${d.column} | ${d.liveRowCount} | ${d.disposition} | ${d.reason} | ${d.owner} | ${d.reReviewBy} |`
    );
  }
  lines.push('');

  lines.push('## Live CHECK Constraints Containing \'26\' (stage-bearing columns only)');
  lines.push('');
  if (checkConstraints.length === 0) {
    lines.push('0 findings.');
  } else {
    lines.push('| Table | Constraint | Columns | Definition |');
    lines.push('|---|---|---|---|');
    for (const c of checkConstraints) {
      lines.push(`| ${c.table_name} | ${c.constraint_name} | ${formatColumns(c.columns)} | \`${c.definition}\` |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Normalizes a Postgres text[] column value to a display string. node-pg parses text[] into a JS
 * array via its built-in OID 1009 parser under normal use, but this repo's pooled/pgbouncer
 * connection path can bypass that parser and hand back the raw '{a,b,c}' literal instead -- accept
 * either shape rather than assuming one.
 * @param {string[]|string|null|undefined} columns
 */
function formatColumns(columns) {
  if (Array.isArray(columns)) return columns.join(', ');
  if (typeof columns === 'string') return columns.replace(/^\{|\}$/g, '').split(',').filter(Boolean).join(', ');
  return '';
}
