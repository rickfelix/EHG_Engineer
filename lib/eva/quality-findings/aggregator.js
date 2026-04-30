/**
 * Cross-venture pattern aggregator (Component F of SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001).
 *
 * Reads venture_quality_findings (Component B) across all ventures, groups by
 * (finding_category, severity, check_name), keeps groups with venture_count
 * >= MIN_VENTURE_COUNT (default 3), and emits structured patterns ready for
 * UPSERT into quality_finding_patterns. Closes the Stage 20 quality loop:
 * per-venture findings → per-venture remediations (Component C) → cross-venture
 * patterns → platform-level fixes that prevent recurrence.
 *
 * Idempotency: pattern_id is a deterministic FNV-1a-doubled hash of
 * (category|severity|check), matching the algorithm used in Component A's
 * computeFindingHash for shape consistency.
 *
 * @module lib/eva/quality-findings/aggregator
 */

import { FINDING_CATEGORIES } from './finding-shape.js';

const MIN_VENTURE_COUNT = 3;

/**
 * Suggested-action templates per finding category. Placeholders {check_name}
 * and {venture_count} are substituted at write time. Each category has a
 * non-empty template (AC-5 requirement).
 */
const SUGGESTED_ACTIONS = Object.freeze({
  npm_audit:    'Upgrade affected dependency to remediate {check_name} ({venture_count} ventures impacted). Pin in package.json across portfolio.',
  secrets:      'Rotate exposed secret matching {check_name}; add scanner rule to pre-commit. {venture_count} ventures need remediation.',
  lint:         'Add lint rule covering {check_name} to shared eslint config; fix {venture_count} ventures via codemod.',
  test_suite:   'Investigate suite-wide failure pattern {check_name} affecting {venture_count} ventures. Likely shared test fixture or env drift.',
  unit_test:    'Refactor unit test {check_name} (recurring across {venture_count} ventures). Extract shared helper or fix flaky assertion.',
  e2e_test:     'E2E pattern {check_name} fails in {venture_count} ventures. Check selectors, timing, or shared test data.',
  uat_test:     'UAT scenario {check_name} fails in {venture_count} ventures. Re-validate user journey and acceptance criteria.',
  bug_report:   'Recurring bug pattern {check_name} ({venture_count} ventures). Open platform-level RCA; likely shared component defect.',
  uat_signoff:  'UAT signoff {check_name} blocked in {venture_count} ventures. Coordinate chairman review; may indicate process gap.',
  capability:   'Capability {check_name} missing in {venture_count} ventures. Provision platform-wide or document optional fallback.',
});

/**
 * FNV-1a-doubled hash matching computeFindingHash in finding-shape.js.
 *
 * @param {string} input
 * @returns {string} 16-char hex hash
 */
function fnv1aDoubled(input) {
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET = 0x811c9dc5;
  let h1 = FNV_OFFSET;
  let h2 = FNV_OFFSET ^ 0xa3b1c2d4;
  for (let i = 0; i < input.length; i++) {
    const byte = input.charCodeAt(i);
    h1 ^= byte;
    h1 = Math.imul(h1, FNV_PRIME) >>> 0;
    h2 ^= (byte * 31) & 0xff;
    h2 = Math.imul(h2, FNV_PRIME) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}

/**
 * Compute deterministic pattern_id from (category, severity, check).
 *
 * @param {string} category
 * @param {string} severity
 * @param {string} checkName
 * @returns {string}
 */
export function computePatternId(category, severity, checkName) {
  return fnv1aDoubled(`${category}|${severity}|${checkName}`);
}

/**
 * Substitute {check_name} and {venture_count} placeholders in template.
 *
 * @param {string} template
 * @param {Object} ctx
 * @returns {string}
 */
function renderSuggestedAction(template, ctx) {
  return template
    .replace(/\{check_name\}/g, ctx.check_name)
    .replace(/\{venture_count\}/g, String(ctx.venture_count));
}

/**
 * Group findings by (category, severity, check), filter HAVING ≥ minVentureCount,
 * and return pattern objects ready for UPSERT.
 *
 * @param {Array<Object>} findings - rows from venture_quality_findings
 * @param {Object} [opts]
 * @param {number} [opts.minVentureCount=3]
 * @returns {Array<Object>} pattern objects
 */
export function aggregateFindings(findings, opts = {}) {
  const minVentureCount = opts.minVentureCount ?? MIN_VENTURE_COUNT;
  const groups = new Map();

  for (const f of findings) {
    if (!FINDING_CATEGORIES.includes(f.finding_category)) continue;

    const key = `${f.finding_category}|${f.severity}|${f.check_name}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        finding_category: f.finding_category,
        severity: f.severity,
        check_name: f.check_name,
        ventures: new Set(),
        sample_finding_ids: [],
        first_seen: f.created_at,
        last_seen: f.created_at,
      };
      groups.set(key, group);
    }
    group.ventures.add(f.venture_id);
    if (group.sample_finding_ids.length < 5) {
      group.sample_finding_ids.push(f.id);
    }
    if (f.created_at < group.first_seen) group.first_seen = f.created_at;
    if (f.created_at > group.last_seen) group.last_seen = f.created_at;
  }

  const patterns = [];
  for (const g of groups.values()) {
    if (g.ventures.size < minVentureCount) continue;

    const venture_count = g.ventures.size;
    const pattern_id = computePatternId(g.finding_category, g.severity, g.check_name);
    const template = SUGGESTED_ACTIONS[g.finding_category] || `Investigate {check_name} in {venture_count} ventures.`;

    patterns.push({
      pattern_id,
      finding_category: g.finding_category,
      severity: g.severity,
      check_name: g.check_name,
      venture_count,
      sample_finding_ids: g.sample_finding_ids,
      first_seen: g.first_seen,
      last_seen: g.last_seen,
      suggested_action: renderSuggestedAction(template, {
        check_name: g.check_name,
        venture_count,
      }),
      metadata: { aggregated_at: new Date().toISOString() },
    });
  }

  return patterns;
}

/**
 * UPSERT patterns into quality_finding_patterns. Idempotent: re-runs update
 * venture_count + last_seen but preserve first_seen via ON CONFLICT.
 *
 * @param {Object} supabase - service-role client
 * @param {Array<Object>} patterns
 * @returns {Promise<{inserted: number, updated: number, errors: Array}>}
 */
export async function upsertPatterns(supabase, patterns) {
  if (!patterns.length) return { inserted: 0, updated: 0, errors: [] };

  const errors = [];
  let inserted = 0;
  let updated = 0;

  for (const p of patterns) {
    const { data: existing } = await supabase
      .from('quality_finding_patterns')
      .select('pattern_id, first_seen')
      .eq('pattern_id', p.pattern_id)
      .maybeSingle();

    const row = { ...p };
    if (existing) {
      row.first_seen = existing.first_seen;
      updated++;
    } else {
      inserted++;
    }

    const { error } = await supabase
      .from('quality_finding_patterns')
      .upsert(row, { onConflict: 'pattern_id' });
    if (error) errors.push({ pattern_id: p.pattern_id, error: error.message });
  }

  return { inserted, updated, errors };
}

export { SUGGESTED_ACTIONS, MIN_VENTURE_COUNT };
