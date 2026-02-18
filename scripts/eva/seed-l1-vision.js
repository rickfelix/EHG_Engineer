#!/usr/bin/env node

/**
 * Seed L1 EHG Portfolio Vision from Existing Docs
 * SD: SD-MAN-INFRA-SEED-VISION-EXISTING-001
 *
 * Reads Vision v4.7, Architecture v1.6, and Capability Doctrine from
 * the filesystem, uses LLM to extract scoring dimensions, then upserts
 * the foundational L1 records into eva_vision_documents and
 * eva_architecture_plans.
 *
 * Idempotent: re-running updates extracted_dimensions and content
 * without creating duplicates.
 *
 * Usage:
 *   node scripts/eva/seed-l1-vision.js
 *   node scripts/eva/seed-l1-vision.js --dry-run   (skips DB writes, prints dimensions)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../lib/llm/client-factory.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../');

// ============================================================================
// Source file paths (relative to repo root)
// ============================================================================

const SOURCE_FILES = {
  vision: 'docs/plans/eva-venture-lifecycle-vision.md',
  architecture: 'docs/plans/eva-platform-architecture.md',
  doctrine: 'brainstorm/topic-5-ehg-vision.md',
};

// ============================================================================
// Target DB keys
// ============================================================================

const VISION_KEY = 'VISION-EHG-L1-001';
const ARCH_KEY = 'ARCH-EHG-L1-001';

// Max chars to send to LLM for dimension extraction (avoid context overflow)
const MAX_LLM_CONTENT_CHARS = 8000;

// ============================================================================
// Helpers
// ============================================================================

function readSourceFile(relativePath) {
  const fullPath = resolve(REPO_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    console.error(`\n❌ File not found: ${relativePath}`);
    console.error(`   Expected at: ${fullPath}`);
    process.exit(1);
  }
  const content = readFileSync(fullPath, 'utf8');
  console.log(`   ✅ Read: ${relativePath} (${content.length.toLocaleString()} chars)`);
  return content;
}

/**
 * Use LLM to extract scoring dimensions from document content.
 * Returns an array of dimension objects, or null on failure.
 */
async function extractDimensions(content, docType, retryCount = 0) {
  const truncated = content.length > MAX_LLM_CONTENT_CHARS
    ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated for dimension extraction]'
    : content;

  const prompt = docType === 'vision'
    ? `You are analyzing an EHG venture lifecycle vision document. Extract 5-10 key scoring dimensions that represent the major requirements, principles, or goals of this vision. These dimensions will be used to score whether built software aligns with this vision.

For each dimension, provide:
- name: short identifier (e.g., "chairman_governance", "stage_completeness")
- weight: relative importance 0.0-1.0 (all weights should sum to approximately 1.0)
- description: one sentence explaining what this dimension measures
- source_section: which section or principle in the doc this comes from

Return ONLY a valid JSON array of objects with these exact fields. No explanation text.

Document:
${truncated}`
    : `You are analyzing an EHG platform architecture document. Extract 4-8 structural/architectural dimensions that represent the key architectural decisions, components, or constraints of this architecture. These dimensions will be used to score whether built software follows this architecture.

For each dimension, provide:
- name: short identifier (e.g., "shared_services_model", "event_driven_orchestration")
- weight: relative importance 0.0-1.0 (all weights should sum to approximately 1.0)
- description: one sentence explaining what this dimension measures
- source_section: which section or component in the doc this comes from

Return ONLY a valid JSON array of objects with these exact fields. No explanation text.

Document:
${truncated}`;

  try {
    const client = getValidationClient();
    const systemPrompt = 'You are a document analyst. Extract structured scoring dimensions from strategic documents. Return only valid JSON arrays.';
    const response = await client.complete(systemPrompt, prompt);
    const text = typeof response === 'string' ? response : response?.content || response?.text || JSON.stringify(response);

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in LLM response');
    }

    const dimensions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(dimensions) || dimensions.length < 1) {
      throw new Error('LLM returned empty or non-array dimensions');
    }

    // Validate shape
    for (const dim of dimensions) {
      if (!dim.name || typeof dim.weight !== 'number' || !dim.description) {
        throw new Error(`Invalid dimension shape: ${JSON.stringify(dim)}`);
      }
    }

    return dimensions;
  } catch (err) {
    if (retryCount === 0) {
      console.warn(`   ⚠️  LLM extraction failed (attempt 1): ${err.message}`);
      console.warn('   Retrying with repair prompt...');
      return extractDimensions(content, docType, 1);
    }
    console.warn(`   ⚠️  LLM extraction failed (attempt 2): ${err.message}`);
    console.warn('   Storing null extracted_dimensions — dimensions can be extracted later by scorer.');
    return null;
  }
}

// ============================================================================
// Main
// ============================================================================

export async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' SEED L1 VISION — EVA Vision Governance System');
  if (isDryRun) console.log(' MODE: DRY RUN (no DB writes)');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 1. Read source files ──────────────────────────────────────────────────
  console.log('📂 Reading source files...');
  const visionContent = readSourceFile(SOURCE_FILES.vision);
  const architectureContent = readSourceFile(SOURCE_FILES.architecture);
  const doctrineContent = readSourceFile(SOURCE_FILES.doctrine);

  // Combine vision + doctrine for L1 vision record
  const combinedVisionContent = `${visionContent}\n\n---\n\n# EHG Capability Doctrine\n\n${doctrineContent}`;

  // ── 2. Extract dimensions via LLM ─────────────────────────────────────────
  console.log('\n🤖 Extracting vision scoring dimensions via LLM...');
  const visionDimensions = await extractDimensions(combinedVisionContent, 'vision');
  if (visionDimensions) {
    console.log(`   ✅ Vision dimensions: ${visionDimensions.length} extracted`);
    visionDimensions.forEach((d, i) => console.log(`      ${i + 1}. ${d.name} (weight: ${d.weight})`));
  }

  console.log('\n🤖 Extracting architecture scoring dimensions via LLM...');
  const archDimensions = await extractDimensions(architectureContent, 'architecture');
  if (archDimensions) {
    console.log(`   ✅ Architecture dimensions: ${archDimensions.length} extracted`);
    archDimensions.forEach((d, i) => console.log(`      ${i + 1}. ${d.name} (weight: ${d.weight})`));
  }

  if (isDryRun) {
    console.log('\n✅ DRY RUN complete — no DB writes made.');
    console.log('   Remove --dry-run flag to seed the database.');
    return;
  }

  // ── 3. Upsert eva_vision_documents ────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('\n📝 Upserting eva_vision_documents...');
  const visionRecord = {
    vision_key: VISION_KEY,
    level: 'L1',
    content: combinedVisionContent,
    extracted_dimensions: visionDimensions,
    version: 1,
    status: 'draft',
    chairman_approved: false,
    source_file_path: SOURCE_FILES.vision,
    created_by: 'seed-l1-vision',
  };

  const { data: visionData, error: visionError } = await supabase
    .from('eva_vision_documents')
    .upsert(visionRecord, { onConflict: 'vision_key' })
    .select('id, vision_key, level, status')
    .single();

  if (visionError) {
    console.error(`❌ Failed to upsert eva_vision_documents: ${visionError.message}`);
    process.exit(1);
  }

  console.log(`   ✅ ${visionData.vision_key} (id: ${visionData.id})`);
  const visionId = visionData.id;

  // ── 4. Upsert eva_architecture_plans ─────────────────────────────────────
  console.log('\n📝 Upserting eva_architecture_plans...');
  const archRecord = {
    plan_key: ARCH_KEY,
    vision_id: visionId,
    content: architectureContent,
    extracted_dimensions: archDimensions,
    version: 1,
    status: 'draft',
    chairman_approved: false,
    created_by: 'seed-l1-vision',
  };

  const { data: archData, error: archError } = await supabase
    .from('eva_architecture_plans')
    .upsert(archRecord, { onConflict: 'plan_key' })
    .select('id, plan_key, status, vision_id')
    .single();

  if (archError) {
    console.error(`❌ Failed to upsert eva_architecture_plans: ${archError.message}`);
    process.exit(1);
  }

  console.log(`   ✅ ${archData.plan_key} (id: ${archData.id}, vision_id: ${archData.vision_id})`);

  // ── 5. Verification ───────────────────────────────────────────────────────
  console.log('\n🔍 Verification...');
  const { data: verify } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, eva_vision_documents!inner(vision_key, level)')
    .eq('plan_key', ARCH_KEY)
    .single();

  if (verify) {
    console.log(`   ✅ FK verified: ${verify.plan_key} → ${verify.eva_vision_documents.vision_key} (${verify.eva_vision_documents.level})`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' SEED COMPLETE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Vision:       ${VISION_KEY} (id: ${visionId})`);
  console.log(`   Architecture: ${ARCH_KEY} (id: ${archData.id})`);
  console.log(`   Vision dims:  ${visionDimensions ? visionDimensions.length : 'null (LLM failed)'}`);
  console.log(`   Arch dims:    ${archDimensions ? archDimensions.length : 'null (LLM failed)'}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

// Windows-compatible ESM entry point
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`
) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
