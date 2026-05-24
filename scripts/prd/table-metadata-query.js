/**
 * Live table metadata for PRD grounding — SD-FDBK-ENH-PRD-AUTHORING-QUERY-001.
 *
 * Extracts the table names an SD references, looks up LIVE row counts + actual
 * column names, and formats a markdown section injected into the PRD LLM context
 * (by buildPRDGenerationContext) so generated FRs match production reality instead
 * of assuming wrong row counts or non-existent columns.
 *
 * VERIFY-FIRST NOTE: PostgREST does NOT expose information_schema (querying
 * `information_schema.columns`/`.tables` via supabase-js fails with PGRST205). So
 * validation + introspection use PostgREST-native probes instead:
 *   - existence + columns: `select('*').limit(1)` — PGRST205 ⇒ table does not exist
 *     (skip); otherwise the sample row's keys are the real columns.
 *   - row count: head `select('*', { count: 'exact', head: true })`.
 * Behaviour matches the PRD success criteria (real count, real columns, hallucinated
 * names filtered); only the mechanism differs from the PRD's information_schema wording.
 *
 * Fully FAIL-SOFT: every path swallows errors and returns '' (no section) so PRD
 * generation is never broken by missing credentials, an empty table, or a query error.
 */

const SECTION_HEADER = '## LIVE TABLE METADATA (PRODUCTION REALITY CHECK)';
const MAX_TABLES = 50;
const MAX_COLUMNS_SHOWN = 60;

// snake_case identifiers (>=2 segments) that plausibly name a table. Correctness does
// not depend on this being precise — every candidate is validated against the live DB,
// so false positives are simply skipped. The stopword set just avoids wasted probes.
const TABLE_TOKEN_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const STOPWORDS = new Set([
  'target_application', 'sub_agent', 'sub_agents', 'key_changes', 'success_criteria',
  'success_metrics', 'acceptance_criteria', 'functional_requirements', 'technical_requirements',
  'test_scenarios', 'service_role', 'service_role_key', 'pull_request', 'feature_flag',
  'fail_soft', 'row_count', 'row_counts', 'production_reality'
]);

/**
 * Extract candidate table names from the SD + the DATABASE sub-agent analysis.
 * @returns {string[]} de-duplicated candidate names (capped)
 */
export function extractTableNamesFromSD(sd = {}, context = {}) {
  const names = new Set();

  // 1. DATABASE sub-agent output (highest confidence) — affected_tables / new_tables / tables.
  const dbAnalysis = context.databaseAnalysis;
  if (dbAnalysis) {
    const text = typeof dbAnalysis === 'string' ? dbAnalysis : JSON.stringify(dbAnalysis);
    for (const key of ['affected_tables', 'new_tables', 'tables']) {
      const m = new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`).exec(text);
      if (m) {
        for (const raw of m[1].split(',')) {
          const v = raw.replace(/["'\s]/g, '');
          if (v && /^[a-z][a-z0-9_]*$/.test(v)) names.add(v);
        }
      }
    }
  }

  // 2. snake_case identifiers in the SD scope / description / key_changes text.
  const parts = [sd.scope, sd.description];
  if (Array.isArray(sd.key_changes)) {
    parts.push(sd.key_changes.map((k) => (typeof k === 'string' ? k : k && k.change) || '').join(' '));
  }
  const blob = parts.filter(Boolean).join(' ').toLowerCase();
  let mm;
  while ((mm = TABLE_TOKEN_RE.exec(blob)) !== null) {
    if (!STOPWORDS.has(mm[0])) names.add(mm[0]);
  }

  return [...names].slice(0, MAX_TABLES);
}

/**
 * For each candidate, validate existence and read live row count + columns.
 * Invalid (non-existent) tables are filtered out. FAIL-SOFT per table.
 * @returns {Promise<Array<{table:string,rowCount:number|null,columns:string[]}>>}
 */
export async function queryLiveTableMetadata(supabase, names) {
  if (!supabase || !Array.isArray(names) || names.length === 0) return [];
  const results = [];
  for (const table of names) {
    try {
      // Probe: validates existence (PGRST205 ⇒ skip) and yields real columns.
      const probe = await supabase.from(table).select('*').limit(1);
      if (probe.error) continue; // non-existent / not exposed — skip silently
      const columns = probe.data && probe.data[0] ? Object.keys(probe.data[0]) : [];

      let rowCount = null;
      try {
        const cnt = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (!cnt.error && typeof cnt.count === 'number') rowCount = cnt.count;
      } catch (_) { /* count is best-effort */ }

      results.push({ table, rowCount, columns });
    } catch (_) {
      // fail-soft per table
    }
  }
  return results;
}

/**
 * Format the validated metadata into the markdown section.
 * @returns {string} markdown section, or '' when there is nothing to show
 */
export function formatTableMetadataSection(results) {
  if (!Array.isArray(results) || results.length === 0) return '';
  const lines = [
    SECTION_HEADER,
    '',
    'Live values for tables referenced by this SD. **Generated FRs MUST match these** —',
    'do not assume row counts or column names that contradict this section.',
    ''
  ];
  for (const r of results) {
    const count = r.rowCount === null ? 'unknown' : String(r.rowCount);
    lines.push(`### \`${r.table}\` — ${count} row(s)`);
    if (r.columns.length) {
      const shown = r.columns.slice(0, MAX_COLUMNS_SHOWN);
      const extra = r.columns.length > MAX_COLUMNS_SHOWN ? ` (+${r.columns.length - MAX_COLUMNS_SHOWN} more)` : '';
      lines.push(`Columns: ${shown.map((c) => `\`${c}\``).join(', ')}${extra}`);
    } else {
      lines.push('Columns: (empty table — no sample row available; only row count is authoritative)');
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Orchestrator: extract → query → format. Returns '' on any miss. Never throws.
 * @returns {Promise<string>}
 */
export async function buildLiveTableMetadataSection(supabase, sd, context = {}) {
  if (!supabase) return '';
  try {
    const names = extractTableNamesFromSD(sd, context);
    if (names.length === 0) return '';
    const results = await queryLiveTableMetadata(supabase, names);
    const section = formatTableMetadataSection(results);
    if (section) console.log(`   📋 Injected live table metadata for ${results.length} table(s): ${results.map((r) => r.table).join(', ')}`);
    return section;
  } catch (e) {
    console.log(`   ℹ️  Live table metadata skipped: ${e.message}`);
    return '';
  }
}
