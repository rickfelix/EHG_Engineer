#!/usr/bin/env node
/**
 * Migrate existing vision/architecture documents' content → sections JSONB.
 * SD-LEO-INFRA-DATABASE-FIRST-VISION-001
 *
 * Usage:
 *   node scripts/eva/migrate-content-to-sections.mjs [--dry-run]
 *
 * Reads the `content` column, parses into sections using the markdown parser,
 * and writes the parsed sections to the `sections` JSONB column.
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { parseMarkdownToSections, buildDefaultMapping } from './markdown-to-sections-parser.mjs';
import { buildSectionKeyMapping } from './document-section-registry.mjs';

const dryRun = process.argv.includes('--dry-run');
const supabase = createSupabaseServiceClient();

async function migrateTable(tableName, documentType, keyColumn) {
  console.log(`\n--- ${tableName} (${documentType}) ---`);

  // Build mapping from DB schema
  let mapping;
  try {
    mapping = await buildSectionKeyMapping(documentType, { supabase });
  } catch {
    console.log('  Falling back to default mapping');
    mapping = buildDefaultMapping();
  }

  const { data: rows, error } = await supabase
    .from(tableName)
    .select(`${keyColumn}, content, sections`);

  if (error) {
    console.error(`  Error loading ${tableName}: ${error.message}`);
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const key = row[keyColumn];

    // Skip if sections already populated
    if (row.sections && Object.keys(row.sections).length > 0) {
      console.log(`  ${key}: already has sections, skipping`);
      success++;
      continue;
    }

    if (!row.content || row.content.trim().length < 100) {
      console.log(`  ${key}: content too short (${row.content?.length || 0} chars), skipping`);
      failed++;
      continue;
    }

    const sections = parseMarkdownToSections(row.content, mapping);
    const sectionCount = Object.keys(sections).length;

    if (sectionCount === 0) {
      console.log(`  ${key}: no sections parsed, skipping`);
      failed++;
      continue;
    }

    if (dryRun) {
      console.log(`  ${key}: would write ${sectionCount} sections`);
      success++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from(tableName)
      .update({ sections })
      .eq(keyColumn, key);

    if (updateErr) {
      console.log(`  ${key}: update failed - ${updateErr.message}`);
      failed++;
    } else {
      console.log(`  ${key}: wrote ${sectionCount} sections`);
      success++;
    }
  }

  console.log(`  Result: ${success} success, ${failed} failed`);
  return { success, failed };
}

console.log(`Migration mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

const visionResult = await migrateTable('eva_vision_documents', 'vision', 'vision_key');
const archResult = await migrateTable('eva_architecture_plans', 'architecture_plan', 'plan_key');

console.log('\n--- Summary ---');
console.log(`Vision:  ${visionResult.success} success, ${visionResult.failed} failed`);
console.log(`Arch:    ${archResult.success} success, ${archResult.failed} failed`);
console.log(`Total:   ${visionResult.success + archResult.success} success, ${visionResult.failed + archResult.failed} failed`);
