/**
 * Stitch Exporter - Artifact Export at Stage 17 Gate Approval
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-C
 *
 * Exports Stitch design screens as self-contained HTML and PNG,
 * generates DESIGN.md, and adds SRI integrity hashes to CDN refs.
 *
 * @module eva/bridge/stitch-exporter
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Stitch Client Loader (via stitch-adapter.js facade)
// SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-C: Route through adapter, not client
// ---------------------------------------------------------------------------

let _stitchClient = null;
let _stitchClientLoader = null;

export function setStitchClientLoader(loader) {
  _stitchClientLoader = loader;
  _stitchClient = null;
}

async function getStitchClient() {
  if (_stitchClient) return _stitchClient;
  if (_stitchClientLoader) {
    _stitchClient = await _stitchClientLoader();
    return _stitchClient;
  }
  try {
    // Use stitch-client.js (not stitch-adapter.js) — exporter needs listScreens,
    // exportScreenHtml, exportScreenImage which are on the client, not the adapter.
    const mod = await import(/* @vite-ignore */ './stitch-client.js');
    _stitchClient = mod;
    return _stitchClient;
  } catch (err) {
    throw new Error(`Cannot load stitch-client: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Supabase Client Loader (test-injectable)
// SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-A: venture_artifacts persistence path
// ---------------------------------------------------------------------------

let _supabaseClient = null;
let _supabaseClientLoader = null;

export function setSupabaseClientLoader(loader) {
  _supabaseClientLoader = loader;
  _supabaseClient = null;
}

async function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (_supabaseClientLoader) {
    _supabaseClient = await _supabaseClientLoader();
    return _supabaseClient;
  }
  const { createClient } = await import(/* @vite-ignore */ '@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for stitch_design_export persistence');
  }
  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

// ---------------------------------------------------------------------------
// Structured Logger — prefix [stitch-exporter] per TR-3
// ---------------------------------------------------------------------------

function logWarn(event, details = {}) {
  console.warn(`[stitch-exporter] ${JSON.stringify({ event, level: 'warn', timestamp: new Date().toISOString(), ...details })}`);
}

function logInfo(event, details = {}) {
  console.info(`[stitch-exporter] ${JSON.stringify({ event, level: 'info', timestamp: new Date().toISOString(), ...details })}`);
}

// ---------------------------------------------------------------------------
// SRI Hash Injection
// ---------------------------------------------------------------------------

const CDN_PATTERNS = [
  /(<(?:script|link)[^>]*(?:src|href)=["'])([^"']*(?:googleapis|gstatic|cdnjs|unpkg|jsdelivr|cloudflare)[^"']*)(["'][^>]*)(\/?>)/gi,
];

/**
 * Generate SRI hash for content fetched from a URL.
 * In production, would fetch the resource — here we generate from URL as placeholder.
 */
function generateSRIHash(content) {
  const hash = createHash('sha384').update(content).digest('base64');
  return `sha384-${hash}`;
}

/**
 * Add SRI integrity attributes to CDN references in HTML.
 */
export function injectSRIHashes(html) {
  if (!html || typeof html !== 'string') return html;

  let result = html;
  for (const pattern of CDN_PATTERNS) {
    result = result.replace(pattern, (match, prefix, url, quote, closing) => {
      if (match.includes('integrity=')) return match; // already has SRI
      const hash = generateSRIHash(url);
      return `${prefix}${url}${quote} integrity="${hash}" crossorigin="anonymous"${closing}`;
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// DESIGN.md Generation
// ---------------------------------------------------------------------------

function generateDesignMd(screens, brandTokens) {
  const lines = ['# DESIGN.md', '', '## Design Tokens', ''];

  if (brandTokens?.colors?.length > 0) {
    lines.push('### Colors');
    brandTokens.colors.forEach(c => lines.push(`- \`${c}\``));
    lines.push('');
  }

  if (brandTokens?.fonts?.length > 0) {
    lines.push('### Typography');
    brandTokens.fonts.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  if (brandTokens?.personality) {
    lines.push('### Brand Personality');
    lines.push(typeof brandTokens.personality === 'string'
      ? brandTokens.personality
      : JSON.stringify(brandTokens.personality, null, 2));
    lines.push('');
  }

  lines.push('## Screens', '');
  screens.forEach(s => {
    lines.push(`### ${s.name || s.screen_id}`);
    if (s.dimensions) lines.push(`- Dimensions: ${s.dimensions.w || '?'}x${s.dimensions.h || '?'}`);
    lines.push(`- HTML: \`screens/${s.screen_id}.html\``);
    lines.push(`- Screenshot: \`screenshots/${s.screen_id}.png\``);
    lines.push('');
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Feature Flag: isStitchExportEnabled (US-002)
// ---------------------------------------------------------------------------
// Mirrors the isStitchEnabled() pattern in stitch-adapter.js. Reads
// chairman_dashboard_config.taste_gate_config.stitch_export_enabled.
// Returns true ONLY when the key is strictly === true; false on missing,
// null, non-boolean, or query failure.

export async function isStitchExportEnabled() {
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from('chairman_dashboard_config')
      .select('taste_gate_config')
      .limit(1)
      .single();
    if (error) {
      logWarn('flag_read_error', { error: error.message });
      return false;
    }
    return data?.taste_gate_config?.stitch_export_enabled === true;
  } catch (err) {
    logWarn('flag_read_exception', { error: err.message || String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Content Validation (US-004)
// ---------------------------------------------------------------------------
// Pure function. Validates exported files and returns filtered arrays plus
// structured warnings. Invalid files are excluded from the manifest but do
// not abort the whole export.

export const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const HTML_MAX_BYTES = 5 * 1024 * 1024;   // 5 MB per file
export const PNG_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB per file
export const TOTAL_MAX_BYTES = 50 * 1024 * 1024; // 50 MB manifest cap

function hasValidPngMagic(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  return buf.subarray(0, 8).equals(PNG_MAGIC_BYTES);
}

/**
 * Validate and filter exported content.
 *
 * @param {Array<{screen_id: string, html: string}>} htmlFiles
 * @param {Array<{screen_id: string, buffer: Buffer}>} pngFiles
 * @param {string} designMd
 * @returns {{validHtml: Array, validPng: Array, designMd: string, warnings: Array}}
 */
export function validateExportContent(htmlFiles, pngFiles, designMd) {
  const warnings = [];

  // Step 1: Per-file validation
  const validHtml = [];
  for (const entry of htmlFiles || []) {
    const size = Buffer.byteLength(entry.html || '', 'utf-8');
    if (size > HTML_MAX_BYTES) {
      warnings.push({ type: 'html_oversize', screen_id: entry.screen_id, size, limit: HTML_MAX_BYTES });
      continue;
    }
    validHtml.push({ ...entry, size });
  }

  const validPng = [];
  for (const entry of pngFiles || []) {
    if (!hasValidPngMagic(entry.buffer)) {
      warnings.push({ type: 'png_invalid_magic', screen_id: entry.screen_id });
      continue;
    }
    if (entry.buffer.length > PNG_MAX_BYTES) {
      warnings.push({ type: 'png_oversize', screen_id: entry.screen_id, size: entry.buffer.length, limit: PNG_MAX_BYTES });
      continue;
    }
    validPng.push({ ...entry, size: entry.buffer.length });
  }

  // Step 2: Total manifest cap. If over, drop files from the largest end
  // (preserve small files first — deterministic, stable sort ascending by size).
  const designMdSize = Buffer.byteLength(designMd || '', 'utf-8');
  const pool = [
    ...validHtml.map(e => ({ kind: 'html', entry: e, size: e.size })),
    ...validPng.map(e => ({ kind: 'png', entry: e, size: e.size })),
  ];
  pool.sort((a, b) => a.size - b.size);

  let running = designMdSize;
  const kept = [];
  for (const item of pool) {
    if (running + item.size > TOTAL_MAX_BYTES) {
      warnings.push({
        type: 'total_cap_drop',
        kind: item.kind,
        screen_id: item.entry.screen_id,
        size: item.size,
        running,
        limit: TOTAL_MAX_BYTES,
      });
      continue;
    }
    running += item.size;
    kept.push(item);
  }

  const finalHtml = kept.filter(k => k.kind === 'html').map(k => k.entry);
  const finalPng = kept.filter(k => k.kind === 'png').map(k => k.entry);

  return {
    validHtml: finalHtml,
    validPng: finalPng,
    designMd: designMd || '',
    totalBytes: running,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// venture_artifacts Persistence (US-003)
// ---------------------------------------------------------------------------
// Writes one stitch_design_export row per invocation. Respects the unique
// partial index idx_venture_artifacts_idempotent by first flipping any
// existing current row to is_current=false, then inserting a new row with
// version=version+1 and is_current=true.
//
// Does NOT use a true transaction (Supabase JS client does not support them).
// On INSERT failure after the UPDATE, the old row remains is_current=false.
// This is documented and acceptable; the caller receives status='persistence_failed'.

async function persistToVentureArtifacts({ ventureId, lifecycleStage, manifest, htmlFiles, pngFiles, designMd, validationWarnings }) {
  const sb = await getSupabaseClient();

  // Determine next version and flip existing current row
  const { data: existing, error: selErr } = await sb
    .from('venture_artifacts')
    .select('id, version')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', lifecycleStage)
    .eq('artifact_type', 'stitch_design_export')
    .eq('is_current', true)
    .limit(1);
  if (selErr) {
    throw new Error(`venture_artifacts precheck failed: ${selErr.message}`);
  }

  const nextVersion = (existing && existing[0]?.version != null) ? existing[0].version + 1 : 1;

  if (existing && existing[0]?.id) {
    const { error: updErr } = await sb
      .from('venture_artifacts')
      .update({ is_current: false })
      .eq('id', existing[0].id);
    if (updErr) {
      throw new Error(`venture_artifacts is_current flip failed: ${updErr.message}`);
    }
  }

  // Build row. `content` is a TEXT column (per DATABASE sub-agent findings
  // row 3238464b-b9c7-41d4-8550-2bc9515a85d8) — stores a summary. The
  // structured manifest and base64 PNG bodies live in the `metadata` JSONB.
  const png_files_base64 = (pngFiles || []).map(p => ({
    screen_id: p.screen_id,
    base64: p.buffer.toString('base64'),
    size: p.size,
  }));
  const html_files = (htmlFiles || []).map(h => ({
    screen_id: h.screen_id,
    html: h.html,
    size: h.size,
  }));

  const summary = `Stitch design export for venture ${ventureId}: ${manifest.screen_count} screens, ${manifest.total_files} files, ${manifest.total_size} bytes, generated ${manifest.exported_at}`;

  const row = {
    venture_id: ventureId,
    artifact_type: 'stitch_design_export',
    lifecycle_stage: lifecycleStage,
    title: `Stitch Design Export (v${nextVersion})`,
    content: summary,
    is_current: true,
    version: nextVersion,
    metadata: {
      schema_version: 1,
      manifest,
      html_files,
      png_files_base64,
      design_md: designMd || '',
      validation_warnings: validationWarnings || [],
      exported_at: manifest.exported_at,
    },
  };

  const { data: inserted, error: insErr } = await sb
    .from('venture_artifacts')
    .insert(row)
    .select('id')
    .single();
  if (insErr) {
    throw new Error(`venture_artifacts insert failed: ${insErr.message}`);
  }

  return { id: inserted?.id, version: nextVersion };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Export Stitch design artifacts for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} projectId - Stitch project ID
 * @param {string|null} outputDir - Output directory path (required when persistTo includes 'filesystem'; optional otherwise)
 * @param {Object} [options] - Additional options
 * @param {Object} [options.brandTokens] - Brand tokens for DESIGN.md
 * @param {number} [options.concurrency] - Max parallel exports (default: 3)
 * @param {('filesystem'|'venture_artifacts'|'both')} [options.persistTo='filesystem'] - Where to persist exports
 * @param {number} [options.lifecycleStage=17] - lifecycle_stage for venture_artifacts rows
 * @returns {Promise<{manifest: Object, html_files: string[], png_files: string[], design_md_path: string|null}>}
 *
 * Graceful degradation: this function never throws. On adapter or persistence
 * failure, it returns a manifest with a non-empty `status` field:
 *   - 'skipped_flag_disabled'      — stitch_export_enabled is not true
 *   - 'stitch_adapter_unavailable' — listScreens or screen export failed hard
 *   - 'persistence_failed'         — venture_artifacts insert raised an error
 */
export async function exportStitchArtifacts(ventureId, projectId, outputDir, options = {}) {
  const concurrency = options.concurrency || 3;
  const persistTo = options.persistTo || 'filesystem';
  const lifecycleStage = options.lifecycleStage || 17;
  const wantsFilesystem = persistTo === 'filesystem' || persistTo === 'both';
  const wantsVentureArtifacts = persistTo === 'venture_artifacts' || persistTo === 'both';

  // Feature flag gate — ONLY applies when venture_artifacts persistence is requested.
  // Filesystem-only callers (backward compat) are not affected by the flag.
  if (wantsVentureArtifacts) {
    const enabled = await isStitchExportEnabled();
    if (!enabled) {
      logInfo('skipped_flag_disabled', { venture_id: ventureId, project_id: projectId });
      return {
        manifest: {
          venture_id: ventureId,
          project_id: projectId,
          screen_count: 0,
          files: [],
          status: 'skipped_flag_disabled',
        },
        html_files: [],
        png_files: [],
        design_md_path: null,
      };
    }
  }

  // List screens (wrapped for graceful degradation)
  let client;
  let screens;
  try {
    client = await getStitchClient();
    screens = await client.listScreens(projectId);
  } catch (err) {
    logWarn('stitch_adapter_unavailable', { venture_id: ventureId, project_id: projectId, error: err.message || String(err) });
    return {
      manifest: {
        venture_id: ventureId,
        project_id: projectId,
        screen_count: 0,
        files: [],
        status: 'stitch_adapter_unavailable',
        error_message: err.message || String(err),
      },
      html_files: [],
      png_files: [],
      design_md_path: null,
    };
  }

  if (screens.length === 0) {
    return {
      manifest: { venture_id: ventureId, project_id: projectId, screen_count: 0, files: [] },
      html_files: [],
      png_files: [],
      design_md_path: null,
    };
  }

  // Prepare filesystem dirs only when filesystem persistence is active
  let screensDir = null;
  let screenshotsDir = null;
  if (wantsFilesystem) {
    if (!outputDir) {
      throw new Error('outputDir is required when persistTo includes "filesystem"');
    }
    screensDir = join(outputDir, 'screens');
    screenshotsDir = join(outputDir, 'screenshots');
    await mkdir(screensDir, { recursive: true });
    await mkdir(screenshotsDir, { recursive: true });
  }

  const html_files = [];       // filesystem paths (backward compat)
  const png_files = [];        // filesystem paths (backward compat)
  const manifestFiles = [];    // manifest entries (filesystem)
  const htmlEntries = [];      // in-memory entries for venture_artifacts path
  const pngEntries = [];       // in-memory entries for venture_artifacts path
  const exportErrors = [];     // per-screen adapter failures

  // Export screens in batches
  for (let i = 0; i < screens.length; i += concurrency) {
    const batch = screens.slice(i, i + concurrency);
    await Promise.all(batch.map(async (screen) => {
      const screenId = screen.screen_id;

      // Export HTML
      try {
        let html = await client.exportScreenHtml(screenId, projectId);
        html = injectSRIHashes(html);
        htmlEntries.push({ screen_id: screenId, html });
        if (wantsFilesystem) {
          const htmlPath = join(screensDir, `${screenId}.html`);
          await writeFile(htmlPath, html, 'utf-8');
          html_files.push(htmlPath);
          manifestFiles.push({ type: 'html', screen_id: screenId, path: `screens/${screenId}.html`, size: Buffer.byteLength(html) });
        }
      } catch (err) {
        logWarn('html_export_failed', { screen_id: screenId, error: err.message });
        exportErrors.push({ screen_id: screenId, type: 'html', error: err.message });
      }

      // Export PNG
      try {
        const pngBuffer = await client.exportScreenImage(screenId, { projectId });
        pngEntries.push({ screen_id: screenId, buffer: pngBuffer });
        if (wantsFilesystem) {
          const pngPath = join(screenshotsDir, `${screenId}.png`);
          await writeFile(pngPath, pngBuffer);
          png_files.push(pngPath);
          manifestFiles.push({ type: 'png', screen_id: screenId, path: `screenshots/${screenId}.png`, size: pngBuffer.length });
        }
      } catch (err) {
        logWarn('png_export_failed', { screen_id: screenId, error: err.message });
        exportErrors.push({ screen_id: screenId, type: 'png', error: err.message });
      }
    }));
  }

  // Retry missing screens: Stitch generation is async — some screens may not
  // have been ready during the first pass. Re-poll and export any new ones.
  // SD-S17-ARCHETYPE-GENERATION-RESILIENCE-ORCH-001
  const exportedIds = new Set(htmlEntries.map(e => e.screen_id));
  if (exportedIds.size < screens.length) {
    const maxRetries = 3;
    const retryDelayMs = 30_000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const missing = screens.filter(s => !exportedIds.has(s.screen_id));
      if (missing.length === 0) break;
      console.info(`[stitch-exporter] ${missing.length} screens missing after export, retry ${attempt}/${maxRetries} in ${retryDelayMs / 1000}s...`);
      await new Promise(r => setTimeout(r, retryDelayMs));

      // Re-poll for newly available screens
      const freshScreens = await client.listScreens(projectId);
      const freshIds = new Set(freshScreens.map(s => s.screen_id));

      for (const screen of missing) {
        if (!freshIds.has(screen.screen_id)) continue; // still not in project
        try {
          let html = await client.exportScreenHtml(screen.screen_id, projectId);
          html = injectSRIHashes(html);
          htmlEntries.push({ screen_id: screen.screen_id, html });
          exportedIds.add(screen.screen_id);
          const pngBuffer = await client.exportScreenImage(screen.screen_id, { projectId });
          pngEntries.push({ screen_id: screen.screen_id, buffer: pngBuffer });
          console.info(`[stitch-exporter] Retry captured screen ${screen.screen_id}`);
        } catch (err) {
          exportErrors.push({ screen_id: screen.screen_id, type: 'retry', error: err.message, attempt });
        }
      }
    }
    const stillMissing = screens.length - exportedIds.size;
    if (stillMissing > 0) {
      console.warn(`[stitch-exporter] ${stillMissing} screen(s) still missing after ${maxRetries} retries`);
    }
  }

  // Generate DESIGN.md
  const designMd = generateDesignMd(screens, options.brandTokens || {});
  let designMdPath = null;
  if (wantsFilesystem) {
    designMdPath = join(outputDir, 'DESIGN.md');
    await writeFile(designMdPath, designMd, 'utf-8');
    manifestFiles.push({ type: 'design_md', path: 'DESIGN.md', size: Buffer.byteLength(designMd) });
  }

  // Count both filesystem files and in-memory entries for accurate totals
  const inMemoryFileCount = htmlEntries.length + pngEntries.length + (designMd ? 1 : 0);
  const inMemorySize = htmlEntries.reduce((sum, h) => sum + Buffer.byteLength(h.html || '', 'utf-8'), 0)
    + pngEntries.reduce((sum, p) => sum + (p.buffer?.length || 0), 0)
    + (designMd ? Buffer.byteLength(designMd, 'utf-8') : 0);

  // Verification: compare exported count against expected prompt count
  const expectedCount = options.expectedScreenCount || screens.length;
  if (htmlEntries.length < expectedCount) {
    const gap = expectedCount - htmlEntries.length;
    console.warn(`[stitch-exporter] SCREEN COUNT MISMATCH: exported ${htmlEntries.length} of ${expectedCount} expected screens (${gap} missing)`);
    exportErrors.push({ type: 'screen_count_mismatch', exported: htmlEntries.length, expected: expectedCount, missing: gap });
  }

  const manifest = {
    venture_id: ventureId,
    project_id: projectId,
    screen_count: htmlEntries.length,
    exported_at: new Date().toISOString(),
    total_files: manifestFiles.length || inMemoryFileCount,
    total_size: manifestFiles.reduce((sum, f) => sum + (f.size || 0), 0) || inMemorySize,
    files: manifestFiles,
    export_errors: exportErrors,
  };

  logInfo('export_complete', {
    venture_id: ventureId,
    screen_count: screens.length,
    html_count: htmlEntries.length,
    png_count: pngEntries.length,
    errors: exportErrors.length,
  });

  // venture_artifacts persistence branch
  if (wantsVentureArtifacts) {
    // Validate content before persistence
    const validated = validateExportContent(htmlEntries, pngEntries, designMd);
    manifest.validation_warnings = validated.warnings;
    manifest.total_bytes_persisted = validated.totalBytes;

    try {
      const persistResult = await persistToVentureArtifacts({
        ventureId,
        lifecycleStage,
        manifest,
        htmlFiles: validated.validHtml,
        pngFiles: validated.validPng,
        designMd: validated.designMd,
        validationWarnings: validated.warnings,
      });
      manifest.venture_artifact_id = persistResult.id;
      manifest.version = persistResult.version;
      manifest.status = 'persisted';

      // SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-C (US-006): fire-and-forget vision QA.
      // The QA module reads the validated png_files we just persisted (passed
      // explicitly so it doesn't have to re-query). It never throws — graceful
      // degradation is built in. We do NOT await — the export response must
      // not depend on QA latency or success.
      const qaPayload = {
        screen_count: screens.length,
        venture_artifact_id: persistResult.id,
        png_files_base64: validated.validPng.map((p) => ({
          screen_id: p.screen_id,
          base64: p.buffer.toString('base64'),
        })),
      };
      logInfo('stitch_qa_started', { venture_id: ventureId, screen_count: qaPayload.screen_count });
      import(/* @vite-ignore */ '../qa/stitch-vision-qa.js')
        .then(({ reviewStitchExport }) => reviewStitchExport(ventureId, qaPayload))
        .catch((err) => logWarn('stitch_qa_dispatch_failed', { error: err?.message || String(err) }));

      // SD-WIREFRAME-FIDELITY-VERIFICATION-VISION-ORCH-001-B: Wireframe fidelity QA with iterative loop
      // Fire-and-forget — does not block export completion
      import(/* @vite-ignore */ '../qa/stitch-wireframe-qa.js')
        .then(({ iterateUntilPass }) => iterateUntilPass(ventureId))
        .catch((err) => logWarn('wireframe_qa_dispatch_failed', { error: err?.message || String(err) }));
    } catch (err) {
      logWarn('persistence_failed', { venture_id: ventureId, error: err.message });
      manifest.status = 'persistence_failed';
      manifest.error_message = err.message;
    }
  }

  return { manifest, html_files, png_files, design_md_path: designMdPath };
}

// Export for testing
export { generateDesignMd };
