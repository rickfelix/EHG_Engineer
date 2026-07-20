#!/usr/bin/env node
/**
 * SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-C (FR-3) — S19 vision
 * section-coverage drift gauge.
 *
 * Surfaces any venture at lifecycle_stage=19 (venture_stage_work) whose L2 vision document sits
 * below the 8-of-10 standard-section-coverage minimum enforced by auto_validate_vision_quality
 * (database/migrations/20260314_quality_validation_vision_docs.sql) — reuses that trigger's EXACT
 * 10-key list and 50-char substantive-section threshold so this gauge and the DB-enforced quality
 * bar never drift apart.
 *
 * Persists a historized snapshot to codebase_health_snapshots (dimension=
 * 's19_vision_section_coverage_gap', target_application='EHG') on every run — no new table.
 * Fail-soft: a query error still writes a snapshot (available=false), never silently skips, mirroring
 * scripts/vision-gauge-refresh.mjs's existing contract.
 *
 * Usage:
 *   node scripts/s19-vision-coverage-gauge.mjs            # compute + persist a snapshot
 *   node scripts/s19-vision-coverage-gauge.mjs --dry-run  # compute + print, do NOT write
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

// Mirrors auto_validate_vision_quality's v_standard_keys array
// (database/migrations/20260314_quality_validation_vision_docs.sql) exactly — keep in lockstep.
export const STANDARD_SECTION_KEYS = [
  'executive_summary', 'problem_statement', 'success_criteria',
  'personas', 'out_of_scope', 'evolution_plan',
  'information_architecture', 'key_decision_points',
  'integration_patterns', 'ui_ux_wireframes',
];

// Mirrors auto_validate_vision_quality's SUBSTANTIVE_SECTION_MIN_CHARS floor.
export const SUBSTANTIVE_SECTION_MIN_CHARS = 50;
export const COVERAGE_MINIMUM = 8;

/**
 * Pure: count how many of the 10 standard sections are present at >=50 chars in a vision doc's
 * `sections` JSONB. No DB/IO — unit-testable in isolation.
 * @param {Record<string, string>|null|undefined} sections
 * @returns {number}
 */
export function countStandardSectionCoverage(sections) {
  if (!sections || typeof sections !== 'object') return 0;
  let count = 0;
  for (const key of STANDARD_SECTION_KEYS) {
    const value = sections[key];
    if (typeof value === 'string' && value.length >= SUBSTANTIVE_SECTION_MIN_CHARS) count += 1;
  }
  return count;
}

/**
 * Pure: given a list of { venture_id, vision_key, sections } rows for S19 ventures' L2 visions,
 * compute the gauge — which ones are below the coverage minimum, and a summary count.
 * @param {Array<{venture_id: string, vision_key: string, sections: object|null}>} rows
 * @returns {{ total: number, below_minimum: number, findings: Array<{venture_id: string, vision_key: string, section_count: number}> }}
 */
export function computeS19CoverageGauge(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const findings = [];
  for (const row of list) {
    const section_count = countStandardSectionCoverage(row?.sections);
    if (section_count < COVERAGE_MINIMUM) {
      findings.push({ venture_id: row.venture_id, vision_key: row.vision_key, section_count });
    }
  }
  return { total: list.length, below_minimum: findings.length, findings };
}

async function fetchS19VisionRows(supabase) {
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: venture_stage_work grows with
  // portfolio size — a stage-19 snapshot is not provably <1000 long-term; paginate both reads.
  const stageRows = await fetchAllPaginated(() => supabase
    .from('venture_stage_work')
    .select('venture_id')
    .eq('lifecycle_stage', 19)
    .order('id', { ascending: true }));

  const ventureIds = [...new Set(stageRows.map((r) => r.venture_id).filter(Boolean))];
  if (ventureIds.length === 0) return [];

  const visionRows = await fetchAllPaginated(() => supabase
    .from('eva_vision_documents')
    .select('venture_id, vision_key, sections')
    .eq('level', 'L2')
    .in('venture_id', ventureIds)
    .order('id', { ascending: true }));

  return visionRows;
}

export function buildSnapshotRow(gauge, error) {
  const available = !error && !!gauge;
  return {
    dimension: 's19_vision_section_coverage_gap',
    target_application: 'EHG',
    score: available ? (gauge.total === 0 ? 100 : Number((((gauge.total - gauge.below_minimum) / gauge.total) * 100).toFixed(2))) : 0,
    findings: available ? gauge.findings : [],
    trend_direction: 'new',
    metadata: {
      available,
      total: available ? gauge.total : null,
      below_minimum: available ? gauge.below_minimum : null,
      error: error ? String(error.message || error) : undefined,
    },
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[s19-vision-coverage-gauge] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  let gauge = null;
  let queryError = null;
  try {
    const rows = await fetchS19VisionRows(supabase);
    gauge = computeS19CoverageGauge(rows);
  } catch (e) {
    queryError = e;
    console.error('[s19-vision-coverage-gauge] query failed (fail-soft, still recording snapshot): ' + (e?.message || e));
  }

  if (gauge) {
    console.log(`[s19-vision-coverage-gauge] S19 ventures=${gauge.total} below_minimum=${gauge.below_minimum}`);
    for (const f of gauge.findings) {
      console.log(`[s19-vision-coverage-gauge]   ${f.venture_id} (${f.vision_key}): ${f.section_count}/10 sections`);
    }
  }

  const row = buildSnapshotRow(gauge, queryError);

  if (dryRun) { console.log('[s19-vision-coverage-gauge] --dry-run: not persisted. snapshot=' + JSON.stringify(row)); return; }

  const { error: insertError } = await supabase.from('codebase_health_snapshots').insert(row);
  if (insertError) {
    console.error('[s19-vision-coverage-gauge] snapshot insert failed: ' + insertError.message);
    process.exit(1);
  }
  console.log('[s19-vision-coverage-gauge] snapshot persisted to codebase_health_snapshots');
}

// Entrypoint guard: only run when executed directly, so importing the pure exports in a unit test
// does NOT connect to the DB or exit — mirrors scripts/vision-gauge-refresh.mjs's contract.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[s19-vision-coverage-gauge] UNHANDLED: ' + (e?.message || e)); process.exit(1); });
}
