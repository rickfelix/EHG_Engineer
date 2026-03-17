#!/usr/bin/env node
// EHG Backlog Import Script - Version 2
// Uses existing strategic_directives_v2 table
// Non-lossy import preserving all nuance

import { program } from 'commander';
import XLSX from 'xlsx';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Generate import run ID for this session
const IMPORT_RUN_ID = uuidv4();

// Helper functions
function parseBoolean(v) { 
  if (v == null) return false; 
  const s = String(v).trim().toLowerCase(); 
  return ['y', 'yes', 'true', '1'].includes(s); 
}

function normTriage(v) {
  if (!v) return null; 
  const s = String(v).trim().toLowerCase();
  // Map critical to High as requested
  if (s.includes('critical') || s === 'h' || s === 'hi' || s.includes('high')) return 'High';
  if (s === 'm' || s.includes('med') || s.includes('medium')) return 'Medium';
  if (s === 'l' || s.includes('low')) return 'Low';
  if (s.includes('future')) return 'Future';
  return null;
}

const MUST_RE = /\bmust[- ]have\b/i;
const NICE_RE = /\bnice[- ]to[- ]have\b/i;

function trimToNull(val) {
  if (val == null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

function extractSDData(row) {
  // Map to strategic_directives_v2 structure
  return {
    id: trimToNull(row['SD ID']), // Use id field, not sd_id
    title: trimToNull(row['SD Title']) || 'Untitled SD',
    sequence_rank: parseInt(row['Sequence Rank']) || 999,
    // Map page info to category (existing field)
    category: trimToNull(row['Page Category']) || 'Uncategorized',
    // Store page_title in metadata for now
    readiness: row['Readiness'] != null ? parseFloat(row['Readiness']) : null,
    must_have_density: row['Must Have Density'] != null ? parseFloat(row['Must Have Density']) : null,
    new_module_pct: row['New Module %'] != null ? parseFloat(row['New Module %']) : null,
    // Lifecycle fields
    import_run_id: IMPORT_RUN_ID,
    present_in_latest_import: true,
    // Store page_title in metadata
    metadata: {
      page_title: trimToNull(row['Page Title']),
      import_source: 'ehg_backlog_excel',
      import_date: new Date().toISOString()
    }
  };
}

function extractItemData(row, sdId) {
  const mappedColumns = new Set([
    'SD ID', 'Sequence Rank', 'SD Title', 'Page Category', 'Page Title',
    'Back Log ID', 'Title', 'Description', 'Description.1', 'My Comments',
    'Priority', 'Stage Number', 'Phase', 'New Module',
    'Readiness', 'Must Have Density', 'New Module %'
  ]);
  
  const extras = {};
  Object.keys(row).forEach(key => {
    if (!mappedColumns.has(key) && row[key] != null) {
      const val = trimToNull(row[key]);
      if (val !== null) {
        extras[key] = val;
      }
    }
  });
  
  // Preserve typo explicitly
  if (row['Phase Descriotion'] != null) {
    const val = trimToNull(row['Phase Descriotion']);
    if (val !== null) {
      extras['Phase Descriotion'] = val;
    }
  }
  
  return {
    sd_id: sdId, // Link to strategic_directives_v2.id
    backlog_id: trimToNull(row['Back Log ID']) || '',
    backlog_title: trimToNull(row['Title']) || '',
    description_raw: trimToNull(row['Description']) || '',      // for tag parsing
    item_description: trimToNull(row['Description.1']) || '',   // actual item text
    my_comments: trimToNull(row['My Comments']) || '',
    priority: trimToNull(row['Priority']) || '',
    stage_number: row['Stage Number'] != null ? parseInt(row['Stage Number']) : null,
    phase: trimToNull(row['Phase']) || '',
    new_module: parseBoolean(row['New Module']),
    extras: Object.keys(extras).length > 0 ? extras : {},
    // Lifecycle fields
    import_run_id: IMPORT_RUN_ID,
    present_in_latest_import: true
  };
}

function calculateRollups(items) {
  let H = 0, M = 0, L = 0, F = 0, must = 0, nice = 0;
  
  for (const it of items) {
    const tri = normTriage(it.my_comments);
    if (tri === 'High') H++;
    else if (tri === 'Medium') M++;
    else if (tri === 'Low') L++;
    else if (tri === 'Future') F++;
    
    // Parse tags from description_raw (not item_description)
    if (MUST_RE.test(it.description_raw)) must++;
    if (NICE_RE.test(it.description_raw)) nice++;
  }
  
  const total = items.length;
  const triScore = total ? (1.0 * H + 0.6 * M + 0.3 * L) / total : 0;
  
  // Rolled triage calculation as specified
  const rolled = (F >= (H + M + L) && total) ? 'Future' : 
                 (triScore >= 0.80 ? 'High' : 
                  triScore >= 0.50 ? 'Medium' : 'Low');
  
  return {
    h_count: H,
    m_count: M,
    l_count: L,
    future_count: F,
    must_have_count: must,
    wish_list_count: nice,
    must_have_pct: total ? +(100 * must / total).toFixed(2) : 0,
    rolled_triage: rolled
  };
}

function computeChecksum(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function generateSDId(row) {
  const title = row['SD Title'] || row['Title'] || 'UNKNOWN';
  const seq = row['Sequence Rank'] || '999';
  return `SD-GEN-${seq}-${title.substring(0, 20).replace(/\s+/g, '-').toUpperCase()}`;
}

program
  .option('--file <path>', 'Path to Excel file')
  .option('--dry-run', 'Preview without importing')
  .option('--strict', 'Fail on validation warnings')
  .parse();

const options = program.opts();

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🚀 EHG Backlog Import Tool (v2 - Using Existing Tables)');
  console.log(`${'='.repeat(60)}`);
  console.log(`📝 Import Run ID: ${IMPORT_RUN_ID}`);
  console.log(`🔄 Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
  console.log('📊 Target: strategic_directives_v2 (existing table)');
  console.log(`${'='.repeat(60)}\n`);
  
  // 1. Resolve file path
  let filePath;
  if (options.file) {
    filePath = options.file;
  } else {
    filePath = '/mnt/c/Users/rickf/Dropbox/_EHG/_EHG/EHG Backlog for Claude.xlsx';
  }
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  // 2. Compute checksum
  const checksum = computeChecksum(filePath);
  console.log(`📁 Loading: ${path.basename(filePath)}`);
  console.log(`🔐 SHA256: ${checksum.substring(0, 32)}...`);
  
  // 3. Load workbook
  const workbook = XLSX.readFile(filePath);
  const sheetName = 'Backlog';
  
  if (!workbook.Sheets[sheetName]) {
    console.error(`❌ Sheet "${sheetName}" not found`);
    console.log('Available sheets:', Object.keys(workbook.Sheets));
    process.exit(1);
  }
  
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`📊 Found ${rows.length} rows in "${sheetName}" sheet\n`);
  
  // 4. Group rows by SD ID
  const sdGroups = {};
  const warnings = [];
  const backlogIdUsage = {}; // Track backlog ID usage across SDs
  
  rows.forEach((row, idx) => {
    let sdId = trimToNull(row['SD ID']);
    
    if (!sdId) {
      sdId = generateSDId(row);
      warnings.push({
        type: 'generated_id',
        row: idx + 2,
        message: `Generated SD ID: ${sdId} for row without SD ID`
      });
    }
    
    if (!sdGroups[sdId]) {
      sdGroups[sdId] = {
        sd_data: extractSDData(row),
        items: [],
        titles: new Set(),
        pages: new Set()
      };
    }
    
    // Track for consistency checks
    const title = trimToNull(row['SD Title']);
    const page = trimToNull(row['Page Title']);
    if (title) sdGroups[sdId].titles.add(title);
    if (page) sdGroups[sdId].pages.add(page);
    
    const item = extractItemData(row, sdId);
    sdGroups[sdId].items.push(item);
    
    // Track backlog ID usage
    if (item.backlog_id) {
      if (!backlogIdUsage[item.backlog_id]) {
        backlogIdUsage[item.backlog_id] = new Set();
      }
      backlogIdUsage[item.backlog_id].add(sdId);
    }
  });
  
  // Check for duplicate backlog IDs across SDs
  Object.entries(backlogIdUsage).forEach(([backlogId, sdSet]) => {
    if (sdSet.size > 1) {
      warnings.push({
        type: 'duplicate_backlog_id',
        backlog_id: backlogId,
        message: `Backlog ID "${backlogId}" appears in ${sdSet.size} SDs: ${Array.from(sdSet).join(', ')}`
      });
    }
  });
  
  // 5. Consistency checks
  Object.entries(sdGroups).forEach(([sdId, group]) => {
    if (group.titles.size > 1) {
      const titles = Array.from(group.titles);
      warnings.push({
        sd_id: sdId,
        type: 'title_inconsistency',
        message: `Multiple SD titles: ${titles.slice(0, 3).join(', ')}`
      });
    }
    
    if (group.pages.size > 1) {
      const pages = Array.from(group.pages);
      warnings.push({
        sd_id: sdId,
        type: 'page_inconsistency',
        message: `Multiple page titles: ${pages.slice(0, 3).join(', ')}`
      });
    }
  });
  
  // 6. Calculate rollups and validate
  const processedSDs = [];
  
  for (const [sdId, group] of Object.entries(sdGroups)) {
    const rollups = calculateRollups(group.items);
    
    // Merge SD data with rollups
    const sd = {
      ...group.sd_data,
      ...rollups,
      // Set required fields for strategic_directives_v2
      status: 'active',
      priority: rollups.rolled_triage === 'High' ? 'high' : 
                rollups.rolled_triage === 'Medium' ? 'medium' : 'low',
      description: `Imported from EHG Backlog: ${group.items.length} items`,
      rationale: `Consolidated backlog items with ${rollups.must_have_count} must-have requirements`,
      scope: `${rollups.h_count} high, ${rollups.m_count} medium, ${rollups.l_count} low priority items`
    };
    
    // Merge metadata
    if (!sd.metadata) sd.metadata = {};
    sd.metadata = {
      ...sd.metadata,
      import_checksum: checksum,
      item_count: group.items.length,
      import_run_id: IMPORT_RUN_ID
    };
    
    // Validation
    const expectedTotal = sd.h_count + sd.m_count + sd.l_count + sd.future_count;
    const actualTotal = group.items.length;
    if (expectedTotal !== actualTotal) {
      warnings.push({
        sd_id: sdId,
        type: 'count_mismatch',
        message: `Priority counts (H:${sd.h_count}+M:${sd.m_count}+L:${sd.l_count}+F:${sd.future_count}=${expectedTotal}) != total items (${actualTotal})`
      });
    }
    
    if (sd.must_have_count + sd.wish_list_count > actualTotal) {
      warnings.push({
        sd_id: sdId,
        type: 'tag_overflow',
        message: `Tag counts (must:${sd.must_have_count}+nice:${sd.wish_list_count}) exceed total items (${actualTotal})`
      });
    }
    
    processedSDs.push({ sd, items: group.items });
  }
  
  // Sort by sequence rank
  processedSDs.sort((a, b) => a.sd.sequence_rank - b.sd.sequence_rank);
  
  // 7. Report results
  console.log('='.repeat(60));
  console.log('📊 DRY-RUN SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nUnique SDs detected: ${processedSDs.length}`);
  console.log(`Total backlog items: ${processedSDs.reduce((sum, sd) => sum + sd.items.length, 0)}`);
  
  // Rolled triage distribution
  const triageDistribution = { High: 0, Medium: 0, Low: 0, Future: 0 };
  processedSDs.forEach(({ sd }) => {
    triageDistribution[sd.rolled_triage]++;
  });
  console.log('\nRolled Triage Distribution:');
  console.log(`  High:   ${triageDistribution.High}`);
  console.log(`  Medium: ${triageDistribution.Medium}`);
  console.log(`  Low:    ${triageDistribution.Low}`);
  console.log(`  Future: ${triageDistribution.Future}`);
  
  // Warnings
  if (warnings.length > 0) {
    const dedupedWarnings = [];
    const seen = new Set();
    warnings.forEach(w => {
      const key = `${w.type}:${w.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedWarnings.push(w);
      }
    });
    
    console.log(`\n⚠️  Top Validation Warnings (${Math.min(5, dedupedWarnings.length)} of ${dedupedWarnings.length}):`);
    dedupedWarnings.slice(0, 5).forEach((w, i) => {
      console.log(`  ${i + 1}. [${w.type}] ${w.sd_id || w.backlog_id || `Row ${w.row}`}: ${w.message}`);
    });
  } else {
    console.log('\n✅ No validation warnings');
  }
  
  // Top 5 SDs by Must-have %
  const topMustHave = [...processedSDs]
    .sort((a, b) => {
      const diff = b.sd.must_have_pct - a.sd.must_have_pct;
      return diff !== 0 ? diff : a.sd.sequence_rank - b.sd.sequence_rank;
    })
    .slice(0, 5);
  
  console.log('\n📈 Top 5 SDs by Must-have %:');
  console.log('  SD ID | Seq | Title | Must% | H/M/L/F');
  console.log('  ' + '-'.repeat(55));
  topMustHave.forEach(({ sd }) => {
    const title = sd.title ? sd.title.substring(0, 25) : 'N/A';
    console.log(`  ${sd.id} | ${String(sd.sequence_rank).padStart(3)} | ${title.padEnd(25)} | ${String(sd.must_have_pct).padStart(5)}% | ${sd.h_count}/${sd.m_count}/${sd.l_count}/${sd.future_count}`);
  });
  
  // 8. Example SD output
  if (processedSDs.length > 0) {
    const example = processedSDs[0]; // First by sequence rank
    console.log('\n' + '='.repeat(60));
    console.log('📋 EXAMPLE SD (First by Sequence Rank):');
    console.log('='.repeat(60));
    console.log(`SD ID:        ${example.sd.id}`);
    console.log(`Title:        ${example.sd.title || 'N/A'}`);
    console.log(`Sequence:     ${example.sd.sequence_rank}`);
    console.log(`Category:     ${example.sd.category || 'N/A'}`);
    console.log(`Triage:       ${example.sd.rolled_triage}`);
    console.log(`Counts:       H=${example.sd.h_count}, M=${example.sd.m_count}, L=${example.sd.l_count}, Future=${example.sd.future_count}`);
    console.log(`Must-have:    ${example.sd.must_have_count}/${example.items.length} (${example.sd.must_have_pct}%)`);
    console.log(`Nice-to-have: ${example.sd.wish_list_count}`);
    
    if (example.items.length > 0) {
      console.log('\nFirst 3 backlog items:');
      example.items.slice(0, 3).forEach((item, i) => {
        console.log(`\n  ${i + 1}. [${item.backlog_id}] ${item.backlog_title}`);
        console.log(`     Priority: ${item.priority || 'N/A'}, Stage: ${item.stage_number || 'N/A'}, Phase: ${item.phase || 'N/A'}`);
        if (item.my_comments) {
          console.log(`     Comments: ${item.my_comments.substring(0, 60)}${item.my_comments.length > 60 ? '...' : ''}`);
        }
        console.log(`     Description (raw): ${item.description_raw ? item.description_raw.substring(0, 60) + '...' : 'N/A'}`);
        console.log(`     Item Description: ${item.item_description ? item.item_description.substring(0, 60) + '...' : 'N/A'}`);
      });
    }
  }
  
  // 9. Import to database
  if (!options.dryRun) {
    if (options.strict && warnings.length > 0) {
      console.error('\n❌ Validation failed in strict mode');
      process.exit(1);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 Starting database import...');
    console.log('='.repeat(60));
    await importToDatabase(processedSDs, warnings, checksum, filePath);
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 DRY RUN COMPLETE - No data imported');
    console.log('Run without --dry-run to import data');
    console.log('='.repeat(60));
  }
}

async function importToDatabase(processedSDs, warnings, checksum, filePath) {
  // Use service role key for writes if available
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey
  );
  
  // First, mark all existing imported records as not present in latest import
  console.log('📝 Marking previous import records...');
  
  const { error: resetSDError } = await supabase
    .from('strategic_directives_v2')
    .update({ present_in_latest_import: false })
    .not('import_run_id', 'is', null)
    .neq('import_run_id', IMPORT_RUN_ID);
  
  if (resetSDError) {
    console.warn('⚠️  Could not reset SD flags:', resetSDError.message);
  }
  
  const { error: resetItemError } = await supabase
    .from('sd_backlog_map')
    .update({ present_in_latest_import: false })
    .neq('import_run_id', IMPORT_RUN_ID);
  
  if (resetItemError && resetItemError.code !== '42P01') {
    console.warn('⚠️  Could not reset item flags:', resetItemError.message);
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  // Import SDs with items
  for (const { sd, items } of processedSDs) {
    try {
      // Upsert SD to strategic_directives_v2
      const { error: sdError } = await supabase
        .from('strategic_directives_v2')
        .upsert(sd, { onConflict: 'id' });
      
      if (sdError) {
        console.error(`❌ Failed to import SD ${sd.id}:`, sdError.message);
        errorCount++;
        continue;
      }
      
      // Upsert items to sd_backlog_map
      if (items.length > 0) {
        const { error: itemError } = await supabase
          .from('sd_backlog_map')
          .upsert(items, { onConflict: 'sd_id,backlog_id' });
        
        if (itemError) {
          console.error(`❌ Failed to import items for SD ${sd.id}:`, itemError.message);
          errorCount++;
        } else {
          successCount++;
          console.log(`✅ Imported SD ${sd.id} with ${items.length} items`);
        }
      } else {
        successCount++;
        console.log(`✅ Imported SD ${sd.id} (no items)`);
      }
    } catch (err) {
      console.error(`❌ Unexpected error for SD ${sd.id}:`, err.message);
      errorCount++;
    }
  }
  
  // Log audit record
  const auditRecord = {
    import_run_id: IMPORT_RUN_ID,
    file_path: filePath,
    file_checksum: checksum,
    tab_name: 'Backlog',
    rows_processed: processedSDs.reduce((sum, sd) => sum + sd.items.length, 0),
    rows_imported: successCount,
    warnings: warnings,
    errors: errorCount > 0 ? [`${errorCount} SDs failed to import`] : [],
    status: errorCount === 0 ? 'success' : (successCount > 0 ? 'partial' : 'failed'),
    dry_run: false,
    import_metadata: {
      file_name: path.basename(filePath),
      source_type: 'excel',
      sha256: checksum,
      sd_count: processedSDs.length,
      target_table: 'strategic_directives_v2',
      import_timestamp: new Date().toISOString()
    }
  };
  
  const { error: auditError } = await supabase
    .from('import_audit')
    .insert(auditRecord);
  
  if (auditError && auditError.code !== '42P01') {
    console.error('⚠️  Failed to log audit:', auditError.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📈 Import Results:');
  console.log('='.repeat(60));
  console.log(`  ✅ Successfully imported: ${successCount} SDs`);
  if (errorCount > 0) {
    console.log(`  ❌ Failed: ${errorCount} SDs`);
  }
  console.log(`  🔄 Import Run ID: ${IMPORT_RUN_ID}`);
  console.log('  📊 Target Table: strategic_directives_v2');
  console.log('='.repeat(60));
}

// Run the import
main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});