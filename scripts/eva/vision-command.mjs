#!/usr/bin/env node
/**
 * EVA Vision Command - Core Implementation
 * SD: SD-MAN-INFRA-EVA-VISION-COMMAND-001
 *
 * Handles create, addendum, and extract operations for eva_vision_documents.
 * Called by the /eva vision skill — Claude handles interactive approval;
 * this script handles LLM extraction and DB operations.
 *
 * Subcommands:
 *   extract --source <path>              Extract dimensions from source file (stdout JSON)
 *   upsert  --vision-key <key>           Upsert vision doc to DB after chairman approval
 *           --level <L1|L2>
 *           --source <path>
 *           [--venture-id <id>]
 *           [--dimensions <json>]
 *   addendum --vision-key <key>          Append addendum section to existing vision doc
 *            --section <text>
 *   list                                 List all vision documents (id, key, level, status)
 *
 * Usage:
 *   node scripts/eva/vision-command.mjs extract --source docs/plans/eva-venture-lifecycle-vision.md
 *   node scripts/eva/vision-command.mjs upsert --vision-key VISION-EHG-L1-002 --level L1 --source docs/plans/...
 *   node scripts/eva/vision-command.mjs addendum --vision-key VISION-EHG-L1-001 --section "New section text"
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../lib/llm/client-factory.js';

dotenv.config();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const MAX_LLM_CONTENT_CHARS = 8000;

// ============================================================================
// Argument parsing
// ============================================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return { subcommand, opts };
}

// ============================================================================
// LLM dimension extraction (reused from seed-l1-vision.js)
// ============================================================================

async function extractDimensions(content, retryCount = 0) {
  const truncated = content.length > MAX_LLM_CONTENT_CHARS
    ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated for dimension extraction]'
    : content;

  const prompt = `You are analyzing a strategic vision document. Extract 6-10 key scoring dimensions that represent the major requirements, principles, or goals of this vision. These dimensions will be used to score whether built software aligns with this vision.

For each dimension, provide:
- name: short identifier (e.g., "chairman_governance", "stage_completeness")
- weight: relative importance 0.0-1.0 (all weights should sum to approximately 1.0)
- description: one sentence explaining what this dimension measures
- source_section: which section or principle in the doc this comes from

Return ONLY a valid JSON array of objects with these exact fields. No explanation text.

Document:
${truncated}`;

  try {
    const client = getValidationClient();
    const systemPrompt = 'You are a document analyst. Extract structured scoring dimensions from strategic documents. Return only valid JSON arrays.';
    const response = await client.complete(systemPrompt, prompt);
    const text = typeof response === 'string' ? response : response?.content || response?.text || JSON.stringify(response);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in LLM response');

    const dimensions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(dimensions) || dimensions.length < 1) throw new Error('LLM returned empty dimensions');

    for (const dim of dimensions) {
      if (!dim.name || typeof dim.weight !== 'number' || !dim.description) {
        throw new Error(`Invalid dimension shape: ${JSON.stringify(dim)}`);
      }
    }

    return dimensions;
  } catch (err) {
    if (retryCount === 0) {
      console.warn(`\n   ⚠️  LLM extraction failed (attempt 1): ${err.message}`);
      console.warn('   Retrying...');
      return extractDimensions(content, 1);
    }
    console.warn(`\n   ⚠️  LLM extraction failed after 2 attempts: ${err.message}`);
    console.warn('   Storing null extracted_dimensions — can be re-extracted later by scorer.');
    return null;
  }
}

// ============================================================================
// Subcommands
// ============================================================================

async function cmdExtract({ source }) {
  if (!source) { console.error('--source is required for extract'); process.exit(1); }

  const fullPath = resolve(REPO_ROOT, source);
  if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }

  const content = readFileSync(fullPath, 'utf8');
  console.error(`\n🤖 Extracting vision dimensions from: ${source} (${content.length.toLocaleString()} chars)...`);

  const dimensions = await extractDimensions(content);
  if (!dimensions) { console.error('❌ Extraction failed'); process.exit(1); }

  console.error(`✅ Extracted ${dimensions.length} dimensions`);
  // Output JSON to stdout for skill to consume
  console.log(JSON.stringify(dimensions, null, 2));
}

async function cmdUpsert({ visionKey, level, source, ventureId, dimensions: dimensionsJson, brainstormId }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }
  if (!level || !['L1', 'L2'].includes(level)) { console.error('--level must be L1 or L2'); process.exit(1); }
  if (!source) { console.error('--source is required'); process.exit(1); }

  const fullPath = resolve(REPO_ROOT, source);
  if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }

  const content = readFileSync(fullPath, 'utf8');

  let dimensions = null;
  if (dimensionsJson) {
    try {
      dimensions = JSON.parse(dimensionsJson);
    } catch (e) {
      console.error('Invalid --dimensions JSON:', e.message);
      process.exit(1);
    }
  } else {
    console.error('\n🤖 No pre-extracted dimensions provided — extracting now...');
    dimensions = await extractDimensions(content);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Build next version number
  const { data: existing } = await supabase
    .from('eva_vision_documents')
    .select('id, version')
    .eq('vision_key', visionKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

  const record = {
    vision_key: visionKey,
    level,
    content,
    extracted_dimensions: dimensions,
    version,
    status: 'active',
    chairman_approved: true, // approval already happened in skill before calling upsert
    source_file_path: source,
    created_by: 'eva-vision-command',
    ...(ventureId ? { venture_id: ventureId } : {}),
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
  };

  const { data, error } = await supabase
    .from('eva_vision_documents')
    .upsert(record, { onConflict: 'vision_key' })
    .select('id, vision_key, level, version, status')
    .single();

  if (error) { console.error('❌ Upsert failed:', error.message); process.exit(1); }

  console.log('\n✅ Vision document stored:');
  console.log(`   ID:      ${data.id}`);
  console.log(`   Key:     ${data.vision_key}`);
  console.log(`   Level:   ${data.level}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Status:  ${data.status}`);
  if (dimensions) console.log(`   Dimensions: ${dimensions.length} extracted`);
}

async function cmdAddendum({ visionKey, section, brainstormId }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }
  if (!section) { console.error('--section is required (the addendum text)'); process.exit(1); }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Fetch existing doc
  const { data: existing, error: fetchErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, content, addendums, extracted_dimensions, version')
    .eq('vision_key', visionKey)
    .single();

  if (fetchErr || !existing) {
    console.error(`❌ Vision document not found: ${visionKey}`);
    process.exit(1);
  }

  // Build addendum entry
  const addendum = {
    section,
    added_at: new Date().toISOString(),
    added_by: 'eva-vision-command',
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
  };

  const currentAddendums = existing.addendums || [];
  const updatedAddendums = [...currentAddendums, addendum];

  // Re-extract dimensions from combined content
  const combinedContent = `${existing.content}\n\n---\n\n## Addendum ${updatedAddendums.length}\n\n${section}`;
  console.error(`\n🤖 Re-extracting dimensions from updated content...`);
  const dimensions = await extractDimensions(combinedContent);

  const updatePayload = {
    addendums: updatedAddendums,
    extracted_dimensions: dimensions,
    content: combinedContent,
    updated_at: new Date().toISOString(),
  };
  if (brainstormId) updatePayload.source_brainstorm_id = brainstormId;

  const { data, error } = await supabase
    .from('eva_vision_documents')
    .update(updatePayload)
    .eq('vision_key', visionKey)
    .select('id, vision_key, version')
    .single();

  if (error) { console.error('❌ Addendum failed:', error.message); process.exit(1); }

  console.log('\n✅ Addendum added:');
  console.log(`   Key:      ${data.vision_key}`);
  console.log(`   Addendums: ${updatedAddendums.length}`);
  if (dimensions) console.log(`   Dimensions re-extracted: ${dimensions.length}`);
}

async function cmdList() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, version, status, chairman_approved, created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('❌ List failed:', error.message); process.exit(1); }
  if (!data?.length) { console.log('No vision documents found.'); return; }

  console.log('\n📋 EVA Vision Documents:\n');
  console.log('  ' + 'Key'.padEnd(28) + 'Level'.padEnd(6) + 'Ver'.padEnd(5) + 'Status'.padEnd(12) + 'Approved');
  console.log('  ' + '-'.repeat(65));
  for (const d of data) {
    console.log('  ' + d.vision_key.padEnd(28) + d.level.padEnd(6) + String(d.version).padEnd(5) + d.status.padEnd(12) + (d.chairman_approved ? '✅' : '⏳'));
  }
}

// ============================================================================
// Entry point
// ============================================================================

const { subcommand, opts } = parseArgs(process.argv);

switch (subcommand) {
  case 'extract':  await cmdExtract(opts); break;
  case 'upsert':   await cmdUpsert(opts); break;
  case 'addendum': await cmdAddendum(opts); break;
  case 'list':     await cmdList(); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Valid subcommands: extract, upsert, addendum, list');
    process.exit(1);
}
