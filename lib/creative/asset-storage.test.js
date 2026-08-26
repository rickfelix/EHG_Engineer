// SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-3) — private asset storage tests.
import { describe, it, expect, vi } from 'vitest';
import { extractAssetBytes, persistAssetPrivately } from './asset-storage.js';
import { TaskFailedError } from './errors.js';

describe('extractAssetBytes', () => {
  it('fetches bytes from an allowlisted Runway URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await extractAssetBytes({ asset: { url: 'https://cdn.runwayml.com/output/x.png' } }, { fetchImpl });
    expect(result.contentType).toBe('image/png');
    expect(Buffer.compare(result.buffer, Buffer.from([1, 2, 3]))).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.runwayml.com/output/x.png');
  });

  it('refuses to fetch from a non-allowlisted host (SSRF guard)', async () => {
    const fetchImpl = vi.fn();
    await expect(
      extractAssetBytes({ asset: { url: 'https://evil.example.com/x.png' } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'DISALLOWED_ASSET_HOST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws TaskFailedError when the provider asset URL is unparseable', async () => {
    await expect(extractAssetBytes({ asset: { url: 'not-a-url' } })).rejects.toThrow(TaskFailedError);
  });

  it('throws TaskFailedError when the fetch response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      extractAssetBytes({ asset: { url: 'https://runwayml.com/x.png' } }, { fetchImpl })
    ).rejects.toMatchObject({ code: 'ASSET_FETCH_FAILED' });
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
  it('uploads via the private-signed-upload primitive and returns the storage path, never a signed/public URL', async () => {
    const uploadPrivateAndSignFn = vi.fn().mockResolvedValue({ path: 'v1/image-fixed', signedUrl: 'https://signed.example/should-not-be-returned' });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([9]).buffer,
    });
    const path = await persistAssetPrivately(
      { fakeSupabase: true },
      'v1',
      'image',
      { asset: { url: 'https://runwayml.com/x.png' } },
      { fetchImpl, uploadPrivateAndSignFn, pathSuffix: 'fixed' }
    );
    expect(path).toBe('v1/image-fixed');
    expect(uploadPrivateAndSignFn).toHaveBeenCalledWith(
      { fakeSupabase: true },
      expect.objectContaining({ bucket: 'creative-assets-private', path: 'v1/image-fixed', contentType: 'image/png' })
    );
  });
});
