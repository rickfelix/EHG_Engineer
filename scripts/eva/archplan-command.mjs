#!/usr/bin/env node
/**
 * EVA Architecture Plan Command - Core Implementation
 * SD: SD-MAN-INFRA-EVA-ARCHITECTURE-PLAN-001
 *
 * VISION KEY FORMAT: VISION-<CONTEXT>-<LEVEL>-<NNN>
 * ARCH KEY FORMAT: ARCH-<CONTEXT>-<NNN>
 * CONTEXT = venture_id when available, topic key otherwise
 *
 * Handles create, version, extract, addendum, and list operations for eva_architecture_plans.
 * Mirrors vision-command.mjs structure with addition of ADR + capability context.
 *
 * Subcommands:
 *   extract  --source <path>              Extract dimensions (includes ADR/capability context)
 *   upsert   --plan-key <key>             Upsert architecture plan after chairman approval
 *            --vision-key <key>           Link to parent vision document
 *            --source <path>              Read content from file
 *            [--content <text>]           Inline content (DB-only workflow)
 *            [--sections <json>]          Structured sections JSON (DB-only workflow, mirrors vision-command)
 *            [--dimensions <json>]
 *            [--brainstorm-id <uuid>]
 *   addendum --plan-key <key>             Append addendum section to existing plan
 *            --section <text>
 *   list                                  List all architecture plans with vision linkage
 *
 * Usage:
 *   node scripts/eva/archplan-command.mjs list
 *   node scripts/eva/archplan-command.mjs extract --source docs/plans/eva-platform-architecture.md
 *   node scripts/eva/archplan-command.mjs upsert --plan-key ARCH-EHG-L1-002 --vision-key VISION-EHG-L1-001 --source docs/plans/...
 *   node scripts/eva/archplan-command.mjs addendum --plan-key ARCH-EHG-L1-002 --section "New section text"
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getValidationClient } from '../../lib/llm/client-factory.js';
import { getSectionSchema, validateSections } from './document-section-registry.mjs';
import { renderSectionsToMarkdown } from './sections-to-markdown-renderer.mjs';
import { readStdin } from '../../lib/utils/read-stdin.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const MAX_LLM_CONTENT_CHARS = 15000;

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
  if (content.length > MAX_LLM_CONTENT_CHARS) {
    console.warn(`\n   ⚠️  Content truncated from ${content.length.toLocaleString()} to ${MAX_LLM_CONTENT_CHARS.toLocaleString()} chars for LLM extraction`);
  }
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

async function cmdExtract({ source, content: contentArg }) {
  if (!source && !contentArg) { console.error('--source or --content is required'); process.exit(1); }

  let content;
  if (contentArg) {
    content = contentArg;
  } else {
    const fullPath = resolve(REPO_ROOT, source);
    if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }
    content = readFileSync(fullPath, 'utf8');
  }
  console.error(`\n🤖 Extracting architecture dimensions from: ${source} (${content.length.toLocaleString()} chars)...`);

  const supabase = createSupabaseServiceClient();
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

async function cmdUpsert({ planKey, visionKey, source, dimensions: dimensionsJson, brainstormId, content: contentArg, sections: sectionsJson, stdin: stdinFlag }) {
  if (!planKey) { console.error('--plan-key is required'); process.exit(1); }
  if (!visionKey) { console.error('--vision-key is required (link to parent vision document)'); process.exit(1); }
  if (!source && !contentArg && !sectionsJson && !stdinFlag) { console.error('--source, --content, --sections, or --stdin is required'); process.exit(1); }

  // Read content from stdin when --stdin is set. Cross-platform alternative to
  // --content which hits OS CLI length limits (~8K on Windows) for large docs.
  if (stdinFlag && !contentArg) {
    try {
      contentArg = await readStdin();
    } catch (e) {
      console.error('Failed to read stdin:', e.message);
      process.exit(1);
    }
    if (!contentArg || contentArg.trim().length === 0) {
      console.error('--stdin was set but no content was read from stdin');
      process.exit(1);
    }
  }

  const supabase = createSupabaseServiceClient();

  let content = '';

  // Sections-first path: --sections flag provides structured sections directly (DB-only workflow)
  if (sectionsJson) {
    let parsedSections;
    try {
      parsedSections = JSON.parse(sectionsJson);
    } catch (e) {
      console.error('Invalid --sections JSON:', e.message);
      process.exit(1);
    }

    // Validate against schema
    const validation = await validateSections(parsedSections, 'architecture', { supabase });
    if (!validation.valid) {
      console.error('Section validation errors:');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
    }

    // Render content from sections
    const schema = await getSectionSchema('architecture', { supabase });
    content = renderSectionsToMarkdown(parsedSections, planKey, schema);
  } else if (contentArg) {
    content = contentArg;
  } else {
    const fullPath = resolve(REPO_ROOT, source);
    if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }
    content = readFileSync(fullPath, 'utf8');
  }

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

  if (dimensions) {
    const weightSum = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
    if (weightSum < 0.9 || weightSum > 1.1) {
      console.warn(`\n   ⚠️  Dimension weights sum to ${weightSum.toFixed(2)} (expected ~1.0)`);
    }
  }

  // Delegate to extracted upsert module (SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C)
  const { upsertArchPlan } = await import('../../lib/eva/archplan-upsert.js');
  const { data, error } = await upsertArchPlan({
    supabase, planKey, visionKey, content, dimensions,
    brainstormId, createdBy: 'eva-archplan-command',
  });

  if (error) { console.error('❌ Upsert failed:', error.message); process.exit(1); }

  console.log('\n✅ Architecture plan stored:');
  console.log(`   ID:       ${data.id}`);
  console.log(`   Key:      ${data.plan_key}`);
  console.log(`   Version:  ${data.version}`);
  console.log(`   Vision:   ${visionKey} (id: ${data.vision_id})`);
  console.log(`   Status:   ${data.status}`);
  if (dimensions) console.log(`   Dimensions: ${dimensions.length} extracted`);
}

async function cmdAddendum({ planKey, section }) {
  if (!planKey) { console.error('--plan-key is required'); process.exit(1); }
  if (!section) { console.error('--section is required (the addendum text)'); process.exit(1); }

  const supabase = createSupabaseServiceClient();

  // Fetch existing plan
  const { data: existing, error: fetchErr } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, content, addendums, extracted_dimensions, version, vision_id')
    .eq('plan_key', planKey)
    .single();

  if (fetchErr || !existing) {
    console.error(`❌ Architecture plan not found: ${planKey}`);
    process.exit(1);
  }

  // Build addendum entry
  const addendum = {
    section,
    added_at: new Date().toISOString(),
    added_by: 'eva-archplan-command',
  };

  const currentAddendums = existing.addendums || [];
  const updatedAddendums = [...currentAddendums, addendum];

  // Re-extract dimensions from combined content with ADR context
  const combinedContent = `${existing.content}\n\n---\n\n## Addendum ${updatedAddendums.length}\n\n${section}`;
  console.error(`\n🤖 Re-extracting dimensions from updated content...`);
  const context = await fetchContext(supabase);
  const contextSection = buildContextSection(context);
  const dimensions = await extractDimensions(combinedContent, contextSection);

  if (dimensions) {
    const weightSum = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
    if (weightSum < 0.9 || weightSum > 1.1) {
      console.warn(`\n   ⚠️  Dimension weights sum to ${weightSum.toFixed(2)} (expected ~1.0)`);
    }
  }

  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .update({
      addendums: updatedAddendums,
      extracted_dimensions: dimensions,
      content: combinedContent,
      updated_at: new Date().toISOString(),
    })
    .eq('plan_key', planKey)
    .select('id, plan_key, version')
    .single();

  if (error) { console.error('❌ Addendum failed:', error.message); process.exit(1); }

  console.log('\n✅ Addendum added:');
  console.log(`   Key:      ${data.plan_key}`);
  console.log(`   Addendums: ${updatedAddendums.length}`);
  if (dimensions) console.log(`   Dimensions re-extracted: ${dimensions.length}`);
}

async function cmdList() {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .select('id, plan_key, version, status, chairman_approved, created_at, eva_vision_documents(vision_key, level)')
    .order('created_at', { ascending: false });

  if (error) { console.error('❌ List failed:', error.message); process.exit(1); }
  if (!data?.length) { console.log('No architecture plans found.'); return; }

  console.log('\n📋 EVA Architecture Plans:\n');
  console.log('  ' + 'Plan Key'.padEnd(28) + 'Ver'.padEnd(5) + 'Status'.padEnd(12) + 'Vision Key'.padEnd(28) + 'Approved');
  console.log('  ' + '-'.repeat(80));
  for (const d of data) {
    const visionKey = d.eva_vision_documents?.vision_key || '(orphaned)';
    console.log('  ' + d.plan_key.padEnd(28) + String(d.version).padEnd(5) + d.status.padEnd(12) + visionKey.padEnd(28) + (d.chairman_approved ? '✅' : '⏳'));
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
