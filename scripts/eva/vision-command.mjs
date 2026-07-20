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
 *   upsert  --vision-key <key>           Upsert vision doc to DB
 *           --level <L1|L2>
 *           --source <path>
 *           (--approved | --draft)        REQUIRED: deliberate approval choice.
 *                                         --approved => active + chairman_approved
 *                                         --draft    => draft, not approved
 *           [--chairman-ratified]         REQUIRED in addition to --approved for GOVERNED
 *                                         vision_keys (e.g. VISION-PORTFOLIO-STRATEGY-001,
 *                                         see lib/eva/vision-upsert.js GOVERNED_VISION_KEYS)
 *                                         — --approved alone is silently downgraded to draft
 *                                         for those keys (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A)
 *           [--venture-id <id>]           Explicit venture linkage
 *           [--brainstorm-id <id>]        Source brainstorm (auto-links a single-venture session)
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
// SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001: extractDimensions relocated to a shared lib
// module so the eager-synthesis writer can reuse the ONE canonical extractor.
import { extractDimensions } from '../../lib/eva/vision-dimensions-extractor.js';
import { parseMarkdownToSections, buildDefaultMapping } from './markdown-to-sections-parser.mjs';
import { buildSectionKeyMapping, getSectionSchema, validateSections } from './document-section-registry.mjs';
import { renderSectionsToMarkdown, renderSectionsSummary } from './sections-to-markdown-renderer.mjs';
import { readStdin } from '../../lib/utils/read-stdin.mjs';
// SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: the same GOVERNED_VISION_KEYS gate cmdUpsert
// applies via upsertVision() must also apply to cmdAddendum's direct DB write below — an
// adversarial review (PR #6138) found the addendum path bypassed ratification entirely,
// letting an already-active governed document's content change with no re-ratification.
import { buildAddendumUpdatePayload, rejectStringFlagValue } from '../../lib/eva/vision-upsert.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: `list` renders every
// eva_vision_documents row -- an un-paginated read here silently hides documents once the
// table exceeds the PostgREST 1000-row cap.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');

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
// LLM dimension extraction relocated to lib/eva/vision-dimensions-extractor.js
// (SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001) — imported above.
// ============================================================================

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

async function cmdUpsert({ visionKey, level, source, ventureId, dimensions: dimensionsJson, brainstormId, sections: sectionsJson, content: contentArg, stdin: stdinFlag, approved: approvedFlag, draft: draftFlag, chairmanRatified: chairmanRatifiedFlag }) {
  if (!visionKey) { console.error('--vision-key is required'); process.exit(1); }
  if (!level || !['L1', 'L2'].includes(level)) { console.error('--level must be L1 or L2'); process.exit(1); }
  if (!source && !sectionsJson && !contentArg && !stdinFlag) { console.error('--source, --sections, --content, or --stdin is required'); process.exit(1); }

  // Reject a value on any of these three bare boolean flags (see
  // rejectStringFlagValue's docblock) BEFORE the mutual-exclusivity checks below,
  // so `--approved false` (etc.) errors instead of silently parsing as approved.
  for (const [flagValue, flagName] of [[approvedFlag, '--approved'], [draftFlag, '--draft'], [chairmanRatifiedFlag, '--chairman-ratified']]) {
    const err = rejectStringFlagValue(flagValue, flagName);
    if (err) { console.error(err); process.exit(1); }
  }

  // FR-2 (SD-LEO-FEAT-DELIBERATE-VISION-APPROVAL-001): approval must be a
  // DELIBERATE, explicit chairman choice — never a silent default. Require
  // exactly one of --approved / --draft so registering a vision is an explicit
  // decision to either start the build (active + chairman_approved) or save a
  // draft (draft + not approved).
  if (approvedFlag && draftFlag) {
    console.error('Pass only ONE of --approved or --draft, not both.');
    process.exit(1);
  }
  if (!approvedFlag && !draftFlag) {
    console.error('Approval decision required: pass --approved (active + chairman_approved) or --draft (saved as draft, not approved).');
    process.exit(1);
  }
  const approved = Boolean(approvedFlag);
  const chairmanRatified = Boolean(chairmanRatifiedFlag);

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
    ventureId, brainstormId, createdBy: 'eva-vision-command', approved, chairmanRatified,
  });

  if (error) { console.error('❌ Upsert failed:', error.message); process.exit(1); }

  console.log('\n✅ Vision document stored:');
  console.log(`   ID:      ${data.id}`);
  console.log(`   Key:     ${data.vision_key}`);
  console.log(`   Level:   ${data.level}`);
  console.log(`   Version: ${data.version}`);
  console.log(`   Status:  ${data.status}`);
  // Report the ACTUAL persisted outcome (data.status/chairman_approved), not the requested
  // --approved flag: for GOVERNED vision_keys, --approved alone is silently downgraded to
  // draft unless --chairman-ratified is also passed (SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A) —
  // echoing the request instead of the outcome would misreport a governed key as activated.
  console.log(`   Approval: ${data.status === 'active' ? 'APPROVED (chairman_approved=true, build can start)' : 'DRAFT (not approved — review then re-run with --approved [+ --chairman-ratified if this is a governed key] to start build)'}`);
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

  // Re-extract dimensions from the combined content (addendum text is appended to existing content)
  const pendingCombinedContent = `${existing.content}\n\n---\n\n## Addendum ${(existing.addendums || []).length + 1}\n\n${section}`;
  console.error(`\n🤖 Re-extracting dimensions from updated content...`);
  const dimensions = await extractDimensions(pendingCombinedContent);

  if (dimensions) {
    const weightSum = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
    if (weightSum < 0.9 || weightSum > 1.1) {
      console.warn(`\n   ⚠️  Dimension weights sum to ${weightSum.toFixed(2)} (expected ~1.0)`);
    }
  }

  // SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-A: this is a second write path to
  // eva_vision_documents that would otherwise bypass upsertVision()'s
  // GOVERNED_VISION_KEYS gate entirely (adversarial review, PR #6138) — an
  // addendum to an already-ACTIVE governed document would change its content
  // while leaving status='active'/chairman_approved=true untouched, surfacing
  // unratified content to stage-zero ideation as "chairman-ratified".
  // buildAddendumUpdatePayload() mirrors upsertVision's "each revision needs
  // its own ratification" rule: any addendum to a governed key demotes the
  // row back to draft, requiring an explicit --approved --chairman-ratified
  // upsert to re-activate.
  const { updatePayload, updatedAddendums } = buildAddendumUpdatePayload({
    visionKey, existing, section, dimensions, brainstormId,
  });
  if (updatePayload.status === 'draft') {
    console.warn(`\n   ⚠️  ${visionKey} is a GOVERNED vision_key — this addendum demotes it back to draft.`);
    console.warn(`      Re-run: node scripts/eva/vision-command.mjs upsert --vision-key ${visionKey} --level L1 --approved --chairman-ratified --content <updated content> to re-ratify.`);
  }

  const { data, error } = await supabase
    .from('eva_vision_documents')
    .update(updatePayload)
    .eq('vision_key', visionKey)
    .select('id, vision_key, version, status, chairman_approved')
    .single();

  if (error) { console.error('❌ Addendum failed:', error.message); process.exit(1); }

  console.log('\n✅ Addendum added:');
  console.log(`   Key:      ${data.vision_key}`);
  console.log(`   Status:   ${data.status}`);
  console.log(`   Addendums: ${updatedAddendums.length}`);
  if (dimensions) console.log(`   Dimensions re-extracted: ${dimensions.length}`);
}

async function cmdList() {
  const supabase = createSupabaseServiceClient();
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('eva_vision_documents')
      .select('id, vision_key, level, version, status, chairman_approved, sections, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (error) { console.error('❌ List failed:', error.message); process.exit(1); }
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
