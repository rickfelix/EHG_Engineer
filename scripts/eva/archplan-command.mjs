#!/usr/bin/env node
/**
 * EVA Architecture Plan Command - Core Implementation
 * SD: SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001
 *
 * Handles create, version, extract, and list operations for eva_architecture_plans.
 * Mirrors vision-command.mjs structure with addition of ADR + capability context.
 *
 * Subcommands:
 *   extract  --source <path>              Extract dimensions (includes ADR/capability context)
 *   upsert   --plan-key <key>             Upsert architecture plan after chairman approval
 *            --vision-key <key>           Link to parent vision document
 *            --source <path>
 *            [--dimensions <json>]
 *   list                                  List all architecture plans with vision linkage
 *
 * Usage:
 *   node scripts/eva/archplan-command.mjs list
 *   node scripts/eva/archplan-command.mjs extract --source docs/plans/eva-platform-architecture.md
 *   node scripts/eva/archplan-command.mjs upsert --plan-key ARCH-EHG-L1-002 --vision-key VISION-EHG-L1-001 --source docs/plans/...
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
// Fetch ADR and capability context (graceful fallback if tables absent)
// ============================================================================

async function fetchContext(supabase) {
  const context = { adrs: [], capabilities: [] };

  try {
    const { data: adrs } = await supabase
      .from('leo_adrs')
      .select('adr_key, title, status, decision')
      .order('created_at', { ascending: false })
      .limit(10);
    if (adrs?.length) context.adrs = adrs;
  } catch (err) {
    console.error(`   ⚠️  leo_adrs unavailable: ${err.message} (proceeding without ADR context)`);
  }

  try {
    const { data: caps } = await supabase
      .from('sd_capabilities')
      .select('capability_name, description')
      .limit(10);
    if (caps?.length) context.capabilities = caps;
  } catch (err) {
    console.error(`   ⚠️  sd_capabilities unavailable: ${err.message} (proceeding without capability context)`);
  }

  return context;
}

function buildContextSection(context) {
  let section = '';

  if (context.adrs.length > 0) {
    section += '\n\nRelevant Architecture Decision Records (ADRs):\n';
    context.adrs.forEach(adr => {
      section += `- ${adr.adr_key}: ${adr.title} [${adr.status}]`;
      if (adr.decision) section += ` — ${adr.decision.slice(0, 120)}`;
      section += '\n';
    });
  }

  if (context.capabilities.length > 0) {
    section += '\nKnown System Capabilities:\n';
    context.capabilities.forEach(cap => {
      section += `- ${cap.capability_name}: ${cap.description?.slice(0, 100) || 'N/A'}\n`;
    });
  }

  return section;
}

// ============================================================================
// LLM dimension extraction (architecture-specific prompt, reuses seed-l1 pattern)
// ============================================================================

async function extractDimensions(content, contextSection, retryCount = 0) {
  const combined = content.length > MAX_LLM_CONTENT_CHARS
    ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated]'
    : content;

  const prompt = `You are analyzing an EHG platform architecture document. Extract 4-8 structural/architectural dimensions representing key decisions, components, or constraints. These dimensions will be used to score whether built software follows this architecture.

For each dimension, provide:
- name: short identifier (e.g., "event_driven_orchestration", "shared_services_model")
- weight: relative importance 0.0-1.0 (weights should sum to ~1.0)
- description: one sentence explaining what this dimension measures
- source_section: which section, component, or ADR this comes from
${contextSection ? '\nUse the ADRs and capabilities below to ground your dimension extraction:' + contextSection : ''}

Return ONLY a valid JSON array of objects with these exact fields. No explanation text.

Architecture Document:
${combined}`;

  try {
    const client = getValidationClient();
    const systemPrompt = 'You are an architecture analyst. Extract structural scoring dimensions from architecture documents. Return only valid JSON arrays.';
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
      console.warn(`\n   ⚠️  Extraction failed (attempt 1): ${err.message} — retrying...`);
      return extractDimensions(content, contextSection, 1);
    }
    console.warn(`\n   ⚠️  Extraction failed after 2 attempts: ${err.message}`);
    return null;
  }
}

// ============================================================================
// Subcommands
// ============================================================================

async function cmdExtract({ source }) {
  if (!source) { console.error('--source is required'); process.exit(1); }
  const fullPath = resolve(REPO_ROOT, source);
  if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }

  const content = readFileSync(fullPath, 'utf8');
  console.error(`\n🤖 Extracting architecture dimensions from: ${source} (${content.length.toLocaleString()} chars)...`);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const context = await fetchContext(supabase);

  if (context.adrs.length > 0) {
    console.error(`   📋 ADR context: ${context.adrs.length} ADRs loaded`);
  }
  if (context.capabilities.length > 0) {
    console.error(`   ⚙️  Capability context: ${context.capabilities.length} capabilities loaded`);
  }

  const contextSection = buildContextSection(context);
  const dimensions = await extractDimensions(content, contextSection);
  if (!dimensions) { console.error('❌ Extraction failed'); process.exit(1); }

  console.error(`✅ Extracted ${dimensions.length} dimensions`);
  console.log(JSON.stringify(dimensions, null, 2));
}

async function cmdUpsert({ planKey, visionKey, source, dimensions: dimensionsJson }) {
  if (!planKey) { console.error('--plan-key is required'); process.exit(1); }
  if (!visionKey) { console.error('--vision-key is required (link to parent vision document)'); process.exit(1); }
  if (!source) { console.error('--source is required'); process.exit(1); }

  const fullPath = resolve(REPO_ROOT, source);
  if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }

  const content = readFileSync(fullPath, 'utf8');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Resolve vision_id from vision_key
  const { data: visionDoc, error: visionErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, status')
    .eq('vision_key', visionKey)
    .single();

  if (visionErr || !visionDoc) {
    console.error(`❌ Vision document not found for key: ${visionKey}`);
    console.error('   Run "/eva vision list" to see available vision documents.');
    process.exit(1);
  }

  console.error(`\n✅ Vision document found: ${visionDoc.vision_key} (${visionDoc.level}, ${visionDoc.status})`);

  let dimensions = null;
  if (dimensionsJson) {
    try { dimensions = JSON.parse(dimensionsJson); }
    catch (e) { console.error('Invalid --dimensions JSON:', e.message); process.exit(1); }
  } else {
    console.error('\n🤖 Extracting dimensions with ADR/capability context...');
    const context = await fetchContext(supabase);
    const contextSection = buildContextSection(context);
    dimensions = await extractDimensions(content, contextSection);
  }

  // Determine next version
  const { data: existing } = await supabase
    .from('eva_architecture_plans')
    .select('id, version')
    .eq('plan_key', planKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

  const record = {
    plan_key: planKey,
    vision_id: visionDoc.id,
    content,
    extracted_dimensions: dimensions,
    version,
    status: 'active',
    chairman_approved: true,
    created_by: 'eva-archplan-command',
  };

  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .upsert(record, { onConflict: 'plan_key' })
    .select('id, plan_key, version, status, vision_id')
    .single();

  if (error) { console.error('❌ Upsert failed:', error.message); process.exit(1); }

  console.log('\n✅ Architecture plan stored:');
  console.log(`   ID:       ${data.id}`);
  console.log(`   Key:      ${data.plan_key}`);
  console.log(`   Version:  ${data.version}`);
  console.log(`   Vision:   ${visionDoc.vision_key} (id: ${data.vision_id})`);
  console.log(`   Status:   ${data.status}`);
  if (dimensions) console.log(`   Dimensions: ${dimensions.length} extracted`);
}

async function cmdList() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, version, status, chairman_approved, created_at, eva_vision_documents!inner(vision_key, level)')
    .order('created_at', { ascending: false });

  if (error) { console.error('❌ List failed:', error.message); process.exit(1); }
  if (!data?.length) { console.log('No architecture plans found.'); return; }

  console.log('\n📋 EVA Architecture Plans:\n');
  console.log('  ' + 'Plan Key'.padEnd(28) + 'Ver'.padEnd(5) + 'Status'.padEnd(12) + 'Vision Key'.padEnd(28) + 'Approved');
  console.log('  ' + '-'.repeat(80));
  for (const d of data) {
    const visionKey = d.eva_vision_documents?.vision_key || 'unlinked';
    console.log('  ' + d.plan_key.padEnd(28) + String(d.version).padEnd(5) + d.status.padEnd(12) + visionKey.padEnd(28) + (d.chairman_approved ? '✅' : '⏳'));
  }
}

// ============================================================================
// Entry point
// ============================================================================

const { subcommand, opts } = parseArgs(process.argv);

switch (subcommand) {
  case 'extract': await cmdExtract(opts); break;
  case 'upsert':  await cmdUpsert(opts); break;
  case 'list':    await cmdList(); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Valid subcommands: extract, upsert, list');
    process.exit(1);
}
