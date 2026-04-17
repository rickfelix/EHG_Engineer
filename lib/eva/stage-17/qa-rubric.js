/**
 * Stage 17 QA Rubric and GitHub Upload
 *
 * Executes 3-layer gap analysis on completed Stage 17 design artifacts:
 *   Layer 1 (base): checks all 14 sessions have approved artifacts
 *   Layer 2 (product): validates HTML structure against product spec patterns
 *   Layer 3 (venture): checks brand token consistency against locked manifest
 *
 * On approval, uploads all 14 HTML files to the venture GitHub repository
 * at ventures/{id}/documents/stage-17/{screen}-{platform}.html.
 * Upload blocks if HIGH-severity QA gaps exist.
 *
 * Exports:
 *   runQARubric(ventureId, supabase)
 *   uploadToGitHub(ventureId, supabase, options)
 *   generateFillScreens(missingScreens, context) — auto-generate missing screen HTML
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-E
 * @module lib/eva/stage-17/qa-rubric
 */

import { getTokenConstraints } from './token-manifest.js';
import { writeArtifact } from '../artifact-persistence-service.js';

const EXPECTED_APPROVED_COUNT = 14; // 7 screens × 2 platforms
const MAX_FILL_CALLS_PER_RUN = 3;

/** Per-run meter tracking fill generation calls. Keyed by `${ventureId}:${qaRunId}`. */
const fillMeter = new Map();

// Clean up stale meter entries after 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of fillMeter) {
    if (now - entry.createdAt > 3_600_000) fillMeter.delete(key);
  }
}, 300_000).unref();

/**
 * Upload error thrown when HIGH-severity QA gaps block GitHub upload.
 */
export class UploadError extends Error {
  constructor(message, gaps) {
    super(message);
    this.name = 'UploadError';
    this.gaps = gaps;
  }
}

// ── Layer helpers ────────────────────────────────────────────────────────────

/**
 * Fetch all approved stage_17 artifacts for the venture.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<Array>} artifact rows
 */
async function fetchApprovedArtifacts(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, content, metadata, title')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', ['stage_17_approved_mobile', 'stage_17_approved_desktop']);

  if (error) throw new Error(`[qa-rubric] DB fetch error: ${error.message}`);
  return data ?? [];
}

/**
 * Layer 1: Base completeness check — all 14 sessions present.
 *
 * @param {Array} approvedArtifacts
 * @returns {{ score: number, items: Array }}
 */
function runLayer1(approvedArtifacts) {
  const items = [];
  const mobileCount = approvedArtifacts.filter(a => a.artifact_type === 'stage_17_approved_mobile').length;
  const desktopCount = approvedArtifacts.filter(a => a.artifact_type === 'stage_17_approved_desktop').length;
  const totalCount = approvedArtifacts.length;

  if (totalCount < EXPECTED_APPROVED_COUNT) {
    const missing = EXPECTED_APPROVED_COUNT - totalCount;
    items.push({
      description: `Missing ${missing} approved artifact(s). Have ${mobileCount} mobile + ${desktopCount} desktop, need 7 + 7.`,
      severity: 'HIGH',
      layer: 1,
    });
  }

  if (mobileCount < 7) {
    items.push({
      description: `Only ${mobileCount}/7 mobile designs approved. Complete mobile sessions before desktop.`,
      severity: 'HIGH',
      layer: 1,
    });
  }

  if (desktopCount < 7) {
    items.push({
      description: `Only ${desktopCount}/7 desktop designs approved.`,
      severity: 'HIGH',
      layer: 1,
    });
  }

  const score = totalCount >= EXPECTED_APPROVED_COUNT ? 100 : Math.round((totalCount / EXPECTED_APPROVED_COUNT) * 100);
  return { score, items };
}

/**
 * Layer 2: Product spec conformance — navigation, CTA, data visualization.
 * Uses HTML pattern matching against common product spec requirements.
 *
 * @param {Array} approvedArtifacts
 * @returns {{ score: number, items: Array }}
 */
function runLayer2(approvedArtifacts) {
  const items = [];
  let passCount = 0;
  let totalChecks = 0;

  for (const artifact of approvedArtifacts) {
    const html = artifact.content ?? '';
    const screenLabel = artifact.metadata?.screenId ?? artifact.title ?? artifact.id.slice(0, 8);

    // Navigation structure check
    totalChecks++;
    if (/<nav[\s>]|role="navigation"|aria-label.*nav/i.test(html)) {
      passCount++;
    } else {
      items.push({
        description: `${screenLabel}: Missing navigation structure (<nav> or role="navigation")`,
        severity: 'MED',
        layer: 2,
      });
    }

    // CTA presence check (buttons or primary action links)
    totalChecks++;
    if (/<button[\s>]|type="submit"|class=".*cta.*"|class=".*btn-primary.*"|href.*cta/i.test(html)) {
      passCount++;
    } else {
      items.push({
        description: `${screenLabel}: No clear CTA element found (button, submit, or primary action)`,
        severity: 'MED',
        layer: 2,
      });
    }
  }

  const score = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 100;
  return { score, items };
}

/**
 * Layer 3: Venture brand token consistency.
 * Checks CSS custom properties or inline color values match the locked token manifest.
 *
 * @param {Array} approvedArtifacts
 * @param {object|null} tokens - Locked token manifest
 * @returns {{ score: number, items: Array }}
 */
function runLayer3(approvedArtifacts, tokens) {
  const items = [];

  if (!tokens) {
    items.push({
      description: 'No locked token manifest found. Cannot validate brand token consistency.',
      severity: 'HIGH',
      layer: 3,
    });
    return { score: 0, items };
  }

  const brandColors = (tokens.colors ?? []).map(c => c.toLowerCase());
  if (brandColors.length === 0) {
    return { score: 100, items }; // No colors to validate against
  }

  let passCount = 0;
  const total = approvedArtifacts.length;

  for (const artifact of approvedArtifacts) {
    const html = (artifact.content ?? '').toLowerCase();
    const screenLabel = artifact.metadata?.screenId ?? artifact.title ?? artifact.id.slice(0, 8);

    // Check if any brand color appears in the HTML
    const hasBrandColor = brandColors.some(color => html.includes(color));
    if (hasBrandColor) {
      passCount++;
    } else {
      items.push({
        description: `${screenLabel}: No brand colors detected. Possible token drift.`,
        severity: 'HIGH',
        layer: 3,
      });
    }
  }

  const score = total > 0 ? Math.round((passCount / total) * 100) : 100;
  return { score, items };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run 3-layer QA rubric on all Stage 17 approved artifacts.
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<{ layers: { base: object, product: object, venture: object }, items: Array, overallScore: number }>}
 */
export async function runQARubric(ventureId, supabase) {
  const [approvedArtifacts, tokens] = await Promise.all([
    fetchApprovedArtifacts(supabase, ventureId),
    getTokenConstraints(ventureId, supabase),
  ]);

  const layer1 = runLayer1(approvedArtifacts);
  const layer2 = runLayer2(approvedArtifacts);
  const layer3 = runLayer3(approvedArtifacts, tokens);

  const allItems = [...layer1.items, ...layer2.items, ...layer3.items];
  const overallScore = Math.round((layer1.score + layer2.score + layer3.score) / 3);

  return {
    layers: {
      base: layer1,
      product: layer2,
      venture: layer3,
    },
    items: allItems,
    overallScore,
    highCount: allItems.filter(i => i.severity === 'HIGH').length,
    medCount: allItems.filter(i => i.severity === 'MED').length,
    lowCount: allItems.filter(i => i.severity === 'LOW').length,
  };
}

/**
 * Upload all 14 approved HTML artifacts to the venture GitHub repository.
 * Blocks if runQARubric returns HIGH-severity gaps.
 *
 * Files are committed to: ventures/{ventureId}/documents/stage-17/{screenId}-{platform}.html
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @param {object} [options]
 * @param {string} [options.githubToken] - GitHub token (falls back to GITHUB_TOKEN env)
 * @param {string} [options.repoFullName] - e.g. "org/venture-repo" (falls back to ventures table)
 * @returns {Promise<{ filesUploaded: number, commitSha: string|null }>}
 * @throws {UploadError} if HIGH QA gaps exist
 */
export async function uploadToGitHub(ventureId, supabase, options = {}) {
  // 1. Run QA rubric first — block on HIGH severity
  const rubric = await runQARubric(ventureId, supabase);
  const highGaps = rubric.items.filter(i => i.severity === 'HIGH');

  if (highGaps.length > 0) {
    throw new UploadError(
      `GitHub upload blocked: ${highGaps.length} HIGH-severity QA gap(s) must be resolved first.`,
      highGaps
    );
  }

  // 2. Fetch approved artifacts
  const approvedArtifacts = await fetchApprovedArtifacts(supabase, ventureId);

  if (approvedArtifacts.length === 0) {
    throw new UploadError('No approved artifacts found for upload.', []);
  }

  // 3. Resolve GitHub repo
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error('[qa-rubric] GITHUB_TOKEN not set. Cannot upload to GitHub.');

  let repoFullName = options.repoFullName;
  if (!repoFullName) {
    const { data: venture } = await supabase
      .from('ventures')
      .select('metadata')
      .eq('id', ventureId)
      .single();
    repoFullName = venture?.metadata?.github_repo ?? null;
  }

  if (!repoFullName) {
    throw new Error(`[qa-rubric] No GitHub repository configured for venture ${ventureId}`);
  }

  const GITHUB_API = 'https://api.github.com';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // 4. Commit each HTML file
  let filesUploaded = 0;
  let lastCommitSha = null;

  for (const artifact of approvedArtifacts) {
    const screenId = artifact.metadata?.screenId ?? artifact.id.slice(0, 8);
    const platform = artifact.artifact_type === 'stage_17_approved_mobile' ? 'mobile' : 'desktop';
    const filePath = `ventures/${ventureId}/documents/stage-17/${screenId}-${platform}.html`;
    const content = artifact.content ?? '';

    // Check if file exists (to get current SHA for updates)
    let existingSha = null;
    const checkRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/contents/${filePath}`, { headers });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      existingSha = existing.sha;
    }

    const body = {
      message: `feat(stage-17): add approved ${platform} design for screen ${screenId}`,
      content: Buffer.from(content).toString('base64'),
      ...(existingSha ? { sha: existingSha } : {}),
    };

    const putRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`[qa-rubric] GitHub upload failed for ${filePath}: ${putRes.status} ${errBody}`);
    }

    const result = await putRes.json();
    lastCommitSha = result.commit?.sha ?? null;
    filesUploaded++;
  }

  return { filesUploaded, commitSha: lastCommitSha };
}

/**
 * Generate HTML fill screens for missing screens identified by QA rubric.
 * Calls Claude via getValidationClient() and caches results in venture_artifacts.
 * Metered: max 3 LLM calls per QA run to prevent runaway cost.
 *
 * @param {string[]} missingScreens - Array of missing screen name strings
 * @param {object} context
 * @param {string} context.ventureId - Venture ID for artifact storage
 * @param {object} [context.brandTokens] - Locked brand token manifest
 * @param {string} [context.existingHtml] - Reference HTML from existing screens
 * @param {string} [context.qaRunId] - Unique QA run identifier (auto-generated if omitted)
 * @param {object} [context.supabase] - Supabase client for caching
 * @returns {Promise<{ screens: Array<{screenName: string, html: string}>, capped: boolean, generated: number }>}
 */
export async function generateFillScreens(missingScreens, context = {}) {
  const { ventureId, brandTokens, existingHtml, supabase } = context;
  const qaRunId = context.qaRunId ?? `run-${Date.now()}`;
  const meterKey = `${ventureId}:${qaRunId}`;

  if (!fillMeter.has(meterKey)) {
    fillMeter.set(meterKey, { count: 0, createdAt: Date.now() });
  }
  const meter = fillMeter.get(meterKey);

  if (meter.count >= MAX_FILL_CALLS_PER_RUN) {
    return { screens: [], capped: true, generated: meter.count };
  }

  const remaining = MAX_FILL_CALLS_PER_RUN - meter.count;
  const screensToFill = missingScreens.slice(0, remaining);

  const { getValidationClient } = await import('../../llm/client-factory.js');
  const client = getValidationClient();

  const colorList = (brandTokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary, brand secondary';
  const headingFont = brandTokens?.typeScale?.heading ?? 'serif';
  const bodyFont = brandTokens?.typeScale?.body ?? 'sans-serif';

  const screens = [];

  for (const screenName of screensToFill) {
    const prompt = `Generate a complete, self-contained HTML page for the missing screen "${screenName}".

BRAND TOKENS (LOCKED — do not deviate):
- Colors: ${colorList}
- Heading font: ${headingFont}
- Body font: ${bodyFont}
- Spacing: 4px grid (4, 8, 16, 24, 32, 48px)

${existingHtml ? `REFERENCE (existing screen for style consistency):\n${existingHtml.slice(0, 2000)}\n` : ''}
REQUIREMENTS:
1. Self-contained HTML with inline CSS only (no external links or scripts)
2. Apply locked brand colors using CSS custom properties
3. Use locked fonts via font-family declarations
4. Include navigation structure and at least one CTA element
5. Output ONLY the HTML — no explanation, no markdown fences`;

    const response = await client.complete(prompt);
    const html = typeof response === 'string' ? response : (response?.text ?? response?.content?.[0]?.text ?? '');

    screens.push({ screenName, html });
    meter.count++;

    // Cache in venture_artifacts if supabase provided
    if (supabase && ventureId) {
      try {
        await writeArtifact(supabase, {
          ventureId,
          lifecycleStage: 17,
          artifactType: 's17_archetypes',
          title: `Gap Fill: ${screenName}`,
          content: html,
          artifactData: { screenName, source: 'generateFillScreens', qaRunId },
          qualityScore: 70,
          validationStatus: 'pending',
          source: 'stage-17-qa-rubric-fill',
          metadata: { screenName, qaRunId, generatedAt: new Date().toISOString() },
        });
      } catch (e) {
        // Non-blocking: cache failure should not prevent fill screen return
        console.warn(`[qa-rubric] Failed to cache fill screen ${screenName}:`, e?.message);
      }
    }
  }

  return { screens, capped: false, generated: meter.count };
}
