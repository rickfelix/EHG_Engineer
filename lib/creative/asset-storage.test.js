// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-3) — private asset storage tests.
import { describe, it, expect, vi } from 'vitest';
import { extractAssetBytes, persistAssetPrivately } from './asset-storage.js';
import { TaskFailedError } from './errors.js';

const REAL_RUNWAY_HOST = 'https://dnznrvs05pmza.cloudfront.net/output.mp4?_jwt=x';

describe('extractAssetBytes', () => {
  it('fetches bytes from the allowlisted Runway output host (redirect: manual, no redirect followed)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k) => (k === 'content-type' ? 'image/png' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await extractAssetBytes({ asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl });
    expect(result.contentType).toBe('image/png');
    expect(Buffer.compare(result.buffer, Buffer.from([1, 2, 3]))).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(REAL_RUNWAY_HOST, expect.objectContaining({ redirect: 'manual' }));
  });

  it('refuses to fetch from a non-allowlisted host (SSRF guard)', async () => {
    const fetchImpl = vi.fn();
    await expect(
      extractAssetBytes({ asset: { url: 'https://evil.example.com/x.png' } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'DISALLOWED_ASSET_HOST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a subdomain-spoofing host (allowlisted-host-as-suffix-of-attacker-domain trick)', async () => {
    await expect(
      extractAssetBytes({ asset: { url: 'https://dnznrvs05pmza.cloudfront.net.evil.com/x.png' } }, { fetchImpl: vi.fn() })
    ).rejects.toMatchObject({ code: 'DISALLOWED_ASSET_HOST' });
  });

  it('refuses a non-https protocol even on an allowlisted host', async () => {
    await expect(
      extractAssetBytes({ asset: { url: 'http://dnznrvs05pmza.cloudfront.net/x.png' } }, { fetchImpl: vi.fn() })
    ).rejects.toMatchObject({ code: 'DISALLOWED_ASSET_PROTOCOL' });
  });

  it('treats a redirect response as a refusal rather than following it (SSRF via redirect guard)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 302, type: 'opaqueredirect', headers: { get: () => null } });
    await expect(
      extractAssetBytes({ asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'DISALLOWED_ASSET_REDIRECT' });
  });

  it('throws TaskFailedError when the provider asset URL is unparseable', async () => {
    await expect(extractAssetBytes({ asset: { url: 'not-a-url' } })).rejects.toThrow(TaskFailedError);
  });

  it('throws TaskFailedError when the fetch response is not ok (non-redirect failure)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });
    await expect(
      extractAssetBytes({ asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'ASSET_FETCH_FAILED' });
  });

  it('refuses a non-media content-type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: (k) => (k === 'content-type' ? 'text/html' : null) },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    await expect(
      extractAssetBytes({ asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'DISALLOWED_CONTENT_TYPE' });
  });

  it('refuses an asset over the size cap via content-length', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: (k) => ({ 'content-type': 'image/png', 'content-length': String(300 * 1024 * 1024) }[k] || null) },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    await expect(
      extractAssetBytes({ asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'ASSET_TOO_LARGE' });
  });

  it('extracts inline base64 bytes from a Gemini generateContent response', async () => {
    const base64 = Buffer.from('hello').toString('base64');
    const generationResult = {
      asset: { raw: { candidates: [{ content: { parts: [{ inlineData: { data: base64, mimeType: 'image/jpeg' } }] } }] } },
    };
    const result = await extractAssetBytes(generationResult);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.toString()).toBe('hello');
  });

  it('throws TaskFailedError when a Gemini response has no inline data', async () => {
    const generationResult = { asset: { raw: { candidates: [{ content: { parts: [{ text: 'no image here' }] } }] } } };
    await expect(extractAssetBytes(generationResult)).rejects.toMatchObject({ code: 'NO_INLINE_DATA' });
  });

  it('throws TaskFailedError for an unrecognized asset shape', async () => {
    await expect(extractAssetBytes({ asset: { kind: 'watermarked-stub' } })).rejects.toMatchObject({ code: 'UNKNOWN_ASSET_SHAPE' });
  });
});

describe('persistAssetPrivately', () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    headers: { get: (k) => (k === 'content-type' ? 'image/png' : null) },
    arrayBuffer: async () => new Uint8Array([9]).buffer,
  });
  const passthroughGetBucketFn = vi.fn().mockResolvedValue({ data: { public: false }, error: null });

  it('uploads via the private-signed-upload primitive and returns the storage path, never a signed/public URL', async () => {
    const uploadPrivateAndSignFn = vi.fn().mockResolvedValue({ path: 'v1/image-fixed', signedUrl: 'https://signed.example/should-not-be-returned' });
    const path = await persistAssetPrivately(
      { fakeSupabase: true },
      'v1',
      'image',
      { asset: { url: REAL_RUNWAY_HOST } },
      { fetchImpl, uploadPrivateAndSignFn, pathSuffix: 'fixed', getBucketFn: passthroughGetBucketFn }
    );
    expect(path).toBe('v1/image-fixed');
    expect(uploadPrivateAndSignFn).toHaveBeenCalledWith(
      { fakeSupabase: true },
      expect.objectContaining({ bucket: 'creative-assets-private', path: 'v1/image-fixed', contentType: 'image/png' })
    );
  });

  it('throws STORAGE_PATH_MISSING when the upload primitive returns no path', async () => {
    const uploadPrivateAndSignFn = vi.fn().mockResolvedValue({});
    await expect(
      persistAssetPrivately({}, 'v1', 'image', { asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl, uploadPrivateAndSignFn, getBucketFn: passthroughGetBucketFn })
    ).rejects.toMatchObject({ code: 'STORAGE_PATH_MISSING' });
  });

  it('throws BUCKET_NOT_PRIVATE when the bucket already exists and is public (SEC-06 defense-in-depth)', async () => {
    const uploadPrivateAndSignFn = vi.fn().mockResolvedValue({ path: 'v1/image-x' });
    const getBucketFn = vi.fn().mockResolvedValue({ data: { public: true }, error: null });
    await expect(
      persistAssetPrivately({}, 'v1', 'image', { asset: { url: REAL_RUNWAY_HOST } }, { fetchImpl, uploadPrivateAndSignFn, getBucketFn })
    ).rejects.toMatchObject({ code: 'BUCKET_NOT_PRIVATE' });
  });
});
