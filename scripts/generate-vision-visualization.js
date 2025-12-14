#!/usr/bin/env node

/**
 * Vision Brief Visualization Generator
 *
 * Generates a UI mock visualization from an approved vision brief.
 * Uses Gemini (primary) or OpenAI DALL-E (fallback) for image generation.
 * Stores result in Supabase Storage and updates SD metadata.
 *
 * Part of: SD-VISION-BRIEF-VISUALIZATION-001
 * Related: generate-vision-brief.js, visualization-provider.js
 *
 * Usage:
 *   node scripts/generate-vision-visualization.js SD-FEATURE-001
 *   node scripts/generate-vision-visualization.js SD-FEATURE-001 --dry-run
 *   node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm
 *   node scripts/generate-vision-visualization.js SD-FEATURE-001 --confirm --provider openai
 *   node scripts/generate-vision-visualization.js SD-FEATURE-001 --allow-draft
 *
 * @module generate-vision-visualization
 * @version 1.1.0
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import {
  generateWithFallback,
  isVisualizationAvailable,
  getProviderInfo,
  ProviderMode
} from './lib/visualization-provider.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const STORAGE_BUCKET = process.env.VISION_STORAGE_BUCKET || 'vision-briefs';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const sdId = args.find(arg => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');
  const allowDraft = args.includes('--allow-draft');

  // Parse --provider flag
  let providerMode = ProviderMode.AUTO;
  const providerIndex = args.indexOf('--provider');
  if (providerIndex !== -1 && args[providerIndex + 1]) {
    const requested = args[providerIndex + 1].toLowerCase();
    if (requested === 'gemini') {
      providerMode = ProviderMode.GEMINI;
    } else if (requested === 'openai') {
      providerMode = ProviderMode.OPENAI;
    } else if (requested !== 'auto') {
      console.error(`Invalid --provider value: ${requested}`);
      console.error('Valid values: auto, gemini, openai');
      process.exit(1);
    }
  }

  return { sdId, dryRun, confirm, allowDraft, providerMode };
}

/**
 * Generate SHA-256 hash of prompt
 */
function hashPrompt(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
}

/**
 * Build visualization prompt from vision brief data
 */
function buildVisualizationPrompt(sdData, visionDiscovery) {
  const personas = visionDiscovery.stakeholder_personas || [];
  const chairman = visionDiscovery.chairman_perspective || {};

  // Build persona descriptions
  const personaDescriptions = personas.map(p => {
    const needs = (p.needs || []).slice(0, 2).join(', ');
    const success = (p.success_criteria || []).slice(0, 2).join(', ');
    return `${p.name}: needs ${needs}; success = ${success}`;
  }).join('\n');

  // Build chairman context
  const chairmanContext = chairman.primary_kpi
    ? `Primary KPI: ${chairman.primary_kpi}\nSuccess: ${chairman.success_definition || 'N/A'}`
    : '';

  // SD context
  const sdTitle = sdData.title || 'Untitled SD';
  const sdScope = (sdData.scope || '').substring(0, 200);

  const prompt = `Create a clean, modern UI dashboard mockup for a software feature called "${sdTitle}".

This is a governance/operations dashboard for a Solo Entrepreneur managing multiple ventures.

KEY STAKEHOLDERS:
${personaDescriptions}

${chairmanContext ? `CHAIRMAN PRIORITIES:\n${chairmanContext}` : ''}

SCOPE CONTEXT:
${sdScope}

DESIGN REQUIREMENTS:
- Clean, minimal design with clear visual hierarchy
- Professional color palette (blues, grays, subtle accents)
- Show key metrics and KPIs prominently
- Include navigation elements suggesting a larger system
- Data visualizations (charts, progress bars) where appropriate
- Responsive layout suitable for desktop
- Modern SaaS dashboard aesthetic

STYLE: Figma-quality mockup, light theme, 16:9 aspect ratio, crisp UI elements.`;

  return prompt;
}

/**
 * Ensure storage bucket exists
 */
async function ensureBucketExists(supabase) {
  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.warn(`   Warning: Could not list buckets: ${listError.message}`);
    return false;
  }

  const bucketExists = buckets.some(b => b.name === STORAGE_BUCKET);

  if (!bucketExists) {
    console.log(`   Creating storage bucket: ${STORAGE_BUCKET}`);
    const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10485760 // 10MB
    });

    if (createError) {
      console.error(`   Failed to create bucket: ${createError.message}`);
      return false;
    }
    console.log('   Bucket created successfully');
  }

  return true;
}

/**
 * Upload image to Supabase Storage
 */
async function uploadToStorage(supabase, sdId, imageBuffer, mimeType) {
  const timestamp = Date.now();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `sd/${sdId}/vision/${timestamp}.${extension}`;

  console.log(`   Uploading to: ${STORAGE_BUCKET}/${path}`);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, imageBuffer, {
      contentType: mimeType,
      upsert: false
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const { sdId, dryRun, confirm, allowDraft, providerMode } = parseArgs();

  // Validate input
  if (!sdId) {
    console.log('Usage: node scripts/generate-vision-visualization.js <SD-ID> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run              Preview prompt without generating image');
    console.log('  --confirm              Actually generate and upload (required for writes)');
    console.log('  --allow-draft          Allow visualization of draft (unapproved) briefs');
    console.log('  --provider <mode>      Provider selection: auto (default), gemini, openai');
    console.log('');
    console.log('Provider modes:');
    console.log('  auto     Gemini first, fallback to OpenAI on failure (default)');
    console.log('  gemini   Force Gemini only, fail if unavailable');
    console.log('  openai   Force OpenAI only, fail if unavailable');
    console.log('');
    console.log('Environment variables:');
    console.log('  GEMINI_API_KEY              Gemini API key (primary provider)');
    console.log('  OPENAI_API_KEY              OpenAI API key (fallback provider)');
    console.log('  VISION_VISUALIZATION_MODEL  Override Gemini model (default: gemini-2.5-flash-image)');
    console.log('  VISION_IMAGE_MODEL          Override OpenAI model (default: dall-e-3)');
    process.exit(1);
  }

  // Get provider info for display
  const providerInfo = getProviderInfo(providerMode);

  console.log('');
  console.log('='.repeat(60));
  console.log('VISION BRIEF VISUALIZATION GENERATOR');
  console.log('='.repeat(60));
  console.log('');
  console.log(`   SD: ${sdId}`);
  console.log(`   Mode: ${dryRun ? 'DRY-RUN' : (confirm ? 'GENERATE' : 'PREVIEW')}`);
  console.log(`   Allow Draft: ${allowDraft ? 'YES' : 'NO'}`);
  console.log('');
  console.log('Provider Selection:');
  console.log(`   Requested: --provider ${providerMode}`);
  console.log(`   Selected:  ${providerInfo.name}`);
  console.log(`   Model:     ${providerInfo.model}`);
  console.log(`   Reason:    ${providerInfo.reason}`);
  console.log(`   Available: ${providerInfo.available ? 'YES' : 'NO'}`);
  console.log('');

  // Check provider availability early
  if (!dryRun && !isVisualizationAvailable()) {
    console.error('ERROR: No visualization provider configured.');
    console.error('Set GEMINI_API_KEY or OPENAI_API_KEY in environment.');
    process.exit(1);
  }

  if (!dryRun && !providerInfo.available) {
    console.error(`ERROR: Requested provider '${providerInfo.name}' is not available.`);
    console.error(`Reason: ${providerInfo.reason}`);
    process.exit(1);
  }

  // Initialize Supabase client
  const supabase = await createSupabaseServiceClient('engineer');

  // Step 1: Fetch SD record
  console.log('Step 1: Fetching SD record...');
  const { data: sdData, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, scope, description, sd_type, strategic_objectives, metadata')
    .eq('id', sdId)
    .single();

  if (fetchError || !sdData) {
    console.error(`   ERROR: SD not found: ${sdId}`);
    console.error(`   ${fetchError?.message || 'No data returned'}`);
    process.exit(1);
  }

  console.log(`   Title: ${sdData.title}`);
  console.log(`   Type: ${sdData.sd_type || 'not set'}`);
  console.log('');

  // Step 2: Validate vision_discovery exists
  console.log('Step 2: Checking vision_discovery...');
  const visionDiscovery = sdData.metadata?.vision_discovery;

  if (!visionDiscovery) {
    console.error('   ERROR: No vision_discovery found in SD metadata.');
    console.error('');
    console.error('   Run first: node scripts/generate-vision-brief.js ' + sdId + ' --confirm');
    process.exit(1);
  }

  const approvalStatus = visionDiscovery.approval?.status || 'unknown';
  const personas = visionDiscovery.stakeholder_personas || [];

  console.log(`   Approval status: ${approvalStatus}`);
  console.log(`   Personas: ${personas.length}`);

  // Step 3: Gate check - require approved brief
  if (approvalStatus !== 'approved' && !allowDraft) {
    console.error('');
    console.error('   ERROR: Vision brief is not approved.');
    console.error(`   Current status: ${approvalStatus}`);
    console.error('');
    console.error('   Options:');
    console.error(`   1. Approve: node scripts/approve-vision-brief.js ${sdId}`);
    console.error('   2. Override: add --allow-draft flag');
    process.exit(1);
  }

  if (approvalStatus !== 'approved' && allowDraft) {
    console.log('   --allow-draft specified: Proceeding with unapproved brief');
  }
  console.log('');

  // Step 4: Check existing visualization
  console.log('Step 3: Checking existing visualization...');
  const existingViz = visionDiscovery.visualization;
  const existingVersion = existingViz?.version || 0;

  if (existingViz?.url) {
    console.log(`   Existing visualization found (v${existingVersion})`);
    console.log(`   URL: ${existingViz.url}`);
    console.log(`   Will create new version: ${existingVersion + 1}`);
  } else {
    console.log('   No existing visualization');
  }
  console.log('');

  // Step 5: Build visualization prompt
  console.log('Step 4: Building visualization prompt...');
  const prompt = buildVisualizationPrompt(sdData, visionDiscovery);
  const promptHash = hashPrompt(prompt);

  console.log(`   Prompt length: ${prompt.length} chars`);
  console.log(`   Prompt hash: ${promptHash}`);
  console.log('');

  // Display prompt preview
  console.log('Visualization Prompt:');
  console.log('-'.repeat(60));
  console.log(prompt);
  console.log('-'.repeat(60));
  console.log('');

  // Step 6: Handle dry-run / preview / confirm modes
  if (dryRun) {
    console.log('DRY-RUN: Would generate visualization with above prompt.');
    console.log('');
    console.log('Would use:');
    console.log(`   Provider: ${providerInfo.name}`);
    console.log(`   Model: ${providerInfo.model}`);
    console.log(`   Prompt hash: ${promptHash}`);
    console.log('');
    console.log('No image generated, no changes made.');
    process.exit(0);
  }

  if (!confirm) {
    console.log('PREVIEW: Prompt ready for visualization.');
    console.log('');
    console.log('Would use:');
    console.log(`   Provider: ${providerInfo.name}`);
    console.log(`   Model: ${providerInfo.model}`);
    console.log(`   Prompt hash: ${promptHash}`);
    console.log('');
    console.log('To generate and upload, re-run with --confirm');
    process.exit(1);
  }

  // Step 7: Generate image with fallback support
  console.log('Step 5: Generating visualization...');
  let result;

  try {
    result = await generateWithFallback(prompt, providerMode);
    console.log(`   Generated successfully (${result.imageBuffer.length} bytes)`);
    console.log(`   Provider: ${result.provider}`);
    console.log(`   Model: ${result.model}`);
    console.log(`   Selection: ${result.reason}`);
  } catch (genError) {
    console.error(`   ERROR: Image generation failed: ${genError.message}`);
    process.exit(1);
  }
  console.log('');

  // Step 8: Upload to storage
  console.log('Step 6: Uploading to Supabase Storage...');

  try {
    await ensureBucketExists(supabase);
    const publicUrl = await uploadToStorage(supabase, sdId, result.imageBuffer, result.mimeType);
    console.log('   Uploaded successfully');
    console.log(`   URL: ${publicUrl}`);

    // Step 9: Update SD metadata
    console.log('');
    console.log('Step 7: Updating SD metadata...');

    const newVersion = existingVersion + 1;
    const visualization = {
      status: 'draft',
      prompt: prompt,
      prompt_hash: promptHash,
      url: publicUrl,
      provider: result.provider,
      model: result.model,
      selection_reason: result.reason,
      generated_at: new Date().toISOString(),
      generated_by: 'generate-vision-visualization.js',
      version: newVersion
    };

    const updatedVisionDiscovery = {
      ...visionDiscovery,
      visualization: visualization
    };

    const updatedMetadata = {
      ...(sdData.metadata || {}),
      vision_discovery: updatedVisionDiscovery
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', sdId);

    if (updateError) {
      console.error(`   ERROR: Failed to update SD: ${updateError.message}`);
      process.exit(1);
    }

    console.log(`   Version: ${newVersion}`);
    console.log('   SUCCESS: Visualization metadata saved');

  } catch (uploadError) {
    console.error(`   ERROR: Upload failed: ${uploadError.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('VISUALIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Done.');
}

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
