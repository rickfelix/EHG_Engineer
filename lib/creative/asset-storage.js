// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-3) — persists a generated asset's bytes to
// PRIVATE storage (never a public bucket/URL) and returns the storage path recorded on the
// creative_assets row. Uses lib/storage/private-signed-upload.js (public:false + createSignedUrl)
// as its storage primitive per the VALIDATION/SECURITY correction: a prior SD's PRD already
// mis-cited lib/eva/logo-image-generator.js / lib/eva/stage-handlers/s11.js as private-bucket
// precedent when both are PUBLIC-bucket examples — this module never calls getPublicUrl and
// never creates a bucket with public:true.

import { uploadPrivateAndSign } from '../storage/private-signed-upload.js';
import { TaskFailedError } from './errors.js';

const BUCKET = 'creative-assets-private';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300; // short-lived; the signed URL itself is never persisted

// Runway's provider-hosted asset URL (lib/creative/providers/runway.js) is external-response-body
// content — a server-side fetch of it is host-allowlisted rather than blind, closing the SSRF gap
// a naive re-host implementation would otherwise open.
const ALLOWED_ASSET_HOSTS = Object.freeze(['runwayml.com', 'runway.team']);

function assertAllowedHost(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TaskFailedError('asset-storage: provider returned an unparseable asset URL', { code: 'INVALID_ASSET_URL' });
  }
  const allowed = ALLOWED_ASSET_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  if (!allowed) {
    throw new TaskFailedError(`asset-storage: refusing to fetch asset from disallowed host "${parsed.hostname}"`, { code: 'DISALLOWED_ASSET_HOST' });
  }
}

/**
 * Extracts raw bytes + a content type from a generateAsset() result, regardless of which
 * provider produced it (Runway returns a URL; Gemini returns inline base64 bytes).
 * @param {{asset: object}} generationResult
 * @param {{fetchImpl?: typeof fetch}} [deps]
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function extractAssetBytes(generationResult, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const asset = generationResult?.asset;

  if (asset?.url) {
    assertAllowedHost(asset.url);
    const response = await fetchImpl(asset.url);
    if (!response.ok) {
      throw new TaskFailedError(`asset-storage: failed to fetch provider asset (${response.status})`, { code: 'ASSET_FETCH_FAILED' });
    }
    const contentType = response.headers?.get?.('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  const parts = asset?.raw?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const inlinePart = parts.find((p) => p?.inlineData?.data);
    if (!inlinePart) {
      throw new TaskFailedError('asset-storage: Gemini response has no inline image data', { code: 'NO_INLINE_DATA' });
    }
    return { buffer: Buffer.from(inlinePart.inlineData.data, 'base64'), contentType: inlinePart.inlineData.mimeType || 'image/png' };
  }

  throw new TaskFailedError('asset-storage: unrecognized asset shape — no url or inline data found', { code: 'UNKNOWN_ASSET_SHAPE' });
}

/**
 * Uploads a generated asset's bytes to private storage and returns the storage PATH — never a
 * signed or public URL — for durable persistence on the creative_assets row.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {'image'|'video'} capability
 * @param {{asset: object}} generationResult
 * @param {{fetchImpl?: typeof fetch, uploadPrivateAndSignFn?: typeof uploadPrivateAndSign, pathSuffix?: string}} [deps]
 * @returns {Promise<string>} the storage path
 */
export async function persistAssetPrivately(supabase, ventureId, capability, generationResult, deps = {}) {
  const { buffer, contentType } = await extractAssetBytes(generationResult, deps);
  const uploadFn = deps.uploadPrivateAndSignFn || uploadPrivateAndSign;
  const suffix = deps.pathSuffix || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `${ventureId}/${capability}-${suffix}`;

  const { path: storedPath } = await uploadFn(supabase, {
    bucket: BUCKET,
    path,
    buffer,
    contentType,
    expiresInSeconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
  });
  return storedPath;
}
