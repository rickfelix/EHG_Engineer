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
const MAX_ASSET_BYTES = 200 * 1024 * 1024; // 200MB — generous for video, bounds a hostile/oversized response

// Runway's actual output host, confirmed against Runway's own docs
// (https://docs.dev.runwayml.com/assets/outputs/): task.output[] entries are ephemeral
// CloudFront URLs (e.g. https://dnznrvs05pmza.cloudfront.net/...), NOT api(.dev).runwayml.com or
// any *.runwayml.com host. Pinned to the exact distribution rather than a `*.cloudfront.net`
// wildcard — that wildcard would admit every CloudFront distribution on the internet, which is
// the opposite of an allowlist. If Runway rotates distributions this will need updating; that is
// the correct failure mode (fail closed, not silently permissive).
const ALLOWED_ASSET_HOSTS = Object.freeze(['dnznrvs05pmza.cloudfront.net']);
const ALLOWED_ASSET_CONTENT_TYPE_PREFIXES = Object.freeze(['image/', 'video/']);

function assertAllowedAssetUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TaskFailedError('asset-storage: provider returned an unparseable asset URL', { code: 'INVALID_ASSET_URL' });
  }
  if (parsed.protocol !== 'https:') {
    throw new TaskFailedError(`asset-storage: refusing a non-https asset URL (${parsed.protocol})`, { code: 'DISALLOWED_ASSET_PROTOCOL' });
  }
  const allowed = ALLOWED_ASSET_HOSTS.some((host) => parsed.hostname === host);
  if (!allowed) {
    throw new TaskFailedError(`asset-storage: refusing to fetch asset from disallowed host "${parsed.hostname}"`, { code: 'DISALLOWED_ASSET_HOST' });
  }
  return parsed;
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
    assertAllowedAssetUrl(asset.url);
    // redirect: 'manual' — the allowlist check above is worthless if a redirect can silently
    // hop it to an arbitrary origin afterward. A redirect response is treated as a failure
    // rather than transparently followed and re-validated, so this never needs to trust a
    // second host.
    const response = await fetchImpl(asset.url, { redirect: 'manual' });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new TaskFailedError('asset-storage: refusing a redirect from the provider asset host', { code: 'DISALLOWED_ASSET_REDIRECT' });
    }
    if (!response.ok) {
      throw new TaskFailedError(`asset-storage: failed to fetch provider asset (${response.status})`, { code: 'ASSET_FETCH_FAILED' });
    }
    const contentType = response.headers?.get?.('content-type') || 'application/octet-stream';
    if (!ALLOWED_ASSET_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix))) {
      throw new TaskFailedError(`asset-storage: refusing non-media content-type "${contentType}"`, { code: 'DISALLOWED_CONTENT_TYPE' });
    }
    const contentLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_ASSET_BYTES) {
      throw new TaskFailedError(`asset-storage: provider asset exceeds the size cap (${contentLength} bytes)`, { code: 'ASSET_TOO_LARGE' });
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_ASSET_BYTES) {
      throw new TaskFailedError(`asset-storage: provider asset exceeds the size cap (${arrayBuffer.byteLength} bytes)`, { code: 'ASSET_TOO_LARGE' });
    }
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

  if (!storedPath) {
    throw new TaskFailedError('asset-storage: storage upload returned no path — refusing to persist an unfenced asset', { code: 'STORAGE_PATH_MISSING' });
  }

  // Defense-in-depth (SECURITY finding SEC-06): uploadPrivateAndSign tolerates an
  // already-exists error on createBucket without checking the existing bucket is actually
  // private — this account already has other buckets created public (venture-logos,
  // vision-briefs). Confirm this specific bucket is private before trusting the upload,
  // scoped locally rather than editing the shared lib/storage/private-signed-upload.js
  // primitive, which has other, unrelated consumers.
  if (!deps.skipBucketPrivacyCheck) {
    const getBucketFn = deps.getBucketFn || ((client, bucket) => client.storage.getBucket(bucket));
    const { data: bucketInfo, error: bucketErr } = await getBucketFn(supabase, BUCKET);
    if (bucketErr) throw bucketErr;
    if (bucketInfo?.public) {
      throw new TaskFailedError(`asset-storage: bucket "${BUCKET}" is public — refusing to trust an upload that just occurred against it`, { code: 'BUCKET_NOT_PRIVATE' });
    }
  }

  return storedPath;
}
