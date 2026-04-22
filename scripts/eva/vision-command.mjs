#!/usr/bin/env node
/**
 * EVA Vision Command - Core Implementation
 * SD: SD-MAN-INFRA-EVA-VISION-COMMAND-001
 *
 * VISION KEY FORMAT: VISION-<CONTEXT>-<LEVEL>-<NNN>
 * ARCH KEY FORMAT: ARCH-<CONTEXT>-<NNN>
 * CONTEXT = venture_id when available, topic key otherwise
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
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getValidationClient } from '../../lib/llm/client-factory.js';
import { parseMarkdownToSections, buildDefaultMapping } from './markdown-to-sections-parser.mjs';
import { buildSectionKeyMapping, getSectionSchema, validateSections } from './document-section-registry.mjs';
import { renderSectionsToMarkdown, renderSectionsSummary } from './sections-to-markdown-renderer.mjs';
import { readStdin } from '../../lib/utils/read-stdin.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');
const MAX_LLM_CONTENT_CHARS = 15000;

// B2 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Testable Success Criteria heuristic
// Extracted to lib/eva/testable-criteria-heuristic.js for reuse and testability.
import { validateSuccessCriteriaTestability } from '../../lib/eva/testable-criteria-heuristic.js';
// B1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Always/Ask First/Never tri-tier validator
import { validateTriTierBoundaries, formatTriTierWarnings } from '../../lib/eva/tri-tier-section-validator.js';

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
  if (content.length > MAX_LLM_CONTENT_CHARS) {
    console.warn(`\n   ⚠️  Content truncated from ${content.length.toLocaleString()} to ${MAX_LLM_CONTENT_CHARS.toLocaleString()} chars for LLM extraction`);
  }
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

async function cmdExtract({ source, content: contentArg }) {
  if (!source && !contentArg) { console.error('--source or --content is required for extract'); process.exit(1); }

  let content;
  if (contentArg) {
    content = contentArg;
  } else {
    const fullPath = resolve(REPO_ROOT, source);
    if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }
    content = readFileSync(fullPath, 'utf8');
  }
  console.error(`\n🤖 Extracting vision dimensions from: ${source} (${content.length.toLocaleString()} chars)...`);

  const dimensions = await extractDimensions(content);
  if (!dimensions) { console.error('❌ Extraction failed'); process.exit(1); }

  console.error(`✅ Extracted ${dimensions.length} dimensions`);
  // Output JSON to stdout for skill to consume
  console.log(JSON.stringify(dimensions, null, 2));
}

async function cmdUpsert({ visionKey, level, source, ventureId, dimensions: dimensionsJson, brainstormId, sections: sectionsJson, content: contentArg, stdin: stdinFlag }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }
  if (!level || !['L1', 'L2'].includes(level)) { console.error('--level must be L1 or L2'); process.exit(1); }
  if (!source && !sectionsJson && !contentArg && !stdinFlag) { console.error('--source, --sections, --content, or --stdin is required'); process.exit(1); }

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
  let sections = null;

  // Sections-first path: --sections flag provides structured sections directly
  if (sectionsJson) {
    try {
      sections = JSON.parse(sectionsJson);
    } catch (e) {
      console.error('Invalid --sections JSON:', e.message);
      process.exit(1);
    }

    // Validate against schema
    const validation = await validateSections(sections, 'vision', { supabase });
    if (!validation.valid) {
      console.error('Section validation errors:');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
    }

    // Render content from sections
    const schema = await getSectionSchema('vision', { supabase });
    content = renderSectionsToMarkdown(sections, visionKey, schema);
  }

  // Inline content path: --content flag provides content directly (DB-only workflow)
  if (contentArg && !sections) {
    content = contentArg;
    let mapping;
    try {
      mapping = await buildSectionKeyMapping('vision', { supabase });
    } catch {
      mapping = buildDefaultMapping();
    }
    sections = parseMarkdownToSections(content, mapping);
    const sectionCount = Object.keys(sections).length;
    if (sectionCount > 0) {
      console.log(`   Auto-parsed ${sectionCount} sections from --content`);
    }
  }

  // Source file path: backward-compatible (auto-parse sections from markdown)
  if (source && !contentArg) {
    const fullPath = resolve(REPO_ROOT, source);
    if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }
    content = readFileSync(fullPath, 'utf8');

    // Auto-parse sections from source markdown if not provided
    if (!sections) {
      let mapping;
      try {
        mapping = await buildSectionKeyMapping('vision', { supabase });
      } catch {
        mapping = buildDefaultMapping();
      }
      sections = parseMarkdownToSections(content, mapping);
      const sectionCount = Object.keys(sections).length;
      if (sectionCount > 0) {
        console.log(`   Auto-parsed ${sectionCount} sections from source file`);
      }
    }
  }

  // B2 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Testable Success Criteria check
  // Warning-only mode: print issues to stdout, do not block upsert.
  // Promotion to blocking requires <15% false-positive rate over 2-week window.
  if (sections) {
    try {
      const testabilityResult = validateSuccessCriteriaTestability(sections);
      if (testabilityResult.issues.length > 0) {
        console.warn(`\n   ⚠️  B2: Found ${testabilityResult.issues.length} potentially vague success criteria (warning-only mode):`);
        for (const issue of testabilityResult.issues.slice(0, 5)) {
          console.warn(`      • "${issue.criterion}"`);
          console.warn(`        ${issue.reason}`);
        }
        if (testabilityResult.issues.length > 5) {
          console.warn(`      ... and ${testabilityResult.issues.length - 5} more`);
        }
        console.warn(`      (B2 is in warning-only mode for the first 2 weeks. Promotion to blocking requires FP rate <15%.)`);
      }
    } catch (b2Err) {
      // Fail open: do not block upsert on B2 validator errors
      console.warn(`   ⚠️  B2 testability check errored (non-blocking): ${b2Err.message}`);
    }
  }

  // B1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Always/Ask First/Never tri-tier check
  // Warning-only mode: print issues to stdout, do not block upsert.
  // Existing vision documents are unaffected — only new upserts are validated.
  // Promotion to blocking requires chairman acceptance (Vision SC #7).
  if (content) {
    try {
      const triTierResult = validateTriTierBoundaries(content);
      const formatted = formatTriTierWarnings(triTierResult.issues);
      if (formatted) {
        console.warn(formatted);
      }
    } catch (b1Err) {
      // Fail open: do not block upsert on B1 validator errors
      console.warn(`   ⚠️  B1 tri-tier check errored (non-blocking): ${b1Err.message}`);
    }
  }

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

  if (dimensions) {
    const weightSum = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
    if (weightSum < 0.9 || weightSum > 1.1) {
      console.warn(`\n   ⚠️  Dimension weights sum to ${weightSum.toFixed(2)} (expected ~1.0)`);
    }
  }

  // Delegate to extracted upsert module (SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C)
  const { upsertVision } = await import('../../lib/eva/vision-upsert.js');
  const { data, error } = await upsertVision({
    supabase, visionKey, level, content, sections, dimensions,
    ventureId, brainstormId, createdBy: 'eva-vision-command',
  });

  if (error) { console.error('❌ Upsert failed:', error.message); process.exit(1); }

  console.log('\n✅ Vision document stored:');
  console.log(`   ID:      ${data.id}`);
  console.log(`   Key:     ${data.vision_key}`);
  console.log(`   Level:   ${data.level}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Status:  ${data.status}`);
  if (dimensions) console.log(`   Dimensions: ${dimensions.length} extracted`);
  if (sections) console.log(`   Sections: ${renderSectionsSummary(sections)}`);
}

async function cmdAddendum({ visionKey, section, brainstormId }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }
  if (!section) { console.error('--section is required (the addendum text)'); process.exit(1); }

  const supabase = createSupabaseServiceClient();

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

  if (dimensions) {
    const weightSum = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
    if (weightSum < 0.9 || weightSum > 1.1) {
      console.warn(`\n   ⚠️  Dimension weights sum to ${weightSum.toFixed(2)} (expected ~1.0)`);
    }
  }

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
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, version, status, chairman_approved, sections, created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('❌ List failed:', error.message); process.exit(1); }
  if (!data?.length) { console.log('No vision documents found.'); return; }

  console.log('\n📋 EVA Vision Documents:\n');
  console.log('  ' + 'Key'.padEnd(35) + 'Level'.padEnd(6) + 'Ver'.padEnd(5) + 'Status'.padEnd(10) + 'Sections');
  console.log('  ' + '-'.repeat(75));
  for (const d of data) {
    const sectionsInfo = renderSectionsSummary(d.sections);
    console.log('  ' + d.vision_key.padEnd(35) + d.level.padEnd(6) + String(d.version).padEnd(5) + d.status.padEnd(10) + sectionsInfo);
  }
}

async function cmdView({ visionKey, section: sectionKey, format }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, level, version, status, content, sections')
    .eq('vision_key', visionKey)
    .single();

  if (error) { console.error(`❌ Not found: ${visionKey}`); process.exit(1); }

  // JSON format output
  if (format === 'json') {
    console.log(JSON.stringify({
      vision_key: data.vision_key,
      level: data.level,
      version: data.version,
      status: data.status,
      sections: data.sections || {},
      sections_summary: renderSectionsSummary(data.sections),
    }, null, 2));
    return;
  }

  // View specific section
  if (sectionKey) {
    const content = data.sections?.[sectionKey];
    if (!content) {
      const available = data.sections ? Object.keys(data.sections).join(', ') : 'none';
      console.error(`Section "${sectionKey}" not found. Available: ${available}`);
      process.exit(1);
    }
    console.log(`\n## ${sectionKey}\n`);
    console.log(content);
    return;
  }

  // Full document view
  console.log(`\n📄 ${data.vision_key} (${data.level}, v${data.version}, ${data.status})\n`);
  if (data.sections && Object.keys(data.sections).length > 0) {
    const schema = await getSectionSchema('vision', { supabase });
    console.log(renderSectionsToMarkdown(data.sections, data.vision_key, schema));
  } else if (data.content) {
    console.log(data.content);
  } else {
    console.log('(no content)');
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
  case 'view':     await cmdView(opts); break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error('Valid subcommands: extract, upsert, addendum, list, view');
    process.exit(1);
}
