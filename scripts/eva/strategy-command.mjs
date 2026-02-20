#!/usr/bin/env node
/**
 * EVA Strategy Command - Strategic Theme Management
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-C
 *
 * Manages annual strategic themes derived from vision documents.
 * Follows the EVA CLI pattern (vision-command, mission-command, constitution-command).
 *
 * Subcommands:
 *   view                             List all strategic themes
 *   detail <id-or-title>             Show full detail for a single theme
 *   derive [--year <year>]           Auto-derive themes from active vision documents
 *          [--vision-key <key>]
 *   create --title <title>           Manually create a strategic theme
 *          --year <year>
 *          --description <desc>
 *          [--vision-key <key>]
 *
 * Usage:
 *   node scripts/eva/strategy-command.mjs view
 *   node scripts/eva/strategy-command.mjs detail THEME-2026-001
 *   node scripts/eva/strategy-command.mjs derive
 *   node scripts/eva/strategy-command.mjs derive --year 2026 --vision-key VISION-EHG-L1-001
 *   node scripts/eva/strategy-command.mjs create --title "AI-First Operations" --year 2026 --description "..."
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const opts = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(args[i]);
    }
  }
  return { subcommand, opts, positional };
}

// ============================================================================
// Supabase client
// ============================================================================

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  return createClient(url, key);
}

// ============================================================================
// Status icons
// ============================================================================

const STATUS_ICONS = {
  draft: '📝',
  active: '✅',
  archived: '📦'
};

// ============================================================================
// Subcommand: view
// ============================================================================

async function cmdView(supabase) {
  const { data, error } = await supabase
    .from('strategic_themes')
    .select('theme_key, title, year, status, derived_from_vision, vision_key')
    .order('year', { ascending: false });

  if (error || !data || data.length === 0) {
    console.log('\n  No strategic themes found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  STRATEGIC THEMES');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  ${data.length} theme(s) loaded`);

  for (const t of data) {
    const icon = STATUS_ICONS[t.status] || '📌';
    const source = t.derived_from_vision ? `derived from ${t.vision_key}` : 'manual';
    console.log('');
    console.log(`  ${icon} ${t.theme_key} [${t.year}] [${t.status.toUpperCase()}]`);
    console.log(`     ${t.title}`);
    console.log(`     Source: ${source}`);
  }
  console.log('');
  console.log('  Use: strategy-command.mjs detail <THEME-KEY> for full detail');
  console.log('');
}

// ============================================================================
// Subcommand: detail
// ============================================================================

async function cmdDetail(supabase, identifier) {
  if (!identifier) {
    console.error('Error: theme key or ID required (e.g., THEME-2026-001)');
    process.exit(1);
  }

  // Try by theme_key first, then by id
  let query = supabase
    .from('strategic_themes')
    .select('*')
    .eq('theme_key', identifier.toUpperCase());

  let { data, error } = await query.single();

  if (error || !data) {
    // Try partial title match
    const { data: titleMatch } = await supabase
      .from('strategic_themes')
      .select('*')
      .ilike('title', `%${identifier}%`)
      .limit(1)
      .single();

    if (!titleMatch) {
      console.log(`\n  Theme "${identifier}" not found.\n`);
      return;
    }
    data = titleMatch;
  }

  const icon = STATUS_ICONS[data.status] || '📌';

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  ${icon} ${data.theme_key} [${data.year}] [${data.status.toUpperCase()}]`);
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Title: ${data.title}`);
  console.log('');
  if (data.description) {
    console.log('  Description:');
    console.log(`  ${data.description}`);
    console.log('');
  }
  console.log(`  Source:  ${data.derived_from_vision ? 'Derived from vision' : 'Manual entry'}`);
  if (data.vision_key) {
    console.log(`  Vision:  ${data.vision_key}`);
  }
  if (data.source_dimensions && Array.isArray(data.source_dimensions) && data.source_dimensions.length > 0) {
    console.log('  Dimensions:');
    for (const dim of data.source_dimensions) {
      console.log(`    - ${dim.name || dim.key} (weight: ${dim.weight || 'N/A'})`);
    }
  }
  console.log('');
  console.log(`  Created: ${new Date(data.created_at).toLocaleDateString()}`);
  console.log(`  By:      ${data.created_by}`);
  console.log(`  ID:      ${data.id}`);
  console.log('');
}

// ============================================================================
// Subcommand: derive
// ============================================================================

async function cmdDerive(supabase, opts) {
  const year = parseInt(opts.year) || new Date().getFullYear();
  const visionKeyFilter = opts.visionKey;

  // Fetch active vision documents
  let query = supabase
    .from('eva_vision_documents')
    .select('vision_key, level, content, extracted_dimensions, status')
    .eq('status', 'active');

  if (visionKeyFilter) {
    query = query.eq('vision_key', visionKeyFilter.toUpperCase());
  }

  const { data: visionDocs, error: fetchErr } = await query;

  if (fetchErr || !visionDocs || visionDocs.length === 0) {
    console.log('\n  No active vision documents found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  DERIVING STRATEGIC THEMES FROM VISION');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  Year: ${year}`);
  console.log(`  Vision documents: ${visionDocs.length}`);

  // Get the highest existing theme index for this year
  const { data: maxExisting } = await supabase
    .from('strategic_themes')
    .select('theme_key')
    .eq('year', year)
    .order('theme_key', { ascending: false })
    .limit(1);

  let nextIndex = 1;
  if (maxExisting && maxExisting.length > 0) {
    const match = maxExisting[0].theme_key.match(/THEME-\d+-(\d+)/);
    if (match) nextIndex = parseInt(match[1]) + 1;
  }

  let totalCreated = 0;

  for (const doc of visionDocs) {
    const dims = doc.extracted_dimensions;
    if (!dims || !Array.isArray(dims) || dims.length === 0) {
      console.log(`\n  ⚠️  ${doc.vision_key}: No extracted dimensions, skipping`);
      continue;
    }

    console.log(`\n  Processing ${doc.vision_key} (${dims.length} dimensions)...`);

    // Check which themes already exist for this vision+year
    const { data: existing } = await supabase
      .from('strategic_themes')
      .select('source_dimensions')
      .eq('vision_key', doc.vision_key)
      .eq('year', year);

    const existingKeys = new Set();
    if (existing) {
      for (const e of existing) {
        if (e.source_dimensions && Array.isArray(e.source_dimensions)) {
          for (const d of e.source_dimensions) {
            existingKeys.add(d.key || d.name);
          }
        }
      }
    }

    // Group dimensions by weight (top dimensions become themes)
    const sorted = [...dims].sort((a, b) => (b.weight || 0) - (a.weight || 0));

    for (let i = 0; i < sorted.length; i++) {
      const dim = sorted[i];
      const dimKey = dim.key || dim.name;

      if (existingKeys.has(dimKey)) {
        console.log(`     ⏭️  ${dimKey}: already derived, skipping`);
        continue;
      }

      // Generate theme_key
      const themeKey = `THEME-${year}-${String(nextIndex).padStart(3, '0')}`;

      // Convert dimension name to title case
      const title = dimKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      const { data: inserted, error: insertErr } = await supabase
        .from('strategic_themes')
        .insert({
          theme_key: themeKey,
          title,
          description: dim.description || `Derived from ${doc.vision_key} dimension: ${dimKey}`,
          year,
          status: 'draft',
          vision_key: doc.vision_key,
          derived_from_vision: true,
          source_dimensions: [dim],
          created_by: 'eva-derive'
        })
        .select('theme_key, title')
        .single();

      if (insertErr) {
        console.log(`     ❌ ${themeKey}: ${insertErr.message}`);
        continue;
      }

      console.log(`     ✅ ${inserted.theme_key}: ${inserted.title} (weight: ${dim.weight || 'N/A'})`);
      totalCreated++;
      nextIndex++;
    }
  }

  console.log('');
  console.log('  ───────────────────────────────────────────────────────');
  console.log(`  Created ${totalCreated} theme(s) for ${year}`);
  if (totalCreated > 0) {
    console.log('  Status: draft (activate via DB or future activate subcommand)');
  }
  console.log('');
}

// ============================================================================
// Subcommand: create
// ============================================================================

async function cmdCreate(supabase, opts) {
  const title = opts.title;
  const year = parseInt(opts.year);
  const description = opts.description;

  if (!title || title === true) {
    console.error('Error: --title <title> is required');
    process.exit(1);
  }
  if (!year || isNaN(year)) {
    console.error('Error: --year <year> is required (e.g., 2026)');
    process.exit(1);
  }

  // Get next theme index for this year
  const { data: existing } = await supabase
    .from('strategic_themes')
    .select('theme_key')
    .eq('year', year)
    .order('theme_key', { ascending: false })
    .limit(1);

  let nextIndex = 1;
  if (existing && existing.length > 0) {
    const match = existing[0].theme_key.match(/THEME-\d+-(\d+)/);
    if (match) nextIndex = parseInt(match[1]) + 1;
  }

  const themeKey = `THEME-${year}-${String(nextIndex).padStart(3, '0')}`;

  const insertData = {
    theme_key: themeKey,
    title,
    year,
    status: 'draft',
    derived_from_vision: false,
    created_by: 'chairman'
  };

  if (description && description !== true) insertData.description = description;
  if (opts.visionKey && opts.visionKey !== true) {
    insertData.vision_key = opts.visionKey.toUpperCase();
  }

  const { data: theme, error: insertErr } = await supabase
    .from('strategic_themes')
    .insert(insertData)
    .select('theme_key, title, year, status')
    .single();

  if (insertErr) {
    console.error(`Error creating theme: ${insertErr.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  STRATEGIC THEME CREATED');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Key:    ${theme.theme_key}`);
  console.log(`  Title:  ${theme.title}`);
  console.log(`  Year:   ${theme.year}`);
  console.log(`  Status: ${theme.status}`);
  console.log('');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { subcommand, opts, positional } = parseArgs(process.argv);
  const supabase = getSupabase();

  switch (subcommand) {
    case 'view':
      await cmdView(supabase);
      break;
    case 'detail':
      await cmdDetail(supabase, positional[0] || opts.id);
      break;
    case 'derive':
      await cmdDerive(supabase, opts);
      break;
    case 'create':
      await cmdCreate(supabase, opts);
      break;
    default:
      console.log('');
      console.log('  EVA Strategy Command');
      console.log('  ────────────────────');
      console.log('  Usage:');
      console.log('    node scripts/eva/strategy-command.mjs view                  List all themes');
      console.log('    node scripts/eva/strategy-command.mjs detail THEME-2026-001 Show theme detail');
      console.log('    node scripts/eva/strategy-command.mjs derive                Auto-derive from vision');
      console.log('    node scripts/eva/strategy-command.mjs derive --year 2026 --vision-key VISION-EHG-L1-001');
      console.log('    node scripts/eva/strategy-command.mjs create --title "..." --year 2026 --description "..."');
      console.log('');
      console.log('  Options:');
      console.log('    --year <year>          Target year (default: current year)');
      console.log('    --vision-key <key>     Filter by vision document key');
      console.log('    --title <text>         Theme title (for create)');
      console.log('    --description <text>   Theme description (for create)');
      console.log('');
      process.exit(subcommand ? 1 : 0);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
