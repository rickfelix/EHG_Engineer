/**
 * Stage 17 Design Token Manifest
 *
 * Extracts brand tokens (colors, type scale, spacing) from Stage 11/12 identity
 * artifacts at Stitch convergence time and locks them as an immutable venture_artifact.
 * The locked manifest is injected as a constraint into all Stage 17 archetype generation
 * and selection-flow prompts to prevent brand drift across 14 review sessions.
 *
 * Exports:
 *   extractAndLockTokens(ventureId, supabase) — extract, assemble, persist manifest
 *   getTokenConstraints(ventureId, supabase)  — read locked manifest from DB
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-C
 * @module lib/eva/stage-17/token-manifest
 */

import { writeArtifact } from '../artifact-persistence-service.js';
import { ARTIFACT_TYPES } from '../artifact-types.js';

// ── Default spacing scale (4px base grid) ──────────────────────────────────
const DEFAULT_SPACING = Object.freeze({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });

/**
 * Named error for extraction failures (missing source artifacts).
 */
export class ExtractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractError';
  }
}

/**
 * Named error for persistence failures (DB write errors).
 */
export class PersistError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PersistError';
    this.cause = cause;
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Fetch the most recent is_current artifact of the given type for a venture.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} artifactType
 * @returns {Promise<object|null>} artifact row or null
 */
async function fetchArtifact(supabase, ventureId, artifactType) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`[token-manifest] DB fetch error for ${artifactType}: ${error.message}`);
  return data?.[0] ?? null;
}

/**
 * Extract colors array from identity_naming_visual visualIdentity.colorPalette.
 * Defensive: handles flat string arrays and object arrays with .hex field.
 *
 * @param {object} artifactData
 * @returns {string[]} hex color strings
 */
function extractColors(artifactData) {
  const palette = artifactData?.visualIdentity?.colorPalette;
  if (!Array.isArray(palette) || palette.length === 0) return [];

  return palette
    .map(entry => {
      if (typeof entry === 'string') return entry.trim();
      if (entry?.hex) return entry.hex.trim();
      if (entry?.value) return entry.value.trim();
      return null;
    })
    .filter(Boolean);
}

/**
 * Extract type scale from identity_naming_visual visualIdentity.typography.
 *
 * @param {object} artifactData
 * @returns {{ heading: string, body: string, mono: string }}
 */
function extractTypeScale(artifactData) {
  const typo = artifactData?.visualIdentity?.typography ?? {};
  return {
    heading: typo.heading || typo.display || 'serif',
    body: typo.body || typo.paragraph || 'system-ui, sans-serif',
    mono: typo.mono || typo.code || 'monospace',
  };
}

/**
 * Extract personality keywords from identity_persona_brand brandGenome.
 *
 * @param {object} artifactData
 * @returns {string[]}
 */
function extractPersonality(artifactData) {
  const genome = artifactData?.brandGenome;
  if (!genome) return [];
  const keywords = genome.archetype ?? genome.keywords ?? genome.values ?? [];
  if (typeof keywords === 'string') return [keywords];
  return Array.isArray(keywords) ? keywords : [];
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Extract brand tokens from Stage 11/12 identity artifacts and persist the
 * locked manifest as a blueprint_token_manifest venture_artifact.
 *
 * Token sources:
 *   colors + typeScale → identity_naming_visual (lifecycle_stage 12)
 *   personality        → identity_persona_brand (lifecycle_stage 11)
 *   spacing            → 4px base grid (default; no explicit source in pipeline)
 *
 * @param {string} ventureId
 * @param {object} supabase - Supabase client
 * @returns {Promise<{ artifactId: string, manifest: object }>}
 * @throws {ExtractError} if identity_naming_visual artifact is missing
 * @throws {PersistError} if DB write fails
 */
export async function extractAndLockTokens(ventureId, supabase) {
  // ── 1. Fetch source artifacts ─────────────────────────────────────────────
  const [namingVisual, personaBrand] = await Promise.all([
    fetchArtifact(supabase, ventureId, ARTIFACT_TYPES.IDENTITY_NAMING_VISUAL),
    fetchArtifact(supabase, ventureId, ARTIFACT_TYPES.IDENTITY_PERSONA_BRAND),
  ]);

  if (!namingVisual) {
    throw new ExtractError(
      `[token-manifest] Cannot lock tokens: no identity_naming_visual artifact found for venture ${ventureId}. ` +
      'Stage 12 must complete before Stage 17 token locking.'
    );
  }

  // ── 2. Extract tokens ─────────────────────────────────────────────────────
  const colors = extractColors(namingVisual.artifact_data);
  const typeScale = extractTypeScale(namingVisual.artifact_data);
  const personality = personaBrand ? extractPersonality(personaBrand.artifact_data) : [];

  const manifest = {
    colors,
    typeScale,
    spacing: { ...DEFAULT_SPACING },
    personality,
  };

  // ── 3. Persist as blueprint_token_manifest ────────────────────────────────
  let artifactId;
  try {
    artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: ARTIFACT_TYPES.BLUEPRINT_TOKEN_MANIFEST,
      title: 'Stage 17 Design Token Manifest',
      artifactData: manifest,
      content: `Locked brand tokens for Stage 17 design review. Colors: ${colors.length}, Fonts: heading=${typeScale.heading}/body=${typeScale.body}`,
      qualityScore: 85,
      validationStatus: 'validated',
      source: 'stage-17-token-manifest',
      metadata: {
        schemaVersion: 1,
        extractedAt: new Date().toISOString(),
        sourceArtifactIds: {
          stage12Id: namingVisual.id ?? null,
          stage11Id: personaBrand?.id ?? null,
        },
      },
    });
  } catch (err) {
    throw new PersistError(
      `[token-manifest] Failed to persist token manifest for venture ${ventureId}: ${err.message}`,
      err
    );
  }

  return { artifactId, manifest };
}

/**
 * Read the most recent locked token manifest for a venture.
 * Returns null if no manifest has been locked yet — callers must handle null.
 * Never throws.
 *
 * @param {string} ventureId
 * @param {object|null} supabase - Supabase client (null returns null safely)
 * @returns {Promise<object|null>} { colors, typeScale, spacing, personality } or null
 */
export async function getTokenConstraints(ventureId, supabase) {
  if (!supabase || !ventureId) return null;

  try {
    const artifact = await fetchArtifact(supabase, ventureId, ARTIFACT_TYPES.BLUEPRINT_TOKEN_MANIFEST);
    if (!artifact?.artifact_data) return null;
    return artifact.artifact_data;
  } catch {
    return null;
  }
}
