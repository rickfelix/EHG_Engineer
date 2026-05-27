#!/usr/bin/env node
/**
 * Vision Readiness Report (read-only diagnostic)
 *
 * SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001 FR-3: single-statement remediation queue
 * for the ~56 unready eva_vision_documents rows. Produces JSON + console table that
 * operators use to prioritize Stage-4 enrichment campaigns. Never writes — purely
 * diagnostic.
 *
 * Output: console table + JSON artifact at .rca/vision-readiness-report-<timestamp>.json
 *
 * Usage:
 *   node scripts/eva/vision-readiness-report.mjs
 *   npm run vision:readiness:report
 *
 * recommended_action enum:
 *   STUB_DELETE_OR_REGENERATE — status=draft_seed OR content length < 100 chars
 *   EXPAND_CONTENT             — content length 100-500 (has substance but below readiness threshold)
 *   RUN_DIMENSION_EXTRACTOR    — content length > 500 but extracted_dimensions IS NULL
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

async function main() {
  const supabase = createSupabaseServiceClient();

  // Fetch ALL eva_vision_documents (single query); filter readiness in JS
  // because Postgrest doesn't support length()-on-text in .or() clause cleanly.
  // Readiness predicate (per design-agent): extracted_dimensions IS NOT NULL
  // AND char_length(content) > 500 AND status='active'.
  // Unready = NOT(readiness predicate) — captured by per-row filter below.
  const { data: unreadyDocs, error } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, venture_id, level, status, content, extracted_dimensions');

  if (error) {
    console.error('[vision-readiness-report] query failed:', error.message);
    process.exit(1);
  }

  // Compute readiness flags + recommended_action per row
  const enriched = (unreadyDocs || [])
    .map((row) => {
      const contentLength = typeof row.content === 'string' ? row.content.length : 0;
      const hasExtractedDimensions = Array.isArray(row.extracted_dimensions) && row.extracted_dimensions.length > 0;
      const isUnready = !hasExtractedDimensions || contentLength <= 500 || row.status === 'draft_seed';
      if (!isUnready) return null;

      let recommended_action;
      if (row.status === 'draft_seed' || contentLength < 100) {
        recommended_action = 'STUB_DELETE_OR_REGENERATE';
      } else if (contentLength <= 500) {
        recommended_action = 'EXPAND_CONTENT';
      } else {
        recommended_action = 'RUN_DIMENSION_EXTRACTOR';
      }

      return {
        vision_key: row.vision_key,
        venture_id: row.venture_id,
        level: row.level,
        status: row.status,
        content_length: contentLength,
        missing_dimensions: !hasExtractedDimensions,
        recommended_action,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.recommended_action !== b.recommended_action) {
        return a.recommended_action.localeCompare(b.recommended_action);
      }
      return String(a.venture_id || '').localeCompare(String(b.venture_id || ''));
    });

  // Summary by recommended_action
  const summary = enriched.reduce((acc, r) => {
    acc[r.recommended_action] = (acc[r.recommended_action] || 0) + 1;
    return acc;
  }, {});

  console.log('\n=== Vision Readiness Report ===');
  console.log(`Total unready docs: ${enriched.length}`);
  console.log('Breakdown by recommended_action:');
  for (const [action, count] of Object.entries(summary)) {
    console.log(`  ${action.padEnd(30)} ${count}`);
  }
  console.log('');

  // Console table (limit to first 20 for readability)
  if (enriched.length > 0) {
    const preview = enriched.slice(0, 20);
    console.table(preview.map((r) => ({
      vision_key: r.vision_key,
      level: r.level,
      status: r.status,
      length: r.content_length,
      missing_dims: r.missing_dimensions,
      action: r.recommended_action,
    })));
    if (enriched.length > 20) {
      console.log(`... ${enriched.length - 20} more rows in JSON artifact`);
    }
  }

  // Write JSON artifact
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = path.join(REPO_ROOT, '.rca');
  await fs.mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `vision-readiness-report-${timestamp}.json`);
  await fs.writeFile(artifactPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    sd_reference: 'SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001',
    total_unready: enriched.length,
    summary,
    rows: enriched,
  }, null, 2), 'utf8');

  console.log(`\nJSON artifact: ${artifactPath}`);
  console.log('Report complete. No DB writes performed (read-only diagnostic).');
}

main().catch((err) => {
  console.error('[vision-readiness-report] fatal:', err.message);
  process.exit(1);
});
