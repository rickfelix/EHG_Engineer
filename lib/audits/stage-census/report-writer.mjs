/**
 * Census markdown report renderer (FR-5). Pure function -- takes an aggregated result object,
 * returns a markdown string. Follows the scripts/audits/* -> docs/audits/*-census.md convention
 * (5 existing precedent pairs): a Generated timestamp, the SD key, and the literal re-run
 * command, so the document is falsifiable rather than a point-in-time claim nobody can re-check.
 */

const RE_RUN_COMMAND = 'node scripts/audits/stage-21-26-census.mjs';
const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A';

/**
 * @param {object} result
 * @param {string} result.generatedAt - ISO timestamp (caller-supplied; this module never calls Date.now())
 * @param {Array} result.codeFindings - [{repo, file, line, match, stageNumber, classification}]
 * @param {Array} result.dbFindings - per-surface DB sweep results, each {surface, rows, classification}
 * @param {{ok: boolean, matched: Array}} result.negativeControl
 * @returns {string}
 */
export function renderCensusReport(result) {
  const { generatedAt, codeFindings = [], dbFindings = [], negativeControl } = result;

  const lines = [];
  lines.push('# Stage 21-26 Census');
  lines.push('');
  lines.push(`- **Generated**: ${generatedAt}`);
  lines.push(`- **SD**: ${SD_KEY}`);
  lines.push(`- **Re-run command**: \`${RE_RUN_COMMAND}\``);
  lines.push(`- **Scope**: 2 filesystem repos (EHG_Engineer, ehg) + 1 shared database (not 2 separate databases)`);
  lines.push('');
  lines.push('## Negative Control');
  lines.push('');
  if (negativeControl?.ok) {
    lines.push('PASS -- both known-live stage 21/22 `component_path` mismatches were detected:');
    lines.push('');
    for (const m of negativeControl.matched) {
      lines.push(`- stage_number=${m.stage_number} -> component_path=\`${m.component_path}\``);
    }
  } else {
    lines.push('**FAILED** -- see instrument exit code / logs. This document should not be trusted if committed with a failed negative control.');
  }
  lines.push('');

  lines.push('## Per-Surface Findings');
  lines.push('');
  lines.push('| Surface | Count | Classification |');
  lines.push('|---|---|---|');
  for (const surface of dbFindings) {
    lines.push(`| ${surface.surface} | ${surface.rows.length} | ${surface.classification || '-'} |`);
  }
  const codeByRepo = groupBy(codeFindings, (f) => f.repo);
  for (const [repo, findings] of Object.entries(codeByRepo)) {
    lines.push(`| Code sweep: ${repo} | ${findings.length} | see detail below |`);
  }
  lines.push('');

  lines.push('## Code Findings Detail');
  lines.push('');
  if (codeFindings.length === 0) {
    lines.push('0 findings.');
  } else {
    lines.push('| Repo | File | Line | Match | Classification |');
    lines.push('|---|---|---|---|---|');
    for (const f of codeFindings) {
      lines.push(`| ${f.repo} | ${f.file} | ${f.line} | \`${f.match}\` | ${f.classification?.label || '-'} |`);
    }
  }
  lines.push('');

  lines.push('## Database Findings Detail');
  lines.push('');
  for (const surface of dbFindings) {
    lines.push(`### ${surface.surface}`);
    lines.push('');
    if (surface.rows.length === 0) {
      lines.push('0 findings.');
    } else {
      lines.push('```json');
      lines.push(JSON.stringify(surface.rows, null, 2));
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!out[key]) out[key] = [];
    out[key].push(item);
  }
  return out;
}
